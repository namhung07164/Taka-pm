import React, { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Stage, Layer, Rect, Circle, Line, Image as KonvaImage, Transformer, Text, Group } from 'react-konva';
import useImage from 'use-image';
import { useOffscreenImage } from '../../../../hooks/useOffscreenImage';
import { v4 as uuidv4 } from 'uuid';
import { MousePointer2, Square, Circle as CircleIcon, Hexagon, Upload, Trash2, Maximize, Minimize, Lock, Unlock, Save, Magnet, Search, X as CloseIcon, Undo2, RotateCw, RefreshCw, Eye, EyeOff, Download, FolderOpen, Pencil, FileImage, Move, ZoomIn, ZoomOut, Maximize2, ChevronLeft, ChevronRight, GripHorizontal, Plus, Building, Copy } from 'lucide-react';
import Draggable from 'react-draggable';
import { UnitShape, ShapeType, MapVersion } from './types';
import { cn } from '../../lib/utils';
import { useDropzone } from 'react-dropzone';
import { useSummaryData } from '../../lib/summaryData';
import { useAppStore } from '../../../../store/useAppStore';
import { useDynamicUnitSummary } from '../../lib/dynamicSummaryEngine';
import { DynamicUnitSummaryTable } from './DynamicUnitSummaryTable';
import { DebouncedSearchInput } from '../../../DebouncedSearchInput';

import { extractR2Key, resolveR2UrlToHttp } from '../../lib/r2Upload';
import { deleteR2StorageFiles } from '../../../../lib/r2StorageUtils';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface EditTabProps {
  units: UnitShape[];
  setUnits: (u: UnitShape[]) => void;
  versions: MapVersion[];
  setVersions: (v: MapVersion[]) => void;
  activeVersionId: string | null;
  setActiveVersionId: (id: string | null) => void;
}

function SearchableSelect({ 
    options, 
    value, 
    onChange 
}: { 
    options: { value: string, label: string }[], 
    value: string, 
    onChange: (val: string) => void 
}) {
    const [searchTerm, setSearchTerm] = React.useState(value || '');
    const [isOpen, setIsOpen] = React.useState(false);
    const wrapperRef = React.useRef<HTMLDivElement>(null);

    // Keep searchTerm in sync when the selected unit changes
    React.useEffect(() => {
        setSearchTerm(value || '');
    }, [value]);

    React.useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredOptions = options.filter(opt => 
        (opt.label || '').toLowerCase().includes(searchTerm.toLowerCase()) || (opt.value || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleCommit = (valToCommit?: string) => {
        const finalVal = (valToCommit !== undefined ? valToCommit : searchTerm).trim();
        if (finalVal !== value) {
            onChange(finalVal);
        }
        setIsOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleCommit();
        }
    };

    return (
        <div ref={wrapperRef} className="relative w-full">
            <div className="relative">
                <input 
                    type="text"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-200 outline-none focus:border-brand-500 transition-colors font-medium"
                    value={searchTerm}
                    onChange={(e) => {
                        const val = e.target.value;
                        setSearchTerm(val);
                        setIsOpen(true);
                    }}
                    onBlur={() => {
                        handleCommit();
                    }}
                    onFocus={() => {
                        setIsOpen(true);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter or search unit name..."
                />
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsOpen(prev => !prev);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </button>
            </div>
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {searchTerm.trim() && !options.some(o => (o.value || '').toLowerCase() === searchTerm.trim().toLowerCase()) && (
                        <div 
                            className="px-3 py-2 text-sm cursor-pointer transition-colors bg-brand-600/10 text-brand-300 hover:bg-brand-600/20 border-b border-slate-800 flex items-center gap-2 font-medium"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                handleCommit(searchTerm.trim());
                            }}
                        >
                            <Plus size={14} className="text-brand-400 shrink-0" />
                            <span>Create unit: <span className="text-white font-bold">"{searchTerm.trim()}"</span></span>
                        </div>
                    )}
                    {filteredOptions.length === 0 && !searchTerm.trim() ? (
                        <div className="px-3 py-2 text-sm text-slate-500 text-center italic">No matching suggestions</div>
                    ) : (
                        filteredOptions.map(opt => (
                            <div 
                                key={opt.value}
                                className={`px-3 py-2 text-sm cursor-pointer transition-colors flex items-center justify-between ${value === opt.value ? 'bg-brand-600/30 text-brand-300 font-medium' : 'text-slate-300 hover:bg-slate-800'}`}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    setSearchTerm(opt.value);
                                    handleCommit(opt.value);
                                }}
                            >
                                <span>{opt.label}</span>
                                {opt.value === value && <span className="text-xs uppercase bg-white/20 px-1.5 py-0.5 rounded text-white">Selected</span>}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

function EditTab({ units, setUnits, versions, setVersions, activeVersionId, setActiveVersionId }: EditTabProps) {
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const effectiveYear = globalYearFilter && globalYearFilter !== 'all' ? globalYearFilter : new Date().getFullYear().toString();
  const summaryData = useSummaryData();
  const masterUnits = React.useMemo(() => {
    // Unique by unit name
    const map = new Map<string, { unit: string; floor?: string; size?: string | number }>();
    summaryData.forEach(u => {
      if (u.unit && u.status === 'Active' && !map.has(u.unit)) {
        map.set(u.unit, { unit: u.unit, floor: String(u.floor), size: String(u.size) });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.unit.localeCompare(b.unit));
  }, [summaryData]);

  const summaryMap = React.useMemo(() => {
    const map = new Map();
    summaryData.forEach(u => map.set(u.unit, u));
    return map;
  }, [summaryData]);

  const activeVersion = versions.find(v => v.id === activeVersionId);

  // Dynamic Event-Driven Unit Summary Engine
  const { summaryMap: dynamicSummaryMap, summaryList: dynamicSummaryList } = useDynamicUnitSummary({
    units,
    activeVersion,
    store: (activeVersion?.store as any) || 'HCM',
    location: activeVersion?.location || 'B1',
    year: String(effectiveYear),
  });

  const [isSummaryTableOpen, setIsSummaryTableOpen] = useState(false);
  const summaryModalRef = useRef<HTMLDivElement>(null);

  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [bgRotation, setBgRotation] = useState(0);
  const [imagePos, setImagePos] = useState({ x: 0, y: 0 });
  const [imageScale, setImageScale] = useState(1);
  const [alignStep, setAlignStep] = useState<'none' | 'bg1' | 'bg2' | 'target1' | 'target2'>('none');
  const [alignPts, setAlignPts] = useState<{bg1?: {x:number, y:number}, bg2?: {x:number, y:number}, target1?: {x:number, y:number}}>({});
  const [isLocked, setIsLocked] = useState(false);
  const [magneticGrid, setMagneticGrid] = useState(false);

  const [gridSize, setGridSize] = useState(10);
  const [librarySearchTerm, setLibrarySearchTerm] = useState('');
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const namingModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPortalNode(document.getElementById('data-mapping-toolbar-portal'));
  }, []);

  const gridPattern = React.useMemo(() => {
    return createGridPattern(gridSize);
  }, [gridSize]);

  // Unit Naming Modal state
  const [isNamingModalOpen, setIsNamingModalOpen] = useState(false);
  const [searchUnit, setSearchUnit] = useState('');
  const [namingCallback, setNamingCallback] = useState<{ resolve: (name: string) => void, reject: () => void } | null>(null);

  // Copy Background from Version Modal state
  const [isCopyBgModalOpen, setIsCopyBgModalOpen] = useState(false);
  const [copyBgSearchTerm, setCopyBgSearchTerm] = useState('');
  const [showAllVersionsForCopy, setShowAllVersionsForCopy] = useState(false);
  const copyBgModalRef = useRef<HTMLDivElement>(null);

  const availableCopyVersions = React.useMemo(() => {
    const currentStore = activeVersion?.store;
    const currentLoc = activeVersion?.location;
    const currentYear = String(activeVersion?.year || effectiveYear).trim();

    return versions.filter(v => {
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
  }, [versions, activeVersionId, activeVersion?.store, activeVersion?.location, activeVersion?.year, effectiveYear, showAllVersionsForCopy]);

  const filteredCopyVersions = React.useMemo(() => {
    if (!copyBgSearchTerm.trim()) return availableCopyVersions;
    const q = copyBgSearchTerm.toLowerCase().trim();
    return availableCopyVersions.filter(v => 
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
      setVersions(versions.map(v => v.id === activeVersionId ? {
        ...v,
        backgroundUrl: newBgUrl,
        backgroundScale: newScale,
        backgroundPos: newPos,
        backgroundRotation: newBgRotation,
        imagePos: newImagePos,
        imageScale: newImageScale,
      } : v));
    }

    setIsCopyBgModalOpen(false);
  };

  const openNamingModal = (): Promise<string> => {
      setIsNamingModalOpen(true);
      setSearchUnit('');
      return new Promise((resolve, reject) => {
          setNamingCallback({ resolve, reject });
      });
  };

  const handleSelectUnit = (name: string) => {
      if (namingCallback) namingCallback.resolve(name);
      setIsNamingModalOpen(false);
      setNamingCallback(null);
  };

  // Ref to track current view properties and versions for auto-saving on unmount or before switching versions
  const viewPropsRef = React.useRef({ scale, position, bgRotation, imagePos, imageScale, activeVersionId });
  const versionsRef = React.useRef(versions);

  useEffect(() => {
    viewPropsRef.current = { scale, position, bgRotation, imagePos, imageScale, activeVersionId };
  }, [scale, position, bgRotation, imagePos, imageScale, activeVersionId]);

  useEffect(() => {
    versionsRef.current = versions;
  }, [versions]);

  // Auto-save view properties when unmounting EditTab using latest versionsRef
  useEffect(() => {
    return () => {
      const cur = viewPropsRef.current;
      const curVersions = versionsRef.current;
      if (cur.activeVersionId && curVersions.length > 0) {
        setVersions(curVersions.map(v => v.id === cur.activeVersionId ? {
          ...v,
          backgroundScale: cur.scale,
          backgroundPos: cur.position,
          backgroundRotation: cur.bgRotation,
          imagePos: cur.imagePos,
          imageScale: cur.imageScale,
        } : v));
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (activeVersion) {
      const rawUrl = activeVersion.backgroundUrl || '';
      if (!rawUrl) {
        setLocalImageUrl(null);
      } else if (rawUrl.startsWith('r2://') || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://') && !rawUrl.startsWith('data:') && !rawUrl.startsWith('blob:'))) {
        resolveR2UrlToHttp(rawUrl).then(url => {
          if (isMounted) setLocalImageUrl(url || rawUrl);
        }).catch(() => {
          if (isMounted) setLocalImageUrl(rawUrl);
        });
      } else {
        setLocalImageUrl(rawUrl);
      }
      setScale(activeVersion.backgroundScale || 1);
      setPosition(activeVersion.backgroundPos || { x: 0, y: 0 });
      setBgRotation(activeVersion.backgroundRotation || 0);
      setImagePos(activeVersion.imagePos || { x: 0, y: 0 });
      setImageScale(activeVersion.imageScale || 1);
      setIsLocked(true); // Viewing an existing version defaults to locked
    } else {
      setLocalImageUrl(null);
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setBgRotation(0);
      setImagePos({ x: 0, y: 0 });
      setImageScale(1);
      setIsLocked(false);
    }
    return () => { isMounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVersionId, activeVersion?.backgroundUrl]);

  // Auto Garbage Collection: revoke Blob URLs when localImageUrl changes or unmounts
  useEffect(() => {
    return () => {
      if (localImageUrl && localImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(localImageUrl);
      }
    };
  }, [localImageUrl]);

  const [image] = useOffscreenImage(localImageUrl || '', 'anonymous');
  const [activeTool, setActiveTool] = useState<ShapeType | 'select' | 'edit-bg'>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedUnit = React.useMemo(() => {
    if (!selectedId) return null;
    try {
      return units.find(u => u && u.id === selectedId) || null;
    } catch (err) {
      console.error("Defensive Check: Error looking up selected unit:", err, { selectedId, units });
      return null;
    }
  }, [units, selectedId]);

  const [isDrawing, setIsDrawing] = useState(false);
  const [newShape, setNewShape] = useState<Partial<UnitShape> | null>(null);

  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [history, setHistory] = useState<UnitShape[][]>([]);

  const handleSetUnitsWithHistory = (newUnits: UnitShape[]) => {
      setHistory(h => [...h.slice(-20), units]); // keep last 20 steps
      setUnits(newUnits);
  };

  const handleUndo = useCallback(() => {
      setHistory(h => {
          if (h.length > 0) {
              const prevUnits = h[h.length - 1];
              setUnits(prevUnits);
              return h.slice(0, -1);
          }
          return h;
      });
  }, [setUnits]);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.ctrlKey && e.key === 'z') {
              e.preventDefault();
              handleUndo();
          } else if (selectedId && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
              if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT' || document.activeElement?.tagName === 'TEXTAREA') {
                  return; 
              }
              e.preventDefault();
              const step = magneticGrid ? gridSize : (e.shiftKey ? 10 : 1);
              let dx = 0;
              let dy = 0;
              if (e.key === 'ArrowUp') dy = -step;
              if (e.key === 'ArrowDown') dy = step;
              if (e.key === 'ArrowLeft') dx = -step;
              if (e.key === 'ArrowRight') dx = step;
              
              // Use setUnits to avoid filling the undo history for every pixel moved.
              setUnits(units.map(u => 
                 u.id === selectedId ? { ...u, x: (u.x || 0) + dx, y: (u.y || 0) + dy } : u
              ));
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, selectedId, magneticGrid, gridSize, units, setUnits]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        if (w > 0 && h > 0) {
          setCanvasSize({ width: w, height: h });
        }
      }
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);

    let observer: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            setCanvasSize({ width: Math.round(width), height: Math.round(height) });
          }
        }
      });
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateSize);
      if (observer) observer.disconnect();
    };
  }, []);

  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);

  const handleFitToScreen = useCallback(() => {
    if (!image || !containerRef.current) return;
    const canvasW = canvasSize.width;
    const canvasH = canvasSize.height;
    const imgW = image.width;
    const imgH = image.height;
    if (canvasW <= 0 || canvasH <= 0 || !imgW || !imgH) return;

    const pad = 24;
    const availW = Math.max(100, canvasW - pad * 2);
    const availH = Math.max(100, canvasH - pad * 2);
    const scaleFactor = Math.min(availW / imgW, availH / imgH, 1.5);

    const posX = Math.round((canvasW - imgW * scaleFactor) / 2);
    const posY = Math.round((canvasH - imgH * scaleFactor) / 2);

    setScale(scaleFactor);
    setPosition({ x: posX, y: posY });
  }, [image, canvasSize]);

  const handleZoomIn = () => {
    setScale(s => Math.min(s * 1.25, 10));
  };

  const handleZoomOut = () => {
    setScale(s => Math.max(s / 1.25, 0.05));
  };

  const handleZoomReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Auto-fit on initial load or image change if no custom scale exists
  useEffect(() => {
    if (image && image.width && image.height && canvasSize.width > 0 && canvasSize.height > 0) {
      if (!activeVersion?.backgroundScale || activeVersion.backgroundScale === 1) {
        handleFitToScreen();
      }
    }
  }, [image, canvasSize.width, canvasSize.height, activeVersionId, activeVersion?.backgroundScale, handleFitToScreen]);

  const convertPdfToImage = async (file: File): Promise<string> => {
    try {
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
      const targetMaxDimension = 2400; // Limit rendering size to save memory and avoid crashes
      const scale = maxDimension > targetMaxDimension ? (targetMaxDimension / maxDimension) : 2.0;

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
      console.error("PDF Processing details:", error);
      throw new Error(`PDF Error: ${error.message || 'Unknown error'}`);
    }
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setIsLoading(true);
      try {
        if (file.type === 'application/pdf') {
          const imageUrl = await convertPdfToImage(file);
          setLocalImageUrl(imageUrl);
        } else {
          // Optimize Memory: Use Object URL instead of Base64 to prevent RAM bloat
          const objectUrl = URL.createObjectURL(file);
          setLocalImageUrl(objectUrl);
        }
        setIsLocked(false);
        setActiveVersionId(null);
      } catch (err: any) {
        console.error("Error processing file:", err);
        alert(`Có lỗi khi xử lý file: ${err.message || 'Vui lòng thử lại'}`);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const { getRootProps, getInputProps } = useDropzone({ 
    onDrop, 
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png'],
      'application/pdf': ['.pdf']
    } 
  });

  const snapToGrid = (val: number) => {
      if (!magneticGrid) return val;
      return Math.round(val / gridSize) * gridSize;
  };

  const handleMouseDown = (e: any) => {
    if (alignStep !== 'none') {
        const stage = e.target.getStage();
        const pos = stage.getRelativePointerPosition();
        
        if (window.confirm("Xác nhận chọn điểm này?")) {
            if (alignStep === 'bg1') {
                setAlignPts(prev => ({...prev, bg1: pos}));
                setAlignStep('bg2');
            } else if (alignStep === 'bg2') {
                setAlignPts(prev => ({...prev, bg2: pos}));
                setAlignStep('target1');
            } else if (alignStep === 'target1') {
                setAlignPts(prev => ({...prev, target1: pos}));
                setAlignStep('target2');
            } else if (alignStep === 'target2') {
                const target2 = pos;
                const bg1 = alignPts.bg1!;
                const bg2 = alignPts.bg2!;
                const target1 = alignPts.target1!;
                
                const p1_local = {
                    x: (bg1.x - imagePos.x) / imageScale,
                    y: (bg1.y - imagePos.y) / imageScale
                };
                const p2_local = {
                    x: (bg2.x - imagePos.x) / imageScale,
                    y: (bg2.y - imagePos.y) / imageScale
                };
                
                const distLocal = Math.sqrt(Math.pow(p1_local.x - p2_local.x, 2) + Math.pow(p1_local.y - p2_local.y, 2));
                const distTarget = Math.sqrt(Math.pow(target1.x - target2.x, 2) + Math.pow(target1.y - target2.y, 2));
                
                if (distLocal > 0) {
                    const newScale = distTarget / distLocal;
                    const newPos = {
                        x: target1.x - p1_local.x * newScale,
                        y: target1.y - p1_local.y * newScale
                    };
                    setImageScale(newScale);
                    setImagePos(newPos);
                }
                setAlignStep('none');
                setAlignPts({});
            }
        }
        return;
    }

    if (activeTool === 'select') {
      const clickedOnEmpty = e.target === e.target.getStage() || e.target.getName() === 'bgImage';
      if (clickedOnEmpty) {
        setSelectedId(null);
      }
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
      const isShift = e.evt.shiftKey;
      let finalX = startX;
      let finalY = startY;

      if (!isDrawing) {
        setIsDrawing(true);
        setNewShape({ type: 'polygon', x: 0, y: 0, points: [finalX, finalY, finalX, finalY], id: uuidv4() });
      } else {
        const pts = newShape!.points || [];
        if (isShift && pts.length >= 4) {
            const prevX = pts[pts.length - 4];
            const prevY = pts[pts.length - 3];
            if (Math.abs(finalX - prevX) > Math.abs(finalY - prevY)) {
                finalY = prevY;
            } else {
                finalX = prevX;
            }
        }

        const firstX = pts[0];
        const firstY = pts[1];
        const dx = finalX - firstX;
        const dy = finalY - firstY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Required 3 real points to close, so length >= 8
        if (dist < 15 && pts.length >= 8) {
           setIsDrawing(false);
           const finalPoints = pts.slice(0, pts.length - 2);
           openNamingModal().then(name => {
             if (name) {
               handleSetUnitsWithHistory([...units, {
                 ...newShape,
                 points: finalPoints,
                 name,
                 visible: true,
                 fill: '#3b82f6',
                 opacity: 0.4
               } as UnitShape]);
               setActiveTool('select');
             }
           }).catch(() => {});
           setNewShape(null);
        } else {
           const newPts = [...pts];
           newPts[newPts.length - 2] = finalX;
           newPts[newPts.length - 1] = finalY;
           newPts.push(finalX, finalY);
           setNewShape({
             ...newShape!,
             points: newPts
           });
        }
      }
    }
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing || !newShape) return;
    const pos = e.target.getStage().getRelativePointerPosition();
    const currX = snapToGrid(pos.x);
    const currY = snapToGrid(pos.y);

    if (newShape.type === 'rect') {
      setNewShape({
        ...newShape,
        width: currX - (newShape.x || 0),
        height: currY - (newShape.y || 0),
      });
    } else if (newShape.type === 'circle') {
      const dx = currX - (newShape.x || 0);
      const dy = currY - (newShape.y || 0);
      setNewShape({
        ...newShape,
        radius: Math.sqrt(dx * dx + dy * dy),
      });
    } else if (newShape.type === 'polygon') {
      const isShift = e.evt.shiftKey;
      let finalX = currX;
      let finalY = currY;
      const pts = newShape.points || [];
      if (pts.length >= 4 && isShift) {
         const prevX = pts[pts.length - 4];
         const prevY = pts[pts.length - 3];
         if (Math.abs(finalX - prevX) > Math.abs(finalY - prevY)) {
             finalY = prevY;
         } else {
             finalX = prevX;
         }
      }
      if (pts.length >= 2) {
         const newPts = [...pts];
         newPts[newPts.length - 2] = finalX;
         newPts[newPts.length - 1] = finalY;
         setNewShape({
           ...newShape,
           points: newPts
        });
      }
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || !newShape) return;
    if (activeTool === 'polygon') return; // Polygon handles its own completion

    setIsDrawing(false);
    
    let finalShape = { ...newShape };
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

    const isValid = (finalShape.type === 'rect' && finalShape.width && finalShape.height && Math.abs(finalShape.width) > 5) ||
                  (finalShape.type === 'circle' && finalShape.radius && finalShape.radius > 5);

    if (isValid) {
        openNamingModal().then(name => {
            if (name) {
                handleSetUnitsWithHistory([...units, { 
                    ...finalShape, 
                    name, 
                    visible: true, 
                    fill: '#3b82f6',
                    opacity: 0.4 
                } as UnitShape]);
                setActiveTool('select');
            }
        }).catch(() => {});
    }
    setNewShape(null);
  };

  const handleDoubleClick = (e: any) => {
    if (activeTool === 'polygon' && isDrawing && newShape) {
      setIsDrawing(false);
      if (newShape.points && newShape.points.length >= 8) {
        // Find the actual final points (removing trailing temp/duplicate points from double click)
        const pts = newShape.points;
        let finalPoints = pts;
        // Double click can add 1 or 2 extra points, let's just make sure we strip the temporary moving cursor point
        // and optionally any point that is identically equal to the previous.
        // For simplicity, we just strip the very last point since we know it's the moving cursor. 
        finalPoints = pts.slice(0, pts.length - 2); 

        openNamingModal().then(name => {
          if (name) {
            handleSetUnitsWithHistory([...units, {
              ...newShape,
              points: finalPoints,
              name,
              visible: true,
              fill: '#3b82f6',
              opacity: 0.4
            } as UnitShape]);
            setActiveTool('select');
          }
        }).catch(() => {});
      }
      setNewShape(null);
    }
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    // Smooth dampened zoom speed for desktop mouse wheels
    const deltaY = e.evt.deltaY;
    const zoomFactor = Math.exp(-deltaY * 0.0008);
    const newScale = Math.max(0.05, Math.min(10, oldScale * zoomFactor));
    setScale(newScale);
    setPosition({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  useEffect(() => {
    if (activeTool === 'select' && selectedId && trRef.current && stageRef.current) {
      try {
        const node = stageRef.current.findOne((n: any) => n.id && n.id() === selectedId);
        if (node) {
          trRef.current.nodes([node]);
          trRef.current.getLayer()?.batchDraw();
        } else {
          trRef.current.nodes([]);
          trRef.current.getLayer()?.batchDraw();
        }
      } catch (err) {
        console.warn("Konva Transformer node binding error:", err);
        trRef.current.nodes([]);
        trRef.current.getLayer()?.batchDraw();
      }
    } else if (trRef.current) {
      try {
        trRef.current.nodes([]);
        trRef.current.getLayer()?.batchDraw();
      } catch (err) {
        // ignore
      }
    }
  }, [selectedId, activeTool, units]);

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

  const handleDelete = () => {
    if (selectedId) {
        handleSetUnitsWithHistory(units.filter(u => u.id !== selectedId));
        setSelectedId(null);
    }
  };

  const handleRotate = () => {
    if (selectedId) {
      handleSetUnitsWithHistory(units.map(u => 
        u.id === selectedId ? { ...u, rotation: ((u.rotation || 0) + 90) % 360 } : u
      ));
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
      const currentVersion = versions.find(v => v.id === activeVersionId);
      const oldBgKey = extractR2Key(currentVersion?.backgroundUrl);

      let imageUrl = '';
      if (file.type === 'application/pdf') {
        imageUrl = await convertPdfToImage(file);
      } else {
        // Memory optimization
        imageUrl = URL.createObjectURL(file);
      }
      setLocalImageUrl(imageUrl);
      setVersions(versions.map(v => v.id === activeVersionId ? { ...v, backgroundUrl: imageUrl } : v));

      // Auto Garbage Collection: If old background was on R2, check if any other version uses it
      if (oldBgKey) {
        const isUsedElsewhere = versions.some(v => v.id !== activeVersionId && extractR2Key(v.backgroundUrl) === oldBgKey);
        if (!isUsedElsewhere) {
          deleteR2StorageFiles([oldBgKey]).catch((err) => console.warn('[R2 Auto-GC] Could not delete replaced image:', err));
        }
      }
    } catch (err) {
      console.error(err);
      alert('Error updating background');
    } finally {
      setIsLoading(false);
      e.target.value = ''; // reset input
    }
  };

  const handleReloadExternalBackground = () => {
    if (!localImageUrl || localImageUrl.startsWith('data:') || localImageUrl.startsWith('blob:')) return;
    const baseUrl = localImageUrl.split('?')[0];
    const updatedUrl = `${baseUrl}?v=${Date.now()}`;
    setLocalImageUrl(updatedUrl);
    setVersions(versions.map(v => v.id === activeVersionId ? { ...v, backgroundUrl: updatedUrl } : v));
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
             // Basic ID deduplication if needed, but uuidv4 should be unique enough
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

  const filteredUnits = React.useMemo(() => {
    if (!librarySearchTerm.trim()) return units;
    // Multi-search: split by space or comma to support searching multiple units
    const tokens = librarySearchTerm.toLowerCase().split(/[,\s]+/).filter(t => t.length > 0);
    
    return units.filter(u => {
      const unitName = (u.name || '').toLowerCase();
      // Match if the unit name contains ANY of the search tokens
      return tokens.some(token => unitName.includes(token));
    });
  }, [units, librarySearchTerm]);

  const handleDeleteAll = () => {
    const unitsToProcess = filteredUnits.filter(u => !u.locked);
    if (unitsToProcess.length === 0) return;
    
    const label = librarySearchTerm ? `matching "${librarySearchTerm}"` : "all";
    if (confirm(`Are you sure you want to delete ${unitsToProcess.length} unlocked units ${label}?`)) {
      const idsToDelete = new Set(unitsToProcess.map(u => u.id));
      handleSetUnitsWithHistory(units.filter(u => !idsToDelete.has(u.id)));
      if (selectedId && idsToDelete.has(selectedId)) {
        setSelectedId(null);
      }
    }
  };

  const handleToggleAllVisibility = () => {
    const unitsToProcess = filteredUnits.filter(u => !u.locked);
    if (unitsToProcess.length === 0) return;

    const allVisible = unitsToProcess.every(u => u.visible);
    const newVisibility = !allVisible;

    const idsToUpdate = new Set(unitsToProcess.map(u => u.id));
    handleSetUnitsWithHistory(units.map(u => 
      idsToUpdate.has(u.id) ? { ...u, visible: newVisibility } : u
    ));
  };

  const handleToggleAllLock = () => {
    if (filteredUnits.length === 0) return;

    const allLocked = filteredUnits.every(u => u.locked);
    const newLockState = !allLocked;

    const idsToUpdate = new Set(filteredUnits.map(u => u.id));
    handleSetUnitsWithHistory(units.map(u => 
      idsToUpdate.has(u.id) ? { ...u, locked: newLockState } : u
    ));
  };

  const handleCreateVersion = () => {
    const name = prompt('Nhập tên phiên bản (Version Name) cho bản đồ này:');
    if (!name) return;
    
    const existingVer = versions.find(v => (v.location === activeVersion?.location || !v.location) && (v.groups || []).length > 0);
    const inheritedGroups = existingVer ? existingVer.groups.map(g => ({
      ...g,
      id: uuidv4(),
      rules: g.rules ? g.rules.map(r => ({ ...r })) : [],
    })) : [];

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
    setVersions(versions.map(v => v.id === activeVersionId ? {
        ...v,
        backgroundScale: scale,
        backgroundPos: position,
        backgroundRotation: bgRotation,
        imagePos,
        imageScale
    } : v));
    setIsLocked(true);
    alert('Đã cập nhật tỷ lệ/vị trí cho phiên bản này!');
  };

  return (
    <div className="flex h-full gap-2 p-1.5 sm:p-2.5 overflow-hidden">
      {/* Tools Left */}
      <div className="w-12 sm:w-14 flex flex-col gap-1.5 py-2.5 items-center bg-slate-900/80 rounded-xl border border-slate-800/80 glass z-10 shrink-0 overflow-y-auto custom-scrollbar">
        <ToolButton icon={MousePointer2} active={activeTool === 'select'} onClick={() => setActiveTool('select')} title="Select" />
        <ToolButton icon={Move} active={activeTool === 'edit-bg'} onClick={() => setActiveTool('edit-bg')} title="Edit Background Image" />
        <div className="w-8 h-px bg-slate-800 my-2" />
        <ToolButton icon={Square} active={activeTool === 'rect'} onClick={() => setActiveTool('rect')} title="Rectangle" />
        <ToolButton icon={CircleIcon} active={activeTool === 'circle'} onClick={() => setActiveTool('circle')} title="Circle" />
        <ToolButton icon={Hexagon} active={activeTool === 'polygon'} onClick={() => setActiveTool('polygon')} title="Polygon (Double click to finish)" />
        <div className="w-8 h-px bg-slate-800 my-2" />
        <ToolButton icon={RotateCw} active={false} onClick={handleRotate} title="Rotate 90°" disabled={!selectedId || selectedUnit?.locked} />
        <ToolButton icon={Undo2} active={false} onClick={handleUndo} title="Undo (Ctrl+Z)" disabled={history.length === 0} />
        <ToolButton icon={Trash2} active={false} onClick={handleDelete} title="Delete Selected" disabled={!selectedId || selectedUnit?.locked} />
      </div>

      {portalNode && createPortal(
        <div className="flex items-center gap-1 pl-2 ml-2 border-l border-slate-700">
            <ToolButton icon={Magnet} active={magneticGrid} onClick={() => setMagneticGrid(!magneticGrid)} title="Magnetic Grid (0.1 Snap)" />
            <div className="w-px h-4 bg-slate-700 mx-1" />
            <ToolButton icon={Download} active={false} onClick={handleExportUnits} title="Save Units As File" />
            <div className="relative">
              <ToolButton icon={FolderOpen} active={false} onClick={() => document.getElementById('import-units-input')?.click()} title="Open Units From File" />
              <input 
                id="import-units-input"
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportUnits}
              />
            </div>
            {activeVersionId && (
              <>
                <div className="relative">
                  <ToolButton icon={FileImage} active={false} onClick={() => document.getElementById('replace-bg-input')?.click()} title="Replace Background Image/PDF" />
                  <input 
                    id="replace-bg-input"
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    onChange={handleReplaceBackground}
                  />
                </div>
                <ToolButton icon={RotateCw} active={false} onClick={handleRotateBackground} title="Rotate Background Image/PDF 90°" />
                <ToolButton icon={Copy} active={isCopyBgModalOpen} onClick={() => { setCopyBgSearchTerm(''); setIsCopyBgModalOpen(true); }} title="Copy Background & Alignment from Another Version" />
              </>
            )}
        </div>,
        portalNode
      )}

      {/* Main Canvas Area */}
      <div className="flex-1 min-h-[400px] rounded-xl border border-slate-800 shadow-xl overflow-hidden relative flex flex-col bg-[#141416]" ref={containerRef}>
        
        {/* Top Floating Controls */}
        <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex justify-between items-center pointer-events-none gap-2 flex-wrap">
            <div className="flex gap-2 pointer-events-auto items-center flex-wrap">
                <select 
                    className="bg-slate-900/90 text-white text-xs font-bold uppercase tracking-wide px-4 py-2 rounded-lg border border-slate-700 outline-none backdrop-blur-md cursor-pointer"
                    value={activeVersionId || ''}
                    onChange={(e) => setActiveVersionId(e.target.value === '' ? null : e.target.value)}
                >
                    <option value="">-- Active Draft --</option>
                    {versions.map(v => (
                        <option key={v.id} value={v.id}>
                            {v.name}{v.year ? ` • ${v.year}` : ''}
                        </option>
                    ))}
                </select>

                {activeVersionId && (
                    <>
                      <button 
                          onClick={() => {
                              const v = versions.find(v => v.id === activeVersionId);
                              if (!v) return;
                              const newName = prompt('Enter new version name:', v.name);
                              if (newName && newName.trim() && newName.trim() !== v.name) {
                                  setVersions(versions.map(version => 
                                      version.id === activeVersionId 
                                      ? { ...version, name: newName.trim() } 
                                      : version
                                  ));
                              }
                          }}
                          className="p-2 bg-slate-900/90 text-slate-400 hover:text-white rounded-lg border border-slate-700 backdrop-blur-md transition-colors"
                          title="Rename Version"
                      >
                          <Pencil size={14} />
                      </button>

                      <button 
                          onClick={() => {
                              const v = versions.find(v => v.id === activeVersionId);
                              if (!v) return;
                              if (!confirm(`Bạn có chắc muốn xoá version "${v.name}${v.year ? ` • ${v.year}` : ''}"?`)) return;
                              const oldBgKey = extractR2Key(v.backgroundUrl);
                              const newVersions = versions.filter(item => item.id !== activeVersionId);
                              setVersions(newVersions);
                              setActiveVersionId(newVersions.length > 0 ? newVersions[0].id : null);

                              // Auto Garbage Collection on R2
                              if (oldBgKey) {
                                const isUsedElsewhere = newVersions.some(item => extractR2Key(item.backgroundUrl) === oldBgKey);
                                if (!isUsedElsewhere) {
                                  deleteR2StorageFiles([oldBgKey]).catch((err) => console.warn('[R2 Auto-GC] Could not delete removed version image:', err));
                                }
                              }
                          }}
                          className="p-2 bg-slate-900/90 text-rose-400 hover:text-rose-200 hover:bg-rose-900/50 rounded-lg border border-slate-700 backdrop-blur-md transition-colors"
                          title="Delete Version"
                      >
                          <Trash2 size={14} />
                      </button>
                    </>
                )}

                {magneticGrid && (
                    <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-700 backdrop-blur-md">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Grid</span>
                        <input 
                            type="number" 
                            min="0.1" 
                            max="100" 
                            step="0.1"
                            value={gridSize}
                            onChange={(e) => setGridSize(Math.max(0.1, Number(e.target.value) || 0.1))}
                            className="w-16 bg-transparent text-white text-xs outline-none text-center"
                        />
                        <span className="text-[10px] text-slate-500 font-bold uppercase">px</span>
                    </div>
                )}
                
                {activeTool === 'edit-bg' && (
                    <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-700 backdrop-blur-md pointer-events-auto">
                        <span className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">BG Zoom</span>
                        <input 
                            type="range" 
                            min="0.1" 
                            max="5" 
                            step="0.01"
                            value={imageScale}
                            onChange={(e) => setImageScale(Number(e.target.value))}
                            className="w-24"
                        />
                        <span className="text-[10px] text-slate-500 font-bold w-6 text-right">{(imageScale * 100).toFixed(0)}%</span>
                        
                        <div className="w-px h-4 bg-slate-700 mx-2" />
                        
                        {alignStep === 'none' ? (
                            <button 
                                onClick={() => setAlignStep('bg1')}
                                className="text-[10px] font-bold uppercase text-brand-400 hover:text-brand-300 flex items-center gap-1"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12A9 9 0 1 1 3 12a9 9 0 0 1 18 0z"></path><path d="M12 8v8"></path><path d="M8 12h8"></path></svg>
                                2-Point Align
                            </button>
                        ) : (
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-amber-400">
                                    {alignStep === 'bg1' && "Set Point 1 (on image)"}
                                    {alignStep === 'bg2' && "Set Point 2 (on image)"}
                                    {alignStep === 'target1' && "Set Target 1a (on canvas)"}
                                    {alignStep === 'target2' && "Set Target 2a (on canvas)"}
                                </span>
                                <button 
                                    onClick={() => {
                                        setAlignStep('none');
                                        setAlignPts({});
                                    }}
                                    className="text-[10px] font-bold text-red-400 hover:text-red-300 px-1"
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>
                )}
                
                {localImageUrl && (
                    <button 
                        onClick={() => setIsLocked(!isLocked)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg border backdrop-blur-md text-xs font-bold uppercase transition-all",
                            isLocked ? "bg-red-500/20 text-red-400 border-red-500/50" : "bg-green-500/20 text-green-400 border-green-500/50"
                        )}
                    >
                        <Lock size={14} /> {isLocked ? 'Unlock Grid' : 'Lock Grid'}
                    </button>
                )}
                
                {localImageUrl && !activeVersionId && isLocked && (
                    <button 
                        onClick={handleCreateVersion}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white border border-brand-500 text-xs font-bold uppercase shadow-lg hover:bg-brand-500"
                    >
                        <Save size={14} /> Save Version
                    </button>
                )}
                
                {activeVersionId && !isLocked && (
                    <button 
                        onClick={handleUpdateVersion}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600/80 text-white border border-amber-500 text-xs font-bold uppercase shadow-lg hover:bg-amber-500"
                    >
                        <Save size={14} /> Update Version View
                    </button>
                )}
            </div>
            
            <div className="flex gap-2 items-center pointer-events-auto flex-wrap">
                <button
                    onClick={() => setIsSummaryTableOpen(prev => !prev)}
                    className={cn(
                        "p-2 bg-slate-900/80 hover:bg-slate-800 rounded-lg border backdrop-blur-sm transition-all flex items-center gap-1.5 shadow-sm",
                        isSummaryTableOpen ? "text-emerald-400 border-emerald-500/50 bg-emerald-950/40 ring-1 ring-emerald-500/30" : "text-slate-300 border-slate-700"
                    )}
                    title="Mở Bảng Tổng Hợp So Sánh & Màu Tô Thực Tế (Dynamic Unit Summary)"
                >
                    <Building size={16} className="text-emerald-400" />
                    <span className="text-[10px] uppercase font-bold tracking-wider hidden sm:inline">Dynamic Summary</span>
                    <span className="px-1.5 py-0.2 text-[9px] font-mono rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                        {dynamicSummaryList.length}
                    </span>
                </button>

                <button
                    onClick={() => {
                        setCopyBgSearchTerm('');
                        setIsCopyBgModalOpen(true);
                    }}
                    className="p-2 bg-slate-900/80 hover:bg-slate-800 text-brand-400 hover:text-brand-300 rounded-lg border border-slate-700 backdrop-blur-sm transition-all flex items-center gap-1.5 shadow-sm"
                    title="Sao chép Background & cách căn chỉnh từ một Version khác (cùng Store, Tầng, Năm)"
                >
                    <Copy size={16} />
                    <span className="text-[10px] uppercase font-bold tracking-wider hidden sm:inline">Copy BG từ Version</span>
                </button>

                {localImageUrl && (
                    <>
                        <div className="relative">
                            <button
                                onClick={() => document.getElementById('replace-bg-input2')?.click()}
                                className="p-2 bg-slate-900/80 hover:bg-slate-800 text-white rounded-lg border border-slate-700 backdrop-blur-sm transition-all flex items-center gap-2"
                                title="Thay đổi Background Image/PDF"
                            >
                                <FileImage size={18} />
                                <span className="text-[10px] uppercase font-bold tracking-wider hidden sm:inline">Thay BG</span>
                            </button>
                            <input 
                                id="replace-bg-input2"
                                type="file"
                                accept=".pdf,image/*"
                                className="hidden"
                                onChange={handleReplaceBackground}
                            />
                        </div>

                        {(!localImageUrl.startsWith('data:') && !localImageUrl.startsWith('blob:')) && (
                            <button
                                onClick={handleReloadExternalBackground}
                                className="p-2 bg-slate-900/80 hover:bg-slate-800 text-white rounded-lg border border-slate-700 backdrop-blur-sm transition-all flex items-center gap-2"
                                title="Tải lại ảnh nền từ máy chủ (Tránh bị lưu bộ nhớ đệm)"
                            >
                                <RefreshCw size={18} />
                                <span className="text-[10px] uppercase font-bold tracking-wider hidden sm:inline">Làm Mới</span>
                            </button>
                        )}
                        
                        <button
                            onClick={handleRotateBackground}
                            className="p-2 bg-slate-900/80 hover:bg-slate-800 text-white rounded-lg border border-slate-700 backdrop-blur-sm transition-all flex items-center gap-2"
                            title="Xoay Background Image/PDF (90 độ)"
                        >
                            <RotateCw size={18} />
                            <span className="text-[10px] uppercase font-bold tracking-wider hidden sm:inline">Xoay BG</span>
                        </button>
                    </>
                )}

                {localImageUrl && (
                    <button 
                        onClick={toggleFullscreen}
                        className="p-2 bg-slate-900/80 hover:bg-slate-800 text-white rounded-lg border border-slate-700 backdrop-blur-sm transition-all pointer-events-auto flex items-center gap-2"
                        title="Toggle Fullscreen"
                    >
                        {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                        <span className="text-[10px] uppercase font-bold tracking-wider hidden sm:inline">Toàn Màn Hình</span>
                    </button>
                )}
            </div>
        </div>

        {/* Bottom Floating Zoom & View Controls */}
        {localImageUrl && (
          <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1 p-1 bg-slate-900/90 border border-slate-700/80 rounded-xl backdrop-blur-md shadow-2xl pointer-events-auto">
            <button 
              onClick={handleZoomOut}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors"
              title="Thu nhỏ (Zoom Out)"
            >
              <ZoomOut size={15} />
            </button>
            <button 
              onClick={handleZoomReset}
              className="px-2 py-1 hover:bg-slate-800 text-slate-200 hover:text-white rounded-lg transition-colors text-[11px] font-mono font-bold min-w-[48px] text-center"
              title="Đặt lại 100%"
            >
              {Math.round(scale * 100)}%
            </button>
            <button 
              onClick={handleZoomIn}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors"
              title="Phóng to (Zoom In)"
            >
              <ZoomIn size={15} />
            </button>
            <div className="w-px h-4 bg-slate-700 mx-0.5" />
            <button 
              onClick={handleFitToScreen}
              className="px-2.5 py-1 bg-brand-600/25 hover:bg-brand-600/40 text-brand-300 hover:text-brand-200 border border-brand-500/40 rounded-lg transition-colors text-[11px] font-bold flex items-center gap-1.5 shadow-sm"
              title="Tự động căn vừa màn hình (Fit to Screen) - Khắc phục bị crop ảnh"
            >
              <Maximize2 size={13} />
              <span>Vừa Màn Hình</span>
            </button>
          </div>
        )}

        {isLoading && (
            <div className="absolute inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-auto">
                <div className="w-12 h-12 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mb-4" />
                <p className="text-sm font-bold text-slate-300 uppercase tracking-widest animate-pulse">Processing File...</p>
            </div>
        )}
        
        {!localImageUrl && (
             <div {...getRootProps()} className="absolute inset-0 flex items-center justify-center cursor-pointer hover:bg-slate-800/20 transition-colors z-10 pointer-events-auto">
               <input {...getInputProps()} />
               <div className="text-center p-8 bg-slate-900/40 rounded-3xl border border-dashed border-slate-700 max-w-md backdrop-blur-sm">
                 <div className="w-16 h-16 bg-brand-600/20 text-brand-400 rounded-2xl mx-auto flex items-center justify-center mb-4">
                   <Upload size={32} />
                 </div>
                 <h3 className="text-xl text-white font-medium mb-2">Start Mapping Units</h3>
                 <p className="text-sm text-slate-400">Click or drag & drop to upload a PDF or Image floor plan for this version</p>
               </div>
             </div>
        )}
        
        {localImageUrl && (
            <div className="w-full h-full bg-[#141416]">
                <Stage 
                    width={canvasSize.width} 
                    height={canvasSize.height}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onDblClick={handleDoubleClick}
                    onWheel={handleWheel}
                    scaleX={scale}
                    scaleY={scale}
                    x={position.x}
                    y={position.y}
                    ref={stageRef}
                    draggable={activeTool === 'select' && !selectedId && alignStep === 'none'}
                    style={{ cursor: alignStep !== 'none' ? 'crosshair' : activeTool === 'edit-bg' ? 'move' : activeTool === 'select' ? (selectedId ? 'default' : 'grab') : 'crosshair' }}
                    onDragEnd={(e) => {
                        if (e.target === stageRef.current) {
                            setPosition({ x: e.target.x(), y: e.target.y() });
                        }
                    }}
                >
                    <Layer>
                        {image && <KonvaImage 
                          image={image} 
                          name="bgImage" 
                          x={imagePos.x}
                          y={imagePos.y}
                          scaleX={imageScale}
                          scaleY={imageScale}
                          rotation={bgRotation}
                          draggable={activeTool === 'edit-bg' && alignStep === 'none'}
                          listening={isLocked || activeTool === 'edit-bg'} 
                          onDragEnd={(e) => {
                             if (activeTool === 'edit-bg' && e.target.name() === 'bgImage') {
                               setImagePos({ x: e.target.x(), y: e.target.y() });
                             }
                          }}
                        />}
                        {alignPts.bg1 && (
                            <Group x={alignPts.bg1.x} y={alignPts.bg1.y}>
                                <Line points={[-10, 0, 10, 0]} stroke="#f59e0b" strokeWidth={2} />
                                <Line points={[0, -10, 0, 10]} stroke="#f59e0b" strokeWidth={2} />
                                <Circle radius={3} fill="#f59e0b" />
                                <Text text="Point 1" x={8} y={8} fill="#f59e0b" fontSize={14} fontStyle="bold" shadowColor="black" shadowBlur={4} shadowOffset={{x:1,y:1}} />
                            </Group>
                        )}
                        {alignPts.bg2 && (
                            <Group x={alignPts.bg2.x} y={alignPts.bg2.y}>
                                <Line points={[-10, 0, 10, 0]} stroke="#f59e0b" strokeWidth={2} />
                                <Line points={[0, -10, 0, 10]} stroke="#f59e0b" strokeWidth={2} />
                                <Circle radius={3} fill="#f59e0b" />
                                <Text text="Point 2" x={8} y={8} fill="#f59e0b" fontSize={14} fontStyle="bold" shadowColor="black" shadowBlur={4} shadowOffset={{x:1,y:1}} />
                            </Group>
                        )}
                        {alignPts.target1 && (
                            <Group x={alignPts.target1.x} y={alignPts.target1.y}>
                                <Line points={[-10, 0, 10, 0]} stroke="#10b981" strokeWidth={2} />
                                <Line points={[0, -10, 0, 10]} stroke="#10b981" strokeWidth={2} />
                                <Circle radius={3} fill="#10b981" />
                                <Text text="Target 1a" x={8} y={8} fill="#10b981" fontSize={14} fontStyle="bold" shadowColor="black" shadowBlur={4} shadowOffset={{x:1,y:1}} />
                            </Group>
                        )}
                        {magneticGrid && (
                            <Rect
                                x={-10000} y={-10000} width={20000} height={20000}
                                fillPatternImage={gridPattern as any}
                                fillPatternRepeat="repeat"
                                fillPatternScale={{ x: 1/scale, y: 1/scale }}
                                listening={false}
                                opacity={0.3}
                            />
                        )}
                        {units.map((unit) => {
                            const editFill = (unit.fill && unit.fill !== 'rgba(0, 0, 0, 0.001)' && unit.fill !== 'transparent' && !unit.fill.startsWith('rgba(0,0,0,0')) ? unit.fill : '#3b82f6';
                            return (
                            <React.Fragment key={unit.id}>
                                {unit.visible && unit.type === 'rect' && (
                                    <Rect
                                        id={unit.id}
                                        x={unit.x}
                                        y={unit.y}
                                        width={unit.width}
                                        height={unit.height}
                                        fill={editFill}
                                        opacity={unit.opacity ?? 0.5}
                                        rotation={unit.rotation || 0}
                                        stroke={selectedId === unit.id ? '#3b82f6' : 'rgba(0,0,0,0.3)'}
                                        strokeWidth={selectedId === unit.id ? 3 : 2}
                                        shadowBlur={selectedId === unit.id ? 10 : 0}
                                        shadowColor="#3b82f6"
                                        draggable={activeTool === 'select' && !unit.locked}
                                        onClick={() => {
                                            try {
                                                if (activeTool === 'select') setSelectedId(unit.id);
                                            } catch (err) {
                                                console.error("Defensive Check: Error selecting unit shape (rect):", err, unit);
                                            }
                                        }}
                                        onDragEnd={(e) => {
                                            const newUnits = units.map(u => 
                                                u.id === unit.id ? { ...u, x: snapToGrid(e.target.x()), y: snapToGrid(e.target.y()) } : u
                                            );
                                            handleSetUnitsWithHistory(newUnits);
                                        }}
                                        onTransformEnd={(e) => {
                                            const node = e.target;
                                            const scaleX = node.scaleX();
                                            const scaleY = node.scaleY();
                                            node.scaleX(1);
                                            node.scaleY(1);
                                            const newUnits = units.map(u => {
                                                if(u.id === unit.id) {
                                                    return {
                                                        ...u,
                                                        x: snapToGrid(node.x()),
                                                        y: snapToGrid(node.y()),
                                                        width: Math.max(5, snapToGrid((node.width() as number) * scaleX)),
                                                        height: Math.max(5, snapToGrid((node.height() as number) * scaleY)),
                                                        rotation: node.rotation(),
                                                    }
                                                }
                                                return u;
                                            });
                                            handleSetUnitsWithHistory(newUnits);
                                        }}
                                    />
                                )}
                                {unit.visible && unit.type === 'circle' && (
                                    <Circle
                                        id={unit.id}
                                        x={unit.x}
                                        y={unit.y}
                                        radius={unit.radius}
                                        fill={editFill}
                                        opacity={unit.opacity ?? 0.5}
                                        rotation={unit.rotation || 0}
                                        stroke={selectedId === unit.id ? '#3b82f6' : 'rgba(0,0,0,0.3)'}
                                        strokeWidth={selectedId === unit.id ? 3 : 2}
                                        shadowBlur={selectedId === unit.id ? 10 : 0}
                                        shadowColor="#3b82f6"
                                        draggable={activeTool === 'select' && !unit.locked}
                                        onClick={() => {
                                            try {
                                                if (activeTool === 'select') setSelectedId(unit.id);
                                            } catch (err) {
                                                console.error("Defensive Check: Error selecting unit shape (circle):", err, unit);
                                            }
                                        }}
                                        onDragEnd={(e) => {
                                            const newUnits = units.map(u => 
                                                u.id === unit.id ? { ...u, x: snapToGrid(e.target.x()), y: snapToGrid(e.target.y()) } : u
                                            );
                                            handleSetUnitsWithHistory(newUnits);
                                        }}
                                        onTransformEnd={(e) => {
                                            const node = e.target;
                                            const scaleX = node.scaleX();
                                            node.scaleX(1);
                                            node.scaleY(1);
                                            const newUnits = units.map(u => {
                                                if(u.id === unit.id) {
                                                    return {
                                                        ...u,
                                                        x: snapToGrid(node.x()),
                                                        y: snapToGrid(node.y()),
                                                        radius: Math.max(5, snapToGrid(((node as any).radius() as number) * scaleX)),
                                                        rotation: node.rotation(),
                                                    }
                                                }
                                                return u;
                                            });
                                            handleSetUnitsWithHistory(newUnits);
                                        }}
                                    />
                                )}
                                {unit.visible && unit.type === 'polygon' && (
                                    <Line
                                        id={unit.id}
                                        x={unit.x || 0}
                                        y={unit.y || 0}
                                        points={unit.points}
                                        fill={editFill}
                                        opacity={unit.opacity ?? 0.5}
                                        rotation={unit.rotation || 0}
                                        stroke={selectedId === unit.id ? '#3b82f6' : 'rgba(0,0,0,0.3)'}
                                        strokeWidth={selectedId === unit.id ? 3 : 2}
                                        shadowBlur={selectedId === unit.id ? 10 : 0}
                                        shadowColor="#3b82f6"
                                        closed
                                        draggable={activeTool === 'select' && !unit.locked}
                                        onClick={() => {
                                            try {
                                                if (activeTool === 'select') setSelectedId(unit.id);
                                            } catch (err) {
                                                console.error("Defensive Check: Error selecting unit shape (polygon):", err, unit);
                                            }
                                        }}
                                        onDragEnd={(e) => {
                                            const newUnits = units.map(u => 
                                                u.id === unit.id ? { ...u, x: snapToGrid(e.target.x()), y: snapToGrid(e.target.y()) } : u
                                            );
                                            handleSetUnitsWithHistory(newUnits);
                                        }}
                                        onTransformEnd={(e) => {
                                            const node = e.target;
                                            const scaleX = node.scaleX();
                                            const scaleY = node.scaleY();
                                            node.scaleX(1);
                                            node.scaleY(1);
                                            
                                            // Scale the points
                                            const pts = unit.points || [];
                                            const newPoints = pts.map((p, i) => i % 2 === 0 ? p * scaleX : p * scaleY);
                                            
                                            const newUnits = units.map(u => {
                                                if(u.id === unit.id) {
                                                    return {
                                                        ...u,
                                                        x: snapToGrid(node.x()),
                                                        y: snapToGrid(node.y()),
                                                        points: newPoints,
                                                        rotation: node.rotation(),
                                                    }
                                                }
                                                return u;
                                            });
                                            handleSetUnitsWithHistory(newUnits);
                                        }}
                                    />
                                )}
                                {unit.visible && unit.name && scale > 0.4 && (() => {
                                    const uInfo = summaryMap.get(unit.name);
                                    const sizeLabel = uInfo?.size ? `${unit.name}\n${uInfo.size} SQM` : unit.name;
                                    
                                    const xCoords = unit.points && unit.points.length >= 2 ? unit.points.filter((_, i) => i % 2 === 0) : [];
                                    const yCoords = unit.points && unit.points.length >= 2 ? unit.points.filter((_, i) => i % 2 === 1) : [];
                                    
                                    const textX = unit.type === 'rect' 
                                        ? (unit.x || 0) 
                                        : (unit.type === 'circle' 
                                            ? (unit.x || 0) - (unit.radius || 0) 
                                            : (xCoords.length > 0 ? (unit.x || 0) + Math.min(...xCoords) : (unit.x || 0)));
                                            
                                    const textY = unit.type === 'rect' 
                                        ? (unit.y || 0) 
                                        : (unit.type === 'circle' 
                                            ? (unit.y || 0) - (unit.radius || 0) 
                                            : (yCoords.length > 0 ? (unit.y || 0) + Math.min(...yCoords) : (unit.y || 0)));
                                            
                                    const textWidth = unit.type === 'rect' 
                                        ? Math.max(10, Math.abs(unit.width || 50)) 
                                        : (unit.type === 'circle' 
                                            ? Math.max(10, (unit.radius || 20) * 2) 
                                            : (xCoords.length > 0 ? Math.max(20, Math.max(...xCoords) - Math.min(...xCoords)) : 100));
                                            
                                    const textHeight = unit.type === 'rect' 
                                        ? Math.max(10, Math.abs(unit.height || 30)) 
                                        : (unit.type === 'circle' 
                                            ? Math.max(10, (unit.radius || 20) * 2) 
                                            : (yCoords.length > 0 ? Math.max(20, Math.max(...yCoords) - Math.min(...yCoords)) : 30));
                                            
                                    const calcFontSize = unit.type === 'rect' 
                                        ? Math.max(9, Math.min(Math.abs(unit.width || 50), Math.abs(unit.height || 50)) * 0.2) 
                                        : (unit.type === 'circle' 
                                            ? Math.max(9, (unit.radius || 20) * 0.4) 
                                            : Math.max(9, 12 / (scale || 1)));

                                    return (
                                        <Text
                                            text={sizeLabel}
                                            x={textX}
                                            y={textY}
                                            width={textWidth}
                                            height={textHeight}
                                            rotation={unit.rotation || 0}
                                            align="center"
                                            verticalAlign="middle"
                                            fontSize={calcFontSize}
                                            fill="#ffffff"
                                            fontStyle="bold"
                                            shadowColor="black"
                                            shadowBlur={2}
                                            shadowOpacity={1}
                                            listening={false}
                                        />
                                    );
                                })()}
                            </React.Fragment>
                        );})}
                        
                        {isDrawing && newShape && newShape.type === 'rect' && (
                           <Rect
                               x={newShape.x}
                               y={newShape.y}
                               width={newShape.width}
                               height={newShape.height}
                               fill="rgba(59, 130, 246, 0.4)"
                               stroke="#3b82f6"
                               strokeDasharray={[4, 4]}
                           /> 
                        )}
                        {isDrawing && newShape && newShape.type === 'circle' && (
                           <Circle
                               x={newShape.x}
                               y={newShape.y}
                               radius={newShape.radius}
                               fill="rgba(59, 130, 246, 0.4)"
                               stroke="#3b82f6"
                               strokeDasharray={[4, 4]}
                           /> 
                        )}
                        {isDrawing && newShape && newShape.type === 'polygon' && (
                           <Line
                               points={newShape.points}
                               fill="rgba(59, 130, 246, 0.4)"
                               stroke="#3b82f6"
                               strokeDasharray={[4, 4]}
                               closed={false}
                           /> 
                        )}
                        {magneticGrid && (
                            <Rect
                                x={-10000} y={-10000} width={20000} height={20000}
                                fillPatternImage={createGridPattern(gridSize) as any}
                                fillPatternRepeat="repeat"
                                fillPatternScale={{ x: 1/scale, y: 1/scale }}
                                listening={false}
                                opacity={0.3}
                            />
                        )}
                        <Transformer 
                            ref={trRef} 
                            enabledAnchors={selectedUnit?.locked ? [] : undefined}
                            rotateEnabled={!selectedUnit?.locked}
                            boundBoxFunc={(oldBox, newBox) => {
                                if (newBox.width < 10 || newBox.height < 10) return oldBox;
                                return newBox;
                            }} 
                        />
                    </Layer>
                </Stage>
            </div>
        )}
      </div>

      {/* Settings / Inspector */}
      <div className={cn(
        "flex flex-col bg-slate-900/90 rounded-xl border border-slate-800/80 transition-all duration-300 relative shrink-0 overflow-hidden",
        isInspectorCollapsed ? "w-10 p-2 items-center" : "w-72 sm:w-80 p-3 sm:p-4 gap-3 glass"
      )}>
        {/* Toggle Collapse Button */}
        <button 
          onClick={() => setIsInspectorCollapsed(!isInspectorCollapsed)}
          className={cn(
            "p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shadow-sm",
            isInspectorCollapsed ? "w-7 h-7 flex items-center justify-center my-1" : "absolute -left-3.5 top-3 z-30 border border-slate-700 bg-slate-900"
          )}
          title={isInspectorCollapsed ? "Mở rộng Inspector" : "Thu gọn Inspector để mở rộng Canvas"}
        >
          {isInspectorCollapsed ? <ChevronLeft size={14} className="rotate-180" /> : <ChevronRight size={14} />}
        </button>

        {isInspectorCollapsed ? (
          <div className="flex flex-col items-center gap-4 mt-6 text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-widest [writing-mode:vertical-rl] rotate-180 select-none">
              INSPECTOR ({units.length})
            </span>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden w-full gap-3">
            <div className="space-y-3 border-b border-slate-800 pb-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center justify-between">
                  <span>Inspector</span>
                  <span className="text-[10px] font-normal text-slate-500 font-mono">{units.length} units</span>
                </h4>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 z-10 pointer-events-none" size={14} />
                    <DebouncedSearchInput 
                      placeholder="Search units..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 py-1.5 text-xs text-slate-200 outline-none focus:border-brand-500 transition-all"
                      value={librarySearchTerm}
                      onChange={(val) => setLibrarySearchTerm(val)}
                      debounceMs={250}
                    />
                </div>
            </div>
        
        {selectedId ? (
            <div className="space-y-4">
                <div className="space-y-1">
                    <label className="text-[10px] uppercase text-slate-500 font-bold">Unit Name</label>
                    <SearchableSelect 
                        value={selectedUnit?.name || ''}
                        onChange={(val) => {
                            handleSetUnitsWithHistory(units.map(u => u.id === selectedId ? { ...u, name: val } : u));
                        }}
                        options={masterUnits.map(u => ({ value: u.unit, label: `${u.unit} (F${u.floor})` }))}
                    />
                </div>

                <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-2">
                        <div className={cn(
                            "p-2 rounded-lg",
                            selectedUnit?.locked ? "bg-amber-500/10 text-amber-500" : "bg-slate-800 text-slate-400"
                        )}>
                            {selectedUnit?.locked ? <Lock size={16} /> : <Unlock size={16} />}
                        </div>
                        <span className="text-xs font-bold text-slate-300 uppercase">Lock Position</span>
                    </div>
                    <button
                        onClick={() => {
                            handleSetUnitsWithHistory(units.map(u => u.id === selectedId ? { ...u, locked: !u.locked } : u));
                        }}
                        className={cn(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                            selectedUnit?.locked ? "bg-amber-500" : "bg-slate-700"
                        )}
                    >
                        <span
                            className={cn(
                                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                selectedUnit?.locked ? "translate-x-6" : "translate-x-1"
                            )}
                        />
                    </button>
                </div>
            </div>
        ) : (
            <div className="text-center py-8 text-slate-500 text-sm italic">
                Select a unit to edit properties
            </div>
        )}

        <div className="mt-8 border-t border-slate-800 pt-4 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Library ({filteredUnits.length}/{units.length})</h4>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={handleToggleAllVisibility}
                        disabled={filteredUnits.length === 0 || !filteredUnits.some(u => !u.locked)}
                        className="text-[10px] font-bold text-brand-400 hover:text-brand-300 disabled:opacity-30 disabled:cursor-not-allowed uppercase transition-colors flex items-center gap-1"
                        title="Toggle Visibility for Unlocked Filtered Units"
                    >
                        <Eye size={10} /> All
                    </button>
                    <button 
                        onClick={handleToggleAllLock}
                        disabled={filteredUnits.length === 0}
                        className="text-[10px] font-bold text-amber-500 hover:text-amber-400 disabled:opacity-30 disabled:cursor-not-allowed uppercase transition-colors flex items-center gap-1"
                        title="Toggle Lock for Filtered Units"
                    >
                        {filteredUnits.length > 0 && filteredUnits.every(u => u.locked) ? <Unlock size={10} /> : <Lock size={10} />} All
                    </button>
                    <button 
                        onClick={handleDeleteAll}
                        disabled={filteredUnits.length === 0 || !filteredUnits.some(u => !u.locked)}
                        className="text-[10px] font-bold text-red-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed uppercase transition-colors flex items-center gap-1"
                        title="Delete All Unlocked Filtered Units"
                    >
                        <Trash2 size={10} /> All
                    </button>
                </div>
            </div>
            <div className="space-y-2">
                {filteredUnits.length > 0 ? filteredUnits.map(unit => (
                    <div 
                        key={unit.id}
                        className={cn(
                            "flex items-center justify-between p-2 rounded-lg border text-sm cursor-pointer transition-colors",
                            selectedId === unit.id ? "bg-brand-900/20 border-brand-500/50 text-brand-300" : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800"
                        )}
                        onClick={() => {
                            try {
                                setActiveTool('select');
                                setSelectedId(unit.id);
                            } catch (err) {
                                console.error("Defensive Check: Error selecting unit from library:", err, unit);
                            }
                        }}
                    >
                        <span className="truncate max-w-[120px]">{unit.name}</span>
                        <div className="flex items-center gap-1">
                             <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!unit.locked) {
                                        handleSetUnitsWithHistory(units.map(u => u.id === unit.id ? { ...u, visible: !u.visible } : u));
                                    }
                                }}
                                disabled={unit.locked}
                                className={cn(
                                    "p-1 rounded transition-colors",
                                    unit.visible ? "text-brand-400 hover:bg-brand-500/10" : "text-slate-600 hover:bg-slate-700",
                                    unit.locked && "opacity-30 cursor-not-allowed"
                                )}
                                title={unit.locked ? "Unlock to toggle visibility" : (unit.visible ? "Hide Unit" : "Show Unit")}
                             >
                                {unit.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                             </button>
                             <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleSetUnitsWithHistory(units.map(u => u.id === unit.id ? { ...u, locked: !u.locked } : u));
                                }}
                                className={cn(
                                    "p-1 rounded transition-colors",
                                    unit.locked ? "text-amber-500 hover:bg-amber-500/10" : "text-slate-500 hover:bg-slate-700"
                                )}
                             >
                                {unit.locked ? <Lock size={12} /> : <Unlock size={12} />}
                             </button>
                             <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: (unit.fill && unit.fill !== 'rgba(0, 0, 0, 0.001)' && unit.fill !== 'transparent' && !unit.fill.startsWith('rgba(0,0,0,0')) ? unit.fill : '#3b82f6' }} />
                        </div>
                    </div>
                )) : (
                    <div className="text-center py-4 text-slate-600 text-xs italic">
                        No units match your search
                    </div>
                )}
            </div>
        </div>
          </div>
        )}
      </div>

      {/* Unit Naming Modal Overlay */}
      {isNamingModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-hidden">
          <Draggable
            disabled={typeof window !== 'undefined' && window.innerWidth < 640}
            handle=".modal-handle"
            bounds="parent"
            nodeRef={namingModalRef}
            cancel="button, input, select, textarea, .no-drag"
          >
            <div 
              ref={namingModalRef}
              className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md max-w-[calc(100vw-1rem)] sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in duration-200 my-auto pointer-events-auto"
            >
              <div className="modal-handle cursor-grab active:cursor-grabbing p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between shrink-0 select-none bg-slate-900/95">
                <div className="flex items-center gap-3">
                  <GripHorizontal className="text-slate-500 shrink-0" size={18} />
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-white uppercase tracking-wider">Assign / Create Unit Name</h3>
                    <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-tight">Enter new unit name or choose from suggestions</p>
                  </div>
                </div>
                <button 
                  onClick={() => { setIsNamingModalOpen(false); namingCallback?.reject(); }}
                  className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors no-drag"
                  title="Cancel Naming"
                >
                  <CloseIcon size={18} />
                </button>
              </div>
              
              <div className="p-4 flex flex-col flex-1 min-h-0 overflow-hidden">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (searchUnit.trim()) {
                      handleSelectUnit(searchUnit.trim());
                    }
                  }}
                  className="flex gap-2 mb-3 shrink-0"
                >
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input 
                      autoFocus
                      type="text"
                      placeholder="Type unit name & press Enter to create..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white outline-none focus:border-brand-500 transition-all font-medium"
                      value={searchUnit}
                      onChange={(e) => setSearchUnit(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!searchUnit.trim()}
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:hover:bg-brand-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shrink-0 shadow-lg shadow-brand-600/20 active:scale-95"
                  >
                    <Plus size={15} />
                    <span>Create</span>
                  </button>
                </form>
                
                <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar min-h-0 max-h-[45vh]">
                  {searchUnit.trim() && !masterUnits.some(u => u.unit.toLowerCase() === searchUnit.trim().toLowerCase()) && (
                    <button 
                      onClick={() => handleSelectUnit(searchUnit.trim())}
                      className="w-full text-left p-3 rounded-xl bg-brand-600/15 border border-brand-500/30 hover:bg-brand-600/25 transition-colors flex items-center justify-between group mb-2"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center font-bold">
                          <Plus size={16} />
                        </div>
                        <div>
                          <div className="text-white font-bold text-sm tracking-wide">Create "{searchUnit.trim()}"</div>
                          <div className="text-[10px] text-brand-400 font-bold uppercase">New Custom Unit</div>
                        </div>
                      </div>
                      <div className="px-2.5 py-1 bg-brand-600 text-white text-[10px] font-bold rounded uppercase shadow">Use</div>
                    </button>
                  )}
                  {masterUnits
                    .filter(u => u.unit.toLowerCase().includes(searchUnit.toLowerCase()))
                    .map(u => (
                      <button 
                        key={u.unit}
                        onClick={() => handleSelectUnit(u.unit)}
                        className="w-full text-left p-3 rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-between group"
                      >
                        <div>
                          <div className="text-slate-200 font-bold text-sm tracking-wide">{u.unit}</div>
                          <div className="text-[10px] text-slate-500 font-bold uppercase flex gap-2">
                             <span>Floor {u.floor}</span>
                             <span>•</span>
                             <span>{u.size} SQM</span>
                          </div>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                           <div className="px-2 py-1 bg-brand-600/20 text-brand-400 text-[10px] font-bold rounded uppercase">Select</div>
                        </div>
                      </button>
                    ))}
                  {masterUnits.filter(u => u.unit.toLowerCase().includes(searchUnit.toLowerCase())).length === 0 && !searchUnit.trim() && (
                    <div className="text-center py-8 text-slate-500 text-sm italic">
                      Type above to create a unit or search suggestions.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Draggable>
        </div>,
        document.body
      )}

      {/* Copy Background & Alignment Modal */}
      {isCopyBgModalOpen && createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Draggable handle=".copy-bg-handle" nodeRef={copyBgModalRef}>
            <div ref={copyBgModalRef} className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-slate-200">
              <div className="copy-bg-handle cursor-grab active:cursor-grabbing px-5 py-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between select-none">
                <div className="flex items-center gap-2">
                  <GripHorizontal className="text-slate-400 w-5 h-5" />
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Copy size={16} className="text-brand-400" />
                      Copy Background & Căn Chỉnh từ Version Khác
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Sao chép ảnh nền/PDF cùng toàn bộ vị trí, góc xoay và tỷ lệ scale
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCopyBgModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                  <CloseIcon size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Current Target Info */}
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
                  <span className="text-slate-400">Đang chỉnh sửa Version:</span>
                  <div className="flex items-center gap-2 font-mono font-bold">
                    <span className="px-2 py-0.5 rounded bg-brand-600/20 text-brand-300 border border-brand-500/30">
                      {activeVersion?.name || 'Active Draft'}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-purple-400">{activeVersion?.store || 'HCM'}</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-emerald-400">{activeVersion?.location || 'L1'}</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-amber-400">{activeVersion?.year || effectiveYear}</span>
                  </div>
                </div>

                {/* Search & Filter */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" />
                    <DebouncedSearchInput
                      placeholder="Tìm kiếm version theo tên, năm..."
                      value={copyBgSearchTerm}
                      onChange={(val) => setCopyBgSearchTerm(val)}
                      debounceMs={250}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none shrink-0 px-2">
                    <input
                      type="checkbox"
                      checked={showAllVersionsForCopy}
                      onChange={(e) => setShowAllVersionsForCopy(e.target.checked)}
                      className="rounded border-slate-700 text-brand-600 focus:ring-0"
                    />
                    <span>Tất cả tầng/năm</span>
                  </label>
                </div>

                {/* Version List */}
                <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                  {filteredCopyVersions.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs italic bg-slate-950/40 rounded-xl border border-slate-800">
                      Không tìm thấy version nào khác có Background {!showAllVersionsForCopy ? 'cùng Chi nhánh, Tầng và Năm' : ''}.
                    </div>
                  ) : (
                    filteredCopyVersions.map((v) => (
                      <div
                        key={v.id}
                        className="p-3 rounded-xl bg-slate-950/50 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between gap-3 group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-bold text-white text-xs truncate max-w-[200px]" title={v.name}>
                              {v.name}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {v.store || 'HCM'} • {v.location || 'L1'} • {v.year || effectiveYear}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-3 font-mono">
                            <span>Scale: <strong className="text-slate-200">{(v.backgroundScale ?? 1).toFixed(2)}x</strong></span>
                            <span>Pos: <strong className="text-slate-200">{Math.round(v.backgroundPos?.x ?? 0)}, {Math.round(v.backgroundPos?.y ?? 0)}</strong></span>
                            <span>Rot: <strong className="text-slate-200">{v.backgroundRotation ?? 0}°</strong></span>
                            <span>Zoom: <strong className="text-slate-200">{Math.round((v.imageScale ?? 1) * 100)}%</strong></span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleCopyBackgroundFromVersion(v)}
                          className="px-3.5 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-all shadow-md active:scale-95 shrink-0 flex items-center gap-1.5"
                        >
                          <Copy size={14} />
                          <span>Sao chép</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-end">
                  <button
                    onClick={() => setIsCopyBgModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </div>
          </Draggable>
        </div>,
        document.body
      )}

      {/* Dynamic Unit Summary Draggable Floating Modal */}
      {isSummaryTableOpen && createPortal(
        <div className="fixed inset-0 z-[99998] pointer-events-none flex items-center justify-center p-4">
          <Draggable handle=".summary-modal-handle" nodeRef={summaryModalRef}>
            <div 
              ref={summaryModalRef} 
              className="pointer-events-auto bg-slate-900/95 border border-slate-700/80 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden text-slate-200 backdrop-blur-md flex flex-col max-h-[85vh]"
            >
              <div className="summary-modal-handle cursor-grab active:cursor-grabbing px-5 py-3.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between select-none">
                <div className="flex items-center gap-2">
                  <GripHorizontal className="text-slate-400 w-5 h-5" />
                  <Building className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Bảng Tổng Hợp So Sánh & Màu Tô Thực Tế [{(activeVersion?.store as any) || 'HCM'} • {activeVersion?.location || 'L1'} • {activeVersion?.year || effectiveYear}]
                  </h3>
                </div>
                <button
                  onClick={() => setIsSummaryTableOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <CloseIcon size={18} />
                </button>
              </div>

              <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                <DynamicUnitSummaryTable
                  summaryList={dynamicSummaryList}
                  selectedUnitId={selectedId}
                  onSelectUnit={(uid) => {
                    setSelectedId(uid);
                  }}
                  title={`Chi tiết ${dynamicSummaryList.length} gian hàng theo bộ luật`}
                />
              </div>
            </div>
          </Draggable>
        </div>,
        document.body
      )}
    </div>
  );
}

function ToolButton({ icon: Icon, active, onClick, title, disabled }: { icon: any, active: boolean, onClick: () => void, title?: string, disabled?: boolean }) {
    return (
        <button 
            title={title}
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "p-2 sm:p-2.5 rounded-lg transition-all flex items-center justify-center",
                disabled ? "opacity-30 cursor-not-allowed" : "hover:bg-slate-800",
                active ? "bg-brand-600/30 text-brand-300 shadow-inner" : "text-slate-400"
            )}
        >
            <Icon size={17} />
        </button>
    )
}

function createGridPattern(gridSize: number) {
    const canvas = document.createElement('canvas');
    // We want the pattern texture to repeat. A multiple of gridSize is needed.
    // E.g., if gridSize is 0.1, a 10x10 tile of 100 cells can work, but for simplicity, 
    // let's use a canvas size that's exactly gridSize (if it's not too small) or a multiple of it.
    // For pattern repetition, canvas size of `gridSize * 10` is good, unless gridSize is very small.
    // If gridSize=10, size=100. If gridSize=0.1, size=10 (contains 100 cells of 0.1)
    const size = Math.max(10, Math.ceil(gridSize * 10));
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        // avoid infinite loop
        const step = Math.max(0.1, gridSize);
        for (let i = 0; i <= size; i += step) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, size);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(size, i);
            ctx.stroke();
        }
    }
    return canvas;
}

export default React.memo(EditTab);
