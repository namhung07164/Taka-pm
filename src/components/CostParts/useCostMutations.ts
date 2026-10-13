import React, { useState } from 'react';
import { doc } from 'firebase/firestore';
import { writeBatch, setDoc, deleteDoc } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { Cost, Project } from '../../types';
import { generateId } from '../../lib/utils';
import { deleteStorageFiles, extractStorageUrls } from '../../lib/storageUtils';
import { undoManager } from '../../lib/undoManager';
import { useAppStore } from '../../store/useAppStore';

interface UseCostMutationsParams {
  canWrite: boolean;
  expandedCodes: string[];
  toggleProjectExpansion: (key: string) => void;
}

export function useCostMutations({
  canWrite,
  expandedCodes,
  toggleProjectExpansion,
}: UseCostMutationsParams) {
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const handleAddCost = async (project: Project) => {
    if (!canWrite) return;

    const derivedYear = project.year
      ? project.year
      : project.start
      ? Number(String(project.start).substring(0, 4))
      : undefined;

    const newCost: Cost = {
      id: generateId(),
      projectCode: project.code || '',
      actual: 0,
      firstPaid: 0,
      secondPaid: 0,
      thirdPaid: 0,
      supportingFee: 0,
      description: 'New Cost Entry',
      vendor: '',
      updatedAt: new Date().toISOString(),
    };

    if (derivedYear !== undefined && derivedYear !== null && !isNaN(Number(derivedYear))) {
      newCost.projectYear = derivedYear;
    }
    if (project.store !== undefined && project.store !== null) {
      newCost.projectStore = project.store;
    }

    // Safety check: remove ANY undefined values to prevent Firestore crash
    Object.keys(newCost).forEach((key) => {
      if ((newCost as any)[key] === undefined) {
        delete (newCost as any)[key];
      }
    });

    try {
      setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', newCost.id), newCost);
      const groupKey = `${project.code}-${derivedYear}-${project.store}-${project.no}`;
      if (
        !expandedCodes.includes(groupKey) &&
        !expandedCodes.includes(String(project.id))
      ) {
        toggleProjectExpansion(groupKey);
      }

      undoManager.push({
        description: `Add Cost to ${project.code} (${derivedYear})`,
        revert: async () => {
          deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', newCost.id));
        },
      });
    } catch (e) {
      console.error('[CostTab] Error saving cost:', e);
    }
  };

  const handleDeleteCost = async (c: Cost) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Cost',
      message: 'Delete this Cost?',
      onConfirm: async () => {
        try {
          const nowIso = new Date().toISOString();
          const batch = writeBatch(db);
          batch.set(
            doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id),
            { id: c.id, isDeleted: true, updatedAt: nowIso },
            { merge: true }
          );

          const urlsToDelete = extractStorageUrls(c);
          if (urlsToDelete.length > 0) {
            deleteStorageFiles(urlsToDelete).catch(console.error);
          }
          batch.commit().catch((e) => console.error('Batch commit cost delete failed:', e));

          undoManager.push({
            description: `Delete Cost`,
            revert: async () => {
              setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id), c);
            },
          });
        } catch (e) {
          console.error(e);
        }
      },
    });
  };

  const handleUpdateCost = async (c: Cost, field: keyof Cost, value: any) => {
    try {
      const updates: any = { [field]: value, updatedAt: new Date().toISOString() };

      if (field === 'firstPaid') updates.firstPaidAt = new Date().toISOString();
      if (field === 'secondPaid') updates.secondPaidAt = new Date().toISOString();
      if (field === 'thirdPaid') updates.thirdPaidAt = new Date().toISOString();

      const newCostData = { ...c, ...updates };
      if (
        newCostData.projectYear !== undefined &&
        newCostData.projectYear !== null &&
        newCostData.projectYear !== '' &&
        !isNaN(Number(newCostData.projectYear))
      ) {
        newCostData.projectYear = Number(newCostData.projectYear);
      }

      Object.keys(newCostData).forEach((key) => {
        if ((newCostData as any)[key] === undefined) {
          delete (newCostData as any)[key];
        }
      });

      // Optimistically update the UI to prevent input lag
      useAppStore.getState().optimisticUpdateCosts([newCostData]);

      setDoc(
        doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id),
        newCostData
      );

      undoManager.push({
        description: `Update Cost: ${field}`,
        revert: async () => {
          useAppStore.getState().optimisticUpdateCosts([c]);
          setDoc(
            doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id),
            c
          );
        },
      });
    } catch (e) {
      console.error(e);
    }
  };

  return {
    confirmModal,
    setConfirmModal,
    handleAddCost,
    handleDeleteCost,
    handleUpdateCost,
  };
}
