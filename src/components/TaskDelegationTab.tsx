import { safeGetItemLocal, safeSetItemLocal, safeRemoveItemLocal, safeGetItemSession, safeSetItemSession, safeRemoveItemSession } from "../lib/storage";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { Project, Task, AppUser, PermissionMatrix, AppRole, DelegationGroup, DelegationSubTask } from '../types';
import { cn, formatDisplayDateMain, getStatus, getTaskStatus, formatToDatetimeLocal, parseDateTime, resolveActualStatus, ensureUrlProtocol, generateId, scrollToElement, matchesAdvancedSearch, getSuggestedCompletionTime, formatDisplayDateTime } from '../lib/utils';
import { Search, Plus, Trash2, ChevronDown, ChevronRight, Paperclip, ExternalLink, ArrowLeft, X } from 'lucide-react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import {    db, APP_ID , writeBatch , setDoc , deleteDoc } from "../lib/firebase";
import { ResizableHeader } from './ResizableHeader';
import { ColumnAdder } from './ColumnAdder';
import { DebouncedSearchInput } from './DebouncedSearchInput';
import { scheduleDependentTasks } from '../lib/ganttUtils';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { syncProjectDatesByCode } from '../lib/projectDatesService';
import { lazyWithRetry } from '../lib/lazyWithRetry';

const ConfirmModal = lazyWithRetry(() => import('./ConfirmModal').then(m => ({ default: m.ConfirmModal })), 'ConfirmModal');

interface TaskDelegationTabProps {
  onBackFromFocus?: () => void;
}

type DelegatableItem = {
  type: 'project' | 'task';
  id: string;
  name: string;
  projectCode: string;
  projectStore?: string;
  projectYear?: number | string;
  projectName?: string;
  party?: string;
};

const AVAILABLE_COLUMNS = [
  { id: 'expand', label: 'Expand' },
  { id: 'taskName', label: 'Task / Delegation' },
  { id: 'projectCode', label: 'Project Code' },
  { id: 'comments', label: 'Comments' },
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'party', label: 'PIC' },
  { id: 'actions', label: 'Actions' }
];

const resolveGroupParentProject = (group: DelegationGroup, projects: any[], tasks: any[]) => {
  const parentTask = group.parentTaskId ? tasks.find(t=> t.id === group.parentTaskId) : null;
  const ps = group.projectStore || (parentTask?.projectStore);
  const py = group.projectYear || (parentTask?.projectYear);

  return projects.find(p=> 
    ((group.parentTaskId && p.code === group.parentTaskId) || (group.projectCode && p.code === group.projectCode)) &&
    (ps ? String(p.store) === String(ps) : true) &&
    (py ? String(p.year) === String(py) : true)
  );
};

function MultiSelectInput({ 
  value, 
  options, 
  onSave, 
  disabled, 
  className,
  placeholder
}: { 
  value: string; 
  options: string[]; 
  onSave: (val: string) => void; 
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [val, setVal] = useState(value || '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const valRef = useRef(val);
  const valueRef = useRef(value);
  const isComponentMounted = useRef(true);

  useEffect(() => {
    isComponentMounted.current = true;
    return () => { isComponentMounted.current = false; };
  }, []);

  useEffect(() => {
    setVal(value || '');
    valueRef.current = value || '';
  }, [value]);

  useEffect(() => {
    valRef.current = val;
  }, [val]);

  const currentPart = String(valRef.current || val || '').split(',').pop()?.trim() || '';
  
  // Deduplicate options case-insensitively, preferring the first encountered case
  const seenLower = new Set<string>();
  const uniqueOptions: string[] = [];
  for (const opt of options) {
    const lower = opt.toLowerCase();
    if (!seenLower.has(lower)) {
      seenLower.add(lower);
      uniqueOptions.push(opt);
    }
  }

  const suggestions = uniqueOptions.filter(v => 
    v.toLowerCase().includes(currentPart.toLowerCase()) && currentPart.toLowerCase() !== v.toLowerCase()
  );

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={val}
        onChange={(e) => {
          setVal(e.target.value);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => {
          setTimeout(() => {
            if (!isComponentMounted.current) return;
            const currentVal = valRef.current;
            const oldVal = valueRef.current;
            if (currentVal && currentVal.trim() !== '') {
              const parts = currentVal.split(',').map(s => s.trim()).filter(Boolean);
              const correctedParts = parts.map(p => {
                const matchedOption = options.find(opt => opt.toLowerCase() === p.toLowerCase());
                return matchedOption || p;
              });
              const invalidParts = correctedParts.filter(p => !options.includes(p));
              if (invalidParts.length > 0) {
                // Don't alert so it doesn't block UI flow. Just revert to previous valid value.
                setVal(oldVal || '');
              } else {
                const newParts = correctedParts.join(', ');
                setVal(newParts);
                if (newParts !== oldVal) onSave(newParts);
              }
            } else {
              if (oldVal !== '') onSave('');
            }
            setShowSuggestions(false);
          }, 200);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const currentPartStr = String(valRef.current || val || '').split(',').pop()?.trim() || '';
            const match = uniqueOptions.find(opt => opt.toLowerCase().startsWith(currentPartStr.toLowerCase()) || opt.toLowerCase().includes(currentPartStr.toLowerCase()));
            if (currentPartStr && match) {
              const parts = String(valRef.current).split(',');
              parts.pop();
              const newParts = parts.map(p => p.trim()).filter(Boolean);
              newParts.push(match);
              const newValue = newParts.join(', ');
              setVal(newValue);
              valRef.current = newValue;
            }
            // Use setTimeout to ensure state update has propagated before blurring
            setTimeout(() => {
              e.currentTarget.blur();
            }, 0);
          }
        }}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 mt-1 min-w-[200px] w-full max-h-40 overflow-y-auto bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded shadow-xl z-[9999]">
          {suggestions.map(s => (
            <div 
              key={s} 
              className="px-3 py-2 hover:bg-blue-50 dark:hover:bg-[#333336] cursor-pointer text-sm text-slate-700 dark:text-[#c3c3c3]"
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur
                const parts = String(valRef.current).split(',');
                parts.pop();
                const newParts = parts.map(p => p.trim()).filter(Boolean);
                newParts.push(s);
                const newValue = newParts.join(', ') + ', ';
                setVal(newValue);
                setShowSuggestions(false);
              }}
              onTouchStart={(e) => {
                // let onClick and onBlur handle it
              }}
              onClick={(e) => {
                const parts = String(valRef.current).split(',');
                parts.pop();
                const newParts = parts.map(p => p.trim()).filter(Boolean);
                newParts.push(s);
                const newValue = newParts.join(', ') + ', ';
                setVal(newValue);
                setShowSuggestions(false);
                onSave(newValue.trim().replace(/,\s*$/, ''));
              }}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TaskDelegationTab({       onBackFromFocus}: TaskDelegationTabProps) {

  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);
  const theme = useAppStore(state => state.theme);
  const appUsers = useAppStore(state => state.appUsers);
  const subAppUsers = useAppStore(state => state.subAppUsers);
  const parties = useAppStore(state => state.parties);

  const { t } = useLanguage();
  const setToast = useAppStore(state => state.setToast);
  const rawDelegationGroups = useAppStore(state => state.delegationGroups);
  const groups = useMemo(() => {
    return [...rawDelegationGroups].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [rawDelegationGroups]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFlowStatus, setFilterFlowStatus] = useState('all');
  const [multiSearchTerm, setMultiSearchTerm] = useState('');
  const [filterParty, setFilterParty] = useState('');
  const [focusTarget, setFocusTarget] = useState<{ groupId: string, subTaskId?: string } | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
    if (focusTarget) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setFocusTarget(null);
          onBackFromFocus?.();
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [focusTarget, onBackFromFocus]);

  const picOptions = useMemo(() => {
    const list = new Set<string>();
    appUsers.forEach(u=> u.username && list.add(u.username));
    subAppUsers.forEach(u=> {
      const vals = [u.username, u.name, u.fullName, u.displayName, u.email, u.title, u.id].filter(v => v && typeof v === 'string' && v.trim() !== '');
      if (vals.length > 0) {
        list.add(vals[0]);
      } else {
        // Fallback: extract any string fields
        for (const key of Object.keys(u)) {
          if (key !== 'id' && typeof u[key] === 'string' && u[key].trim() !== '') {
            list.add(u[key]);
            break;
          }
        }
      }
    });
    return Array.from(list).sort();
  }, [ ]);

  const uniqueParties = useMemo(() => {
    const partiesList = new Set<string>();
    groups.forEach(g => g.subTasks.forEach(st => {
      if (st.party) partiesList.add(st.party);
    }));
    return [...partiesList].sort();
  }, [groups]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState<Record<string, boolean>>({});
  const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [colWidths, setColWidths] = useState({
    expand: 50,
    taskName: 300,
    projectCode: 150,
    comments: 400,
    status: 120,
    startAct: 120,
    finishAct: 120,
    priority: 120,
    party: 150,
    actions: 80
  });

  const availableColumnsForUser = useMemo(() => {
    return AVAILABLE_COLUMNS;
  }, []);

  const [visibleColumns, setVisibleColumns] = useState<string[]>(availableColumnsForUser.map(c => c.id));
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = safeGetItemLocal(`taka_delegation_col_widths_${currentUser.id}`);
    if (saved) {
      try {
        setColWidths(JSON.parse(saved));
      } catch (e) { console.error(e); }
    }
    
    const savedCols = safeGetItemLocal(`taka_delegation_visible_cols_${currentUser.id}`);
    if (savedCols) {
      try {
        setVisibleColumns(JSON.parse(savedCols));
      } catch (e) { console.error(e); }
    }
  }, [currentUser.id]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleResize = (col: keyof typeof colWidths, newWidth: number) => {
    setColWidths(prev => {
      const next = { ...prev, [col]: newWidth };
      safeSetItemLocal(`taka_delegation_col_widths_${currentUser.id}`, JSON.stringify(next));
      return next;
    });
  };

  const handleToggleColumn = (colId: string) => {
    setVisibleColumns(prev => {
      const next = prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId];
      safeSetItemLocal(`taka_delegation_visible_cols_${currentUser.id}`, JSON.stringify(next));
      return next;
    });
  };

  const isAdmin = currentUser.role === 'admin';
  const role = currentUser.role as AppRole;
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const globalStoreFilter = useAppStore(state => state.globalStoreFilter);
  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const canWrite = (isAdmin || !!permissionMatrix[role]?.Write?.taskDelegation) && !isArchiveYear;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleOpenGroup = (e: any) => {
      const { groupId, subTaskId } = e.detail;
      setFocusTarget({ groupId, subTaskId });
      
      const group = groups.find(g => g.id === groupId);
      if (group) {
        const p = resolveGroupParentProject(group, projects, tasks);
        if (p) {
          const pId = p.id || String(p.no);
          setExpandedProjects(prev => {
            if (!prev.includes(pId)) return [...prev, pId];
            return prev;
          });
        }
      }

      setExpandedGroups(prev => {
        if (!prev.includes(groupId)) return [...prev, groupId];
        return prev;
      });
      // Scroll to it on next tick
      setTimeout(() => {
        let el = document.getElementById(`delegation-subtask-${subTaskId}`);
        let elMob = document.getElementById(`delegation-subtask-mobile-${subTaskId}`);
        
        let targetEl = (el && el.offsetHeight > 0) ? el : ((elMob && elMob.offsetHeight > 0) ? elMob : null);
        
        if (targetEl) {
          scrollToElement(targetEl);
          targetEl.classList.add('bg-yellow-50', 'transition-all');
          setTimeout(() => targetEl?.classList.remove('bg-yellow-50', 'transition-all'), 3000);
        } else {
          let groupEl = document.getElementById(`delegation-group-${groupId}`);
          let groupElMob = document.getElementById(`delegation-group-mobile-${groupId}`);
          let targetGroupEl = (groupEl && groupEl.offsetHeight > 0) ? groupEl : ((groupElMob && groupElMob.offsetHeight > 0) ? groupElMob : null);
          
          if (targetGroupEl) {
            scrollToElement(targetGroupEl);
            targetGroupEl.classList.add('bg-yellow-100', 'transition-all');
            setTimeout(() => targetGroupEl?.classList.remove('bg-yellow-100', 'transition-all'), 3000);
          }
        }
      }, 500);
    };

    const handleClearFocus = () => {
      setFocusTarget(null);
    };

    window.addEventListener('taka_open_delegation_group', handleOpenGroup);
    window.addEventListener('taka_clear_delegation_focus', handleClearFocus);
    return () => {
      window.removeEventListener('taka_open_delegation_group', handleOpenGroup);
      window.removeEventListener('taka_clear_delegation_focus', handleClearFocus);
    };
  }, [groups]);

  const availableItems: DelegatableItem[] = [
    ...projects.filter(p=> p.delegation && !groups.some(g => g.parentTaskId === p.code && (!g.projectStore || g.projectStore === p.store))).map(p=> ({
      type: 'project' as const,
      id: `${p.code}-${p.year || ''}-${p.store || ''}`, // Create a more unique ID for 
      name: p.name,
      projectCode: p.code,
      projectStore: p.store,
      projectYear: p.year,
      projectName: p.name,
      party: ''
    })),
    ...tasks.filter(t=> t.delegation && !groups.some(g => g.parentTaskId === t.id)).map(t=> {
      const p = projects.find(proj => 
        proj.code === t.projectCode &&
        (String(proj.year || '') === String(t.projectYear || '') || (!proj.year && !t.projectYear)) &&
        (String(proj.store || '') === String(t.projectStore || '') || (!proj.store && !t.projectStore))
      );
      return {
        type: 'task' as const,
        id: t.id,
        name: t.name,
        projectCode: t.projectCode,
        projectStore: t.projectStore,
        projectYear: t.projectYear,
        projectName: p?.name,
        party: t.party
      };
    })
  ];

  const searchResults = searchTerm 
    ? availableItems.filter(item => {
        const searchStr = `${item.name} ${item.projectCode} ${item.projectName || ''} ${item.party || ''}`.toLowerCase();
        return searchStr.includes(searchTerm.toLowerCase());
      })
    : availableItems;

  const handleAddLinkedGroup = async (item: DelegatableItem) => {
    if (!canWrite) return;
    if (isAddingTask[item.id]) return;
    
    const alreadyExists = groups.some(g => {
      if (item.type === 'task') return g.parentTaskId === item.id;
      return g.parentTaskId === item.projectCode && (!g.projectStore || g.projectStore === item.projectStore);
    });
    
    if (alreadyExists) {
      setToast({ title: "Error", message: "A Delegation Group already exists for this item." });
      return;
    }

    setIsAddingTask(prev => ({ ...prev, [item.id]: true }));
    try {
    
    const parentTask = item.type === 'task' ? tasks.find(t=> t.id === item.id) : null;
    const parentProject = projects.find(p=> 
      p.code === item.projectCode &&
      (item.projectStore ? p.store === item.projectStore : true) &&
      (item.projectYear ? String(p.year) === String(item.projectYear) : true)
    );
    
    let startAct = parentTask?.start || parentProject?.computedTakStart || parentProject?.start;
    let finishAct = parentTask?.finish || parentProject?.computedTakCompl;
    
    if (!startAct) startAct = new Date().toISOString().substring(0, 10);
    if (!finishAct) finishAct = new Date().toISOString().substring(0, 10);

    const rawParty = (parentTask?.party && parentTask.party.trim())
      ? parentTask.party.trim()
      : (parentProject?.party && parentProject.party.trim() ? parentProject.party.trim() : (currentUser.username || ''));
    const parsedParty = rawParty.split(/[,;/+]+/).map(s => s.trim()).filter(Boolean)[0] || rawParty;

    const initialSubTask: DelegationSubTask = {
      id: generateId(),
      name: '',
      comments: '',
      status: 'Assigned',
      delegationStatus: 'Assigned',
      priority: 'Mid',
      party: parsedParty,
      startAct,
      finishAct,
      updatedAt: new Date().toISOString(),
      createdBy: currentUser.id,
      involvedUsers: [currentUser.id]
    };

    const fallbackYear = (item.projectYear !== undefined && item.projectYear !== null && !isNaN(Number(item.projectYear)))
      ? Number(item.projectYear)
      : (parentProject?.year && !isNaN(Number(parentProject.year)) ? Number(parentProject.year) : new Date().getFullYear());

    const parentKey = item.type === 'project' ? item.projectCode : item.id;
    const storeSuffix = item.projectStore || parentProject?.store || 'HCM';
    const existingGroup = delegationGroups.find(g => 
      item.type === 'project'
        ? g.parentTaskId === item.projectCode && (!g.projectStore || g.projectStore === storeSuffix) && (!g.projectYear || String(g.projectYear) === String(fallbackYear))
        : g.parentTaskId === item.id
    );
    const targetGroupId = existingGroup?.id || (item.type === 'project' ? `del_proj_${item.projectCode}_${storeSuffix}_${fallbackYear}` : `del_${item.id}`);

    if (existingGroup) {
      if (item.type === 'task' && existingGroup.subTasks && existingGroup.subTasks.length > 0) {
        setToast({ title: "Notice", message: "This task already has a delegation." });
        return;
      }
      const updatedSubTasks = [...(existingGroup.subTasks || []), initialSubTask];
      setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', targetGroupId), {
        ...existingGroup,
        subTasks: updatedSubTasks,
        projectYear: fallbackYear,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } else {
      const newGroup: DelegationGroup = {
        id: targetGroupId,
        parentTaskId: parentKey,
        name: item.name,
        projectCode: item.projectCode,
        projectStore: item.projectStore || parentProject?.store || 'HCM',
        projectYear: fallbackYear,
        subTasks: [initialSubTask],
        updatedAt: new Date().toISOString(),
        createdBy: currentUser.id
      };
      setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', targetGroupId), newGroup, { merge: true });
    }

    // Update parent task if it's a task type to set delegation: true
    if (item.type === 'task') {
      const taskRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', item.id);
      if (parentTask) {
        setDoc(taskRef, { ...parentTask, delegation: true, updatedAt: new Date().toISOString() });
      }
    } else if (item.type === 'project') {
      const projRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', item.id);
      if (parentProject) {
        setDoc(projRef, { ...parentProject, delegation: true, updatedAt: new Date().toISOString() });
      }
    }

    setSearchTerm('');
    setIsSearchFocused(false);
    } finally {
      setIsAddingTask(prev => ({ ...prev, [item.id]: false }));
    }
  };

  const handleAddCustomGroup = async () => {
    if (!canWrite) return;
    
    const dateStr = new Date().toISOString().substring(0, 10);
    const initialSubTask: DelegationSubTask = {
      id: generateId(),
      name: '',
      comments: '',
      status: 'Assigned',
      delegationStatus: 'Assigned',
      priority: 'Mid',
      party: currentUser.username || '',
      startAct: dateStr,
      finishAct: dateStr,
      updatedAt: new Date().toISOString()
    };

    const fallbackYear = (globalYearFilter !== 'all' && !isNaN(Number(globalYearFilter)))
      ? Number(globalYearFilter)
      : new Date().getFullYear();
    const fallbackStore = (globalStoreFilter && globalStoreFilter !== 'all')
      ? globalStoreFilter
      : (currentUser?.storePermissions?.hcm ? 'HCM' : 'HN');

    const newGroup: DelegationGroup = {
      id: generateId(),
      name: 'New Custom Delegation',
      projectStore: fallbackStore,
      projectYear: fallbackYear,
      subTasks: [initialSubTask],
      updatedAt: new Date().toISOString(),
      createdBy: currentUser.id
    };
    setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', newGroup.id), newGroup);
  };

  const handleUpdateGroup = async (group: DelegationGroup, updates: Partial<DelegationGroup>) => {
    if (!canWrite) return;
    const parentProject = resolveGroupParentProject(group, projects, tasks);
    const fallbackYear = (group.projectYear !== undefined && group.projectYear !== null && !isNaN(Number(group.projectYear)))
      ? Number(group.projectYear)
      : (parentProject?.year && !isNaN(Number(parentProject.year)) ? Number(parentProject.year) : new Date().getFullYear());
    const updated = { 
      ...group, 
      ...updates, 
      projectYear: updates.projectYear !== undefined && !isNaN(Number(updates.projectYear)) ? Number(updates.projectYear) : fallbackYear,
      updatedAt: new Date().toISOString() 
    };
    setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id), updated);
  };

  const handleDeleteGroup = async (group: DelegationGroup) => {
    if (!canWrite) return;
    setConfirmModal({
      isOpen: true,
      title: 'Delete Delegation Group',
      message: 'Delete this delegation group?',
      onConfirm: async () => {
        deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id));
        
        if (group.parentTaskId) {
          const parentTask = tasks.find(t=> t.id === group.parentTaskId);
          if (parentTask) {
            setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', parentTask.id), { ...parentTask, delegation: false, updatedAt: new Date().toISOString() });
          } else {
            const parentProject = resolveGroupParentProject(group, projects, tasks);
            if (parentProject) {
              setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', parentProject.id || String(parentProject.no)), { ...parentProject, delegation: false, updatedAt: new Date().toISOString() });
            }
          }
        }
      }
    });
  };

  const handleAddSubTask = async (group: DelegationGroup) => {
    if (!canWrite) return;
    
    const parentTask = group.parentTaskId ? tasks.find(t=> t.id === group.parentTaskId) : null;
    const parentProject = resolveGroupParentProject(group, projects, tasks);
    
    let startAct = parentTask?.start || parentProject?.computedTakStart || parentProject?.start;
    let finishAct = parentTask?.finish || parentProject?.computedTakCompl;
    
    // Fallback to ISO string substring if still null
    if (!startAct) startAct = new Date().toISOString().substring(0, 10);
    if (!finishAct) finishAct = new Date().toISOString().substring(0, 10);

    const newSubTask: DelegationSubTask = {
      id: generateId(),
      name: '',
      comments: '',
      status: 'Assigned',
      delegationStatus: 'Assigned',
      priority: 'Mid',
      party: currentUser.username || '',
      startAct,
      finishAct,
      updatedAt: new Date().toISOString(),
      createdBy: currentUser.id,
      involvedUsers: [currentUser.id]
    };
    const fallbackYear = (group.projectYear !== undefined && group.projectYear !== null && !isNaN(Number(group.projectYear)))
      ? Number(group.projectYear)
      : (parentProject?.year && !isNaN(Number(parentProject.year)) ? Number(parentProject.year) : new Date().getFullYear());
    const updatedGroup = {
      ...group,
      projectYear: fallbackYear,
      subTasks: [...group.subTasks, newSubTask],
      updatedAt: new Date().toISOString()
    };
    setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id), updatedGroup);

    // Update parent task if it exists to set delegation: true
    if (group.parentTaskId) {
      const parentTask = tasks.find(t=> t.id === group.parentTaskId);
      if (parentTask) {
        setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', parentTask.id), { ...parentTask, projectYear: Number(parentTask.projectYear) || fallbackYear, delegation: true, updatedAt: new Date().toISOString() });
      } else {
        const parentProj = resolveGroupParentProject(group, projects, tasks);
        if (parentProj) {
          setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', parentProj.id || String(parentProj.no)), { ...parentProj, delegation: true, updatedAt: new Date().toISOString() });
        }
      }
    }
  };

  const handleUpdateSubTask = async (group: DelegationGroup, subTaskId: string, updates: Partial<DelegationSubTask>) => {
    const subTask = group.subTasks.find(st => st.id === subTaskId);
    if (!subTask) return;
    
    const isCreator = group.createdBy === currentUser.id;
    const pPartyList = (subTask.party || '').split(',').map(p=> p.toLowerCase().trim());
    const userParties = currentUser.partyPermissions ? Object.keys(currentUser.partyPermissions).filter(k => currentUser.partyPermissions![k]).map(k => k.toLowerCase().trim()) : [];
    const isPIC = userParties.includes('all') || pPartyList.some(p => userParties.includes(p)) || pPartyList.includes(String(currentUser.username || '').toLowerCase().trim()) || (subTask.involvedUsers && subTask.involvedUsers.includes(currentUser.id));
    const canEditSubTask = canWrite || isCreator || isPIC;

    if (!canEditSubTask) return;

    const updatedSubTasks = group.subTasks.map(st => 
      st.id === subTaskId ? { 
        ...st, 
        ...updates, 
        updatedAt: new Date().toISOString(),
        involvedUsers: Array.from(new Set([...(st.involvedUsers || []), currentUser.id]))
      } : st
    );
    const parentProject = resolveGroupParentProject(group, projects, tasks);
    const fallbackYear = (group.projectYear !== undefined && group.projectYear !== null && !isNaN(Number(group.projectYear)))
      ? Number(group.projectYear)
      : (parentProject?.year && !isNaN(Number(parentProject.year)) ? Number(parentProject.year) : new Date().getFullYear());
    const updatedGroup = JSON.parse(JSON.stringify({ ...group, projectYear: fallbackYear, subTasks: updatedSubTasks, updatedAt: new Date().toISOString() }));
    setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id), updatedGroup);

    if (group.parentTaskId) {
      const parentTask = tasks.find(t=> t.id === group.parentTaskId);
      const parentProject = resolveGroupParentProject(group, projects, tasks);
      const isRealtime = parentTask?.realtimeUpdate || parentProject?.realtimeUpdate;
      
      if (parentTask && isRealtime) {
        let computedPlStatus = 'Upcoming';
        computedPlStatus = getTaskStatus(parentTask.start, parentTask.finish);

        const oldActStatusLabel = resolveActualStatus(computedPlStatus, group.subTasks).label;
        const newActStatusLabel = resolveActualStatus(computedPlStatus, updatedSubTasks).label;

        if (
          newActStatusLabel === 'Completed' &&
          oldActStatusLabel !== 'Completed'
        ) {
          const nowStr = parentTask.approval === 'Approved' && parentTask.approvedAt ? getSuggestedCompletionTime(parentTask.approvedAt) : getSuggestedCompletionTime();
          const taskUpdates: Partial<Task> = { finish: nowStr, durationManual: true };
          
          if (parentTask.start) {
            const finishDate = parseDateTime(nowStr);
            const startDate = parseDateTime(parentTask.start);
            if (finishDate && startDate) {
              const diffTime = finishDate.getTime() - startDate.getTime();
              const diffDays = diffTime / (1000 * 60 * 60 * 24);
            if (diffDays < 0) {
              taskUpdates.duration = "0";
              taskUpdates.finish = taskUpdates.start || parentTask.start;
            } else {
              taskUpdates.duration = String(parseFloat(diffDays.toFixed(1)));
            }
            }
          }
          
          const newT = { ...parentTask, ...taskUpdates, _isAutoActualized: true, updatedAt: new Date().toISOString() };
          const updatesToDependents = scheduleDependentTasks(newT, tasks, projects);
          delete (newT as any)._isAutoActualized;
          const batch = writeBatch(db);
          batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', newT.id), newT);
          for (const u of updatesToDependents) {
            batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', u.id), u as any);
          }
          try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
        syncProjectDatesByCode(parentTask.projectCode, parentTask.projectStore, parentTask.projectYear);
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }
        }
      }
    }
  };

  const handleDeleteSubTask = async (group: DelegationGroup, subTaskId: string) => {
    if (!canWrite) return;
    setConfirmModal({
      isOpen: true,
      title: 'Delete Delegation Task',
      message: 'Delete this delegation task?',
      onConfirm: async () => {
        const updatedSubTasks = group.subTasks.filter(st => st.id !== subTaskId);
        if (updatedSubTasks.length === 0) {
          deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id));
          if (group.parentTaskId) {
            const parentTask = tasks.find(t=> t.id === group.parentTaskId);
            if (parentTask) {
              setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', parentTask.id), { ...parentTask, delegation: false, updatedAt: new Date().toISOString() });
            } else {
              const parentProject = resolveGroupParentProject(group, projects, tasks);
              if (parentProject) {
                setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', parentProject.id || String(parentProject.no)), { ...parentProject, delegation: false, updatedAt: new Date().toISOString() });
              }
            }
          }
        } else {
          const parentProject = resolveGroupParentProject(group, projects, tasks);
          const fallbackYear = (group.projectYear !== undefined && group.projectYear !== null && !isNaN(Number(group.projectYear)))
            ? Number(group.projectYear)
            : (parentProject?.year && !isNaN(Number(parentProject.year)) ? Number(parentProject.year) : new Date().getFullYear());
          const updatedGroup = JSON.parse(JSON.stringify({ ...group, projectYear: fallbackYear, subTasks: updatedSubTasks, updatedAt: new Date().toISOString() }));
          setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id), updatedGroup);
        }
      }
    });
  };

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => 
      prev.includes(id) ? prev.filter(gId => gId !== id) : [...prev, id]
    );
  };

  const toggleProject = (id: string) => {
    setExpandedProjects(prev => prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]);
  };

  const handleToggleAllGroups = () => {
    const allProjectIds = groupedDelegations.orderedProjects.map(p => p.project.id || String(p.project.no));
    if (expandedGroups.length >= visibleGroups.length && expandedProjects.length >= allProjectIds.length) {
      setExpandedGroups([]);
      setExpandedProjects([]);
    } else {
      setExpandedGroups(visibleGroups.map(g => g.id));
      setExpandedProjects(allProjectIds);
    }
  };

  const handleTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = 'auto';
    target.style.height = `${target.scrollHeight}px`;
  };

  // Auto-resize textareas on load and expansion
  useEffect(() => {
    const timers = [100, 500].map(delay => setTimeout(() => {
      document.querySelectorAll('textarea').forEach(textarea => {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
      });
    }, delay));
    return () => timers.forEach(clearTimeout);
  }, [expandedGroups, groups]);

  // Synchronize plStatus and actStatus to Firestore so other apps can read it
  useEffect(() => {
    if (!canWrite) return;
    
    groups.forEach(group => {
      const parentTask = group.parentTaskId ? tasks.find(t=> t.id === group.parentTaskId) : null;
      const parentProject = resolveGroupParentProject(group, projects, tasks);
      
      let computedPlStatus = 'Upcoming';
      if (parentTask) { computedPlStatus = getTaskStatus(parentTask.start, parentTask.finish); } 
      else if (parentProject) { computedPlStatus = getStatus(parentProject.computedTakStart || parentProject.start, parentProject.computedTakCompl, parentProject.computedOpening || parentProject.opening, parentProject.code); }
      
      const computedActStatusObj = resolveActualStatus(computedPlStatus, group.subTasks);
      const computedActStatus = computedActStatusObj.label;

      if (group.plStatus !== computedPlStatus || group.actStatus !== computedActStatus) {
        handleUpdateGroup(group, { 
          plStatus: computedPlStatus, 
          actStatus: computedActStatus 
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups,   canWrite]);

  const visibleGroups = useMemo(() => {
    return groups.filter(group => {
      // 0. Focus Target Check
      if (focusTarget && focusTarget.groupId !== group.id) return false;

      // 1. Permission Check
      let hasAccess = false;
      if (isAdmin) {
        hasAccess = true;
      } else {
        const isCreator = group.createdBy === currentUser.id;
        const isSubTaskInvolved = group.subTasks.some(st => 
           st.createdBy === currentUser.id || 
           (st.involvedUsers && st.involvedUsers.includes(currentUser.id))
        );
        const groupHasParty = group.subTasks.some(st => {
          const pPartyList = String(st.party || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
          const userParties = currentUser.partyPermissions 
            ? Object.keys(currentUser.partyPermissions).filter(k => currentUser.partyPermissions![k]).map(k => k.toLowerCase().trim()) 
            : [];
          if (userParties.includes('all')) return true;
          const usernameMatch = pPartyList.includes(String(currentUser.username || '').toLowerCase().trim());
          return userParties.some(p => pPartyList.includes(p)) || usernameMatch;
        });

        hasAccess = isCreator || isSubTaskInvolved || groupHasParty;
      }
      if (!hasAccess) return false;

      // 2. Status Filter Check
      if (filterFlowStatus !== 'all') {
         const hasStatusMatch = group.subTasks.some(st => {
            const flowStatusRaw = String(st.delegationStatus || st.status || 'Assigned').toLowerCase();
            if (filterFlowStatus === 'active_only') {
               return !['completed'].includes(flowStatusRaw);
            } else if (filterFlowStatus === 'assigned_inprogress') {
               return ['assigned', 'on process', 'in progress', 'accepted', 'approved'].includes(flowStatusRaw);
            } else if (filterFlowStatus === 'pending_rejected') {
               return ['pending completed', 'rejected', 'review late', 'hold', 'delayed', 'requested', 'request delay', 'needs rework', 'waiting for approval'].includes(flowStatusRaw);
            } else if (filterFlowStatus === 'completed') {
               return flowStatusRaw === 'completed';
            }
            return true;
         });
         if (!hasStatusMatch) return false;
      }

      // Party Filter Check
      if (filterParty) {
         if (filterParty === 'unassigned') {
            const hasPartyMatch = group.subTasks.some(st => !st.party || st.party.trim() === '');
            if (!hasPartyMatch) return false;
         } else {
            const hasPartyMatch = group.subTasks.some(st => st.party === filterParty);
            if (!hasPartyMatch) return false;
         }
      }

      // 3. Multi-Search Check
      if (multiSearchTerm) {
        const groupFields = [group.name, group.projectCode, group.id];
        return matchesAdvancedSearch(
          multiSearchTerm, 
          groupFields, 
          [], 
          (term, andTerms) => {
            return group.subTasks.some(st => {
               return andTerms.every(tTerm => {
                 const inGroup = groupFields.some(v => String(v || '').toLowerCase().includes(tTerm));
                 if (inGroup) return true;
                 const stFields = [st.name, st.party, st.delegationStatus, st.status, st.comments];
                 return stFields.some(v => String(v || '').toLowerCase().includes(tTerm));
               });
            });
          }
        );
      }

      return true;
    }).map(group => {
       let filteredSubTasks = focusTarget && focusTarget.subTaskId
         ? group.subTasks.filter(st => st.id === focusTarget.subTaskId) 
         : group.subTasks;
         
       if (!isAdmin && group.createdBy !== currentUser.id) {
         filteredSubTasks = filteredSubTasks.filter(st => {
           if (st.createdBy === currentUser.id || (st.involvedUsers && st.involvedUsers.includes(currentUser.id))) return true;
           const pPartyList = String(st.party || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
           const userParties = currentUser.partyPermissions 
             ? Object.keys(currentUser.partyPermissions).filter(k => currentUser.partyPermissions![k]).map(k => k.toLowerCase().trim()) 
             : [];
           if (userParties.includes('all')) return true;
           const usernameMatch = pPartyList.includes(String(currentUser.username || '').toLowerCase().trim());
           return userParties.some(p => pPartyList.includes(p)) || usernameMatch;
         });
       }

       if (filterFlowStatus !== 'all') {
         filteredSubTasks = filteredSubTasks.filter(st => {
            const flowStatusRaw = String(st.delegationStatus || st.status || 'Assigned').toLowerCase();
            if (filterFlowStatus === 'active_only') {
               return !['completed'].includes(flowStatusRaw);
            } else if (filterFlowStatus === 'assigned_inprogress') {
               return ['assigned', 'on process', 'in progress', 'accepted', 'approved'].includes(flowStatusRaw);
            } else if (filterFlowStatus === 'pending_rejected') {
               return ['pending completed', 'rejected', 'review late', 'hold', 'delayed', 'requested', 'request delay', 'needs rework', 'waiting for approval'].includes(flowStatusRaw);
            } else if (filterFlowStatus === 'completed') {
               return flowStatusRaw === 'completed';
            }
            return true;
         });
       }

       if (filterParty) {
         if (filterParty === 'unassigned') {
            filteredSubTasks = filteredSubTasks.filter(st => !st.party || st.party.trim() === '');
         } else {
            filteredSubTasks = filteredSubTasks.filter(st => st.party === filterParty);
         }
       }
         
       if (multiSearchTerm && !focusTarget) {
         filteredSubTasks = filteredSubTasks.filter(st => {
           const groupFields = [group.name, group.projectCode, group.id];
           const stFields = [st.name, st.party, st.delegationStatus, st.status, st.comments];
           return matchesAdvancedSearch(multiSearchTerm, groupFields, stFields);
         });
       }

       const sortedSubTasks = [...filteredSubTasks].sort((a, b) => {
         if (sortConfig) {
            let valA = '';
            let valB = '';
            if (sortConfig.key === 'startAct') {
               valA = a.startAct || '9999-12-31';
               valB = b.startAct || '9999-12-31';
            } else if (sortConfig.key === 'finishAct') {
               valA = a.finishAct || '9999-12-31';
               valB = b.finishAct || '9999-12-31';
            }
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
         }

         const prioOrder: Record<string, number> = { 'High': 1, 'Mid-high': 2, 'Mid': 3, 'Low': 4 };
         const prioA = prioOrder[a.priority || 'Mid'] || 99;
         const prioB = prioOrder[b.priority || 'Mid'] || 99;
         if (prioA !== prioB) return prioA - prioB;

         const today = new Date();
         today.setHours(0, 0, 0, 0);
         
         const finishA = a.finishAct ? new Date(a.finishAct) : null;
         const finishB = b.finishAct ? new Date(b.finishAct) : null;
         
         if (finishA && finishB) {
            const diffA = Math.abs(finishA.getTime() - today.getTime());
            const diffB = Math.abs(finishB.getTime() - today.getTime());
            if (diffA !== diffB) return diffA - diffB;
         } else if (finishA) {
            return -1;
         } else if (finishB) {
            return 1;
         }
         
         const startA = a.startAct || '9999-12-31';
         const startB = b.startAct || '9999-12-31';
         if (startA < startB) return -1;
         if (startA > startB) return 1;
         return 0;
       });
       return { ...group, subTasks: sortedSubTasks };
    }).filter(group => group.subTasks.length > 0).sort((a, b) => {
        if (sortConfig) {
           let valA = '';
           let valB = '';
           let direction = sortConfig.direction;
           if (sortConfig.key === 'startAct') {
              valA = a.subTasks[0]?.startAct || '9999-12-31';
              valB = b.subTasks[0]?.startAct || '9999-12-31';
           } else if (sortConfig.key === 'finishAct') {
              valA = a.subTasks.map(t=>t.finishAct).filter(Boolean).sort()[0] || '9999-12-31';
              valB = b.subTasks.map(t=>t.finishAct).filter(Boolean).sort()[0] || '9999-12-31';
           }
           if (valA < valB) return direction === 'asc' ? -1 : 1;
           if (valA > valB) return direction === 'asc' ? 1 : -1;
           return 0;
        }

        const prioOrder: Record<string, number> = { 'High': 1, 'Mid-high': 2, 'Mid': 3, 'Low': 4 };
        const highestPrioA = Math.min(...a.subTasks.map(st => prioOrder[st.priority || 'Mid'] || 99));
        const highestPrioB = Math.min(...b.subTasks.map(st => prioOrder[st.priority || 'Mid'] || 99));
        if (highestPrioA !== highestPrioB) return highestPrioA - highestPrioB;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const getMinDiff = (group: any) => {
           let minDiff = Infinity;
           group.subTasks.forEach((st: any) => {
              if (st.finishAct) {
                 const d = new Date(st.finishAct);
                 const diff = Math.abs(d.getTime() - today.getTime());
                 if (diff < minDiff) minDiff = diff;
              }
           });
           return minDiff;
        };

        const diffA = getMinDiff(a);
        const diffB = getMinDiff(b);
        if (diffA !== diffB) return diffA - diffB;
        
        const startA = a.subTasks[0]?.startAct || '9999-12-31';
        const startB = b.subTasks[0]?.startAct || '9999-12-31';
        if (startA < startB) return -1;
        if (startA > startB) return 1;

        return 0;
    });
  }, [groups,   isAdmin, filterFlowStatus, filterParty, multiSearchTerm, focusTarget, sortConfig]);

  const groupedDelegations = useMemo(() => {
    const byProject = new Map<string, typeof visibleGroups>();
    const orphans: typeof visibleGroups = [];

    const paginatedGroups = visibleGroups.slice(0, visibleCount);

    paginatedGroups.forEach(group => {
      const p = resolveGroupParentProject(group, projects, tasks);
      if (p) {
        const key = p.id || String(p.no);
        if (!byProject.has(key)) {
          byProject.set(key, []);
        }
        byProject.get(key)!.push(group);
      } else {
        orphans.push(group);
      }
    });

    const orderedProjects = 
      projects.filter(p=> {
         const key = p.id || String(p.no);
         return byProject.has(key);
      }).map(p=> {
         const key = p.id || String(p.no);
         return {
           project: p,
           groups: byProject.get(key)!
         };
      });

    return { orderedProjects, orphans };
  }, [visibleGroups, visibleCount]);

  const isAllExpanded = expandedGroups.length >= visibleGroups.length && expandedProjects.length >= groupedDelegations.orderedProjects.length;

  const renderGroup = (group: DelegationGroup, isOrphan = false) => {
    const isExpanded = expandedGroups.includes(group.id);
    const parentTask = group.parentTaskId ? tasks.find(t=> t.id === group.parentTaskId) : null;
    const parentProject = resolveGroupParentProject(group, projects, tasks);

    let plStatus = 'Upcoming';
    if (parentTask) {
      plStatus = getTaskStatus(parentTask.start, parentTask.finish);
    } else if (parentProject) {
      const computedTakStart = parentProject.computedTakStart || parentProject.start;
      const computedTakCompl = parentProject.computedTakCompl;
      plStatus = getStatus(computedTakStart, computedTakCompl, parentProject.computedOpening || parentProject.opening, parentProject.code);
    }

    let plStatusColorClass = 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';
    if (plStatus === 'Completed') plStatusColorClass = 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200';
    else if (plStatus === 'On process' || plStatus === 'Handover') plStatusColorClass = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200';
    else if (plStatus === 'Canceled') plStatusColorClass = 'bg-red-50 text-red-600 dark:text-red-400 border-red-200';
    
    const isLinked = !!group.parentTaskId;

    return (
      <React.Fragment key={group.id}>
        {/* Group Header Row */}
        <tr id={`delegation-group-${group.id}`} className={cn("border-b border-slate-200 dark:border-[#444446] hover:bg-slate-200 dark:hover:bg-[#333336]/50 transition-colors", isOrphan ? "bg-slate-100/80 dark:bg-[#1e1e20]/80" : "bg-white dark:bg-[#1e1e20]", plStatus === 'On process' ? "shadow-[inset_4px_0_0_0_#3b82f6]" : "")}>
          {visibleColumns.includes('expand') && (
            <td className={cn("px-4 py-3 text-center", !isOrphan && "pl-8")}>
              <button title="Toggle Expand" onClick={() => toggleGroup(group.id)} className="p-1 hover:bg-slate-100 dark:hover:bg-[#28282a] rounded transition-colors text-slate-500 dark:text-[#a3a3a3]">
                {!isExpanded ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </td>
          )}
          {visibleColumns.includes('taskName') && (
            <td className="px-4 py-3 font-bold text-slate-800 dark:text-[#e3e3e3] break-words whitespace-normal">
              <div className="flex items-center gap-1">
                {!isOrphan && <span className="text-slate-400 dark:text-[#838383]">↳</span>}
                <div className="flex-grow">
                  {!isLinked ? (
                    <textarea
                      defaultValue={group.name}
                      onBlur={(e) => handleUpdateGroup(group, { name: e.target.value })}
                      onInput={handleTextareaInput}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }}
                      disabled={!canWrite}
                      rows={1}
                      className="bg-[#eaffea] dark:bg-[#1a3821] border border-green-200 dark:border-[#265330] outline-none w-full focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 text-slate-800 dark:text-[#e3e3e3] font-bold resize-none overflow-hidden min-h-[28px]"
                      placeholder="Custom Delegation Name"
                    />
                  ) : (
                    <div className="flex flex-col">
                      <span>
                        {parentTask?.name || parentProject?.name || group.name}
                        {parentTask && parentProject?.name ? ` - ${parentProject.name}` : ''}
                      </span>
                      {(parentTask || parentProject) && (
                        <span className="text-xs text-slate-500 dark:text-[#a3a3a3] font-normal mt-0.5">
                          Start (Plan): {formatDisplayDateMain(parentTask?.start || parentProject?.computedTakStart || parentProject?.start)} | Finish (Plan): {formatDisplayDateMain(parentTask?.finish || parentProject?.computedTakCompl)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </td>
          )}
          {visibleColumns.includes('projectCode') && (
            <td className="px-4 py-3 font-mono text-blue-700 dark:text-[#8ab4f8] font-bold break-words whitespace-normal">
              {group.projectStore ? <span className="text-slate-500 dark:text-[#a3a3a3] mr-1">{group.projectStore} -</span> : ''}{group.projectCode || '-'}
            </td>
          )}
          {visibleColumns.includes('comments') && (
            <td className="px-4 py-3 text-slate-500 dark:text-[#a3a3a3] italic text-xs break-words whitespace-normal">
              {group.subTasks.length} delegation task(s)
            </td>
          )}
          {visibleColumns.includes('status') && <td className="px-4 py-3"></td>}
          {visibleColumns.includes('priority') && <td className="px-4 py-3"></td>}
          {visibleColumns.includes('party') && (
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1">
                 {Array.from(new Set(group.subTasks.map(st => st.party).filter(p=> p && String(p).trim() !== ''))).map((party, idx) => (
                   <span key={idx} className="bg-blue-500 text-white px-1.5 py-0.5 rounded-[3px] text-[10px] font-bold tracking-wider inline-block max-w-[100px] truncate" title={party}>
                     {party}
                   </span>
                 ))}
              </div>
            </td>
          )}
          {visibleColumns.includes('actions') && (
            <td className="px-4 py-3 text-center">
              <div className="flex items-center justify-center gap-2">
                <div className={`text-[10px] leading-tight font-bold px-2 py-1 rounded-full border whitespace-nowrap ${resolveActualStatus(plStatus, group.subTasks).color}`}>
                  Act: {resolveActualStatus(plStatus, group.subTasks).label}
                </div>
                <button type="button" onClick={() => setMultiSearchTerm((parentProject?.code ? parentProject.code + ' ' : '') + group.name)} className="text-blue-500 hover:text-blue-700 dark:text-[#8ab4f8] p-1 rounded hover:bg-blue-50 dark:hover:bg-[#333336] transition-colors" title="Filter by Tracker"><Search className="w-4 h-4" /></button>
                {canWrite && (
                  <>
                    <button onClick={() => handleDeleteGroup(group)} 
                      className="text-red-400 hover:text-red-600 dark:text-red-400 p-1 rounded hover:bg-red-50 transition-colors"
                      title="Delete Group"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </td>
          )}
        </tr>
                  
        {/* Sub Tasks Rows */}
        {isExpanded && group.subTasks.map((st, idx) => {
          const parsedStartObj = parseDateTime(parentTask?.start || parentProject?.computedTakStart || parentProject?.start);
          const defaultStartAct = parsedStartObj ? formatToDatetimeLocal(parsedStartObj) : '';
          const parsedFinishObj = parseDateTime(parentTask?.finish || parentProject?.computedTakCompl);
          const defaultFinishAct = parsedFinishObj ? formatToDatetimeLocal(parsedFinishObj) : '';

          const isCreator = isAdmin || group.createdBy === currentUser.id;
          const pPartyList = String(st.party || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
          const userParties = currentUser.partyPermissions ? Object.keys(currentUser.partyPermissions).filter(k => currentUser.partyPermissions![k]).map(k => k.toLowerCase().trim()) : [];
          const isPIC = userParties.includes('all') || pPartyList.some(p => userParties.includes(p)) || pPartyList.includes(String(currentUser.username || '').toLowerCase().trim()) || (st.involvedUsers && st.involvedUsers.includes(currentUser.id));
          const canEditSubTask = canWrite || isCreator || isPIC;
          
          let selectValue = 'None';
          const stStatus = String(st.delegationStatus || st.status || '').toLowerCase();
          const stApproval = String(st.approvalStatus || '').toLowerCase();
          if (stStatus === 'completed') selectValue = 'Approved';
          else if (stStatus === 'rejected') selectValue = 'Rejected';
          else if (stStatus === 'pending completed') selectValue = 'ReqApproval';
          else if (stStatus === 'needs rework') selectValue = 'ReqReview';
          else if (stStatus === 'on process' || stStatus === 'accepted') selectValue = 'AcceptTask';
          else if (['requested', 'hold', 'waiting for approval'].includes(stStatus) || ['requested', 'hold', 'waiting for approval'].includes(stApproval)) selectValue = 'Hold';

          return (
          <React.Fragment key={st.id}>
          <tr id={`delegation-subtask-${st.id}`} className={`bg-white dark:bg-[#1e1e20] border-b border-slate-100 dark:border-[#333336] hover:bg-blue-50 dark:hover:bg-[#333336]/30 transition-all duration-300 ${focusTarget?.subTaskId === st.id ? 'bg-yellow-50 dark:bg-yellow-900/30 ring-2 ring-yellow-400 dark:ring-yellow-600 inset-0' : ''}`}>
            {visibleColumns.includes('expand') && <td className="px-4 py-3"></td>}
            {visibleColumns.includes('taskName') && (
              <td className="px-4 py-3 pl-8 text-slate-700 dark:text-[#c3c3c3] break-words whitespace-normal">
                <div className="flex items-center gap-2 mb-2 pl-4">
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-slate-400 dark:text-[#838383] font-bold ml-1">Start (Act)</span>
                    <div className="relative w-full min-h-[28px]">
                      <input
                        type="date"
                        value={st.startAct ? st.startAct.substring(0, 10) : (defaultStartAct ? defaultStartAct.substring(0, 10) : '')}
                        onChange={(e) => handleUpdateSubTask(group, st.id, { startAct: e.target.value })}
                        disabled={!canEditSubTask}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-auto"
                      />
                      <div className={cn("w-full bg-transparent border rounded p-1.5 text-[11px] font-medium min-h-[28px] flex items-center whitespace-nowrap", !canEditSubTask ? "border-transparent" : "hover:border-slate-300")}>
                        {formatDisplayDateMain(st.startAct || defaultStartAct)}
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-slate-400 dark:text-[#838383] font-bold ml-1">Finish (Act)</span>
                    <div className="relative w-full min-h-[28px]">
                      <input
                        type="date"
                        value={st.finishAct ? st.finishAct.substring(0, 10) : (defaultFinishAct ? defaultFinishAct.substring(0, 10) : '')}
                        onChange={(e) => handleUpdateSubTask(group, st.id, { finishAct: e.target.value })}
                        disabled={!canEditSubTask}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-auto"
                      />
                      <div className={cn("w-full bg-transparent border rounded p-1.5 text-[11px] font-medium min-h-[28px] flex items-center whitespace-nowrap", !canEditSubTask ? "border-transparent" : "hover:border-slate-300")}>
                        {formatDisplayDateMain(st.finishAct || defaultFinishAct)}
                      </div>
                    </div>
                  </div>
                </div>
              </td>
            )}
            {visibleColumns.includes('projectCode') && <td className="px-4 py-3"></td>}
            {visibleColumns.includes('comments') && (
              <td className="px-4 py-3" title={st.comments}>
                <textarea
                  defaultValue={st.comments}
                  onBlur={(e) => handleUpdateSubTask(group, st.id, { comments: e.target.value })}
                  onInput={handleTextareaInput}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }}
                  disabled={!canEditSubTask}
                  className="w-full bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-[#444446] focus:border-blue-500 focus:bg-white dark:focus:bg-[#1e1e20] rounded p-1.5 outline-none resize-y min-h-[60px] text-sm whitespace-pre-wrap"
                  placeholder="Add comments..."
                />
              </td>
            )}
            {visibleColumns.includes('status') && (
              <td className="px-4 py-3 align-top pt-5">
                <div className="flex flex-col gap-2 min-w-[120px] items-center justify-center">
                  <div className={`text-[11px] leading-tight font-bold px-3 py-1 rounded-full border inline-block break-words max-w-[120px] text-center ${plStatusColorClass}`}>
                    Pl: {plStatus}
                  </div>
                  <div className={`text-[11px] leading-tight font-bold px-3 py-1 rounded-full border inline-block break-words max-w-[120px] text-center ${resolveActualStatus(plStatus, group.subTasks).color}`}>
                    Act: {resolveActualStatus(plStatus, group.subTasks).label}
                  </div>
                </div>
              </td>
            )}

            {visibleColumns.includes('priority') && (
              <td className="px-4 py-3">
                <select
                  value={st.priority || 'Mid'}
                  onChange={(e) => handleUpdateSubTask(group, st.id, { priority: e.target.value as any })}
                  disabled={!canEditSubTask}
                  style={{ 
                    backgroundImage: "url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23334155%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')",
                    backgroundPosition: "calc(100% - 6px) center"
                   }}
                  className={cn(
                    "w-full text-[10px] md:text-xs font-bold pl-1.5 md:pl-2 pr-5 md:pr-6 py-1 md:py-1.5 rounded-md border outline-none cursor-pointer appearance-none bg-[length:10px_10px] md:bg-[length:12px_12px] bg-no-repeat",
                    st.priority === 'High' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                    st.priority === 'Mid-high' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                    st.priority === 'Low' ? 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-500 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]' :
                    'bg-blue-50 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8] border-blue-200', // Mid default
                    !canEditSubTask && "opacity-80 cursor-not-allowed"
                  )}
                >
                  <option value="High">High</option>
                  <option value="Mid-high">Mid-high</option>
                  <option value="Mid">Mid</option>
                  <option value="Low">Low</option>
                </select>
              </td>
            )}
            {visibleColumns.includes('party') && (
              <td className="px-4 py-3">
                <MultiSelectInput
                  value={st.party || ''}
                  options={[...picOptions, ...uniqueParties]}
                  onSave={(val) => handleUpdateSubTask(group, st.id, { party: val })}
                  disabled={!canEditSubTask}
                  className="w-full bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-[#444446] focus:border-blue-500 focus:bg-white dark:focus:bg-[#1e1e20] rounded pl-1.5 md:pl-2 pr-6 md:pr-7 py-1 md:py-1.5 outline-none text-xs md:text-sm font-medium h-[28px] md:h-[32px]"
                  placeholder="PIC..."
                />
              </td>
            )}
            {visibleColumns.includes('actions') && (
              <td className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <div className={`text-[10px] leading-tight font-bold px-2 py-1 rounded-full border whitespace-nowrap ${resolveActualStatus(plStatus, [st]).color}`}>
                    Act: {resolveActualStatus(plStatus, [st]).label}
                  </div>
                  <button type="button" onClick={() => setMultiSearchTerm((parentProject?.code ? parentProject.code + ' ' : '') + (st.name || group.name))} className="text-blue-400 hover:text-blue-600 dark:text-[#8ab4f8] p-1 rounded hover:bg-blue-50 dark:hover:bg-[#333336] transition-colors" title="Filter by Tracker"><Search className="w-4 h-4" /></button>
                  {canWrite && (
                    <button onClick={() => handleDeleteSubTask(group, st.id)} 
                      className="text-red-300 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </td>
            )}
          </tr>
          <tr className="bg-slate-50 dark:bg-[#1e1e20]/30 border-b border-slate-100 dark:border-[#333336]">
            <td colSpan={visibleColumns.length} className="px-4 py-3">
              <div className="flex flex-wrap md:flex-nowrap items-stretch gap-4 pl-8">
                {/* Report */}
                <div className="flex-1 bg-blue-100 dark:bg-[#333336]/40 p-2.5 rounded border border-blue-200">
                  <span className="text-[10px] font-bold text-blue-800 dark:text-[#8ab4f8] tracking-wider block mb-1 opacity-80">{t("Report")}</span>
                  <div className="text-sm text-slate-700 dark:text-[#c3c3c3] whitespace-pre-wrap min-h-[20px]">
                    {st.report || st.childReport || <span className="text-slate-400 dark:text-[#838383] italic text-xs">No report linked</span>}
                  </div>
                </div>
                
                {/* File Attachment */}
                <div className="w-64 shrink-0 bg-blue-100 dark:bg-[#333336]/40 p-2.5 rounded border border-blue-200 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-blue-800 dark:text-[#8ab4f8] tracking-wider block mb-2 opacity-80">Attached file(s)</span>
                  {st.attachments && st.attachments.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {st.attachments.map((att, iIdx) => (
                        <a key={iIdx} onClick={(e) => e.stopPropagation()} href={ensureUrlProtocol(att.url)} target="_blank" rel="noreferrer" className="flex items-center gap-2 group w-full">
                          <div className="w-8 h-8 shrink-0 bg-white dark:bg-[#1e1e20] border border-blue-200 rounded flex items-center justify-center overflow-hidden relative">
                            {att.url?.match(/\.(jpeg|jpg|gif|png|webp|bmp)($|\?)/i) ? (
                              <img src={att.url} alt="Attached preview" className="w-full h-full object-cover" />
                            ) : (
                              <Paperclip className="w-4 h-4 text-blue-500" />
                            )}
                            <div className="absolute inset-0 bg-black/40 items-center justify-center hidden group-hover:flex transition-opacity">
                              <ExternalLink className="w-3 h-3 text-white" />
                            </div>
                          </div>
                          <span className="text-xs font-medium text-blue-700 dark:text-[#8ab4f8] group-hover:text-blue-800 dark:text-[#8ab4f8] hover:underline truncate" title={att.name || att.url || 'Download Attached File'}>
                            {att.name || att.url || 'Attached Link'}
                          </span>
                        </a>
                      ))}
                    </div>
                  ) : (st.fileUrl || st.childFileUrl) ? (
                    <a onClick={(e) => e.stopPropagation()} href={ensureUrlProtocol(st.fileUrl || st.childFileUrl)} target="_blank" rel="noreferrer" className="flex items-center gap-2 group w-full">
                      <div className="w-10 h-10 shrink-0 bg-white dark:bg-[#1e1e20] border border-blue-200 rounded flex items-center justify-center overflow-hidden relative">
                        {(st.fileUrl || st.childFileUrl)?.match(/\.(jpeg|jpg|gif|png|webp|bmp)($|\?)/i) ? (
                          <img src={st.fileUrl || st.childFileUrl} alt="Attached preview" className="w-full h-full object-cover" />
                        ) : (
                          <Paperclip className="w-5 h-5 text-blue-500" />
                        )}
                        <div className="absolute inset-0 bg-black/40 items-center justify-center hidden group-hover:flex transition-opacity">
                          <ExternalLink className="w-4 h-4 text-white" />
                        </div>
                      </div>
                      <span className="text-sm font-medium text-blue-700 dark:text-[#8ab4f8] group-hover:text-blue-800 dark:text-[#8ab4f8] hover:underline truncate" title={st.fileName || st.childFileName || 'Download Attached File'}>
                        {st.fileName || st.childFileName || 'Download Attached File'}
                      </span>
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-[#838383] italic flex items-center gap-1"><Paperclip className="w-3 h-3" /> No file attached</span>
                  )}
                </div>
                
                {/* Flow/Status */}
                <div className="w-40 shrink-0 bg-blue-100 dark:bg-[#333336]/40 p-2.5 rounded border border-blue-200 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold text-blue-800 dark:text-[#8ab4f8] tracking-wider block mb-1 opacity-80 text-center">Flow Status</span>
                  <div
                    className={cn(
                      "text-[11px] font-bold px-2 py-1.5 rounded-lg border w-full text-center break-words leading-snug",
                      (st.delegationStatus || st.status) === 'Completed' ? 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200' :
                      ((st.delegationStatus || st.status) === 'On process' || (st.delegationStatus || st.status) === 'Accepted') ? 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200' :
                      ((st.delegationStatus || st.status) === 'Delayed' || ['requested', 'hold', 'waiting for approval', 'pending completed'].includes((st.delegationStatus || st.status || '').toLowerCase())) ? 'bg-orange-50 text-orange-600 border-orange-200' :
                      ((st.delegationStatus || st.status) === 'Approved' || (st.delegationStatus || st.status) === 'Rejected' || (st.delegationStatus || st.status) === 'Request Delay' || (st.delegationStatus || st.status) === 'Needs Rework') ? 'bg-purple-50 text-purple-700 border-purple-200' :
                      ((st.delegationStatus || st.status) === 'Assigned' || !(st.delegationStatus || st.status)) ? 'bg-orange-50 text-orange-600 border-orange-200' :
                      'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]'
                    )}
                  >
                    Flow: {st.delegationStatus || st.status || 'Assigned'}
                  </div>
                </div>

                {/* Approve/Reject */}
                <div className="w-48 shrink-0 bg-blue-100 dark:bg-[#333336]/40 p-2.5 rounded border border-blue-200 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-blue-800 dark:text-[#8ab4f8] tracking-wider block mb-1 opacity-80">Approval state</span>
                  <select
                    value={selectValue}
                    onChange={(e) => {
                        const val = e.target.value;
                        let payload: Partial<DelegationSubTask> = { approvalStatus: val };
                        if (val === 'Approved') {
                          payload.status = 'Approved';
                          payload.delegationStatus = 'Completed';
                          payload.finishAct = new Date().toISOString().substring(0, 10);
                          payload.approvedAt = new Date().toISOString();
                        } else if (val === 'Rejected') {
                          payload.status = 'Rejected';
                          payload.delegationStatus = 'Rejected';
                          payload.approvedAt = null;
                        } else if (val === 'Hold') {
                          payload.approvalStatus = 'Requested'; // Set Requested in db so child app understands it
                          payload.approvedAt = null;
                        } else if (val === 'AcceptTask') {
                          payload.status = 'On process';
                          payload.delegationStatus = 'On process';
                          if (!st.startAct) {
                            payload.startAct = new Date().toISOString().substring(0, 10);
                          }
                          payload.approvedAt = null;
                        } else if (val === 'ReqApproval') {
                          payload.status = 'Pending completed';
                          payload.delegationStatus = 'Pending completed';
                          payload.approvalStatus = 'Requested';
                          payload.approvedAt = null;
                        } else if (val === 'ReqReview') {
                          payload.status = 'Needs Rework';
                          payload.delegationStatus = 'Needs Rework';
                          payload.approvedAt = null;
                        } else {
                          payload.approvedAt = null;
                        }
                        handleUpdateSubTask(group, st.id, payload);
                    }}
                    disabled={!canEditSubTask}
                    className={cn(
                      "text-xs w-full font-bold px-2 py-1.5 rounded border outline-none cursor-pointer",
                      (['requested', 'hold', 'pending completed', 'waiting for approval'].includes((st.delegationStatus || '').toLowerCase()) || ['requested', 'hold', 'pending completed', 'waiting for approval'].includes((st.status || '').toLowerCase()) || ['requested', 'hold', 'pending completed', 'waiting for approval'].includes((st.approvalStatus || '').toLowerCase())) && st.delegationStatus !== 'Completed' && st.status !== 'Completed' ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-purple-50 text-purple-700 border-purple-200"
                    )}
                  >
                    <option value="None" disabled hidden>State...</option>
                    {(isPIC || isCreator) && <option value="AcceptTask">Accepted</option>}
                    {(isPIC || isCreator) && <option value="ReqApproval">Requested Approval</option>}
                    {isCreator && <option value="Approved">{t("Approved")}</option>}
                    {isCreator && <option value="Rejected">{t("Rejected")}</option>}
                  </select>
                  {st.approvedAt && selectValue === 'Approved' && (
                    <div className="text-[9px] text-slate-500 dark:text-slate-400 mt-1 whitespace-nowrap">
                      {formatDisplayDateTime(st.approvedAt)}
                    </div>
                  )}
                </div>
              </div>
            </td>
          </tr>
          </React.Fragment>
          );
        })}
      </React.Fragment>
    );
  };

  const renderMobileGroup = (group) => {
    const isExpanded = expandedGroups.includes(group.id);
    const parentTask = group.parentTaskId ? tasks.find(t=> t.id === group.parentTaskId) : null;
    const parentProject = resolveGroupParentProject(group, projects, tasks);
    let plStatus = 'Upcoming';
    if (parentTask) { plStatus = getTaskStatus(parentTask.start, parentTask.finish); } 
    else if (parentProject) { plStatus = getStatus(parentProject.computedTakStart || parentProject.start, parentProject.computedTakCompl, parentProject.computedOpening || parentProject.opening, parentProject.code); }
    let plStatusColorClass = plStatus === 'Completed' ? 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200' : (plStatus === 'On process' || plStatus === 'Handover') ? 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200' : plStatus === 'Canceled' ? 'bg-red-50 text-red-600 dark:text-red-400 border-red-200' : 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';
    const isLinked = !!group.parentTaskId;

    return (
      <div id={`delegation-group-mobile-${group.id}`} key={group.id} className="bg-white dark:bg-[#1e1e20] rounded-xl shadow-sm border border-slate-200 dark:border-[#444446] flex flex-col">
        <div className="p-3 bg-slate-100 dark:bg-[#1e1e20]/50 border-b border-slate-100 dark:border-[#333336] flex items-start justify-between cursor-pointer" onClick={() => toggleGroup(group.id)}>
          <div className="flex flex-col gap-1 pr-2 flex-1">
            <div className="font-bold text-slate-800 dark:text-[#e3e3e3] text-sm leading-snug">
              {!isLinked ? group.name : (
                parentTask 
                  ? `${parentTask.name}${parentProject?.name ? ` - ${parentProject.name}` : ''}`
                  : (parentProject?.name || group.name)
              )}
            </div>
            {isLinked && <div className="text-xs text-blue-600 dark:text-[#8ab4f8] font-mono font-medium">{group.projectStore ? <span className="text-slate-500 dark:text-[#a3a3a3] mr-1">{group.projectStore} -</span> : ''}{group.projectCode || '-'}{parentProject?.name ? <span className="text-slate-500 dark:text-[#a3a3a3] font-sans font-normal ml-1 text-[11px]">- {parentProject.name}</span> : ''}</div>}
            {isLinked && (parentTask || parentProject) && (
              <div className="text-[10px] text-slate-500 dark:text-[#a3a3a3] font-medium mt-1">
                P: {formatDisplayDateMain(parentTask?.start || parentProject?.computedTakStart || parentProject?.start)} - {formatDisplayDateMain(parentTask?.finish || parentProject?.computedTakCompl)}
              </div>
            )}
            <div className="flex gap-2 max-w-full flex-wrap">
               <span className={`mt-1.5 text-[10px] px-2 py-0.5 rounded flex font-bold border break-words leading-tight text-center items-center justify-center ${plStatusColorClass}`}>Pl: {plStatus}</span>
               <span className={`mt-1.5 text-[10px] px-2 py-0.5 rounded flex font-bold border break-words leading-tight text-center items-center justify-center ${resolveActualStatus(plStatus, group.subTasks).color}`}>Act: {resolveActualStatus(plStatus, group.subTasks).label}</span>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {[...new Set(group.subTasks.map(st => st.party).filter(p=> p && String(p).trim() !== ''))].map(p=> (
                <span key={String(p)} className="bg-blue-500 text-white px-1.5 py-0.5 rounded-[3px] text-[9.5px] tracking-wider flex-shrink-0 font-bold max-w-[80px] truncate" title={String(p)}>
                  {String(p)}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="p-1.5 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded shadow-sm text-slate-500 dark:text-[#a3a3a3] flex shrink-0 items-center justify-center">
              {!isExpanded ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
            <div className="flex items-center gap-1 mt-2">
              <div className={`text-[10px] leading-tight font-bold px-1.5 py-1 rounded-full border whitespace-nowrap ${resolveActualStatus(plStatus, group.subTasks).color} shrink-0`}>
                Act: {resolveActualStatus(plStatus, group.subTasks).label}
              </div>
              <button type="button" onClick={(e) => { e.stopPropagation(); setMultiSearchTerm((parentProject?.code ? parentProject.code + ' ' : '') + group.name); }} className="p-1.5 rounded bg-blue-50 dark:bg-[#28282a] text-blue-500 hover:text-blue-700 dark:text-[#8ab4f8] hover:bg-blue-100 dark:hover:bg-[#444446] transition-colors" title="Filter by Tracker"><Search className="w-4 h-4" /></button>
              {canWrite && (
                  <>
                     <button onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group); }} className="p-1.5 rounded bg-red-50 text-red-500 hover:bg-red-100 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </>
              )}
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="flex flex-col bg-slate-50 dark:bg-[#1e1e20]/50 p-2 gap-3 border-t border-slate-200 dark:border-[#444446]">
            {group.subTasks.length === 0 && <div className="py-4 text-center text-slate-400 dark:text-[#838383] text-xs italic">No delegation .</div>}
            {group.subTasks.map((st, idx) => {
              const parsedStartObj = parseDateTime(parentTask?.start || parentProject?.computedTakStart || parentProject?.start);
              const defaultStartAct = parsedStartObj ? formatToDatetimeLocal(parsedStartObj) : '';
              const parsedFinishObj = parseDateTime(parentTask?.finish || parentProject?.computedTakCompl);
              const defaultFinishAct = parsedFinishObj ? formatToDatetimeLocal(parsedFinishObj) : '';

              const isCreator = isAdmin || group.createdBy === currentUser.id;
              const pPartyList = String(st.party || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
              const userParties = currentUser.partyPermissions ? Object.keys(currentUser.partyPermissions).filter(k => currentUser.partyPermissions![k]).map(k => k.toLowerCase().trim()) : [];
              const isPIC = userParties.includes('all') || pPartyList.some(p => userParties.includes(p)) || pPartyList.includes(String(currentUser.username || '').toLowerCase().trim()) || (st.involvedUsers && st.involvedUsers.includes(currentUser.id));
              const canEditSubTask = canWrite || isCreator || isPIC;
              
              let selectValue = 'None';
              const stStatus = String(st.delegationStatus || st.status || '').toLowerCase();
              const stApproval = String(st.approvalStatus || '').toLowerCase();
              if (stStatus === 'completed') selectValue = 'Approved';
              else if (stStatus === 'rejected') selectValue = 'Rejected';
              else if (stStatus === 'pending completed') selectValue = 'ReqApproval';
              else if (stStatus === 'needs rework') selectValue = 'ReqReview';
              else if (stStatus === 'on process' || stStatus === 'accepted') selectValue = 'AcceptTask';
              else if (['requested', 'hold', 'waiting for approval'].includes(stStatus) || ['requested', 'hold', 'waiting for approval'].includes(stApproval)) selectValue = 'Hold';

              let flowTxt = st.delegationStatus || st.status || 'Assigned';
              let flowColor = 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';
              let cardBgColor = 'bg-white dark:bg-[#1e1e20] border-slate-200 dark:border-[#444446]';
              
              if (flowTxt === 'Completed') {
                 flowColor = 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200';
                 cardBgColor = 'bg-green-50/50 dark:bg-emerald-900/10 border-green-200 dark:border-emerald-900/30';
              } else if (flowTxt === 'On process' || flowTxt === 'Accepted') {
                 flowColor = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200';
                 cardBgColor = 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30';
              } else if (flowTxt === 'Delayed' || ['requested', 'hold', 'waiting for approval', 'pending completed'].includes(flowTxt.toLowerCase())) {
                 flowColor = 'bg-orange-50 text-orange-600 border-orange-200';
                 cardBgColor = 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30';
              } else if (flowTxt === 'Approved' || flowTxt === 'Rejected' || flowTxt === 'Request Delay' || flowTxt === 'Needs Rework') {
                 flowColor = 'bg-purple-50 text-purple-700 border-purple-200';
                 cardBgColor = 'bg-purple-50/50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-900/30';
              } else if (flowTxt === 'Assigned') {
                 flowColor = 'bg-orange-50 text-orange-600 border-orange-200';
                 cardBgColor = 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30';
              }

              return (
                 <div id={`delegation-subtask-mobile-${st.id}`} key={st.id} className={cn("border flex flex-col rounded-lg p-3 shadow-sm relative transition-all duration-300", cardBgColor, focusTarget?.subTaskId === st.id ? 'ring-2 ring-yellow-400 dark:ring-yellow-600' : '')}>
                   <div className="flex items-start gap-2 mb-3 mt-1 w-full">
                     <div className="flex items-center gap-1.5 shrink-0 pt-0.5 max-w-full">
                       <select 
                         value={st.priority || 'Mid'} 
                         onChange={(e) => handleUpdateSubTask(group, st.id, { priority: e.target.value as any })} 
                         disabled={!canEditSubTask} 
                         title="Priority" 
                         style={{ 
                           backgroundImage: "url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23334155%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')",
                           backgroundPosition: "calc(100% - 6px) center"
                         }}
                         className={cn(
                           "rounded pl-2 pr-6 md:pr-5 py-1.5 md:py-1.5 text-xs md:text-xs leading-tight font-bold outline-none appearance-none bg-[length:12px_12px] bg-no-repeat w-auto min-w-[70px] max-w-[85px] shrink-1 md:min-w-[80px] h-[32px] md:h-auto",
                           st.priority === 'High' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                           st.priority === 'Mid-high' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                           st.priority === 'Low' ? 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-500 dark:text-[#a3a3a3] border border-slate-200 dark:border-[#444446]' :
                           'bg-blue-50 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8] border border-blue-200' // Mid default
                         )}
                       >
                          <option value="High">High</option>
                          <option value="Mid-high">Mid-H</option>
                          <option value="Mid">Mid</option>
                          <option value="Low">Low</option>
                       </select>
                       <MultiSelectInput
                         value={st.party || ''}
                         options={[...picOptions, ...uniqueParties]}
                         onSave={(val) => handleUpdateSubTask(group, st.id, { party: val })}
                         disabled={!canEditSubTask} 
                         placeholder="PIC"
                         className="bg-slate-50 dark:bg-[#1e1e20]/50 border border-slate-200 dark:border-[#444446] rounded pl-2.5 pr-2 md:px-2 py-1.5 md:py-1.5 text-xs md:text-xs leading-tight font-bold text-slate-700 dark:text-[#c3c3c3] outline-none flex-grow shrink w-full min-w-[70px] h-[32px] md:h-[24px]" 
                       />
                       <div className={`text-[9px] md:text-[10px] leading-tight font-bold px-1.5 py-0.5 md:py-1 rounded-full border whitespace-nowrap ${resolveActualStatus(plStatus, [st]).color} shrink-0`}>
                         Act: {resolveActualStatus(plStatus, [st]).label}
                       </div>
                       <button type="button" onClick={() => setMultiSearchTerm((parentProject?.code ? parentProject.code + ' ' : '') + (st.name || group.name))} className="p-1 md:p-1.5 bg-slate-50 dark:bg-[#1e1e20]/50 text-blue-400 hover:bg-blue-50 dark:hover:bg-[#333336] hover:text-blue-600 dark:text-[#8ab4f8] rounded transition-colors ml-0.5 shrink-0" title="Filter by Tracker">
                         <Search className="w-3 h-3 md:w-4 md:h-4" />
                       </button>
                       {canWrite && (
                          <button onClick={() => handleDeleteSubTask(group, st.id)} className="p-1 md:p-1.5 bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-400 dark:text-[#838383] hover:bg-red-50 hover:text-red-500 rounded transition-colors ml-0.5 shrink-0"><Trash2 className="w-3 h-3 md:w-4 md:h-4" /></button>
                       )}
                     </div>
                   </div>

                   <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="flex flex-col bg-slate-50 dark:bg-[#1e1e20]/80 border border-slate-100 dark:border-[#333336] rounded-lg p-2 min-h-[46px] justify-center">
                         <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-[#838383] mb-0.5 tracking-wider">Start (Act)</span>
                         <div className="relative w-full">
                            <input type="date" value={st.startAct ? st.startAct.substring(0, 10) : (defaultStartAct ? defaultStartAct.substring(0, 10) : '')} onChange={(e) => handleUpdateSubTask(group, st.id, { startAct: e.target.value })} disabled={!canEditSubTask} className="absolute inset-0 w-full h-full opacity-0 z-10" />
                            <div className="text-xs font-bold text-slate-700 dark:text-[#c3c3c3]">{formatDisplayDateMain(st.startAct || defaultStartAct)}</div>
                         </div>
                      </div>
                      <div className="flex flex-col bg-slate-50 dark:bg-[#1e1e20]/80 border border-slate-100 dark:border-[#333336] rounded-lg p-2 min-h-[46px] justify-center">
                         <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-[#838383] mb-0.5 tracking-wider">Finish (Act)</span>
                         <div className="relative w-full">
                            <input type="date" value={st.finishAct ? st.finishAct.substring(0, 10) : (defaultFinishAct ? defaultFinishAct.substring(0, 10) : '')} onChange={(e) => handleUpdateSubTask(group, st.id, { finishAct: e.target.value })} disabled={!canEditSubTask} className="absolute inset-0 w-full h-full opacity-0 z-10" />
                            <div className="text-xs font-bold text-slate-700 dark:text-[#c3c3c3]">{formatDisplayDateMain(st.finishAct || defaultFinishAct)}</div>
                         </div>
                      </div>
                   </div>

                   <div className="flex flex-col gap-2 mb-3 bg-blue-50/30 dark:bg-[#1e1e20] p-2 rounded-lg border border-blue-50">
                      <div className="flex gap-2">
                        <span className={`text-[11px] leading-snug w-1/2 text-center break-words py-1.5 px-2 font-bold border rounded flex items-center justify-center ${flowColor}`}>Flow: {flowTxt}</span>
                        <div className="w-1/2 flex flex-col items-end">
                          <select
                            value={selectValue}
                            onChange={(e) => {
                              const val = e.target.value;
                              let payload: Partial<DelegationSubTask> = { approvalStatus: val };
                              if (val === 'Approved') { 
                                payload.status = 'Approved'; 
                                payload.delegationStatus = 'Completed'; 
                                payload.finishAct = new Date().toISOString().substring(0, 10);
                                payload.approvedAt = new Date().toISOString();
                              }
                              else if (val === 'Rejected') { payload.status = 'Rejected'; payload.delegationStatus = 'Rejected'; payload.approvedAt = null; }
                              else if (val === 'Hold') { payload.approvalStatus = 'Requested'; payload.approvedAt = null; }
                              else if (val === 'AcceptTask') {
                                payload.status = 'On process';
                                payload.delegationStatus = 'On process';
                                if (!st.startAct) {
                                  payload.startAct = new Date().toISOString().substring(0, 10);
                                }
                                payload.approvedAt = null;
                              } else if (val === 'ReqApproval') {
                                payload.status = 'Pending completed';
                                payload.delegationStatus = 'Pending completed';
                                payload.approvalStatus = 'Requested';
                                payload.approvedAt = null;
                              } else if (val === 'ReqReview') {
                                payload.status = 'Needs Rework';
                                payload.delegationStatus = 'Needs Rework';
                                payload.approvedAt = null;
                              } else {
                                payload.approvedAt = null;
                              }
                              handleUpdateSubTask(group, st.id, payload);
                            }}
                            disabled={!canEditSubTask}
                            style={{ backgroundPosition: "calc(100% - 4px) center" }}
                            className="w-full text-xs font-bold pl-2 pr-6 py-1.5 rounded border border-blue-200 bg-white dark:bg-[#1e1e20] shadow-sm text-blue-700 dark:text-[#8ab4f8] outline-none h-[32px] appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%232563eb%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:12px_12px] bg-no-repeat"
                          >
                            <option value="None" disabled hidden>State...</option>
                            {(isPIC || isCreator) && <option value="AcceptTask">Accepted</option>}
                            {(isPIC || isCreator) && <option value="ReqApproval">Requested Approval</option>}
                            {isCreator && <option value="Approved">{t("Approved")}</option>}
                            {isCreator && <option value="Rejected">{t("Rejected")}</option>}
                          </select>
                          {st.approvedAt && selectValue === 'Approved' && (
                            <div className="text-[9px] text-slate-500 dark:text-slate-400 mt-1 whitespace-nowrap">
                              {formatDisplayDateTime(st.approvedAt)}
                            </div>
                          )}
                        </div>
                      </div>
                   </div>

                   <div className="flex flex-col gap-2 text-xs border-t border-slate-100 dark:border-[#333336] pt-3">
                     <div className="flex flex-col gap-1 mt-1 bg-slate-50 dark:bg-[#1e1e20]/50 rounded bg-slate-50 dark:bg-[#1e1e20]/50 p-2">
                        <span className="text-[9px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-wider">{t("Comments")}</span>
                        <textarea defaultValue={st.comments || ''} onBlur={(e) => handleUpdateSubTask(group, st.id, { comments: e.target.value })} disabled={!canEditSubTask} rows={1} className="w-full text-base md:text-xs text-slate-600 dark:text-[#a3a3a3] bg-transparent outline-none border border-transparent rounded hover:border-slate-200 dark:hover:border-[#444446] focus:border-blue-500 focus:p-1 focus:bg-white dark:focus:bg-[#1e1e20] resize-none font-medium min-h-[24px]" placeholder="+ Add comments" />
                     </div>

                     <div className="flex flex-col gap-1 mt-1 bg-blue-50/40 dark:bg-[#28282a] rounded border border-blue-100 p-2.5">
                        <span className="text-[9px] font-bold text-blue-600 dark:text-[#8ab4f8] uppercase tracking-wider">{t("Report")}</span>
                        <div className="text-xs text-slate-700 dark:text-[#c3c3c3] font-medium whitespace-pre-wrap">{st.report || st.childReport || <span className="italic text-slate-400 dark:text-[#838383] font-normal">No report yet</span>}</div>
                        {st.attachments && st.attachments.length > 0 ? (
                           <div className="mt-2 flex flex-col gap-1.5 text-[10px]">
                             {st.attachments.map((att, iIdx) => (
                               <a key={iIdx} onClick={(e) => e.stopPropagation()} href={ensureUrlProtocol(att.url)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-700 dark:text-[#8ab4f8] hover:text-blue-800 dark:text-[#8ab4f8] font-bold bg-white dark:bg-[#1e1e20] border border-blue-200 shadow-sm rounded px-3 py-1.5 w-fit">
                                 <Paperclip className="w-3.5 h-3.5" />
                                 <span className="truncate max-w-[150px]">{att.name || att.url || 'Attached Link'}</span>
                               </a>
                             ))}
                           </div>
                        ) : (st.fileUrl || st.childFileUrl) && (
                           <div className="mt-2 text-[10px]">
                             <a onClick={(e) => e.stopPropagation()} href={ensureUrlProtocol(st.fileUrl || st.childFileUrl)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-700 dark:text-[#8ab4f8] hover:text-blue-800 dark:text-[#8ab4f8] font-bold bg-white dark:bg-[#1e1e20] border border-blue-200 shadow-sm rounded px-3 py-1.5 w-fit">
                               <Paperclip className="w-3.5 h-3.5" />
                               <span className="truncate max-w-[150px]">{st.fileName || st.childFileName || 'Download file'}</span>
                             </a>
                           </div>
                        )}
                     </div>
                   </div>

                 </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm">
      <React.Suspense fallback={null}>
        {confirmModal.isOpen && (
          <ConfirmModal 
            isOpen={confirmModal.isOpen}
            title={confirmModal.title}
            message={confirmModal.message}
            onConfirm={confirmModal.onConfirm}
            onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
          />
        )}
      </React.Suspense>
      {focusTarget && (
        <>
          <div className="bg-yellow-50 dark:bg-yellow-900/40 border-b border-yellow-200 dark:border-yellow-700/50 px-4 py-2 flex items-center justify-between sticky top-0 z-50 shadow-sm print:hidden">
            <div className="text-yellow-800 dark:text-yellow-200 text-sm font-medium flex items-center gap-2">
              <span>Focus Mode Active</span>
              <button onClick={() => setFocusTarget(null)} className="hover:bg-yellow-200 dark:hover:bg-yellow-800 p-1 rounded-full transition-colors" title="Clear Focus">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setFocusTarget(null)}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#1e1e20] border border-yellow-200 dark:border-yellow-700/50 rounded-md text-xs font-medium text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-800/50 transition-colors shadow-sm active:scale-95"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear Focus</span>
              </button>
              <button 
                onClick={() => {
                  setFocusTarget(null);
                  onBackFromFocus?.();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#1e1e20] border border-yellow-200 dark:border-yellow-700/50 rounded-md text-xs font-medium text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-800/50 transition-colors shadow-sm active:scale-95"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Back to Source</span>
                <span className="sm:hidden">Back</span>
              </button>
            </div>
          </div>
          
          {/* Floating Action Buttons */}
          <div className="fixed bottom-24 right-4 md:bottom-8 md:right-8 z-[100] flex flex-col gap-2 items-end print:hidden pointer-events-none">
            <button
              onClick={() => setFocusTarget(null)}
              className="pointer-events-auto flex items-center gap-2 px-3 py-2 bg-slate-700/80 hover:bg-slate-800 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-white rounded-full shadow-lg transition-all active:scale-95 text-xs backdrop-blur-sm"
              title="Clear Focus"
            >
              <X className="w-4 h-4" />
              <span className="font-semibold hidden md:inline">Clear Focus</span>
            </button>
            <button
              onClick={() => {
                setFocusTarget(null);
                onBackFromFocus?.();
              }}
              className="pointer-events-auto flex items-center gap-2 px-4 py-3 bg-yellow-500 hover:bg-yellow-600 text-white rounded-full shadow-xl transition-all active:scale-95"
              title="Back to Source"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-bold">Back</span>
            </button>
          </div>
        </>
      )}
      <datalist id="pic-list">
        {Array.from(new Set([...picOptions, ...uniqueParties])).sort().map((opt, i) => <option key={i} value={opt} />)}
      </datalist>
      <div className="flex flex-col md:flex-row flex-wrap gap-3 p-4 border-b border-slate-200 dark:border-[#444446] items-start md:items-center justify-between shrink-0 bg-slate-50 dark:bg-[#1e1e20]/50 rounded-t-xl">
        <div className="flex items-center gap-3 w-full md:w-auto">
          {canWrite && (
            <button title="Add Custom" 
              onClick={handleAddCustomGroup}
              className="flex items-center gap-1.5 bg-blue-600 dark:bg-blue-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Add Custom
            </button>
          )}
          
          <div className="relative flex-grow min-w-[200px] md:max-w-xs md:w-[250px] shrink-0" ref={searchRef}>
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400 dark:text-[#838383]">
              <Search className="w-4 h-4" />
            </div>
            <DebouncedSearchInput 
              value={searchTerm}
              onChange={(val) => setSearchTerm(val)}
              onFocus={() => setIsSearchFocused(true)}
              className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block w-full pl-10 pr-10 p-2 outline-none shadow-sm" 
              placeholder="Search delegated  to add..." 
            />
            
            {isSearchFocused && canWrite && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                {searchResults.length > 0 ? (
                  searchResults.map(item => {
                    return (
                      <div 
                        key={item.id} 
                        className="p-3 border-b border-slate-100 dark:border-[#333336] hover:bg-blue-50 dark:hover:bg-[#333336] cursor-pointer flex justify-between items-center transition-colors"
                        onClick={() => handleAddLinkedGroup(item)}
                        style={{ opacity: isAddingTask[item.id] ? 0.5 : 1, pointerEvents: isAddingTask[item.id] ? 'none' : 'auto' }}
                      >
                        <div>
                          <div className="font-bold text-slate-800 dark:text-[#e3e3e3] text-sm flex items-center gap-2">
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border uppercase", item.type === 'project' ? "bg-purple-50 text-purple-600 border-purple-200" : "bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200")}>
                              {item.type}
                            </span>
                            {item.name}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-[#a3a3a3] mt-1">
                            <span className="font-mono text-blue-600 dark:text-[#8ab4f8]">{item.projectStore ? `${item.projectStore} - ` : ''}{item.projectCode}</span>
                            {item.projectName && ` - ${item.projectName}`}
                          </div>
                        </div>
                        <button className="text-blue-600 dark:text-[#8ab4f8] bg-blue-100 dark:bg-[#333336] hover:bg-blue-200 p-1.5 rounded-md transition-colors">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 text-center text-sm text-slate-500 dark:text-[#a3a3a3]">
                    No available delegated  found.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 w-full flex-wrap md:flex-nowrap md:w-auto justify-end">
          <select
            value={filterParty}
            onChange={(e) => setFilterParty(e.target.value)}
            className="bg-white dark:bg-[#1e1e20] border text-ellipsis border-slate-200 dark:border-[#444446] w-full md:w-auto md:max-w-[150px] text-slate-700 dark:text-[#c3c3c3] text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 outline-none shadow-sm font-medium"
          >
            <option value="">PIC (All)</option>
            <option value="unassigned">Unassigned</option>
            {uniqueParties.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={filterFlowStatus}
            onChange={(e) => setFilterFlowStatus(e.target.value)}
            className="bg-white dark:bg-[#1e1e20] border text-ellipsis border-slate-200 dark:border-[#444446] w-full md:w-auto md:max-w-[150px] text-slate-700 dark:text-[#c3c3c3] text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 outline-none shadow-sm font-medium"
          >
            <option value="active_only">All active (Not completed)</option>
            <option value="all">All statuses</option>
            <option value="assigned_inprogress">Assigned & In process</option>
            <option value="pending_rejected">Pending completed & Rejected</option>
            <option value="completed">{t("Completed")}</option>
          </select>
          <div className="relative w-full md:w-auto">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400 dark:text-[#838383]">
              <Search className="w-4 h-4" />
            </div>
            <DebouncedSearchInput
              value={multiSearchTerm}
              onChange={(val) => setMultiSearchTerm(val)}
              className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block w-full pl-10 p-2 outline-none shadow-sm"
              placeholder="Filter ... ( + AND, , OR )"
            />
          </div>
          <form action="https://tracker.taka-pm.org/" method="GET" target="_blank" className="relative w-full md:w-auto flex-shrink-0 min-w-[180px]">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-blue-500">
              <ExternalLink className="w-4 h-4" />
            </div>
            <input
              type="text"
              name="search"
              placeholder="Tracker search..."
              className="bg-blue-50 dark:bg-[#1e1e20] border border-blue-200 dark:border-blue-800/50 text-blue-900 dark:text-blue-100 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block w-full pl-9 p-2 outline-none shadow-sm placeholder:text-blue-400"
            />
          </form>
          <ColumnAdder 
             availableColumns={availableColumnsForUser}
             visibleColumns={visibleColumns}
             onAddColumn={handleToggleColumn} 
           />
        </div>
      </div>

      {/* Desktop View */}
      <div className="hidden lg:block overflow-auto flex-grow h-0 min-h-[300px] relative scroll-smooth [-webkit-overflow-scrolling:touch]">
        <table className="text-sm text-left text-slate-600 dark:text-[#a3a3a3] table-fixed" style={{ width: `${visibleColumns.reduce((acc, col) => acc + (colWidths[col as keyof typeof colWidths] || 100), 0)}px` }}>
          <thead className="text-xs text-slate-500 dark:text-[#a3a3a3] uppercase bg-slate-50 dark:bg-[#1e1e20]/50 sticky top-0 border-b border-slate-200 dark:border-[#444446] z-10 shadow-sm">
            <tr>
              {visibleColumns.includes('expand') && (
                <ResizableHeader width={colWidths.expand} onResize={(w) => handleResize('expand', w)} className="px-4 py-3 font-bold text-center" hideable onHide={() => handleToggleColumn('expand')}>
                  <button onClick={handleToggleAllGroups} className="p-1 hover:bg-slate-200 dark:hover:bg-[#333336] rounded transition-colors text-slate-400 dark:text-[#838383] hover:text-slate-600" title="Toggle all">
                    {isAllExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                </ResizableHeader>
              )}
              {visibleColumns.includes('taskName') && (
                <ResizableHeader width={colWidths.taskName} onResize={(w) => handleResize('taskName', w)} className="px-4 py-3 font-bold" hideable onHide={() => handleToggleColumn('taskName')}>
                  <div className="flex items-center gap-2">
                    {!visibleColumns.includes('expand') && (
                      <button onClick={handleToggleAllGroups} className="p-1 hover:bg-slate-200 dark:hover:bg-[#333336] rounded transition-colors text-slate-400 dark:text-[#838383] hover:text-slate-600 mr-1" title="Toggle all">
                        {isAllExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    )}
                    Task / Delegation
                  </div>
                </ResizableHeader>
              )}
              {visibleColumns.includes('projectCode') && <ResizableHeader width={colWidths.projectCode} onResize={(w) => handleResize('projectCode', w)} className="px-4 py-3 font-bold" hideable onHide={() => handleToggleColumn('projectCode')}>Project Code</ResizableHeader>}
              {visibleColumns.includes('comments') && <ResizableHeader width={colWidths.comments} onResize={(w) => handleResize('comments', w)} className="px-4 py-3 font-bold" hideable onHide={() => handleToggleColumn('comments')}>{t("Comments")}</ResizableHeader>}
              {visibleColumns.includes('status') && <ResizableHeader width={colWidths.status} onResize={(w) => handleResize('status', w)} className="px-4 py-3 font-bold" hideable onHide={() => handleToggleColumn('status')}>{t("Status")}</ResizableHeader>}
              {visibleColumns.includes('priority') && <ResizableHeader width={colWidths.priority} onResize={(w) => handleResize('priority', w)} className="px-4 py-3 font-bold" hideable onHide={() => handleToggleColumn('priority')}>Priority</ResizableHeader>}
              {visibleColumns.includes('party') && <ResizableHeader width={colWidths.party} onResize={(w) => handleResize('party', w)} className="px-4 py-3 font-bold" hideable onHide={() => handleToggleColumn('party')}>PIC</ResizableHeader>}
              {visibleColumns.includes('actions') && <ResizableHeader width={colWidths.actions} onResize={(w) => handleResize('actions', w)} className="px-4 py-3 font-bold text-center" hideable onHide={() => handleToggleColumn('actions')}>Actions</ResizableHeader>}
            </tr>
          </thead>
          <tbody>
            {groupedDelegations.orderedProjects.map(({ project, groups }) => {
              const projectId = project.id || String(project.no);
              const isProjectExpanded = expandedProjects.includes(projectId);
              
              const computedTakStart = project.computedTakStart || project.start;
              const computedTakCompl = project.computedTakCompl;
              const plStatus = getStatus(computedTakStart, computedTakCompl, project.computedOpening || project.opening, project.code);
              
              let plStatusColorClass = 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';
              if (plStatus === 'Completed') plStatusColorClass = 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200';
              else if (plStatus === 'On process' || plStatus === 'Handover') plStatusColorClass = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200';
              else if (plStatus === 'Canceled') plStatusColorClass = 'bg-red-50 text-red-600 dark:text-red-400 border-red-200';

              return (
                <React.Fragment key={`proj-${projectId}`}>
                  <tr className="border-b-2 border-slate-300 dark:border-[#555558] bg-blue-50/40 dark:bg-[#28282a] hover:bg-blue-50 dark:hover:bg-[#333336]/70 dark:hover:bg-[#444446] transition-colors cursor-pointer" onClick={() => toggleProject(projectId)}>
                    {visibleColumns.includes('expand') && (
                      <td className="px-4 py-3 text-center">
                        <button title="{!isProjectExpanded ?  : }" className="p-1 hover:bg-white dark:hover:bg-[#333336] rounded transition-colors text-slate-500 dark:text-[#a3a3a3]">
                          {!isProjectExpanded ? <ChevronRight className="w-5 h-5 font-bold text-blue-600 dark:text-[#8ab4f8]" /> : <ChevronDown className="w-5 h-5 font-bold text-blue-600 dark:text-[#8ab4f8]" />}
                        </button>
                      </td>
                    )}
                    {visibleColumns.includes('taskName') && (
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-[#e3e3e3] break-words whitespace-normal text-sm">
                        <div className="flex flex-col">
                           <span>{project.name}</span>
                           <span className="text-xs text-slate-500 dark:text-[#a3a3a3] font-normal mt-0.5">
                             Start (Plan): {formatDisplayDateMain(computedTakStart)} | Finish (Plan): {formatDisplayDateMain(computedTakCompl)}
                           </span>
                        </div>
                      </td>
                    )}
                    {visibleColumns.includes('projectCode') && (
                      <td className="px-4 py-3 font-mono text-blue-800 dark:text-[#8ab4f8] font-bold break-words whitespace-normal text-sm">
                        {project.store ? <span className="text-slate-500 dark:text-[#a3a3a3] mr-1">{project.store} -</span> : ''}{project.code || '-'}
                      </td>
                    )}
                    {visibleColumns.includes('comments') && (
                      <td className="px-4 py-3 text-slate-500 dark:text-[#a3a3a3] italic text-xs break-words whitespace-normal">
                        Project Delegations ({groups.length})
                      </td>
                    )}
                    {visibleColumns.includes('status') && (
                      <td className="px-4 py-3">
                         <span className={`inline-block text-[11px] font-bold px-3 py-1 rounded-full border text-center ${plStatusColorClass}`}>
                            Pl: {plStatus}
                         </span>
                      </td>
                    )}
                    {visibleColumns.includes('priority') && <td className="px-4 py-3"></td>}
                    {visibleColumns.includes('party') && <td className="px-4 py-3"></td>}
                    {visibleColumns.includes('actions') && <td className="px-4 py-3 text-center"></td>}
                  </tr>
                  {isProjectExpanded && groups.map(g => renderGroup(g, false))}
                </React.Fragment>
              );
            })}

            {groupedDelegations.orphans.map(g => renderGroup(g, true))}
            
            {visibleGroups.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length} className="px-4 py-12 text-center text-slate-500 dark:text-[#a3a3a3]">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-[#1e1e20] flex items-center justify-center mb-2">
                      <Search className="w-6 h-6 text-slate-400 dark:text-[#838383]" />
                    </div>
                    <p className="font-medium text-slate-700 dark:text-[#c3c3c3]">No delegated  yet</p>
                    <p className="text-sm">Search for a task above or create a custom delegation.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        
        {visibleCount < visibleGroups.length && (
          <div className="flex justify-center p-6 border-t border-slate-200 dark:border-[#444446]">
            <button
              onClick={() => setVisibleCount(prev => prev + 20)}
              className="px-6 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 font-bold rounded-full shadow-sm transition-colors text-sm"
            >
              Load More Tasks ({visibleGroups.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>

      {/* Mobile Vertical View */}
      <div className="lg:hidden flex flex-col flex-grow overflow-y-auto bg-slate-50 dark:bg-[#1e1e20]/50 p-3 md:p-6 [-webkit-overflow-scrolling:touch]">
        <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 md:gap-6">
          {visibleGroups.length > 0 && (
            <div className="flex justify-end">
              <button 
                onClick={handleToggleAllGroups} 
                className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-[#a3a3a3] hover:text-slate-700 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] shadow-sm px-3 py-1.5 rounded-lg transition-colors"
                title="Toggle all"
              >
                {isAllExpanded ? (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    Collapse All
                  </>
                ) : (
                  <>
                    <ChevronRight className="w-3.5 h-3.5" />
                    Expand All
                  </>
                )}
              </button>
            </div>
          )}
          {visibleGroups.length === 0 ? (
            <div className="py-12 text-center text-slate-500 dark:text-[#a3a3a3] flex flex-col items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-full bg-white dark:bg-[#1e1e20] flex items-center justify-center mb-2 shadow-sm">
                <Search className="w-6 h-6 text-slate-400 dark:text-[#838383]" />
              </div>
              <p className="font-medium text-slate-700 dark:text-[#c3c3c3]">No delegated  yet</p>
              <p className="text-xs">Search above or add a custom delegation.</p>
            </div>
          ) : (
            <>
              {groupedDelegations.orderedProjects.map(({ project, groups }) => {
                const projectId = project.id || String(project.no);
                const isProjectExpanded = expandedProjects.includes(projectId);
                return (
                  <div key={`proj-${projectId}`} className="flex flex-col gap-3">
                     <div 
                        onClick={() => toggleProject(projectId)}
                        className="bg-blue-50 dark:bg-[#28282a]/70 border border-blue-200 p-3 rounded-xl shadow-sm flex items-center justify-between cursor-pointer"
                     >
                        <div className="flex flex-col gap-1 pr-4">
                           <span className="font-bold text-slate-800 dark:text-[#e3e3e3] text-sm leading-snug">{project.name}</span>
                           <span className="text-xs text-blue-700 dark:text-[#8ab4f8] font-mono">
                             {project.store ? `${project.store} - ` : ''}{project.code || '-'}
                           </span>
                           <span className="text-xs text-slate-500 dark:text-[#a3a3a3] mt-1 font-medium">
                             {groups.length} sub task(s)
                           </span>
                        </div>
                        <div className="p-1 bg-white dark:bg-[#1e1e20] rounded text-blue-600 dark:text-[#8ab4f8] shadow-sm border border-blue-100 flex-shrink-0">
                          {isProjectExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </div>
                     </div>
                     {isProjectExpanded && (
                       <div className="flex flex-col gap-3 md:pl-4 border-l-[3px] border-blue-100/50 ml-1.5 pl-2 mt-1">
                         {groups.map(group => renderMobileGroup(group))}
                       </div>
                     )}
                  </div>
                );
              })}
              
              {groupedDelegations.orphans.length > 0 && (
                <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-slate-200 dark:border-[#444446]">
                  <div className="text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase tracking-wider mb-2">Other Tasks ({groupedDelegations.orphans.length})</div>
                  {groupedDelegations.orphans.map(group => renderMobileGroup(group))}
                </div>
              )}
            </>
          )}     </div>
          
          {visibleCount < visibleGroups.length && (
            <div className="flex justify-center mt-4 mb-6">
              <button
                onClick={() => setVisibleCount(prev => prev + 20)}
                className="px-6 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 font-bold rounded-full shadow-sm transition-colors text-sm"
              >
                Load More ({visibleGroups.length - visibleCount} remaining)
              </button>
            </div>
          )}
      </div>
    </div>
  );
}

