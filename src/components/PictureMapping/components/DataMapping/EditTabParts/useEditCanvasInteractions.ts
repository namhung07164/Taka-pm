import React, { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { UnitShape, ShapeType, MapVersion } from '../types';

interface UseEditCanvasDrawingParams {
  units: UnitShape[];
  activeTool: ShapeType | 'select' | 'edit-bg';
  setActiveTool: (tool: ShapeType | 'select' | 'edit-bg') => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  alignStep: 'none' | 'bg1' | 'bg2' | 'target1' | 'target2';
  setAlignStep: React.Dispatch<React.SetStateAction<'none' | 'bg1' | 'bg2' | 'target1' | 'target2'>>;
  alignPts: {
    bg1?: { x: number; y: number };
    bg2?: { x: number; y: number };
    target1?: { x: number; y: number };
  };
  setAlignPts: React.Dispatch<
    React.SetStateAction<{
      bg1?: { x: number; y: number };
      bg2?: { x: number; y: number };
      target1?: { x: number; y: number };
    }>
  >;
  imagePos: { x: number; y: number };
  setImagePos: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  imageScale: number;
  setImageScale: React.Dispatch<React.SetStateAction<number>>;
  magneticGrid: boolean;
  gridSize: number;
  handleSetUnitsWithHistory: (units: UnitShape[]) => void;
  openNamingModal: () => Promise<string>;
  stageRef: React.MutableRefObject<any>;
  trRef: React.MutableRefObject<any>;
}

export function useEditCanvasDrawing({
  units,
  activeTool,
  setActiveTool,
  selectedId,
  setSelectedId,
  alignStep,
  setAlignStep,
  alignPts,
  setAlignPts,
  imagePos,
  setImagePos,
  imageScale,
  setImageScale,
  magneticGrid,
  gridSize,
  handleSetUnitsWithHistory,
  openNamingModal,
  stageRef,
  trRef,
}: UseEditCanvasDrawingParams) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [newShape, setNewShape] = useState<Partial<UnitShape> | null>(null);
  const drawRafRef = useRef<number | null>(null);

  const snapToGrid = (val: number) => (!magneticGrid ? val : Math.round(val / gridSize) * gridSize);

  const editCanvasStateRef = useRef({
    units,
    activeTool,
    magneticGrid,
    gridSize,
    handleSetUnitsWithHistory,
  });
  editCanvasStateRef.current = {
    units,
    activeTool,
    magneticGrid,
    gridSize,
    handleSetUnitsWithHistory,
  };

  const handleSelectCanvasUnit = useCallback(
    (unitId: string) => {
      if (editCanvasStateRef.current.activeTool === 'select') setSelectedId(unitId);
    },
    [setSelectedId]
  );

  const handleDragEndCanvasUnit = useCallback((unitId: string, rawX: number, rawY: number) => {
    const {
      units: curUnits,
      magneticGrid: mag,
      gridSize: gs,
      handleSetUnitsWithHistory: commitUnits,
    } = editCanvasStateRef.current;
    const snap = (v: number) => (mag ? Math.round(v / gs) * gs : v);
    commitUnits(
      curUnits.map((u) => (u.id === unitId ? { ...u, x: snap(rawX), y: snap(rawY) } : u))
    );
  }, []);

  const handleTransformEndCanvasUnit = useCallback((unit: UnitShape, node: any) => {
    const {
      units: curUnits,
      magneticGrid: mag,
      gridSize: gs,
      handleSetUnitsWithHistory: commitUnits,
    } = editCanvasStateRef.current;
    const snap = (v: number) => (mag ? Math.round(v / gs) * gs : v);
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);

    if (unit.type === 'rect') {
      commitUnits(
        curUnits.map((u) =>
          u.id === unit.id
            ? {
                ...u,
                x: snap(node.x()),
                y: snap(node.y()),
                width: Math.max(5, snap((node.width() as number) * scaleX)),
                height: Math.max(5, snap((node.height() as number) * scaleY)),
                rotation: node.rotation(),
              }
            : u
        )
      );
    } else if (unit.type === 'circle') {
      commitUnits(
        curUnits.map((u) =>
          u.id === unit.id
            ? {
                ...u,
                x: snap(node.x()),
                y: snap(node.y()),
                radius: Math.max(5, snap(((node as any).radius() as number) * scaleX)),
                rotation: node.rotation(),
              }
            : u
        )
      );
    } else if (unit.type === 'polygon') {
      const pts = unit.points || [];
      const newPoints = pts.map((p, i) => (i % 2 === 0 ? p * scaleX : p * scaleY));
      commitUnits(
        curUnits.map((u) =>
          u.id === unit.id
            ? { ...u, x: snap(node.x()), y: snap(node.y()), points: newPoints, rotation: node.rotation() }
            : u
        )
      );
    }
  }, []);

  const handleMouseDown = (e: any) => {
    if (alignStep !== 'none') {
      const stage = e.target.getStage();
      const pos = stage.getRelativePointerPosition();
      if (window.confirm('Xác nhận chọn điểm này?')) {
        if (alignStep === 'bg1') {
          setAlignPts((prev) => ({ ...prev, bg1: pos }));
          setAlignStep('bg2');
        } else if (alignStep === 'bg2') {
          setAlignPts((prev) => ({ ...prev, bg2: pos }));
          setAlignStep('target1');
        } else if (alignStep === 'target1') {
          setAlignPts((prev) => ({ ...prev, target1: pos }));
          setAlignStep('target2');
        } else if (alignStep === 'target2') {
          const target2 = pos;
          const bg1 = alignPts.bg1!;
          const bg2 = alignPts.bg2!;
          const target1 = alignPts.target1!;
          const p1_local = { x: (bg1.x - imagePos.x) / imageScale, y: (bg1.y - imagePos.y) / imageScale };
          const p2_local = { x: (bg2.x - imagePos.x) / imageScale, y: (bg2.y - imagePos.y) / imageScale };
          const distLocal = Math.hypot(p1_local.x - p2_local.x, p1_local.y - p2_local.y);
          const distTarget = Math.hypot(target1.x - target2.x, target1.y - target2.y);
          if (distLocal > 0) {
            const newScale = distTarget / distLocal;
            setImageScale(newScale);
            setImagePos({ x: target1.x - p1_local.x * newScale, y: target1.y - p1_local.y * newScale });
          }
          setAlignStep('none');
          setAlignPts({});
        }
      }
      return;
    }

    if (activeTool === 'select') {
      const clickedOnEmpty = e.target === e.target.getStage() || e.target.getName() === 'bgImage';
      if (clickedOnEmpty) setSelectedId(null);
      return;
    }

    const pos = e.target.getStage().getRelativePointerPosition();
    const startX = snapToGrid(pos.x);
    const startY = snapToGrid(pos.y);
    setIsDrawing(true);

    if (activeTool === 'rect') {
      setNewShape({ type: 'rect', x: startX, y: startY, width: 0, height: 0, id: uuidv4() });
    } else if (activeTool === 'circle') {
      setNewShape({ type: 'circle', x: startX, y: startY, radius: 0, id: uuidv4() });
    } else if (activeTool === 'polygon') {
      let finalX = startX;
      let finalY = startY;
      if (!isDrawing) {
        setIsDrawing(true);
        setNewShape({ type: 'polygon', x: 0, y: 0, points: [finalX, finalY, finalX, finalY], id: uuidv4() });
      } else {
        const pts = newShape!.points || [];
        if (e.evt.shiftKey && pts.length >= 4) {
          const prevX = pts[pts.length - 4];
          const prevY = pts[pts.length - 3];
          if (Math.abs(finalX - prevX) > Math.abs(finalY - prevY)) finalY = prevY;
          else finalX = prevX;
        }
        const dist = Math.hypot(finalX - pts[0], finalY - pts[1]);
        if (dist < 15 && pts.length >= 8) {
          setIsDrawing(false);
          const finalPoints = pts.slice(0, pts.length - 2);
          openNamingModal()
            .then((name) => {
              if (name) {
                handleSetUnitsWithHistory([
                  ...units,
                  { ...newShape, points: finalPoints, name, visible: true, fill: '#3b82f6', opacity: 0.4 } as UnitShape,
                ]);
                setActiveTool('select');
              }
            })
            .catch(() => {});
          setNewShape(null);
        } else {
          const newPts = [...pts];
          newPts[newPts.length - 2] = finalX;
          newPts[newPts.length - 1] = finalY;
          newPts.push(finalX, finalY);
          setNewShape({ ...newShape!, points: newPts });
        }
      }
    }
  };

  useEffect(() => {
    return () => {
      if (drawRafRef.current !== null) cancelAnimationFrame(drawRafRef.current);
    };
  }, []);

  const handleMouseMove = (e: any) => {
    if (!isDrawing || !newShape) return;
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (!pos) return;
    const currX = snapToGrid(pos.x);
    const currY = snapToGrid(pos.y);
    const isShift = Boolean(e.evt?.shiftKey);

    if (drawRafRef.current !== null) cancelAnimationFrame(drawRafRef.current);
    drawRafRef.current = requestAnimationFrame(() => {
      drawRafRef.current = null;
      setNewShape((prev) => {
        if (!prev) return prev;
        if (prev.type === 'rect') {
          return { ...prev, width: currX - (prev.x || 0), height: currY - (prev.y || 0) };
        } else if (prev.type === 'circle') {
          return { ...prev, radius: Math.hypot(currX - (prev.x || 0), currY - (prev.y || 0)) };
        } else if (prev.type === 'polygon') {
          let finalX = currX;
          let finalY = currY;
          const pts = prev.points || [];
          if (pts.length >= 4 && isShift) {
            const prevX = pts[pts.length - 4];
            const prevY = pts[pts.length - 3];
            if (Math.abs(finalX - prevX) > Math.abs(finalY - prevY)) finalY = prevY;
            else finalX = prevX;
          }
          if (pts.length >= 2) {
            const newPts = [...pts];
            newPts[newPts.length - 2] = finalX;
            newPts[newPts.length - 1] = finalY;
            return { ...prev, points: newPts };
          }
        }
        return prev;
      });
    });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !newShape || activeTool === 'polygon') return;
    setIsDrawing(false);
    const finalShape = { ...newShape };
    if (finalShape.type === 'rect' && finalShape.width && finalShape.height) {
      if (finalShape.width < 0) {
        finalShape.x = (finalShape.x || 0) + finalShape.width;
        finalShape.width = Math.abs(finalShape.width);
      }
      if (finalShape.height < 0) {
        finalShape.y = (finalShape.y || 0) + finalShape.height;
        finalShape.height = Math.abs(finalShape.height);
      }
    }
    const isValid =
      (finalShape.type === 'rect' && finalShape.width && finalShape.height && Math.abs(finalShape.width) > 5) ||
      (finalShape.type === 'circle' && finalShape.radius && finalShape.radius > 5);
    if (isValid) {
      openNamingModal()
        .then((name) => {
          if (name) {
            handleSetUnitsWithHistory([
              ...units,
              { ...finalShape, name, visible: true, fill: '#3b82f6', opacity: 0.4 } as UnitShape,
            ]);
            setActiveTool('select');
          }
        })
        .catch(() => {});
    }
    setNewShape(null);
  };

  const handleDoubleClick = () => {
    if (activeTool === 'polygon' && isDrawing && newShape) {
      setIsDrawing(false);
      if (newShape.points && newShape.points.length >= 8) {
        const finalPoints = newShape.points.slice(0, newShape.points.length - 2);
        openNamingModal()
          .then((name) => {
            if (name) {
              handleSetUnitsWithHistory([
                ...units,
                { ...newShape, points: finalPoints, name, visible: true, fill: '#3b82f6', opacity: 0.4 } as UnitShape,
              ]);
              setActiveTool('select');
            }
          })
          .catch(() => {});
      }
      setNewShape(null);
    }
  };

  useEffect(() => {
    if (activeTool === 'select' && selectedId && trRef.current && stageRef.current) {
      try {
        const node = stageRef.current.findOne((n: any) => n.id && n.id() === selectedId);
        trRef.current.nodes(node ? [node] : []);
        trRef.current.getLayer()?.batchDraw();
      } catch {
        trRef.current.nodes([]);
      }
    } else if (trRef.current) {
      try {
        trRef.current.nodes([]);
        trRef.current.getLayer()?.batchDraw();
      } catch {
        // ignore
      }
    }
  }, [selectedId, activeTool, units, stageRef, trRef]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawing) {
        setIsDrawing(false);
        setNewShape(null);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isDrawing]);

  return {
    isDrawing,
    newShape,
    handleSelectCanvasUnit,
    handleDragEndCanvasUnit,
    handleTransformEndCanvasUnit,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
  };
}

export function useEditCopyBackground({
  versions,
  activeVersionId,
  activeVersion,
  effectiveYear,
  showAllVersionsForCopy,
  copyBgSearchTerm,
  setLocalImageUrl,
  setScale,
  setPosition,
  setBgRotation,
  setImagePos,
  setImageScale,
  setIsLocked,
  setVersions,
  setIsCopyBgModalOpen,
}: {
  versions: MapVersion[];
  activeVersionId: string | null;
  activeVersion: MapVersion | undefined;
  effectiveYear: string;
  showAllVersionsForCopy: boolean;
  copyBgSearchTerm: string;
  setLocalImageUrl: (v: string | null) => void;
  setScale: (v: number) => void;
  setPosition: (v: { x: number; y: number }) => void;
  setBgRotation: (v: number) => void;
  setImagePos: (v: { x: number; y: number }) => void;
  setImageScale: (v: number) => void;
  setIsLocked: (v: boolean) => void;
  setVersions: (v: MapVersion[]) => void;
  setIsCopyBgModalOpen: (v: boolean) => void;
}) {
  const availableCopyVersions = React.useMemo(() => {
    const currentStore = activeVersion?.store;
    const currentLoc = activeVersion?.location;
    const currentYear = String(activeVersion?.year || effectiveYear).trim();

    return versions.filter((v) => {
      if (activeVersionId && v.id === activeVersionId) return false;
      if (!v.backgroundUrl) return false;
      if (!showAllVersionsForCopy && (currentStore || currentLoc || currentYear)) {
        const matchStore = !currentStore || !v.store || v.store === currentStore;
        const matchLoc = !currentLoc || !v.location || v.location === currentLoc;
        const matchYear = !currentYear || !v.year || String(v.year).trim() === currentYear;
        return matchStore && matchLoc && matchYear;
      }
      return true;
    });
  }, [
    versions,
    activeVersionId,
    activeVersion?.store,
    activeVersion?.location,
    activeVersion?.year,
    effectiveYear,
    showAllVersionsForCopy,
  ]);

  const filteredCopyVersions = React.useMemo(() => {
    if (!copyBgSearchTerm.trim()) return availableCopyVersions;
    const q = copyBgSearchTerm.toLowerCase().trim();
    return availableCopyVersions.filter(
      (v) =>
        (v.name || '').toLowerCase().includes(q) ||
        (v.year || '').toLowerCase().includes(q) ||
        (v.location || '').toLowerCase().includes(q) ||
        (v.store || '').toLowerCase().includes(q)
    );
  }, [availableCopyVersions, copyBgSearchTerm]);

  const handleCopyBackgroundFromVersion = (sourceVer: MapVersion) => {
    if (!sourceVer.backgroundUrl) {
      alert('Version nguồn không có ảnh nền.');
      return;
    }
    const newBgUrl = sourceVer.backgroundUrl;
    const newScale = sourceVer.backgroundScale ?? 1;
    const newPos = sourceVer.backgroundPos ? { ...sourceVer.backgroundPos } : { x: 0, y: 0 };
    const newBgRotation = sourceVer.backgroundRotation ?? 0;
    const newImagePos = sourceVer.imagePos ? { ...sourceVer.imagePos } : { x: 0, y: 0 };
    const newImageScale = sourceVer.imageScale ?? 1;

    setLocalImageUrl(newBgUrl);
    setScale(newScale);
    setPosition(newPos);
    setBgRotation(newBgRotation);
    setImagePos(newImagePos);
    setImageScale(newImageScale);
    setIsLocked(true);

    if (activeVersionId) {
      setVersions(
        versions.map((v) =>
          v.id === activeVersionId
            ? {
                ...v,
                backgroundUrl: newBgUrl,
                backgroundScale: newScale,
                backgroundPos: newPos,
                backgroundRotation: newBgRotation,
                imagePos: newImagePos,
                imageScale: newImageScale,
              }
            : v
        )
      );
    }
    setIsCopyBgModalOpen(false);
  };

  return { filteredCopyVersions, handleCopyBackgroundFromVersion };
}
