import React, { useState } from "react";
import { Database, Trash2, Calendar, FolderOutput, Sparkles, Hash } from "lucide-react";
import { clearAllIDB } from "../../lib/idb";
import { useAppStore } from "../../store/useAppStore";
import { doc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db, APP_ID } from "../../lib/firebase";
import { deleteStorageFiles, extractStorageUrls } from "../../lib/storageUtils";
import { syncAllProjectsTaskCountsToFirestore } from "../../lib/projectDatesService";
import { convertAllSubtaskCodesAndPredecessorsToHash } from "../../lib/ganttUtils";
import { Project, Task } from "../../types";

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
  const [isDeduplicatingDelegations, setIsDeduplicatingDelegations] = useState(false);
  const [isSyncingTaskCounts, setIsSyncingTaskCounts] = useState(false);
  const [isScanningOrphans, setIsScanningOrphans] = useState(false);
  const [isConvertingToHash, setIsConvertingToHash] = useState(false);

  const handleClearLocalCache = async () => {
    if (window.confirm("Do you want to clear all local IndexedDB cache and resync fresh data from server?")) {
      try {
        localStorage.removeItem("taka_expanded_projects");
        await clearAllIDB();
        useAppStore.getState().setToast({ title: "Success", message: "Local cache cleared. Reloading app..." });
        setTimeout(() => window.location.reload(), 600);
      } catch (e) {
        console.error(e);
        window.location.reload();
      }
    }
  };

  const handlePurgeOldTombstones = () => {
    if (!isAdmin) return;
    onConfirmAction(
      "Purge Deleted Tombstones (> 60 days)",
      "This will permanently remove soft-deleted records older than 60 days from Firestore (projects, tasks, costs). Continue?",
      async () => {
        setIsPurging(true);
        try {
          const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
          let deletedCount = 0;
          const collections = ["taka_projects", "taka_tasks", "taka_costs"];

          for (const colName of collections) {
            const q = query(
              collection(db, "artifacts", APP_ID, "public", "data", colName),
              where("isDeleted", "==", true),
              where("updatedAt", "<", sixtyDaysAgo)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
              const batch = writeBatch(db);
              snap.docs.forEach(d => {
                batch.delete(d.ref);
                deletedCount++;
              });
              await batch.commit();
            }
          }

          useAppStore.getState().setToast({
            title: "Cleanup Complete",
            message: `Permanently purged ${deletedCount} obsolete tombstone record(s).`
          });
        } catch (e) {
          console.error("Purge error:", e);
          useAppStore.getState().setToast({
            title: "Error",
            message: "Failed to purge tombstones. Check permissions or composite indexes."
          });
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
          let totalUpdated = 0;
          const collectionsConfig = [
            { name: "taka_projects", field: "year" },
            { name: "taka_tasks", field: "projectYear" },
            { name: "taka_costs", field: "projectYear" },
            { name: "taka_delegation_groups", field: "projectYear" }
          ];

          for (const item of collectionsConfig) {
            const colRef = collection(db, "artifacts", APP_ID, "public", "data", item.name);
            const snap = await getDocs(colRef);
            let batch = writeBatch(db);
            let count = 0;

            for (const d of snap.docs) {
              const data = d.data();
              const rawYear = data[item.field];
              if (typeof rawYear === "string") {
                const numYear = Number(rawYear.trim());
                if (!isNaN(numYear) && numYear > 2000 && numYear < 2100) {
                  batch.update(doc(db, "artifacts", APP_ID, "public", "data", item.name, d.id), {
                    [item.field]: numYear
                  });
                  count++;
                  totalUpdated++;
                  if (count >= 400) {
                    await batch.commit();
                    batch = writeBatch(db);
                    count = 0;
                  }
                }
              }
            }
            if (count > 0) {
              await batch.commit();
            }
          }

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
          const projRef = collection(db, "artifacts", APP_ID, "public", "data", "taka_projects");
          const projSnap = await getDocs(projRef);
          const projectYearMap = new Map<string, number>();
          projSnap.docs.forEach(docSnap => {
            const data = docSnap.data();
            if (data.code && data.year && typeof data.year === 'number') {
              projectYearMap.set(data.code, data.year);
            }
          });

          let totalUpdated = 0;
          const collectionsConfig = [
            { name: "taka_tasks", field: "projectYear" },
            { name: "taka_costs", field: "projectYear" },
            { name: "taka_delegation_groups", field: "projectYear" }
          ];

          for (const item of collectionsConfig) {
            const colRef = collection(db, "artifacts", APP_ID, "public", "data", item.name);
            const snap = await getDocs(colRef);
            let batch = writeBatch(db);
            let count = 0;

            for (const d of snap.docs) {
              const data = d.data();
              const rawYear = data[item.field];
              if (rawYear === undefined || rawYear === null || rawYear === '' || isNaN(Number(rawYear))) {
                const code = data.projectCode || data.code;
                if (code && projectYearMap.has(code)) {
                  const correctYear = projectYearMap.get(code);
                  batch.update(doc(db, "artifacts", APP_ID, "public", "data", item.name, d.id), {
                    [item.field]: correctYear
                  });
                  count++;
                  totalUpdated++;
                  if (count >= 400) {
                    await batch.commit();
                    batch = writeBatch(db);
                    count = 0;
                  }
                }
              }
            }
            if (count > 0) {
              await batch.commit();
            }
          }

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
          const { ARCHIVED_YEARS } = await import("../../lib/utils");
          const collectionsToArchive = [
            "taka_projects",
            "taka_tasks",
            "taka_costs",
            "taka_delegation_groups"
          ];
          const archiveData: Record<string, any[]> = {};

          for (const colName of collectionsToArchive) {
            archiveData[colName] = [];
            for (const year of ARCHIVED_YEARS) {
              const yearField = (colName === "taka_projects" || colName === "taka_delegation_groups") ? (colName === "taka_projects" ? "year" : "projectYear") : "projectYear";
              const q = query(
                collection(db, "artifacts", APP_ID, "public", "data", colName),
                where(yearField, "in", [String(year), Number(year)])
              );
              const snap = await getDocs(q);
              snap.forEach(docSnap => {
                archiveData[colName].push({ id: docSnap.id, ...docSnap.data() });
              });
            }
          }

          const { ref, uploadString } = await import("firebase/storage");
          const { storage } = await import("../../lib/firebase");

          const archiveRef = ref(storage, "archives/taka_archive.json");
          await uploadString(archiveRef, JSON.stringify(archiveData), "raw", {
            contentType: "application/json"
          });

          useAppStore.getState().setToast({
            title: "Archived Successfully",
            message: `Created archive containing ${Object.values(archiveData).reduce((acc: number, arr: any) => acc + arr.length, 0)} records.`,
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
    </div>
  );
};
