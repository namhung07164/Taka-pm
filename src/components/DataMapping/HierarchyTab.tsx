import React, { useState } from 'react';
import { UnitShape, Group, MapVersion } from './types';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Download, Trash2, FolderPlus, X, Filter, Edit2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import Papa from 'papaparse';

interface HierarchyTabProps {
  units: UnitShape[];
  setUnits: (u: UnitShape[]) => void;
  versions: MapVersion[];
  setVersions: (v: MapVersion[]) => void;
  activeVersionId: string | null;
  setActiveVersionId: (id: string | null) => void;
}

function HierarchyTab({ units, setUnits, versions, setVersions, activeVersionId, setActiveVersionId }: HierarchyTabProps) {
  const [selectedGroupToAssign, setSelectedGroupToAssign] = useState<string | null>(null);
  const [isVersionActive, setIsVersionActive] = useState<boolean>(false);

  // If activeVersionId is null but we have versions, default to the first one just for display
  const viewVersionId = activeVersionId || versions[0]?.id || null;
  const activeVersion = versions.find(v => v.id === viewVersionId);

  const addGroup = () => {
    if (!activeVersion) return alert('Hãy tạo hoặc chọn một Version trước.');
    const name = prompt('Tên group mới cho version này:');
    if (name) {
      const color = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
      const newGroup = { id: uuidv4(), name, color };
      
      setVersions(versions.map(v => {
          if (v.id === activeVersion.id) {
              return {
                  ...v,
                  groups: [...(v.groups || []), newGroup],
                  groupMappings: { ...v.groupMappings, [newGroup.id]: [] }
              };
          }
          return v;
      }));
    }
  };

  const renameGroup = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const group = activeVersion?.groups.find(g => g.id === id);
    if (!group) return;
    const newName = prompt("Đổi tên group:", group.name);
    if (newName && newName !== group.name) {
      setVersions(versions.map(v => {
        if (v.id === viewVersionId) {
          return {
            ...v,
            groups: v.groups.map(g => g.id === id ? { ...g, name: newName } : g)
          };
        }
        return v;
      }));
    }
  };

  const updateGroupColor = (groupId: string, color: string) => {
    setVersions(versions.map(v => {
        if (v.id === viewVersionId) {
            return {
                ...v,
                groups: v.groups.map(g => g.id === groupId ? { ...g, color } : g)
            };
        }
        return v;
    }));
  };

  const updateGroupOpacity = (groupId: string, opacity: number) => {
    setVersions(versions.map(v => {
        if (v.id === viewVersionId) {
            return {
                ...v,
                groups: v.groups.map(g => g.id === groupId ? { ...g, opacity } : g)
            };
        }
        return v;
    }));
  };

  const updateUnitColor = (unitId: string, fill: string) => {
    setUnits(units.map(u => u.id === unitId ? { ...u, fill } : u));
  };

  const updateUnitOpacity = (unitId: string, opacity: number) => {
    setUnits(units.map(u => u.id === unitId ? { ...u, opacity } : u));
  };

  const addVersion = () => {
    const name = prompt('Tên version mới:');
    if (name) {
      const newVersion: MapVersion = { 
          id: uuidv4(), 
          name, 
          backgroundUrl: null,
          backgroundScale: 1,
          backgroundPos: {x: 0, y: 0},
          groups: [],
          groupMappings: {} 
      };
      setVersions([...versions, newVersion]);
      setActiveVersionId(newVersion.id);
    }
  };

  const deleteVersion = () => {
    if (!activeVersion) return;
    if (!confirm(`Bạn có chắc muốn xoá version "${activeVersion.name}"?`)) return;
    const newVersions = versions.filter(v => v.id !== activeVersion.id);
    setVersions(newVersions);
    setActiveVersionId(newVersions.length > 0 ? newVersions[0].id : null);
    setSelectedGroupToAssign(null);
  };

  const deleteGroup = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Xoá group này khỏi version hiện tại?')) return;
    setVersions(versions.map(v => {
        if (v.id === viewVersionId) {
            const newMappings = { ...v.groupMappings };
            delete newMappings[id];
            return {
                ...v,
                groups: v.groups.filter(g => g.id !== id),
                groupMappings: newMappings
            };
        }
        return v;
    }));
    if (selectedGroupToAssign === id) setSelectedGroupToAssign(null);
  };

  const removeUnitFromGroup = (groupId: string, unitId: string) => {
    setVersions(versions.map(v => {
      if (v.id === viewVersionId) {
        const newMappings = { ...v.groupMappings };
        if (newMappings[groupId]) {
          newMappings[groupId] = newMappings[groupId].filter(id => id !== unitId);
        }
        return { ...v, groupMappings: newMappings };
      }
      return v;
    }));
  };

  const toggleUnitInGroup = (unitId: string) => {
      if (!activeVersion || !selectedGroupToAssign) return;
      
      const newMappings = { ...activeVersion.groupMappings };
      
      // Remove unit from any other group in this version first
      Object.keys(newMappings).forEach(gId => {
          newMappings[gId] = (newMappings[gId] || []).filter(id => id !== unitId);
      });

      // Add to selected group
      const currentList = newMappings[selectedGroupToAssign] || [];
      newMappings[selectedGroupToAssign] = [...currentList, unitId];

      setVersions(versions.map(v => v.id === activeVersion.id ? { ...v, groupMappings: newMappings } : v));
      
      // Update unit color visually to match group
      const groupColor = activeVersion.groups?.find(g => g.id === selectedGroupToAssign)?.color || '#3b82f6';
      setUnits(units.map(u => u.id === unitId ? { ...u, fill: groupColor } : u));
  };

  const handleExportCSV = () => {
      if (!activeVersion) return;
      
      const mappingData: any[] = [];
      
      units.forEach(u => {
          let assignedGroup = '';
          Object.entries(activeVersion.groupMappings).forEach(([gId, uIds]) => {
              if (uIds.includes(u.id)) {
                  assignedGroup = activeVersion.groups.find(g => g.id === gId)?.name || '';
              }
          });
          mappingData.push({
              Version: activeVersion.name,
              UnitID: u.id,
              UnitName: u.name,
              GroupName: assignedGroup
          });
      });
      
      const csv = Papa.unparse(mappingData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `mapping_${activeVersion.name}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const activeGroups = activeVersion?.groups || [];

  return (
    <div className="flex h-full gap-8">
      {/* Libraries Left */}
      <div className="w-80 flex flex-col gap-6">
          <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-4 glass flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-4 shrink-0">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Unit ({units.length})</h4>
                  <div className="text-[10px] uppercase text-slate-500 font-bold flex gap-4">
                      <span>Color</span>
                      <span>See</span>
                  </div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                  {units.filter(unit => {
                      if (!isVersionActive || !activeVersion) return true;
                      // if active, unit must belong to a group in this version
                      return Object.values(activeVersion.groupMappings).some(uIds => uIds.includes(unit.id));
                  }).map(unit => {
                      let color = unit.fill || '#3b82f6';
                      let opacity = unit.opacity ?? 0.4;
                      if (activeVersion) {
                          const mappedGroup = Object.entries(activeVersion.groupMappings).find(([gId, uIds]) => uIds.includes(unit.id));
                          if (mappedGroup) {
                              const existingGroup = activeVersion.groups.find(g => g.id === mappedGroup[0]);
                              if (existingGroup) {
                                  color = existingGroup.color;
                                  opacity = existingGroup.opacity ?? opacity;
                              }
                          }
                      }

                      return (
                          <div key={unit.id} className="group/item flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 text-sm hover:border-brand-500/50 transition-colors cursor-pointer shrink-0" onClick={() => toggleUnitInGroup(unit.id)}>
                              <div className="flex items-center gap-2 overflow-hidden flex-1">
                                  {selectedGroupToAssign && (
                                      <button 
                                          onClick={(e) => { e.stopPropagation(); toggleUnitInGroup(unit.id); }}
                                          className="p-1 bg-brand-600/20 text-brand-400 rounded opacity-0 group-hover/item:opacity-100 transition-opacity flex-shrink-0 hover:bg-brand-600/40"
                                          title="Add to selected group"
                                      >
                                          <Plus size={12} />
                                      </button>
                                  )}
                                  <span className={cn("truncate", selectedGroupToAssign && "text-brand-400 font-bold")}>{unit.name}</span>
                              </div>
                              <div className="flex items-center gap-4 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                  <input 
                                    type="color" 
                                    value={color.startsWith('rgba') ? '#3b82f6' : color} 
                                    onChange={(e) => updateUnitColor(unit.id, e.target.value)}
                                    className="w-5 h-5 bg-transparent border-0 p-0 cursor-pointer overflow-hidden rounded-full shrink-0"
                                    title="Color"
                                  />
                                  <input
                                    type="range"
                                    min="0" max="1" step="0.1"
                                    value={opacity}
                                    title={`Opacity: ${opacity}`}
                                    onChange={(e) => updateUnitOpacity(unit.id, parseFloat(e.target.value))}
                                    className="w-12 h-1 accent-brand-500 shrink-0 cursor-pointer"
                                  />
                              </div>
                          </div>
                      );
                  })}
              </div>
          </div>

          <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-4 glass flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-4 shrink-0">
                  <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
                          Groups <span className="text-brand-400">({activeVersion?.name || 'None'})</span>
                      </h4>
                      <button onClick={addGroup} className="p-1 hover:bg-brand-600/20 text-brand-400 rounded transition-colors" title="Create new group for this version">
                          <Plus size={12} />
                      </button>
                  </div>
                  <span className="text-[10px] uppercase text-slate-500 font-bold">Color</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                  {!activeVersion && <p className="text-xs text-slate-500 italic text-center py-4">Select or create a version first</p>}
                  {activeVersion && activeGroups.length === 0 && <p className="text-xs text-slate-500 italic text-center py-4">No groups in this version</p>}
                  {activeVersion && activeGroups.map(group => (
                      <div 
                        key={group.id} 
                        className={cn(
                            "flex items-center justify-between p-2 rounded-lg border text-sm cursor-pointer transition-colors shrink-0",
                            selectedGroupToAssign === group.id ? "bg-purple-900/20 border-purple-500/50" : "bg-slate-950 border-slate-800 hover:border-slate-600"
                        )}
                        onClick={() => setSelectedGroupToAssign(group.id)}
                      >
                          <span 
                            className="text-slate-300 truncate flex-1 pr-2 cursor-pointer hover:text-brand-400 transition-colors flex items-center gap-2 group/title"
                            onClick={(e) => renameGroup(group.id, e)}
                          >
                            {group.name}
                            <Edit2 size={10} className="opacity-0 group-hover/title:opacity-100" />
                          </span>
                          <div className="flex items-center gap-3 shrink-0" onClick={e => e.stopPropagation()}>
                              <input 
                                type="color" 
                                value={group.color} 
                                onChange={(e) => updateGroupColor(group.id, e.target.value)}
                                className="w-5 h-5 bg-transparent border-0 p-0 cursor-pointer rounded-full"
                                title="Color"
                              />
                              <input
                                type="range"
                                min="0" max="1" step="0.1"
                                value={group.opacity ?? 0.4}
                                title={`Opacity: ${group.opacity ?? 0.4}`}
                                onChange={(e) => updateGroupOpacity(group.id, parseFloat(e.target.value))}
                                className="w-12 h-1 accent-brand-500 cursor-pointer"
                              />
                              <button onClick={(e) => deleteGroup(group.id, e)} className="text-slate-600 hover:text-red-400"><Trash2 size={14}/></button>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      </div>

      {/* Main Versions Area */}
      <div className="flex-1 bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6 glass flex flex-col relative overflow-hidden">
          <div className="flex items-center justify-between mb-8 shrink-0">
              <div className="flex items-center gap-4">
                  <h3 className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-3">
                      <FolderPlus className="text-brand-500"/> Versions 
                  </h3>
                  <select 
                        className="bg-slate-950 text-white text-sm px-4 py-2 rounded-lg border border-slate-700 outline-none"
                        value={viewVersionId || ''}
                        onChange={(e) => {
                            setActiveVersionId(e.target.value === '' ? null : e.target.value);
                            setSelectedGroupToAssign(null);
                        }}
                  >
                        {!viewVersionId && <option value="">-- No Version --</option>}
                        {versions.map(v => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                  </select>
                  {activeVersion && (
                      <>
                          <button 
                              onClick={() => setIsVersionActive(!isVersionActive)} 
                              className={cn("px-4 py-2 rounded-lg text-xs font-bold uppercase transition-colors shrink-0", 
                                isVersionActive ? "bg-brand-600/20 text-brand-400 border border-brand-500/50" : "bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700")}
                              title="Toggle Active status of this version"
                          >
                              {isVersionActive ? 'Active ON' : 'Active OFF'}
                          </button>
                          <button 
                              onClick={deleteVersion} 
                              className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
                              title="Delete Version"
                          >
                              <Trash2 size={16} />
                          </button>
                      </>
                  )}
              </div>
              <div className="flex gap-3">
                  <button onClick={handleExportCSV} disabled={!activeVersion} className={cn("flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-bold uppercase transition-colors", activeVersion ? "bg-brand-600/20 text-brand-400 border-brand-500/30 hover:bg-brand-600/30" : "bg-slate-800/50 text-slate-500 border-slate-700 opacity-50 cursor-not-allowed")}>
                      <Download size={14} /> Export CSV
                  </button>
                  <button onClick={addVersion} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-xs font-bold uppercase shadow-lg hover:bg-brand-500 transition-colors">
                      <Plus size={14} /> New Version
                  </button>
              </div>
          </div>

          <div className="flex-1 overflow-y-auto">
             {activeVersion ? (
                 <div className="space-y-6">
                     <h4 className="text-sm font-bold text-slate-300 uppercase tracking-widest border-b border-slate-800 pb-2">
                         Groups & Assigned Units
                     </h4>
                     {activeGroups.length === 0 && (
                         <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-2xl text-slate-500">
                             <p className="mb-2">This version has no groups.</p>
                             <button onClick={addGroup} className="text-brand-400 hover:underline">Create the first group</button>
                         </div>
                     )}
                     
                     <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                         {activeGroups.map(group => {
                             const assignedUnits = activeVersion.groupMappings[group.id] || [];
                             return (
                                 <div key={group.id} className="border border-slate-800 rounded-xl overflow-hidden group bg-slate-950">
                                      <div className="px-4 py-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full mr-2 shadow-sm" style={{ backgroundColor: group.color }} />
                                            <span 
                                                className="text-sm font-bold text-white max-w-[200px] truncate cursor-pointer hover:text-brand-400 transition-colors flex items-center gap-2 group/title"
                                                onClick={(e) => renameGroup(group.id, e)}
                                            >
                                                {group.name}
                                                <Edit2 size={10} className="opacity-0 group-hover/title:opacity-100" />
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-3">
                                            <button onClick={(e) => { e.stopPropagation(); setSelectedGroupToAssign(group.id); }} className="p-1 hover:bg-slate-800 text-slate-400 hover:text-brand-400 rounded transition-colors" title="Select group to assign units">
                                                <Plus size={14} />
                                            </button>
                                            <button onClick={(e) => deleteGroup(group.id, e)} className="p-1 hover:bg-slate-800 text-slate-400 hover:text-red-400 rounded transition-colors" title="Delete group">
                                                <Trash2 size={14} />
                                            </button>
                                            <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded-md font-medium">{assignedUnits.length} units</span>
                                          </div>
                                      </div>
                                      <div className="p-3 flex flex-wrap gap-2 min-h-[80px] bg-slate-950/30">
                                          {assignedUnits.length === 0 && <span className="text-xs text-slate-600 italic px-2 py-1">No units assigned yet.</span>}
                                          {assignedUnits.map(uid => {
                                              const u = units.find(x => x.id === uid);
                                              return u ? (
                                                  <div key={u.id} className="relative group/unit">
                                                    <div className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-2 hover:bg-slate-700 hover:border-slate-600 transition-colors">
                                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
                                                        <span className="truncate max-w-[120px]">{u.name}</span>
                                                        <button 
                                                            onClick={() => removeUnitFromGroup(group.id, u.id)}
                                                            className="text-slate-500 hover:text-red-400 ml-1 opacity-0 group-hover/unit:opacity-100 transition-opacity"
                                                        >
                                                            <X size={12}/>
                                                        </button>
                                                    </div>
                                                  </div>
                                              ) : null;
                                          })}
                                      </div>
                                      
                                      {selectedGroupToAssign === group.id && (
                                          <div className="px-4 py-2 bg-brand-900/20 border-t border-brand-500/30 text-[10px] text-brand-300 flex items-center justify-between">
                                              <span className="flex items-center gap-2"><Filter size={12}/> Click units on the left to assign here</span>
                                              <button onClick={() => setSelectedGroupToAssign(null)} className="text-red-400 hover:underline">Cancel</button>
                                          </div>
                                      )}
                                 </div>
                             )
                         })}
                     </div>
                 </div>
             ) : (
                <div className="text-center py-20 text-slate-500 flex flex-col items-center">
                    <FolderPlus size={48} className="mb-4 opacity-20" />
                    <p className="text-lg mb-2">No Version Selected</p>
                    <p className="text-sm">Select an existing version above or create a new one.</p>
                </div>
             )}
          </div>
      </div>
    </div>
  );
}

export default React.memo(HierarchyTab);
