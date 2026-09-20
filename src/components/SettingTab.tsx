import { useEnrichedData } from '../hooks/useEnrichedData';
import { useState } from "react";
import { useLanguage } from "../lib/LanguageContext";
import { Plus, Trash2, Smartphone, RefreshCw, Bell, Database, Sparkles, Activity, ChevronDown, ChevronUp, Calendar, FolderOutput, Monitor } from "lucide-react";
import { NotificationRule, AppUser } from "../types";
import { cn, generateId } from "../lib/utils";
import { doc, collection, query, where, getDocs } from 'firebase/firestore';
import {    db, APP_ID , writeBatch , setDoc , deleteDoc } from "../lib/firebase";
import { ConfirmModal } from "./ConfirmModal";
import { requestNotificationPermission } from "../lib/notifications";
import { useAppStore } from "../store/useAppStore";
import { deleteStorageFiles, extractStorageUrls } from "../lib/storageUtils";
import { clearAllIDB } from "../lib/idb";
import { FirestorePerformanceDashboard } from "./FirestorePerformanceDashboard";
import { DesktopOptimizationModal } from "./DesktopOptimizationModal";
import { syncAllProjectsTaskCountsToFirestore } from "../lib/projectDatesService";
import { bumpConfigVersion } from "../lib/configCacheService";

interface SettingTabProps {
  rules: NotificationRule[];
}

const EMOJI_OPTIONS = ['🔔', '⚠️', '📅', '🚀', '💡', '📌', '⏳', '✅', '❌', '🔥', '🎉'];

export function SettingTab({ rules}: SettingTabProps) {

  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);
  const theme = useAppStore(state => state.theme);
  const appUsers = useAppStore(state => state.appUsers);
  const subAppUsers = useAppStore(state => state.subAppUsers);
  const parties = useAppStore(state => state.parties);

  const { t } = useLanguage();
  const [target, setTarget] = useState<'project' | 'task' | 'task_delegation'>('project');
  const [field, setField] = useState('start');
  const [days, setDays] = useState(3);
  const [hours, setHours] = useState(0);
  const [customMessage, setCustomMessage] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [icon, setIcon] = useState('🔔');
  const [showPerformanceDashboard, setShowPerformanceDashboard] = useState(false);
  const [showDataMaintenance, setShowDataMaintenance] = useState(false);
  const [showDesktopOptModal, setShowDesktopOptModal] = useState(false);
  
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const canWrite = currentUser.role === 'admin' || currentUser.canWrite;
  const isAdmin = currentUser.role === 'admin';

  const jpyRate = useAppStore(state => state.jpyRate);
  const usdRate = useAppStore(state => state.usdRate);
  const [jpyRateInput, setJpyRateInput] = useState(jpyRate.toString());
  const [usdRateInput, setUsdRateInput] = useState(usdRate.toString());

  // Use a separate useEffect to sync the inputs when the store updates,
  // but only if they are not actively being edited. To keep it simple,
  // we just sync on mount or if the store completely diverges.
  useState(() => {
    setJpyRateInput(jpyRate.toString());
    setUsdRateInput(usdRate.toString());
  });

  const handleSaveExchangeRates = async () => {
    const parsedJpy = parseFloat(jpyRateInput);
    const parsedUsd = parseFloat(usdRateInput);
    
    if (isNaN(parsedJpy) || isNaN(parsedUsd)) {
      useAppStore.getState().setToast({ title: "Notice", message: String("Please enter valid numbers for exchange rates.") });
      return;
    }
    
    useAppStore.getState().setJpyRate(parsedJpy);
    useAppStore.getState().setUsdRate(parsedUsd);
    
    try {
      setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_settings", "exchange_rates"), { 
        jpyRate: parsedJpy,
        usdRate: parsedUsd
      }, { merge: true });
      bumpConfigVersion('rates');
      useAppStore.getState().setToast({ title: "Notice", message: String("Exchange rates updated successfully.") });
    } catch (error) { 
      console.error(error); 
      useAppStore.getState().setToast({ title: "Notice", message: String("Failed to update exchange rates.") });
    }
  };

  const handleEnablePush = async () => {
    if (currentUser.id === "guest") {
      useAppStore.getState().setToast({ title: "Notice", message: String("Please login first to enable push notifications.") });
      return;
    }
    if (currentUser.notification === false) {
      useAppStore.getState().setToast({ title: "Notice", message: String("Push notifications are disabled for your account by the administrator.") });
      return;
    }
    await requestNotificationPermission(currentUser.id);
  };

  const handleAddRule = async () => {
    if (!canWrite) return;
    const newRule: NotificationRule = {
      id: generateId(),
      target,
      field,
      daysBefore: days,
      hoursBefore: hours,
      customMessage: customMessage.trim() || "",
      color,
      icon
    };
    try {
      setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_rules', newRule.id), newRule);
      bumpConfigVersion('rules');
      setCustomMessage('');
    } catch (e) { console.error(e); }
  };

  const handleDeleteRule = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Rule',
      message: 'Delete this notification rule?',
      onConfirm: async () => {
        try {
          deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_rules', id));
          bumpConfigVersion('rules');
        } catch (e) { console.error(e); }
      }
    });
  };

  const fieldLabels: Record<string, string> = {
    'start': 'Pj Start',
    'handover': 'Pj Compl',
    'opening': 'Opening',
    'finish': 'Finish',
    'flow_status': 'Flow Status'
  };

  const [isPurging, setIsPurging] = useState(false);

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

  const handlePurgeOldTombstones = async () => {
    if (!isAdmin) return;
    setConfirmModal({
      isOpen: true,
      title: "Purge Deleted Tombstones (> 60 days)",
      message: "This will permanently remove soft-deleted records older than 60 days from Firestore (projects, tasks, costs). Continue?",
      onConfirm: async () => {
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
              try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }
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
    });
  };

  const [isFixingMissingYears, setIsFixingMissingYears] = useState(false);
  const [isStandardizingYears, setIsStandardizingYears] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeduplicatingDelegations, setIsDeduplicatingDelegations] = useState(false);
  const [isSyncingTaskCounts, setIsSyncingTaskCounts] = useState(false);
  const [isScanningOrphans, setIsScanningOrphans] = useState(false);

  const handleScanOrphanData = async () => {
    if (!isAdmin) return;
    setIsScanningOrphans(true);
    try {
      const collectionsToCheck = [
        { name: "taka_projects", label: "Projects" },
        { name: "taka_tasks", label: "Tasks" },
        { name: "taka_costs", label: "Costs" },
        { name: "taka_delegation_groups", label: "Delegations" }
      ];

      const stats: Record<string, { total: number, orphans: any[] }> = {};
      let totalOrphans = 0;

      for (const colInfo of collectionsToCheck) {
        const colRef = collection(db, "artifacts", APP_ID, "public", "data", colInfo.name);
        const snap = await getDocs(colRef);
        const orphans: any[] = [];

        snap.docs.forEach(docSnap => {
          const d = docSnap.data();
          const yr = d.year !== undefined && d.year !== null && String(d.year).trim() !== '' 
            ? String(d.year).trim() 
            : (d.projectYear !== undefined && d.projectYear !== null && String(d.projectYear).trim() !== '' ? String(d.projectYear).trim() : '');
          
          const st = d.store !== undefined && d.store !== null && String(d.store).trim() !== '' 
            ? String(d.store).trim() 
            : (d.projectStore !== undefined && d.projectStore !== null && String(d.projectStore).trim() !== '' ? String(d.projectStore).trim() : '');

          const cd = d.code !== undefined && d.code !== null && String(d.code).trim() !== '' 
            ? String(d.code).trim() 
            : (d.projectCode !== undefined && d.projectCode !== null && String(d.projectCode).trim() !== '' ? String(d.projectCode).trim() : '');

          if (!yr && !st && !cd) {
            orphans.push({ id: docSnap.id, data: d, ref: docSnap.ref });
          }
        });

        stats[colInfo.name] = { total: snap.docs.length, orphans };
        totalOrphans += orphans.length;
      }

      const summaryLines = collectionsToCheck.map(c => {
        const s = stats[c.name];
        return `• ${c.label} (${c.name}): Tổng ${s.total} bản ghi → ${s.orphans.length} bản ghi mồ côi (thiếu cả Year, Store, Code)`;
      }).join('\n');

      if (totalOrphans === 0) {
        useAppStore.getState().setToast({
          title: "Kiểm tra hoàn tất (Không có mồ côi)",
          message: `Firestore hoàn toàn sạch sẽ! Không có bản ghi mồ côi nào thiếu cả 3 thông tin (Year, Store, Code).\n\nChi tiết:\n${summaryLines}`,
          type: "success"
        });
      } else {
        setConfirmModal({
          isOpen: true,
          title: `Phát hiện ${totalOrphans} bản ghi mồ côi!`,
          message: `Kết quả kiểm tra trên Firestore:\n\n${summaryLines}\n\nBạn có muốn thực hiện xóa (dọn dẹp) ${totalOrphans} bản ghi mồ côi này không?`,
          onConfirm: async () => {
            try {
              let batch = writeBatch(db);
              let opCount = 0;

              for (const colInfo of collectionsToCheck) {
                const orphanList = stats[colInfo.name].orphans;
                for (const item of orphanList) {
                  batch.delete(item.ref);
                  opCount++;
                  if (opCount % 400 === 0) {
                    await batch.commit();
                    batch = writeBatch(db);
                  }
                }
              }

              if (opCount % 400 !== 0) {
                await batch.commit();
              }

              useAppStore.getState().setToast({
                title: "Dọn dẹp hoàn tất",
                message: `Đã xóa thành công ${totalOrphans} bản ghi mồ côi khỏi Firestore.`,
                type: "success"
              });
            } catch (err: any) {
              console.error("Xóa orphan error:", err);
              useAppStore.getState().setToast({
                title: "Lỗi dọn dẹp",
                message: err?.message || "Không thể xóa bản ghi mồ côi",
                type: "error"
              });
            }
          }
        });
      }
    } catch (error: any) {
      console.error("Scan orphan error:", error);
      useAppStore.getState().setToast({
        title: "Lỗi kiểm tra",
        message: error?.message || "Không thể quét dữ liệu",
        type: "error"
      });
    } finally {
      setIsScanningOrphans(false);
    }
  };

  const handleSyncAllTaskCounts = async () => {
    if (!isAdmin) return;
    setConfirmModal({
      isOpen: true,
      title: "Cập nhật Task Counts toàn bộ Dự án",
      message: "Hệ thống sẽ quét toàn bộ các Dự án và Tasks con trên Firestore để tính toán chính xác số lượng taskCon (taskCount), tiến độ và ngày thực tế, sau đó lưu trực tiếp vào từng Dự án. Thao tác này chỉ cần chạy 1 lần để kích hoạt cơ chế On-Demand Expansion Loading không tốn lượt đọc. Bạn có muốn thực hiện không?",
      onConfirm: async () => {
        setIsSyncingTaskCounts(true);
        useAppStore.getState().setToast({
          title: "Đang đồng bộ...",
          message: "Đang tổng hợp và cập nhật taskCount cho toàn bộ Dự án trên Firestore...",
          type: "info"
        });
        try {
          const result = await syncAllProjectsTaskCountsToFirestore((processed, total) => {
            console.log(`[TaskCountSync] Processed ${processed}/${total} projects`);
          });
          useAppStore.getState().setToast({
            title: "Đồng bộ hoàn tất!",
            message: `Đã cập nhật taskCount thành công cho ${result.updatedCount}/${result.totalProjects} dự án trên Firestore.`,
            type: "success"
          });
        } catch (error: any) {
          console.error("Error syncing task counts:", error);
          useAppStore.getState().setToast({
            title: "Lỗi đồng bộ",
            message: error?.message || "Không thể đồng bộ taskCount",
            type: "error"
          });
        } finally {
          setIsSyncingTaskCounts(false);
        }
      }
    });
  };

  const handleDeduplicateDelegationGroups = async () => {
    if (!isAdmin) return;
    setConfirmModal({
      isOpen: true,
      title: "Dọn dẹp bản ghi Ủy quyền trùng lặp (Deduplicate)",
      message: "Hệ thống sẽ quét bộ sưu tập 'taka_delegation_groups' trên Firestore, tự động gộp các nhóm ủy quyền có cùng parentTaskId (chỉ giữ lại 1 bản ghi mới nhất và hợp nhất các subtask), xóa bỏ toàn bộ bản ghi trùng lặp thừa để giảm tải lượt đọc (hiện tại đang tải tới ~1,910 bản ghi). Bạn có muốn thực hiện không?",
      onConfirm: async () => {
        setIsDeduplicatingDelegations(true);
        try {
          const colRef = collection(db, "artifacts", APP_ID, "public", "data", "taka_delegation_groups");
          const snap = await getDocs(colRef);
          
          const groupsByParent = new Map<string, any[]>();
          const orphanedDocs: string[] = [];

          snap.docs.forEach(docSnap => {
            const data = docSnap.data();
            const parentId = data.parentTaskId || data.projectCode;
            if (!parentId && (!data.subTasks || data.subTasks.length === 0)) {
              orphanedDocs.push(docSnap.id);
            } else if (parentId) {
              const storeScope = String(data.projectStore || '').toUpperCase().trim();
              const yearScope = String(data.projectYear || '').trim();
              const isProjectDelegation = !data.parentTaskId || data.parentTaskId === data.projectCode;
              
              // For project delegation: strictly separate by projectCode + store + year to prevent cross-store/year collisions
              // For task delegation: data.parentTaskId is the unique task ID in taka_tasks
              const parentKey = isProjectDelegation
                ? `proj_${data.projectCode || data.parentTaskId}_${storeScope}_${yearScope}`
                : `task_${data.parentTaskId}`;

              const list = groupsByParent.get(parentKey) || [];
              list.push({ id: docSnap.id, data, ref: docSnap.ref });
              groupsByParent.set(parentKey, list);
            }
          });

          const docsToDelete: any[] = [...orphanedDocs.map(id => doc(db, "artifacts", APP_ID, "public", "data", "taka_delegation_groups", id))];
          const docsToUpdate: { ref: any, data: any }[] = [];

          groupsByParent.forEach((list, parentKey) => {
            // Sort by updatedAt descending
            list.sort((a, b) => {
              const timeA = a.data.updatedAt ? new Date(a.data.updatedAt).getTime() : 0;
              const timeB = b.data.updatedAt ? new Date(b.data.updatedAt).getTime() : 0;
              return timeB - timeA;
            });

            // Winner is the newest one
            const winner = list[0];
            const existingSubTaskIds = new Set((winner.data.subTasks || []).map((st: any) => st.id));
            let mergedSubTasks = [...(winner.data.subTasks || [])];

            if (list.length > 1) {
              for (let i = 1; i < list.length; i++) {
                const dup = list[i];
                docsToDelete.push(dup.ref);

                (dup.data.subTasks || []).forEach((st: any) => {
                  if (st && st.id && !existingSubTaskIds.has(st.id) && (st.name || st.party || st.comments)) {
                    existingSubTaskIds.add(st.id);
                    mergedSubTasks.push(st);
                  }
                });
              }
            }

            let finalSubTasks: any[] = [];
            const isTaskDelegation = parentKey.startsWith('task_');

            if (isTaskDelegation) {
              // Quy tắc: Đối với công việc giao cho nhiều đơn vị thì chỉ tạo 1 delegation, đơn vị nhận việc lấy bất kỳ party nào từ task
              if (mergedSubTasks.length > 0) {
                // Ưu tiên subtask đang có tiến độ/được duyệt, hoặc có cập nhật mới nhất
                let bestSubTask = mergedSubTasks[0];
                for (let i = 1; i < mergedSubTasks.length; i++) {
                  const candidate = mergedSubTasks[i];
                  const isBestActive = (bestSubTask.delegationStatus && bestSubTask.delegationStatus !== 'Assigned') || (bestSubTask.status && bestSubTask.status !== 'Assigned') || !!bestSubTask.report || !!bestSubTask.comments || (bestSubTask.attachments && bestSubTask.attachments.length > 0);
                  const isCandActive = (candidate.delegationStatus && candidate.delegationStatus !== 'Assigned') || (candidate.status && candidate.status !== 'Assigned') || !!candidate.report || !!candidate.comments || (candidate.attachments && candidate.attachments.length > 0);

                  if (!isBestActive && isCandActive) {
                    bestSubTask = candidate;
                  } else if (isBestActive && isCandActive) {
                    const timeBest = bestSubTask.updatedAt ? new Date(bestSubTask.updatedAt).getTime() : 0;
                    const timeCand = candidate.updatedAt ? new Date(candidate.updatedAt).getTime() : 0;
                    if (timeCand > timeBest) bestSubTask = candidate;
                  }
                }
                finalSubTasks = [bestSubTask];
              }
            } else {
              // Deduplicate subtasks by party for project-level delegations: if same party has duplicate subtasks, keep the active/latest one
              const partyMap = new Map<string, any>();
              const nonPartySubTasks: any[] = [];
              mergedSubTasks.forEach((st: any) => {
                const pKey = String(st.party || '').trim().toLowerCase();
                if (!pKey) {
                  nonPartySubTasks.push(st);
                  return;
                }
                if (!partyMap.has(pKey)) {
                  partyMap.set(pKey, st);
                } else {
                  const prev = partyMap.get(pKey);
                  const prevIsActive = (prev.delegationStatus && prev.delegationStatus !== 'Assigned') || (prev.status && prev.status !== 'Assigned') || !!prev.report || !!prev.comments || (prev.attachments && prev.attachments.length > 0);
                  const currIsActive = (st.delegationStatus && st.delegationStatus !== 'Assigned') || (st.status && st.status !== 'Assigned') || !!st.report || !!st.comments || (st.attachments && st.attachments.length > 0);

                  if (!prevIsActive && currIsActive) {
                    partyMap.set(pKey, st);
                  } else if (prevIsActive && currIsActive) {
                    const timePrev = prev.updatedAt ? new Date(prev.updatedAt).getTime() : 0;
                    const timeCurr = st.updatedAt ? new Date(st.updatedAt).getTime() : 0;
                    if (timeCurr > timePrev) partyMap.set(pKey, st);
                  }
                }
              });
              finalSubTasks = [...Array.from(partyMap.values()), ...nonPartySubTasks];
            }

            if (finalSubTasks.length !== (winner.data.subTasks || []).length || list.length > 1) {
              docsToUpdate.push({
                ref: winner.ref,
                data: {
                  ...winner.data,
                  subTasks: finalSubTasks,
                  updatedAt: new Date().toISOString()
                }
              });
            }
          });

          if (docsToUpdate.length > 0) {
            let updateBatch = writeBatch(db);
            let uCount = 0;
            for (const item of docsToUpdate) {
              updateBatch.set(item.ref, item.data, { merge: true });
              uCount++;
              if (uCount >= 400) {
                await updateBatch.commit();
                updateBatch = writeBatch(db);
                uCount = 0;
              }
            }
            if (uCount > 0) await updateBatch.commit();
          }

          let delCount = 0;
          if (docsToDelete.length > 0) {
            let delBatch = writeBatch(db);
            let bCount = 0;
            for (const ref of docsToDelete) {
              delBatch.delete(ref);
              bCount++;
              delCount++;
              if (bCount >= 400) {
                await delBatch.commit();
                delBatch = writeBatch(db);
                bCount = 0;
              }
            }
            if (bCount > 0) await delBatch.commit();
          }

          useAppStore.getState().setToast({
            title: "Dọn dẹp thành công",
            message: `Đã xóa ${delCount} bản ghi ủy quyền trùng lặp/thừa. Tổng bản ghi còn lại: ${snap.docs.length - delCount}.`,
            type: "success"
          });
        } catch (e) {
          console.error("Deduplicate delegations error:", e);
          useAppStore.getState().setToast({
            title: "Lỗi",
            message: "Có lỗi xảy ra khi dọn dẹp bản ghi ủy quyền trùng lặp.",
            type: "error"
          });
        } finally {
          setIsDeduplicatingDelegations(false);
        }
      }
    });
  };

  const handleStandardizeYears = async () => {
    if (!isAdmin) return;
    setConfirmModal({
      isOpen: true,
      title: "Đồng bộ chuẩn hóa Năm (Number Format)",
      message: "Hệ thống sẽ quét toàn bộ dữ liệu (Dự án, Công việc, Chi phí) và chuyển đổi các trường năm (year, projectYear) dạng chuỗi ('2026', '2027'...) thành dạng số (2026, 2027...) để đồng nhất 100%. Bạn có muốn tiếp tục?",
      onConfirm: async () => {
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
                    try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }
                    batch = writeBatch(db);
                    count = 0;
                  }
                }
              }
            }
            if (count > 0) {
              try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }
            }
          }

          useAppStore.getState().setToast({
            title: "Thành công",
            message: `Đã chuẩn hóa thành công ${totalUpdated} bản ghi sang định dạng số.`
          });
        } catch (e) {
          console.error("Standardize years error:", e);
          useAppStore.getState().setToast({
            title: "Lỗi",
            message: "Có lỗi xảy ra khi chuẩn hóa dữ liệu năm."
          });
        } finally {
          setIsStandardizingYears(false);
        }
      }
    });
  };

  const handleFixMissingTaskYears = async () => {
    if (!isAdmin) return;
    setConfirmModal({
      isOpen: true,
      title: "Vá lỗi thiếu Project Year",
      message: "Hệ thống sẽ quét các dữ liệu (Tasks, Costs, Delegations) đang bị rỗng projectYear. Nếu projectCode khớp với một Project mẹ, hệ thống sẽ lấy năm của Project mẹ điền vào. Bạn có muốn tiếp tục?",
      onConfirm: async () => {
        setIsFixingMissingYears(true);
        try {
          // 1. Lấy tất cả projects để build map projectCode -> year
          const projRef = collection(db, "artifacts", APP_ID, "public", "data", "taka_projects");
          const projSnap = await getDocs(projRef);
          const projectYearMap = new Map<string, number>();
          projSnap.docs.forEach(doc => {
            const data = doc.data();
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
              // Missing or invalid projectYear
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
                    try {
                      batch.commit().catch(e => console.error("Batch commit failed", e));
                    } catch (error: any) {
                      console.error("Batch commit failed", error);
                      useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied.", type: "error" });
                      return;
                    }
                    batch = writeBatch(db);
                    count = 0;
                  }
                }
              }
            }
            if (count > 0) {
              try {
                batch.commit().catch(e => console.error("Batch commit failed", e));
              } catch (error: any) {
                console.error("Batch commit failed", error);
                useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied.", type: "error" });
                return;
              }
            }
          }

          useAppStore.getState().setToast({
            title: "Thành công",
            message: `Đã tự động vá projectYear cho ${totalUpdated} bản ghi.`,
            type: "success"
          });
        } catch (error: any) {
          console.error("Error fixing missing years", error);
          useAppStore.getState().setToast({ title: "Lỗi", message: error.message || "Có lỗi xảy ra", type: "error" });
        } finally {
          setIsFixingMissingYears(false);
        }
      }
    });
  };

  const handleArchiveData = async () => {
    if (!isAdmin) return;
    setConfirmModal({
      isOpen: true,
      title: "Archive Cold Storage (2024, 2025)",
      message: "Hệ thống sẽ lấy toàn bộ dữ liệu Projects, Tasks, Costs, Delegations của các năm cũ (2024, 2025) và tạo file JSON nén lưu vào Firebase Storage. Tác vụ này giúp giảm tải Firestore Reads khi người dùng chọn 'All Years'. Bạn có muốn tiếp tục?",
      onConfirm: async () => {
        setIsArchiving(true);
        useAppStore.getState().setToast({ title: "Bắt đầu...", message: "Đang tạo archive data cho các năm cũ. Vui lòng đợi...", type: "info" });
        try {
          const { ARCHIVED_YEARS } = await import("../lib/utils");
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
          const { storage } = await import("../lib/firebase");
          
          const archiveRef = ref(storage, "archives/taka_archive.json");
          await uploadString(archiveRef, JSON.stringify(archiveData), "raw", {
            contentType: "application/json"
          });
          
          useAppStore.getState().setToast({ 
            title: "Thành công!", 
            message: `Tạo Archive thành công! Đã lưu trữ ${Object.values(archiveData).reduce((acc: number, arr: any) => acc + arr.length, 0)} bản ghi.`, 
            type: "success" 
          });
        } catch (e) {
          console.error("Archive error:", e);
          useAppStore.getState().setToast({ title: "Lỗi", message: "Có lỗi khi tạo archive data.", type: "error" });
        } finally {
          setIsArchiving(false);
        }
      }
    });
  };

  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm overflow-hidden overflow-y-auto">
      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
      <div className="px-5 py-4 border-b border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 shrink-0">
        <h2 className="text-lg font-bold text-slate-800 dark:text-[#e3e3e3]">{t("Settings")}</h2>
      </div>
      
      <div className="p-5 flex flex-col md:flex-row gap-4 border-b border-slate-200 dark:border-[#444446] bg-white dark:bg-[#1e1e20] items-center">
        {currentUser.role !== 'guest' && (
          <>
            <button title="Refresh"
              onClick={() => {
                if (window.confirm("Do you want to refresh the app to update to the latest version?")) {
                  window.location.reload();
                }
              }}
              className="px-5 py-3 rounded-lg border border-slate-200 dark:border-[#444446] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 transition-colors flex items-center gap-3 font-medium text-slate-700 dark:text-[#c3c3c3] w-full md:w-auto shadow-sm"
            >
              <RefreshCw className="w-5 h-5 text-emerald-500" />
              Force Update App
            </button>
            
            <button title="Enable Push (iOS/PWA)"
              onClick={handleEnablePush}
              className="px-5 py-3 rounded-lg border border-slate-200 dark:border-[#444446] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 transition-colors flex items-center gap-3 font-medium text-slate-700 dark:text-[#c3c3c3] w-full md:w-auto shadow-sm"
            >
              <Smartphone className="w-5 h-5 text-blue-500" />
              Enable Push (iOS/PWA)
            </button>

            <button title="Cấu hình tối ưu Desktop (Chống ngủ tab Chrome/Edge)"
              onClick={() => setShowDesktopOptModal(true)}
              className="px-5 py-3 rounded-lg border border-slate-200 dark:border-[#444446] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 transition-colors flex items-center gap-3 font-medium text-slate-700 dark:text-[#c3c3c3] w-full md:w-auto shadow-sm"
            >
              <Monitor className="w-5 h-5 text-indigo-500" />
              Tối ưu Desktop (Chống ngủ tab)
            </button>
            
            <button onClick={async () => {
                const { testLocalNotification } = await import("../lib/notifications");
                testLocalNotification();
              }}
              className="px-5 py-3 rounded-lg border border-slate-200 dark:border-[#444446] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 transition-colors flex items-center gap-3 font-medium text-slate-700 dark:text-[#c3c3c3] w-full md:w-auto shadow-sm"
            >
              <Bell className="w-5 h-5 text-blue-500" />
              Test Local Notification
            </button>

            {isAdmin && (
              <>
                <button 
                  onClick={() => setShowPerformanceDashboard(prev => !prev)}
                  title="Toggle Firestore Performance & Read Monitor"
                  className={cn(
                    "px-5 py-3 rounded-lg border transition-colors flex items-center gap-3 font-medium w-full md:w-auto shadow-sm",
                    showPerformanceDashboard 
                      ? "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                      : "border-slate-200 dark:border-[#444446] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 text-slate-700 dark:text-[#c3c3c3]"
                  )}
                >
                  <Activity className="w-5 h-5 text-blue-500" />
                  Performance Monitor
                  {showPerformanceDashboard ? (
                    <ChevronUp className="w-4 h-4 ml-auto md:ml-1 text-blue-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 ml-auto md:ml-1 text-slate-400" />
                  )}
                </button>

                <button 
                  onClick={() => setShowDataMaintenance(prev => !prev)}
                  title="Bảo trì Dữ liệu & Bộ nhớ đệm (Database Maintenance)"
                  className={cn(
                    "px-5 py-3 rounded-lg border transition-colors flex items-center gap-3 font-medium w-full md:w-auto shadow-sm",
                    showDataMaintenance 
                      ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300"
                      : "border-slate-200 dark:border-[#444446] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 text-slate-700 dark:text-[#c3c3c3]"
                  )}
                >
                  <Database className="w-5 h-5 text-amber-500" />
                  Database Maintenance
                  {showDataMaintenance ? (
                    <ChevronUp className="w-4 h-4 ml-auto md:ml-1 text-amber-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 ml-auto md:ml-1 text-slate-400" />
                  )}
                </button>
              </>
            )}
          </>
        )}
      </div>

      {isAdmin && showDataMaintenance && (
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
            title="Chuẩn hóa toàn bộ trường năm (year, projectYear) sang định dạng số (number)"
            className="px-5 py-2.5 rounded-lg border border-indigo-200 dark:border-indigo-900/40 bg-white dark:bg-[#1e1e20] hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-colors flex items-center gap-3 font-medium text-indigo-700 dark:text-indigo-400 shadow-sm text-sm disabled:opacity-50"
          >
            <Calendar className="w-4 h-4 text-indigo-500" />
            {isStandardizingYears ? "Đang xử lý..." : "Chuẩn hóa Năm (Số)"}
          </button>

          <button 
            onClick={handleFixMissingTaskYears}
            disabled={isFixingMissingYears}
            title="Tự động quét các tasks, costs bị trống năm và gán năm của project mẹ"
            className="px-5 py-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-white dark:bg-[#1e1e20] hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors flex items-center gap-3 font-medium text-emerald-700 dark:text-emerald-400 shadow-sm text-sm disabled:opacity-50"
          >
            <Calendar className="w-4 h-4 text-emerald-500" />
            {isFixingMissingYears ? "Đang vá lỗi..." : "Vá lỗi thiếu Project Year"}
          </button>

          <button 
            onClick={handleArchiveData}
            disabled={isArchiving}
            title="Tạo file nén dữ liệu các năm cũ (2024, 2025) lưu vào Storage để giảm Firestore reads"
            className="px-5 py-2.5 rounded-lg border border-blue-200 dark:border-blue-900/40 bg-white dark:bg-[#1e1e20] hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors flex items-center gap-3 font-medium text-blue-700 dark:text-blue-400 shadow-sm text-sm disabled:opacity-50"
          >
            <FolderOutput className="w-4 h-4 text-blue-500" />
            {isArchiving ? "Đang nén..." : "Tạo Archive Data"}
          </button>

          <button 
            onClick={handleDeduplicateDelegationGroups}
            disabled={isDeduplicatingDelegations}
            title="Gộp và xóa các bản ghi ủy quyền trùng lặp trên Firestore để giảm tải lượt đọc"
            className="px-5 py-2.5 rounded-lg border border-purple-200 dark:border-purple-900/40 bg-white dark:bg-[#1e1e20] hover:bg-purple-50 dark:hover:bg-purple-950/20 transition-colors flex items-center gap-3 font-medium text-purple-700 dark:text-purple-400 shadow-sm text-sm disabled:opacity-50"
          >
            <FolderOutput className="w-4 h-4 text-purple-500" />
            {isDeduplicatingDelegations ? "Đang xử lý..." : "Dọn dẹp Ủy quyền trùng lặp"}
          </button>

          <button 
            onClick={handleSyncAllTaskCounts}
            disabled={isSyncingTaskCounts}
            title="Quét toàn bộ dự án và task trên Firestore để tính và cập nhật taskCount, tiến độ trực tiếp vào Dự án (Chạy 1 lần)"
            className="px-5 py-2.5 rounded-lg border border-teal-200 dark:border-teal-900/40 bg-white dark:bg-[#1e1e20] hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-colors flex items-center gap-3 font-medium text-teal-700 dark:text-teal-400 shadow-sm text-sm disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-teal-500" />
            {isSyncingTaskCounts ? "Đang cập nhật Task Counts..." : "Cập nhật Task Counts toàn bộ Dự án"}
          </button>

          <button 
            onClick={handleScanOrphanData}
            disabled={isScanningOrphans}
            title="Quét và xóa dữ liệu mồ côi (bản ghi bị thiếu cả 3 thông tin: Year, Store, Project Code)"
            className="px-5 py-2.5 rounded-lg border border-rose-200 dark:border-rose-900/40 bg-white dark:bg-[#1e1e20] hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors flex items-center gap-3 font-medium text-rose-700 dark:text-rose-400 shadow-sm text-sm disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4 text-rose-500" />
            {isScanningOrphans ? "Đang quét dữ liệu mồ côi..." : "Quét & Dọn dữ liệu Mồ côi"}
          </button>
        </div>
      )}

      {isAdmin && showPerformanceDashboard && (
        <FirestorePerformanceDashboard onClose={() => setShowPerformanceDashboard(false)} />
      )}


      {isAdmin && (
        <>
          <div className="px-5 py-4 border-b border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 flex justify-between items-center shrink-0">
            <h2 className="text-md font-bold text-slate-800 dark:text-[#e3e3e3]">Currency Exchange</h2>
          </div>
          <div className="p-4 md:p-5 flex flex-col bg-white dark:bg-[#1e1e20] border-b border-slate-100 dark:border-[#333336] gap-4">
            <div className="flex flex-col md:flex-row flex-wrap gap-4 items-end w-full">
              <div className="w-full md:w-auto">
                <label className="block text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase mb-1">JPY Rate (1 JPY = x VND)</label>
                <input 
                  type="number" 
                  value={jpyRateInput}
                  onChange={(e) => setJpyRateInput(e.target.value)}
                  className="w-full md:w-48 p-2 rounded-lg border border-slate-300 dark:border-[#555558] text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-[#1e1e20]" 
                />
              </div>
              <div className="w-full md:w-auto">
                <label className="block text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase mb-1">USD Rate (1 USD = x VND)</label>
                <input 
                  type="number" 
                  value={usdRateInput}
                  onChange={(e) => setUsdRateInput(e.target.value)}
                  className="w-full md:w-48 p-2 rounded-lg border border-slate-300 dark:border-[#555558] text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-[#1e1e20]" 
                />
              </div>
              <button 
                onClick={handleSaveExchangeRates}
                disabled={!canWrite}
                className="px-6 py-2 bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm shadow-md transition-colors h-[38px] disabled:opacity-50 w-full md:w-auto mt-2 md:mt-0"
              >
                Save Rates
              </button>
            </div>
          </div>

          <div className="px-5 py-4 border-b border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 flex justify-between items-center shrink-0">
            <h2 className="text-md font-bold text-slate-800 dark:text-[#e3e3e3]">Notification Rules</h2>
          </div>
          
          <div className="p-4 md:p-5 flex flex-col bg-white dark:bg-[#1e1e20] border-b border-slate-100 dark:border-[#333336] gap-4">
        <div className="flex flex-col md:flex-row flex-wrap gap-4 items-end w-full">
          <div className="w-full md:w-auto">
            <label className="block text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase mb-1">Target</label>
            <select 
              value={target}
              onChange={(e) => {
                const val = e.target.value as 'project' | 'task' | 'task_delegation';
                setTarget(val);
                setField(val === 'project' ? 'start' : (val === 'task_delegation' ? 'flow_status' : 'start'));
              }}
              className="p-2 rounded-lg border border-slate-300 dark:border-[#555558] text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-40 bg-white dark:bg-[#1e1e20]"
            >
              <option value="project">{t("Project")}</option>
              <option value="task">{t("Task")}</option>
              <option value="task_delegation">Task Delegation</option>
            </select>
          </div>
          <div className="w-full md:w-auto">
            <label className="block text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase mb-1">Date Field / Trigger</label>
            <select 
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="p-2 rounded-lg border border-slate-300 dark:border-[#555558] text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-40 bg-white dark:bg-[#1e1e20]"
            >
              {target === 'project' ? (
                <>
                  <option value="start">Pj Start</option>
                  <option value="handover">Pj Compl</option>
                  <option value="opening">Opening</option>
                </>
              ) : target === 'task_delegation' ? (
                <>
                  <option value="flow_status">Flow: Status Update</option>
                  <option value="mention">@mention</option>
                  <option value="delegation_party">@delegation party</option>
                </>
              ) : (
                <>
                  <option value="start">{t("Start")}</option>
                  <option value="finish">{t("Finish")}</option>
                </>
              )}
            </select>
          </div>
          <div className="w-full md:w-auto">
            <label className="block text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase mb-1">Remind before</label>
            <div className="flex items-center gap-2">
              <input 
                type="number" 
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value) || 0)}
                className="p-2 rounded-lg border border-slate-300 dark:border-[#555558] text-sm flex-1 md:w-20 focus:ring-2 focus:ring-blue-500 outline-none text-center" 
              /> 
              <span className="text-xs text-slate-500 dark:text-[#a3a3a3] font-bold">d</span>
              <input 
                type="number" 
                value={hours}
                onChange={(e) => setHours(parseInt(e.target.value) || 0)}
                className="p-2 rounded-lg border border-slate-300 dark:border-[#555558] text-sm flex-1 md:w-20 focus:ring-2 focus:ring-blue-500 outline-none text-center" 
              /> 
              <span className="text-xs text-slate-500 dark:text-[#a3a3a3] font-bold">h</span>
            </div>
          </div>
          
          <div className="w-full md:w-auto flex-grow flex gap-2">
            <div className="flex-grow">
              <label className="block text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase mb-1">Content (Optional)</label>
              <input 
                type="text" 
                placeholder="Custom notification message..."
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                className="w-full p-2 rounded-lg border border-slate-300 dark:border-[#555558] text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase mb-1">Color</label>
              <input 
                type="color" 
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-[38px] w-12 p-1 rounded-lg border border-slate-300 dark:border-[#555558] cursor-pointer" 
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase mb-1">Icon</label>
              <select 
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="h-[38px] p-2 rounded-lg border border-slate-300 dark:border-[#555558] text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-[#1e1e20]"
              >
                {EMOJI_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>

          <button title="Add Rule" 
            onClick={handleAddRule}
            disabled={!canWrite}
            className="px-6 py-2 bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 text-white rounded-lg font-bold text-sm shadow-md transition-colors h-[38px] disabled:opacity-50 w-full md:w-auto mt-2 md:mt-0 ml-auto"
          >
            Add Rule
          </button>
        </div>
      </div>

      <div className="overflow-y-auto flex-grow p-4 bg-slate-50 dark:bg-[#1e1e20]/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600 dark:text-[#a3a3a3] border border-slate-200 dark:border-[#444446] rounded-lg overflow-hidden bg-white dark:bg-[#1e1e20] shadow-sm min-w-[800px]">
          <thead className="text-xs text-slate-500 dark:text-[#a3a3a3] uppercase bg-slate-100 dark:bg-[#1e1e20] border-b border-slate-200 dark:border-[#444446]">
            <tr>
              <th className="px-6 py-4 font-bold">Target</th>
              <th className="px-6 py-4 font-bold">Trigger Field</th>
              <th className="px-6 py-4 font-bold">Condition</th>
              <th className="px-6 py-4 font-bold">Content</th>
              <th className="px-6 py-4 font-bold w-24 text-center">{t("Action")}</th>
            </tr>
          </thead>
          <tbody>
            {rules.map(rule => (
              <tr key={rule.id} className="border-b border-slate-100 dark:border-[#333336] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 transition-colors">
                <td className="px-6 py-4 font-bold text-slate-700 dark:text-[#c3c3c3] capitalize">{rule.target}</td>
                <td className="px-6 py-4 font-medium text-blue-700 dark:text-[#8ab4f8]">{fieldLabels[rule.field] || rule.field}</td>
                <td className="px-6 py-4 text-slate-600 dark:text-[#a3a3a3]">Remind <span className="font-bold">{rule.daysBefore}</span> days, <span className="font-bold">{rule.hoursBefore || 0}</span> hours before</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg" style={{ color: rule.color || '#3b82f6' }}>{rule.icon || '🔔'}</span>
                    <span className="text-slate-700 dark:text-[#c3c3c3] font-medium">{rule.customMessage || <span className="text-slate-400 dark:text-[#838383] italic">Default message</span>}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  {canWrite && (
                    <button onClick={() => handleDeleteRule(rule.id)} className="p-1.5 bg-red-50 text-red-600 dark:text-red-400 hover:bg-red-100 rounded-md transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      </>
    )}

    <DesktopOptimizationModal 
      isOpen={showDesktopOptModal} 
      onClose={() => setShowDesktopOptModal(false)} 
    />
  </div>
  );
}
