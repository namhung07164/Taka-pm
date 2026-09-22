import React, { useState, useEffect, useRef, useLayoutEffect, useMemo, useDeferredValue } from 'react';
import { useAppStore } from "../store/useAppStore";
import { deleteStorageFiles, extractStorageUrls } from "../lib/storageUtils";

import { useEnrichedData } from '../hooks/useEnrichedData';
import { Search, Plus, Trash2, ChevronRight, ChevronDown, ChevronUp, Download, Upload, ExternalLink, Printer, Lock, Calendar, X } from 'lucide-react';
import { Project, Cost, AppUser, PermissionMatrix, AppRole } from '../types';
import { cn, formatDisplayDateMain, parseDateTime, getDefaultStoreFilter, generateId, formatCurrencyValue, getUserAllowedStores, getEffectiveStoreFilter } from '../lib/utils';
import { doc } from 'firebase/firestore';
import {    db, APP_ID , writeBatch , setDoc , deleteDoc } from "../lib/firebase";
import { undoManager } from '../lib/undoManager';
import { downloadCSV, parseCSV, generateCSV } from '../lib/csvUtils';
import { ConfirmModal } from './ConfirmModal';
import { ResizableHeader } from './ResizableHeader';
import { ColumnAdder } from './ColumnAdder';
import { FullReplaceImport } from './FullReplaceImport';
import { DebouncedSearchInput } from './DebouncedSearchInput';
import { QRCodeButton } from './QRCodeButton';
import { QuickNavButton } from './QuickNavButton';
import { MultiCheckboxSelect } from './MultiCheckboxSelect';
import { useLocationOptions } from '../hooks/useLocationOptions';
import { safeSetItemLocal, safeSetItemSession, safeGetItemSession } from '../lib/storage';

interface CostTabProps {
    onGoToBudget?: (code: string) => void;
  initialSearchTerm?: string;
}

function EditableCell({ 
  value, 
  type = 'text', 
  onSave, 
  canWrite, 
  isCurrency = false,
  wrap = false,
  currency = 'VND',
  jpyRate = 160,
  usdRate = 25000
}: { 
  value: any, 
  type?: string, 
  onSave: (val: any) => void, 
  canWrite: boolean, 
  isCurrency?: boolean,
  wrap?: boolean,
  currency?: 'VND' | 'JPY' | 'USD',
  jpyRate?: number,
  usdRate?: number
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(value || '');

  useEffect(() => {
    setVal(value || '');
  }, [value]);

  const handleBlur = () => {
    setIsEditing(false);
    const newVal = type === 'number' ? Number(val) : val;
    if (newVal !== value) {
      onSave(newVal);
    }
  };

  const displayValue = isCurrency 
    ? (value === null || value === undefined ? '-' : formatCurrencyValue(value, currency, jpyRate, usdRate))
    : (value || '-');

  const isMoneyLocked = isCurrency && currency !== 'VND';
  const effectiveCanWrite = canWrite && !isMoneyLocked;

  if (!effectiveCanWrite) {
    return (
      <span 
        title={isMoneyLocked ? `Editing locked in ${currency}. Switch to VND to edit.` : undefined}
        className={cn(wrap ? "break-words whitespace-pre-wrap" : "", isMoneyLocked ? "cursor-not-allowed select-text opacity-95 text-slate-700 dark:text-[#c3c3c3]" : "")}
      >
        {displayValue}
      </span>
    );
  }

  if (isEditing) {
    if (wrap && type === 'text') {
      return (
        <textarea
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={handleBlur}
          className="w-full bg-white dark:bg-[#1e1e20] border border-blue-400 rounded px-1 py-0.5 outline-none text-inherit font-inherit text-slate-900 dark:text-[#e3e3e3] min-h-[60px] resize-y"
        />
      );
    }
    return (
      <input
        autoFocus
        type={type}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className="w-full bg-white dark:bg-[#1e1e20] border border-blue-400 rounded px-1 py-0.5 outline-none text-inherit font-inherit text-slate-900 dark:text-[#e3e3e3]"
      />
    );
  }

  return (
    <div 
      onClick={() => setIsEditing(true)} 
      className={cn("cursor-pointer hover:bg-slate-100 dark:hover:bg-[#28282a] px-1 py-0.5 rounded border border-transparent hover:border-slate-200 min-h-[24px]", wrap ? "break-words whitespace-pre-wrap" : "truncate")}
    >
      {displayValue}
    </div>
  );
}

const AVAILABLE_COLUMNS = [
  { id: 'no', label: 'No.' },
  { id: 'year', label: 'Year' },
  { id: 'store', label: 'Store' },
  { id: 'code', label: 'Code' },
  { id: 'projectName', label: 'Project Name' },
  { id: 'actual', label: 'Act/Forecast' },
  { id: 'firstPaid', label: '1st Paid' },
  { id: 'secondPaid', label: '2nd Paid' },
  { id: 'thirdPaid', label: '3rd Paid' },
  { id: 'balance', label: 'Balance' },
  { id: 'supportingFee', label: 'Supporting Fee' },
  { id: 'description', label: 'Description' },
  { id: 'vendor', label: 'Vendor' },
  { id: 'action', label: 'Action' }
];

export function CostTab({ initialSearchTerm = '', onGoToBudget }: CostTabProps) {

  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);
  const theme = useAppStore(state => state.theme);
  const appUsers = useAppStore(state => state.appUsers);
  const subAppUsers = useAppStore(state => state.subAppUsers);
  const parties = useAppStore(state => state.parties);
  const currency = useAppStore(state => state.currency);
  const jpyRate = useAppStore(state => state.jpyRate);
  const usdRate = useAppStore(state => state.usdRate);

  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const setGlobalYearFilter = useAppStore(state => state.setGlobalYearFilter);
  const globalStoreFilter = useAppStore(state => state.globalStoreFilter);
  const setGlobalStoreFilter = useAppStore(state => state.setGlobalStoreFilter);
  const globalLocationFilter = useAppStore(state => state.globalLocationFilter);
  const setGlobalLocationFilter = useAppStore(state => state.setGlobalLocationFilter);
  const setDetailTabFilterCode = useAppStore(state => state.setDetailTabFilterCode);
  const setDetailTabStoreFilter = useAppStore(state => state.setDetailTabStoreFilter);
  const setActiveTab = useAppStore(state => state.setActiveTab);
  const costTabSearchTerm = useAppStore(state => state.costTabSearchTerm);

  const handleProjectLinkClick = (p: Project) => {
    if (!p) return;
    setDetailTabFilterCode(p.code);
    setDetailTabStoreFilter(p.store || "all");
    if (p.year) {
      setGlobalYearFilter(String(p.year));
      safeSetItemSession("taka_detail_year", String(p.year));
    } else {
      setGlobalYearFilter("all");
      safeSetItemSession("taka_detail_year", "all");
    }
    if (p.store) {
      setGlobalStoreFilter(p.store);
      safeSetItemLocal(`taka_store_filter_${currentUser.id}`, String(p.store));
    } else {
      setGlobalStoreFilter("all");
      safeSetItemLocal(`taka_store_filter_${currentUser.id}`, "all");
    }
    setActiveTab("detail");
  };

  // Use global costs from Zustand store (Zero Redundant Reads)
  const costs = useAppStore(state => state.costs);
  const setIsCostsRequested = useAppStore(state => state.setIsCostsRequested);

  useEffect(() => {
    setIsCostsRequested(true);
  }, [setIsCostsRequested]);

  // Clean up link cost when unmounting / leaving CostTab

  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || costTabSearchTerm || '');
  const deferredSearchTerm = useDeferredValue(searchTerm);

  useEffect(() => {
    if (initialSearchTerm) {
      setSearchTerm(initialSearchTerm);
    } else if (costTabSearchTerm) {
      setSearchTerm(costTabSearchTerm);
    }
  }, [initialSearchTerm, costTabSearchTerm]);

  const [hasActForcFilter, setHasActForcFilter] = useState(() => {
    if ((initialSearchTerm || '').trim()) return 'all';
    return safeGetItemSession("taka_cost_act_forc_filter") || 'has_value';
  });
  const lastSelectedActForcFilterRef = useRef<string>(
    safeGetItemSession("taka_cost_act_forc_filter") || 'has_value'
  );
  const wasSearchingRef = useRef<boolean>(!!(initialSearchTerm || '').trim());

  useEffect(() => {
    const isSearching = !!searchTerm.trim();
    if (!wasSearchingRef.current && isSearching) {
      if (hasActForcFilter !== 'all') {
        lastSelectedActForcFilterRef.current = hasActForcFilter;
        safeSetItemSession("taka_cost_act_forc_filter", hasActForcFilter);
      }
      setHasActForcFilter('all');
      wasSearchingRef.current = true;
    } else if (wasSearchingRef.current && !isSearching) {
      const restored = lastSelectedActForcFilterRef.current || safeGetItemSession("taka_cost_act_forc_filter") || 'has_value';
      setHasActForcFilter(restored);
      wasSearchingRef.current = false;
    }
  }, [searchTerm]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(AVAILABLE_COLUMNS.map(c => c.id));
  const [expandedCodes, setExpandedCodes] = useState<string[]>([]);
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const [isPaidDateFilterOpen, setIsPaidDateFilterOpen] = useState<boolean>(false);
  const [paidDateStart, setPaidDateStart] = useState<string>('');
  const [paidDateEnd, setPaidDateEnd] = useState<string>('');
  const [paidStageFilter, setPaidStageFilter] = useState<'all' | '1st' | '2nd' | '3rd'>('all');

  // Temporary draft state for start and end dates with debounce and Enter commit to eliminate lag
  const [tempDateStart, setTempDateStart] = useState<string>('');
  const [tempDateEnd, setTempDateEnd] = useState<string>('');
  const debounceTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const commitDateFilter = (newStart?: string, newEnd?: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const s = newStart !== undefined ? newStart : tempDateStart;
    const e = newEnd !== undefined ? newEnd : tempDateEnd;
    setPaidDateStart(s);
    setPaidDateEnd(e);
  };

  const scheduleDebouncedDateCommit = (newStart: string, newEnd: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setPaidDateStart(newStart);
      setPaidDateEnd(newEnd);
    }, 500);
  };

  const handleTempStartChange = (val: string) => {
    setTempDateStart(val);
    scheduleDebouncedDateCommit(val, tempDateEnd);
  };

  const handleTempEndChange = (val: string) => {
    setTempDateEnd(val);
    scheduleDebouncedDateCommit(tempDateStart, val);
  };

  const handleClearPaidDateFilter = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setTempDateStart('');
    setTempDateEnd('');
    setPaidDateStart('');
    setPaidDateEnd('');
    setPaidStageFilter('all');
  };

  const checkDateInRange = (dateVal: string | undefined, start: string, end: string) => {
    if (!dateVal) return false;
    const s = String(dateVal).trim();
    if (!s) return false;
    let isoDate = s.substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      const parsed = parseDateTime(s);
      if (!parsed || isNaN(parsed.getTime())) return false;
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      isoDate = `${y}-${m}-${d}`;
    }
    if (start && isoDate < start) return false;
    if (end && isoDate > end) return false;
    return true;
  };

  const getCostPaidMatches = (c: Cost, start: string, end: string, stage: 'all' | '1st' | '2nd' | '3rd') => {
    if (!start && !end) {
      return { matches: true, firstMatch: false, secondMatch: false, thirdMatch: false };
    }
    const firstMatch = checkDateInRange(c.firstPaidAt, start, end);
    const secondMatch = checkDateInRange(c.secondPaidAt, start, end);
    const thirdMatch = checkDateInRange(c.thirdPaidAt, start, end);

    let matches = false;
    if (stage === '1st') matches = firstMatch;
    else if (stage === '2nd') matches = secondMatch;
    else if (stage === '3rd') matches = thirdMatch;
    else matches = firstMatch || secondMatch || thirdMatch;

    return { matches, firstMatch, secondMatch, thirdMatch };
  };

  const [colWidths, setColWidths] = useState({
    no: 64,
    year: 80,
    store: 80,
    code: 128,
    projectName: 192,
    actual: 128,
    firstPaid: 128,
    secondPaid: 128,
    thirdPaid: 128,
    balance: 128,
    supportingFee: 128,
    description: 256,
    vendor: 192,
    action: 96
  });

  useEffect(() => {
    const saved = localStorage.getItem(`taka_cost_col_widths_${currentUser.id}`);
    if (saved) {
      try {
        setColWidths(JSON.parse(saved));
      } catch (e) { console.error(e); }
    }
    
    const savedCols = localStorage.getItem(`taka_cost_visible_cols_${currentUser.id}`);
    if (savedCols) {
      try {
        let parsed = JSON.parse(savedCols);
        if (!parsed.includes('action')) parsed.push('action');
        setVisibleColumns(parsed);
      } catch (e) { console.error(e); }
    }
  }, [currentUser.id]);

  const handleResize = (col: keyof typeof colWidths, newWidth: number) => {
    setColWidths(prev => {
      const next = { ...prev, [col]: newWidth };
      localStorage.setItem(`taka_cost_col_widths_${currentUser.id}`, JSON.stringify(next));
      return next;
    });
  };

  const handleToggleColumn = (colId: string) => {
    setVisibleColumns(prev => {
      const next = prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId];
      localStorage.setItem(`taka_cost_visible_cols_${currentUser.id}`, JSON.stringify(next));
      return next;
    });
  };



  const isAdmin = currentUser.role === 'admin';
  const role = currentUser.role as AppRole;
  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const canWrite = (isAdmin || !!permissionMatrix[role]?.Write?.costDetail) && !isArchiveYear;

  const years = [...new Set([...projects.map(p=> {
    if (p.year) return String(p.year).trim();
    if (p.start) return String(p.start).substring(0, 4);
    return null;
  }).filter(Boolean), '2026', '2027'])].sort();

  const allowedStores = useMemo(() => getUserAllowedStores(currentUser), [currentUser]);
  const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
  const stores = allowedStores;
  const locationOptions = useLocationOptions();
  

  const toggleGroup = (id: string | number) => {
    const code = String(id);
    setExpandedCodes(prev => 
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleAddCost = async (project: Project) => {
    if (!canWrite) {
      return;
    }
    const derivedYear = project.year ? project.year : (project.start ? Number(String(project.start).substring(0, 4)) : undefined);

    const newCost: Cost = {
      id: generateId(),
      projectCode: project.code || '',
      actual: 0,
      firstPaid: 0,
      secondPaid: 0,
      thirdPaid: 0,
      supportingFee: 0,
      description: 'New Cost Entry',
      vendor: '',
      updatedAt: new Date().toISOString()
    };
    
    if (derivedYear !== undefined && derivedYear !== null && !isNaN(Number(derivedYear))) {
      newCost.projectYear = derivedYear;
    }
    if (project.store !== undefined && project.store !== null) newCost.projectStore = project.store;
    
    // Safety check: remove ANY undefined values to prevent Firestore crash
    Object.keys(newCost).forEach(key => {
      if ((newCost as any)[key] === undefined) {
        delete (newCost as any)[key];
      }
    });

    try {
      setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', newCost.id), newCost);
      const groupKey = `${project.code}-${derivedYear}-${project.store}-${project.no}`;
      setExpandedCodes(prev => {
        const next = [...prev];
        if (!next.includes(groupKey)) next.push(groupKey);
        if (!next.includes(String(project.no))) next.push(String(project.no));
        return next;
      });
      
      undoManager.push({
        description: `Add Cost to ${project.code} (${derivedYear})`,
        revert: async () => {
          deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', newCost.id));
        }
      });
    } catch (e) { 
      console.error('[CostTab] Error saving cost:', e);
    }
  };

  const handleDeleteCost = async (c: Cost) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Cost',
      message: 'Delete this Cost?',
      onConfirm: async () => {
        try {
          const nowIso = new Date().toISOString();
          const batch = writeBatch(db);
          batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id), { id: c.id, isDeleted: true, updatedAt: nowIso }, { merge: true });
          
          const urlsToDelete = extractStorageUrls(c);
          if (urlsToDelete.length > 0) {
             deleteStorageFiles(urlsToDelete).catch(console.error);
          }
          await batch.commit();

          undoManager.push({
            description: `Delete Cost`,
            revert: async () => {
              setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id), c);
            }
          });
        } catch (e) {
          console.error(e);
        }      }
    });
  };

  const handleUpdateCost = async (c: Cost, field: keyof Cost, value: any) => {
    try {
      const updates: any = { [field]: value, updatedAt: new Date().toISOString() };
      
      if (field === 'firstPaid') updates.firstPaidAt = new Date().toISOString();
      if (field === 'secondPaid') updates.secondPaidAt = new Date().toISOString();
      if (field === 'thirdPaid') updates.thirdPaidAt = new Date().toISOString();

      const newCostData = { ...c, ...updates };
      if (newCostData.projectYear !== undefined && newCostData.projectYear !== null && newCostData.projectYear !== '' && !isNaN(Number(newCostData.projectYear))) {
        newCostData.projectYear = Number(newCostData.projectYear);
      }
      
      Object.keys(newCostData).forEach(key => {
        if ((newCostData as any)[key] === undefined) {
          delete (newCostData as any)[key];
        }
      });

      // Optimistically update the UI to prevent input lag
      useAppStore.getState().optimisticUpdateCosts([newCostData]);

      setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id), newCostData);
      
      undoManager.push({
        description: `Update Cost: ${field}`,
        revert: async () => {
          useAppStore.getState().optimisticUpdateCosts([c]);
          setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id), c);
        }
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleExportCosts = () => {
    const headers = ['store', 'location', 'projectYear', 'projectCode', 'budget', 'actual', 'firstPaid', 'firstPaidAt', 'secondPaid', 'secondPaidAt', 'thirdPaid', 'thirdPaidAt', 'supportingFee', 'description', 'vendor'];
    const data = filteredCostsForTotals.map(c => {
      const p = projects.find(proj => 
        String(proj.code).trim().toLowerCase() === String(c.projectCode).trim().toLowerCase() &&
        (String(proj.year || '') === String(c.projectYear || '') || (!proj.year && !c.projectYear))
      );
      return [
        p?.store || '',
        p?.location || '',
        c.projectYear || p?.year || '',
        c.projectCode, 
        p?.budget || 0,
        c.actual || 0, 
        c.firstPaid || 0, 
        c.firstPaidAt || '', 
        c.secondPaid || 0, 
        c.secondPaidAt || '', 
        c.thirdPaid || 0, 
        c.thirdPaidAt || '', 
        c.supportingFee || 0, 
        c.description || '', 
        c.vendor || ''
      ];
    });
    const csv = generateCSV(headers, data);
    downloadCSV(csv, 'taka_costs_filtered.csv');
  };

  const handleImportCosts = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length < 2) {
          useAppStore.getState().setToast({ title: "Thông báo", message: String('CSV file is empty or has no data rows.') });
          return;
        }

        const headers = rows[0].map(h => h.trim().toLowerCase());
        const dataRows = rows.slice(1);
        
        // Required Field Validation
        let hasError = false;
        let errorMsg = '';
        for (let idx = 0; idx < dataRows.length; idx++) {
          const row = dataRows[idx];
          if (row.every(c => !String(c).trim())) continue;
          
          let hasYear = false, hasStore = false, hasCode = false;
          headers.forEach((h, i) => {
            const val = String(row[i] || '').trim();
            if ((h === 'year' || h === 'projectyear') && val) hasYear = true;
            if ((h === 'store' || h === 'projectstore') && val) hasStore = true;
            if ((h === 'code' || h === 'projectcode') && val) hasCode = true;
          });
          
          if (!hasYear || !hasStore || !hasCode) {
            hasError = true;
            errorMsg = `Row ${idx + 2} is missing Year, Store, or Code. All imported data must include these three fields.`;
            break;
          }
        }
        
        if (hasError) {
          useAppStore.getState().setToast({ title: "Thông báo", message: String('Import failed: ' + errorMsg) });
          return;
        }

        const parseCSVNumber = (val: any) => {
          if (typeof val === 'string') {
            const cleaned = val.replace(/,/g, '').trim();
            if (cleaned === '-' || cleaned === '') return 0;
            const num = Number(cleaned);
            return isNaN(num) ? 0 : num;
          }
          return Number(val) || 0;
        };

        let importCount = 0;
        const processedCosts = new Map<string, Cost>();
        costs.forEach(c=> {
          if (c.projectCode) {
            // Create a unique key for matching existing  if ID is not provided
            const key = `${String(c.projectCode).trim().toLowerCase()}_${String(c.projectYear || '').trim().toLowerCase()}_${String(c.projectStore || '').trim().toLowerCase()}_${String(c.description || '').trim().toLowerCase()}_${String(c.vendor || '').trim().toLowerCase()}`;
            processedCosts.set(key, c);
            if (c.id) {
              processedCosts.set(c.id, c);
            }
          }
        });

        const previousStates = new Map<string, any>();
        const newIds = new Set<string>();
        const previousProjectBudgets = new Map<string, number | undefined>();

        for (const row of dataRows) {
          if (row.length < headers.length) continue;

          const c: any = {};
          headers.forEach((h, i) => {
            let val: any = row[i];
            if (h === 'budget' || h === 'actual' || h === 'firstpaid' || h === 'secondpaid' || h === 'thirdpaid' || h === 'supportingfee') {
              val = parseCSVNumber(val);
            }
            // map back to original camelCase keys if needed
            const keyMap: Record<string, string> = {
              'projectcode': 'projectCode',
              'projectyear': 'projectYear',
              'year': 'projectYear',
              'projectstore': 'projectStore',
              'store': 'projectStore',
              'firstpaid': 'firstPaid',
              'firstpaidat': 'firstPaidAt',
              'secondpaid': 'secondPaid',
              'secondpaidat': 'secondPaidAt',
              'thirdpaid': 'thirdPaid',
              'thirdpaidat': 'thirdPaidAt',
              'supportingfee': 'supportingFee'
            };
            const mappedKey = keyMap[h] || h;
            c[mappedKey] = val;
          });
          
          if (c.projectCode) {
            // Deduce projectYear if missing
            if (!c.projectYear || !c.projectStore) {
              const possibleProjects = projects.filter(p=> String(p.code).trim().toLowerCase() === String(c.projectCode).trim().toLowerCase());
              if (possibleProjects.length === 1) {
                if (!c.projectYear) c.projectYear = possibleProjects[0].year;
                if (!c.projectStore) c.projectStore = possibleProjects[0].store;
              }
            }
            // Handle budget update for the project
            if (c.budget !== undefined && c.budget > 0) {
              const project = projects.find(p=> 
                String(p.code).trim().toLowerCase() === String(c.projectCode).trim().toLowerCase() &&
                (String(p.year || '') === String(c.projectYear || '') || (!p.year && !c.projectYear)) &&
                (String(p.store || '') === String(c.projectStore || '') || (!p.store && !c.projectStore))
              );
              if (project && (!project.budget || project.budget === 0)) {
                if (!previousProjectBudgets.has(String(project.no))) {
                  previousProjectBudgets.set(String(project.no), project.budget);
                }
                try {
                  setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', String(project.no)), {
                    budget: c.budget,
                    updatedAt: new Date().toISOString()
                  }, { merge: true });
                } catch (err) {
                  console.error('Error updating project budget during cost import:', err);
                }
              }
            }

            let existingCost = null;
            if (c.id && processedCosts.has(c.id)) {
              existingCost = processedCosts.get(c.id);
            } else {
              const key = `${String(c.projectCode).trim().toLowerCase()}_${String(c.projectYear || '').trim().toLowerCase()}_${String(c.projectStore || '').trim().toLowerCase()}_${String(c.description || '').trim().toLowerCase()}_${String(c.vendor || '').trim().toLowerCase()}`;
              existingCost = processedCosts.get(key);
            }

            const id = existingCost ? existingCost.id : (c.id || generateId());
            
            if (existingCost) {
              if (!previousStates.has(id)) {
                previousStates.set(id, existingCost);
              }
            } else {
              newIds.add(id);
            }

            c.id = id;
            if (!c.updatedAt) c.updatedAt = new Date().toISOString();
            
            // Remove fields that don't belong to the Cost object before saving
            const costToSave = existingCost ? { ...existingCost, ...c } : { ...c };
            if (costToSave.projectYear !== undefined && costToSave.projectYear !== null && costToSave.projectYear !== '' && !isNaN(Number(costToSave.projectYear))) {
              costToSave.projectYear = Number(costToSave.projectYear);
            }
            delete costToSave.budget;

            // Remove undefined values before saving to Firestore
            Object.keys(costToSave).forEach(key => {
              if (costToSave[key] === undefined) {
                delete costToSave[key];
              }
            });
            
            setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', id), costToSave);
            importCount++;
          }
        }
        
        if (importCount > 0) {
          undoManager.push({
            description: 'Import Costs',
            revert: async () => {
              const batch = writeBatch(db);
              previousStates.forEach((oldData, id) => {
                batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', id), oldData);
              });
              newIds.forEach(id => {
                batch.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', id));
              });
              previousProjectBudgets.forEach((oldBudget, projectNo) => {
                batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', projectNo), { budget: oldBudget || 0 });
              });
              try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }
            }
          });
        }
        
        useAppStore.getState().setToast({ title: "Notice", message: String(`Import Costs completed! Processed ${importCount} records.`) });
      } catch (err) {
        console.error('Import error:', err);
        useAppStore.getState().setToast({ title: "Error", message: String('Error importing CSV: ' + (err instanceof Error ? err.message : String(err))) });
      }
    };
    reader.readAsText(file);
  };

  const formatCurrency = (val: number | undefined) => {
    return formatCurrencyValue(val, currency, jpyRate, usdRate);
  };

  const filteredProjectsForDisplay = useMemo(() => {

    return projects.filter(p=> {
      const pYear = p.year ? String(p.year).trim() : (p.start ? String(p.start).substring(0, 4) : null);
      if (globalYearFilter !== 'all' && pYear !== globalYearFilter) return false;
      if (effectiveStore !== 'all' && p.store !== effectiveStore) return false;
      if (globalLocationFilter.length > 0 && (!p.location || !globalLocationFilter.includes(p.location))) return false;

      const groupCosts = costs.filter(c => {
        const costCode = String(c.projectCode || (c as any).code || '').trim().toLowerCase();
        const pCode = String(p.code || '').trim().toLowerCase();
        if (costCode !== pCode) return false;

        const costYear = String(c.projectYear || (c as any).year || '').trim();
        const pYear = String(p.year || (p.start ? String(p.start).substring(0, 4) : '')).trim();
        const matchesYear = !costYear || !pYear || costYear === pYear;
        if (!matchesYear) return false;

        const costStore = String(c.projectStore || (c as any).store || '').trim().toLowerCase();
        const pStore = String(p.store || '').trim().toLowerCase();
        const matchesStore = !costStore || !pStore || costStore === pStore;
        if (!matchesStore) return false;

        return true;
      });

      if (paidDateStart || paidDateEnd) {
        const hasMatchingPaidCost = groupCosts.some(c => getCostPaidMatches(c, paidDateStart, paidDateEnd, paidStageFilter).matches);
        if (!hasMatchingPaidCost) return false;
      }

      const matchingGroupCosts = (paidDateStart || paidDateEnd)
        ? groupCosts.filter(c => getCostPaidMatches(c, paidDateStart, paidDateEnd, paidStageFilter).matches)
        : groupCosts;

      if (deferredSearchTerm) {
        const term = deferredSearchTerm.toLowerCase();
        const projectFields = [p.store, p.location, p.year, p.code, p.name];
        const projectMatches = projectFields.some(val => String(val || "").toLowerCase().includes(term));
        
        const costMatches = matchingGroupCosts.some(c => {
          const cBalance = (c.actual || 0) - (c.firstPaid || 0) - (c.secondPaid || 0) - (c.thirdPaid || 0);
          const costFields = [c.description, c.vendor, c.actual, c.firstPaid, c.secondPaid, c.thirdPaid, c.supportingFee, cBalance];
          return costFields.some(val => String(val || "").toLowerCase().includes(term));
        });

        if (!projectMatches && !costMatches) {
          return false;
        }
      }

      const totalAct = matchingGroupCosts.reduce((sum, c) => sum + (c.actual || 0), 0);
      if (hasActForcFilter === 'has_value' && totalAct === 0 && (!paidDateStart && !paidDateEnd)) return false;

      return true;
    });
  }, [projects, costs, globalYearFilter, effectiveStore, globalLocationFilter, deferredSearchTerm, hasActForcFilter, paidDateStart, paidDateEnd, paidStageFilter]);

  const filteredCostsForTotals = useMemo(() => {
    const includedKeys = new Set(filteredProjectsForDisplay.map(p => {
      const pDerivedYear = p.year ? p.year : (p.start ? Number(String(p.start).substring(0, 4)) : undefined);
      return `${String(p.code).trim().toLowerCase()}-${String(pDerivedYear||'').trim()}-${String(p.store||'').trim().toLowerCase()}`;
    }));
    return costs.filter(c=> {
      const cCode = String(c.projectCode || '').trim().toLowerCase();
      const cYear = String(c.projectYear || '').trim();
      const cStore = String(c.projectStore || '').trim().toLowerCase();
      const cProjMatched = projects.find(proj => {
        const projDerivedYear = proj.year ? proj.year : (proj.start ? Number(String(proj.start).substring(0, 4)) : undefined);
        return String(proj.code).trim().toLowerCase() === cCode &&
          (String(projDerivedYear || '').trim() === cYear || (!String(projDerivedYear||'').trim() && !cYear)) &&
          (!cStore || !String(proj.store || '').trim().toLowerCase() || String(proj.store || '').trim().toLowerCase() === cStore);
      });
      if (!cProjMatched) return false;
      const projDerivedYear = cProjMatched.year ? cProjMatched.year : (cProjMatched.start ? Number(String(cProjMatched.start).substring(0, 4)) : undefined);
      const isIncluded = includedKeys.has(`${String(cProjMatched.code).trim().toLowerCase()}-${String(projDerivedYear||'').trim()}-${String(cProjMatched.store||'').trim().toLowerCase()}`);
      if (!isIncluded) return false;

      if (paidDateStart || paidDateEnd) {
        return getCostPaidMatches(c, paidDateStart, paidDateEnd, paidStageFilter).matches;
      }
      return true;
    });
  }, [costs, projects, filteredProjectsForDisplay, paidDateStart, paidDateEnd, paidStageFilter]);

  const totalActAll = filteredCostsForTotals.reduce((sum, c) => sum + (c.actual || 0), 0);
  const totalFirstPaidAll = filteredCostsForTotals.reduce((sum, c) => sum + (c.firstPaid || 0), 0);
  const totalSecondPaidAll = filteredCostsForTotals.reduce((sum, c) => sum + (c.secondPaid || 0), 0);
  const totalThirdPaidAll = filteredCostsForTotals.reduce((sum, c) => sum + (c.thirdPaid || 0), 0);
  const totalBalanceAll = filteredCostsForTotals.reduce((sum, c) => sum + ((c.actual || 0) - (c.firstPaid || 0) - (c.secondPaid || 0) - (c.thirdPaid || 0)), 0);
  const totalSupAll = filteredCostsForTotals.reduce((sum, c) => sum + (c.supportingFee || 0), 0);
  const totalBudgetAll = filteredProjectsForDisplay.reduce((sum, p) => sum + (Number(p.financial?.totalApproved || p.budget) || 0), 0);
  const totalRemainingAll = filteredProjectsForDisplay.reduce((sum, p) => {
    const pDerivedYear = p.year ? p.year : (p.start ? Number(String(p.start).substring(0, 4)) : undefined);
    const projectCosts = costs.filter(c => 
       String(c.projectCode).trim().toLowerCase() === String(p.code).trim().toLowerCase() &&
       (String(c.projectYear || '') === String(pDerivedYear || '') || (!c.projectYear && !pDerivedYear)) &&
       (String(c.projectStore || '') === String(p.store || '') || (!c.projectStore && !p.store))
    );
    const hasCosts = projectCosts.length > 0;
    const computedActual = projectCosts.reduce((s, c) => s + (Number(c.actual) || 0), 0);
    const computedSup = projectCosts.reduce((s, c) => s + (Number(c.supportingFee) || 0), 0);
    
    const fin = p.financial || { totalApproved: p.budget || 0, totalActualPaid: p.actual || 0 };
    const finalActual = hasCosts ? computedActual : (fin.totalActualPaid || p.actual || 0);
    const finalSup = hasCosts ? computedSup : (p.supportingFee || 0);
    const finalBudget = fin.totalApproved || p.budget || 0;
    
    return sum + (finalBudget - finalActual + finalSup);
  }, 0);

  const sortedProjects = projects;

  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
    if (paidDateStart || paidDateEnd) {
      setExpandedCodes(filteredProjectsForDisplay.map(p => `${p.code}-${p.year}-${p.store}-${p.no}`));
    }
  }, [paidDateStart, paidDateEnd, paidStageFilter]);

  const toggleAll = () => {
    if (expandedCodes.length === 0) {
      setExpandedCodes(filteredProjectsForDisplay.map(p => `${p.code}-${p.year}-${p.store}-${p.no}`));
    } else {
      setExpandedCodes([]);
    }
  };

  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm">
      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
      <div className="px-3 sm:px-4 md:px-5 py-3 md:py-4 border-b border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 flex flex-col xl:flex-row gap-3 justify-between items-stretch xl:items-center shrink-0 print:hidden">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full xl:w-auto flex-grow min-w-0">
          <select 
            value={globalYearFilter}
            onChange={(e) => setGlobalYearFilter(e.target.value)}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[85px] sm:min-w-[95px] flex-1 sm:flex-none"
          >
            <option value="all">All Years</option>
            {years.map(y => <option key={y} value={y}>Year {y}</option>)}
          </select>
          <select 
            value={effectiveStore}
            onChange={(e) => setGlobalStoreFilter(e.target.value)}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[85px] sm:min-w-[95px] flex-1 sm:flex-none"
          >
            {stores.length > 1 && <option value="all">All Stores</option>}
            {stores.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <MultiCheckboxSelect 
            value={globalLocationFilter}
            onChange={setGlobalLocationFilter}
            options={locationOptions}
            placeholder="All Locations"
            className="min-w-[95px] sm:min-w-[100px] flex-1 sm:flex-none"
          />
          <select 
            value={hasActForcFilter}
            onChange={(e) => {
              const val = e.target.value;
              setHasActForcFilter(val);
              if (!searchTerm.trim()) {
                lastSelectedActForcFilterRef.current = val;
                safeSetItemSession("taka_cost_act_forc_filter", val);
              }
            }}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[95px] sm:min-w-[100px] flex-1 sm:flex-none"
          >
            <option value="all">All Act/Forc</option>
            <option value="has_value">Has Act/Forc</option>
          </select>

          <div className="relative flex-grow min-w-[140px] sm:min-w-[180px] max-w-full">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400 dark:text-[#838383] z-10">
              <Search className="w-4 h-4" />
            </div>
            <DebouncedSearchInput 
              value={searchTerm}
              onChange={(val) => setSearchTerm(val)}
              className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block w-full pl-9 pr-3 p-2 outline-none shadow-sm" 
              placeholder="Search in cost details..."
            />
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0 self-end xl:self-center">
          <ColumnAdder 
            availableColumns={AVAILABLE_COLUMNS} 
            visibleColumns={visibleColumns} 
            onAddColumn={handleToggleColumn} 
          />
          {canWrite && (
            <div className="flex gap-1 items-center">
              {currentUser.role === 'admin' && (
                <FullReplaceImport 
                  collectionName="taka_costs"
                  onImportSuccess={(count) => useAppStore.getState().setToast({ title: "Notice", message: String(`Full replace successful! Imported ${count} cost entries.`) })}
                  onParseRow={(row, headers) => {
                    const c: any = {};
                    const parseCSVNumber = (val: any) => {
                      if (typeof val === 'string') {
                        const cleaned = val.replace(/,/g, '').trim();
                        if (cleaned === '-' || cleaned === '') return 0;
                        const num = Number(cleaned);
                        return isNaN(num) ? 0 : num;
                      }
                      return Number(val) || 0;
                    };

                    headers.forEach((h, i) => {
                      const keyMap: Record<string, string> = {
                        'projectcode': 'projectCode',
                        'projectyear': 'projectYear',
                        'year': 'projectYear',
                        'projectstore': 'projectStore',
                        'store': 'projectStore',
                        'firstpaid': 'firstPaid',
                        'firstpaidat': 'firstPaidAt',
                        'secondpaid': 'secondPaid',
                        'secondpaidat': 'secondPaidAt',
                        'thirdpaid': 'thirdPaid',
                        'thirdpaidat': 'thirdPaidAt',
                        'supportingfee': 'supportingFee'
                      };
                      const field = keyMap[h] || h;
                      let val: any = row[i];
                      if (['actual', 'firstPaid', 'secondPaid', 'thirdPaid', 'supportingFee'].includes(field)) {
                        val = parseCSVNumber(val);
                      }
                      if (['projectYear'].includes(field)) {
                        val = isNaN(Number(val)) ? val : Number(val);
                      }
                      c[field] = val;
                    });
                    if (!c.projectCode || !c.description) return null;
                    return c;
                  }}
                  id="cost-full-import-btn"
                  hiddenBtn={true}
                />
              )}
              <button id="cost-export-btn" onClick={handleExportCosts} className="hidden" />
              <input id="cost-import-input" type="file" accept=".csv" onChange={handleImportCosts} className="hidden" />
            </div>
          )}
        </div>
      </div>

      {/* Desktop Summary Bar */}
      <div className="hidden xl:flex items-center justify-between px-5 py-2.5 bg-indigo-50/50 dark:bg-indigo-900/10 border-b border-slate-200 dark:border-[#333336] shrink-0 print:hidden gap-4 flex-wrap">
        <div className="flex items-center gap-5">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Act/Forc</span>
            <span className="text-base font-bold text-amber-600 dark:text-amber-400">{formatCurrency(totalActAll)}</span>
          </div>
          <div className="h-8 w-px bg-slate-300 dark:bg-slate-700"></div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Balance</span>
            <span className={`text-base font-bold ${totalBalanceAll >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{formatCurrency(totalBalanceAll)}</span>
          </div>
          <div className="h-8 w-px bg-slate-300 dark:bg-slate-700"></div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Supporting Fee</span>
            <span className="text-base font-bold text-purple-600 dark:text-purple-400">{formatCurrency(totalSupAll)}</span>
          </div>
          <div className="h-8 w-px bg-slate-300 dark:bg-slate-700"></div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Remaining</span>
              <span className="text-[9px] font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 px-1.5 rounded-full">Linked from Budget</span>
            </div>
            <span className={`text-base font-black ${totalRemainingAll >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{formatCurrency(totalRemainingAll)}</span>
          </div>

          <div className="h-8 w-px bg-slate-300 dark:bg-slate-700"></div>

          {/* Filter Paid Date Button & Popover - Placed right next to Linked from Budget */}
          <div className="relative">
            <button 
              type="button"
              onClick={() => setIsPaidDateFilterOpen(prev => !prev)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all shadow-xs",
                (paidDateStart || paidDateEnd)
                  ? "bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700"
                  : "bg-white dark:bg-[#1e1e20] border-slate-200 dark:border-[#444446] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#28282a]"
              )}
              title="Filter by Paid Date range and stage"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Filter Paid Date</span>
              {(paidDateStart || paidDateEnd) && (
                <span className="bg-white/30 text-white rounded-full px-1.5 py-0.2 text-[10px] font-mono">
                  {filteredCostsForTotals.length}
                </span>
              )}
              {isPaidDateFilterOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {/* Sổ ra khi click vào nút Filter Paid Date */}
            {isPaidDateFilterOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsPaidDateFilterOpen(false)} />
                <div 
                  className="absolute left-0 top-full mt-2 z-50 w-84 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-2xl p-3 flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-2 duration-150"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-[#333336]">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                      <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>Filter Paid Date Range</span>
                    </div>
                    {(paidDateStart || paidDateEnd || tempDateStart || tempDateEnd) && (
                      <button
                        type="button"
                        onClick={handleClearPaidDateFilter}
                        className="text-[11px] font-bold text-red-500 hover:text-red-700 flex items-center gap-1"
                      >
                        <X className="w-3 h-3" /> Clear
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">Start (Từ ngày)</span>
                      <input 
                        type="date"
                        value={tempDateStart}
                        onChange={(e) => handleTempStartChange(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitDateFilter(); }}
                        onBlur={() => commitDateFilter()}
                        title="Start Date (Nhấn Enter hoặc đợi 0.5s để áp dụng)"
                        className="bg-slate-50 dark:bg-[#18181a] border border-slate-200 dark:border-[#555] text-slate-800 dark:text-slate-200 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">End (Đến ngày)</span>
                      <input 
                        type="date"
                        value={tempDateEnd}
                        onChange={(e) => handleTempEndChange(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitDateFilter(); }}
                        onBlur={() => commitDateFilter()}
                        title="End Date (Nhấn Enter hoặc đợi 0.5s để áp dụng)"
                        className="bg-slate-50 dark:bg-[#18181a] border border-slate-200 dark:border-[#555] text-slate-800 dark:text-slate-200 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">Stage (Đợt thanh toán)</span>
                    <select
                      value={paidStageFilter}
                      onChange={(e) => {
                        setPaidStageFilter(e.target.value as any);
                        commitDateFilter();
                      }}
                      className="bg-slate-50 dark:bg-[#18181a] border border-slate-200 dark:border-[#555] text-slate-800 dark:text-slate-200 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                    >
                      <option value="all">All Paid Stages (1st, 2nd, 3rd)</option>
                      <option value="1st">1st Paid only</option>
                      <option value="2nd">2nd Paid only</option>
                      <option value="3rd">3rd Paid only</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-[#333336]">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">
                      Enter hoặc đợi 0.5s để lọc
                    </span>
                    <div className="flex items-center gap-1.5">
                      {(paidDateStart || paidDateEnd) && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                          {filteredCostsForTotals.length} matching
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          commitDateFilter();
                          setIsPaidDateFilterOpen(false);
                        }}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <button 
          onClick={() => useAppStore.getState().setActiveTab('budget')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60 rounded-md transition-colors shrink-0"
        >
          View Budget Tab
        </button>
      </div>

      <div className="hidden xl:block overflow-x-auto flex-grow pb-16">
        <table className="text-sm text-left text-slate-600 dark:text-[#a3a3a3] table-fixed min-w-full" style={{ width: `${visibleColumns.reduce((acc, col) => acc + (colWidths[col as keyof typeof colWidths] || 100), 0)}px` }}>
          <thead className="text-xs text-slate-500 dark:text-[#a3a3a3] uppercase bg-slate-50 dark:bg-[#1e1e20]/50 sticky top-0 border-b border-slate-200 dark:border-[#444446] z-10 shadow-sm">
            <tr>
              {visibleColumns.includes('no') && (
                <ResizableHeader width={colWidths.no} onResize={(w) => handleResize('no', w)} className="px-4 py-3 font-bold text-center" hideable onHide={() => handleToggleColumn('no')}>
                  <div className="flex items-center justify-center gap-1">
                    No.
                    <button onClick={() => setExpandedCodes(expandedCodes.length === 0 ? sortedProjects.map(p => String(p.no)) : [])} className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-blue-600 dark:text-[#8ab4f8]">
                      {expandedCodes.length === 0 ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </ResizableHeader>
              )}
              {visibleColumns.includes('year') && <ResizableHeader width={colWidths.year} onResize={(w) => handleResize('year', w)} className="px-4 py-3 font-bold" hideable onHide={() => handleToggleColumn('year')}>Year</ResizableHeader>}
              {visibleColumns.includes('store') && <ResizableHeader width={colWidths.store} onResize={(w) => handleResize('store', w)} className="px-4 py-3 font-bold" hideable onHide={() => handleToggleColumn('store')}>Store</ResizableHeader>}
              {visibleColumns.includes('code') && <ResizableHeader width={colWidths.code} onResize={(w) => handleResize('code', w)} className="px-4 py-3 font-bold" hideable onHide={() => handleToggleColumn('code')}>Code</ResizableHeader>}
              {visibleColumns.includes('projectName') && <ResizableHeader width={colWidths.projectName} onResize={(w) => handleResize('projectName', w)} className="px-4 py-3 font-bold" hideable onHide={() => handleToggleColumn('projectName')}>Project Name</ResizableHeader>}
              {visibleColumns.includes('actual') && <ResizableHeader width={colWidths.actual} onResize={(w) => handleResize('actual', w)} className="px-4 py-3 font-bold text-right" hideable onHide={() => handleToggleColumn('actual')}>Act/Forecast</ResizableHeader>}
              {visibleColumns.includes('firstPaid') && <ResizableHeader width={colWidths.firstPaid} onResize={(w) => handleResize('firstPaid', w)} className="px-4 py-3 font-bold text-right" hideable onHide={() => handleToggleColumn('firstPaid')}>1st Paid</ResizableHeader>}
              {visibleColumns.includes('secondPaid') && <ResizableHeader width={colWidths.secondPaid} onResize={(w) => handleResize('secondPaid', w)} className="px-4 py-3 font-bold text-right" hideable onHide={() => handleToggleColumn('secondPaid')}>2nd Paid</ResizableHeader>}
              {visibleColumns.includes('thirdPaid') && <ResizableHeader width={colWidths.thirdPaid} onResize={(w) => handleResize('thirdPaid', w)} className="px-4 py-3 font-bold text-right" hideable onHide={() => handleToggleColumn('thirdPaid')}>3rd Paid</ResizableHeader>}
              {visibleColumns.includes('balance') && <ResizableHeader width={colWidths.balance} onResize={(w) => handleResize('balance', w)} className="px-4 py-3 font-bold text-right" hideable onHide={() => handleToggleColumn('balance')}>Balance</ResizableHeader>}
              {visibleColumns.includes('supportingFee') && <ResizableHeader width={colWidths.supportingFee} onResize={(w) => handleResize('supportingFee', w)} className="px-4 py-3 font-bold text-right" hideable onHide={() => handleToggleColumn('supportingFee')}>Supporting Fee</ResizableHeader>}
              {visibleColumns.includes('description') && <ResizableHeader width={colWidths.description} onResize={(w) => handleResize('description', w)} className="px-4 py-3 font-bold" hideable onHide={() => handleToggleColumn('description')}>Description</ResizableHeader>}
              {visibleColumns.includes('vendor') && <ResizableHeader width={colWidths.vendor} onResize={(w) => handleResize('vendor', w)} className="px-4 py-3 font-bold" hideable onHide={() => handleToggleColumn('vendor')}>Vendor</ResizableHeader>}
              {visibleColumns.includes('action') && <ResizableHeader width={colWidths.action} onResize={(w) => handleResize('action', w)} className="px-4 py-3 font-bold text-center" hideable onHide={() => handleToggleColumn('action')}>Action</ResizableHeader>}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-blue-50 dark:bg-[#28282a] border-b-2 border-blue-200 text-sm">
              {visibleColumns.includes('no') && <td className="px-4 py-3 font-bold text-right text-blue-900 dark:text-[#8ab4f8] uppercase"></td>}
              {visibleColumns.includes('year') && <td className="px-4 py-3 font-bold text-right text-blue-900 dark:text-[#8ab4f8] uppercase"></td>}
              {visibleColumns.includes('store') && <td className="px-4 py-3 font-bold text-right text-blue-900 dark:text-[#8ab4f8] uppercase"></td>}
              {visibleColumns.includes('code') && <td className="px-4 py-3 font-bold text-right text-blue-900 dark:text-[#8ab4f8] uppercase"></td>}
              {visibleColumns.includes('projectName') && <td className="px-4 py-3 font-bold text-right text-blue-900 dark:text-[#8ab4f8] uppercase">Total</td>}
              {visibleColumns.includes('actual') && <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 cursor-pointer hover:bg-blue-100 dark:hover:bg-[#333336] transition-colors" onClick={() => {
                setHasActForcFilter(prev => {
                  const nextVal = prev === 'all' ? 'has_value' : 'all';
                  if (!searchTerm.trim()) {
                    lastSelectedActForcFilterRef.current = nextVal;
                    safeSetItemSession("taka_cost_act_forc_filter", nextVal);
                  }
                  return nextVal;
                });
              }} title="Toggle zero Act/Forc"><div className="flex flex-col items-end"><span className="text-[10px] uppercase opacity-70 hover:underline">Act/Forc {hasActForcFilter === 'all' ? '(All)' : '(!=0)'}</span><span>{formatCurrency(totalActAll)}</span></div></td>}
              {visibleColumns.includes('firstPaid') && <td className="px-4 py-3 text-right font-mono font-bold text-blue-900 dark:text-[#8ab4f8]">{formatCurrency(totalFirstPaidAll)}</td>}
              {visibleColumns.includes('secondPaid') && <td className="px-4 py-3 text-right font-mono font-bold text-blue-900 dark:text-[#8ab4f8]">{formatCurrency(totalSecondPaidAll)}</td>}
              {visibleColumns.includes('thirdPaid') && <td className="px-4 py-3 text-right font-mono font-bold text-blue-900 dark:text-[#8ab4f8]">{formatCurrency(totalThirdPaidAll)}</td>}
              {visibleColumns.includes('balance') && <td className="px-4 py-3 text-right font-mono font-bold text-blue-900 dark:text-[#8ab4f8]">{formatCurrency(totalBalanceAll)}</td>}
              {visibleColumns.includes('supportingFee') && <td className="px-4 py-3 text-right font-mono font-bold text-indigo-700 dark:text-indigo-400">{formatCurrency(totalSupAll)}</td>}
              {visibleColumns.includes('description') && <td className="px-4 py-3 text-right font-bold text-xs"></td>}
              {visibleColumns.includes('vendor') && <td className="px-4 py-3"></td>}
              {visibleColumns.includes('action') && (
                <td className="px-4 py-3 text-center">
                </td>
              )}
            </tr>
            {filteredProjectsForDisplay.slice(0, visibleCount).map((p, pIdx) => {
              const pDerivedYear = p.year ? p.year : (p.start ? Number(String(p.start).substring(0, 4)) : undefined);
              const allGroupCosts = costs.filter(c=> 
                String(c.projectCode).trim().toLowerCase() === String(p.code).trim().toLowerCase() &&
                (String(c.projectYear || '') === String(pDerivedYear || '') || (!c.projectYear && !pDerivedYear)) &&
                (String(c.projectStore || '') === String(p.store || '') || (!c.projectStore && !p.store))
              );
              const groupCosts = (paidDateStart || paidDateEnd)
                ? allGroupCosts.filter(c => getCostPaidMatches(c, paidDateStart, paidDateEnd, paidStageFilter).matches)
                : allGroupCosts;
              const groupKey = `${p.code}-${pDerivedYear}-${p.store}-${p.no}`;
              const isExpanded = expandedCodes.includes(groupKey) || expandedCodes.includes(String(p.no));

              const totalAct = groupCosts.reduce((sum, c) => sum + (c.actual || 0), 0);
              const totalFirstPaid = groupCosts.reduce((sum, c) => sum + (c.firstPaid || 0), 0);
              const totalSecondPaid = groupCosts.reduce((sum, c) => sum + (c.secondPaid || 0), 0);
              const totalThirdPaid = groupCosts.reduce((sum, c) => sum + (c.thirdPaid || 0), 0);
              const totalBalance = groupCosts.reduce((sum, c) => sum + ((c.actual || 0) - (c.firstPaid || 0) - (c.secondPaid || 0) - (c.thirdPaid || 0)), 0);
              const totalSup = groupCosts.reduce((sum, c) => sum + (c.supportingFee || 0), 0);
              
              const hasAnyCosts = allGroupCosts.length > 0;
              const computedActual = allGroupCosts.reduce((s, c) => s + (Number(c.actual) || 0), 0);
              const computedSup = allGroupCosts.reduce((s, c) => s + (Number(c.supportingFee) || 0), 0);
              const pFin = p.financial || { totalApproved: p.budget || 0, totalActualPaid: p.actual || 0 };
              const trueActual = hasAnyCosts ? computedActual : (pFin.totalActualPaid || p.actual || 0);
              const trueSup = hasAnyCosts ? computedSup : (p.supportingFee || 0);
              const trueBudget = pFin.totalApproved || p.budget || 0;
              const pRemaining = trueBudget - trueActual + trueSup;

          return (
            <React.Fragment key={`${p.code}-${p.year}-${p.no}`}>
              <tr className={cn("border-b-2 border-slate-200 dark:border-[#444446]", pIdx % 2 === 0 ? "bg-slate-100/80 dark:bg-[#1e1e20]/80" : "bg-blue-50/50 dark:bg-[#28282a]")}>
                {visibleColumns.includes('no') && (
                  <td className="px-4 py-3 text-center">
                    <button 
                      onClick={() => toggleGroup(groupKey)} 
                      className={cn(
                        "flex items-center gap-1 mx-auto px-1.5 py-0.5 rounded text-white font-bold text-xs shadow-sm transition-all active:scale-95 touch-manipulation cursor-pointer",
                        groupCosts.length >= 2
                          ? "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                          : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                      )}
                      title={isExpanded ? "Collapse" : `Expand (${groupCosts.length})`}
                    >
                      {!isExpanded ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      <span className="text-[10px]">({groupCosts.length})</span>
                    </button>
                  </td>
                )}
                    {visibleColumns.includes('year') && <td className="px-4 py-3 font-bold text-slate-700 dark:text-[#c3c3c3]">{p.year || '-'}</td>}
                {visibleColumns.includes('store') && <td className={cn("px-4 py-3 font-bold", p.store?.toLowerCase() === 'hcm' ? 'text-blue-600 dark:text-[#8ab4f8]' : p.store?.toLowerCase() === 'hn' ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-[#c3c3c3]')}>{p.store || '-'}</td>}
                {visibleColumns.includes('code') && (
                  <td className="px-4 py-3 font-mono text-blue-700 dark:text-[#8ab4f8] font-extrabold uppercase">
                    <span 
                      onClick={() => handleProjectLinkClick(p)}
                      className="cursor-pointer hover:underline hover:text-blue-600 dark:hover:text-[#8ab4f8]"
                      title="Click to view details in Tasks"
                    >
                      {p.code}
                    </span>
                  </td>
                )}
                    {visibleColumns.includes('projectName') && (
                      <td 
                        onClick={() => handleProjectLinkClick(p)}
                        className="px-4 py-3 font-bold text-slate-800 dark:text-[#e3e3e3] whitespace-normal break-words min-w-[180px] cursor-pointer hover:underline hover:text-blue-600 dark:hover:text-[#8ab4f8]"
                        title="Click to view details in Tasks"
                      >
                        {p.name || '-'}
                      </td>
                    )}
                    {visibleColumns.includes('actual') && (<td className="px-4 py-3 text-right font-mono font-bold"><div className="flex flex-col items-end gap-1">{groupCosts.length > 0 && (<span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase", groupCosts.some(c => c.costType === 'forc') ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800" : "bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-800")}>{groupCosts.some(c => c.costType === 'forc') ? 'FORC' : 'ACT'}</span>)}<span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(totalAct)}</span></div></td>)}
                    {visibleColumns.includes('firstPaid') && <td className="px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-[#c3c3c3]">{formatCurrency(totalFirstPaid)}</td>}
                    {visibleColumns.includes('secondPaid') && <td className="px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-[#c3c3c3]">{formatCurrency(totalSecondPaid)}</td>}
                    {visibleColumns.includes('thirdPaid') && <td className="px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-[#c3c3c3]">{formatCurrency(totalThirdPaid)}</td>}
                    {visibleColumns.includes('balance') && <td className="px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-[#c3c3c3]">{formatCurrency(totalBalance)}</td>}
                    {visibleColumns.includes('supportingFee') && <td className="px-4 py-3 text-right font-mono font-bold text-teal-600 dark:text-teal-400">{formatCurrency(totalSup)}</td>}
                    {visibleColumns.includes('description') && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Remaining:</span>
                          <span className={`text-sm font-black ${pRemaining >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{formatCurrency(pRemaining)}</span>
                        </div>
                      </td>
                    )}
                    {visibleColumns.includes('vendor') && <td className="px-4 py-3 text-slate-400 dark:text-[#838383] font-medium text-center">-</td>}
                    {visibleColumns.includes('action') && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <QuickNavButton project={p} title={`Quick Navigator (${p.code})`} />
                          <QRCodeButton title={p.name || p.code} url={`${window.location.origin}${window.location.pathname}?tab=cost&q=${encodeURIComponent(p.code || '')}`} />
                          {canWrite && (
                            <button 
                              onClick={() => handleAddCost(p)}
                              className="px-3 py-1 bg-blue-100 dark:bg-[#333336] text-blue-700 dark:text-[#8ab4f8] hover:bg-blue-200 dark:hover:bg-[#444446] rounded text-[10px] font-bold shadow-sm transition-colors flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              Add Cost
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                  {isExpanded && groupCosts.map((c, i) => {
                    const { firstMatch: isFirstPaidMatch, secondMatch: isSecondPaidMatch, thirdMatch: isThirdPaidMatch } = (paidDateStart || paidDateEnd)
                      ? getCostPaidMatches(c, paidDateStart, paidDateEnd, paidStageFilter)
                      : { firstMatch: false, secondMatch: false, thirdMatch: false };

                    return (
                    <tr key={c.id} className="bg-white dark:bg-[#1e1e20] border-b border-slate-100 dark:border-[#333336] hover:bg-blue-50/50 dark:hover:bg-[#444446] dark:hover:bg-[#333336] transition-all text-xs">
                      {visibleColumns.includes('no') && <td className="px-4 py-3 text-center text-slate-300 dark:text-slate-600 font-mono italic">{pIdx + 1}.${i + 1}</td>}
                      {visibleColumns.includes('year') && <td className="px-4 py-3 text-slate-400 dark:text-[#838383] font-medium">{p.year || '-'}</td>}
                      {visibleColumns.includes('store') && <td className="px-4 py-3 text-slate-400 dark:text-[#838383] font-medium">{p.store || '-'}</td>}
                      {visibleColumns.includes('code') && <td className="px-4 py-3 text-slate-400 dark:text-[#838383] font-medium">{p.code}-{i + 1}</td>}
                      {visibleColumns.includes('projectName') && (
                        <td className="px-4 py-3 font-bold text-slate-800 dark:text-[#e3e3e3] pl-6 whitespace-normal break-words min-w-[180px]">
                          <div className="flex items-start gap-1">
                            <span className="text-slate-400 dark:text-[#838383] shrink-0 mt-0.5">↳</span>
                            <span className="whitespace-normal break-words">{c.description || 'Cost Entry'}</span>
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('actual') && (
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-[#c3c3c3] bg-slate-50 dark:bg-[#1e1e20]/30">
                          <div className="flex flex-col items-end gap-1">
                            {canWrite ? (
                              <div className="flex bg-slate-100 dark:bg-[#28282a] rounded overflow-hidden shadow-inner mb-1 border border-slate-200 dark:border-[#444446]">
                                <button onClick={() => handleUpdateCost(c, 'costType', 'act')} className={cn("px-2 py-0.5 text-[9px] font-bold uppercase transition-colors", c.costType !== 'forc' ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-200 dark:hover:bg-[#333336]")}>ACT</button>
                                <button onClick={() => handleUpdateCost(c, 'costType', 'forc')} className={cn("px-2 py-0.5 text-[9px] font-bold uppercase transition-colors", c.costType === 'forc' ? "bg-amber-500 text-white" : "text-slate-500 hover:bg-slate-200 dark:hover:bg-[#333336]")}>FORC</button>
                              </div>
                            ) : (
                              <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase", c.costType === 'forc' ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800" : "bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-800")}>{c.costType === 'forc' ? 'FORC' : 'ACT'}</span>
                            )}
                            <EditableCell value={c.actual} type="number" isCurrency currency={currency} jpyRate={jpyRate} usdRate={usdRate} onSave={(val) => handleUpdateCost(c, 'actual', val)} canWrite={canWrite} />
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('firstPaid') && (
                        <td className={cn("px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-[#c3c3c3] bg-slate-50 dark:bg-[#1e1e20]/30 transition-all", isFirstPaidMatch && "bg-emerald-100/70 dark:bg-emerald-950/50 ring-2 ring-emerald-500/80 rounded-sm")}>
                          <div className="flex flex-col items-end">
                            <EditableCell value={c.firstPaid || 0} type="number" isCurrency currency={currency} jpyRate={jpyRate} usdRate={usdRate} onSave={(val) => handleUpdateCost(c, 'firstPaid', val)} canWrite={canWrite} />
                            {c.firstPaidAt && <span className={cn("text-[10px] font-normal mt-1", isFirstPaidMatch ? "text-emerald-700 dark:text-emerald-300 font-bold" : "text-slate-400 dark:text-[#838383]")}>update {formatDisplayDateMain(c.firstPaidAt)}</span>}
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('secondPaid') && (
                        <td className={cn("px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-[#c3c3c3] bg-slate-50 dark:bg-[#1e1e20]/30 transition-all", isSecondPaidMatch && "bg-emerald-100/70 dark:bg-emerald-950/50 ring-2 ring-emerald-500/80 rounded-sm")}>
                          <div className="flex flex-col items-end">
                            <EditableCell value={c.secondPaid || 0} type="number" isCurrency currency={currency} jpyRate={jpyRate} usdRate={usdRate} onSave={(val) => handleUpdateCost(c, 'secondPaid', val)} canWrite={canWrite} />
                            {c.secondPaidAt && <span className={cn("text-[10px] font-normal mt-1", isSecondPaidMatch ? "text-emerald-700 dark:text-emerald-300 font-bold" : "text-slate-400 dark:text-[#838383]")}>update {formatDisplayDateMain(c.secondPaidAt)}</span>}
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('thirdPaid') && (
                        <td className={cn("px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-[#c3c3c3] bg-slate-50 dark:bg-[#1e1e20]/30 transition-all", isThirdPaidMatch && "bg-emerald-100/70 dark:bg-emerald-950/50 ring-2 ring-emerald-500/80 rounded-sm")}>
                          <div className="flex flex-col items-end">
                            <EditableCell value={c.thirdPaid || 0} type="number" isCurrency currency={currency} jpyRate={jpyRate} usdRate={usdRate} onSave={(val) => handleUpdateCost(c, 'thirdPaid', val)} canWrite={canWrite} />
                            {c.thirdPaidAt && <span className={cn("text-[10px] font-normal mt-1", isThirdPaidMatch ? "text-emerald-700 dark:text-emerald-300 font-bold" : "text-slate-400 dark:text-[#838383]")}>update {formatDisplayDateMain(c.thirdPaidAt)}</span>}
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('balance') && (
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-[#c3c3c3] bg-slate-50 dark:bg-[#1e1e20]/30">
                          {formatCurrency((c.actual || 0) - (c.firstPaid || 0) - (c.secondPaid || 0) - (c.thirdPaid || 0))}
                        </td>
                      )}
                      {visibleColumns.includes('supportingFee') && (
                        <td className="px-4 py-3 text-right font-mono font-bold text-teal-600 dark:text-teal-400 bg-slate-50 dark:bg-[#1e1e20]/30">
                          <EditableCell value={c.supportingFee} type="number" isCurrency currency={currency} jpyRate={jpyRate} usdRate={usdRate} onSave={(val) => handleUpdateCost(c, 'supportingFee', val)} canWrite={canWrite} />
                        </td>
                      )}
                      {visibleColumns.includes('description') && (
                        <td className="px-4 py-3 text-slate-600 dark:text-[#a3a3a3] whitespace-normal break-words min-w-[200px]">
                          <EditableCell value={c.description} onSave={(val) => handleUpdateCost(c, 'description', val)} canWrite={canWrite} wrap />
                        </td>
                      )}
                      {visibleColumns.includes('vendor') && (
                        <td className="px-4 py-3 text-slate-600 dark:text-[#a3a3a3] font-medium whitespace-normal break-words min-w-[140px]">
                          <EditableCell value={c.vendor} onSave={(val) => handleUpdateCost(c, 'vendor', val)} canWrite={canWrite} wrap />
                        </td>
                      )}
                      {visibleColumns.includes('action') && (
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center justify-center gap-1">
                            <div className="flex items-center justify-center gap-2">
                              <QRCodeButton title={c.description || c.vendor || 'Cost Entry'} url={`${window.location.origin}${window.location.pathname}?tab=cost&q=${encodeURIComponent(c.description || c.vendor || '')}`} />
                              {canWrite && (
                                <button onClick={() => handleDeleteCost(c)} className="text-red-400 hover:text-red-600 transition-colors p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30">
                                  <Trash2 className="w-4 h-4 mx-auto" />
                                </button>
                              )}
                            </div>
                            {c.updatedAt && (
                              <div className="text-[9px] text-slate-400 dark:text-[#838383] font-mono text-center leading-tight">
                                Update<br/>{formatDisplayDateMain(c.updatedAt)}
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                </React.Fragment>
              );
            })}
            {visibleCount < filteredProjectsForDisplay.length && (
              <tr>
                <td colSpan={visibleColumns.length} className="py-4 text-center">
                  <button
                    onClick={() => setVisibleCount(prev => prev + 20)}
                    className="px-6 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 font-bold rounded-full shadow-sm transition-colors text-sm"
                  >
                    Load More Projects ({filteredProjectsForDisplay.length - visibleCount} remaining)
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Summary Card */}
      <div className="xl:hidden mx-2 mt-2 mb-3 bg-indigo-50/50 dark:bg-indigo-900/10 border border-slate-200 dark:border-[#333336] rounded-xl p-3 shrink-0 print:hidden cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors" onClick={() => useAppStore.getState().setActiveTab('budget')}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Total Summary</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">Tap card to view Budget Tab</span>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-[9px] font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 px-1.5 py-0.5 rounded-full">Linked from Budget</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsPaidDateFilterOpen(prev => !prev);
              }}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all shadow-xs",
                (paidDateStart || paidDateEnd)
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "bg-white dark:bg-[#28282a] border border-indigo-200 dark:border-[#444446] text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50"
              )}
              title="Filter Paid Date"
            >
              <Calendar className="w-3 h-3" />
              <span>Filter Paid Date</span>
              {(paidDateStart || paidDateEnd) && (
                <span className="bg-white/30 text-white rounded-full px-1 text-[9px] font-mono">
                  {filteredCostsForTotals.length}
                </span>
              )}
              {isPaidDateFilterOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Total Act/Forc</span>
            <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{formatCurrency(totalActAll)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Total Balance</span>
            <span className={`text-sm font-bold ${totalBalanceAll >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{formatCurrency(totalBalanceAll)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Supporting Fee</span>
            <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{formatCurrency(totalSupAll)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Remaining</span>
            <span className={`text-sm font-black ${totalRemainingAll >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{formatCurrency(totalRemainingAll)}</span>
          </div>
        </div>

        {/* Bảng này giấu trong nút filter paid date, khi nào click vào thì mới sổ ra */}
        {isPaidDateFilterOpen && (
          <div 
            className="mt-3 pt-3 border-t border-indigo-200/60 dark:border-indigo-900/40 flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-1 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Filter Paid Date (Update Date)</span>
              </div>
              {(paidDateStart || paidDateEnd || tempDateStart || tempDateEnd) && (
                <button
                  type="button"
                  onClick={handleClearPaidDateFilter}
                  className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">Start (Từ ngày)</span>
                <input 
                  type="date"
                  value={tempDateStart}
                  onChange={(e) => handleTempStartChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitDateFilter(); }}
                  onBlur={() => commitDateFilter()}
                  title="Nhấn Enter hoặc đợi 0.5s để lọc"
                  className="bg-white dark:bg-[#18181a] border border-slate-200 dark:border-[#555] text-slate-800 dark:text-slate-200 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">End (Đến ngày)</span>
                <input 
                  type="date"
                  value={tempDateEnd}
                  onChange={(e) => handleTempEndChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitDateFilter(); }}
                  onBlur={() => commitDateFilter()}
                  title="Nhấn Enter hoặc đợi 0.5s để lọc"
                  className="bg-white dark:bg-[#18181a] border border-slate-200 dark:border-[#555] text-slate-800 dark:text-slate-200 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <select
                value={paidStageFilter}
                onChange={(e) => {
                  setPaidStageFilter(e.target.value as any);
                  commitDateFilter();
                }}
                className="flex-1 bg-white dark:bg-[#18181a] border border-slate-200 dark:border-[#555] text-slate-800 dark:text-slate-200 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
              >
                <option value="all">All Paid Stages (1st, 2nd, 3rd)</option>
                <option value="1st">1st Paid only</option>
                <option value="2nd">2nd Paid only</option>
                <option value="3rd">3rd Paid only</option>
              </select>

              {(paidDateStart || paidDateEnd) && (
                <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 whitespace-nowrap">
                  {filteredCostsForTotals.length} matching
                </span>
              )}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-indigo-100 dark:border-indigo-900/40">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">
                Enter hoặc trễ 0.5s để lọc
              </span>
              <button
                type="button"
                onClick={() => {
                  commitDateFilter();
                  setIsPaidDateFilterOpen(false);
                }}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="xl:hidden flex justify-between items-center px-2 pb-2 mt-2">
        <span className="text-sm font-bold text-slate-600 dark:text-[#a3a3a3]">Cost Projects ({filteredProjectsForDisplay.length})</span>
        <button 
          onClick={toggleAll} 
          className="flex items-center gap-1 text-sm text-blue-600 dark:text-[#8ab4f8] font-medium hover:text-blue-800 dark:text-[#8ab4f8] transition-colors"
        >
          {expandedCodes.length === 0 ? (
            <><ChevronRight className="w-4 h-4" /> Expand All</>
          ) : (
            <><ChevronDown className="w-4 h-4" /> Collapse All</>
          )}
        </button>
      </div>

      <div className="xl:hidden flex-grow overflow-y-auto flex flex-col gap-4 pb-4 px-2">
        {filteredProjectsForDisplay.slice(0, visibleCount).map((p, pIdx) => {
          const pDerivedYear = p.year ? p.year : (p.start ? Number(String(p.start).substring(0, 4)) : undefined);
          const allGroupCosts = costs.filter(c=> 
            String(c.projectCode).trim().toLowerCase() === String(p.code).trim().toLowerCase() &&
            (String(c.projectYear || '') === String(pDerivedYear || '') || (!c.projectYear && !pDerivedYear)) &&
            (String(c.projectStore || '') === String(p.store || '') || (!c.projectStore && !p.store))
          );
          const groupCosts = (paidDateStart || paidDateEnd)
            ? allGroupCosts.filter(c => getCostPaidMatches(c, paidDateStart, paidDateEnd, paidStageFilter).matches)
            : allGroupCosts;
          const groupKey = `${p.code}-${pDerivedYear}-${p.store}-${p.no}`;
          const isExpanded = expandedCodes.includes(groupKey);

          const totalAct = groupCosts.reduce((sum, c) => sum + (c.actual || 0), 0);
          const totalFirstPaid = groupCosts.reduce((sum, c) => sum + (c.firstPaid || 0), 0);
          const totalSecondPaid = groupCosts.reduce((sum, c) => sum + (c.secondPaid || 0), 0);
          const totalThirdPaid = groupCosts.reduce((sum, c) => sum + (c.thirdPaid || 0), 0);
          const totalBalance = groupCosts.reduce((sum, c) => sum + ((c.actual || 0) - (c.firstPaid || 0) - (c.secondPaid || 0) - (c.thirdPaid || 0)), 0);

          return (
            <div key={`${p.code}-${p.year}-${p.no}`} className={cn("rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm p-4 flex flex-col gap-3 relative", pIdx % 2 === 0 ? "bg-white dark:bg-[#1e1e20]" : "bg-blue-50/30 dark:bg-[#1e1e20]")}>
              <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
                 <div className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono flex items-center gap-1", groupCosts.some(c => c.costType === 'forc') ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" : "text-blue-600 dark:text-[#8ab4f8] bg-blue-50 dark:bg-[#28282a] border-blue-200")}>
                  {groupCosts.length > 0 ? (groupCosts.some(c => c.costType === 'forc') ? 'FORC:' : 'ACT:') : 'ACT:'} <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(totalAct)}</span>
                </div>
                <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono ${totalBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-[#1a3821] border-emerald-200 dark:border-[#265330]' : 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-[#3b1a1a] border-red-200 dark:border-[#5c2424]'}`}>
                  Balance: {formatCurrency(totalBalance)}
                </div>
              </div>
              
              <div className="font-bold text-slate-800 dark:text-[#e3e3e3] text-base leading-snug pr-28 flex items-start gap-2">
                <button 
                  onClick={() => toggleGroup(groupKey)} 
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 mt-0.5 shrink-0 rounded text-white font-bold text-xs shadow-sm transition-all active:scale-95 touch-manipulation cursor-pointer",
                    groupCosts.length >= 2
                      ? "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                      : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                  )}
                  title={isExpanded ? "Collapse" : `Expand (${groupCosts.length})`}
                >
                  {!isExpanded ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  <span className="text-[10px]">({groupCosts.length})</span>
                </button>
                <div className="flex-1 flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span><span className={p.store?.toLowerCase() === 'hcm' ? 'text-blue-600 dark:text-[#8ab4f8]' : p.store?.toLowerCase() === 'hn' ? 'text-red-600 dark:text-red-400' : ''}>{p.store || '-'}</span> - {p.code} - {p.name} ({p.year || '-'})</span>
                  <QuickNavButton project={p} title={`Quick Navigator (${p.code})`} />
                </div>
              </div>
              
              {isExpanded && (
                <div className="flex flex-col gap-3 mt-2">
                  {groupCosts.map(c => {
                    const cBalance = (c.actual || 0) - (c.firstPaid || 0) - (c.secondPaid || 0) - (c.thirdPaid || 0);
                    const { firstMatch: isFirstPaidMatch, secondMatch: isSecondPaidMatch, thirdMatch: isThirdPaidMatch } = (paidDateStart || paidDateEnd)
                      ? getCostPaidMatches(c, paidDateStart, paidDateEnd, paidStageFilter)
                      : { firstMatch: false, secondMatch: false, thirdMatch: false };

                    return (
                      <div key={c.id} className="w-full flex flex-col gap-2 bg-slate-50 dark:bg-[#1e1e20]/60 rounded-xl p-3 border border-slate-200 dark:border-[#444446] shadow-sm">
                        {/* Header Row: Vendor & Description on Left, ACT/FORC + Actual on Right */}
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-bold text-slate-700 dark:text-[#c3c3c3] px-1.5 py-0.5 bg-slate-200/70 dark:bg-[#28282a] rounded">
                                {p.year || '-'}
                              </span>
                              <div className="text-[11px] italic bg-blue-50 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8] px-1.5 py-0.5 rounded border border-blue-100 dark:border-blue-900/40 inline-flex items-center gap-1 max-w-full">
                                <span className="text-blue-400 shrink-0 font-normal">by</span>
                                <div className="min-w-0 truncate font-semibold">
                                  <EditableCell value={c.vendor} onSave={(val) => handleUpdateCost(c, 'vendor', val)} canWrite={canWrite} wrap />
                                </div>
                              </div>
                            </div>
                            <div className="text-xs text-slate-600 dark:text-[#a3a3a3] mt-0.5 break-words">
                              <EditableCell value={c.description} onSave={(val) => handleUpdateCost(c, 'description', val)} canWrite={canWrite} wrap />
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <div className="flex items-center gap-1.5">
                              {canWrite ? (
                                <div className="flex bg-slate-200/80 dark:bg-[#28282a] rounded-md p-0.5 shadow-inner border border-slate-200 dark:border-[#444446]">
                                  <button onClick={() => handleUpdateCost(c, 'costType', 'act')} className={cn("px-2 py-0.5 text-[9px] font-bold uppercase rounded transition-colors", c.costType !== 'forc' ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-300 dark:hover:bg-[#333336]")}>ACT</button>
                                  <button onClick={() => handleUpdateCost(c, 'costType', 'forc')} className={cn("px-2 py-0.5 text-[9px] font-bold uppercase rounded transition-colors", c.costType === 'forc' ? "bg-amber-500 text-white shadow-sm" : "text-slate-500 hover:bg-slate-300 dark:hover:bg-[#333336]")}>FORC</button>
                                </div>
                              ) : (
                                <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase", c.costType === 'forc' ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800" : "bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-800")}>{c.costType === 'forc' ? 'FORC' : 'ACT'}</span>
                              )}
                            </div>
                            <div className="font-mono font-bold text-sm text-blue-700 dark:text-[#8ab4f8]">
                              <EditableCell value={c.actual} type="number" isCurrency currency={currency} jpyRate={jpyRate} usdRate={usdRate} onSave={(val) => handleUpdateCost(c, 'actual', val)} canWrite={canWrite} />
                            </div>
                          </div>
                        </div>

                        {/* Middle: 3-column Payments */}
                        <div className="grid grid-cols-3 gap-1.5 py-2 px-1 bg-white/80 dark:bg-[#18181a]/60 rounded-lg border border-slate-200/70 dark:border-[#38383a] mt-1">
                          <div className={cn("flex flex-col items-center text-center min-w-0 p-1 rounded transition-all", isFirstPaidMatch && "bg-emerald-100/70 dark:bg-emerald-950/60 ring-2 ring-emerald-500")}>
                            <span className="text-[9px] font-medium text-slate-400 dark:text-[#838383] uppercase mb-0.5">1st Paid</span>
                            <span className="font-mono font-bold text-slate-700 dark:text-[#c3c3c3] text-xs min-w-0 truncate max-w-full">
                              <EditableCell value={c.firstPaid || 0} type="number" isCurrency currency={currency} jpyRate={jpyRate} usdRate={usdRate} onSave={(val) => handleUpdateCost(c, 'firstPaid', val)} canWrite={canWrite} />
                            </span>
                            {c.firstPaidAt && <span className={cn("text-[8px] font-normal truncate mt-0.5", isFirstPaidMatch ? "text-emerald-700 dark:text-emerald-300 font-bold" : "text-slate-400")}>{formatDisplayDateMain(c.firstPaidAt)}</span>}
                          </div>
                          <div className={cn("flex flex-col items-center text-center border-l border-slate-200 dark:border-[#38383a] min-w-0 p-1 rounded transition-all", isSecondPaidMatch && "bg-emerald-100/70 dark:bg-emerald-950/60 ring-2 ring-emerald-500")}>
                            <span className="text-[9px] font-medium text-slate-400 dark:text-[#838383] uppercase mb-0.5">2nd Paid</span>
                            <span className="font-mono font-bold text-slate-700 dark:text-[#c3c3c3] text-xs min-w-0 truncate max-w-full">
                              <EditableCell value={c.secondPaid || 0} type="number" isCurrency currency={currency} jpyRate={jpyRate} usdRate={usdRate} onSave={(val) => handleUpdateCost(c, 'secondPaid', val)} canWrite={canWrite} />
                            </span>
                            {c.secondPaidAt && <span className={cn("text-[8px] font-normal truncate mt-0.5", isSecondPaidMatch ? "text-emerald-700 dark:text-emerald-300 font-bold" : "text-slate-400")}>{formatDisplayDateMain(c.secondPaidAt)}</span>}
                          </div>
                          <div className={cn("flex flex-col items-center text-center border-l border-slate-200 dark:border-[#38383a] min-w-0 p-1 rounded transition-all", isThirdPaidMatch && "bg-emerald-100/70 dark:bg-emerald-950/60 ring-2 ring-emerald-500")}>
                            <span className="text-[9px] font-medium text-slate-400 dark:text-[#838383] uppercase mb-0.5">3rd Paid</span>
                            <span className="font-mono font-bold text-slate-700 dark:text-[#c3c3c3] text-xs min-w-0 truncate max-w-full">
                              <EditableCell value={c.thirdPaid || 0} type="number" isCurrency currency={currency} jpyRate={jpyRate} usdRate={usdRate} onSave={(val) => handleUpdateCost(c, 'thirdPaid', val)} canWrite={canWrite} />
                            </span>
                            {c.thirdPaidAt && <span className={cn("text-[8px] font-normal truncate mt-0.5", isThirdPaidMatch ? "text-emerald-700 dark:text-emerald-300 font-bold" : "text-slate-400")}>{formatDisplayDateMain(c.thirdPaidAt)}</span>}
                          </div>
                        </div>

                        {/* Bottom: Actions & Balances */}
                        <div className="flex justify-between items-center pt-1 mt-0.5">
                          {canWrite ? (
                            <button onClick={() => handleDeleteCost(c)} className="text-red-400 hover:text-red-600 dark:text-red-400 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" title="Delete Cost">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : <div />}
                          <div className="flex items-center gap-3 flex-wrap justify-end">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-slate-400 dark:text-[#838383] uppercase font-medium">supp fee:</span>
                              <span className="font-mono font-bold text-xs text-teal-600 dark:text-teal-400">
                                <EditableCell value={c.supportingFee} type="number" isCurrency currency={currency} jpyRate={jpyRate} usdRate={usdRate} onSave={(val) => handleUpdateCost(c, 'supportingFee', val)} canWrite={canWrite} />
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-slate-400 dark:text-[#838383] uppercase font-medium">Balance:</span>
                              <span className={`font-mono font-bold text-xs ${cBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                                {formatCurrency(cBalance)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {canWrite && isExpanded && (
                <button 
                  onClick={() => handleAddCost(p)}
                  className="mt-2 w-full py-2 bg-slate-100 dark:bg-[#1e1e20] hover:bg-slate-200 dark:hover:bg-[#333336] text-slate-600 dark:text-[#a3a3a3] text-sm font-bold rounded-lg border border-slate-200 dark:border-[#444446] border-dashed flex items-center justify-center gap-2 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Cost Entry
                </button>
              )}
            </div>
          );
        })}
        {visibleCount < filteredProjectsForDisplay.length && (
          <div className="flex justify-center mt-4">
            <button
              onClick={() => setVisibleCount(prev => prev + 20)}
              className="px-6 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 font-bold rounded-full shadow-sm transition-colors text-sm"
            >
              Load More Projects ({filteredProjectsForDisplay.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
