import React, { useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { UnitShape, MapVersion } from '../types';
import { extractR2Key } from '../../../lib/r2Upload';
import { deleteR2StorageFiles } from '../../../../../lib/r2StorageUtils';

export const convertPdfToImage = async (file: File): Promise<string> => {
  try {
    const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
      cMapPacked: true,
    });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);

    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const maxDimension = Math.max(unscaledViewport.width, unscaledViewport.height);
    const targetMaxDimension = 2400;
    const scale = maxDimension > targetMaxDimension ? targetMaxDimension / maxDimension : 2.0;

    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (context) {
      await page.render({ canvasContext: context, viewport } as any).promise;
      return canvas.toDataURL('image/jpeg', 0.8);
    }
    throw new Error('Could not create canvas context');
  } catch (error: any) {
    console.error('PDF Processing details:', error);
    throw new Error(`PDF Error: ${error.message || 'Unknown error'}`);
  }
};

interface UseEditTabHandlersParams {
  units: UnitShape[];
  filteredUnits: UnitShape[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  handleSetUnitsWithHistory: (units: UnitShape[]) => void;
  versions: MapVersion[];
  setVersions: (v: MapVersion[]) => void;
  activeVersionId: string | null;
  setActiveVersionId: (id: string | null) => void;
  activeVersion: MapVersion | undefined;
  effectiveYear: string;
  localImageUrl: string | null;
  setLocalImageUrl: (url: string | null) => void;
  setIsLoading: (v: boolean) => void;
  setIsLocked: (v: boolean) => void;
  scale: number;
  setScale: React.Dispatch<React.SetStateAction<number>>;
  position: { x: number; y: number };
  setPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  bgRotation: number;
  setBgRotation: React.Dispatch<React.SetStateAction<number>>;
  imagePos: { x: number; y: number };
  imageScale: number;
  librarySearchTerm: string;
  stageRef: React.MutableRefObject<any>;
}

export function useEditTabHandlers({
  units,
  filteredUnits,
  selectedId,
  setSelectedId,
  handleSetUnitsWithHistory,
  versions,
  setVersions,
  activeVersionId,
  setActiveVersionId,
  activeVersion,
  effectiveYear,
  localImageUrl,
  setLocalImageUrl,
  setIsLoading,
  setIsLocked,
  scale,
  setScale,
  position,
  setPosition,
  bgRotation,
  setBgRotation,
  imagePos,
  imageScale,
  librarySearchTerm,
  stageRef,
}: UseEditTabHandlersParams) {
  const wheelRafRef = useRef<number | null>(null);
  const pinchRafRef = useRef<number | null>(null);
  const wheelSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWheelDeltaRef = useRef<number>(0);
  const lastWheelPointerRef = useRef<{ x: number; y: number } | null>(null);
  const pinchDistRef = useRef<number>(0);
  const pinchCenterRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    return () => {
      if (wheelRafRef.current !== null) cancelAnimationFrame(wheelRafRef.current);
      if (pinchRafRef.current !== null) cancelAnimationFrame(pinchRafRef.current);
      if (wheelSyncTimerRef.current) clearTimeout(wheelSyncTimerRef.current);
    };
  }, []);

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setIsLoading(true);
      try {
        if (file.type === 'application/pdf') {
          const imageUrl = await convertPdfToImage(file);
          setLocalImageUrl(imageUrl);
        } else {
          const objectUrl = URL.createObjectURL(file);
          setLocalImageUrl(objectUrl);
        }
        setIsLocked(false);
        setActiveVersionId(null);
      } catch (err: any) {
        console.error('Error processing file:', err);
        alert(`Có lỗi khi xử lý file: ${err.message || 'Vui lòng thử lại'}`);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    lastWheelPointerRef.current = pointer;
    pendingWheelDeltaRef.current += e.evt.deltaY;

    if (wheelRafRef.current === null) {
      wheelRafRef.current = requestAnimationFrame(() => {
        wheelRafRef.current = null;
        const curStage = stageRef.current;
        const ptr = lastWheelPointerRef.current;
        if (!curStage || !ptr) return;

        const deltaY = pendingWheelDeltaRef.current;
        pendingWheelDeltaRef.current = 0;

        const oldScale = curStage.scaleX();
        const zoomFactor = Math.exp(-deltaY * 0.0008);
        const newScale = Math.max(0.05, Math.min(10, oldScale * zoomFactor));

        const mousePointTo = {
          x: (ptr.x - curStage.x()) / oldScale,
          y: (ptr.y - curStage.y()) / oldScale,
        };
        const newPos = {
          x: ptr.x - mousePointTo.x * newScale,
          y: ptr.y - mousePointTo.y * newScale,
        };

        curStage.scale({ x: newScale, y: newScale });
        curStage.position(newPos);
        curStage.batchDraw();

        if (wheelSyncTimerRef.current) clearTimeout(wheelSyncTimerRef.current);
        wheelSyncTimerRef.current = setTimeout(() => {
          wheelSyncTimerRef.current = null;
          if (!stageRef.current) return;
          stageRef.current.batchDraw();
          setScale(stageRef.current.scaleX());
          setPosition({ x: stageRef.current.x(), y: stageRef.current.y() });
        }, 120);
      });
    }
  };

  const handleTouchMove = (e: any) => {
    const touch1 = e.evt.touches?.[0];
    const touch2 = e.evt.touches?.[1];
    if (!touch1 || !touch2) return;
    e.evt.preventDefault();

    const curStage = stageRef.current;
    if (!curStage) return;
    if (curStage.isDragging()) curStage.stopDrag();

    const p1 = { x: touch1.clientX, y: touch1.clientY };
    const p2 = { x: touch2.clientX, y: touch2.clientY };
    const newCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

    if (!pinchDistRef.current || !pinchCenterRef.current) {
      pinchDistRef.current = dist;
      pinchCenterRef.current = newCenter;
      return;
    }

    if (pinchRafRef.current !== null) return;
    pinchRafRef.current = requestAnimationFrame(() => {
      pinchRafRef.current = null;
      const st = stageRef.current;
      const lastCenter = pinchCenterRef.current;
      const lastDist = pinchDistRef.current;
      if (!st || !lastCenter || !lastDist) return;

      const rect = st.container().getBoundingClientRect();
      const localCenter = { x: newCenter.x - rect.left, y: newCenter.y - rect.top };
      const oldScale = st.scaleX();
      const pointTo = {
        x: (localCenter.x - st.x()) / oldScale,
        y: (localCenter.y - st.y()) / oldScale,
      };
      const newScale = Math.max(0.05, Math.min(10, oldScale * (dist / lastDist)));
      const dx = newCenter.x - lastCenter.x;
      const dy = newCenter.y - lastCenter.y;

      st.scale({ x: newScale, y: newScale });
      st.position({
        x: localCenter.x - pointTo.x * newScale + dx,
        y: localCenter.y - pointTo.y * newScale + dy,
      });
      st.batchDraw();

      pinchDistRef.current = dist;
      pinchCenterRef.current = newCenter;
    });
  };

  const handleTouchEnd = () => {
    if (pinchDistRef.current !== 0) {
      pinchDistRef.current = 0;
      pinchCenterRef.current = null;
      if (stageRef.current) {
        stageRef.current.batchDraw();
        setScale(stageRef.current.scaleX());
        setPosition({ x: stageRef.current.x(), y: stageRef.current.y() });
      }
    }
  };

  const handleDelete = () => {
    if (selectedId) {
      handleSetUnitsWithHistory(units.filter((u) => u.id !== selectedId));
      setSelectedId(null);
    }
  };

  const handleRotate = () => {
    if (selectedId) {
      handleSetUnitsWithHistory(
        units.map((u) =>
          u.id === selectedId ? { ...u, rotation: ((u.rotation || 0) + 90) % 360 } : u
        )
      );
    }
  };

  const handleRotateBackground = () => {
    setBgRotation((prev) => (prev + 90) % 360);
  };

  const handleExportUnits = () => {
    if (units.length === 0) {
      alert('No units to save.');
      return;
    }
    const data = JSON.stringify(units, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `map_units_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleReplaceBackground = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeVersionId) return;

    setIsLoading(true);
    try {
      const currentVersion = versions.find((v) => v.id === activeVersionId);
      const oldBgKey = extractR2Key(currentVersion?.backgroundUrl);

      let imageUrl = '';
      if (file.type === 'application/pdf') {
        imageUrl = await convertPdfToImage(file);
      } else {
        imageUrl = URL.createObjectURL(file);
      }
      setLocalImageUrl(imageUrl);
      setVersions(
        versions.map((v) => (v.id === activeVersionId ? { ...v, backgroundUrl: imageUrl } : v))
      );

      if (oldBgKey) {
        const isUsedElsewhere = versions.some(
          (v) => v.id !== activeVersionId && extractR2Key(v.backgroundUrl) === oldBgKey
        );
        if (!isUsedElsewhere) {
          deleteR2StorageFiles([oldBgKey]).catch((err) =>
            console.warn('[R2 Auto-GC] Could not delete replaced image:', err)
          );
        }
      }
    } catch (err) {
      console.error(err);
      alert('Error updating background');
    } finally {
      setIsLoading(false);
      e.target.value = '';
    }
  };

  const handleReloadExternalBackground = () => {
    if (
      !localImageUrl ||
      localImageUrl.startsWith('data:') ||
      localImageUrl.startsWith('blob:')
    )
      return;
    const baseUrl = localImageUrl.split('?')[0];
    const updatedUrl = `${baseUrl}?v=${Date.now()}`;
    setLocalImageUrl(updatedUrl);
    setVersions(
      versions.map((v) => (v.id === activeVersionId ? { ...v, backgroundUrl: updatedUrl } : v))
    );
  };

  const handleImportUnits = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedContent = event.target?.result as string;
        const importedUnits = JSON.parse(importedContent);
        if (Array.isArray(importedUnits)) {
          if (confirm('Do you want to REPLACE current units? (Cancel to Merge instead)')) {
            handleSetUnitsWithHistory(importedUnits);
          } else {
            handleSetUnitsWithHistory([...units, ...importedUnits]);
          }
        } else {
          alert('Invalid file format. Expected an array of units.');
        }
      } catch (error) {
        alert('Error parsing file: ' + error);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeleteAll = () => {
    const unitsToProcess = filteredUnits.filter((u) => !u.locked);
    if (unitsToProcess.length === 0) return;

    const label = librarySearchTerm ? `matching "${librarySearchTerm}"` : 'all';
    if (
      confirm(`Are you sure you want to delete ${unitsToProcess.length} unlocked units ${label}?`)
    ) {
      const idsToDelete = new Set(unitsToProcess.map((u) => u.id));
      handleSetUnitsWithHistory(units.filter((u) => !idsToDelete.has(u.id)));
      if (selectedId && idsToDelete.has(selectedId)) {
        setSelectedId(null);
      }
    }
  };

  const handleToggleAllVisibility = () => {
    const unitsToProcess = filteredUnits.filter((u) => !u.locked);
    if (unitsToProcess.length === 0) return;

    const allVisible = unitsToProcess.every((u) => u.visible);
    const newVisibility = !allVisible;

    const idsToUpdate = new Set(unitsToProcess.map((u) => u.id));
    handleSetUnitsWithHistory(
      units.map((u) => (idsToUpdate.has(u.id) ? { ...u, visible: newVisibility } : u))
    );
  };

  const handleToggleAllLock = () => {
    if (filteredUnits.length === 0) return;

    const allLocked = filteredUnits.every((u) => u.locked);
    const newLockState = !allLocked;

    const idsToUpdate = new Set(filteredUnits.map((u) => u.id));
    handleSetUnitsWithHistory(
      units.map((u) => (idsToUpdate.has(u.id) ? { ...u, locked: newLockState } : u))
    );
  };

  const handleCreateVersion = () => {
    const name = prompt('Nhập tên phiên bản (Version Name) cho bản đồ này:');
    if (!name) return;

    const existingVer = versions.find(
      (v) => (v.location === activeVersion?.location || !v.location) && (v.groups || []).length > 0
    );
    const inheritedGroups = existingVer
      ? existingVer.groups.map((g) => ({
          ...g,
          id: uuidv4(),
          rules: g.rules ? g.rules.map((r) => ({ ...r })) : [],
        }))
      : [];

    const newVersion: MapVersion = {
      id: uuidv4(),
      name,
      backgroundUrl: localImageUrl,
      backgroundScale: scale,
      backgroundPos: position,
      backgroundRotation: bgRotation,
      imagePos,
      imageScale,
      groups: inheritedGroups,
      groupMappings: {},
      isDynamicActive: true,
      store: activeVersion?.store,
      location: activeVersion?.location,
      year: effectiveYear,
    };

    setVersions([...versions, newVersion]);
    setActiveVersionId(newVersion.id);
    setIsLocked(true);
  };

  const handleUpdateVersion = () => {
    if (!activeVersionId) return;
    setVersions(
      versions.map((v) =>
        v.id === activeVersionId
          ? {
              ...v,
              backgroundScale: scale,
              backgroundPos: position,
              backgroundRotation: bgRotation,
              imagePos,
              imageScale,
            }
          : v
      )
    );
    setIsLocked(true);
    alert('Đã cập nhật tỷ lệ/vị trí cho phiên bản này!');
  };

  return {
    onDrop,
    handleWheel,
    handleTouchMove,
    handleTouchEnd,
    handleDelete,
    handleRotate,
    handleRotateBackground,
    handleExportUnits,
    handleReplaceBackground,
    handleReloadExternalBackground,
    handleImportUnits,
    handleDeleteAll,
    handleToggleAllVisibility,
    handleToggleAllLock,
    handleCreateVersion,
    handleUpdateVersion,
  };
}
