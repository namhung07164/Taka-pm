import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Project, Task, TakaDeltaItem } from '../types';
import { useAppStore } from '../store/useAppStore';
import { db, APP_ID, writeBatch } from '../lib/firebase';
import { doc } from 'firebase/firestore';
import { healAllTasksPredecessors, convertAllSubtaskCodesAndPredecessorsToHash } from '../lib/ganttUtils';
import { getAppBootAgeMs, BOOT_SYNC_GUARD_MS } from '../lib/projectDatesService';
import { recordBatchDeltas } from '../lib/deltaSyncService';

interface UseDetailPredecessorSyncParams {
  tasks: Task[];
  projects: Project[];
  hasWritePermission: boolean;
}

export function useDetailPredecessorSync({
  tasks,
  projects,
  hasWritePermission,
}: UseDetailPredecessorSyncParams) {
  const isSyncingPredecessorsRef = useRef(false);
  const [isSyncingPredecessors, setIsSyncingPredecessors] = useState(false);
  const isConvertingToHashRef = useRef(false);
  const [isConvertingToHash, setIsConvertingToHash] = useState(false);
  const hasAutoHealedRef = useRef(false);

  const handleSyncAllPredecessors = useCallback(async (showToast = false) => {
    if (isSyncingPredecessorsRef.current) return;
    if (!tasks || tasks.length === 0 || !projects || projects.length === 0) {
      if (showToast) {
        useAppStore.getState().setToast({
          title: "Thông báo",
          message: "Chưa có dữ liệu công việc để đồng bộ.",
          type: "info"
        });
      }
      return;
    }

    try {
      isSyncingPredecessorsRef.current = true;
      setIsSyncingPredecessors(true);

      const healed = healAllTasksPredecessors(tasks, projects);
      if (healed.changedCount > 0) {
        // Zero-delay optimistic UI update (0ms)
        useAppStore.getState().setTasks(healed.updatedTasks);

        // Batch update to Firestore in background (non-blocking) in chunks of 400
        const CHUNK_SIZE = 400;
        const commitChunks = async () => {
          for (let i = 0; i < healed.updatesToSave.length; i += CHUNK_SIZE) {
            const chunk = healed.updatesToSave.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);
            chunk.forEach(u => {
              const tRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", u.id);
              const updatePayload: any = { updatedAt: u.updatedAt };
              if (u.predecessor !== undefined) updatePayload.predecessor = u.predecessor;
              if (u.taskCodePhu !== undefined) updatePayload.taskCodePhu = u.taskCodePhu;
              batch.set(tRef, updatePayload, { merge: true });
            });
            await batch.commit();
            const deltaItems: TakaDeltaItem[] = chunk.map((u) => ({
              docId: u.id,
              collectionName: 'taka_tasks',
              action: 'update',
              isPatch: true,
              data: {
                predecessor: u.predecessor,
                taskCodePhu: u.taskCodePhu,
                updatedAt: u.updatedAt,
              },
              year: (tasks.find((t) => t.id === u.id)?.projectYear) ? String(tasks.find((t) => t.id === u.id)!.projectYear) : undefined,
            }));
            recordBatchDeltas(deltaItems, 'predecessor_heal').catch(() => {});
          }
        };
        commitChunks().catch(e => console.error("Background sync predecessors error:", e));

        if (showToast) {
          useAppStore.getState().setToast({
            title: "Đồng bộ thành công",
            message: `Đã chuẩn hóa và cập nhật ${healed.changedCount} mã tiền nhiệm (Predecessor) theo mã Subtask mới dạng #!`,
            type: "success"
          });
        }
      } else if (showToast) {
        useAppStore.getState().setToast({
          title: "Đồng bộ hoàn tất",
          message: "Tất cả các ô Predecessor đã khớp chính xác với mã Subtask hiện tại.",
          type: "info"
        });
      }
    } catch (e: any) {
      console.error("Sync predecessors error:", e);
      if (showToast) {
        useAppStore.getState().setToast({
          title: "Lỗi đồng bộ",
          message: e?.message || "Có lỗi xảy ra khi đồng bộ tiền nhiệm.",
          type: "error"
        });
      }
    } finally {
      isSyncingPredecessorsRef.current = false;
      setIsSyncingPredecessors(false);
    }
  }, [tasks, projects]);

  const handleConvertAllSubtasksToHash = useCallback(async (showToast = true) => {
    if (isConvertingToHashRef.current) return;
    if (!tasks || tasks.length === 0 || !projects || projects.length === 0) {
      if (showToast) {
        useAppStore.getState().setToast({
          title: "Thông báo",
          message: "Chưa có dữ liệu công việc để quét chuyển đổi.",
          type: "info"
        });
      }
      return;
    }

    try {
      isConvertingToHashRef.current = true;
      setIsConvertingToHash(true);

      const result = convertAllSubtaskCodesAndPredecessorsToHash(tasks, projects);
      if (result.changedCount > 0) {
        // Zero-delay optimistic UI update (0ms)
        useAppStore.getState().setTasks(result.updatedTasks);

        // Batch update to Firestore in background in chunks of 400
        const CHUNK_SIZE = 400;
        const commitChunks = async () => {
          for (let i = 0; i < result.updatesToSave.length; i += CHUNK_SIZE) {
            const chunk = result.updatesToSave.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);
            chunk.forEach(u => {
              const tRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", u.id);
              const updatePayload: any = { updatedAt: u.updatedAt };
              if (u.predecessor !== undefined) updatePayload.predecessor = u.predecessor;
              if (u.taskCodePhu !== undefined) updatePayload.taskCodePhu = u.taskCodePhu;
              batch.set(tRef, updatePayload, { merge: true });
            });
            await batch.commit();
            const deltaItems: TakaDeltaItem[] = chunk.map((u) => ({
              docId: u.id,
              collectionName: 'taka_tasks',
              action: 'update',
              isPatch: true,
              data: {
                predecessor: u.predecessor,
                taskCodePhu: u.taskCodePhu,
                updatedAt: u.updatedAt,
              },
              year: (tasks.find((t) => t.id === u.id)?.projectYear) ? String(tasks.find((t) => t.id === u.id)!.projectYear) : undefined,
            }));
            recordBatchDeltas(deltaItems, 'predecessor_convert_hash').catch(() => {});
          }
        };
        commitChunks().catch(e => console.error("Background convert to hash error:", e));

        if (showToast) {
          useAppStore.getState().setToast({
            title: "Chuyển đổi thành công",
            message: `Đã quét và chuyển đổi ${result.changedCount} công việc sang định dạng '#' (Subtask Code & Predecessor)!`,
            type: "success"
          });
        }
      } else if (showToast) {
        useAppStore.getState().setToast({
          title: "Không có thay đổi",
          message: "Tất cả công việc đã theo đúng định dạng '#' hoặc không có công việc nào cần chuyển đổi.",
          type: "info"
        });
      }
    } catch (e: any) {
      console.error("Convert to hash error:", e);
      if (showToast) {
        useAppStore.getState().setToast({
          title: "Lỗi chuyển đổi",
          message: e?.message || "Có lỗi xảy ra khi quét chuyển đổi định dạng '#'.",
          type: "error"
        });
      }
    } finally {
      isConvertingToHashRef.current = false;
      setIsConvertingToHash(false);
    }
  }, [tasks, projects, hasWritePermission]);

  useEffect(() => {
    if (hasAutoHealedRef.current) return;
    if (!tasks || tasks.length === 0 || !projects || projects.length === 0) return;
    if (!hasWritePermission) return;
    // 15 giây đầu sau khi mở app, tasks mới chỉ là bản cũ từ Dexie: không tự ghi lên Firestore
    if (getAppBootAgeMs() < BOOT_SYNC_GUARD_MS) return;

    hasAutoHealedRef.current = true;
    handleConvertAllSubtasksToHash(false).catch(() => {});
  }, [tasks, projects, hasWritePermission, handleConvertAllSubtasksToHash]);

  return {
    isSyncingPredecessors,
    handleSyncAllPredecessors,
    isConvertingToHash,
    handleConvertAllSubtasksToHash,
  };
}
