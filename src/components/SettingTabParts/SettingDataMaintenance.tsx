import React, { FC, useState } from 'react';
import { Database, Trash2, Calendar, FolderOutput, Sparkles, Hash, Layers, CheckCheck } from "lucide-react";
import { clearAllIDB } from "../../lib/idb";
import { clearDexieDatabase } from "../../lib/localDb";
import { useAppStore } from "../../store/useAppStore";
import { syncAllProjectsTaskCountsToFirestore } from "../../lib/projectDatesService";
import { convertAllSubtaskCodesAndPredecessorsToHash } from "../../lib/ganttUtils";
import { scanAndRemoveDuplicateTasksOnFirestore, deduplicateTasksInMemory } from "../../lib/taskDeduplicationService";
import { 
  purgeDeletedTombstones, 
  standardizeFiscalYears, 
  repairMissingTaskYears, 
  archiveHistoricalData 
} from "./maintenanceHelpers";
import { Project, Task } from "../../types";
import { doc, collection, getDocs } from 'firebase/firestore';
import { writeBatch } from '../../lib/firestoreWrites';
import { db, APP_ID } from "../../lib/firebase";
import { SummaryAuditPanel } from "./SummaryAuditPanel";

interface SettingDataMaintenanceProps {
  isAdmin: boolean;
  onConfirmAction: (title: string, message: string, onConfirm: () => Promise<void>) => void;
}

export const SettingDataMaintenance: React.FC<SettingDataMaintenanceProps> = ({
  isAdmin,
  onConfirmAction,
}) => {
  const [isPurging, setIsPurging] = useState(false);
  const [isFixingMissingYears, setIsFixingMissingYears] = useState(false);
  const [isStandardizingYears, setIsStandardizingYears] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isPruningDelegations, setIsPruningDelegations] = useState(false);
  const [isSyncingTaskCounts, setIsSyncingTaskCounts] = useState(false);
  const [isConvertingToHash, setIsConvertingToHash] = useState(false);
  const [isDeduplicating, setIsDeduplicating] = useState(false);

  const handleClearLocalCache = async () => {
    if (window.confirm("Do you want to clear all local IndexedDB cache, delta markers, and resync fresh data from server?")) {
      try {
        // 1. Wipe Dexie IndexedDB tables
        await clearDexieDatabase();
        // 2. Wipe legacy IDB store
        await clearAllIDB();
        
        // 3. Clear LocalStorage sync timestamps & fingerprint caches
        const keysToRemove = [
          "taka_last_delta_sync_time_v1",
          "taka_years_meta_fingerprint_v1",
          "taka_expanded_projects",
        ];
        if (typeof localStorage !== "undefined") {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k.startsWith("taka_year_data_v1_") || k.startsWith("taka_read_notifs_"))) {
              keysToRemove.push(k);
            }
          }
          keysToRemove.forEach((k) => localStorage.removeItem(k));
        }
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.clear();
        }

        useAppStore.getState().setToast({ title: "Cache Cleared", message: "Local cache cleared completely. Reloading app...", type: "success" });
        setTimeout(() => window.location.reload(), 400);
      } catch (e) {
        console.error("Failed to clear cache:", e);
        window.location.reload();
      }
    }
  };

  const handleDeduplicateTasks = () => {
    if (!isAdmin) return;
    onConfirmAction(
      "Quét & Hợp nhất Task con trùng lặp",
      "Hệ thống sẽ quét toàn bộ task trên Firestore và bộ nhớ, tự động phát hiện các task con bị trùng tên trong cùng một dự án, giữ lại bản ghi đầy đủ/mới nhất và xóa các bản ghi dư thừa. Bạn có muốn tiếp tục?",
      async () => {
        setIsDeduplicating(true);
        useAppStore.getState().setToast({
          title: "Đang quét...",
          message: "Đang phân tích và xử lý các task con trùng lặp trên Firestore...",
          type: "info"
        });
        try {
          const projects = useAppStore.getState().projects;
          const currentTasks = useAppStore.getState().tasks;
          const { dedupedTasks } = deduplicateTasksInMemory(currentTasks, projects);
          useAppStore.getState().setTasks(dedupedTasks);

          const result = await scanAndRemoveDuplicateTasksOnFirestore(projects);
          if (result.removedCount > 0) {
            useAppStore.getState().setToast({
              title: "Dọn dẹp thành công",
              message: `Đã phát hiện và xóa ${result.removedCount} task con trùng lặp trên Firestore!`,
              type: "success"
            });
          } else {
            useAppStore.getState().setToast({
              title: "Dữ liệu chuẩn",
              message: "Không phát hiện task con nào bị trùng lặp trên hệ thống.",
              type: "info"
            });
          }
        } catch (e: any) {
          console.error("Deduplicate tasks error:", e);
          useAppStore.getState().setToast({
            title: "Lỗi dọn dẹp",
            message: e?.message || "Có lỗi xảy ra khi xử lý task trùng lặp.",
            type: "error"
          });
        } finally {
          setIsDeduplicating(false);
        }
      }
    );
  };

  const handlePurgeOldTombstones = () => {
    if (!isAdmin) return;
    onConfirmAction(
      "Purge Deleted Tombstones (> 60 days)",
      "This will permanently remove soft-deleted records older than 60 days from Firestore (projects, tasks, costs). Continue?",
      async () => {
        setIsPurging(true);
        try {
          const deletedCount = await purgeDeletedTombstones();
          useAppStore.getState().setToast({ title: "Cleanup Complete", message: `Permanently purged ${deletedCount} obsolete tombstone record(s).` });
        } catch (e) {
          console.error("Purge error:", e);
          useAppStore.getState().setToast({ title: "Error", message: "Failed to purge tombstones. Check permissions." });
        } finally {
          setIsPurging(false);
        }
      }
    );
  };

  const handleStandardizeYears = () => {
    if (!isAdmin) return;
    onConfirmAction(
      "Standardize Fiscal Year Format",
      "The system will scan all Projects, Tasks, Costs, and Delegations to convert string year values ('2026', '2027') to uniform number format (2026, 2027). Do you want to proceed?",
      async () => {
        setIsStandardizingYears(true);
        try {
          const totalUpdated = await standardizeFiscalYears();
          useAppStore.getState().setToast({
            title: "Standardization Completed",
            message: `Successfully standardized ${totalUpdated} records to number format.`,
            type: "success"
          });
        } catch (e) {
          console.error("Standardize years error:", e);
          useAppStore.getState().setToast({
            title: "Error",
            message: "Failed to standardize fiscal year values.",
            type: "error"
          });
        } finally {
          setIsStandardizingYears(false);
        }
      }
    );
  };

  const handleFixMissingTaskYears = () => {
    if (!isAdmin) return;
    onConfirmAction(
      "Repair Missing Project Years",
      "The system will scan Tasks, Costs, and Delegations with empty projectYear values and backfill the year from their matching parent Projects. Do you want to proceed?",
      async () => {
        setIsFixingMissingYears(true);
        try {
          const totalUpdated = await repairMissingTaskYears();
          useAppStore.getState().setToast({
            title: "Repair Completed",
            message: `Successfully backfilled projectYear for ${totalUpdated} records.`,
            type: "success"
          });
        } catch (error: any) {
          console.error("Error fixing missing years", error);
          useAppStore.getState().setToast({ title: "Error", message: error?.message || "An error occurred", type: "error" });
        } finally {
          setIsFixingMissingYears(false);
        }
      }
    );
  };

  const handleArchiveData = () => {
    if (!isAdmin) return;
    onConfirmAction(
      "Archive Cold Storage (2024, 2025)",
      "The system will extract all Projects, Tasks, Costs, and Delegations from archived years (2024, 2025) and upload a compressed JSON bundle to Firebase Storage. This optimizes Firestore reads when selecting 'All Years'. Do you want to proceed?",
      async () => {
        setIsArchiving(true);
        useAppStore.getState().setToast({ title: "Archiving...", message: "Generating archive bundle for historical years. Please wait...", type: "info" });
        try {
          const count = await archiveHistoricalData();
          useAppStore.getState().setToast({
            title: "Archived Successfully",
            message: `Created archive containing ${count} records.`,
            type: "success"
          });
        } catch (e) {
          console.error("Archive error:", e);
          useAppStore.getState().setToast({ title: "Error", message: "Failed to create archive data.", type: "error" });
        } finally {
          setIsArchiving(false);
        }
      }
    );
  };

  const handleSyncAllTaskCounts = () => {
    if (!isAdmin) return;
    onConfirmAction(
      "Sync Project Task Counts",
      "The system will scan all Projects and Tasks on Firestore to recalculate accurate task counts, progress, and actual dates, then write them directly to each Project document. Do you want to proceed?",
      async () => {
        setIsSyncingTaskCounts(true);
        useAppStore.getState().setToast({
          title: "Syncing...",
          message: "Aggregating and synchronizing task counts across all projects on Firestore...",
          type: "info"
        });
        try {
          const result = await syncAllProjectsTaskCountsToFirestore((processed, total) => {
            console.log(`[TaskCountSync] Processed ${processed}/${total} projects`);
          });
          useAppStore.getState().setToast({
            title: "Sync Complete",
            message: `Successfully updated task counts for ${result.updatedCount}/${result.totalProjects} projects on Firestore.`,
            type: "success"
          });
        } catch (error: any) {
          console.error("Error syncing task counts:", error);
          useAppStore.getState().setToast({
            title: "Sync Failed",
            message: error?.message || "Failed to sync task counts",
            type: "error"
          });
        } finally {
          setIsSyncingTaskCounts(false);
        }
      }
    );
  };

  const handleConvertToHashFormat = () => {
    if (!isAdmin) return;
    onConfirmAction(
      "Quét & Chuyển đổi '-' thành '#' (Subtask Code & Predecessor)",
      "Hệ thống sẽ quét toàn bộ dữ liệu công việc trong ứng dụng và chuyển đổi tất cả mã phụ (Subtask Code) và liên kết Predecessor từ dấu '-' sang '#' (Ví dụ: B2-B208-1 ➜ B2-B208#1, CP-01-2 ➜ CP-01#2). Bạn có muốn tiếp tục?",
      async () => {
        setIsConvertingToHash(true);
        try {
          const [projSnap, taskSnap] = await Promise.all([
            getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects')),
            getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks'))
          ]);

          const allProjects: Project[] = projSnap.docs.map(d => ({ id: d.id, ...d.data() } as Project));
          const allTasks: Task[] = taskSnap.docs.map(d => ({ id: d.id, ...d.data() } as Task));

          const result = convertAllSubtaskCodesAndPredecessorsToHash(allTasks, allProjects);

          if (result.changedCount > 0) {
            const CHUNK_SIZE = 400;
            for (let i = 0; i < result.updatesToSave.length; i += CHUNK_SIZE) {
              const chunk = result.updatesToSave.slice(i, i + CHUNK_SIZE);
              const batch = writeBatch(db);
              chunk.forEach(u => {
                const tRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', u.id);
                const updatePayload: any = { updatedAt: u.updatedAt };
                if (u.predecessor !== undefined) updatePayload.predecessor = u.predecessor;
                if (u.taskCodePhu !== undefined) updatePayload.taskCodePhu = u.taskCodePhu;
                batch.set(tRef, updatePayload, { merge: true });
              });
              await batch.commit();
            }

            useAppStore.getState().setTasks(result.updatedTasks);
            useAppStore.getState().setToast({
              title: "Chuyển đổi thành công",
              message: `Đã quét và chuyển đổi thành công ${result.changedCount} công việc sang định dạng '#' (Subtask Code & Predecessor)!`,
              type: "success"
            });
          } else {
            useAppStore.getState().setToast({
              title: "Hoàn tất kiểm tra",
              message: "Tất cả các mã Subtask Code và Predecessor đã ở định dạng '#' chuẩn.",
              type: "info"
            });
          }
        } catch (e: any) {
          console.error("Convert to hash error:", e);
          useAppStore.getState().setToast({
            title: "Lỗi chuyển đổi",
            message: e?.message || "Có lỗi xảy ra khi chuyển đổi sang định dạng '#'.",
            type: "error"
          });
        } finally {
          setIsConvertingToHash(false);
        }
      }
    );
  };

  const handlePruneEmptyDelegationsAction = () => {
    if (!isAdmin) return;
    onConfirmAction(
      "Scan & Prune Empty Delegations",
      "The system will scan taka_delegation_groups on Firestore to detect auto-generated import placeholders with 0 subtasks, 0 comments, and 0 attachments, then safely delete them from Firestore and local cache to cut read usage by ~95%. Genuine delegations will be 100% preserved. Do you want to proceed?",
      async () => {
        setIsPruningDelegations(true);
        useAppStore.getState().setToast({
          title: "Scanning...",
          message: "Analyzing delegation records on Firestore...",
          type: "info"
        });
        try {
          const { scanEmptyDelegations, pruneEmptyDelegations } = await import("../../lib/delegationMaintenanceService");
          const scanResult = await scanEmptyDelegations();
          if (scanResult.emptyCount === 0) {
            useAppStore.getState().setToast({
              title: "Delegations Clean",
              message: `Scanned ${scanResult.totalScanned} groups. All ${scanResult.genuineCount} records are active and genuine!`,
              type: "info"
            });
            return;
          }

          const pruneResult = await pruneEmptyDelegations(scanResult.emptyGroups.map(g => g.id));
          useAppStore.getState().setToast({
            title: "Pruning Complete",
            message: `Safely deleted ${pruneResult.deletedCount} empty placeholder delegations. Preserved ${scanResult.genuineCount} active groups!`,
            type: "success"
          });
        } catch (e: any) {
          console.error("Prune delegations error:", e);
          useAppStore.getState().setToast({
            title: "Pruning Failed",
            message: e?.message || "Failed to prune empty delegations",
            type: "error"
          });
        } finally {
          setIsPruningDelegations(false);
        }
      }
    );
  };

  return (
    <div className="px-5 py-3 bg-slate-50 dark:bg-[#1a1a1c] border-b border-slate-200 dark:border-[#444446] flex flex-wrap items-center gap-3 animate-in fade-in duration-150">
      <button
        onClick={handleClearLocalCache}
        title="Clear Local Cache & Resync"
        className="px-5 py-2.5 rounded-lg border border-slate-200 dark:border-[#444446] bg-white dark:bg-[#1e1e20] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 transition-colors flex items-center gap-3 font-medium text-slate-700 dark:text-[#c3c3c3] shadow-sm text-sm"
      >
        <Database className="w-4 h-4 text-amber-500" />
        Clear & Resync Cache
      </button>

      <button
        onClick={handleDeduplicateTasks}
        disabled={isDeduplicating}
        title="Quét và xóa các task con bị trùng tên trong cùng một dự án"
        className="px-5 py-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-white dark:bg-[#1e1e20] hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors flex items-center gap-3 font-medium text-emerald-700 dark:text-emerald-400 shadow-sm text-sm disabled:opacity-50 cursor-pointer"
      >
        <CheckCheck className="w-4 h-4 text-emerald-500" />
        {isDeduplicating ? "Đang xử lý..." : "Deduplicate Tasks"}
      </button>

      <button
        onClick={handlePruneEmptyDelegationsAction}
        disabled={isPruningDelegations}
        title="Scan and delete empty/unused auto-imported delegation placeholders to save Firestore reads"
        className="px-5 py-2.5 rounded-lg border border-purple-200 dark:border-purple-900/40 bg-white dark:bg-[#1e1e20] hover:bg-purple-50 dark:hover:bg-purple-950/20 transition-colors flex items-center gap-3 font-medium text-purple-700 dark:text-purple-400 shadow-sm text-sm disabled:opacity-50 cursor-pointer"
      >
        <Layers className="w-4 h-4 text-purple-500" />
        {isPruningDelegations ? "Pruning..." : "Prune Empty Delegations"}
      </button>

      <button
        onClick={handlePurgeOldTombstones}
        disabled={isPurging}
        title="Purge soft-deleted records older than 60 days from Firestore"
        className="px-5 py-2.5 rounded-lg border border-red-200 dark:border-red-900/40 bg-white dark:bg-[#1e1e20] hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors flex items-center gap-3 font-medium text-red-600 dark:text-red-400 shadow-sm text-sm disabled:opacity-50"
      >
        <Trash2 className="w-4 h-4 text-red-500" />
        {isPurging ? "Purging..." : "Purge Tombstones (>60d)"}
      </button>

      <button
        onClick={handleStandardizeYears}
        disabled={isStandardizingYears}
        title="Convert all fiscal year fields (year, projectYear) to standard number format"
        className="px-5 py-2.5 rounded-lg border border-indigo-200 dark:border-indigo-900/40 bg-white dark:bg-[#1e1e20] hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-colors flex items-center gap-3 font-medium text-indigo-700 dark:text-indigo-400 shadow-sm text-sm disabled:opacity-50"
      >
        <Calendar className="w-4 h-4 text-indigo-500" />
        {isStandardizingYears ? "Standardizing..." : "Standardize Years (Num)"}
      </button>

      <button
        onClick={handleFixMissingTaskYears}
        disabled={isFixingMissingYears}
        title="Scan tasks and costs with empty years and backfill from parent projects"
        className="px-5 py-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-white dark:bg-[#1e1e20] hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors flex items-center gap-3 font-medium text-emerald-700 dark:text-emerald-400 shadow-sm text-sm disabled:opacity-50"
      >
        <Calendar className="w-4 h-4 text-emerald-500" />
        {isFixingMissingYears ? "Repairing..." : "Repair Missing Years"}
      </button>

      <button
        onClick={handleArchiveData}
        disabled={isArchiving}
        title="Compress and archive historical years (2024, 2025) to Firebase Storage"
        className="px-5 py-2.5 rounded-lg border border-blue-200 dark:border-blue-900/40 bg-white dark:bg-[#1e1e20] hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors flex items-center gap-3 font-medium text-blue-700 dark:text-blue-400 shadow-sm text-sm disabled:opacity-50"
      >
        <FolderOutput className="w-4 h-4 text-blue-500" />
        {isArchiving ? "Archiving..." : "Archive Historical Data"}
      </button>

      <button
        onClick={handleSyncAllTaskCounts}
        disabled={isSyncingTaskCounts}
        title="Recalculate task counts, progress, and actual dates directly onto Project documents"
        className="px-5 py-2.5 rounded-lg border border-teal-200 dark:border-teal-900/40 bg-white dark:bg-[#1e1e20] hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-colors flex items-center gap-3 font-medium text-teal-700 dark:text-teal-400 shadow-sm text-sm disabled:opacity-50"
      >
        <Sparkles className="w-4 h-4 text-teal-500" />
        {isSyncingTaskCounts ? "Syncing..." : "Sync Project Task Counts"}
      </button>

      <button
        onClick={handleConvertToHashFormat}
        disabled={isConvertingToHash}
        title="Convert '-' to '#' separator in subtask codes and predecessor references"
        className="px-5 py-2.5 rounded-lg border border-cyan-200 dark:border-cyan-900/40 bg-white dark:bg-[#1e1e20] hover:bg-cyan-50 dark:hover:bg-cyan-950/20 transition-colors flex items-center gap-3 font-medium text-cyan-700 dark:text-cyan-400 shadow-sm text-sm disabled:opacity-50 cursor-pointer"
      >
        <Hash className="w-4 h-4 text-cyan-500" />
        {isConvertingToHash ? "Converting..." : "Standardize Subtask Codes (#)"}
      </button>

      <SummaryAuditPanel isAdmin={isAdmin} onConfirmAction={onConfirmAction} />
    </div>
  );
};
