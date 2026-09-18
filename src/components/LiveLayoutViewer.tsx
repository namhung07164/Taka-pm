import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Circle, Line, Text, Group } from 'react-konva';
import { useAppStore } from '../store/useAppStore';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RefreshCw, Download, Layers, Settings, Key, X, Cloud, Search, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import useImage from 'use-image';
import { useSummaryData } from './PictureMapping/lib/summaryData';
import { extractR2Key } from './PictureMapping/lib/r2Upload';
import { getStatus, enrichProjects } from '../lib/utils';
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

  return <LiveCanvas config={config} storeFilter={storeFilter} locationFilter={locationFilter} />;
}

function LiveCanvas({ config, storeFilter, locationFilter }: { config: any, storeFilter: string, locationFilter: string }) {
  const { r2Version, r2Units } = useMemo(() => {
     if (config.storeLocationData) {
         // Determine which location key to use
         // If locationFilter is "all", we might need to pick the first available location for this store, 
         // since a single canvas can only show one map at a time easily.
         const targetLoc = locationFilter !== 'all' ? locationFilter : 'L1'; 
         const pKey = `${storeFilter}_${targetLoc}`;
         const partition = config.storeLocationData[pKey];
         if (partition) {
             const v = partition.mapVersions.find((v: any) => v.isDynamicActive) || partition.mapVersions[0] || {};
             return { r2Version: v, r2Units: partition.mapUnits || [] };
         }
         return { r2Version: {}, r2Units: [] };
     }
     // Legacy fallback
     return { r2Version: config.version || {}, r2Units: config.units || [] };
  }, [config, storeFilter, locationFilter]);

  const version = r2Version;
  const units = r2Units;
  const [bgImage] = useImage(version.backgroundUrl || '', 'anonymous');
  
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoverInfo, setHoverInfo] = useState<{ visible: boolean; x: number; y: number; data: any; unitName: string } | null>(null);
  const [stageScale, setStageScale] = useState(version.backgroundScale || 1);
  const [stagePos, setStagePos] = useState(version.backgroundPos || { x: 0, y: 0 });

  useEffect(() => {
    setStageScale(version.backgroundScale || 1);
    setStagePos(version.backgroundPos || { x: 0, y: 0 });
  }, [version]);

  const [searchQuery, setSearchQuery] = useState('');

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
    enrichedProjects.forEach((p) => {
      if (!p.code) return;
      if (storeFilter !== 'all' && p.store !== storeFilter) return;
      const pCodes = String(p.code).split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
      const status = getStatus(p.computedTakStart || p.start, p.computedTakCompl || p.handover, p.computedOpening || p.opening, p.code);
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
            dataMap[code].party = p.party || (p as any).contractor || "";
         }
      });
    });

    return dataMap;
  }, [units, summaryData, projects, storeFilter]);

  // 3. Evaluate rules on the fly to build unitColorMap
  const { unitColorMap, activeGroups } = useMemo(() => {
    const colorMap: Record<string, string> = {};
    const groupsInUse: any[] = [];
    
    if (!version.groups) return { unitColorMap: colorMap, activeGroups: groupsInUse };

    // Process groups in order (later groups overwrite earlier if unit matches both)
    version.groups.forEach((group: any) => {
        let groupHasMatches = false;
        const mappedUnitIds = new Set(version.groupMappings?.[group.id] || []);
        
        units.forEach((u: any) => {
            let isMatch = false;
            
            // Check manual mapping first
            if (mappedUnitIds.has(u.id)) {
                isMatch = true;
            }
            
            // Only override with real-time dynamic rules if it's dynamic active
            const isDynamicActive = version.isDynamicActive !== false;
            
            if (group.rules && group.rules.length > 0) {
                // Determine whether to evaluate dynamic rule. 
                // Only evaluate if it's dynamic active OR if there are no manual mappings
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
                        if (passedRules) isMatch = true; // Set to true if it passed dynamic rules
                    }
                }
            }
            if (isMatch) {
                colorMap[u.id] = group.color;
                groupHasMatches = true;
            }
        });
        
        if (groupHasMatches) {
            groupsInUse.push(group);
        }
    });

    return { unitColorMap: colorMap, activeGroups: groupsInUse };
  }, [version.groups, units, aggregatedData]);




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

  return (
    <div className="w-full h-full flex flex-col bg-slate-100 overflow-hidden relative">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
         {activeGroups.length > 0 && (
           <div className="bg-white/90 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-slate-200 flex flex-col gap-2 pointer-events-auto max-w-[200px]">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Chú giải (Legend)</h3>
              {activeGroups.map((g: any) => (
                <div key={g.id} className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  <div className="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-sm border border-black/10" style={{backgroundColor: g.color}}/>
                  <span className="truncate" title={g.name}>{g.name}</span>
                </div>
              ))}
           </div>
         )}
      </div>
      
      <div className="absolute top-4 right-4 z-10 flex flex-col sm:flex-row items-end sm:items-center gap-3">
         <div className="relative group">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-blue-500 transition-colors" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm Unit / Brand / Project..."
              className="pl-9 pr-4 py-2 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg shadow-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all w-64"
            />
            {searchQuery && (
               <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
               </button>
            )}
         </div>
         <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg text-sm font-medium transition-colors flex-shrink-0">
            <Download className="w-4 h-4" /> Xuất ảnh HD
         </button>
      </div>

      {hoverInfo && hoverInfo.visible && (
        <div 
          className="fixed z-50 pointer-events-none bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border border-slate-200/60 p-4 w-72 text-sm text-slate-700 transition-opacity duration-150"
          style={{ 
            left: hoverInfo.x + 15, 
            top: hoverInfo.y + 15,
            transform: hoverInfo.x > window.innerWidth - 300 ? 'translateX(-100%)' : 'none',
            transformOrigin: 'top left'
          }}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="font-bold text-lg text-slate-800">{hoverInfo.unitName}</div>
              {hoverInfo.data.appProjectStatus && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  hoverInfo.data.appProjectStatus === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                  hoverInfo.data.appProjectStatus === 'On Process' ? 'bg-blue-100 text-blue-700' :
                  hoverInfo.data.appProjectStatus === 'Delay' ? 'bg-rose-100 text-rose-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {hoverInfo.data.appProjectStatus}
                </span>
              )}
            </div>
            
            {(hoverInfo.data.projectName || hoverInfo.data.brandName) && (
              <div>
                <div className="text-xs text-slate-400 font-medium uppercase mb-0.5">Brand / Project</div>
                <div className="font-semibold text-slate-700">{hoverInfo.data.projectName || hoverInfo.data.brandName}</div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {hoverInfo.data.size > 0 && (
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <div className="text-[10px] text-slate-400 font-medium uppercase mb-0.5">Size (m²)</div>
                  <div className="font-semibold text-slate-700">{Number(hoverInfo.data.size).toLocaleString('en-US')}</div>
                </div>
              )}
              {hoverInfo.data.floor && (
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <div className="text-[10px] text-slate-400 font-medium uppercase mb-0.5">Location</div>
                  <div className="font-semibold text-slate-700">{hoverInfo.data.floor}</div>
                </div>
              )}
            </div>

            {(hoverInfo.data.appProjectBudget > 0 || hoverInfo.data.appProjectActual > 0) && (
              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
                <div>
                  <div className="text-[10px] text-slate-400 font-medium uppercase mb-0.5">Budget</div>
                  <div className="font-medium text-slate-700">{Number(hoverInfo.data.appProjectBudget).toLocaleString('en-US')} <span className="text-[10px] text-slate-400">VND</span></div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-medium uppercase mb-0.5">Actual</div>
                  <div className="font-medium text-slate-700">{Number(hoverInfo.data.appProjectActual).toLocaleString('en-US')} <span className="text-[10px] text-slate-400">VND</span></div>
                </div>
              </div>
            )}

            {(hoverInfo.data.startDate || hoverInfo.data.handoverDate || hoverInfo.data.openingDate) && (
              <div className="border-t border-slate-100 pt-2 flex flex-col gap-1.5">
                {hoverInfo.data.startDate && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Start:</span>
                    <span className="font-medium text-slate-700">{hoverInfo.data.startDate}</span>
                  </div>
                )}
                {hoverInfo.data.handoverDate && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Handover:</span>
                    <span className="font-medium text-slate-700">{hoverInfo.data.handoverDate}</span>
                  </div>
                )}
                {hoverInfo.data.openingDate && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Opening:</span>
                    <span className="font-medium text-slate-700">{hoverInfo.data.openingDate}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <div ref={containerRef} className="flex-grow w-full relative cursor-grab active:cursor-grabbing">
        {/* Floating Zoom Controls */}
        <div className="absolute top-4 right-4 z-10 flex items-center bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-lg p-1 space-x-1">
          <button 
            type="button" 
            onClick={() => {
              const stage = stageRef.current;
              if (!stage) return;
              const newScale = stageScale * 1.2;
              setStageScale(newScale);
              stage.scale({ x: newScale, y: newScale });
            }}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button 
            type="button" 
            onClick={() => {
              const stage = stageRef.current;
              if (!stage) return;
              const newScale = Math.max(0.1, stageScale / 1.2);
              setStageScale(newScale);
              stage.scale({ x: newScale, y: newScale });
            }}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button 
            type="button" 
            onClick={() => {
              const stage = stageRef.current;
              const initScale = version.backgroundScale || 1;
              const initPos = version.backgroundPos || { x: 0, y: 0 };
              setStageScale(initScale);
              setStagePos(initPos);
              if (stage) {
                stage.scale({ x: initScale, y: initScale });
                stage.position(initPos);
              }
            }}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors"
            title="Reset View"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        <Stage 
            ref={stageRef} 
            width={dimensions.width} 
            height={dimensions.height}
            scaleX={stageScale}
            scaleY={stageScale}
            x={stagePos.x}
            y={stagePos.y}
            draggable
            onDragEnd={(e) => {
              setStagePos({ x: e.target.x(), y: e.target.y() });
            }}
            onWheel={(e) => {
               e.evt.preventDefault();
               const stage = stageRef.current;
               if (!stage) return;
               const scaleBy = 1.1;
               const oldScale = stage.scaleX();
               const pointer = stage.getPointerPosition();
               if (!pointer) return;
               const mousePointTo = {
                 x: pointer.x / oldScale - stage.x() / oldScale,
                 y: pointer.y / oldScale - stage.y() / oldScale,
               };
               const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
               const clampedScale = Math.max(0.05, Math.min(newScale, 20));
               setStageScale(clampedScale);
               const newPos = {
                 x: -(mousePointTo.x - pointer.x / clampedScale) * clampedScale,
                 y: -(mousePointTo.y - pointer.y / clampedScale) * clampedScale,
               };
               setStagePos(newPos);
               stage.scale({ x: clampedScale, y: clampedScale });
               stage.position(newPos);
            }}
        >
          <Layer>
            {bgImage && (
              <KonvaImage
                image={bgImage}
                listening={false}
                x={version.imagePos?.x || 0}
                y={version.imagePos?.y || 0}
                scaleX={version.imageScale || 1}
                scaleY={version.imageScale || 1}
                rotation={version.backgroundRotation || 0}
              />
            )}

            {units.map((unit: any) => {
               if (unit.visible === false) return null;
               
               const targetColor = unitColorMap[unit.id];
               const isTargeted = !!targetColor;
               const fillColor = targetColor || "rgba(148, 163, 184, 0.1)";
               
               const commonProps = {
                  id: unit.id,
                  fill: fillColor,
                  opacity: isTargeted ? 0.75 : 0.3,
                  stroke: isTargeted ? '#1e293b' : '#ffffff',
                  strokeWidth: (isTargeted ? 2 : 1.5) / stageScale,
                  shadowBlur: 4,
                  shadowColor: "rgba(0,0,0,0.4)",
                  x: unit.x,
                  y: unit.y,
                  rotation: unit.rotation || 0,
                  onMouseEnter: (e: any) => {
                     const container = e.target.getStage().container();
                     container.style.cursor = 'pointer';
                     setHoverInfo({
                        visible: true,
                        x: e.evt.clientX,
                        y: e.evt.clientY,
                        data: aggregatedData[unit.name?.toLowerCase() || ''] || {},
                        unitName: unit.name
                     });
                  },
                  onMouseMove: (e: any) => {
                     setHoverInfo(prev => prev ? { ...prev, x: e.evt.clientX, y: e.evt.clientY } : null);
                  },
                  onMouseLeave: (e: any) => {
                     const container = e.target.getStage().container();
                     container.style.cursor = 'grab';
                     setHoverInfo(null);
                  },
                  onClick: (e: any) => {
                     setHoverInfo({
                        visible: true,
                        x: e.evt.clientX,
                        y: e.evt.clientY,
                        data: aggregatedData[unit.name?.toLowerCase() || ''] || {},
                        unitName: unit.name
                     });
                  },
                  onTap: (e: any) => {
                     const clientX = e.evt.changedTouches ? e.evt.changedTouches[0].clientX : e.evt.clientX;
                     const clientY = e.evt.changedTouches ? e.evt.changedTouches[0].clientY : e.evt.clientY;
                     setHoverInfo({
                        visible: true,
                        x: clientX,
                        y: clientY,
                        data: aggregatedData[unit.name?.toLowerCase() || ''] || {},
                        unitName: unit.name
                     });
                  }
               };

               return (
                 <Group key={unit.id}>
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
                          x={unit.type === 'rect' ? unit.x : (unit.type === 'circle' ? unit.x - unit.radius! : (unit.points ? Math.min(...unit.points.filter((_:any, i:number) => i % 2 === 0)) : unit.x))}
                          y={unit.type === 'rect' ? unit.y : (unit.type === 'circle' ? unit.y - unit.radius! : (unit.points ? Math.min(...unit.points.filter((_:any, i:number) => i % 2 === 1)) : unit.y))}
                          width={unit.type === 'rect' ? unit.width : (unit.type === 'circle' ? unit.radius! * 2 : (unit.points ? Math.max(...unit.points.filter((_:any, i:number) => i % 2 === 0)) - Math.min(...unit.points.filter((_:any, i:number) => i % 2 === 0)) : 100))}
                          height={unit.type === 'rect' ? unit.height : (unit.type === 'circle' ? unit.radius! * 2 : (unit.points ? Math.max(...unit.points.filter((_:any, i:number) => i % 2 === 1)) - Math.min(...unit.points.filter((_:any, i:number) => i % 2 === 1)) : 30))}
                          rotation={unit.rotation || 0}
                          align="center"
                          verticalAlign="middle"
                          fontSize={(isTargeted ? 15 : 12) / stageScale}
                          fontStyle={isTargeted ? 'bold' : 'normal'}
                          fill={isTargeted ? '#0f172a' : '#334155'}
                          shadowColor="white"
                          shadowBlur={4}
                          shadowOpacity={0.9}
                          listening={false}
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
