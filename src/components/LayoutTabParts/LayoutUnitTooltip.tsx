import React, { useMemo, useCallback, useLayoutEffect, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  MessageSquare, 
  X,
  AlertTriangle,
  Bell,
  ChevronRight,
  BarChartHorizontal,
  Image as ImageIcon,
  Link as LinkIcon,
  ExternalLink,
  Copy,
  Plus,
  Trash2,
  Maximize2,
  Check
} from 'lucide-react';
import { QuickNavButton } from '../QuickNavButton';
import { cn, parseDateTime, extractAllProjectCodes, projectMatchesUnitCode } from '../../lib/utils';
import { Project } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { useEnrichedData } from '../../hooks/useEnrichedData';
import { doc, setDoc, deleteField } from 'firebase/firestore';
import { db, APP_ID } from '../../lib/firebase';

interface LayoutUnitTooltipProps {
  hoverInfo: {
    visible: boolean;
    data: any;
    unitName: string;
    clientX?: number;
    clientY?: number;
    unitScreenBounds?: {
      left: number;
      right: number;
      top: number;
      bottom: number;
      centerX: number;
      centerY: number;
    };
  };
  tooltipRef: React.RefObject<HTMLDivElement>;
  containerRef?: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onEditProject?: (project: Project, isReadOnly?: boolean, tab?: 'details' | 'chat' | 'delegation') => void;
  onOpenMiniGantt?: (project: Project) => void;
  canWrite?: boolean;
  storeFilter?: string;
}

export function getMdStatusColorClass(mdStatus: string): string {
  if (!mdStatus) return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  
  const s = mdStatus.trim().toLowerCase();

  // 1. Signed Agreement / Contract Signed / Fully Executed / Finalized (Emerald Green)
  if (s.includes('signed agreement') || s.includes('contract signed') || s.includes('executed') || s.includes('fully signed') || s.includes('finalized') || s.includes('agreement signed')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800/80';
  }

  // 2. T&C Agreed / Terms Agreed / Commercial Agreed (Amethyst Purple / Indigo)
  if (s.includes('t&c') || s.includes('tc agreed') || s.includes('terms agreed') || s.includes('commercial agreed')) {
    return 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-800/80';
  }

  // 3. LOI Signed / LOA Signed / MOU / Pre-Agreed (Teal / Cyan)
  if (s.includes('loi') || s.includes('loa') || s.includes('mou') || s.includes('pre-agreed') || s.includes('intent')) {
    return 'bg-teal-50 text-teal-700 border-teal-300 dark:bg-teal-950/70 dark:text-teal-300 dark:border-teal-800/80';
  }

  // 4. Verbally Agreed / Verbal / Initial Talk (Warm Amber / Gold)
  if (s.includes('verbal') || s.includes('initial agreement') || s.includes('talks agreed')) {
    return 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800/80';
  }

  // 5. Renewal / Replacement / Relocation / Extension (Royal Blue)
  if (s.includes('renew') || s.includes('replace') || s.includes('relocat') || s.includes('exten')) {
    return 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800/80';
  }

  // 6. Negotiating / Discussion / Proposal Sent / Offer / Under Review / Draft (Sky Blue)
  if (s.includes('negotiat') || s.includes('discuss') || s.includes('proposal') || s.includes('offer') || s.includes('review') || s.includes('draft') || s.includes('pending')) {
    return 'bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-800/80';
  }

  // 7. Rejected / Cancelled / Terminated / Dropped / Vacant / Refused (Rose / Red)
  if (s.includes('reject') || s.includes('cancel') || s.includes('terminat') || s.includes('drop') || s.includes('vacant') || s.includes('hold') || s.includes('fail') || s.includes('refus')) {
    return 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800/80';
  }

  // 8. Generic "Agreed" or "Signed" fallback (Emerald Green)
  if (s.includes('agree') || s.includes('sign') || s.includes('approved') || s.includes('confirm')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800/80';
  }

  // Default Fallback: Cool Violet / Indigo
  return 'bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-950/70 dark:text-violet-300 dark:border-violet-800/80';
}

export const LayoutUnitTooltip: React.FC<LayoutUnitTooltipProps> = ({
  hoverInfo,
  tooltipRef,
  containerRef,
  onClose,
  onEditProject,
  onOpenMiniGantt,
  canWrite = false,
  storeFilter = 'HCM'
}) => {
  const { enrichedProjects: projects } = useEnrichedData();
  const vis = useAppStore(state => state.layoutTooltipVisibility);
  const data = hoverInfo?.data || {};
  const initialP: Project | undefined = data.matchedProject;
  const p: Project | undefined = useMemo(() => {
    if (initialP?.id) {
      const found = projects.find(item => item.id === initialP.id);
      if (found) return found;
    }
    // Only resolve project if unit actually has an associated app project
    if (!data.hasAppProject && !data.matchedProject && !data.appProjectCode) {
      return initialP;
    }
    const targetCode = String(data.appProjectCode || data.code || hoverInfo.unitName || '').trim().toLowerCase();
    if (targetCode) {
      const found = projects.find(item => {
        const itemUnitCodes = extractAllProjectCodes(item).map(c => c.toLowerCase());
        return itemUnitCodes.includes(targetCode) || projectMatchesUnitCode(itemUnitCodes, targetCode);
      });
      if (found) return found;
    }
    return initialP;
  }, [initialP, data.hasAppProject, data.matchedProject, data.appProjectCode, data.code, hoverInfo.unitName, projects]);

  // Draggable State Handling
  const isDraggingRef = useRef(false);
  const hasUserDraggedRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initialLeft: number; initialTop: number }>({
    startX: 0,
    startY: 0,
    initialLeft: 0,
    initialTop: 0
  });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a') || (e.target as HTMLElement).closest('input')) {
      return;
    }
    const el = tooltipRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    isDraggingRef.current = true;
    hasUserDraggedRef.current = true;
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialLeft: rect.left,
      initialTop: rect.top
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const el = tooltipRef.current;
    if (!el) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    const newLeft = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, dragStartRef.current.initialLeft + dx));
    const newTop = Math.max(60, Math.min(window.innerHeight - el.offsetHeight - 8, dragStartRef.current.initialTop + dy));
    el.style.left = `${newLeft}px`;
    el.style.top = `${newTop}px`;
    el.style.right = 'auto';
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Reset user dragged flag whenever a new unit is searched/focused
  useEffect(() => {
    hasUserDraggedRef.current = false;
  }, [hoverInfo.unitName, hoverInfo.clientX, hoverInfo.clientY]);

  // Auto Anti-Collision & Obstruction-Proof Positioning Engine
  const positionTooltip = useCallback(() => {
    if (!tooltipRef.current || hasUserDraggedRef.current) return;
    const el = tooltipRef.current;
    const rect = el.getBoundingClientRect();
    const tooltipWidth = rect.width > 0 ? rect.width : 350;
    const tooltipHeight = rect.height > 0 ? rect.height : 220;

    const viewportWidth = window.innerWidth;
    const visualVp = typeof window !== 'undefined' ? window.visualViewport : null;
    const viewportHeight = visualVp ? visualVp.height : window.innerHeight;
    const isMobile = viewportWidth < 640;

    const pad = 12;
    // Bottom clearance: 80px on mobile to leave room for Menu button & Home indicator, 64px on desktop
    const bottomMargin = isMobile ? 80 : 64;

    // Calculate safe top clearance to ensure the tooltip is NEVER covered by the App Header or Layout toolbars
    let safeTop = isMobile ? 152 : 115;

    // 1. Check if the map container element exists
    const containerEl = containerRef?.current || (typeof document !== 'undefined' ? (document.getElementById('live-layout-canvas-container') || document.querySelector('.cursor-grab')) : null);
    if (containerEl) {
      const cRect = containerEl.getBoundingClientRect();
      if (cRect.top > 0) {
        // Place below the container top and clear floating top controls (HCM • L1 & Zoom)
        safeTop = Math.max(safeTop, cRect.top + (isMobile ? 48 : 42));
      }
    }

    // 2. Also inspect the App Header (.sticky or header)
    if (typeof document !== 'undefined') {
      const headerEl = document.querySelector('.sticky.top-0') || document.querySelector('header');
      if (headerEl) {
        const hRect = headerEl.getBoundingClientRect();
        if (hRect.bottom > 0) {
          safeTop = Math.max(safeTop, hRect.bottom + (isMobile ? 64 : 50));
        }
      }
    }

    const bounds = hoverInfo.unitScreenBounds;

    if (isMobile) {
      // Mobile: Horizontal Auto-Centering with 12px margin
      const left = pad;
      const right = pad;
      
      // Vertical placement: When adding link or expanding panel on mobile, always anchor at safeTop
      // to guarantee header and input form are NEVER pushed off the top of the iPhone screen
      let top = safeTop;
      if (!showAddLinkInput && bounds) {
        if (bounds.centerY > viewportHeight * 0.52) {
          top = safeTop;
        } else {
          top = Math.max(safeTop, viewportHeight - tooltipHeight - bottomMargin);
        }
      }

      el.style.position = 'fixed';
      el.style.left = `${left}px`;
      el.style.right = `${right}px`;
      el.style.top = `${Math.max(safeTop, top)}px`;
      el.style.width = `calc(100vw - ${pad * 2}px)`;
      el.style.maxWidth = '420px';
      el.style.maxHeight = `calc(${Math.max(160, viewportHeight - safeTop - bottomMargin)}px)`;
      el.style.margin = '0 auto';
      el.style.transform = 'none';
    } else {
      // Desktop / Tablet: Smart 4-Way Anti-Obstruction Clamping
      let left: number;
      let top: number;

      if (bounds) {
        const spaceRight = viewportWidth - bounds.right;
        const spaceLeft = bounds.left;

        if (spaceRight >= tooltipWidth + pad + 20) {
          // Place cleanly to the right of the unit
          left = bounds.right + 24;
        } else if (spaceLeft >= tooltipWidth + pad + 20) {
          // Place cleanly to the left of the unit
          left = bounds.left - tooltipWidth - 24;
        } else {
          left = Math.max(pad, viewportWidth - tooltipWidth - pad);
        }
        top = Math.max(safeTop, Math.min(bounds.top, viewportHeight - tooltipHeight - bottomMargin));
      } else {
        const clientX = hoverInfo.clientX !== undefined ? hoverInfo.clientX : viewportWidth / 2;
        const clientY = hoverInfo.clientY !== undefined ? hoverInfo.clientY : viewportHeight / 2;

        left = clientX + 16;
        if (left + tooltipWidth > viewportWidth - pad) {
          left = clientX - tooltipWidth - 16;
        }
        left = Math.max(pad, Math.min(left, viewportWidth - tooltipWidth - pad));

        top = clientY + 16;
        if (top + tooltipHeight > viewportHeight - bottomMargin) {
          top = clientY - tooltipHeight - 16;
        }
        top = Math.max(safeTop, Math.min(top, viewportHeight - tooltipHeight - bottomMargin));
      }

      el.style.position = 'fixed';
      el.style.left = `${left}px`;
      el.style.right = 'auto';
      el.style.top = `${top}px`;
      el.style.width = '370px';
      el.style.maxWidth = `calc(100vw - ${pad * 2}px)`;
      el.style.maxHeight = `calc(${Math.max(160, viewportHeight - safeTop - bottomMargin)}px)`;
      el.style.margin = '0';
      el.style.transform = 'none';
    }
  }, [hoverInfo.clientX, hoverInfo.clientY, hoverInfo.unitScreenBounds, tooltipRef, containerRef]);

  useLayoutEffect(() => {
    positionTooltip();
  }, [positionTooltip]);

  // Continuously listen to size changes of the tooltip, window resize, and visualViewport changes
  useEffect(() => {
    if (!tooltipRef.current) return;
    const el = tooltipRef.current;
    const ro = new ResizeObserver(() => {
      positionTooltip();
    });
    ro.observe(el);
    window.addEventListener('resize', positionTooltip);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', positionTooltip);
      window.visualViewport.addEventListener('scroll', positionTooltip);
    }
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', positionTooltip);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', positionTooltip);
        window.visualViewport.removeEventListener('scroll', positionTooltip);
      }
    };
  }, [positionTooltip, tooltipRef]);

  // Progress metrics
  const planProgressPercent = p?.computedPlanProgress ?? data.planProgressPercent ?? 0;
  const actProgressPercent = p?.computedActProgress ?? data.actProgressPercent ?? 0;

  // Status computation
  const status = p?.computedStatus || data.appProjectStatus || data.status || 'On process';
  
  let statusColorClass = 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';
  const lowerStatus = String(status).toLowerCase();
  if (lowerStatus.includes('completed') || lowerStatus.includes('done')) {
    statusColorClass = 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200 dark:border-emerald-800';
  } else if (lowerStatus.includes('handover')) {
    statusColorClass = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-900/60';
  } else if (lowerStatus.includes('on process') || lowerStatus.includes('process')) {
    statusColorClass = 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800/60';
  } else if (lowerStatus.includes('delay') || lowerStatus.includes('canceled') || lowerStatus.includes('late')) {
    statusColorClass = 'bg-red-50 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/60';
  } else if (lowerStatus.includes('ready')) {
    statusColorClass = 'bg-amber-50 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/60';
  }

  // MD Status from project or layout data
  const rawMdStatus = p?.mdStatus || data.mdStatus || (p as any)?.md_status || (data as any)?.md_status || '';
  const mdStatus = (rawMdStatus && rawMdStatus !== '-' && String(rawMdStatus).trim().toLowerCase() !== 'null') 
    ? String(rawMdStatus).trim() 
    : '';

  // MD Status color class
  const mdStatusColorClass = getMdStatusColorClass(mdStatus);

  // Helper to prevent photo links/URLs from leaking into the Detail box
  const isUrlOrPhotoLine = (str: string | undefined | null) => {
    if (!str || typeof str !== 'string') return false;
    const lower = str.toLowerCase().trim();
    return (
      lower.startsWith('http://') ||
      lower.startsWith('https://') ||
      lower.startsWith('link / photo:') ||
      lower.startsWith('link:') ||
      lower.startsWith('photo:') ||
      lower.startsWith('image:') ||
      lower.includes('.jpg') ||
      lower.includes('.jpeg') ||
      lower.includes('.png') ||
      lower.includes('.webp') ||
      lower.includes('.gif')
    );
  };

  // Task lines & Details (Strictly matching General Tab logic - pure work tasks only)
  const rawTaskLines: string[] = (data.taskLines && Array.isArray(data.taskLines) && data.taskLines.length > 0)
    ? data.taskLines
    : (() => {
        if (!p) return [];
        const now = new Date();
        let activeTaskNames: string[] = [];
        if (p.taskSummaries && p.taskSummaries.length > 0) {
          const activeTasks = p.taskSummaries.filter(t => {
            if (!t.start || !t.finish) return false;
            const start = new Date(t.start);
            const finish = new Date(t.finish);
            return now >= start && now <= finish;
          });
          activeTaskNames = activeTasks.map(t => t.name).filter(Boolean);
        }
        const lines: string[] = [];
        activeTaskNames.forEach(name => {
          lines.push(...name.split('\n').map((l: string) => l.trim()).filter((l: string) => l !== ''));
        });
        return lines;
      })();

  const taskLines = rawTaskLines.filter(line => !isUrlOrPhotoLine(line));

  const rawDetailText = p?.detail || data.detail || data.appProjectDetail || data.appDetail || '';
  const detailText = isUrlOrPhotoLine(rawDetailText) ? '' : rawDetailText;
  const rawDescText = (p as any)?.description || (p?.detail !== detailText ? p?.detail : '') || data.appProjectDescription || data.appDescription || data.description || '';
  const descriptionText = isUrlOrPhotoLine(rawDescText) ? '' : rawDescText;

  // Dates
  const computedTakStart = p?.computedTakStart || p?.start || data.startDate || '';
  const computedTakCompl = p?.computedTakCompl || p?.handover || data.handoverDate || '';

  // Comments count
  const commentsCount = p?.comments?.length || 0;

  // Store display
  const storeDisplay = p?.store || data.store || storeFilter || 'HCM';
  const unitCode = p?.code || hoverInfo.unitName;
  const projectName = p?.name || data.projectName || data.brandName || '';
  const floorValue = data.floor || (p as any)?.floor;

  const targetProject: Project = p || ({
    id: `unit_${unitCode}`,
    code: unitCode,
    name: projectName || unitCode,
    store: storeDisplay,
    location: floorValue ? String(floorValue) : undefined,
  } as Project);

  // Image & Link Gallery State
  const [showImagePanel, setShowImagePanel] = useState(false);
  const [showAddLinkInput, setShowAddLinkInput] = useState(false);
  const [newLinkInput, setNewLinkInput] = useState('');
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [enlargedImage, setEnlargedImage] = useState<{ url: string; title?: string } | null>(null);
  const [customUnitImages, setCustomUnitImages] = useState<Array<{ id: string; url: string; title?: string; createdAt?: string }>>([]);

  const activeUnitStorageKey = `taka_unit_images_${data.code || unitCode || 'default'}`;

  // Load custom images from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(activeUnitStorageKey);
      if (saved) {
        setCustomUnitImages(JSON.parse(saved));
      } else {
        setCustomUnitImages([]);
      }
    } catch {
      setCustomUnitImages([]);
    }
  }, [activeUnitStorageKey]);

  // Reset panel open state when unit changes
  useEffect(() => {
    setShowImagePanel(false);
    setShowAddLinkInput(false);
  }, [data.code, unitCode]);

  // Auto-scroll tooltip to top when image panel expands to keep header visible
  useEffect(() => {
    if (showImagePanel && tooltipRef.current) {
      tooltipRef.current.scrollTop = 0;
    }
  }, [showImagePanel, tooltipRef]);

  // Close enlarged image modal with Escape key
  useEffect(() => {
    if (!enlargedImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEnlargedImage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enlargedImage]);

  const handleAddCustomImage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newLinkInput.trim();
    if (!trimmed) return;

    const newEntry = {
      id: `img_${Date.now()}`,
      url: trimmed,
      title: `Link ${customUnitImages.length + 1}`,
      createdAt: new Date().toISOString(),
    };
    const updated = [newEntry, ...customUnitImages];
    setCustomUnitImages(updated);
    setNewLinkInput('');
    setShowAddLinkInput(false);

    try {
      localStorage.setItem(activeUnitStorageKey, JSON.stringify(updated));
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('taka_unit_images_changed'));
    }

    // 🌟 Persist link without polluting taskSummaries with fake tasks
    try {
      const allProjects = useAppStore.getState().projects;
      const targetProj = p || allProjects.find(item => {
        if (item.id === p?.id) return true;
        const itemCodes = extractAllProjectCodes(item).map(c => c.toLowerCase());
        const targetCode = String(data.code || unitCode || '').toLowerCase();
        return itemCodes.includes(targetCode) || projectMatchesUnitCode(itemCodes, targetCode);
      });

      if (targetProj) {
        // Purge any legacy fake "Link / Photo:" tasks from taskSummaries to keep the task list & detail box clean
        const cleanedSummaries = (targetProj.taskSummaries || []).filter(
          ts => !ts.name?.startsWith('Link / Photo:') && !ts.name?.startsWith('http://') && !ts.name?.startsWith('https://')
        );

        const updatedProject: Project = {
          ...targetProj,
          taskSummaries: cleanedSummaries,
          imageUrl: targetProj.imageUrl || trimmed,
          thumbnail: targetProj.thumbnail || trimmed,
        };

        // 1. Instant Zustand 0ms optimistic update
        useAppStore.getState().setProjects(
          allProjects.map(proj => proj.id === targetProj.id ? updatedProject : proj)
        );

        // 2. Cloud Firestore persistence
        if (targetProj.id) {
          setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_projects", targetProj.id), {
            taskSummaries: cleanedSummaries,
            imageUrl: updatedProject.imageUrl,
            thumbnail: updatedProject.thumbnail,
          }, { merge: true }).catch(err => {
            console.error("Failed to sync to Firestore:", err);
          });
        }
      }
    } catch (err) {
      console.error("Error updating project image link:", err);
    }
  };

  const handleDeleteCustomImage = (id: string, urlToDelete?: string) => {
    const updated = customUnitImages.filter(item => item.id !== id && (urlToDelete ? item.url !== urlToDelete : true));
    setCustomUnitImages(updated);
    try {
      if (updated.length === 0) {
        localStorage.removeItem(activeUnitStorageKey);
        localStorage.removeItem(`taka_unit_images_${data.code || ''}`);
        localStorage.removeItem(`taka_unit_images_${unitCode || ''}`);
        if (p?.code) localStorage.removeItem(`taka_unit_images_${p.code}`);
      } else {
        localStorage.setItem(activeUnitStorageKey, JSON.stringify(updated));
      }
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('taka_unit_images_changed'));
    }

    // Clean up from project.taskSummaries
    try {
      const allProjects = useAppStore.getState().projects;
      const targetProj = p || allProjects.find(item => {
        if (item.id === p?.id) return true;
        const itemCodes = extractAllProjectCodes(item).map(c => c.toLowerCase());
        const targetCode = String(data.code || unitCode || '').toLowerCase();
        return itemCodes.includes(targetCode) || projectMatchesUnitCode(itemCodes, targetCode);
      });

      if (targetProj) {
        const filteredSummaries = (targetProj.taskSummaries || []).filter(
          ts => ts.link !== urlToDelete && ts.imageUrl !== urlToDelete && !ts.name?.includes(urlToDelete || '') && !ts.name?.startsWith('Link / Photo:')
        );
        const newImageUrl = targetProj.imageUrl === urlToDelete ? '' : targetProj.imageUrl;
        const newThumbnail = targetProj.thumbnail === urlToDelete ? '' : targetProj.thumbnail;
        const newPhoto = (targetProj as any).photo === urlToDelete ? '' : (targetProj as any).photo;
        const newImage = (targetProj as any).image === urlToDelete ? '' : (targetProj as any).image;

        const updatedProject: Project = {
          ...targetProj,
          taskSummaries: filteredSummaries,
          imageUrl: newImageUrl,
          thumbnail: newThumbnail,
          photo: newPhoto,
          image: newImage,
        } as Project;

        useAppStore.getState().setProjects(
          allProjects.map(proj => proj.id === targetProj.id ? updatedProject : proj)
        );

        if (targetProj.id) {
          const firestoreUpdate: Record<string, any> = {
            taskSummaries: filteredSummaries,
          };
          if (targetProj.imageUrl === urlToDelete) {
            firestoreUpdate.imageUrl = deleteField();
          }
          if (targetProj.thumbnail === urlToDelete) {
            firestoreUpdate.thumbnail = deleteField();
          }
          if ((targetProj as any).photo === urlToDelete) {
            firestoreUpdate.photo = deleteField();
          }
          if ((targetProj as any).image === urlToDelete) {
            firestoreUpdate.image = deleteField();
          }

          setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_projects", targetProj.id), firestoreUpdate, { merge: true }).catch(console.error);
        }
      }
    } catch (err) {
      console.error("Error removing from project taskSummaries:", err);
    }
  };

  const handleCopyLink = (url: string) => {
    try {
      navigator.clipboard?.writeText(url);
      setCopiedLink(url);
      setTimeout(() => setCopiedLink(null), 2000);
    } catch {}
  };

  // Consolidate all image items (user-added links, taskSummaries, layout image/thumbnail, project attachments)
  const allUnitImages = useMemo(() => {
    const list: Array<{ id: string; url: string; title: string; source: string; isCustom?: boolean }> = [];
    const seenUrls = new Set<string>();

    // 1. Project taskSummaries links (Prioritized cloud-backed task summarize)
    if (p?.taskSummaries && Array.isArray(p.taskSummaries)) {
      p.taskSummaries.forEach((ts, tsIdx) => {
        const url = ts.link || ts.imageUrl || ts.thumbnail || (typeof ts.name === 'string' ? ts.name.match(/https?:\/\/[^\s]+/)?.[0] : null);
        if (url && typeof url === 'string' && !seenUrls.has(url)) {
          seenUrls.add(url);
          list.push({
            id: `ts_${ts.id || tsIdx}_${url.slice(-8)}`,
            url: url,
            title: ts.name || `Task Summary Link ${list.length + 1}`,
            source: 'Task Summarize',
            isCustom: true,
          });
        }
      });
    }

    // 2. Custom user-posted links from localStorage
    customUnitImages.forEach((c) => {
      if (c.url && !seenUrls.has(c.url)) {
        seenUrls.add(c.url);
        list.push({
          id: c.id,
          url: c.url,
          title: c.title || 'Attached Link',
          source: 'User Link',
          isCustom: true,
        });
      }
    });

    // 3. Project direct image / thumbnail fields
    if (p?.thumbnail && typeof p.thumbnail === 'string' && !seenUrls.has(p.thumbnail)) {
      seenUrls.add(p.thumbnail);
      list.push({
        id: 'proj_thumb',
        url: p.thumbnail,
        title: 'Project Thumbnail',
        source: 'Project Data',
        isCustom: true,
      });
    }
    if (p?.imageUrl && typeof p.imageUrl === 'string' && !seenUrls.has(p.imageUrl)) {
      seenUrls.add(p.imageUrl);
      list.push({
        id: 'proj_image',
        url: p.imageUrl,
        title: 'Project Image',
        source: 'Project Data',
        isCustom: true,
      });
    }
    if ((p as any)?.image && typeof (p as any).image === 'string' && !seenUrls.has((p as any).image)) {
      seenUrls.add((p as any).image);
      list.push({
        id: 'proj_img',
        url: (p as any).image,
        title: 'Project Image',
        source: 'Project Data',
        isCustom: true,
      });
    }
    if ((p as any)?.photo && typeof (p as any).photo === 'string' && !seenUrls.has((p as any).photo)) {
      seenUrls.add((p as any).photo);
      list.push({
        id: 'proj_photo',
        url: (p as any).photo,
        title: 'Project Photo',
        source: 'Project Data',
        isCustom: true,
      });
    }

    // 4. Unit image from layout data
    if (data.imageUrl && typeof data.imageUrl === 'string' && !seenUrls.has(data.imageUrl)) {
      seenUrls.add(data.imageUrl);
      list.push({
        id: 'data_image',
        url: data.imageUrl,
        title: 'Unit Layout Image',
        source: 'Layout Data',
      });
    }
    if (data.thumbnail && typeof data.thumbnail === 'string' && !seenUrls.has(data.thumbnail)) {
      seenUrls.add(data.thumbnail);
      list.push({
        id: 'data_thumb',
        url: data.thumbnail,
        title: 'Unit Thumbnail',
        source: 'Layout Data',
      });
    }
    if (data.image && typeof data.image === 'string' && !seenUrls.has(data.image)) {
      seenUrls.add(data.image);
      list.push({
        id: 'data_img',
        url: data.image,
        title: 'Floor Image',
        source: 'Layout Data',
      });
    }

    return list;
  }, [customUnitImages, data.imageUrl, data.thumbnail, data.image, p?.taskSummaries, p?.thumbnail, p?.imageUrl, (p as any)?.image, (p as any)?.photo]);

  // Safe fallback if vis is undefined
  const v = vis || {
    projectCode: true,
    projectName: true,
    mdStatus: true,
    actStatus: true,
    legendColor: true,
    floor: true,
    startDate: true,
    endDate: true,
    detail: true,
    description: true,
    progressBars: true,
    area: true,
  };

  return (
    <div 
      ref={tooltipRef}
      className={cn(
        "fixed z-[120] pointer-events-auto rounded-xl border border-slate-200 dark:border-[#444446] shadow-2xl p-2.5 sm:p-3 flex flex-col gap-2 transition-all duration-150 select-none",
        "bg-white dark:bg-[#1e1e20] text-slate-800 dark:text-slate-100",
        "overflow-y-auto custom-scrollbar overscroll-contain touch-pan-y"
      )}
      style={{ 
        position: 'fixed',
        transformOrigin: 'top left',
        touchAction: 'pan-y'
      }}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest('.cursor-grab, .modal-handle')) {
          e.stopPropagation();
        }
      }}
    >
      {/* 1. Top Bar: Badges (MD Status & Act Status) + Action Buttons (Drag, QuickNav, Close) */}
      <div 
        onPointerDown={(e) => {
          e.stopPropagation();
          handlePointerDown(e);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="sticky top-0 z-30 bg-white/95 dark:bg-[#1e1e20]/95 backdrop-blur-md pb-1.5 pt-0.5 -mt-1 -mx-1 px-1 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1.5 cursor-grab active:cursor-grabbing select-none"
      >
        {/* Left: MD Status & Project Status Badges */}
        <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
          {/* MD Status Badge */}
          {v.mdStatus && mdStatus && (
            <div 
              className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${v.legendColor ? mdStatusColorClass : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600'} flex items-center gap-1`}
              title={`MD Status: ${mdStatus}`}
            >
              <span className="text-[8px] font-semibold uppercase opacity-75">MD:</span>
              <span className="capitalize">{mdStatus}</span>
            </div>
          )}

          {/* Project Status Badge */}
          {v.actStatus && (
            <div className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${v.legendColor ? statusColorClass : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600'}`}>
              {status}
            </div>
          )}
        </div>

        {/* Right: Actions (Image Gallery Toggle, Quick Nav, Close) */}
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          {/* Image & Link Thumbnail Gallery Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowImagePanel(prev => !prev);
            }}
            className={cn(
              "rounded-md transition-all active:scale-95 touch-manipulation cursor-pointer border flex items-center gap-1",
              allUnitImages.length > 0 ? "p-0.5" : "p-1",
              showImagePanel 
                ? "bg-blue-100 text-blue-600 dark:bg-blue-900/60 dark:text-[#8ab4f8] border-blue-400 dark:border-blue-600 shadow-2xs ring-1 ring-blue-400/40" 
                : allUnitImages.length > 0
                  ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-[#8ab4f8] border-blue-300 dark:border-blue-700/80 shadow-2xs hover:border-blue-400"
                  : "bg-slate-50 text-slate-500 hover:text-blue-600 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:text-[#8ab4f8] border-slate-200 dark:border-[#444446] hover:bg-slate-100"
            )}
            title={
              showImagePanel 
                ? "Đóng bảng hình ảnh" 
                : allUnitImages.length > 0 
                  ? `Có ${allUnitImages.length} hình ảnh/thumbnail. Bấm để xem chi tiết.` 
                  : "Mở bảng hình ảnh & link thumbnail"
            }
          >
            {allUnitImages.length > 0 ? (
              <div className="relative flex items-center gap-1">
                {/* Mini Image Thumbnail Preview */}
                <div className="w-5 h-5 rounded overflow-hidden bg-slate-100 dark:bg-slate-900 border border-blue-200 dark:border-blue-800 shrink-0 flex items-center justify-center">
                  <img 
                    src={allUnitImages[0].url} 
                    alt="Thumbnail" 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                      const parent = (e.target as HTMLElement).parentElement;
                      if (parent && !parent.querySelector('.img-fallback-icon')) {
                        const iconSpan = document.createElement('span');
                        iconSpan.className = 'img-fallback-icon flex items-center justify-center text-[10px] text-blue-500 font-bold';
                        iconSpan.innerText = '🖼️';
                        parent.appendChild(iconSpan);
                      }
                    }}
                  />
                </div>
                {allUnitImages.length > 1 ? (
                  <span className="text-[9px] font-bold font-mono text-blue-600 dark:text-[#8ab4f8] pr-1">
                    +{allUnitImages.length - 1}
                  </span>
                ) : (
                  <div className="w-1" />
                )}
              </div>
            ) : (
              <ImageIcon className="w-3.5 h-3.5" />
            )}
          </button>
          <QuickNavButton 
            project={targetProject} 
            title={`Quick Navigator (${unitCode})`}
            className="p-1 rounded-md bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-[#333336] dark:hover:text-[#8ab4f8] border border-slate-200 dark:border-[#444446]"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Close tooltip"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Full-Width Task / Unit Title */}
      <div className="w-full pt-0.5">
        <div 
          onClick={() => p && onEditProject?.(p, !canWrite, 'details')}
          className={cn(
            "font-bold text-slate-800 dark:text-[#f0f0f3] text-sm sm:text-[14px] leading-tight break-words flex items-start gap-1.5 flex-wrap",
            p ? "cursor-pointer hover:text-blue-600 dark:hover:text-[#8ab4f8] transition-colors" : ""
          )}
          title={p ? "Click to view project details" : undefined}
        >
          {v.floor && (
            <span className={cn(
              "text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded border shrink-0 inline-block my-0.5",
              storeDisplay.toLowerCase() === 'hcm' 
                ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-[#8ab4f8] dark:border-blue-800/80' 
                : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-800/80'
            )}>
              {storeDisplay}
            </span>
          )}
          {v.projectCode && <span className="font-bold font-mono text-blue-600 dark:text-[#8ab4f8]">{unitCode}</span>}
          {(v.projectCode && v.projectName && projectName) && <span className="text-slate-400 dark:text-slate-500">-</span>}
          {v.projectName && projectName && <span className="text-slate-800 dark:text-slate-100">{projectName}</span>}
          {!v.floor && !v.projectCode && (!v.projectName || !projectName) && (
            <span className="font-bold font-mono text-slate-400">{unitCode}</span>
          )}
        </div>
      </div>

      {/* Smart Alert Notification Banner (Click-to-Action) */}
      {data.alerts?.hasAlert && vis?.notifications !== false && (
        <div 
          onClick={() => {
            if (p) {
              onEditProject?.(p, !canWrite, 'details');
            }
          }}
          className={cn(
            "group flex items-start justify-between gap-2 p-2.5 rounded-xl text-xs border font-medium my-1 transition-all cursor-pointer active:scale-[0.98] touch-manipulation hover:shadow-md",
            data.alerts.level === 'critical'
              ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/50 hover:bg-red-100/70 dark:hover:bg-red-900/40"
              : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/50 hover:bg-amber-100/70 dark:hover:bg-amber-900/40"
          )}
          title="Click to inspect project & tasks"
        >
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <AlertTriangle className={cn(
              "w-4 h-4 shrink-0 mt-0.5",
              data.alerts.level === 'critical' ? "text-red-500 animate-pulse" : "text-amber-500"
            )} />
            <div className="flex-1 flex flex-col gap-0.5 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-[10.5px] uppercase tracking-wide">
                  {data.alerts.level === 'critical' ? 'Critical Alert' : 'Schedule Notice'}
                </span>
                <span className={cn(
                  "text-[9px] font-bold px-1.5 py-0.2 rounded-full",
                  data.alerts.level === 'critical' 
                    ? "bg-red-200/80 dark:bg-red-900/60 text-red-800 dark:text-red-200" 
                    : "bg-amber-200/80 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200"
                )}>
                  {data.alerts.count} issue{data.alerts.count > 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 text-[11px] mt-0.5">
                {data.alerts.reasons?.map((reason: string, idx: number) => (
                  <span key={idx} className="flex items-center gap-1.5 break-words">
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />
                    <span>{reason}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0 self-center text-[10px] font-bold opacity-80 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-blue-600 dark:text-[#8ab4f8]">
            <span>Inspect</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>
      )}

      {/* 3. Progress Bars */}
      {v.progressBars && (
        <div className="flex flex-col gap-1 px-0.5 pt-0.5">
          {/* Plan Progress */}
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase w-[70px] shrink-0">
              Plan Prg:
            </span>
            <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${Math.min(100, Math.max(0, planProgressPercent))}%` }} 
              />
            </div>
            <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-300 w-9 text-right shrink-0">
              {planProgressPercent}%
            </span>
          </div>

          {/* Actual Progress */}
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase w-[70px] shrink-0">
              Act Prg:
            </span>
            <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-emerald-500 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${Math.min(100, Math.max(0, actProgressPercent))}%` }} 
              />
            </div>
            <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-300 w-9 text-right shrink-0">
              {actProgressPercent}%
            </span>
          </div>
        </div>
      )}

      {/* 4. Unified Information Row: Floor, Area, Comment Symbol & Dates */}
      {(v.floor || v.area || v.startDate || v.endDate || commentsCount > 0) && (
        <div className="flex items-center justify-between gap-2 px-0.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex-wrap sm:flex-nowrap">
          {/* Left Side: Floor, Area & Comment Symbol */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Floor Badge */}
            {v.floor && floorValue && (
              <div className="bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700/80 flex items-center gap-1 shrink-0">
                <span className="text-[9px] text-slate-400 font-medium uppercase">Floor:</span>
                <span className="font-bold text-xs text-slate-700 dark:text-slate-200">{floorValue}</span>
              </div>
            )}

            {/* Area (if available) */}
            {v.area && data.size > 0 && (
              <div className="bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700/80 flex items-center gap-1 shrink-0">
                <span className="text-[9px] text-slate-400 font-medium uppercase">DT:</span>
                <span className="font-bold text-xs text-slate-700 dark:text-slate-200">{Number(data.size).toLocaleString('en-US')} m²</span>
              </div>
            )}

            {/* Project Chat / Comment Symbol Button */}
            {p && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditProject?.(p, false, 'chat');
                }}
                className={cn(
                  "flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border transition-all active:scale-95 touch-manipulation cursor-pointer shrink-0",
                  commentsCount > 0 
                    ? "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-800/80 hover:bg-blue-100" 
                    : "bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-[#444446] hover:text-blue-500"
                )}
                title="Open Project Comments"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {commentsCount > 0 && <span>{commentsCount}</span>}
              </button>
            )}

            {/* Modular Mini Gantt Button (Next to comments button) */}
            {p && onOpenMiniGantt && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenMiniGantt(p);
                }}
                className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all active:scale-95 touch-manipulation cursor-pointer shrink-0 shadow-xs"
                title="Open Mini Gantt Timeline"
              >
                <BarChartHorizontal className="w-3.5 h-3.5" />
                <span>Gantt</span>
              </button>
            )}
          </div>

          {/* Right Side: Start Date (Blue) & Finish Date (Pink) */}
          {(v.startDate || v.endDate) && (computedTakStart || computedTakCompl) && (
            <div className="flex gap-2 sm:gap-2.5 text-[11px] font-bold leading-tight shrink-0 ml-auto items-center">
              {v.startDate && computedTakStart && (
                <div className="text-blue-600 dark:text-[#8ab4f8] text-right">
                  {(() => {
                    const d = parseDateTime(computedTakStart);
                    if (!d) return null;
                    return (
                      <>
                        <div>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},</div>
                        <div>{d.getFullYear()}</div>
                      </>
                    );
                  })()}
                </div>
              )}
              {v.endDate && computedTakCompl && (
                <div className="text-pink-600 dark:text-pink-400 text-right">
                  {(() => {
                    const d = parseDateTime(computedTakCompl);
                    if (!d) return null;
                    return (
                      <>
                        <div>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},</div>
                        <div>{d.getFullYear()}</div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 5. Details & Description Section (Strictly matching General Tab) */}
      {((v.detail && (taskLines.length > 0 || detailText)) || (v.description && (descriptionText || detailText))) && (
        <div className="bg-slate-50/90 dark:bg-[#161618] rounded-lg p-2 sm:p-2.5 border border-slate-200/80 dark:border-[#2e2e32] text-xs shadow-2xs flex flex-col gap-1.5 mt-0.5">
          {/* Active Subtasks / Detail */}
          {v.detail && taskLines.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Detail
              </div>
              <div className="flex flex-col gap-0.5">
                {taskLines.map((line, idx) => (
                  <div 
                    key={idx} 
                    className={`font-medium text-xs leading-tight ${idx % 2 === 0 ? 'text-blue-600 dark:text-[#8ab4f8]' : 'text-orange-600 dark:text-orange-400'}`}
                  >
                    • {line}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Description (p.detail or descriptionText) */}
          {(taskLines.length === 0 ? (v.detail && detailText) : (v.description && (detailText || descriptionText))) && (
            <div className={cn("flex flex-col gap-0.5", v.detail && taskLines.length > 0 ? "pt-1 border-t border-slate-200/60 dark:border-[#2e2e32]" : "")}>
              <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {taskLines.length > 0 ? 'Description' : 'Detail'}
              </div>
              <div className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed whitespace-pre-wrap">
                {detailText || descriptionText}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. Image & Link Thumbnail Gallery Panel (Only opened when user clicks the image icon button) */}
      {(showImagePanel || showAddLinkInput) && (
        <div className="w-full bg-slate-50/95 dark:bg-[#161618] rounded-xl p-2.5 border border-slate-200 dark:border-[#333336] shadow-inner flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150 my-1">
          {/* Panel Header */}
          <div className="flex items-center justify-between gap-1.5 pb-1.5 border-b border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-1.5 font-bold text-xs text-slate-700 dark:text-slate-200 min-w-0">
              <ImageIcon className="w-3.5 h-3.5 text-blue-600 dark:text-[#8ab4f8] shrink-0" />
              <span className="truncate">Hình ảnh & Thumbnail liên kết</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-[#8ab4f8] font-mono shrink-0">
                {allUnitImages.length}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/* Top "+ Thêm" Button */}
              <button
                type="button"
                onClick={() => setShowAddLinkInput(prev => !prev)}
                className={cn(
                  "px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 touch-manipulation cursor-pointer shadow-xs",
                  showAddLinkInput 
                    ? "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200" 
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                )}
                title={showAddLinkInput ? "Đóng ô nhập link" : "Thêm link ảnh / bài viết"}
              >
                <Plus className="w-3 h-3" />
                <span>Thêm</span>
              </button>
              {/* Close Image Panel Button */}
              <button
                type="button"
                onClick={() => {
                  setShowImagePanel(false);
                  setShowAddLinkInput(false);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Đóng bảng ảnh"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Add / Post Link Input Row (Only visible when clicking "+ Thêm") */}
          {showAddLinkInput && (
            <form onSubmit={handleAddCustomImage} className="flex gap-1.5 items-center w-full animate-in fade-in slide-in-from-top-1 duration-150 py-0.5">
              <div className="relative flex-1 min-w-0">
                <LinkIcon className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input 
                  type="url"
                  value={newLinkInput}
                  onChange={(e) => setNewLinkInput(e.target.value)}
                  placeholder="Dán link ảnh hoặc link bài viết (URL)..."
                  className="w-full pl-7 pr-2 py-1.5 text-[11px] bg-white dark:bg-[#1e1e20] border border-blue-400 dark:border-blue-500 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={!newLinkInput.trim()}
                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 touch-manipulation shrink-0 cursor-pointer shadow-xs"
                title="Xác nhận thêm link"
              >
                <Check className="w-3.5 h-3.5" />
                <span>OK</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewLinkInput('');
                  setShowAddLinkInput(false);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors shrink-0"
                title="Hủy"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          {/* Image & Link Thumbnail List */}
          {allUnitImages.length === 0 ? (
            <div className="text-center py-3.5 px-2 bg-white/60 dark:bg-[#1e1e20]/60 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-xs flex flex-col items-center gap-1.5">
              <ImageIcon className="w-6 h-6 text-slate-300 dark:text-slate-600" />
              <span>Chưa có hình ảnh. Bấm nút <b>+ Thêm</b> ở trên để dán link ảnh/bài viết.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 max-h-[70vh] sm:max-h-[460px] overflow-y-auto custom-scrollbar pr-0.5">
              {allUnitImages.map((img) => (
                <div 
                  key={img.id}
                  className="bg-white dark:bg-[#1e1e20] rounded-lg border border-slate-200 dark:border-[#333336] p-2 flex flex-col gap-1.5 shadow-2xs group hover:border-blue-300 dark:hover:border-blue-800 transition-colors"
                >
                  {/* Thumbnail Image Container - Full Natural Proportions & Zero Crop */}
                  <div className="relative rounded-lg overflow-hidden bg-slate-100/90 dark:bg-slate-950/80 border border-slate-200/60 dark:border-slate-800/80 w-full max-h-[320px] sm:max-h-[360px] flex items-center justify-center group/thumb p-1">
                    <img 
                      src={img.url} 
                      alt={img.title}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                        const parent = (e.target as HTMLElement).parentElement;
                        if (parent && !parent.querySelector('.img-fallback')) {
                          const div = document.createElement('div');
                          div.className = 'img-fallback flex flex-col items-center justify-center gap-1 text-[10px] text-slate-400 p-2 text-center';
                          div.innerHTML = `<span class="font-semibold text-slate-600 dark:text-slate-300">Web Link / Article Preview</span><span class="truncate max-w-[200px] text-[9px] font-mono text-blue-500">${img.url}</span>`;
                          parent.appendChild(div);
                        }
                      }}
                      className="w-full h-auto max-h-[310px] sm:max-h-[350px] object-contain cursor-pointer hover:scale-[1.01] transition-transform duration-200 rounded-md"
                      onClick={() => setEnlargedImage({ url: img.url, title: img.title })}
                    />
                    <div className="absolute top-2 right-2 flex gap-1 opacity-90 group-hover/thumb:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => setEnlargedImage({ url: img.url, title: img.title })}
                        className="p-1.5 bg-black/70 hover:bg-black/90 text-white rounded-md backdrop-blur-xs transition-colors cursor-pointer shadow-md"
                        title="Phóng to xem ảnh HD toàn màn hình"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Link Address and Action Buttons (Only shown when clicking "+ Thêm") */}
                  {showAddLinkInput && (
                    <div className="flex items-center justify-between gap-1.5 pt-0.5 border-t border-slate-100 dark:border-slate-800/80 animate-in fade-in duration-150">
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        <LinkIcon className="w-3 h-3 text-slate-400 shrink-0" />
                        <a 
                          href={img.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[10px] font-mono text-blue-600 dark:text-[#8ab4f8] hover:underline truncate"
                          title={img.url}
                        >
                          {img.url}
                        </a>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopyLink(img.url)}
                          className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title={copiedLink === img.url ? "Đã sao chép link!" : "Sao chép link"}
                        >
                          {copiedLink === img.url ? (
                            <Check className="w-3 h-3 text-green-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                        <a
                          href={img.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Mở link trong tab mới"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        {img.isCustom && (
                          <button
                            type="button"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDeleteCustomImage(img.id, img.url);
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer active:scale-95 touch-manipulation flex items-center justify-center"
                            title="Xóa link này"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500 hover:text-red-600" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Enlarged Image Lightbox Modal (Rendered via Portal to document.body for iPad/Safari compatibility) */}
      {enlargedImage && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            e.stopPropagation();
            setEnlargedImage(null);
          }}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <div 
            className="relative max-w-4xl w-full max-h-[92vh] bg-slate-900/95 rounded-2xl overflow-hidden shadow-2xl border border-slate-700/80 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <ImageIcon className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="font-bold text-xs truncate">{enlargedImage.title || 'Image Preview'}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopyLink(enlargedImage.url)}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  title="Sao chép link"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <a
                  href={enlargedImage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  title="Mở tab mới"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setEnlargedImage(null)}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  title="Đóng"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 p-2 sm:p-4 flex items-center justify-center bg-black/60 overflow-hidden min-h-[220px]">
              <img 
                src={enlargedImage.url} 
                alt={enlargedImage.title || 'Enlarged Preview'} 
                className="max-w-full max-h-[75vh] object-contain rounded-xl select-none"
              />
            </div>
            <div className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center gap-2 shrink-0">
              <LinkIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <a 
                href={enlargedImage.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[11px] font-mono text-blue-400 hover:underline truncate flex-1"
              >
                {enlargedImage.url}
              </a>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
