import { useShallow } from 'zustand/react/shallow';
import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Rect, Circle, Line, Image as KonvaImage, Text, Group } from 'react-konva';
import useImage from 'use-image';
import { Layout, Eye, Camera, FileDown, Link as LinkIcon, Check, Copy, X, Tags } from 'lucide-react';
import { UnitShape, MapVersion } from './types';
import { cn } from '../../lib/utils';
import { jsPDF } from 'jspdf';
import { useSummaryData, generateSizeLabel, generateSizeLabelLines } from '../../lib/summaryData';
import { useDataStore } from '../../DataContext';
import { Calculator, CloudUpload } from 'lucide-react';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { uploadFileToDrive } from '../../lib/drive';
import { initAuth, googleSignIn, getAccessToken } from '../../lib/auth';
import R2UploadModal from '../R2UploadModal';
import { uploadFilesToR2 } from '../../lib/r2Upload';

interface ReviewTabProps {
  units: UnitShape[];
  setUnits: (units: UnitShape[]) => void;
  versions: MapVersion[];
  setVersions: (versions: MapVersion[]) => void;
  activeVersionId: string | null;
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

function ReviewTab({ units, setUnits, versions, setVersions, activeVersionId: initialActiveVersionId }: ReviewTabProps) {
  const [activeVersionId, setActiveVersionId] = useState<string | null>(initialActiveVersionId || versions[0]?.id || null);
  const activeVersion = versions.find(v => v.id === activeVersionId);
  const summaryData = useSummaryData();

  const {  store, reviewSelectedLabels: selectedLabels, setReviewSelectedLabels: setSelectedLabels, reviewLabelColors, setReviewLabelColors  } = useDataStore(useShallow(state => ({
    store: state.store,
    reviewSelectedLabels: state.reviewSelectedLabels,
    reviewLabelColors: state.reviewLabelColors,
    setReviewLabelColors: state.setReviewLabelColors,
    setReviewSelectedLabels: state.setReviewSelectedLabels,
  })));

  const [showLabelSettings, setShowLabelSettings] = useState(false);

  // Optimize units rendering by pre-calculating styles and filtering
  const styledUnits = React.useMemo(() => {
    if (!activeVersion) return [];

    // Pre-map unit IDs to group styles for O(1) lookup
    const unitToGroupStyle = new Map<string, { color: string; opacity: number }>();
    activeVersion.groups.forEach(group => {
      const assignedIds = activeVersion.groupMappings[group.id] || [];
      assignedIds.forEach(id => {
        unitToGroupStyle.set(id, {
          color: group.color,
          opacity: group.opacity ?? 0.6
        });
      });
    });

    const summaryMap = new Map();
    summaryData.forEach(s => summaryMap.set(s.unit, s));

    return units
      .filter(unit => unitToGroupStyle.has(unit.id))
      .map(unit => {
        const style = unitToGroupStyle.get(unit.id)!;
        const uInfo = summaryMap.get(unit.name);
        const sizeLabelLines = generateSizeLabelLines(unit, uInfo, selectedLabels);
        const sizeLabel = generateSizeLabel(unit, uInfo, selectedLabels);
        return {
          ...unit,
          displayColor: style.color,
          displayOpacity: style.opacity,
          sizeLabelLines,
          sizeLabel
        };
      });
  }, [units, activeVersion, summaryData, selectedLabels]);

  const [image] = useImage(activeVersion?.backgroundUrl || '', 'anonymous');
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
                alert(`Upload thành công toàn bộ ${uploadResult.successCount} file lên Cloudflare R2!`);
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

  const unitNamesStr = React.useMemo(() => JSON.stringify(units.map(u => ({ id: u.id, name: u.name }))), [units]);

  const aggregatedData = React.useMemo(() => {
    const dataMap: Record<string, any> = {};

    const parsedUnits = JSON.parse(unitNamesStr);
    parsedUnits.forEach((u: any) => {
      dataMap[u.name.toLowerCase()] = {
        name: u.name,
        id: u.id,
        unit: u.name,
        size: 0,
        sales: 0,
        salesByCp: 0,
        salesByHcmcate: 0,
        profit: 0,
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
      };
    });

    summaryData.forEach((sumData) => {
      const key = sumData.unit?.toLowerCase();
      if (key && dataMap[key]) {
        dataMap[key].size = sumData.size || 0;
        dataMap[key].sales = sumData.salesAmount || 0;
        dataMap[key].salesByCp = sumData.salesByCp || 0;
        dataMap[key].salesByHcmcate = sumData.salesByHcmcate || 0;
        dataMap[key].profit = sumData.profitAmount || 0;
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

    return dataMap;
  }, [unitNamesStr, summaryData]);

  const applyAllDynamicRules = () => {
    let hasChanges = false;
    const nextVersions = versions.map(v => {
      // Treat undefined as true for backwards compatibility
      const isActive = v.isDynamicActive !== false;
      if (!isActive) return v;

      let versionChanged = false;
      const newMappings = { ...v.groupMappings };

      v.groups.forEach((group) => {
        const matchingUnits = units.filter((u) => {
          if (!group.rules || group.rules.length === 0) return false;
          const data = aggregatedData[u.name.toLowerCase()];
          if (!data) return false;

          return group.rules.every((rule) => {
            let val = data[rule.field];
            if (rule.field === "margin" || rule.field === "marginByCp") val = val * 100;
            const numVal = Number(rule.value);
            const isNum = !isNaN(numVal) && rule.value.trim() !== "";

            switch (rule.operator) {
              case ">": return isNum ? Number(val) > numVal : false;
              case "<": return isNum ? Number(val) < numVal : false;
              case ">=": return isNum ? Number(val) >= numVal : false;
              case "<=": return isNum ? Number(val) <= numVal : false;
              case "=": return String(val || "").toLowerCase().trim() === String(rule.value || "").toLowerCase().trim();
              case "contains": {
                const searchTerms = String(rule.value || "").toLowerCase().trim().split(/\s+/);
                const targetStr = String(val || "").toLowerCase();
                return searchTerms.every(term => targetStr.includes(term));
              }
              case "exclude": {
                const searchTerms = String(rule.value || "").toLowerCase().trim().split(/\s+/);
                const targetStr = String(val || "").toLowerCase();
                return !searchTerms.some(term => targetStr.includes(term));
              }
              default: return false;
            }
          });
        }).map(u => u.id);

        const currentMappings = newMappings[group.id] || [];
        if (matchingUnits.length !== currentMappings.length || !matchingUnits.every((id) => currentMappings.includes(id))) {
          newMappings[group.id] = matchingUnits;
          versionChanged = true;
          hasChanges = true;
        }
      });

      if (versionChanged) {
        return { ...v, groupMappings: newMappings };
      }
      return v;
    });

    if (hasChanges) {
      setVersions(nextVersions);
    }
    
    // Update unit styles for the current active version just like in DynamicHierarchyTab
    if (activeVersion) {
      const v = nextVersions.find(ver => ver.id === activeVersion.id);
      if (v) {
        let colorChanges = false;
        const nextUnits = [...units];
        nextUnits.forEach((u, idx) => {
          let assignedColor = "#3b82f6";
          v.groups.forEach((g) => {
            if (v.groupMappings[g.id]?.includes(u.id)) {
              assignedColor = g.color;
            }
          });
          if (u.fill !== assignedColor) {
            nextUnits[idx] = { ...u, fill: assignedColor };
            colorChanges = true;
          }
        });

        if (colorChanges) {
          setUnits(nextUnits);
        }
      }
    }

    if (hasChanges) {
      alert('Đã áp dụng điều kiện cho tất cả các phiên bản.');
    } else {
      alert('Không có thay đổi nào cần cập nhật.');
    }
  };

  useEffect(() => {
    if (activeVersion) {
        setScale(activeVersion.backgroundScale || 1);
        setPosition(activeVersion.backgroundPos || { x: 0, y: 0 });
    }
  }, [activeVersionId, activeVersion]);

  useEffect(() => {
    if (containerRef.current) {
      setCanvasSize({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight
      });
    }
  }, []);

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = e.target.getStage();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
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
    <div className="flex flex-col h-full gap-6">
      {/* Selection Header */}
      <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-2xl border border-slate-800/50 glass relative z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600/20 text-brand-400 rounded-lg flex items-center justify-center">
            <Eye size={18} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Mapping Review</h4>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">XEM TRƯỚC PHIÊN BẢN THEO NHÓM</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={applyAllDynamicRules}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold uppercase transition-colors shadow-lg shadow-brand-900/20 box-border border-2 border-brand-400 mr-2"
          >
            <Calculator size={14} /> Apply Rules To All
          </button>
          
          <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-1 mr-4">
             <button onClick={handleExportJPEG} title="Save to JPEG" className="px-3 py-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded flex items-center justify-center transition-colors">
               <Camera size={14} className="mr-2" /> JPEG
             </button>
             <button onClick={handleExportPDF} title="Save to PDF" className="px-3 py-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded flex items-center justify-center transition-colors">
               <FileDown size={14} className="mr-2" /> PDF
             </button>
             <button onClick={handleExportDrive} title="Upload to Google Drive" className="px-3 py-1.5 hover:bg-slate-800 text-slate-400 hover:text-brand-400 rounded flex items-center justify-center transition-colors">
               <CloudUpload size={14} className="mr-2" /> Drive
             </button>
             <button onClick={handleExportR2} title="Upload to Cloudflare R2" className="px-3 py-1.5 hover:bg-slate-800 text-slate-400 hover:text-amber-400 rounded flex items-center justify-center transition-colors">
               <CloudUpload size={14} className="mr-2" /> R2 Cloud
             </button>
             <div className="relative">
                <button 
                  onClick={() => setShowLabelSettings(!showLabelSettings)} 
                  className={cn("px-3 py-1.5 rounded flex items-center justify-center transition-colors", showLabelSettings ? "bg-brand-600 text-white" : "hover:bg-slate-800 text-slate-400 hover:text-brand-400")}
                >
                  <Tags size={14} className="mr-2" /> Labels
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

          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Version:</span>
          <select 
            value={activeVersionId || ''} 
            onChange={(e) => setActiveVersionId(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs font-bold rounded-lg px-4 py-2 outline-none focus:border-brand-500 transition-all min-w-[160px] uppercase tracking-wider"
          >
            {versions.length === 0 && <option value="">No versions available</option>}
            {versions.map(v => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Main Preview Area */}
        <div className="flex-1 rounded-2xl border border-slate-800/50 glass overflow-hidden relative bg-[#1e1e1e]" ref={containerRef}>
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
              {styledUnits.map((unit) => {
                const { displayColor, displayOpacity } = unit as any;
                
                return (
                  <React.Fragment key={unit.id}>
                    {unit.type === 'rect' && (
                      <Rect
                        x={unit.x}
                        y={unit.y}
                        width={unit.width}
                        height={unit.height}
                        fill={displayColor}
                        opacity={displayOpacity}
                        rotation={unit.rotation || 0}
                        stroke="#ffffff"
                        strokeWidth={2 / scale}
                        shadowBlur={4}
                        shadowColor="rgba(0,0,0,0.5)"
                        listening={false}
                      />
                    )}
                    {unit.type === 'circle' && (
                      <Circle
                        x={unit.x}
                        y={unit.y}
                        radius={unit.radius}
                        fill={displayColor}
                        opacity={displayOpacity}
                        rotation={unit.rotation || 0}
                        stroke="#ffffff"
                        strokeWidth={2 / scale}
                        shadowBlur={4}
                        shadowColor="rgba(0,0,0,0.5)"
                        listening={false}
                      />
                    )}
                    {unit.type === 'polygon' && (
                      <Line
                        x={unit.x || 0}
                        y={unit.y || 0}
                        points={unit.points}
                        fill={displayColor}
                        opacity={displayOpacity}
                        rotation={unit.rotation || 0}
                        stroke="#ffffff"
                        strokeWidth={2 / scale}
                        shadowBlur={4}
                        shadowColor="rgba(0,0,0,0.5)"
                        closed
                        listening={false}
                      />
                    )}
                    
                    {/* Unit Label - only show if scale is large enough to be readable */}
                    {scale > 0.3 && (
                      <Group
                        x={unit.type === 'rect' ? unit.x : (unit.type === 'circle' ? unit.x - (unit.radius || 0) : (unit.points ? Math.min(...unit.points.filter((_: any, i: number) => i % 2 === 0)) : unit.x))}
                        y={unit.type === 'rect' ? unit.y : (unit.type === 'circle' ? unit.y - (unit.radius || 0) : (unit.points ? Math.min(...unit.points.filter((_: any, i: number) => i % 2 === 1)) : unit.y))}
                        width={unit.type === 'rect' ? unit.width : (unit.type === 'circle' ? (unit.radius || 0) * 2 : (unit.points ? Math.max(...unit.points.filter((_: any, i: number) => i % 2 === 0)) - Math.min(...unit.points.filter((_: any, i: number) => i % 2 === 0)) : 100))}
                        height={unit.type === 'rect' ? unit.height : (unit.type === 'circle' ? (unit.radius || 0) * 2 : (unit.points ? Math.max(...unit.points.filter((_: any, i: number) => i % 2 === 1)) - Math.min(...unit.points.filter((_: any, i: number) => i % 2 === 1)) : 30))}
                        rotation={unit.rotation || 0}
                      >
                        {(() => {
                          const lines = unit.sizeLabelLines || [];
                          const fontSize = 10 / scale;
                          const lineHeight = fontSize * 1.2;
                          const totalHeight = lines.length * lineHeight;
                          const boxHeight = unit.type === 'rect' ? unit.height : (unit.type === 'circle' ? (unit.radius || 0) * 2 : (unit.points ? Math.max(...unit.points.filter((_: any, i: number) => i % 2 === 1)) - Math.min(...unit.points.filter((_: any, i: number) => i % 2 === 1)) : 30));
                          const boxWidth = unit.type === 'rect' ? unit.width : (unit.type === 'circle' ? (unit.radius || 0) * 2 : (unit.points ? Math.max(...unit.points.filter((_: any, i: number) => i % 2 === 0)) - Math.min(...unit.points.filter((_: any, i: number) => i % 2 === 0)) : 100));
                          const startY = (boxHeight - totalHeight) / 2;
                          return lines.map((line: any, i: number) => (
                            <Text
                              key={i}
                              x={0}
                              y={startY + i * lineHeight}
                              width={boxWidth}
                              text={line.text}
                              fill={reviewLabelColors?.[line.key] || '#ffffff'}
                              align="center"
                              fontSize={fontSize}
                              fontStyle="bold"
                              listening={false}
                              shadowColor="black"
                              shadowBlur={2}
                              shadowOpacity={1}
                              shadowOffset={{ x: 1, y: 1 }}
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
        <div className="w-80 flex flex-col gap-4 bg-slate-900/50 rounded-2xl border border-slate-800/50 p-4 glass overflow-y-auto">
          <div className="flex border-b border-slate-800 pb-2 mb-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex-1">Legend / Groups</h4>
          </div>
          
          <div className="space-y-3">
             {activeVersion?.groups.map(group => {
               // Only show groups that have units assigned in this version
               const assignedUnitIds = activeVersion?.groupMappings[group.id] || [];
               if (assignedUnitIds.length === 0) return null;
               
               return (
                 <div key={group.id} className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl space-y-2">
                   <div className="flex items-center gap-2">
                     <div className="w-3 h-3 rounded-full" style={{ backgroundColor: group.color }} />
                     <span className="text-xs font-bold text-slate-300 uppercase tracking-tight">{group.name}</span>
                     <span className="ml-auto text-[10px] text-slate-500">{assignedUnitIds.length} units</span>
                   </div>
                   <div className="flex flex-wrap gap-1">
                     {assignedUnitIds.map(uid => {
                       const u = units.find(x => x.id === uid);
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
      </div>

      {showShareModal && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden">
                <button onClick={() => setShowShareModal(false)} className="absolute top-4 right-4 p-2 bg-slate-800 text-slate-400 hover:text-white rounded-lg z-10 transition-colors">
                    <X size={20} />
                </button>
                <div className="p-6 border-b border-slate-800 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-400">
                        <LinkIcon size={20} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Share Review Viewer</h3>
                      <p className="text-sm text-slate-400">Copy this link to share the current view.</p>
                    </div>
                </div>
                
                <div className="flex-1 overflow-auto p-6 bg-bg-dark flex justify-center items-center">
                    {shareImage && <img src={shareImage} alt="Share preview" className="max-w-full max-h-full object-contain rounded-xl border border-slate-800 shadow-xl" />}
                </div>

                <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex gap-3">
                    <input 
                        type="text" 
                        readOnly 
                        value={actualShareLink} 
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-300 font-mono text-sm outline-none" 
                    />
                    <button 
                      onClick={copyToClipboard}
                      className="px-6 py-3 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-lg flex items-center gap-2 transition-colors"
                    >
                      {copiedLink ? <Check size={18} /> : <Copy size={18} />} 
                      {copiedLink ? 'Copied' : 'Copy Link'}
                    </button>
                </div>
            </div>
        </div>
      )}
      
      {exportAllFormat && (
          <ExportAllManager 
             versions={versions.filter(v => selectedVersionsToExport[v.id])} 
             units={units} 
             summaryData={summaryData} 
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

      {exportModalVisible && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg flex flex-col shadow-2xl relative overflow-hidden max-h-[90vh]">
                <button onClick={() => setExportModalVisible(false)} className="absolute top-4 right-4 p-2 bg-slate-800 text-slate-400 hover:text-white rounded-lg z-10 transition-colors">
                    <X size={20} />
                </button>
                <div className="p-6 border-b border-slate-800 shrink-0">
                    <h3 className="text-xl font-bold text-white uppercase tracking-wider">
                        {exportFormat === 'drive' ? 'Upload to Drive' : exportFormat === 'r2_jpeg' ? 'Upload to Cloud R2' : `Export ${exportFormat.toUpperCase()}`}
                    </h3>
                    <p className="text-sm text-slate-400">Select which versions to include in the export.</p>
                    
                    <div className="mt-4 flex flex-col gap-3 relative">
                        <div className="flex items-center justify-between">
                            {(exportFormat === 'pdf' || exportFormat === 'drive' || exportFormat === 'r2_jpeg') ? (
                                <div className="flex items-center gap-3">
                                    <label className="text-sm font-medium text-slate-300">Paper Size:</label>
                                    <select 
                                        value={exportPaperSize}
                                        onChange={(e) => setExportPaperSize(e.target.value as any)}
                                        className="bg-slate-950 text-white text-sm px-3 py-1.5 rounded-lg border border-slate-700 outline-none"
                                    >
                                        <option value="a4">A4</option>
                                        <option value="a3">A3</option>
                                        <option value="a2">A2</option>
                                        <option value="original">Original Dimensions</option>
                                    </select>
                                </div>
                            ) : <div></div>}
                            
                            <div className="flex justify-end gap-2 shrink-0 pr-6">
                                <button 
                                  onClick={() => setExportModalVisible(false)}
                                  className="px-3 py-1.5 text-xs hover:bg-slate-800 text-slate-300 font-bold rounded-lg transition-colors"
                                >
                                  Cancel
                                </button>
                                <button 
                                  onClick={handleConfirmExport}
                                  disabled={!Object.values(selectedVersionsToExport).some(v => v)}
                                  className="px-4 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg flex items-center transition-colors"
                                >
                                  {exportFormat === 'drive' ? 'Upload Selected' : exportFormat === 'r2_jpeg' ? 'Xác nhận & Tiếp tục' : 'Export Selected'}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <label className="text-sm font-medium text-slate-300">Quality / File Size:</label>
                            <select 
                                value={exportQuality}
                                onChange={(e) => setExportQuality(e.target.value as any)}
                                className="bg-slate-950 text-white text-sm px-3 py-1.5 rounded-lg border border-slate-700 outline-none w-64"
                            >
                                <option value="high">High (4x resolution, large size)</option>
                                <option value="medium">Medium (2x resolution, medium size)</option>
                                <option value="low">Low (1x resolution, small size)</option>
                            </select>
                        </div>
                    </div>
                </div>
                
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
                        <label key={v.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-800 bg-slate-950 cursor-pointer hover:bg-slate-900 transition-colors">
                            <input 
                                type="checkbox" 
                                checked={!!selectedVersionsToExport[v.id]} 
                                onChange={(e) => {
                                    setSelectedVersionsToExport(prev => ({ ...prev, [v.id]: e.target.checked }));
                                }}
                                className="w-5 h-5 rounded bg-slate-900 border-slate-600 focus:ring-brand-500"
                            />
                            <span className="text-slate-300">{v.name}</span>
                        </label>
                    ))}
                </div>
            </div>
        </div>
      )}
    </div>
  );
}

const HiddenExportStage = ({ version, units, summaryData, selectedLabels, reviewLabelColors, paperSize, onReady, index }: any) => {
  const styledUnits = React.useMemo(() => {
    const unitToGroupStyle = new Map<string, { color: string; opacity: number }>();
    version.groups.forEach((group: any) => {
      const assignedIds = version.groupMappings[group.id] || [];
      assignedIds.forEach((id: string) => {
        unitToGroupStyle.set(id, {
          color: group.color,
          opacity: group.opacity ?? 0.6
        });
      });
    });

    const summaryMap = new Map();
    summaryData.forEach((s: any) => summaryMap.set(s.unit, s));

    return units
      .filter((unit: any) => unitToGroupStyle.has(unit.id))
      .map((unit: any) => {
        const style = unitToGroupStyle.get(unit.id)!;
        const uInfo = summaryMap.get(unit.name);
        const sizeLabelLines = generateSizeLabelLines(unit, uInfo, selectedLabels);
        const sizeLabel = generateSizeLabel(unit, uInfo, selectedLabels);
        return {
          ...unit,
          displayColor: style.color,
          displayOpacity: style.opacity,
          sizeLabelLines,
          sizeLabel
        };
      });
  }, [units, version, summaryData, selectedLabels]);

  const [image, status] = useImage(version.backgroundUrl || '', 'anonymous');
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
    const w = (image.naturalWidth || image.width) * (version?.imageScale || 1);
    const h = (image.naturalHeight || image.height) * (version?.imageScale || 1);
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
                                        <Text key={i} x={0} y={y} width={effectiveWidth} text={block.text} fill={reviewLabelColors?.[block.key] || '#ffffff'} align="center" fontSize={fontSize} fontStyle="bold" listening={false} shadowColor="black" shadowBlur={2} shadowOpacity={1} />
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
                                        <Text key={i} x={0} y={y} width={effectiveWidth} text={block.text} fill={reviewLabelColors?.[block.key] || '#ffffff'} align="center" fontSize={fontSize} fontStyle="bold" listening={false} shadowColor="black" shadowBlur={2} shadowOpacity={1} />
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
                                            <Text key={i} x={0} y={y} width={effectiveWidth} text={block.text} fill={reviewLabelColors?.[block.key] || '#ffffff'} align="center" fontSize={fontSize} fontStyle="bold" listening={false} shadowColor="black" shadowBlur={2} shadowOpacity={1} />
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

export const ExportAllManager = ({ versions, units, summaryData, format, paperSize, quality, selectedLabels, reviewLabelColors, onComplete }: any) => {
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
