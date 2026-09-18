import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Circle, Line, Text, Group } from 'react-konva';
import { useAppStore } from '../store/useAppStore';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RefreshCw, Download, Layers, Settings, Key, X, Cloud, Search, ZoomIn, ZoomOut, Maximize2, FolderOutput, Menu } from 'lucide-react';
import useImage from 'use-image';
import { useSummaryData } from './PictureMapping/lib/summaryData';
import { extractR2Key } from './PictureMapping/lib/r2Upload';
import { getStatus, enrichProjects, formatDisplayDateTime } from '../lib/utils';
import { Project } from '../types';
import { doc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from '../lib/firebase';

interface LiveLayoutViewerProps {
  storeFilter: string;
  locationFilter: string;
}

export function LiveLayoutViewer({ storeFilter, locationFilter }: LiveLayoutViewerProps) {
  const { r2Config, setR2Config } = useAppStore();
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Form states for in-place R2 configuration
  const [cfgAccountId, setCfgAccountId] = useState('');
  const [cfgBucketName, setCfgBucketName] = useState('');
  const [cfgAccessKey, setCfgAccessKey] = useState('');
  const [cfgSecretKey, setCfgSecretKey] = useState('');

  // Load initial form values from localStorage
  const initFormFromStorage = () => {
    setCfgAccountId(r2Config?.accountId || (localStorage.getItem('r2_account_id') || '').trim());
    setCfgBucketName(r2Config?.bucketName || (localStorage.getItem('r2_bucket_name') || '').trim());
    setCfgAccessKey(r2Config?.accessKeyId || (localStorage.getItem('r2_access_key') || localStorage.getItem('r2_access_key_id') || '').trim());
    setCfgSecretKey(r2Config?.secretAccessKey || (localStorage.getItem('r2_secret_key') || localStorage.getItem('r2_secret_access_key') || '').trim());
  };

  // Load config from R2
  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const accountId = r2Config?.accountId || (localStorage.getItem('r2_account_id') || '').trim();
      const accessKeyId = r2Config?.accessKeyId || (localStorage.getItem('r2_access_key') || localStorage.getItem('r2_access_key_id') || '').trim();
      const secretAccessKey = r2Config?.secretAccessKey || (localStorage.getItem('r2_secret_key') || localStorage.getItem('r2_secret_access_key') || '').trim();
      const bucketName = r2Config?.bucketName || (localStorage.getItem('r2_bucket_name') || '').trim();

      if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
        initFormFromStorage();
        throw new Error('Chưa cấu hình R2 Cloudflare trên hệ thống. Vui lòng bấm "Cấu hình R2" bên dưới hoặc vào Tab Picture Mapping để kết nối Cloud Sync.');
      }

      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });

      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: 'mapping_config.json'
      });
      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
      
      const res = await fetch(signedUrl);
      if (!res.ok) throw new Error('Không tìm thấy file cấu hình trên Cloud (mapping_config.json). Vui lòng kiểm tra lại Bucket hoặc xuất bản vẽ trước.');
      
      const data = await res.json();
      
      // Resolve R2 URLs in storeLocationData if it exists (New Format)
      if (data.storeLocationData) {
          const resolvePromises: Promise<void>[] = [];
          
          for (const pKey in data.storeLocationData) {
              const partition = data.storeLocationData[pKey];
              if (!partition.mapVersions) continue;
              
              for (const v of partition.mapVersions) {
                  const imgKey = extractR2Key(v.backgroundUrl);
                  if (imgKey) {
                      const imgCommand = new GetObjectCommand({ Bucket: bucketName, Key: imgKey });
                      resolvePromises.push(
                          getSignedUrl(s3, imgCommand, { expiresIn: 3600 * 24 * 7 }).then(url => {
                              v.backgroundUrl = url;
                          }).catch(err => {
                              console.warn('Could not resolve signed URL for', imgKey, err);
                          })
                      );
                  }
              }
          }
          await Promise.all(resolvePromises);
          setConfig(data);
      } else if (data.versions && data.versions.length > 0) {
          // Legacy format fallback
         const activeVersion = data.versions.find((v: any) => v.isDynamicActive) || data.versions[0];
         const imgKey = extractR2Key(activeVersion?.backgroundUrl);
         if (activeVersion && imgKey) {
            const imgCommand = new GetObjectCommand({ Bucket: bucketName, Key: imgKey });
            activeVersion.backgroundUrl = await getSignedUrl(s3, imgCommand, { expiresIn: 3600 * 24 * 7 });
         }
         
         setConfig({
             ...data,
             version: activeVersion,
             units: data.mapUnits || data.units || []
         });
      } else {
         setConfig(data);
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveR2Config = async () => {
    const acc = cfgAccountId.trim();
    const bkt = cfgBucketName.trim();
    const key = cfgAccessKey.trim();
    const sec = cfgSecretKey.trim();

    if (!acc || !bkt || !key || !sec) {
      alert('Vui lòng điền đủ 4 trường: Account ID, Bucket Name, Access Key và Secret Key.');
      return;
    }

    localStorage.setItem('r2_account_id', acc);
    localStorage.setItem('r2_bucket_name', bkt);
    localStorage.setItem('r2_access_key', key);
    localStorage.setItem('r2_access_key_id', key);
    localStorage.setItem('r2_secret_key', sec);
    localStorage.setItem('r2_secret_access_key', sec);

    // Save to global config
    const configData = {
      accountId: acc,
      bucketName: bkt,
      accessKeyId: key,
      secretAccessKey: sec
    };
    setR2Config(configData);

    try {
      await setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "r2_credentials"), configData);
      await setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "versions"), { 
        r2Version: Date.now(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.error("Lỗi khi lưu cấu hình R2 lên server:", e);
    }

    setShowConfigModal(false);
    loadConfig();
  };

  useEffect(() => {
    loadConfig();
  }, [r2Config]);

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin mb-2" />
        <p className="text-sm font-medium">Đang tải cấu hình Bản đồ Chuyên đề (Thematic Map)...</p>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-amber-600 p-4">
        <Layers className="w-10 h-10 mb-2 opacity-50" />
        <p className="text-sm font-medium px-4 text-center max-w-md">{error}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button 
            onClick={() => {
              initFormFromStorage();
              setShowConfigModal(true);
            }} 
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Settings className="w-4 h-4" />
            Cấu hình R2 Cloudflare
          </button>
          <button 
            onClick={loadConfig} 
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Thử lại
          </button>
        </div>

        {/* Modal cấu hình nhanh R2 ngay tại Live Map */}
        {showConfigModal && (
          <div className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 text-slate-200 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-base">
                  <Cloud className="w-5 h-5" />
                  Cấu hình Cloudflare R2
                </div>
                <button 
                  onClick={() => setShowConfigModal(false)}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 uppercase tracking-wider font-semibold mb-1">Account ID</label>
                  <input
                    type="text"
                    value={cfgAccountId}
                    onChange={(e) => setCfgAccountId(e.target.value)}
                    placeholder="VD: a1b2c3d4e5f6..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 uppercase tracking-wider font-semibold mb-1">Bucket Name</label>
                  <input
                    type="text"
                    value={cfgBucketName}
                    onChange={(e) => setCfgBucketName(e.target.value)}
                    placeholder="VD: takashimaya-mapping"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 uppercase tracking-wider font-semibold mb-1">Access Key ID</label>
                  <input
                    type="text"
                    value={cfgAccessKey}
                    onChange={(e) => setCfgAccessKey(e.target.value)}
                    placeholder="R2 API Token Access Key"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 uppercase tracking-wider font-semibold mb-1">Secret Access Key</label>
                  <input
                    type="password"
                    value={cfgSecretKey}
                    onChange={(e) => setCfgSecretKey(e.target.value)}
                    placeholder="R2 API Token Secret Key"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSaveR2Config}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold"
                >
                  Lưu & Tải Live Map
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return <LiveCanvas config={config} storeFilter={storeFilter} locationFilter={locationFilter} onOpenR2Config={() => { initFormFromStorage(); setShowConfigModal(true); }} />;
}

function LiveCanvas({ config, storeFilter, locationFilter, onOpenR2Config }: { config: any, storeFilter: string, locationFilter: string, onOpenR2Config: () => void }) {
  const { r2Version, r2Units } = useMemo(() => {
     if (config.storeLocationData) {
         const targetLoc = locationFilter !== 'all' ? locationFilter : 'L1'; 
         const pKey = `${storeFilter}_${targetLoc}`;
         const partition = config.storeLocationData[pKey];
         if (partition) {
             const v = partition.mapVersions?.find((v: any) => v.isDynamicActive) || partition.mapVersions?.[0] || {};
             return { r2Version: v, r2Units: partition.mapUnits || [] };
         }
         return { r2Version: {}, r2Units: [] };
     }
     return { r2Version: config.version || {}, r2Units: config.units || [] };
  }, [config, storeFilter, locationFilter]);

  const version = r2Version;
  const units = r2Units;
  const [bgImage] = useImage(version.backgroundUrl || '', 'anonymous');
  
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoverInfo, setHoverInfo] = useState<{ visible: boolean; data: any; unitName: string } | null>(null);
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [showMenu, setShowMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const touchStateRef = useRef<{
    lastDist: number;
    lastCenter: { x: number; y: number } | null;
    lastTap: number;
  }>({
    lastDist: 0,
    lastCenter: null,
    lastTap: 0,
  });

  const wheelTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-fit floor plan background & units to perfectly fit and center in the viewport
  const fitToScreen = useCallback(() => {
    const containerW = containerRef.current?.offsetWidth || dimensions.width;
    const containerH = containerRef.current?.offsetHeight || dimensions.height;
    if (containerW <= 0 || containerH <= 0) return;

    let contentW = 1000;
    let contentH = 800;
    let contentX = 0;
    let contentY = 0;

    if (bgImage) {
      const imgNaturalW = bgImage.naturalWidth || bgImage.width || 1000;
      const imgNaturalH = bgImage.naturalHeight || bgImage.height || 800;
      const imgScale = version.imageScale || 1;
      contentW = imgNaturalW * imgScale;
      contentH = imgNaturalH * imgScale;
      contentX = version.imagePos?.x || 0;
      contentY = version.imagePos?.y || 0;
    } else if (units && units.length > 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      units.forEach((u: any) => {
        const ux = u.x || 0;
        const uy = u.y || 0;
        const uw = u.width || 100;
        const uh = u.height || 100;
        minX = Math.min(minX, ux);
        minY = Math.min(minY, uy);
        maxX = Math.max(maxX, ux + uw);
        maxY = Math.max(maxY, uy + uh);
      });
      if (minX !== Infinity && maxX > minX) {
        contentX = minX;
        contentY = minY;
        contentW = Math.max(100, maxX - minX);
        contentH = Math.max(100, maxY - minY);
      }
    }

    // Dynamic padding so the background image borders never get clipped on mobile or desktop
    const pad = containerW < 640 ? 12 : 24;
    const availW = Math.max(10, containerW - pad * 2);
    const availH = Math.max(10, containerH - pad * 2);

    const scaleX = availW / contentW;
    const scaleY = availH / contentH;
    const fitScale = Math.min(scaleX, scaleY);
    const clampedScale = Math.max(0.01, Math.min(fitScale, 10));

    // Center content in viewport
    const contentCenterX = contentX + contentW / 2;
    const contentCenterY = contentY + contentH / 2;
    const posX = containerW / 2 - contentCenterX * clampedScale;
    const posY = containerH / 2 - contentCenterY * clampedScale;

    const newPos = { x: posX, y: posY };
    setStageScale(clampedScale);
    setStagePos(newPos);

    if (stageRef.current) {
      stageRef.current.scale({ x: clampedScale, y: clampedScale });
      stageRef.current.position(newPos);
      stageRef.current.batchDraw();
    }
  }, [bgImage, version, units, dimensions]);

  // Trigger fitToScreen when background image or partition version changes
  useEffect(() => {
    fitToScreen();
  }, [fitToScreen]);

  // 1. Get real-time projects and Excel summary data
  const projects = useAppStore(state => state.projects);
  const tasks = useAppStore(state => state.tasks);
  const summaryData = useSummaryData();

  // 2. Build aggregatedData
  const aggregatedData = useMemo(() => {
    const dataMap: Record<string, any> = {};
    
    units.forEach((u: any) => {
      dataMap[u.name.toLowerCase()] = {
        name: u.name,
        id: u.id,
        unit: u.name,
        size: 0, sales: 0, salesByCp: 0, salesByHcmcate: 0,
        profit: 0, profitByCp: 0, profitByHcmcate: 0,
        margin: 0, marginByCp: 0, hcmSalesEffi: 0, hcmMargin: 0,
        mdStatus: "", task: "", projectStatus: "", actStatus: "",
        endDate: "", status: "", vendorCode: "",
        brandCode: "", brandName: "", classCode: "", floor: u.location || locationFilter || "",
        appProjectStatus: "", appProjectBudget: 0, appProjectActual: 0, appProjectCode: "", projectName: "", startDate: "", handoverDate: "", openingDate: "", detail: "", party: ""
      };
    });

    summaryData.forEach((sumData) => {
      const key = sumData.unit?.toLowerCase();
      if (key && dataMap[key]) {
        Object.assign(dataMap[key], {
            size: sumData.size || 0,
            sales: sumData.salesAmount || 0,
            profit: sumData.profitAmount || 0,
            margin: sumData.margin || 0,
            hcmSalesEffi: sumData.hcmSalesEffi || 0,
            mdStatus: sumData.mdStatus || "",
            projectStatus: sumData.projectStatus || "",
            status: sumData.status || "",
            brandName: sumData.brandName || "",
            floor: dataMap[key].floor || (sumData as any).floor || "",
        });
      }
    });

    const enrichedProjects = enrichProjects(projects, tasks);
    const now = new Date();
    enrichedProjects.forEach((p) => {
      if (!p.code) return;
      if (storeFilter !== 'all' && p.store !== storeFilter) return;
      const pCodes = String(p.code).split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
      const status = getStatus(p.computedTakStart || p.start, p.computedTakCompl || p.handover, p.computedOpening || p.opening, p.code);
      
      let activeTaskNames: string[] = [];
      if (p.taskSummaries) {
        const activeTasks = p.taskSummaries.filter(t => {
          if (!t.start || !t.finish) return false;
          const start = new Date(t.start);
          const finish = new Date(t.finish);
          return now >= start && now <= finish;
        });
        activeTaskNames = activeTasks.map(t => t.name);
      }
      let taskLines: string[] = [];
      activeTaskNames.forEach(name => {
        taskLines.push(...name.split('\n').filter((l: string) => l.trim() !== ''));
      });

      pCodes.forEach(code => {
         if (dataMap[code]) {
            dataMap[code].appProjectStatus = status;
            dataMap[code].appProjectBudget = p.budget || 0;
            dataMap[code].appProjectActual = p.actual || 0;
            dataMap[code].appProjectCode = String(p.code);
            dataMap[code].projectName = p.name || "";
            dataMap[code].startDate = p.start || p.computedTakStart || "";
            dataMap[code].handoverDate = p.handover || p.computedTakCompl || "";
            dataMap[code].openingDate = p.opening || p.computedOpening || "";
            dataMap[code].detail = p.detail || "";
            dataMap[code].taskLines = taskLines;
            dataMap[code].mdStatus = p.mdStatus || dataMap[code].mdStatus || "";
            dataMap[code].party = p.party || (p as any).contractor || "";
         }
      });
    });

    return dataMap;
  }, [units, summaryData, projects, storeFilter, locationFilter]);

  // 3. Evaluate rules on the fly to build unitColorMap
  const { unitColorMap, activeGroups } = useMemo(() => {
    const colorMap: Record<string, string> = {};
    const groupsInUse: any[] = [];
    
    if (!version.groups) return { unitColorMap: colorMap, activeGroups: groupsInUse };

    version.groups.forEach((group: any) => {
        let matchCount = 0;
        const mappedUnitIds = new Set(version.groupMappings?.[group.id] || []);
        
        units.forEach((u: any) => {
            let isMatch = false;
            
            if (mappedUnitIds.has(u.id)) {
                isMatch = true;
            }
            
            const isDynamicActive = version.isDynamicActive !== false;
            
            if (group.rules && group.rules.length > 0) {
                const hasManualMapping = version.groupMappings && Object.values(version.groupMappings).some(m => Array.isArray(m) && m.length > 0);
                if (isDynamicActive || !hasManualMapping) {
                    const data = aggregatedData[u.name?.toLowerCase() || ''];
                    if (data) {
                        const passedRules = group.rules.every((rule: any) => {
                            let val = data[rule.field];
                            if (rule.field === "margin" || rule.field === "marginByCp") val = val * 100;
                            const numVal = Number(rule.value);
                            const isNum = !isNaN(numVal) && rule.value.trim() !== "";
                            
                            let compareValStr = String(val || "").toLowerCase().trim();
                            let compareRuleStr = String(rule.value || "").toLowerCase().trim();
                            if (compareRuleStr === "in progress") compareRuleStr = "on process";
                            if (compareValStr === "in progress") compareValStr = "on process";

                            switch (rule.operator) {
                              case ">": return isNum ? Number(val) > numVal : false;
                              case "<": return isNum ? Number(val) < numVal : false;
                              case ">=": return isNum ? Number(val) >= numVal : false;
                              case "<=": return isNum ? Number(val) <= numVal : false;
                              case "=": return compareValStr === compareRuleStr;
                              case "contains": {
                                const searchTerms = compareRuleStr.split(/\s+/);
                                return searchTerms.every(term => compareValStr.includes(term));
                              }
                              case "exclude": {
                                const searchTerms = compareRuleStr.split(/\s+/);
                                return !searchTerms.some(term => compareValStr.includes(term));
                              }
                              default: return false;
                            }
                        });
                        if (passedRules) isMatch = true;
                    }
                }
            }
            if (isMatch) {
                colorMap[u.id] = group.color;
                matchCount++;
            }
        });
        
        if (matchCount > 0) {
            groupsInUse.push({ ...group, matchCount });
        }
    });

    return { unitColorMap: colorMap, activeGroups: groupsInUse };
  }, [version.groups, version.groupMappings, version.isDynamicActive, units, aggregatedData]);

  // 4. Filter only units that appear in dynamic tab and precalculate bounds
  const displayedUnits = useMemo(() => {
    return units
      .filter((unit: any) => {
        if (unit.visible === false) return false;
        
        const targetColor = unitColorMap[unit.id];
        if (!targetColor) return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const uData = aggregatedData[unit.name?.toLowerCase() || ''] || {};
          const matchName = (unit.name || '').toLowerCase().includes(q);
          const matchBrand = (uData.brandName || '').toLowerCase().includes(q);
          const matchProject = (uData.projectName || '').toLowerCase().includes(q);
          const matchCode = (uData.appProjectCode || '').toLowerCase().includes(q);
          if (!matchName && !matchBrand && !matchProject && !matchCode) {
            return false;
          }
        }
        return true;
      })
      .map((unit: any) => {
        const targetColor = unitColorMap[unit.id];
        
        let textX = unit.x;
        let textY = unit.y;
        let textWidth = 100;
        let textHeight = 30;

        if (unit.type === 'rect') {
          textX = unit.x;
          textY = unit.y;
          textWidth = unit.width || 100;
          textHeight = unit.height || 30;
        } else if (unit.type === 'circle') {
          const r = unit.radius || 20;
          textX = unit.x - r;
          textY = unit.y - r;
          textWidth = r * 2;
          textHeight = r * 2;
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
          textX = minX;
          textY = minY;
          textWidth = Math.max(20, maxX - minX);
          textHeight = Math.max(20, maxY - minY);
        }

        return {
          ...unit,
          targetColor,
          textX,
          textY,
          textWidth,
          textHeight,
        };
      });
  }, [units, unitColorMap, searchQuery, aggregatedData]);

  // Handle position tooltip directly via DOM with 2D collision clamping to prevent screen cropping
  const updateTooltipPos = (clientX: number, clientY: number) => {
    requestAnimationFrame(() => {
      if (!tooltipRef.current) return;
      const el = tooltipRef.current;
      const rect = el.getBoundingClientRect();
      const tooltipWidth = rect.width > 0 ? rect.width : 300;
      const tooltipHeight = rect.height > 0 ? rect.height : 260;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const pad = 12;

      // 1. Calculate X position (try right first, then flip left, then clamp)
      let left = clientX + 16;
      if (left + tooltipWidth > viewportWidth - pad) {
        left = clientX - tooltipWidth - 16;
      }
      left = Math.max(pad, Math.min(left, viewportWidth - tooltipWidth - pad));

      // 2. Calculate Y position (try bottom first, then flip top, then clamp)
      let top = clientY + 16;
      if (top + tooltipHeight > viewportHeight - pad) {
        top = clientY - tooltipHeight - 16;
      }
      top = Math.max(pad, Math.min(top, viewportHeight - tooltipHeight - pad));

      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.transform = 'none';
    });
  };

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const handleExport = () => {
     if (!stageRef.current) return;
     const dataURL = stageRef.current.toDataURL({ pixelRatio: 2 });
     const link = document.createElement('a');
     link.download = `Thematic_Map_${new Date().toISOString().slice(0,10)}.png`;
     link.href = dataURL;
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
  };

  // Capped pixel ratio for silky smooth iOS GPU execution
  const pixelRatio = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;

  return (
    <div className="w-full h-full flex flex-col bg-slate-100 overflow-hidden relative select-none [background-image:linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] [background-size:20px_20px]">
      
      {/* Floating Top-Right Controls */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-1 border border-slate-200 dark:border-slate-700 shadow-md rounded-xl">
        <button
          type="button"
          onClick={() => {
            const stage = stageRef.current;
            if (!stage) return;
            const oldScale = stage.scaleX();
            const newScale = Math.min(oldScale * 1.25, 20);
            const center = { x: dimensions.width / 2, y: dimensions.height / 2 };
            const mousePointTo = {
              x: (center.x - stage.x()) / oldScale,
              y: (center.y - stage.y()) / oldScale,
            };
            const newPos = {
              x: center.x - mousePointTo.x * newScale,
              y: center.y - mousePointTo.y * newScale,
            };
            stage.scale({ x: newScale, y: newScale });
            stage.position(newPos);
            stage.batchDraw();
            setStageScale(newScale);
            setStagePos(newPos);
          }}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            const stage = stageRef.current;
            if (!stage) return;
            const oldScale = stage.scaleX();
            const newScale = Math.max(oldScale / 1.25, 0.05);
            const center = { x: dimensions.width / 2, y: dimensions.height / 2 };
            const mousePointTo = {
              x: (center.x - stage.x()) / oldScale,
              y: (center.y - stage.y()) / oldScale,
            };
            const newPos = {
              x: center.x - mousePointTo.x * newScale,
              y: center.y - mousePointTo.y * newScale,
            };
            stage.scale({ x: newScale, y: newScale });
            stage.position(newPos);
            stage.batchDraw();
            setStageScale(newScale);
            setStagePos(newPos);
          }}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="px-2 py-0.5 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 border-l border-r border-slate-200 dark:border-slate-700">
          {Math.round(stageScale * 100)}%
        </div>
        <button 
          type="button" 
          onClick={() => {
            fitToScreen();
          }}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors"
          title="Reset / Fit to Screen"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Floating Bottom Menu Pill Button */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
        <button 
          onClick={() => setShowMenu(true)} 
          className="flex items-center gap-2 px-4 py-2 bg-slate-900/90 dark:bg-white/90 text-white dark:text-slate-900 backdrop-blur-md border border-slate-700 dark:border-slate-300 shadow-xl rounded-full text-xs font-bold hover:bg-slate-800 active:scale-95 transition-all"
        >
          <Menu className="w-4 h-4" /> Menu
        </button>
      </div>

      {/* Floating Menu Drawer / Modal */}
      {showMenu && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 text-slate-800 dark:text-slate-200 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-base text-slate-800 dark:text-slate-100">
                <Layers className="w-5 h-5 text-purple-600" />
                Menu & Chú thích Bản đồ
              </div>
              <button 
                onClick={() => setShowMenu(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm Unit / Brand / Project..."
                className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-purple-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Active Groups Legend */}
            <div>
              <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider mb-2">
                Nhóm Phân Loại Đang Hiển Thị ({activeGroups.length})
              </div>
              {activeGroups.length === 0 ? (
                <div className="text-xs text-slate-400 italic py-2">Không có nhóm phân loại nào khớp dữ liệu.</div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {activeGroups.map((g: any) => (
                    <div key={g.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full shadow-sm border border-black/10" style={{ backgroundColor: g.color }} />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{g.name}</span>
                      </div>
                      <span className="text-[11px] font-mono font-bold bg-white dark:bg-slate-700 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                        {g.matchCount} units
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-2 grid grid-cols-2 gap-2 border-t border-slate-100 dark:border-slate-800">
              <button 
                onClick={handleExport}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" /> Xuất ảnh HD
              </button>
              <button 
                onClick={() => {
                  setShowMenu(false);
                  onOpenR2Config();
                }}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors border border-slate-200 dark:border-slate-700"
              >
                <Settings className="w-4 h-4" /> Cấu hình R2
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip */}
      {hoverInfo && hoverInfo.visible && (
        <div 
          ref={tooltipRef}
          className="fixed z-50 pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-700 p-3.5 sm:p-4 w-72 sm:w-80 max-w-[calc(100vw-24px)] max-h-[calc(100vh-28px)] overflow-y-auto text-sm text-slate-700 dark:text-slate-200 transition-opacity duration-150 custom-scrollbar"
          style={{ 
            left: -9999, 
            top: -9999,
            transformOrigin: 'top left'
          }}
        >
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <div className="font-bold text-base sm:text-lg text-slate-800 dark:text-slate-100 truncate max-w-[140px] sm:max-w-[170px]" title={hoverInfo.unitName}>
                {hoverInfo.unitName}
              </div>
              <div className="flex items-center gap-1.5">
                {hoverInfo.data?.appProjectStatus && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    hoverInfo.data.appProjectStatus === 'Completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' :
                    hoverInfo.data.appProjectStatus === 'On Process' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' :
                    hoverInfo.data.appProjectStatus === 'Delay' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' :
                    'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  }`}>
                    {hoverInfo.data.appProjectStatus}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setHoverInfo(null)}
                  className="p-1 -mr-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  title="Close tooltip"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {(hoverInfo.data?.projectName || hoverInfo.data?.brandName) && (
              <div>
                <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">BRAND / PROJECT</div>
                <div className="font-semibold text-sm sm:text-base text-slate-800 dark:text-slate-200 leading-snug">
                  {hoverInfo.data.projectName || hoverInfo.data.brandName}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {hoverInfo.data?.size > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 font-medium uppercase mb-0.5">Size (m²)</div>
                  <div className="font-semibold text-xs sm:text-sm text-slate-700 dark:text-slate-200">{Number(hoverInfo.data.size).toLocaleString('en-US')}</div>
                </div>
              )}
              {hoverInfo.data?.floor && (
                <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 font-medium uppercase mb-0.5">Location</div>
                  <div className="font-semibold text-xs sm:text-sm text-slate-700 dark:text-slate-200">{hoverInfo.data.floor}</div>
                </div>
              )}
            </div>

            {hoverInfo.data?.mdStatus && (
              <div className="bg-purple-50/70 dark:bg-purple-950/30 px-2.5 py-1.5 rounded-lg border border-purple-100 dark:border-purple-900/50 flex items-center justify-between text-xs">
                <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold uppercase tracking-wider">MD Status:</span>
                <span className="font-semibold text-purple-700 dark:text-purple-300">{hoverInfo.data.mdStatus}</span>
              </div>
            )}

            {(hoverInfo.data?.startDate || hoverInfo.data?.handoverDate || hoverInfo.data?.openingDate) && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-2 flex flex-col gap-1.5">
                {hoverInfo.data.startDate && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Start:</span>
                    <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                      <FolderOutput className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>{formatDisplayDateTime(hoverInfo.data.startDate)}</span>
                    </div>
                  </div>
                )}
                {hoverInfo.data.handoverDate && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Handover:</span>
                    <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                      <FolderOutput className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>{formatDisplayDateTime(hoverInfo.data.handoverDate)}</span>
                    </div>
                  </div>
                )}
                {hoverInfo.data.openingDate && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Opening:</span>
                    <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                      <FolderOutput className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                      <span>{formatDisplayDateTime(hoverInfo.data.openingDate)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {((hoverInfo.data?.taskLines && hoverInfo.data.taskLines.length > 0) || hoverInfo.data?.detail) && (
              <div className="bg-slate-50 dark:bg-slate-800/80 rounded-lg p-2.5 border border-slate-200/80 dark:border-slate-700 text-xs shadow-sm flex flex-col gap-1">
                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-0.5">DETAIL</div>
                {hoverInfo.data?.taskLines && hoverInfo.data.taskLines.length > 0 ? (
                  hoverInfo.data.taskLines.map((line: string, idx: number) => (
                    <div key={idx} className={`font-semibold ${idx % 2 === 0 ? 'text-blue-600 dark:text-[#8ab4f8]' : 'text-orange-600 dark:text-orange-400'}`}>
                      {line}
                    </div>
                  ))
                ) : (
                  <div className="text-slate-700 dark:text-slate-300 font-medium">{hoverInfo.data.detail}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Canvas Viewport */}
      <div 
        ref={containerRef} 
        className="flex-grow w-full h-full relative cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
      >
        <Stage 
            ref={stageRef} 
            width={dimensions.width} 
            height={dimensions.height}
            scaleX={stageScale}
            scaleY={stageScale}
            x={stagePos.x}
            y={stagePos.y}
            pixelRatio={pixelRatio}
            draggable
            onDragStart={() => {
              setHoverInfo(null);
            }}
            onClick={(e) => {
              if (e.target === stageRef.current) {
                setHoverInfo(null);
              }
            }}
            onTap={(e) => {
              if (e.target === stageRef.current) {
                setHoverInfo(null);
              }
            }}
            onDragEnd={(e) => {
              setStagePos({ x: e.target.x(), y: e.target.y() });
            }}
            onTouchStart={(e) => {
              if (e.evt.touches.length === 2) {
                const touch1 = e.evt.touches[0];
                const touch2 = e.evt.touches[1];
                const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
                const center = {
                  x: (touch1.clientX + touch2.clientX) / 2,
                  y: (touch1.clientY + touch2.clientY) / 2,
                };
                touchStateRef.current = { lastDist: dist, lastCenter: center, lastTap: 0 };
                const stage = stageRef.current;
                if (stage) stage.draggable(false);
              } else if (e.evt.touches.length === 1) {
                const now = Date.now();
                if (now - touchStateRef.current.lastTap < 300) {
                  fitToScreen();
                  touchStateRef.current.lastTap = 0;
                } else {
                  touchStateRef.current.lastTap = now;
                }
              }
            }}
            onTouchMove={(e) => {
              if (e.evt.touches.length === 2) {
                e.evt.preventDefault();
                const touch1 = e.evt.touches[0];
                const touch2 = e.evt.touches[1];
                const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
                const center = {
                  x: (touch1.clientX + touch2.clientX) / 2,
                  y: (touch1.clientY + touch2.clientY) / 2,
                };
                const { lastDist, lastCenter } = touchStateRef.current;
                const stage = stageRef.current;
                if (stage && lastDist > 0 && lastCenter) {
                  const oldScale = stage.scaleX();
                  const scaleDelta = dist / lastDist;
                  const newScale = Math.max(0.05, Math.min(oldScale * scaleDelta, 20));
                  
                  const stageBox = stage.container().getBoundingClientRect();
                  const pointerX = center.x - stageBox.left;
                  const pointerY = center.y - stageBox.top;

                  const mousePointTo = {
                    x: (pointerX - stage.x()) / oldScale,
                    y: (pointerY - stage.y()) / oldScale,
                  };

                  const newPos = {
                    x: pointerX - mousePointTo.x * newScale,
                    y: pointerY - mousePointTo.y * newScale,
                  };

                  stage.scale({ x: newScale, y: newScale });
                  stage.position(newPos);
                  stage.batchDraw();

                  touchStateRef.current.lastDist = dist;
                  touchStateRef.current.lastCenter = center;
                }
              }
            }}
            onTouchEnd={() => {
              touchStateRef.current.lastDist = 0;
              touchStateRef.current.lastCenter = null;
              const stage = stageRef.current;
              if (stage) {
                stage.draggable(true);
                setStageScale(stage.scaleX());
                setStagePos({ x: stage.x(), y: stage.y() });
              }
            }}
            onWheel={(e) => {
                e.evt.preventDefault();
                const stage = stageRef.current;
                if (!stage) return;
                const scaleBy = 1.15;
                const oldScale = stage.scaleX();
                const pointer = stage.getPointerPosition();
                if (!pointer) return;
                const mousePointTo = {
                  x: pointer.x / oldScale - stage.x() / oldScale,
                  y: pointer.y / oldScale - stage.y() / oldScale,
                };
                const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
                const clampedScale = Math.max(0.05, Math.min(newScale, 20));
                const newPos = {
                  x: -(mousePointTo.x - pointer.x / clampedScale) * clampedScale,
                  y: -(mousePointTo.y - pointer.y / clampedScale) * clampedScale,
                };
                stage.scale({ x: clampedScale, y: clampedScale });
                stage.position(newPos);
                stage.batchDraw();

                // Debounce React state updates to prevent re-rendering during wheel gestures
                if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
                wheelTimeoutRef.current = setTimeout(() => {
                  setStageScale(clampedScale);
                  setStagePos(newPos);
                }, 100);
            }}
        >
          {/* Layer 1: Dedicated Background Layer (Zero interaction overhead) */}
          <Layer listening={false}>
            {bgImage && (
              <KonvaImage
                image={bgImage}
                listening={false}
                perfectDrawEnabled={false}
                x={version.imagePos?.x || 0}
                y={version.imagePos?.y || 0}
                scaleX={version.imageScale || 1}
                scaleY={version.imageScale || 1}
                rotation={version.backgroundRotation || 0}
              />
            )}
          </Layer>

          {/* Layer 2: Units Layer (Optimized for 60fps GPU rendering) */}
          <Layer>
            {displayedUnits.map((unit: any) => {
               const fillColor = unit.targetColor || "#3b82f6";
               
               const commonProps = {
                  id: unit.id,
                  fill: fillColor,
                  opacity: 0.85,
                  stroke: '#1e293b',
                  strokeWidth: 2,
                  strokeScaleEnabled: false,
                  perfectDrawEnabled: false,
                  shadowForStrokeEnabled: false,
                  strokeHitEnabled: false,
                  x: unit.x,
                  y: unit.y,
                  rotation: unit.rotation || 0,
                  onMouseEnter: (e: any) => {
                     const container = e.target.getStage().container();
                     container.style.cursor = 'pointer';
                     setHoverInfo({
                        visible: true,
                        data: aggregatedData[unit.name?.toLowerCase() || ''] || {},
                        unitName: unit.name
                     });
                     setTimeout(() => updateTooltipPos(e.evt.clientX, e.evt.clientY), 0);
                  },
                  onMouseMove: (e: any) => {
                     updateTooltipPos(e.evt.clientX, e.evt.clientY);
                  },
                  onMouseLeave: (e: any) => {
                     const container = e.target.getStage().container();
                     container.style.cursor = 'grab';
                     setHoverInfo(null);
                  },
                  onClick: (e: any) => {
                     setHoverInfo({
                        visible: true,
                        data: aggregatedData[unit.name?.toLowerCase() || ''] || {},
                        unitName: unit.name
                     });
                     setTimeout(() => updateTooltipPos(e.evt.clientX, e.evt.clientY), 0);
                  },
                  onTap: (e: any) => {
                     const clientX = e.evt.changedTouches ? e.evt.changedTouches[0].clientX : e.evt.clientX;
                     const clientY = e.evt.changedTouches ? e.evt.changedTouches[0].clientY : e.evt.clientY;
                     setHoverInfo({
                        visible: true,
                        data: aggregatedData[unit.name?.toLowerCase() || ''] || {},
                        unitName: unit.name
                     });
                     setTimeout(() => updateTooltipPos(clientX, clientY), 0);
                  }
               };

               return (
                 <Group key={unit.id} listening={true}>
                    {unit.type === 'rect' && (
                       <Rect {...commonProps} width={unit.width} height={unit.height} cornerRadius={4} />
                    )}
                    {unit.type === 'circle' && (
                       <Circle {...commonProps} radius={unit.radius} />
                    )}
                    {unit.type === 'polygon' && unit.points && (
                       <Line {...commonProps} points={unit.points} closed={true} />
                    )}
                    {unit.name && (
                       <Text 
                          text={unit.name}
                          x={unit.textX}
                          y={unit.textY}
                          width={unit.textWidth}
                          height={unit.textHeight}
                          rotation={unit.rotation || 0}
                          align="center"
                          verticalAlign="middle"
                          fontSize={13}
                          fontStyle="bold"
                          fill="#0f172a"
                          listening={false}
                          perfectDrawEnabled={false}
                       />
                    )}
                 </Group>
               );
            })}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
