import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Circle, Line, Text, Group } from 'react-konva';
import { useAppStore } from '../store/useAppStore';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RefreshCw, Download, Layers, Settings, Key, X, Cloud } from 'lucide-react';
import useImage from 'use-image';
import { useSummaryData } from './PictureMapping/lib/summaryData';
import { getStatus } from '../lib/utils';
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
                  if (v.backgroundUrl && v.backgroundUrl.startsWith('r2://')) {
                      const imgKey = v.backgroundUrl.replace('r2://', '');
                      const imgCommand = new GetObjectCommand({ Bucket: bucketName, Key: imgKey });
                      resolvePromises.push(
                          getSignedUrl(s3, imgCommand, { expiresIn: 3600 }).then(url => {
                              v.backgroundUrl = url;
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
         if (activeVersion && activeVersion.backgroundUrl && activeVersion.backgroundUrl.startsWith('r2://')) {
            const imgKey = activeVersion.backgroundUrl.replace('r2://', '');
            const imgCommand = new GetObjectCommand({ Bucket: bucketName, Key: imgKey });
            activeVersion.backgroundUrl = await getSignedUrl(s3, imgCommand, { expiresIn: 3600 });
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

  // 1. Get real-time projects and Excel summary data
  const projects = useAppStore(state => state.projects);
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
        startDate: "", endDate: "", status: "", vendorCode: "",
        brandCode: "", brandName: "", classCode: "", floor: "",
        appProjectStatus: "", appProjectBudget: 0, appProjectActual: 0, appProjectCode: ""
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
            floor: (sumData as any).floor || "",
        });
      }
    });

    projects.forEach((p) => {
      if (!p.code) return;
      if (storeFilter !== 'all' && p.store !== storeFilter) return;
      const pCodes = String(p.code).split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
      const status = getStatus(p.start, p.handover, p.opening, p.code);
      pCodes.forEach(code => {
         if (dataMap[code]) {
            dataMap[code].appProjectStatus = status;
            dataMap[code].appProjectBudget = p.budget || 0;
            dataMap[code].appProjectActual = p.actual || 0;
            dataMap[code].appProjectCode = String(p.code);
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
        units.forEach((u: any) => {
            if (!group.rules || group.rules.length === 0) return;
            const data = aggregatedData[u.name.toLowerCase()];
            if (!data) return;
            
            const isMatch = group.rules.every((rule: any) => {
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
      
      <div className="absolute top-4 right-4 z-10">
         <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg text-sm font-medium transition-colors">
            <Download className="w-4 h-4" /> Xuất ảnh HD
         </button>
      </div>

      <div ref={containerRef} className="flex-grow w-full cursor-grab active:cursor-grabbing">
        <Stage 
            ref={stageRef} 
            width={dimensions.width} 
            height={dimensions.height}
            draggable
            onWheel={(e) => {
               e.evt.preventDefault();
               const stage = stageRef.current;
               if (!stage) return;
               const scaleBy = 1.1;
               const oldScale = stage.scaleX();
               const mousePointTo = {
                 x: stage.getPointerPosition().x / oldScale - stage.x() / oldScale,
                 y: stage.getPointerPosition().y / oldScale - stage.y() / oldScale,
               };
               const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
               stage.scale({ x: newScale, y: newScale });
               stage.position({
                 x: -(mousePointTo.x - stage.getPointerPosition().x / newScale) * newScale,
                 y: -(mousePointTo.y - stage.getPointerPosition().y / newScale) * newScale,
               });
            }}
        >
          <Layer listening={false}>
            {bgImage && (
              <KonvaImage
                image={bgImage}
                x={version.imagePos?.x || 0}
                y={version.imagePos?.y || 0}
                scaleX={version.imageScale || 1}
                scaleY={version.imageScale || 1}
              />
            )}
          </Layer>

          <Layer>
             <Group 
                x={version.backgroundPos?.x || 0}
                y={version.backgroundPos?.y || 0}
                scaleX={version.backgroundScale || 1}
                scaleY={version.backgroundScale || 1}
                rotation={version.backgroundRotation || 0}
             >
                {units.map((unit: any) => {
                   if (!unit.visible) return null;
                   
                   const targetColor = unitColorMap[unit.id];
                   const isTargeted = !!targetColor;
                   const fillColor = targetColor || "rgba(148, 163, 184, 0.1)";
                   
                   const commonProps = {
                      id: unit.id,
                      fill: fillColor,
                      opacity: isTargeted ? 0.75 : 0.3,
                      stroke: isTargeted ? '#333' : '#999',
                      strokeWidth: isTargeted ? 2 : 1,
                      x: unit.x,
                      y: unit.y,
                      rotation: unit.rotation || 0,
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
                              fontSize={isTargeted ? 16 : 12}
                              fontStyle={isTargeted ? 'bold' : 'normal'}
                              fill={isTargeted ? '#1e293b' : '#64748b'}
                              shadowColor="white"
                              shadowBlur={isTargeted ? 4 : 2}
                              shadowOpacity={1}
                           />
                        )}
                     </Group>
                   );
                })}
             </Group>
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
