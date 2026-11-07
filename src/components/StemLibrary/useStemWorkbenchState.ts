import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useEnrichedData } from '../../hooks/useEnrichedData';
import {
  StemAnchorMode,
  StemConnectorType,
  StemLibraryBlockTemplate,
  StemPresetPackage,
  StemWorkbenchBlock,
} from './stemLibraryTypes';
import {
  deleteCustomStemPreset,
  getAllStemPartsBin,
  getAllStemPresets,
  hydrateStemConfigFromFirestoreOnce,
  subscribeStemLibraryConfig,
} from './stemLibraryConfigService';
import {
  applyStemWorkbenchToProject,
  computeWorkbenchSchedule,
} from './stemAutoWiringEngine';

const CONNECTOR_CYCLE: StemConnectorType[] = ['FS', 'SS', 'FF', 'NONE'];

export function makeWorkbenchBlocksFromPreset(preset: StemPresetPackage): StemWorkbenchBlock[] {
  return preset.blocks.map((b, idx) => ({
    instanceId: `wb-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
    templateId: `${preset.id}-${idx}`,
    name: b.name,
    duration: Number(b.duration) || 2,
    department: b.department,
    party: b.party || 'PMO',
    delegation: Boolean(b.delegation),
    connectorToPrev: idx === 0 ? 'FS' : b.connectorToPrev || 'FS',
    lagDays: b.lagDays || 0,
  }));
}

export function useStemWorkbenchState(params: {
  isOpen: boolean;
  onClose: () => void;
  initialProjectId?: string;
  initialProjectCode?: string;
}) {
  const { isOpen, onClose, initialProjectId, initialProjectCode } = params;
  const { enrichedProjects: projects } = useEnrichedData();
  const allTasks = useAppStore((s) => s.tasks);
  const currentUser = useAppStore((s) => s.currentUser);
  const fixedProjectCode = useAppStore((s) => s.fixedProjectCode);
  const detailTabFilterCode = useAppStore((s) => s.detailTabFilterCode);

  const [configTick, setConfigTick] = useState(0);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [activePresetId, setActivePresetId] = useState<string | null>('preset-fnb-12');
  const [anchorMode, setAnchorMode] = useState<StemAnchorMode>('forward');
  const [customAnchorDate, setCustomAnchorDate] = useState<string>('');
  const [workbenchBlocks, setWorkbenchBlocks] = useState<StemWorkbenchBlock[]>(() => {
    const presets = getAllStemPresets();
    return presets.length > 0 ? makeWorkbenchBlocksFromPreset(presets[0]) : [];
  });
  const [appendOnPresetClick, setAppendOnPresetClick] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    hydrateStemConfigFromFirestoreOnce().catch(() => {});
    return subscribeStemLibraryConfig(() => setConfigTick((c) => c + 1));
  }, [isOpen]);

  const presets = useMemo(() => {
    void configTick;
    return getAllStemPresets();
  }, [configTick]);

  const partsBin = useMemo(() => {
    void configTick;
    return getAllStemPartsBin();
  }, [configTick]);

  useEffect(() => {
    if (!isOpen || !projects.length) return;
    if (initialProjectId) {
      const byId = projects.find((p) => p.id === initialProjectId);
      if (byId) {
        setSelectedProjectId(byId.id);
        return;
      }
    }
    const targetCode = (initialProjectCode || fixedProjectCode || detailTabFilterCode || '')
      .trim()
      .toLowerCase();
    if (targetCode) {
      const byCode = projects.find((p) => String(p.code || '').trim().toLowerCase() === targetCode);
      if (byCode) {
        setSelectedProjectId(byCode.id);
        return;
      }
    }
    if (!selectedProjectId || !projects.some((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(projects[0].id);
    }
  }, [isOpen, initialProjectId, initialProjectCode, fixedProjectCode, detailTabFilterCode, projects, selectedProjectId]);

  const targetProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || projects[0] || null,
    [projects, selectedProjectId]
  );

  useEffect(() => {
    if (!targetProject) return;
    if (anchorMode === 'backward') {
      const openingRaw =
        targetProject.opening || targetProject.handover || targetProject.computedTakCompl || '';
      setCustomAnchorDate(openingRaw ? openingRaw.slice(0, 10) : '');
    } else {
      const startRaw = targetProject.computedTakStart || targetProject.handover || '';
      setCustomAnchorDate(startRaw ? startRaw.slice(0, 10) : '');
    }
  }, [targetProject, anchorMode]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const schedule = useMemo(
    () =>
      computeWorkbenchSchedule(
        workbenchBlocks,
        targetProject,
        allTasks,
        anchorMode,
        customAnchorDate ? `${customAnchorDate}T09:00` : undefined
      ),
    [workbenchBlocks, targetProject, allTasks, anchorMode, customAnchorDate]
  );

  const handleSelectPreset = useCallback(
    (preset: StemPresetPackage) => {
      setActivePresetId(preset.id);
      const nextBlocks = makeWorkbenchBlocksFromPreset(preset);
      setWorkbenchBlocks((prev) => (appendOnPresetClick ? [...prev, ...nextBlocks] : nextBlocks));
      setErrorMsg(null);
    },
    [appendOnPresetClick]
  );

  const handleDeleteCustomPreset = useCallback(
    async (presetId: string) => {
      await deleteCustomStemPreset(presetId, currentUser?.email);
      if (activePresetId === presetId) {
        setActivePresetId('preset-fnb-12');
      }
    },
    [activePresetId, currentUser?.email]
  );

  const handleAddPart = useCallback((part: StemLibraryBlockTemplate) => {
    const newBlock: StemWorkbenchBlock = {
      instanceId: `wb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      templateId: part.id,
      name: part.name,
      duration: Number(part.defaultDuration) || 2,
      department: part.department,
      party: part.party || 'PMO',
      delegation: Boolean(part.delegation),
      connectorToPrev: part.defaultConnector || 'FS',
      lagDays: part.lagDays || 0,
    };
    setWorkbenchBlocks((prev) => [...prev, newBlock]);
  }, []);

  const handleCycleConnector = useCallback(
    (instanceId: string, explicitType?: StemConnectorType) => {
      setWorkbenchBlocks((prev) =>
        prev.map((blk) => {
          if (blk.instanceId !== instanceId) return blk;
          if (explicitType) return { ...blk, connectorToPrev: explicitType };
          const idx = CONNECTOR_CYCLE.indexOf(blk.connectorToPrev);
          const nextType = CONNECTOR_CYCLE[(idx + 1) % CONNECTOR_CYCLE.length];
          return { ...blk, connectorToPrev: nextType };
        })
      );
    },
    []
  );

  const handleChangeDuration = useCallback((instanceId: string, nextDuration: number) => {
    setWorkbenchBlocks((prev) =>
      prev.map((blk) => (blk.instanceId === instanceId ? { ...blk, duration: nextDuration } : blk))
    );
  }, []);

  const handleChangeName = useCallback((instanceId: string, nextName: string) => {
    setWorkbenchBlocks((prev) =>
      prev.map((blk) => (blk.instanceId === instanceId ? { ...blk, name: nextName } : blk))
    );
  }, []);

  const handleChangeParty = useCallback((instanceId: string, nextParty: string) => {
    setWorkbenchBlocks((prev) =>
      prev.map((blk) => (blk.instanceId === instanceId ? { ...blk, party: nextParty } : blk))
    );
  }, []);

  const handleToggleDelegation = useCallback((instanceId: string) => {
    setWorkbenchBlocks((prev) =>
      prev.map((blk) =>
        blk.instanceId === instanceId ? { ...blk, delegation: !blk.delegation } : blk
      )
    );
  }, []);

  const handleMoveOrder = useCallback((index: number, direction: 'up' | 'down') => {
    setWorkbenchBlocks((prev) => {
      const targetIdx = direction === 'up' ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  }, []);

  const handleRemoveBlock = useCallback((instanceId: string) => {
    setWorkbenchBlocks((prev) => prev.filter((b) => b.instanceId !== instanceId));
  }, []);

  const handleAutoParallelOptimize = useCallback(() => {
    setWorkbenchBlocks((prev) =>
      prev.map((b, idx) => {
        if (
          idx > 0 &&
          b.connectorToPrev === 'FS' &&
          (b.department === 'mep_pccc' || b.department === 'it_pos_handover')
        ) {
          return { ...b, connectorToPrev: 'SS' };
        }
        return b;
      })
    );
  }, []);

  const handleApplyToProject = async () => {
    if (!targetProject || schedule.blocks.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await applyStemWorkbenchToProject({
        project: targetProject,
        computedBlocks: schedule.blocks,
        userEmail: currentUser?.email,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to wire tasks into project.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    projects,
    targetProject,
    setSelectedProjectId,
    presets,
    partsBin,
    activePresetId,
    anchorMode,
    setAnchorMode,
    customAnchorDate,
    setCustomAnchorDate,
    appendOnPresetClick,
    setAppendOnPresetClick,
    setWorkbenchBlocks,
    isSubmitting,
    errorMsg,
    schedule,
    handleSelectPreset,
    handleDeleteCustomPreset,
    handleAddPart,
    handleCycleConnector,
    handleChangeDuration,
    handleChangeName,
    handleChangeParty,
    handleToggleDelegation,
    handleMoveOrder,
    handleRemoveBlock,
    handleAutoParallelOptimize,
    handleApplyToProject,
  };
}
