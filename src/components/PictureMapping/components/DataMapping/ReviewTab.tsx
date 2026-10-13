import React, { useState, useEffect, useRef } from "react";
import { useShallow } from 'zustand/react/shallow';
import { createPortal } from 'react-dom';
import { Stage, Layer, Rect, Circle, Line, Image as KonvaImage, Text, Group } from 'react-konva';
import useImage from 'use-image';
import { useOffscreenImage } from '../../../../hooks/useOffscreenImage';
import { Layout, Eye, Camera, FileDown, Link as LinkIcon, Check, Copy, X, Tags, ZoomIn, ZoomOut, Maximize2, ChevronLeft, ChevronRight, GripHorizontal, MapPin, Calendar, Building, Calculator, CloudUpload } from 'lucide-react';
import Draggable from 'react-draggable';
import { UnitShape, MapVersion } from './types';
import { cn } from '../../lib/utils';
import { enrichProjects, getStatus, computeProjectActStatus, extractAllProjectCodes, projectMatchesUnitCode, extractProjectMetadata, projectMatchesScope } from '../../../../lib/utils';
import type { jsPDF } from 'jspdf';
import { useSummaryData, generateSizeLabel, generateSizeLabelLines } from '../../lib/summaryData';
import { useDataStore } from '../../DataContext';
import { useAppStore } from '../../../../store/useAppStore';
import { applyAllDynamicRulesForStore } from '../../lib/dynamicExportService';
import { uploadFileToDrive } from '../../lib/drive';
import { initAuth, googleSignIn, getAccessToken } from '../../lib/auth';
import R2UploadModal from '../R2UploadModal';
import { uploadFilesToR2, resolveR2UrlToHttp } from '../../lib/r2Upload';
import { useDynamicUnitSummary } from '../../lib/dynamicSummaryEngine';
import { DynamicUnitSummaryTable } from './DynamicUnitSummaryTable';

interface ReviewTabProps {
  units: UnitShape[];
  setUnits: (units: UnitShape[]) => void;
  versions: MapVersion[];
  setVersions: (versions: MapVersion[]) => void;
  activeVersionId?: string | null;
  store?: 'HCM' | 'HN';
  location?: string;
  year?: string;
}

const AVAILABLE_LABELS = [
    'Unit ID', 'Size SQM', 'Floor', 'Brand Code', 'Brand Name', 'Vendor Code',
    'Name', 'Class Code', 'Update', 'Status', 'MD Status', 'MD Notes', 'Task', 'Project Status', 'Act: Status',
    'Start Date', 'End Date',
    'Sales', 'Sales By CP', 'Sales By HCM Categ',
    'Profit', 'Profit By CP', 'Profit By HCM Categ',
    'Margin', 'Margin By CP', 'HCM Margin',
    'HCM Sales Effi'
];

function ReviewTab({ units, setUnits, versions, setVersions, activeVersionId: initialActiveVersionId, store: propStore, location: propLocation }: ReviewTabProps) {
  const projects = useAppStore(state => state.projects);
  const tasks = useAppStore(state => state.tasks);
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const setGlobalYearFilter = useAppStore(state => state.setGlobalYearFilter);

  const { store: storeFromState, location: locationFromState, reviewSelectedLabels: selectedLabels, setReviewSelectedLabels: setSelectedLabels, reviewLabelColors, setReviewLabelColors } = useDataStore(useShallow(state => ({
    store: state.store,
    location: state.location,
    reviewSelectedLabels: state.reviewSelectedLabels,
    reviewLabelColors: state.reviewLabelColors,
    setReviewLabelColors: state.setReviewLabelColors,
    setReviewSelectedLabels: state.setReviewSelectedLabels,
  })));

  const store = propStore || storeFromState || 'HCM';
  const location = propLocation || locationFromState || 'L1';

  const availableYears = React.useMemo(() => {
    const currentYr = new Date().getFullYear().toString();
    const baseYears = ['2024', '2025', '2026', '2027', '2028'];
    const projectYears = projects.map(p => p.year ? String(p.year) : '').filter(Boolean);
    const taskYears = tasks.map(t => t.projectYear ? String(t.projectYear) : '').filter(Boolean);
    const versionYears = versions.map(v => v.year ? String(v.year) : '').filter(Boolean);
    const allYrs = Array.from(new Set([currentYr, ...baseYears, ...projectYears, ...taskYears, ...versionYears]))
      .filter(y => y && y.toLowerCase() !== 'all')
      .sort((a, b) => Number(b) - Number(a));
    return allYrs;
  }, [projects, tasks, versions]);

  const effectiveYear = (globalYearFilter && globalYearFilter !== 'all')
    ? globalYearFilter
    : (availableYears[0] || new Date().getFullYear().toString());

  // Filter versions strictly by store, location, and effective year (with smart fallback to latest floor drawing)
  const filteredVersions = React.useMemo(() => {
    const sTarget = String(store || 'HCM').toUpperCase().trim();
    const lTarget = String(location || 'L1').toUpperCase().trim();
    const tokenRegex = new RegExp(`(^|[^a-zA-Z0-9])${lTarget}([^a-zA-Z0-9]|$)`, 'i');

    const matched = versions.filter(v => {
      const matchStore = !v.store || v.store.toUpperCase().trim() === sTarget;
      const vLoc = (v.location || '').toUpperCase().trim();
      const vName = (v.name || '').toUpperCase().trim();
      const matchLoc = vLoc === lTarget || (vLoc === '' && tokenRegex.test(vName));
      return matchStore && matchLoc;
    });

    if (matched.length === 0) return [];

    const yearMatched = matched.filter(v => String(v.year || '').trim() === String(effectiveYear).trim());
    if (yearMatched.length > 0) return yearMatched;

    // Fallback: if no drawing exists specifically for effectiveYear, fallback to the latest available drawing for this floor
    return [...matched].sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
  }, [versions, store, location, effectiveYear]);

  const [activeVersionId, setActiveVersionId] = useState<string | null>(initialActiveVersionId || filteredVersions[0]?.id || null);

  useEffect(() => {
    if (initialActiveVersionId && filteredVersions.some(v => v.id === initialActiveVersionId)) {
      setActiveVersionId(prev => (prev !== initialActiveVersionId ? initialActiveVersionId : prev));
    } else if (filteredVersions.length > 0) {
      setActiveVersionId(prev => {
        if (prev && filteredVersions.some(v => v.id === prev)) return prev;
        return filteredVersions[0].id;
      });
    } else if (filteredVersions.length === 0) {
      setActiveVersionId(prev => (prev !== null ? null : prev));
    }
  }, [initialActiveVersionId, filteredVersions]);

  const activeVersion = versions.find(v => v.id === activeVersionId);
  const summaryData = useSummaryData();

  // Dynamic Event-Driven Unit Summary Engine
  const { summaryMap: dynamicSummaryMap, summaryList: dynamicSummaryList } = useDynamicUnitSummary({
    units,
    activeVersion,
    store: (activeVersion?.store as any) || store,
    location: activeVersion?.location || location,
    year: String(effectiveYear),
  });

  const [isSummaryTableOpen, setIsSummaryTableOpen] = useState(false);
  const [selectedReviewUnitId, setSelectedReviewUnitId] = useState<string | null>(null);
  const summaryModalRef = useRef<HTMLDivElement>(null);

  const [showLabelSettings, setShowLabelSettings] = useState(false);

  // Optimize units rendering by pre-calculating styles, bbox, and filtering
  const styledUnits = React.useMemo(() => {
    if (!activeVersion) return [];

    const summaryMap = new Map();
    summaryData.forEach(s => summaryMap.set(s.unit, s));

    const activeLoc = String(activeVersion.location || location || '').toUpperCase().trim();

    // Prefer candidate units from activeVersion.mapUnits if present
    const candidateUnits = (Array.isArray(activeVersion?.mapUnits) && activeVersion.mapUnits.length > 0)
      ? activeVersion.mapUnits
      : units;

    // Pre-index groupMappings from activeVersion
    const unitToGroupStyle = new Map<string, { color: string; opacity: number; groupId: string }>();
    if (activeVersion.groups && activeVersion.groupMappings) {
      activeVersion.groups.forEach((group: any) => {
        const assignedIds = activeVersion.groupMappings[group.id] || [];
        assignedIds.forEach((id: string) => {
          unitToGroupStyle.set(String(id).toLowerCase().trim(), {
            color: group.color,
            opacity: typeof group.opacity === 'number' ? group.opacity : 0.65,
            groupId: group.id
          });
        });
      });
    }

    return candidateUnits
      .filter(unit => {
        const uLoc = String(unit.location || '').toUpperCase().trim();
        if (activeLoc && uLoc && uLoc !== activeLoc) return false;
        return true;
      })
      .map(unit => {
        const uName = String(unit.name || '').toLowerCase().trim();
        const uId = String(unit.id || '').toLowerCase().trim();
        const dynamicItem = dynamicSummaryMap.get(unit.id) || (uName ? dynamicSummaryMap.get(uName) : null);
        
        let displayColor = 'rgba(0, 0, 0, 0.001)';
        let displayOpacity = 0.85;
        let hasMatchedColor = false;

        if (dynamicItem?.matchedGroupId && dynamicItem?.color) {
          displayColor = dynamicItem.color;
          displayOpacity = dynamicItem.opacity ?? 0.85;
          hasMatchedColor = true;
        } else if (unitToGroupStyle.has(uId)) {
          const g = unitToGroupStyle.get(uId)!;
          displayColor = g.color;
          displayOpacity = g.opacity;
          hasMatchedColor = true;
        } else if (uName && unitToGroupStyle.has(uName)) {
          const g = unitToGroupStyle.get(uName)!;
          displayColor = g.color;
          displayOpacity = g.opacity;
          hasMatchedColor = true;
        } else if ((unit as any).targetColor) {
          displayColor = (unit as any).targetColor;
          displayOpacity = (unit as any).targetOpacity ?? 0.65;
          hasMatchedColor = true;
        } else if (dynamicItem?.hasAppProject && dynamicItem?.appProjectStatus) {
          const st = String(dynamicItem.appProjectStatus).toLowerCase().trim();
          if (st === 'completed') { displayColor = '#10b981'; displayOpacity = 0.85; hasMatchedColor = true; }
          else if (st === 'on process' || st === 'in progress') { displayColor = '#3b82f6'; displayOpacity = 0.85; hasMatchedColor = true; }
          else if (st === 'delay' || st === 'delayed' || st === 'overdue') { displayColor = '#ef4444'; displayOpacity = 0.85; hasMatchedColor = true; }
          else if (st === 'upcoming') { displayColor = '#f59e0b'; displayOpacity = 0.85; hasMatchedColor = true; }
        } else if (unit.fill && unit.fill !== 'transparent' && !unit.fill.startsWith('rgba(0,0,0,0') && unit.fill !== 'rgba(0, 0, 0, 0.001)') {
          displayColor = unit.fill;
          displayOpacity = unit.opacity ?? 0.65;
          hasMatchedColor = true;
        }

        const uInfo = summaryMap.get(unit.name);
        const sizeLabelLines = generateSizeLabelLines(unit, uInfo, selectedLabels);
        const sizeLabel = generateSizeLabel(unit, uInfo, selectedLabels);

        // Pre-calculate Bounding Box (O(1)) to eliminate array filtering in JSX
        let bbox = { x: unit.x, y: unit.y, width: unit.width || 100, height: unit.height || 30 };
        if (unit.type === 'circle') {
          const r = unit.radius || 0;
          bbox = { x: unit.x - r, y: unit.y - r, width: r * 2, height: r * 2 };
        } else if (unit.type === 'polygon' && unit.points && unit.points.length >= 2) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (let i = 0; i < unit.points.length; i += 2) {
            const px = unit.points[i];
            const py = unit.points[i + 1];
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
          }
          bbox = { x: minX, y: minY, width: Math.max(10, maxX - minX), height: Math.max(10, maxY - minY) };
        }

        return {
          ...unit,
          displayColor,
          displayOpacity: hasMatchedColor ? displayOpacity : 0.85,
          hasMatchedColor,
          sizeLabelLines,
          sizeLabel,
          bbox
        };
      });
  }, [units, activeVersion, summaryData, dynamicSummaryMap, selectedLabels, location]);

  const [resolvedBgUrl, setResolvedBgUrl] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const rawUrl = activeVersion?.backgroundUrl || '';
    if (!rawUrl) {
      setResolvedBgUrl('');
      return;
    }
    if (rawUrl.startsWith('r2://') || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://') && !rawUrl.startsWith('data:') && !rawUrl.startsWith('blob:'))) {
      resolveR2UrlToHttp(rawUrl).then(url => {
        if (isMounted) setResolvedBgUrl(url || rawUrl);
      }).catch(() => {
        if (isMounted) setResolvedBgUrl(rawUrl);
      });
    } else {
      setResolvedBgUrl(rawUrl);
    }
    return () => { isMounted = false; };
  }, [activeVersion?.backgroundUrl]);

  const [image] = useOffscreenImage(resolvedBgUrl || activeVersion?.backgroundUrl || '', 'anonymous');
  const [scale, setScale] = useState(activeVersion?.backgroundScale || 1);
  const [position, setPosition] = useState(activeVersion?.backgroundPos || { x: 0, y: 0 });
  const [copiedLink, setCopiedLink] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareImage, setShareImage] = useState<string | null>(null);
  const [actualShareLink, setActualShareLink] = useState('');
  
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });


  const copyToClipboard = () => {
      navigator.clipboard.writeText(actualShareLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleOpenShareModal = () => {
      if (!stageRef.current) return;
      const dataURL = stageRef.current.toDataURL({ pixelRatio: 1, mimeType: 'image/jpeg', quality: 0.8 });
      setShareImage(dataURL);
      
      const isAll = window.confirm('Bạn muốn xuất link cho TẤT CẢ các bản vẽ (OK) hay chỉ bản vẽ HIỆN TẠI (Cancel)?');
      const linkParam = isAll ? 'all' : (activeVersionId || '');
      const labelsParam = selectedLabels.length ? `&labels=${encodeURIComponent(selectedLabels.join(','))}` : '';
      setActualShareLink(`${window.location.origin}${window.location.pathname}?reviewOnly=${linkParam}${labelsParam}`);
      
      setShowShareModal(true);
      setCopiedLink(false);
  };

  const [exportAllFormat, setExportAllFormat] = useState<'pdf' | 'jpeg' | 'r2_jpeg' | 'drive' | null>(null);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const shareModalRef = useRef<HTMLDivElement>(null);
  const exportModalRef = useRef<HTMLDivElement>(null);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'jpeg' | 'r2_jpeg' | 'drive'>('pdf');
  const [exportPaperSize, setExportPaperSize] = useState<'a4' | 'a3' | 'a2' | 'original'>(() => {
      return (localStorage.getItem('export_paper_size') as any) || 'a4';
  });
  const [exportQuality, setExportQuality] = useState<'high' | 'medium' | 'low'>(() => {
      return (localStorage.getItem('export_quality') as any) || 'medium';
  });
  const [selectedVersionsToExport, setSelectedVersionsToExport] = useState<Record<string, boolean>>({});
  const [showR2Modal, setShowR2Modal] = useState(false);
  const [isUploadingToR2, setIsUploadingToR2] = useState(false);
  const [r2UploadProgress, setR2UploadProgress] = useState(0);
  const [r2StatusMessage, setR2StatusMessage] = useState('');

  const handleExportAllManagerComplete = async (success: boolean, data?: any) => {
    if (exportAllFormat === 'r2_jpeg') {
        if (!success || !data || (Array.isArray(data) && data.length === 0)) {
            alert('Lỗi tạo ảnh JPEG cho bản vẽ.');
            setExportAllFormat(null);
            setIsUploadingToR2(false);
            setShowR2Modal(false);
            setR2UploadProgress(0);
            setR2StatusMessage('');
            return;
        }

        setIsUploadingToR2(true);
        setShowR2Modal(true);
        try {
            const filesToUpload = Array.isArray(data) ? data : [{ blob: data as Blob, name: 'Data_Mapping_Export' }];
            
            const uploadResult = await uploadFilesToR2(filesToUpload, ({ percent, statusText }) => {
                setR2UploadProgress(percent);
                setR2StatusMessage(statusText);
            });

            if (uploadResult.failedCount === 0) {
                alert(`Upload thành công ${uploadResult.successCount} bản vẽ lên Cloudflare R2!\n(Đã cập nhật đúng tên file của phiên bản tương ứng, bảo toàn toàn bộ dữ liệu khác trong bucket).`);
            } else if (uploadResult.successCount > 0) {
                const failedNames = uploadResult.results.filter(r => !r.success).map(r => `${r.name}: ${r.error}`).join('\n- ');
                alert(`Upload hoàn tất: ${uploadResult.successCount}/${uploadResult.total} file thành công.\nCó ${uploadResult.failedCount} file thất bại:\n- ${failedNames}`);
            } else {
                const errors = uploadResult.results.map(r => `${r.name}: ${r.error}`).join('\n- ');
                alert(`Upload thất bại toàn bộ ${uploadResult.total} file lên Cloudflare R2:\n- ${errors}`);
            }
        } catch (err: any) {
            console.error('[R2 Upload Error]', err);
            alert('Lỗi upload Cloudflare R2: ' + (err.message || 'Lỗi không xác định'));
        } finally {
            setIsUploadingToR2(false);
            setShowR2Modal(false);
            setExportAllFormat(null);
            setR2UploadProgress(0);
            setR2StatusMessage('');
        }
    } else {
        setExportAllFormat(null);
    }
  };

  const startR2Export = () => {
      setExportAllFormat('r2_jpeg');
  };

  useEffect(() => {
    const unsubscribe = initAuth();
    return () => unsubscribe();
  }, []);

  useEffect(() => {
      const savedSelStr = localStorage.getItem('export_selected_versions');
      let savedSel: Record<string, boolean> = {};
      try {
          if (savedSelStr) {
              savedSel = JSON.parse(savedSelStr);
          }
      } catch (e) {
          console.error(e);
      }

      const sel: Record<string, boolean> = {};
      versions.forEach(v => {
          if (savedSel && typeof savedSel[v.id] === 'boolean') {
              sel[v.id] = savedSel[v.id];
          } else {
              sel[v.id] = true;
          }
      });
      setSelectedVersionsToExport(sel);
  }, [versions]);

  useEffect(() => {
      if (Object.keys(selectedVersionsToExport).length > 0) {
          localStorage.setItem('export_selected_versions', JSON.stringify(selectedVersionsToExport));
      }
  }, [selectedVersionsToExport]);

  useEffect(() => {
      localStorage.setItem('export_paper_size', exportPaperSize);
  }, [exportPaperSize]);

  useEffect(() => {
      localStorage.setItem('export_quality', exportQuality);
  }, [exportQuality]);

  const handleExportClick = async (format: 'pdf' | 'jpeg' | 'r2_jpeg' | 'drive') => {
      if (format === 'drive') {
          let token = await getAccessToken();
          if (!token) {
              const res = await googleSignIn().catch(() => null);
              if (res) token = res.accessToken;
          }
          if (!token) return; // User closed modal or failed
      }
      if (format === 'r2_jpeg') {
          const targetId = activeVersionId || versions[0]?.id;
          if (targetId) {
              setSelectedVersionsToExport({ [targetId]: true });
          }
      }
      setExportFormat(format);
      setExportModalVisible(true);
  };

  const handleConfirmExport = () => {
      setExportModalVisible(false);
      if (exportFormat === 'r2_jpeg') {
          setShowR2Modal(true);
      } else {
          setExportAllFormat(exportFormat);
      }
  };

  const handleExportJPEG = () => handleExportClick('jpeg');
  const handleExportPDF = () => handleExportClick('pdf');
  const handleExportDrive = () => handleExportClick('drive');
  const handleExportR2 = () => handleExportClick('r2_jpeg');

  const unitMap = React.useMemo(() => new Map(units.map(u => [u.id, u])), [units]);

  const appProjects = useAppStore(state => state.projects);
  const appTasks = useAppStore(state => state.tasks);
  const appDelegationGroups = useAppStore(state => state.delegationGroups);

  const aggregatedData = React.useMemo(() => {
    const dataMap: Record<string, any> = {};

    units.forEach((u) => {
      const uName = (u.name || '').toLowerCase();
      if (!uName) return;
      dataMap[uName] = {
        name: u.name || '',
        id: u.id,
        unit: u.name || '',
        size: 0,
        sales: 0,
        salesAmount: 0,
        salesByCp: 0,
        salesByHcmcate: 0,
        profit: 0,
        profitAmount: 0,
        profitByCp: 0,
        profitByHcmcate: 0,
        margin: 0,
        marginByCp: 0,
        hcmSalesEffi: 0,
        hcmMargin: 0,
        mdStatus: "",
        mdNotes: "",
        task: "",
        projectStatus: "",
        actStatus: "",
        startDate: "",
        endDate: "",
        status: "",
        vendorCode: "",
        brandCode: "",
        brandName: "",
        classCode: "",
        floor: "",
        appProjectStatus: "",
        appProjectBudget: 0,
        appProjectActual: 0,
        appProjectCode: "",
        appProjectYear: "",
      };
    });

    summaryData.forEach((sumData) => {
      const key = sumData.unit?.toLowerCase();
      if (key && dataMap[key]) {
        dataMap[key].size = sumData.size || 0;
        dataMap[key].sales = sumData.salesAmount || 0;
        dataMap[key].salesAmount = sumData.salesAmount || 0;
        dataMap[key].salesByCp = sumData.salesByCp || 0;
        dataMap[key].salesByHcmcate = sumData.salesByHcmcate || 0;
        dataMap[key].profit = sumData.profitAmount || 0;
        dataMap[key].profitAmount = sumData.profitAmount || 0;
        dataMap[key].profitByCp = sumData.profitByCp || 0;
        dataMap[key].profitByHcmcate = sumData.profitByHcmcate || 0;
        dataMap[key].margin = sumData.margin || 0;
        dataMap[key].marginByCp = sumData.marginByCp || 0;
        dataMap[key].hcmSalesEffi = sumData.hcmSalesEffi || 0;
        dataMap[key].hcmMargin = sumData.hcmMargin || 0;
        dataMap[key].mdStatus = sumData.mdStatus || "";
        dataMap[key].mdNotes = sumData.mdNotes || "";
        dataMap[key].task = sumData.task || "";
        dataMap[key].projectStatus = sumData.projectStatus || "";
        dataMap[key].actStatus = sumData.actStatus || "";
        dataMap[key].startDate = sumData.startDate || "";
        dataMap[key].endDate = sumData.endDate || "";
        dataMap[key].status = sumData.status || "";
        dataMap[key].vendorCode = sumData.vendorCode || "";
        dataMap[key].brandCode = sumData.brandCode || "";
        dataMap[key].brandName = sumData.brandName || "";
        dataMap[key].classCode = sumData.classCode || "";
        dataMap[key].floor = (sumData as any).floor || "";
      }
    });

    const enrichedProjects = enrichProjects(appProjects || [], appTasks || [], appDelegationGroups || []);
    enrichedProjects.forEach((p) => {
      if (!p.code && !p.linkCodes) return;

      const pMeta = extractProjectMetadata(p);
      if (!projectMatchesScope(pMeta, { store, location, year: effectiveYear })) return;

      const pCodes = extractAllProjectCodes(p);
      const status = getStatus(
        p.computedTakStart || p.start,
        p.computedTakCompl || p.handover,
        p.computedOpening || p.opening,
        p.code
      );
      const actStatus = (p as any).computedActStatus || (p as any).actStatus || computeProjectActStatus(p, appDelegationGroups);
      const detailStr = p.detail || '';
      const descStr = p.detail || (p as any).description || '';
      const partyStr = p.party || (p as any).contractor || '';
      const mdStatusStr = p.mdStatus || '';

      const targetUnitKeys = new Set<string>();
      Object.keys(dataMap).forEach(uKey => {
        const uEntry = dataMap[uKey];
        if (!uEntry) return;
        const uStore = (uEntry.store || store || '').toUpperCase().trim();
        const uLoc = (uEntry.location || location || '').toUpperCase().trim();
        const uYr = String(uEntry.year || effectiveYear || '').trim();

        if (pMeta.store && uStore && pMeta.store !== uStore) return;
        const isStorewide = pMeta.location === 'ALL' || pMeta.location === 'STORE' || pMeta.location === 'STOREWIDE' || pMeta.location === 'WHOLE STORE' || pMeta.location === 'ALL FLOORS';
        if (pMeta.location && uLoc && !isStorewide && pMeta.location !== uLoc) return;
        if (pMeta.year && uYr && pMeta.year !== uYr) return;

        const isExactCode = pCodes.some(c => c.toLowerCase() === uKey.toLowerCase() || (uEntry.name && c.toLowerCase() === uEntry.name.toLowerCase()));
        if (isExactCode || projectMatchesUnitCode(pCodes, uKey) || (uEntry.name && projectMatchesUnitCode(pCodes, uEntry.name))) {
          targetUnitKeys.add(uKey);
        }
      });

      targetUnitKeys.forEach((code) => {
        if (dataMap[code]) {
          dataMap[code].hasAppProject = true;
          dataMap[code].appProjectStatus = status;
          dataMap[code].appProjectBudget = p.budget || 0;
          dataMap[code].appProjectActual = p.actual || 0;
          dataMap[code].appProjectCode = String(p.code || code);
          dataMap[code].appProjectYear = pMeta.year || (p.year ? String(p.year) : String(effectiveYear));
          dataMap[code].year = pMeta.year || (p.year ? String(p.year) : String(effectiveYear));

          dataMap[code].appProjectMdStatus = mdStatusStr;
          dataMap[code].appMdStatus = mdStatusStr;

          dataMap[code].appProjectActStatus = actStatus;
          dataMap[code].appActStatus = actStatus;

          dataMap[code].appProjectDetail = detailStr;
          dataMap[code].appDetail = detailStr;

          dataMap[code].appProjectDescription = descStr;
          dataMap[code].appDescription = descStr;

          dataMap[code].appProjectParty = partyStr;
          dataMap[code].appParty = partyStr;

          if (!dataMap[code].projectStatus) dataMap[code].projectStatus = status;
          if (!dataMap[code].task) dataMap[code].task = (p as any).title || (p as any).name || '';
          if (!dataMap[code].startDate && (p.computedTakStart || p.start)) dataMap[code].startDate = p.computedTakStart || p.start;
          if (!dataMap[code].endDate && (p.computedOpening || p.opening)) dataMap[code].endDate = p.computedOpening || p.opening;
        }
      });
    });

    return dataMap;
  }, [units, summaryData, appProjects, appTasks, appDelegationGroups, effectiveYear, store]);

  const applyAllDynamicRules = () => {
    try {
      const { totalEvaluatedUnits } = applyAllDynamicRulesForStore(store);
      const allUpdatedVersions = useDataStore.getState().getAllStoreVersions(store);
      const allUpdatedUnits = useDataStore.getState().getAllStoreUnits(store);

      setVersions(allUpdatedVersions);
      setUnits(allUpdatedUnits);

      alert(`Đã áp dụng điều kiện logic cho toàn bộ các version trên tất cả các tầng tại ${store}. Màu sắc phân loại đã được đồng bộ chuẩn xác!`);
    } catch (err: any) {
      console.error("Lỗi khi áp dụng rules:", err);
      alert(`Có lỗi xảy ra khi áp dụng rules: ${err?.message || err}`);
    }
  };

  const [isReviewSidebarCollapsed, setIsReviewSidebarCollapsed] = useState(false);

  const handleZoomIn = () => {
    setScale(prev => Math.min(10, prev * 1.2));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(0.05, prev / 1.2));
  };

  const handleZoomReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleFitToScreen = () => {
    if (!image || !containerRef.current) return;
    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;
    if (containerW <= 0 || containerH <= 0) return;

    const imgW = (image.width || 1000) * (activeVersion?.imageScale || 1);
    const imgH = (image.height || 800) * (activeVersion?.imageScale || 1);

    const scaleX = (containerW - 40) / imgW;
    const scaleY = (containerH - 40) / imgH;
    const fitScale = Math.min(scaleX, scaleY, 1.5);
    const clampedScale = Math.max(0.05, Math.min(fitScale, 5));

    setScale(clampedScale);
    setPosition({
      x: (containerW - imgW * clampedScale) / 2,
      y: (containerH - imgH * clampedScale) / 2,
    });
  };

  useEffect(() => {
    if (activeVersion) {
        setScale(activeVersion.backgroundScale || 1);
        setPosition(activeVersion.backgroundPos || { x: 0, y: 0 });
    }
  }, [activeVersionId]);

  useEffect(() => {
    if (image && containerRef.current && (!activeVersion?.backgroundScale || activeVersion.backgroundScale === 1)) {
      handleFitToScreen();
    }
  }, [image]);

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

  if (!activeVersion) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 italic">
        <Layout size={48} className="mb-4 opacity-20" />
        <p>Không có phiên bản nào. Hãy tạo phiên bản trong Edit hoặc Hierarchy tab.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-2 p-1.5 sm:p-2.5 overflow-hidden">
      {/* Selection Header */}
      <div className="flex items-center justify-between p-2.5 sm:p-3 bg-slate-900/90 rounded-xl border border-slate-800 glass relative z-50 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600/20 text-brand-400 rounded-lg flex items-center justify-center">
            <Eye size={18} />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Mapping Review</h4>
            <p className="text-[9px] sm:text-[10px] text-slate-500 uppercase font-bold tracking-tight">XEM TRƯỚC PHIÊN BẢN THEO NHÓM</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          <button
            onClick={() => setIsSummaryTableOpen(prev => !prev)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all shadow-md",
              isSummaryTableOpen 
                ? "bg-emerald-600 text-white border border-emerald-400 ring-2 ring-emerald-500/30 shadow-emerald-900/30" 
                : "bg-slate-950 hover:bg-slate-800 text-emerald-400 border border-slate-800 hover:border-emerald-500/50"
            )}
            title="Mở Bảng Tổng Hợp So Sánh & Màu Tô Thực Tế (Dynamic Unit Summary)"
          >
            <Building size={13} className="text-emerald-400" />
            <span>Summary Table</span>
            <span className="px-1.5 py-0.2 text-[9px] font-mono rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
              {dynamicSummaryList.length}
            </span>
          </button>

          <button
            onClick={applyAllDynamicRules}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold uppercase transition-colors shadow-lg shadow-brand-900/20 box-border border border-brand-400"
          >
            <Calculator size={13} /> Apply Rules
          </button>
          
          <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5">
             <button onClick={handleExportJPEG} title="Save to JPEG" className="px-2.5 py-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded flex items-center justify-center transition-colors text-xs">
               <Camera size={13} className="mr-1.5" /> JPEG
             </button>
             <button onClick={handleExportPDF} title="Save to PDF" className="px-2.5 py-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded flex items-center justify-center transition-colors text-xs">
               <FileDown size={13} className="mr-1.5" /> PDF
             </button>
             <button onClick={handleExportDrive} title="Upload to Google Drive" className="px-2.5 py-1.5 hover:bg-slate-800 text-slate-400 hover:text-brand-400 rounded flex items-center justify-center transition-colors text-xs">
               <CloudUpload size={13} className="mr-1.5" /> Drive
             </button>
             <button onClick={handleExportR2} title="Upload to Cloudflare R2" className="px-2.5 py-1.5 hover:bg-slate-800 text-slate-400 hover:text-amber-400 rounded flex items-center justify-center transition-colors text-xs">
               <CloudUpload size={13} className="mr-1.5" /> R2 Cloud
             </button>
             <div className="relative">
                <button 
                  onClick={() => setShowLabelSettings(!showLabelSettings)} 
                  className={cn("px-2.5 py-1.5 rounded flex items-center justify-center transition-colors text-xs", showLabelSettings ? "bg-brand-600 text-white" : "hover:bg-slate-800 text-slate-400 hover:text-brand-400")}
                >
                  <Tags size={13} className="mr-1.5" /> Labels
                </button>
                {showLabelSettings && (
                  <div className="absolute top-full right-0 mt-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-3 w-56 z-[9999] flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 sticky top-0 bg-slate-900 py-1 z-10">Select Labels</div>
                    {AVAILABLE_LABELS.map(label => (
                      <label key={label} className="flex items-center gap-2 cursor-pointer group">
                        <input 
                          type="color"
                          className="w-4 h-4 rounded cursor-pointer border-0 p-0 appearance-none bg-transparent"
                          value={reviewLabelColors?.[label] || '#ffffff'}
                          onChange={(e) => setReviewLabelColors({ ...(reviewLabelColors || {}), [label]: e.target.value })}
                        />
                        <input 
                          type="checkbox" 
                          className="rounded border-slate-600 bg-slate-800 focus:ring-brand-500"
                          checked={selectedLabels.includes(label)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedLabels([...selectedLabels, label]);
                            } else {
                              setSelectedLabels(selectedLabels.filter(l => l !== label));
                            }
                          }}
                        />
                        <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{label}</span>
                      </label>
                    ))}
                  </div>
                )}
             </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Year Filter */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-2.5 py-1.5 rounded-lg shadow-inner">
              <Calendar size={12} className="text-brand-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Year:</span>
              <select
                value={effectiveYear}
                onChange={(e) => setGlobalYearFilter(e.target.value)}
                className="bg-transparent border-none text-xs text-white font-bold outline-none cursor-pointer hover:text-brand-300 transition-colors"
                title="Filter Review by Year"
              >
                {availableYears.map(y => (
                  <option key={y} value={y} className="bg-slate-950 text-white font-semibold">{y}</option>
                ))}
              </select>
            </div>

            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest hidden sm:inline">Version:</span>
            <select 
              value={activeVersionId || ''} 
              onChange={(e) => setActiveVersionId(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-300 text-xs font-bold rounded-lg px-3 py-1.5 outline-none focus:border-brand-500 transition-all min-w-[140px] uppercase tracking-wider cursor-pointer hover:border-brand-500"
            >
              {filteredVersions.length === 0 && <option value="">No versions for {location} ({effectiveYear})</option>}
              {filteredVersions.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 text-slate-300 border border-slate-800 text-[11px] font-semibold">
              <span className="text-brand-400 font-bold">{store}</span>
              <span className="text-slate-600">•</span>
              <span className="text-purple-400 font-bold">{location}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-2 overflow-hidden">
        {/* Main Preview Area */}
        <div className="flex-1 min-h-[400px] rounded-xl border border-slate-800 shadow-xl overflow-hidden relative bg-[#141416]" ref={containerRef}>
          
          {/* Bottom Floating Zoom & View Controls */}
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

          <Stage 
            ref={stageRef}
            width={canvasSize.width} 
            height={canvasSize.height}
            onWheel={handleWheel}
            scaleX={scale}
            scaleY={scale}
            x={position.x}
            y={position.y}
            draggable
          >
            <Layer>
              {image && <KonvaImage 
                image={image} 
                listening={false} 
                x={activeVersion?.imagePos?.x || 0}
                y={activeVersion?.imagePos?.y || 0}
                scaleX={activeVersion?.imageScale || 1}
                scaleY={activeVersion?.imageScale || 1}
                rotation={activeVersion?.backgroundRotation || 0}
              />}
              {styledUnits.map((unit: any) => {
                const { displayColor, displayOpacity, bbox } = unit;
                
                return (
                  <React.Fragment key={unit.id}>
                    {unit.type === 'rect' && (
                      <Rect
                        x={unit.x}
                        y={unit.y}
                        width={unit.width}
                        height={unit.height}
                        fill={unit.hasMatchedColor ? displayColor : 'rgba(0, 0, 0, 0.001)'}
                        opacity={displayOpacity}
                        rotation={unit.rotation || 0}
                        stroke={unit.hasMatchedColor ? (selectedReviewUnitId === unit.id ? '#f59e0b' : '#ffffff') : '#64748b'}
                        strokeWidth={selectedReviewUnitId === unit.id ? 2.5 : 1.2}
                        strokeScaleEnabled={false}
                        perfectDrawEnabled={false}
                        listening={false}
                      />
                    )}
                    {unit.type === 'circle' && (
                      <Circle
                        x={unit.x}
                        y={unit.y}
                        radius={unit.radius}
                        fill={unit.hasMatchedColor ? displayColor : 'rgba(0, 0, 0, 0.001)'}
                        opacity={displayOpacity}
                        rotation={unit.rotation || 0}
                        stroke={unit.hasMatchedColor ? (selectedReviewUnitId === unit.id ? '#f59e0b' : '#ffffff') : '#64748b'}
                        strokeWidth={selectedReviewUnitId === unit.id ? 2.5 : 1.2}
                        strokeScaleEnabled={false}
                        perfectDrawEnabled={false}
                        listening={false}
                      />
                    )}
                    {unit.type === 'polygon' && (
                      <Line
                        x={unit.x || 0}
                        y={unit.y || 0}
                        points={unit.points}
                        fill={unit.hasMatchedColor ? displayColor : 'rgba(0, 0, 0, 0.001)'}
                        opacity={displayOpacity}
                        rotation={unit.rotation || 0}
                        stroke={unit.hasMatchedColor ? (selectedReviewUnitId === unit.id ? '#f59e0b' : '#ffffff') : '#64748b'}
                        strokeWidth={selectedReviewUnitId === unit.id ? 2.5 : 1.2}
                        strokeScaleEnabled={false}
                        perfectDrawEnabled={false}
                        closed
                        listening={false}
                      />
                    )}
                    
                    {/* Unit Label - only show if scale is large enough to be readable */}
                    {scale > 0.3 && bbox && (
                      <Group
                        x={bbox.x}
                        y={bbox.y}
                        width={bbox.width}
                        height={bbox.height}
                        rotation={unit.rotation || 0}
                      >
                        {(() => {
                          const lines = unit.sizeLabelLines || [];
                          const fontSize = Math.max(7, Math.min(18, 10 / scale));
                          const lineHeight = fontSize * 1.2;
                          const totalHeight = lines.length * lineHeight;
                          const startY = (bbox.height - totalHeight) / 2;
                          return lines.map((line: any, i: number) => (
                            <Text
                              key={i}
                              x={0}
                              y={startY + i * lineHeight}
                              width={bbox.width}
                              text={line.text}
                              fill={reviewLabelColors?.[line.key] || '#ffffff'}
                              align="center"
                              fontSize={fontSize}
                              fontStyle="bold"
                              listening={false}
                              perfectDrawEnabled={false}
                            />
                          ));
                        })()}
                      </Group>
                    )}
                  </React.Fragment>
                );
              })}
            </Layer>
          </Stage>
        </div>

        {/* Info Legend Right */}
        <div className={cn(
          "flex flex-col bg-slate-900/90 rounded-xl border border-slate-800/80 transition-all duration-300 relative shrink-0 overflow-hidden",
          isReviewSidebarCollapsed ? "w-10 p-2 items-center" : "w-72 sm:w-80 p-3 sm:p-4 gap-3 glass"
        )}>
          {/* Toggle Collapse Button */}
          <button 
            onClick={() => setIsReviewSidebarCollapsed(!isReviewSidebarCollapsed)}
            className={cn(
              "p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shadow-sm",
              isReviewSidebarCollapsed ? "w-7 h-7 flex items-center justify-center my-1" : "absolute -left-3.5 top-3 z-30 border border-slate-700 bg-slate-900"
            )}
            title={isReviewSidebarCollapsed ? "Mở rộng Legend & Groups" : "Thu gọn để mở rộng Canvas"}
          >
            {isReviewSidebarCollapsed ? <ChevronLeft size={14} className="rotate-180" /> : <ChevronRight size={14} />}
          </button>

          {isReviewSidebarCollapsed ? (
            <div className="flex flex-col items-center gap-4 mt-6 text-slate-400">
              <span className="text-[10px] font-bold uppercase tracking-widest [writing-mode:vertical-rl] rotate-180 select-none">
                LEGEND & GROUPS
              </span>
            </div>
          ) : (
            <div className="flex flex-col h-full overflow-hidden w-full gap-3">
              <div className="flex border-b border-slate-800 pb-2 mb-1 items-center justify-between">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Legend / Groups</h4>
                <span className="text-[10px] text-slate-500 font-mono">
                  {activeVersion?.groups.filter(g => (activeVersion?.groupMappings[g.id] || []).length > 0).length || 0} groups
                </span>
              </div>
              
              <div className="space-y-3 overflow-y-auto pr-1 custom-scrollbar flex-1">
                 {(!activeVersion?.groups || activeVersion.groups.length === 0) && (
                   <div className="text-center py-6 px-3 bg-slate-950/40 border border-slate-800/80 rounded-xl text-slate-400 text-xs space-y-1.5">
                     <p className="font-semibold text-slate-300">Chưa có nhóm quy tắc</p>
                     <p className="text-[11px] text-slate-500 leading-relaxed">
                       Phiên bản này ({activeVersion?.name} • {activeVersion?.year || effectiveYear}) chưa có nhóm quy tắc nào.
                     </p>
                     <p className="text-[11px] text-brand-400/80">
                       Vui lòng chuyển sang tab <strong>DYNAMIC</strong> để tạo hoặc sao chép nhóm quy tắc từ năm khác.
                     </p>
                   </div>
                 )}
                 {activeVersion?.groups?.map(group => {
                   // Only show groups that have units assigned in this version
                   const assignedUnitIds = activeVersion?.groupMappings[group.id] || [];
                   if (assignedUnitIds.length === 0) return null;
                   
                   return (
                     <div key={group.id} className="p-2.5 bg-slate-950/50 border border-slate-800 rounded-xl space-y-1.5">
                       <div className="flex items-center gap-2">
                         <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                         <span className="text-xs font-bold text-slate-300 uppercase tracking-tight truncate">{group.name}</span>
                         <span className="ml-auto text-[10px] text-slate-500 font-mono flex-shrink-0">{assignedUnitIds.length} units</span>
                       </div>
                       <div className="flex flex-wrap gap-1">
                         {assignedUnitIds.map(uid => {
                           const u = unitMap.get(uid);
                           return u ? (
                             <span key={u.id} className="text-[9px] px-1.5 py-0.5 bg-slate-800 text-slate-400 border border-slate-700/50 rounded">
                               {u.name}
                             </span>
                           ) : null;
                         })}
                       </div>
                     </div>
                   );
                 })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Unit Summary Draggable Modal */}
      {isSummaryTableOpen && typeof document !== 'undefined' && createPortal(
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
                    Bảng Tổng Hợp So Sánh & Màu Tô Thực Tế [{(activeVersion?.store as any) || store} • {activeVersion?.location || location} • {activeVersion?.year || effectiveYear}]
                  </h3>
                </div>
                <button
                  onClick={() => setIsSummaryTableOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                <DynamicUnitSummaryTable
                  summaryList={dynamicSummaryList}
                  selectedUnitId={selectedReviewUnitId}
                  onSelectUnit={(uid) => {
                    setSelectedReviewUnitId(uid);
                  }}
                  title={`Chi tiết ${dynamicSummaryList.length} gian hàng theo bộ luật`}
                />
              </div>
            </div>
          </Draggable>
        </div>,
        document.body
      )}

      {showShareModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999999] bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-6 overflow-hidden">
          <Draggable
            disabled={typeof window !== 'undefined' && window.innerWidth < 640}
            handle=".modal-handle"
            bounds="parent"
            nodeRef={shareModalRef}
            cancel="button, input, select, textarea, .no-drag"
          >
            <div 
              ref={shareModalRef}
              className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-w-[calc(100vw-1rem)] sm:max-w-3xl max-h-[88vh] flex flex-col shadow-2xl relative overflow-hidden my-auto pointer-events-auto"
            >
                <div className="modal-handle cursor-grab active:cursor-grabbing p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/95 select-none">
                    <div className="flex items-center gap-3">
                        <GripHorizontal className="text-slate-500 shrink-0" size={18} />
                        <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-400 shrink-0">
                            <LinkIcon size={20} />
                        </div>
                        <div>
                          <h3 className="text-lg sm:text-xl font-bold text-white">Share Review Viewer</h3>
                          <p className="text-xs sm:text-sm text-slate-400">Copy this link to share the current view.</p>
                        </div>
                    </div>
                    <button onClick={() => setShowShareModal(false)} className="p-2 bg-slate-800 text-slate-400 hover:text-white rounded-lg z-10 transition-colors no-drag">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="flex-1 overflow-auto p-4 sm:p-6 bg-bg-dark flex justify-center items-center custom-scrollbar min-h-0">
                    {shareImage && <img src={shareImage} alt="Share preview" loading="lazy" decoding="async" className="max-w-full max-h-full object-contain rounded-xl border border-slate-800 shadow-xl" />}
                </div>

                <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex flex-col sm:flex-row gap-3 shrink-0">
                    <input 
                        type="text" 
                        readOnly 
                        value={actualShareLink} 
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-300 font-mono text-xs sm:text-sm outline-none" 
                    />
                    <button 
                      onClick={copyToClipboard}
                      className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-colors text-sm shrink-0"
                    >
                      {copiedLink ? <Check size={18} /> : <Copy size={18} />} 
                      {copiedLink ? 'Copied' : 'Copy Link'}
                    </button>
                </div>
            </div>
          </Draggable>
        </div>,
        document.body
      )}
      
      {exportAllFormat && (
          <ExportAllManager 
             versions={versions.filter(v => selectedVersionsToExport[v.id])} 
             units={units} 
             summaryData={summaryData} 
             dynamicSummaryMap={dynamicSummaryMap}
             format={exportAllFormat} 
             paperSize={exportPaperSize}
             quality={exportQuality}
             selectedLabels={selectedLabels}
             reviewLabelColors={reviewLabelColors}
             onComplete={handleExportAllManagerComplete} 
          />
      )}

      <R2UploadModal 
          isOpen={showR2Modal} 
          onClose={() => {
              if (isUploadingToR2) return;
              setShowR2Modal(false);
              setExportAllFormat(null);
          }}
          onStartExport={startR2Export}
          uploading={isUploadingToR2}
          uploadProgress={r2UploadProgress}
          statusMessage={r2StatusMessage}
      />

      {exportModalVisible && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999999] bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-6 overflow-hidden">
          <Draggable
            disabled={typeof window !== 'undefined' && window.innerWidth < 640}
            handle=".modal-handle"
            bounds="parent"
            nodeRef={exportModalRef}
            cancel="button, input, select, textarea, label, .no-drag"
          >
            <div 
              ref={exportModalRef}
              className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl max-w-[calc(100vw-1rem)] sm:max-w-xl flex flex-col shadow-2xl relative overflow-hidden max-h-[88vh] my-auto pointer-events-auto"
            >
                <div className="modal-handle cursor-grab active:cursor-grabbing p-4 sm:p-6 border-b border-slate-800 shrink-0 select-none bg-slate-900/95">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                            <GripHorizontal className="text-slate-500 shrink-0" size={18} />
                            <h3 className="text-lg sm:text-xl font-bold text-white uppercase tracking-wider">
                                {exportFormat === 'drive' ? 'Upload to Drive' : exportFormat === 'r2_jpeg' ? 'Upload to Cloud R2' : `Export ${exportFormat.toUpperCase()}`}
                            </h3>
                        </div>
                        <button onClick={() => setExportModalVisible(false)} className="p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors no-drag">
                            <X size={18} />
                        </button>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-400 mt-1 ml-7">Select which versions to include in the export.</p>
                    
                    <div className="mt-4 flex flex-col gap-3 relative">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            {(exportFormat === 'pdf' || exportFormat === 'drive' || exportFormat === 'r2_jpeg') ? (
                                <div className="flex items-center gap-2 sm:gap-3">
                                    <label className="text-xs sm:text-sm font-medium text-slate-300">Paper Size:</label>
                                    <select 
                                        value={exportPaperSize}
                                        onChange={(e) => setExportPaperSize(e.target.value as any)}
                                        className="bg-slate-950 text-white text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-700 outline-none"
                                    >
                                        <option value="a4">A4</option>
                                        <option value="a3">A3</option>
                                        <option value="a2">A2</option>
                                        <option value="original">Original Dimensions</option>
                                    </select>
                                </div>
                            ) : <div></div>}
                            
                            <div className="flex justify-end gap-2 shrink-0">
                                <button 
                                  onClick={() => setExportModalVisible(false)}
                                  className="px-3 py-1.5 text-xs hover:bg-slate-800 text-slate-300 font-bold rounded-lg transition-colors"
                                >
                                  Cancel
                                </button>
                                <button 
                                  onClick={handleConfirmExport}
                                  disabled={!Object.values(selectedVersionsToExport).some(v => v)}
                                  className="px-3.5 sm:px-4 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg flex items-center transition-colors shadow-sm"
                                >
                                  {exportFormat === 'drive' ? 'Upload Selected' : exportFormat === 'r2_jpeg' ? 'Xác nhận & Tiếp tục' : 'Export Selected'}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-3">
                            <label className="text-xs sm:text-sm font-medium text-slate-300 shrink-0">Quality / File Size:</label>
                            <select 
                                value={exportQuality}
                                onChange={(e) => setExportQuality(e.target.value as any)}
                                className="bg-slate-950 text-white text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-700 outline-none w-full sm:w-64"
                            >
                                <option value="high">High (4x resolution, large size)</option>
                                <option value="medium">Medium (2x resolution, medium size)</option>
                                <option value="low">Low (1x resolution, small size)</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                {exportFormat === 'r2_jpeg' && (
                    <div className="px-6 pt-4">
                        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1.5">
                            <div className="font-bold flex items-center gap-1.5 text-amber-400">
                                <span>⚡</span> Xuất Cloud R2 An Toàn & Chuẩn Xác (Targeted File Overwrite)
                            </div>
                            <p className="text-slate-300">
                                Hệ thống chỉ quét và cập nhật/ghi đè <strong className="text-white">đúng tên file của phiên bản tương ứng</strong> trên Cloudflare R2, bảo toàn nguyên vẹn tất cả dữ liệu, sơ đồ và các tầng khác trong bucket.
                            </p>
                        </div>
                    </div>
                )}

                <div className="p-6 flex-1 overflow-y-auto min-h-0 flex flex-col gap-3">
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-700 bg-slate-800/50 cursor-pointer hover:bg-slate-800 transition-colors">
                        <input 
                            type="checkbox" 
                            checked={versions.length > 0 && versions.every(v => selectedVersionsToExport[v.id])} 
                            onChange={(e) => {
                                const newSel: Record<string, boolean> = {};
                                versions.forEach(v => newSel[v.id] = e.target.checked);
                                setSelectedVersionsToExport(newSel);
                            }}
                            className="w-5 h-5 rounded bg-slate-900 border-slate-600 focus:ring-brand-500"
                        />
                        <span className="text-white font-bold">Select All</span>
                    </label>
                    <div className="h-px bg-slate-800 my-1"></div>
                    {versions.map(v => (
                        <label key={v.id} className="flex items-center gap-3 p-3.5 rounded-lg border border-slate-800 bg-slate-950 cursor-pointer hover:bg-slate-900 transition-colors">
                            <input 
                                type="checkbox" 
                                checked={!!selectedVersionsToExport[v.id]} 
                                onChange={(e) => {
                                    setSelectedVersionsToExport(prev => ({ ...prev, [v.id]: e.target.checked }));
                                }}
                                className="w-5 h-5 rounded bg-slate-900 border-slate-600 focus:ring-brand-500"
                            />
                            <div className="flex-1 flex items-center justify-between">
                                <span className="font-bold text-sm text-slate-200">{v.location ? `[${v.location}] ` : ''}{v.name}</span>
                                {v.id === activeVersionId && (
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-brand-900/60 text-brand-300 border border-brand-700/50">
                                        Đang xem
                                    </span>
                                )}
                            </div>
                        </label>
                    ))}
                </div>
            </div>
          </Draggable>
        </div>,
        document.body
      )}
    </div>
  );
}

const HiddenExportStage = ({ version, units, summaryData, dynamicSummaryMap, selectedLabels, reviewLabelColors, paperSize, onReady, index }: any) => {
  const styledUnits = React.useMemo(() => {
    const unitToGroupStyle = new Map<string, { color: string; opacity: number; groupId: string }>();
    if (version?.groups && version?.groupMappings) {
      version.groups.forEach((group: any) => {
        const assignedIds = version.groupMappings[group.id] || [];
        assignedIds.forEach((id: string) => {
          unitToGroupStyle.set(String(id).toLowerCase().trim(), {
            color: group.color,
            opacity: typeof group.opacity === 'number' ? group.opacity : 0.65,
            groupId: group.id
          });
        });
      });
    }

    const summaryMap = new Map();
    summaryData.forEach((s: any) => summaryMap.set(s.unit, s));

    const vLoc = String(version?.location || '').toUpperCase().trim();
    const candidateUnits = (Array.isArray(version?.mapUnits) && version.mapUnits.length > 0)
      ? version.mapUnits
      : units;

    return candidateUnits
      .filter((unit: any) => {
        const uLoc = String(unit.location || '').toUpperCase().trim();
        if (vLoc && uLoc && uLoc !== vLoc) return false;
        return true;
      })
      .map((unit: any) => {
        const uName = String(unit.name || '').toLowerCase().trim();
        const uId = String(unit.id || '').toLowerCase().trim();
        const dynamicItem = dynamicSummaryMap?.get?.(unit.id) || (uName ? dynamicSummaryMap?.get?.(uName) : null);

        let displayColor = 'rgba(0, 0, 0, 0.001)';
        let displayOpacity = 0.85;
        let hasMatchedColor = false;

        if (dynamicItem?.matchedGroupId && dynamicItem?.color) {
          displayColor = dynamicItem.color;
          displayOpacity = dynamicItem.opacity ?? 0.85;
          hasMatchedColor = true;
        } else if (unitToGroupStyle.has(uId)) {
          const g = unitToGroupStyle.get(uId)!;
          displayColor = g.color;
          displayOpacity = g.opacity;
          hasMatchedColor = true;
        } else if (uName && unitToGroupStyle.has(uName)) {
          const g = unitToGroupStyle.get(uName)!;
          displayColor = g.color;
          displayOpacity = g.opacity;
          hasMatchedColor = true;
        } else if ((unit as any).targetColor) {
          displayColor = (unit as any).targetColor;
          displayOpacity = (unit as any).targetOpacity ?? 0.65;
          hasMatchedColor = true;
        } else if (dynamicItem?.hasAppProject && dynamicItem?.appProjectStatus) {
          const st = String(dynamicItem.appProjectStatus).toLowerCase().trim();
          if (st === 'completed') { displayColor = '#10b981'; displayOpacity = 0.85; hasMatchedColor = true; }
          else if (st === 'on process' || st === 'in progress') { displayColor = '#3b82f6'; displayOpacity = 0.85; hasMatchedColor = true; }
          else if (st === 'delay' || st === 'delayed' || st === 'overdue') { displayColor = '#ef4444'; displayOpacity = 0.85; hasMatchedColor = true; }
          else if (st === 'upcoming') { displayColor = '#f59e0b'; displayOpacity = 0.85; hasMatchedColor = true; }
        }

        const uInfo = summaryMap.get(unit.name);
        const sizeLabelLines = generateSizeLabelLines(unit, uInfo, selectedLabels);
        const sizeLabel = generateSizeLabel(unit, uInfo, selectedLabels);
        return {
          ...unit,
          displayColor,
          displayOpacity: hasMatchedColor ? displayOpacity : 0.85,
          hasMatchedColor,
          sizeLabelLines,
          sizeLabel
        };
      });
  }, [units, version, summaryData, dynamicSummaryMap, selectedLabels]);

  const [resolvedBgUrl, setResolvedBgUrl] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const rawUrl = version?.backgroundUrl || '';
    if (!rawUrl) {
      setResolvedBgUrl('');
      return;
    }
    if (rawUrl.startsWith('r2://') || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://') && !rawUrl.startsWith('data:') && !rawUrl.startsWith('blob:'))) {
      resolveR2UrlToHttp(rawUrl).then(url => {
        if (isMounted) setResolvedBgUrl(url || rawUrl);
      }).catch(() => {
        if (isMounted) setResolvedBgUrl(rawUrl);
      });
    } else {
      setResolvedBgUrl(rawUrl);
    }
    return () => { isMounted = false; };
  }, [version?.backgroundUrl]);

  const [image, status] = useOffscreenImage(resolvedBgUrl || version?.backgroundUrl || '', 'anonymous');
  const stageRef = useRef<any>(null);

  useEffect(() => {
    let timer: any;
    if (status === 'loaded' || status === 'failed') {
      timer = setTimeout(() => {
        if (stageRef.current) {
          onReady(index, stageRef.current);
        } else {
          onReady(index, null);
        }
      }, 350); // Give Konva a moment to render
    } else {
      // Safety timeout: if image takes more than 8 seconds to load, proceed anyway
      timer = setTimeout(() => {
        console.warn(`[HiddenExportStage] Image timeout for version: ${version?.name}`);
        onReady(index, stageRef.current || null);
      }, 8000);
    }
    return () => clearTimeout(timer);
  }, [status, index, onReady]);

  if (status !== 'loaded' && status !== 'failed') {
    return null; // Wait for image
  }

  let minX = 0, minY = 0, maxX = 800, maxY = 600;
  
  if (image) {
    const angle = (version?.backgroundRotation || 0) * Math.PI / 180;
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    const w = ((image as HTMLImageElement).naturalWidth || image.width) * (version?.imageScale || 1);
    const h = ((image as HTMLImageElement).naturalHeight || image.height) * (version?.imageScale || 1);
    const px = version?.imagePos?.x || 0;
    const py = version?.imagePos?.y || 0;
    
    const p1 = { x: px, y: py };
    const p2 = { x: px + w * c, y: py + w * s };
    const p3 = { x: px + w * c - h * s, y: py + w * s + h * c };
    const p4 = { x: px - h * s, y: py + h * c };
    
    minX = Math.min(p1.x, p2.x, p3.x, p4.x);
    minY = Math.min(p1.y, p2.y, p3.y, p4.y);
    maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
    maxY = Math.max(p1.y, p2.y, p3.y, p4.y);
  }

  styledUnits.forEach((unit: any) => {
    if (unit.type === 'rect') {
      minX = Math.min(minX, unit.x);
      minY = Math.min(minY, unit.y);
      maxX = Math.max(maxX, unit.x + unit.width);
      maxY = Math.max(maxY, unit.y + unit.height);
    } else if (unit.type === 'circle') {
      minX = Math.min(minX, unit.x - (unit.radius || 0));
      minY = Math.min(minY, unit.y - (unit.radius || 0));
      maxX = Math.max(maxX, unit.x + (unit.radius || 0));
      maxY = Math.max(maxY, unit.y + (unit.radius || 0));
    } else if (unit.type === 'polygon' && unit.points) {
      for(let i = 0; i < unit.points.length; i += 2) {
        minX = Math.min(minX, unit.points[i]);
        minY = Math.min(minY, unit.points[i+1]);
        maxX = Math.max(maxX, unit.points[i]);
        maxY = Math.max(maxY, unit.points[i+1]);
      }
    }
  });

  minX -= 40; // Add 40px padding instead of 20px
  minY -= 40;
  maxX += 40;
  maxY += 40;

  let logicalWidth = maxX - minX;
  let logicalHeight = maxY - minY;

  // Căn chỉnh khung bản vẽ cho đẹp theo form giấy
  if (paperSize && paperSize !== 'original') {
      let paperRatio = 1.4142; // Mặc định A-series ratio ~ 297/210
      if (paperSize === 'a4' || paperSize === 'a3' || paperSize === 'a2') {
          paperRatio = 297 / 210;
      } else if (Array.isArray(paperSize) && paperSize.length === 2) {
          paperRatio = Math.max(paperSize[0], paperSize[1]) / Math.min(paperSize[0], paperSize[1]);
      }

      const isLandscape = logicalWidth > logicalHeight;
      const targetRatio = isLandscape ? paperRatio : 1 / paperRatio;
      const currentRatio = logicalWidth / logicalHeight;

      if (currentRatio > targetRatio) {
          // Logical Width lớn hơn tỷ lệ => Tăng Height
          const newHeight = logicalWidth / targetRatio;
          const diff = newHeight - logicalHeight;
          minY -= diff / 2;
          maxY += diff / 2;
          logicalHeight = newHeight;
      } else {
          // Logical Height lớn hơn tỷ lệ => Tăng Width
          const newWidth = logicalHeight * targetRatio;
          const diff = newWidth - logicalWidth;
          minX -= diff / 2;
          maxX += diff / 2;
          logicalWidth = newWidth;
      }
  }

  const MAX_DIM = 3000;
  let stageScale = 1;
  const maxLogical = Math.max(logicalWidth, logicalHeight);
  
  if (maxLogical > MAX_DIM) {
      stageScale = MAX_DIM / maxLogical;
  } else if (maxLogical < 500 && maxLogical > 0) {
      stageScale = 1000 / maxLogical;
  }

  const exportWidth = logicalWidth * stageScale;
  const exportHeight = logicalHeight * stageScale;

  return (
    <Stage 
      ref={stageRef}
      width={exportWidth} 
      height={exportHeight}
      scaleX={stageScale}
      scaleY={stageScale}
      style={{ backgroundColor: 'white' }}
    >
      <Layer x={-minX} y={-minY}>
        <Rect x={minX} y={minY} width={logicalWidth} height={logicalHeight} fill="white" listening={false} />
        {image && <KonvaImage 
          image={image} 
          listening={false} 
          x={version?.imagePos?.x || 0}
          y={version?.imagePos?.y || 0}
          scaleX={version?.imageScale || 1}
          scaleY={version?.imageScale || 1}
          rotation={version?.backgroundRotation || 0}
        />}
        {styledUnits.map((unit: any) => {
            const { displayColor, displayOpacity } = unit;

            const shapeProps = {
                key: unit.id,
                x: unit.x,
                y: unit.y,
                fill: displayColor,
                opacity: displayOpacity,
                rotation: unit.rotation || 0,
                stroke: '#ffffff',
                strokeWidth: 2,
                shadowBlur: 4,
                shadowColor: 'rgba(0,0,0,0.5)',
                listening: false,
            };

            if (unit.type === 'rect') {
                return (
                    <React.Fragment key={unit.id}>
                        <Rect {...shapeProps} width={unit.width} height={unit.height} cornerRadius={4} />
                        {unit.name && (
                            <Group x={unit.x} y={unit.y} width={unit.width} height={unit.height} rotation={unit.rotation || 0}>
                                {(() => {
                                  const lines = unit.sizeLabelLines || [];
                                  const fontSize = 14;
                                  const lineHeight = fontSize * 1.2;
                                  const estimatedCharWidth = fontSize * 0.55;
                                  const effectiveWidth = unit.width;
                                  
                                  const blocks = lines.map((line: any) => {
                                      const charsPerLine = Math.max(1, effectiveWidth / estimatedCharWidth);
                                      const words = String(line.text).split(' ');
                                      let linesCount = 1;
                                      let currentLineLen = 0;
                                      for (let i = 0; i < words.length; i++) {
                                          const wordLen = words[i].length;
                                          if (wordLen > charsPerLine) {
                                              // Word itself is longer than a line, it will wrap
                                              linesCount += Math.floor(wordLen / charsPerLine);
                                              currentLineLen = wordLen % charsPerLine;
                                          } else if (currentLineLen > 0 && currentLineLen + 1 + wordLen <= charsPerLine) {
                                              currentLineLen += 1 + wordLen;
                                          } else {
                                              if (i > 0) linesCount++;
                                              currentLineLen = wordLen;
                                          }
                                      }
                                      const explicitNewlines = (String(line.text).match(/\n/g) || []).length;
                                      linesCount += explicitNewlines;
                                      return { ...line, blockHeight: linesCount * lineHeight };
                                  });
                                  
                                  const totalHeight = blocks.reduce((sum: number, b: any) => sum + b.blockHeight, 0);
                                  let currentY = (unit.height - totalHeight) / 2;
                                  
                                  return blocks.map((block: any, i: number) => {
                                      const y = currentY;
                                      currentY += block.blockHeight;
                                      return (
                                        <Text key={i} x={0} y={y} width={effectiveWidth} text={block.text} fill={reviewLabelColors?.[block.key] || '#ffffff'} align="center" fontSize={fontSize} fontStyle="bold" listening={false} perfectDrawEnabled={false} shadowColor="black" shadowBlur={2} shadowOpacity={1} />
                                      );
                                  });
                                })()}
                            </Group>
                        )}
                    </React.Fragment>
                );
            } else if (unit.type === 'circle') {
                 return (
                    <React.Fragment key={unit.id}>
                        <Circle {...shapeProps} radius={unit.radius} />
                        {unit.name && (
                            <Group x={unit.x - (unit.radius||0)} y={unit.y - (unit.radius||0)} width={(unit.radius||0)*2} height={(unit.radius||0)*2}>
                                {(() => {
                                  const lines = unit.sizeLabelLines || [];
                                  const fontSize = 14;
                                  const lineHeight = fontSize * 1.2;
                                  const estimatedCharWidth = fontSize * 0.55;
                                  const effectiveWidth = (unit.radius||0)*2;
                                  
                                  const blocks = lines.map((line: any) => {
                                      const charsPerLine = Math.max(1, effectiveWidth / estimatedCharWidth);
                                      const words = String(line.text).split(' ');
                                      let linesCount = 1;
                                      let currentLineLen = 0;
                                      for (let i = 0; i < words.length; i++) {
                                          const wordLen = words[i].length;
                                          if (wordLen > charsPerLine) {
                                              // Word itself is longer than a line, it will wrap
                                              linesCount += Math.floor(wordLen / charsPerLine);
                                              currentLineLen = wordLen % charsPerLine;
                                          } else if (currentLineLen > 0 && currentLineLen + 1 + wordLen <= charsPerLine) {
                                              currentLineLen += 1 + wordLen;
                                          } else {
                                              if (i > 0) linesCount++;
                                              currentLineLen = wordLen;
                                          }
                                      }
                                      const explicitNewlines = (String(line.text).match(/\n/g) || []).length;
                                      linesCount += explicitNewlines;
                                      return { ...line, blockHeight: linesCount * lineHeight };
                                  });
                                  
                                  const totalHeight = blocks.reduce((sum: number, b: any) => sum + b.blockHeight, 0);
                                  let currentY = (effectiveWidth - totalHeight) / 2;
                                  
                                  return blocks.map((block: any, i: number) => {
                                      const y = currentY;
                                      currentY += block.blockHeight;
                                      return (
                                        <Text key={i} x={0} y={y} width={effectiveWidth} text={block.text} fill={reviewLabelColors?.[block.key] || '#ffffff'} align="center" fontSize={fontSize} fontStyle="bold" listening={false} perfectDrawEnabled={false} shadowColor="black" shadowBlur={2} shadowOpacity={1} />
                                      );
                                  });
                                })()}
                            </Group>
                        )}
                    </React.Fragment>
                );
            } else if (unit.type === 'polygon' && unit.points) {
                return (
                    <React.Fragment key={unit.id}>
                        <Line {...shapeProps} points={unit.points} closed={true} />
                        {unit.name && (() => {
                                const bx = unit.points ? Math.min(...unit.points.filter((_: any, i: number) => i % 2 === 0)) : unit.x;
                                const by = unit.points ? Math.min(...unit.points.filter((_: any, i: number) => i % 2 === 1)) : unit.y;
                                const bw = unit.points ? Math.max(...unit.points.filter((_: any, i: number) => i % 2 === 0)) - bx : 100;
                                const bh = unit.points ? Math.max(...unit.points.filter((_: any, i: number) => i % 2 === 1)) - by : 30;
                                return (
                                  <Group x={bx} y={by} width={bw} height={bh}>
                                    {(() => {
                                      const lines = unit.sizeLabelLines || [];
                                      const fontSize = 14;
                                      const lineHeight = fontSize * 1.2;
                                      const estimatedCharWidth = fontSize * 0.55;
                                      const effectiveWidth = bw;
                                      
                                      const blocks = lines.map((line: any) => {
                                          const charsPerLine = Math.max(1, effectiveWidth / estimatedCharWidth);
                                          const words = String(line.text).split(' ');
                                          let linesCount = 1;
                                          let currentLineLen = words[0].length;
                                          for (let i = 1; i < words.length; i++) {
                                              if (currentLineLen + 1 + words[i].length <= charsPerLine) {
                                                  currentLineLen += 1 + words[i].length;
                                              } else {
                                                  linesCount++;
                                                  currentLineLen = words[i].length;
                                              }
                                          }
                                          const explicitNewlines = (String(line.text).match(/\n/g) || []).length;
                                          linesCount += explicitNewlines;
                                          return { ...line, blockHeight: linesCount * lineHeight };
                                      });
                                      
                                      const totalHeight = blocks.reduce((sum: number, b: any) => sum + b.blockHeight, 0);
                                      let currentY = (bh - totalHeight) / 2;
                                      
                                      return blocks.map((block: any, i: number) => {
                                          const y = currentY;
                                          currentY += block.blockHeight;
                                          return (
                                            <Text key={i} x={0} y={y} width={effectiveWidth} text={block.text} fill={reviewLabelColors?.[block.key] || '#ffffff'} align="center" fontSize={fontSize} fontStyle="bold" listening={false} perfectDrawEnabled={false} shadowColor="black" shadowBlur={2} shadowOpacity={1} />
                                          );
                                      });
                                    })()}
                                  </Group>
                                );
                            })()}
                    </React.Fragment>
                );
            }
            return null;
        })}
      </Layer>
    </Stage>
  );
};

// High-performance canvas to JPEG Blob converter avoiding base64 overhead
async function captureStageBlob(stage: any, pixelRatio: number, quality: number): Promise<Blob | null> {
  // Method 1: native HTMLCanvasElement.toBlob via Konva stage.toCanvas()
  try {
    const canvas = stage.toCanvas({ pixelRatio });
    if (canvas && typeof canvas.toBlob === 'function') {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b: Blob | null) => resolve(b), 'image/jpeg', quality);
      });
      if (blob && blob.size > 0) return blob;
    }
  } catch (err) {
    console.warn('[captureStageBlob] stage.toCanvas failed, falling back to toDataURL', err);
  }

  // Method 2: stage.toDataURL + direct ArrayBuffer parsing (no fetch)
  try {
    const dataURL = stage.toDataURL({ pixelRatio, mimeType: 'image/jpeg', quality });
    const parts = dataURL.split(',');
    if (parts.length === 2) {
      const byteString = atob(parts[1]);
      const mimeString = parts[0].split(':')[1]?.split(';')[0] || 'image/jpeg';
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      return new Blob([ab], { type: mimeString });
    }
  } catch (dataUrlErr) {
    console.error('[captureStageBlob] Failed to convert dataURL to Blob', dataUrlErr);
  }
  return null;
}

export const ExportAllManager = ({ versions, units, summaryData, dynamicSummaryMap, format, paperSize, quality, selectedLabels, reviewLabelColors, onComplete }: any) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const isProcessingRef = useRef(false);
  const pdfRef = useRef<jsPDF | null>(null);
  const collectedImagesRef = useRef<{ blob: Blob; name: string }[]>([]);
  const hasFinishedRef = useRef(false);

  // Safety check: if no versions are provided, finish immediately
  useEffect(() => {
    if (!versions || versions.length === 0) {
      onComplete?.(false);
    }
  }, [versions, onComplete]);

  const handleCurrentStageReady = React.useCallback(async (index: number, stage: any) => {
    if (isProcessingRef.current || hasFinishedRef.current) return;
    if (index !== currentIndex) return;
    isProcessingRef.current = true;

    // Determine pixelRatio and jpeg quality based on selected quality
    let pxRatio = 2;
    let jpegQuality = 0.9;
    if (quality === 'high') {
      pxRatio = 3;
      jpegQuality = 0.92;
    } else if (quality === 'low') {
      pxRatio = 1;
      jpegQuality = 0.75;
    }

    // Safe max dimension to prevent black images from browser canvas limits
    const SAFE_MAX_DIM = 3840;
    const currentVersion = versions[currentIndex];

    if (stage) {
      try {
        const width = stage.width();
        const height = stage.height();

        let currentPxRatio = pxRatio;
        const maxDim = Math.max(width, height);
        if (currentPxRatio * maxDim > SAFE_MAX_DIM) {
          currentPxRatio = SAFE_MAX_DIM / maxDim;
        }

        if (format === 'pdf' || format === 'drive' || format === 'auto_drive') {
          const dataURL = stage.toDataURL({ pixelRatio: currentPxRatio, mimeType: 'image/jpeg', quality: jpegQuality });
          const isLandscape = width > height;
          const orientationStr = isLandscape ? 'landscape' : 'portrait';

          const { jsPDF } = await import('jspdf');

          if (!pdfRef.current) {
            if (paperSize === 'original') {
              pdfRef.current = new jsPDF({
                orientation: orientationStr,
                unit: 'px',
                format: [width, height],
              });
            } else {
              pdfRef.current = new jsPDF({
                orientation: orientationStr,
                unit: 'mm',
                format: paperSize,
              });
            }
          } else {
            if (paperSize === 'original') {
              pdfRef.current.addPage([width, height], orientationStr);
            } else {
              pdfRef.current.addPage(paperSize, orientationStr);
            }
          }

          const pdf = pdfRef.current;
          if (paperSize === 'original') {
            pdf.addImage(dataURL, 'JPEG', 0, 0, width, height);
          } else {
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();

            let imgWidth = pageWidth;
            let imgHeight = (height * pageWidth) / width;

            if (imgHeight > pageHeight) {
              imgHeight = pageHeight;
              imgWidth = (width * pageHeight) / height;
            }

            const x = (pageWidth - imgWidth) / 2;
            const y = (pageHeight - imgHeight) / 2;

            pdf.addImage(dataURL, 'JPEG', x, y, imgWidth, imgHeight);
          }
        } else if (format === 'jpeg') {
          const dataURL = stage.toDataURL({ pixelRatio: currentPxRatio, mimeType: 'image/jpeg', quality: jpegQuality });
          const link = document.createElement('a');
          link.download = `version_${currentVersion?.name || currentIndex}.jpeg`;
          link.href = dataURL;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          await new Promise((r) => setTimeout(r, 200));
        } else if (format === 'r2_jpeg') {
          const blob = await captureStageBlob(stage, currentPxRatio, jpegQuality);
          if (blob) {
            collectedImagesRef.current.push({
              blob,
              name: currentVersion?.name || `version_${currentIndex}`,
            });
          }
        }
      } catch (stageErr) {
        console.error(`[ExportAllManager] Error processing stage for version ${currentVersion?.name}:`, stageErr);
      }
    } else {
      console.warn(`[ExportAllManager] Stage was null for version ${currentVersion?.name}, skipping.`);
    }

    // Yield control to let the browser garbage-collect and render animations
    await new Promise((r) => setTimeout(r, 120));

    const nextIndex = currentIndex + 1;
    if (nextIndex < versions.length) {
      isProcessingRef.current = false;
      setCurrentIndex(nextIndex);
    } else {
      // Completed all versions
      hasFinishedRef.current = true;
      if (format === 'pdf' || format === 'drive' || format === 'auto_drive') {
        const pdf = pdfRef.current;
        if (pdf) {
          if (format === 'drive' || format === 'auto_drive') {
            const pdfBlob = pdf.output('blob');
            const token = await getAccessToken();
            if (!token) {
              if (format !== 'auto_drive') alert('Vui lòng đăng nhập Google để upload file.');
              onComplete?.(false);
            } else {
              const confirmSave = format === 'auto_drive' ? true : window.confirm('Đồng ý tạo (hoặc ghi đè) file Data_Mapping_Export.pdf trên Google Drive của bạn?');
              if (confirmSave) {
                try {
                  await uploadFileToDrive({
                    accessToken: token,
                    fileBlob: pdfBlob,
                    fileName: 'Data_Mapping_Export.pdf',
                    mimeType: 'application/pdf',
                    fileId: '1hxzPKKhQWhQ-tAThmgan8eNqqy5GN-Ds',
                  });
                  if (format !== 'auto_drive') alert('Upload thành công!');
                  onComplete?.(true);
                } catch (e: any) {
                  console.error(e);
                  if (format !== 'auto_drive') alert('Lỗi upload: ' + e.message);
                  onComplete?.(false);
                }
              } else {
                onComplete?.(false);
              }
            }
          } else {
            pdf.save('all_versions.pdf');
            onComplete?.(true);
          }
        } else {
          onComplete?.(false);
        }
      } else if (format === 'jpeg') {
        onComplete?.(true);
      } else if (format === 'r2_jpeg') {
        if (collectedImagesRef.current.length > 0) {
          onComplete?.(true, collectedImagesRef.current);
        } else {
          onComplete?.(false);
        }
      }
    }
  }, [currentIndex, versions, format, paperSize, quality, onComplete]);

  const currentVersion = versions && versions[currentIndex];
  const totalCount = versions ? versions.length : 0;
  const percent = totalCount > 0 ? Math.round(((currentIndex + 1) / totalCount) * 100) : 0;
  const currentVersionName = currentVersion?.name || `Bản vẽ ${currentIndex + 1}`;

  return (
    <>
      <div className="fixed inset-0 z-[9999] bg-black/85 flex flex-col items-center justify-center text-white backdrop-blur-md">
        <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-6 shadow-lg shadow-amber-500/20"></div>
        <h3 className="text-xl font-bold tracking-wider uppercase text-white">
          {format === 'r2_jpeg' ? 'Đang chuẩn bị ảnh cho Cloudflare R2...' : `Đang xuất ${format.toUpperCase()}...`}
        </h3>
        <p className="text-slate-300 mt-2 font-medium text-sm">
          Đang xử lý {currentIndex + 1} / {totalCount}: <span className="text-amber-400 font-bold">{currentVersionName}</span>
        </p>
        <div className="w-80 bg-slate-800 rounded-full h-3 mt-4 overflow-hidden border border-slate-700/80 shadow-inner">
          <div 
            className="bg-amber-500 h-3 rounded-full transition-all duration-300 ease-out" 
            style={{ width: `${Math.max(6, percent)}%` }}
          ></div>
        </div>
        <span className="text-xs font-mono text-slate-400 mt-2">{percent}% hoàn thành</span>
      </div>
      <div style={{ position: 'absolute', top: 0, left: 0, zIndex: -9999, opacity: 0, pointerEvents: 'none' }}>
        {currentVersion && (
          <HiddenExportStage 
            key={currentVersion.id} 
            index={currentIndex}
            version={currentVersion} 
            units={units} 
            summaryData={summaryData} 
            dynamicSummaryMap={dynamicSummaryMap}
            selectedLabels={selectedLabels}
            reviewLabelColors={reviewLabelColors}
            paperSize={paperSize}
            onReady={handleCurrentStageReady} 
          />
        )}
      </div>
    </>
  );
};

export default React.memo(ReviewTab);
