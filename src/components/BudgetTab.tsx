import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { Search, ExternalLink, Download, Upload, Printer, Link as LinkIcon, Unlink, ChevronDown, ChevronRight, Lock, X, Check, Filter, Layers, Sparkles, Move, GripHorizontal } from 'lucide-react';
import { motion, useDragControls } from 'motion/react';
import { Project, Cost, AppUser, PermissionMatrix, AppRole } from '../types';
import { downloadCSV, parseCSV, generateCSV } from '../lib/csvUtils';
import { doc, collection, getDocs, query, where } from 'firebase/firestore';
import {   db, APP_ID , writeBatch , setDoc } from "../lib/firebase";
import { undoManager } from '../lib/undoManager';
import { cn, getDefaultStoreFilter, formatCurrencyValue, getUserAllowedStores, getEffectiveStoreFilter } from '../lib/utils';
import { calculateParentBudgetRollup } from '../lib/financialService';
import { MultiCheckboxSelect } from './MultiCheckboxSelect';
import { ResizableHeader } from './ResizableHeader';
import { ColumnAdder } from './ColumnAdder';
import { FullReplaceImport } from './FullReplaceImport';
import { DebouncedSearchInput } from './DebouncedSearchInput';
import { QRCodeButton } from './QRCodeButton';
import { QuickNavButton } from './QuickNavButton';
import { useLanguage } from '../lib/LanguageContext';
import { safeSetItemLocal, safeSetItemSession, safeGetItemSession } from '../lib/storage';

import { useLocationOptions } from '../hooks/useLocationOptions';

interface BudgetTabProps {
  onGoToCost: (code: string) => void;
  initialSearchTerm?: string;
}

function EditableCell({ 
  value, 
  type = 'text', 
  onSave, 
  canWrite, 
  isCurrency = false,
  currency = 'VND',
  jpyRate = 160,
  usdRate = 25000,
  wrapText = false
}: { 
  value: any, 
  type?: string, 
  onSave: (val: any) => void, 
  canWrite: boolean, 
  isCurrency?: boolean,
  currency?: 'VND' | 'JPY' | 'USD',
  jpyRate?: number,
  usdRate?: number,
  wrapText?: boolean
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(value !== undefined && value !== null ? value : '');

  useEffect(() => {
    setVal(value !== undefined && value !== null ? value : '');
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
        className={isMoneyLocked ? "cursor-not-allowed select-text opacity-95 text-slate-700 dark:text-[#c3c3c3]" : ""}
      >
        {displayValue}
      </span>
    );
  }

  if (isEditing) {
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
      className={cn(
        "cursor-pointer hover:bg-slate-100 dark:hover:bg-[#28282a] px-1 py-0.5 rounded border border-transparent hover:border-slate-200 min-h-[24px]",
        wrapText ? "whitespace-normal break-words" : "truncate"
      )}
      title={typeof displayValue === 'string' ? displayValue : undefined}
    >
      {displayValue}
    </div>
  );
}

const AVAILABLE_COLUMNS = [
  { id: 'no', label: 'No.' },
  { id: 'year', label: 'Year' },
  { id: 'store', label: 'Store' },
  { id: 'location', label: 'Location' },
  { id: 'code', label: 'Code' },
  { id: 'projectName', label: 'Project Name' },
  { id: 'totalBudget', label: 'Budget' },
  { id: 'actual', label: 'Actual/Forc' },
  { id: 'supportingFee', label: 'Supporting Fee' },
  { id: 'variance', label: 'Remaining' },
  { id: 'type', label: 'Type' },
  { id: 'note', label: 'Note' },
  { id: 'actions', label: 'Actions' }
];

export function BudgetTab({ onGoToCost, initialSearchTerm = ''}: BudgetTabProps) {

  const { enrichedProjects: projects } = useEnrichedData();
  const costs = useAppStore(state => state.costs);
  const isCostsRequested = useAppStore(state => state.isCostsRequested);
  const setIsCostsRequested = useAppStore(state => state.setIsCostsRequested);
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const currency = useAppStore(state => state.currency);
  const jpyRate = useAppStore(state => state.jpyRate);
  const usdRate = useAppStore(state => state.usdRate);

  useEffect(() => {
    if (!isCostsRequested) {
      setIsCostsRequested(true);
    }
  }, [isCostsRequested, setIsCostsRequested]);

  const { t } = useLanguage();
  
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const setGlobalYearFilter = useAppStore(state => state.setGlobalYearFilter);
  const globalStoreFilter = useAppStore(state => state.globalStoreFilter);
  const setGlobalStoreFilter = useAppStore(state => state.setGlobalStoreFilter);
  const globalLocationFilter = useAppStore(state => state.globalLocationFilter);
  const setGlobalLocationFilter = useAppStore(state => state.setGlobalLocationFilter);
  const setDetailTabFilterCode = useAppStore(state => state.setDetailTabFilterCode);
  const setDetailTabStoreFilter = useAppStore(state => state.setDetailTabStoreFilter);
  const setActiveTab = useAppStore(state => state.setActiveTab);
  const budgetTabSearchTerm = useAppStore(state => state.budgetTabSearchTerm);

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
  
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || budgetTabSearchTerm || '');

  useEffect(() => {
    if (initialSearchTerm) {
      setSearchTerm(initialSearchTerm);
    } else if (budgetTabSearchTerm) {
      setSearchTerm(budgetTabSearchTerm);
    }
  }, [initialSearchTerm, budgetTabSearchTerm]);

  const [collapsedInSearch, setCollapsedInSearch] = useState<Set<string>>(new Set());
  const [moneyFilter, setMoneyFilter] = useState(() => {
    if ((initialSearchTerm || '').trim()) return 'all';
    return safeGetItemSession("taka_budget_money_filter") || 'has_money';
  });
  const lastSelectedMoneyFilterRef = useRef<string>(
    safeGetItemSession("taka_budget_money_filter") || 'has_money'
  );
  const wasSearchingRef = useRef<boolean>(!!(initialSearchTerm || '').trim());

  useEffect(() => {
    const isSearching = !!searchTerm.trim();
    if (!wasSearchingRef.current && isSearching) {
      if (moneyFilter !== 'all') {
        lastSelectedMoneyFilterRef.current = moneyFilter;
        safeSetItemSession("taka_budget_money_filter", moneyFilter);
      }
      setMoneyFilter('all');
      wasSearchingRef.current = true;
    } else if (wasSearchingRef.current && !isSearching) {
      const restored = lastSelectedMoneyFilterRef.current || safeGetItemSession("taka_budget_money_filter") || 'has_money';
      setMoneyFilter(restored);
      wasSearchingRef.current = false;
    }
  }, [searchTerm]);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(AVAILABLE_COLUMNS.map(c => c.id));
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    no: 80,
    year: 80,
    store: 80,
    location: 130,
    code: 165,
    projectName: 220,
    totalBudget: 140,
    actual: 140,
    supportingFee: 140,
    variance: 140,
    type: 130,
    note: 200,
    actions: 90
  });

  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [selectedParentProject, setSelectedParentProject] = useState<Project | null>(null);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [childSearchTerm, setChildSearchTerm] = useState('');
  const [parentSearchTerm, setParentSearchTerm] = useState('');
  const dragControls = useDragControls();

  const getProjectFinancials = (p: Project) => {
    const fin = p.financial || { totalApproved: p.budget || 0, totalActualPaid: p.actual || 0, totalForecastPaid: 0 };
    const budget = fin.totalApproved || p.budget || 0;
    const actual = fin.totalActualPaid;
    const hasForc = fin.totalForecastPaid > 0;
    const supportingFee = p.supportingFee || 0;
    const remaining = budget - (actual + fin.totalForecastPaid) + supportingFee;
    return { budget, actual, supportingFee, hasForc, remaining };
  };

  // Candidates for Parent Project Selection
  const candidateParentProjects = useMemo(() => {
    if (!projects || projects.length === 0) return [];
    const term = parentSearchTerm.trim().toLowerCase();

    return projects.filter(p => {
      if (!term) return true;

      const searchPool = [
        p.code,
        p.name,
        p.year,
        p.store,
        p.location,
        p.type,
        p.note
      ].map(v => String(v || '').toLowerCase());
      
      return searchPool.some(val => val.includes(term));
    }).slice(0, 100);
  }, [projects, parentSearchTerm]);

  // Candidates for Child Project Selection
  const candidateChildProjects = useMemo(() => {
    if (!projects || projects.length === 0) return [];
    const parentCode = selectedParentProject ? String(selectedParentProject.code || '').trim().toUpperCase() : '';
    const parentId = selectedParentProject?.id || (selectedParentProject ? `${selectedParentProject.code}-${selectedParentProject.year}-${selectedParentProject.store}-${selectedParentProject.no}` : '');
    const term = childSearchTerm.trim().toLowerCase();

    const filtered = projects.filter(p => {
      const pId = p.id || `${p.code}-${p.year}-${p.store}-${p.no}`;
      const pCode = String(p.code || '').trim().toUpperCase();

      // Exclude the active parent project itself
      if (selectedParentProject && (pId === parentId || pCode === parentCode)) return false;

      // Prevent circular links (if selectedParentProject is currently a child of p)
      if (selectedParentProject?.parentId && String(selectedParentProject.parentId).trim().toUpperCase() === pCode) return false;

      if (!term) return true;

      const searchPool = [
        p.code,
        p.name,
        p.year,
        p.store,
        p.location,
        p.type,
        p.note
      ].map(v => String(v || '').toLowerCase());
      
      return searchPool.some(val => val.includes(term));
    });

    // Sort: projects already linked to this parent (p.parentId === parentCode) come first!
    if (parentCode) {
      filtered.sort((a, b) => {
        const aIsChild = a.parentId && String(a.parentId).trim().toUpperCase() === parentCode ? 1 : 0;
        const bIsChild = b.parentId && String(b.parentId).trim().toUpperCase() === parentCode ? 1 : 0;
        return bIsChild - aIsChild;
      });
    }

    return filtered.slice(0, 100);
  }, [projects, selectedParentProject, childSearchTerm]);

  const linkedChildrenCount = useMemo(() => {
    if (!selectedParentProject) return 0;
    const parentCode = String(selectedParentProject.code || '').trim().toUpperCase();
    return projects.filter(p => p.parentId && String(p.parentId).trim().toUpperCase() === parentCode).length;
  }, [projects, selectedParentProject]);

  useEffect(() => {
    if (initialSearchTerm) setSearchTerm(initialSearchTerm);
  }, [initialSearchTerm]);

  useEffect(() => {
    if (!isLinkModalOpen && !selectedParentProject) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsLinkModalOpen(false);
        setSelectedParentProject(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLinkModalOpen, selectedParentProject]);

  useEffect(() => {
    const saved = localStorage.getItem(`taka_budget_col_widths_${currentUser.id}`);
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        if (parsed.code && parsed.code < 165) {
          parsed.code = 165;
        }
        if (parsed.no && parsed.no < 60) {
          parsed.no = 80;
        }
        setColWidths(prev => ({ ...prev, ...parsed })); 
      } catch (e) {}
    }
    const savedCols = localStorage.getItem(`taka_budget_visible_cols_${currentUser.id}`);
    if (savedCols) {
      try { 
        const parsed = JSON.parse(savedCols);
        if (Array.isArray(parsed)) {
          let cleaned = parsed.filter((id: string) => id !== 'budget' && id !== 'linkCost');
          if (!cleaned.includes('no')) {
            cleaned = ['no', ...cleaned];
          }
          setVisibleColumns(cleaned);
        }
      } catch (e) {}
    }
  }, [currentUser.id]);

  const handleResize = (col: string, newWidth: number) => {
    setColWidths(prev => {
      const next = { ...prev, [col]: newWidth };
      localStorage.setItem(`taka_budget_col_widths_${currentUser.id}`, JSON.stringify(next));
      return next;
    });
  };

  const handleExportBudget = () => {
    const headers = ['store', 'location', 'year', 'code', 'name', 'budget'];
    const data = filteredRoots.map(node => [
      node.store || '',
      node.location || '',
      node.year || '',
      node.code || '',
      node.name || '',
      node.budget || 0
    ]);
    const csv = generateCSV(headers, data);
    downloadCSV(csv, 'taka_budget_filtered.csv');
  };

  const handleImportBudget = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length < 2) throw new Error('CSV is empty or invalid.');

        const headers = rows[0].map(h => h.trim().toLowerCase());
        const dataRows = rows.slice(1);

        const batch = writeBatch(db);
        let importCount = 0;

        for (const row of dataRows) {
          if (row.every(cell => !cell.trim())) continue;
          const p: any = {};
          headers.forEach((h, i) => {
            let key = h;
            if (h === 'project code' || h === 'code') key = 'code';
            if (h === 'project name' || h === 'name') key = 'name';
            
            if (['code', 'name', 'year', 'store', 'location', 'budget'].includes(key)) {
              let val: any = row[i];
              if (key === 'year' || key === 'budget') val = isNaN(Number(val)) ? val : Number(val);
              p[key] = val;
            }
          });

          if (!p.code) continue;
          
          // Find matching project
          const match = projects.find(proj => String(proj.code).trim().toLowerCase() === String(p.code).trim().toLowerCase() && String(proj.year || '') === String(p.year || '') && String(proj.store || '') === String(p.store || ''));
          
          if (match && p.budget !== undefined) {
            batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', match.id), { budget: p.budget, updatedAt: new Date().toISOString() });
            importCount++;
          }
        }
        
        if (importCount > 0) {
          try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }
          useAppStore.getState().setToast({ title: "Thông báo", message: String(`Successfully updated budget for ${importCount} projects.`) });
        } else {
          useAppStore.getState().setToast({ title: "Thông báo", message: String('No matching projects found to update budget.') });
        }

      } catch (err) {
        console.error(err);
        useAppStore.getState().setToast({ title: "Thông báo", message: String('Error importing CSV: ' + (err instanceof Error ? err.message : String(err))) });
      }
    };
    reader.readAsText(file);
  };

  const handleToggleColumn = (colId: string) => {
    setVisibleColumns(prev => {
      const next = prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId];
      localStorage.setItem(`taka_budget_visible_cols_${currentUser.id}`, JSON.stringify(next));
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    if (searchTerm.trim()) {
      setCollapsedInSearch(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      setExpandedParents(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  };

  const toggleAllParents = () => {
    if (expandedParents.size === 0) {
      const allParentIds = new Set<string>();
      const collectParents = (nodes: any[]) => {
        nodes.forEach(n => {
          if (n.filteredChildren && n.filteredChildren.length > 0) {
            allParentIds.add(n.id || n.code);
            collectParents(n.filteredChildren);
          }
        });
      };
      collectParents(filteredRoots);
      setExpandedParents(allParentIds);
    } else {
      setExpandedParents(new Set());
    }
  };

  const isAdmin = currentUser.role === 'admin';
  const role = currentUser.role as AppRole;
  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const canWrite = (isAdmin || !!permissionMatrix[role]?.Write?.budget) && !isArchiveYear;

  const formatCurrency = (val: number | undefined) => {
    return formatCurrencyValue(val, currency, jpyRate, usdRate);
  };

  // Build Tree Data: Each project has a Parent (Budget Mẹ) and at least 1 Self-Child (Budget Con).
  // Linked projects only appear as children under their parent project.
  const treeData = useMemo(() => {
    const projectMap = new Map<string, any>();
    const codeToProjects = new Map<string, any[]>();

    projects.forEach(p => {
      const key = `${String(p.code).trim().toLowerCase()}_${String(p.year || '')}_${String(p.store || '')}`;
      const projectCosts = costs.filter(c => {
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
      
      const computedActual = projectCosts.reduce((sum, c) => sum + (Number(c.actual) || 0), 0);
      const computedForc = projectCosts.filter(c => c.costType === 'forc').reduce((sum, c) => sum + (Number(c.actual) || 0), 0);
      const computedSupportingFee = projectCosts.reduce((sum, c) => sum + (Number(c.supportingFee) || 0), 0);

      const fin = p.financial || { totalApproved: p.budget || 0, totalActualPaid: p.actual || 0, totalForecastPaid: 0 };
      const hasCosts = projectCosts.length > 0;

      const finalActual = hasCosts ? computedActual : (fin.totalActualPaid || p.actual || 0);
      const finalForc = hasCosts ? computedForc : (fin.totalForecastPaid || 0);
      const finalSupportingFee = hasCosts ? computedSupportingFee : (p.supportingFee || 0);

      const pData = {
        ...p,
        ownActual: finalActual,
        ownForc: finalForc,
        ownSupportingFee: finalSupportingFee,
        hasForc: finalForc > 0,
        ownBudget: fin.totalApproved || p.budget || 0,
      };
      projectMap.set(key, pData);

      const codeKey = String(p.code).trim().toUpperCase();
      if (!codeToProjects.has(codeKey)) {
        codeToProjects.set(codeKey, []);
      }
      codeToProjects.get(codeKey)!.push(pData);
    });

    // Map linked children to parent codes
    const parentToChildrenMap = new Map<string, any[]>();
    const linkedChildIds = new Set<string>();

    projects.forEach(p => {
      if (p.parentId && String(p.parentId).trim()) {
        const parentCode = String(p.parentId).trim().toUpperCase();
        if (codeToProjects.has(parentCode)) {
          if (!parentToChildrenMap.has(parentCode)) {
            parentToChildrenMap.set(parentCode, []);
          }
          const key = `${String(p.code).trim().toLowerCase()}_${String(p.year || '')}_${String(p.store || '')}`;
          const pData = projectMap.get(key) || p;
          parentToChildrenMap.get(parentCode)!.push(pData);
          linkedChildIds.add(p.id || `${p.code}-${p.year}-${p.store}-${p.no}`);
        }
      }
    });

    const roots: any[] = [];

    projects.forEach(p => {
      const pId = p.id || `${p.code}-${p.year}-${p.store}-${p.no}`;
      // If project is linked as child of another project, it is only a child, not a root parent
      if (linkedChildIds.has(pId)) {
        return;
      }

      const key = `${String(p.code).trim().toLowerCase()}_${String(p.year || '')}_${String(p.store || '')}`;
      const pData = projectMap.get(key) || p;
      const parentCode = String(p.code).trim().toUpperCase();

      // Child 1: Self-Child of this project (its own budget)
      const selfBudget = pData.ownBudget ?? 0;
      const selfActual = pData.ownActual ?? 0;
      const selfSupportingFee = pData.ownSupportingFee ?? 0;
      const selfRemaining = selfBudget - selfActual + selfSupportingFee;

      const selfChild = {
        id: `${pId}_self`,
        isSelf: true,
        isParentNode: false,
        code: p.code,
        name: p.name,
        year: p.year,
        store: p.store,
        location: p.location,
        type: p.type,
        note: p.note,
        budget: selfBudget,
        totalBudget: selfBudget,
        ownActual: selfActual,
        totalActual: selfActual,
        ownSupportingFee: selfSupportingFee,
        totalSupportingFee: selfSupportingFee,
        hasForc: pData.hasForc,
        remaining: selfRemaining,
        project: p,
        children: [],
      };

      // Child 2+: Any other projects linked as children under this parent
      const linkedProjects = (parentToChildrenMap.get(parentCode) || []).map((childP: any) => {
        const childId = childP.id || `${childP.code}-${childP.year}-${childP.store}-${childP.no}`;
        const cBudget = childP.ownBudget ?? 0;
        const cActual = childP.ownActual ?? 0;
        const cSupportingFee = childP.ownSupportingFee ?? 0;
        const cRemaining = cBudget - cActual + cSupportingFee;

        return {
          id: childId,
          isSelf: false,
          isParentNode: false,
          code: childP.code,
          name: childP.name,
          year: childP.year,
          store: childP.store,
          location: childP.location,
          type: childP.type,
          note: childP.note,
          budget: cBudget,
          totalBudget: cBudget,
          ownActual: cActual,
          totalActual: cActual,
          ownSupportingFee: cSupportingFee,
          totalSupportingFee: cSupportingFee,
          hasForc: childP.hasForc,
          remaining: cRemaining,
          parentId: childP.parentId,
          project: childP,
          children: [],
        };
      });

      const allChildren = [selfChild, ...linkedProjects];

      // Roll-up sums for Parent Node (Budget Mẹ) utilizing central financialService
      const rollup = calculateParentBudgetRollup(allChildren);

      const parentNode = {
        ...pData,
        id: pId,
        isParentNode: true,
        isSelf: false,
        totalBudget: rollup.totalBudget,
        totalActual: rollup.totalActual,
        totalSupportingFee: rollup.totalSupportingFee,
        ownSupportingFee: selfSupportingFee,
        hasForc: rollup.hasForc,
        remaining: rollup.remaining,
        children: allChildren,
        project: p,
      };

      roots.push(parentNode);
    });

    return roots;
  }, [projects, costs]);

  const years = [...new Set([...projects.map(p=> {
    if (p.year) return String(p.year);
    if (p.start) return String(p.start).substring(0, 4);
    return null;
  }).filter(Boolean), '2026', '2027'])].sort();

  const allowedStores = useMemo(() => getUserAllowedStores(currentUser), [currentUser]);
  const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
  const stores = allowedStores;

  const locationOptions = useLocationOptions();
  

  const isChildMatchSearch = (child: any, term: string): boolean => {
    if (!term) return false;
    const lowerTerm = term.toLowerCase().trim();
    const cSearchFields = [
      child.code,
      child.name,
      child.store,
      child.location,
      child.type,
      child.note,
      child.year,
      child.budget,
      child.totalActual,
      child.remaining
    ];
    return cSearchFields.some(val => String(val ?? "").toLowerCase().includes(lowerTerm));
  };

  const isParentMatchSearch = (node: any, term: string): boolean => {
    if (!term) return false;
    const lowerTerm = term.toLowerCase().trim();
    const searchFields = [
      node.code,
      node.name,
      node.store,
      node.location,
      node.type,
      node.note,
      node.year,
      node.totalBudget,
      node.totalActual,
      node.remaining
    ];
    return searchFields.some(val => String(val ?? "").toLowerCase().includes(lowerTerm));
  };

  const [visibleCount, setVisibleCount] = useState(20);

  const filterNode = (node: any): boolean => {
    const pYear = node.year ? String(node.year) : (node.start ? String(node.start).substring(0, 4) : null);
    const matchesYear = globalYearFilter === 'all' || pYear === globalYearFilter;
    const matchesStore = effectiveStore === 'all' || node.store === effectiveStore;
    const matchesLocation = globalLocationFilter.length === 0 || (node.location && globalLocationFilter.includes(node.location));
    
    const hasBudget = (node.totalBudget || 0) !== 0;
    const hasActForc = (node.totalActual || 0) !== 0;
    let matchesMoney = true;
    if (moneyFilter === 'has_money') matchesMoney = hasBudget || hasActForc;
    else if (moneyFilter === 'has_budget') matchesMoney = hasBudget;
    else if (moneyFilter === 'has_act_forc') matchesMoney = hasActForc;
    
    const baseParentMatch = matchesYear && matchesStore && matchesLocation && matchesMoney;
    const parentMatchesSearch = !searchTerm || isParentMatchSearch(node, searchTerm);

    if (node.children && node.children.length > 0) {
      const validChildren = node.children.filter((child: any) => {
        const cYear = child.year ? String(child.year) : null;
        const cMatchesYear = globalYearFilter === 'all' || !cYear || cYear === globalYearFilter;
        const cMatchesStore = effectiveStore === 'all' || !child.store || child.store === effectiveStore;
        const cMatchesLocation = globalLocationFilter.length === 0 || (!child.location) || globalLocationFilter.includes(child.location);
        
        const cHasBudget = (child.budget || 0) !== 0;
        const cHasActForc = (child.totalActual || 0) !== 0;
        let cMatchesMoney = true;
        if (moneyFilter === 'has_money') cMatchesMoney = cHasBudget || cHasActForc || matchesMoney;
        else if (moneyFilter === 'has_budget') cMatchesMoney = cHasBudget || hasBudget;
        else if (moneyFilter === 'has_act_forc') cMatchesMoney = cHasActForc || hasActForc;

        return cMatchesYear && cMatchesStore && cMatchesLocation && cMatchesMoney;
      });

      const hasMultiChildren = node.children.length >= 2;

      if (!searchTerm.trim()) {
        node.filteredChildren = validChildren.map((c: any) => ({ ...c, isSearchMatch: false }));
        return baseParentMatch || validChildren.length > 0;
      }

      const matchingChildIds = new Set<string>();
      validChildren.forEach((child: any) => {
        if (isChildMatchSearch(child, searchTerm)) {
          matchingChildIds.add(child.id);
        }
      });

      const anyChildMatchesSearch = matchingChildIds.size > 0;

      if (hasMultiChildren) {
        if (anyChildMatchesSearch || (baseParentMatch && parentMatchesSearch)) {
          // If searching specifically for a child (parent doesn't match), only show the matched children
          const shouldFilterChildren = !parentMatchesSearch && anyChildMatchesSearch;
          node.filteredChildren = validChildren
            .filter((child: any) => shouldFilterChildren ? matchingChildIds.has(child.id) : true)
            .map((child: any) => ({
              ...child,
              isSearchMatch: matchingChildIds.has(child.id)
            }));
          return true;
        }
        node.filteredChildren = [];
        return false;
      } else {
        // Chỉ có 1 con
        if (anyChildMatchesSearch) {
          node.filteredChildren = validChildren
            .filter((c: any) => matchingChildIds.has(c.id))
            .map((c: any) => ({ ...c, isSearchMatch: true }));
          return true;
        } else if (baseParentMatch && parentMatchesSearch) {
          node.filteredChildren = validChildren.map((c: any) => ({ ...c, isSearchMatch: false }));
          return true;
        }
        node.filteredChildren = [];
        return false;
      }
    } else {
      node.filteredChildren = [];
      return baseParentMatch && parentMatchesSearch;
    }
  };

  let filteredRoots = treeData.filter(filterNode);

  if (sortConfig) {
    const sortFn = (a: any, b: any) => {
      let valA = 0, valB = 0;
      if (sortConfig.key === 'totalBudget') { valA = a.totalBudget || 0; valB = b.totalBudget || 0; }
      else if (sortConfig.key === 'actual') { valA = a.totalActual || 0; valB = b.totalActual || 0; }
      else if (sortConfig.key === 'variance') { valA = a.remaining || 0; valB = b.remaining || 0; }
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    };
    filteredRoots = filteredRoots.sort(sortFn);
  }

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev && prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return null;
      }
      return { key, direction: 'asc' };
    });
  };

  const handleOpenLinkModal = (projectToSelect?: Project) => {
    if (projectToSelect) {
      setSelectedParentProject(projectToSelect);
      setParentSearchTerm(String(projectToSelect.code || '').trim());
    } else {
      if (!selectedParentProject && filteredRoots.length > 0) {
        setSelectedParentProject(filteredRoots[0].project);
        setParentSearchTerm(String(filteredRoots[0].project.code || '').trim());
      } else if (selectedParentProject) {
        setParentSearchTerm(String(selectedParentProject.code || '').trim());
      }
    }
    setIsLinkModalOpen(true);
  };

  const totalGlobalBudget = filteredRoots.reduce((sum, p) => sum + (p.totalBudget || 0), 0);
  const totalGlobalActual = filteredRoots.reduce((sum, p) => sum + (p.totalActual || 0), 0);
  const totalGlobalSupportingFee = filteredRoots.reduce((sum, p) => sum + (p.totalSupportingFee || 0), 0);
  const totalGlobalRemaining = totalGlobalBudget - totalGlobalActual + totalGlobalSupportingFee;
  const totalVarianceColor = totalGlobalRemaining < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400';

  const handleUpdateProject = async (p: Project, field: keyof Project, value: any) => {
    try {
      const docId = p.id || String(p.no);
      const pRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId);
      
      // Optimistically update the UI to prevent input lag
      useAppStore.getState().optimisticUpdateProjects([{ id: docId, [field]: value }]);
      
      setDoc(pRef, { [field]: value, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.error(e);
      // Revert optimistic update on error if needed
      useAppStore.getState().optimisticUpdateProjects([{ id: p.id || String(p.no), [field]: p[field] }]);
    }
  };

  const handleLinkParent = async (childProject: Project, parentCode: string | null) => {
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      
      // 1. Cập nhật cho chính childProject
      const childDocId = childProject.id || String(childProject.no);
      const childRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', childDocId);
      batch.set(childRef, { parentId: parentCode, updatedAt: now }, { merge: true });

      // 2. Nếu gán làm con của một Cha (parentCode != null)
      // Và childProject trước đó đang có các dự án con trực thuộc (parentId === childProject.code)
      // => Tự động gom toàn bộ các dự án con (và cháu nếu có) sang làm con của cha lớn nhất (parentCode)
      if (parentCode && childProject.code) {
        const childCode = String(childProject.code).trim().toUpperCase();
        
        // Thu thập tất cả con (và cháu nếu có) của childProject
        const allDescendants: Project[] = [];
        const queue = [childCode];
        const visitedCodes = new Set<string>([childCode]);

        while (queue.length > 0) {
          const currentParentCode = queue.shift()!;
          const directChildren = projects.filter(p => {
            const pParent = p.parentId ? String(p.parentId).trim().toUpperCase() : '';
            return pParent === currentParentCode && !visitedCodes.has(String(p.code || '').trim().toUpperCase());
          });

          for (const directChild of directChildren) {
            allDescendants.push(directChild);
            const directChildCode = String(directChild.code || '').trim().toUpperCase();
            if (directChildCode) {
              visitedCodes.add(directChildCode);
              queue.push(directChildCode);
            }
          }
        }

        // Chuyển toàn bộ các con này sang làm con của parentCode (Cha lớn nhất)
        allDescendants.forEach(desc => {
          const descDocId = desc.id || String(desc.no);
          const descRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', descDocId);
          batch.set(descRef, { parentId: parentCode, updatedAt: now }, { merge: true });
        });
      }

      try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }
    } catch (e) {
      console.error('Error linking parent and cascading sub-children to top parent:', e);
    }
  };

  const renderRows = (nodes: any[], depth = 0): React.ReactNode[] => {
    let rows: React.ReactNode[] = [];
    nodes.forEach((node, idx) => {
      const isParent = node.isParentNode && node.filteredChildren && node.filteredChildren.length > 0;
      const isExpanded = searchTerm.trim() 
        ? !collapsedInSearch.has(node.id || node.code) 
        : expandedParents.has(node.id || node.code);
      const vColor = (node.remaining || 0) < 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400';
      
      const isSelfRow = !node.isParentNode && node.isSelf;
      const isSubRow = !node.isParentNode && !node.isSelf;
      const isHighlightedChild = !node.isParentNode && Boolean(node.isSearchMatch);

      let rowBgClass = "";
      if (node.isParentNode) {
        rowBgClass = isParent 
          ? "bg-blue-50/35 dark:bg-[#1a2030]/60 hover:bg-blue-50/60 font-semibold" 
          : (idx % 2 === 0 ? "bg-white dark:bg-[#1e1e20] hover:bg-blue-50/30" : "bg-slate-50/50 dark:bg-[#1b1b1d] hover:bg-blue-50/30");
      } else if (isHighlightedChild) {
        rowBgClass = isSelfRow 
          ? "bg-blue-100/80 dark:bg-blue-950/70 font-semibold ring-2 ring-blue-500 dark:ring-blue-400 ring-inset shadow-xs relative z-10" 
          : "bg-amber-100/80 dark:bg-amber-950/70 font-semibold ring-2 ring-amber-500 dark:ring-amber-400 ring-inset shadow-xs relative z-10";
      } else if (isSelfRow) {
        rowBgClass = "bg-blue-50/20 dark:bg-[#151926]/50 hover:bg-blue-50/40 border-l-2 border-l-blue-400/80";
      } else {
        rowBgClass = "bg-amber-50/25 dark:bg-[#221a12]/50 hover:bg-amber-50/40 border-l-2 border-l-amber-500/80";
      }

      rows.push(
        <tr 
          key={node.id || `${node.code}-${node.year}-${node.store}-${node.no}`} 
          className={cn(
            "border-b border-slate-100 dark:border-[#333336] transition-all text-xs",
            rowBgClass
          )}
        >
          {visibleColumns.includes('no') && (
            <td className="px-2 py-2.5 text-center whitespace-nowrap">
              <div className="flex items-center justify-center gap-1 min-w-0">
                {isParent && (
                  <button 
                    onClick={() => toggleExpand(node.id || node.code)} 
                    className={cn(
                      "p-1 text-white rounded transition-colors flex items-center gap-0.5 text-xs font-bold shrink-0 shadow-2xs",
                      (node.filteredChildren?.length ?? 0) >= 2
                        ? "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                        : "bg-blue-600 hover:bg-blue-700"
                    )}
                    title={isExpanded ? "Collapse" : `Expand (${node.filteredChildren.length})`}
                  >
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <span className="text-[10px]">({node.filteredChildren.length})</span>
                  </button>
                )}
                {isSelfRow && (
                  <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-[#8ab4f8] uppercase shrink-0 border border-blue-200 dark:border-blue-800 flex items-center gap-0.5 leading-none" title="Dòng tự thân (Self)">
                    ↳ SELF
                  </span>
                )}
                {isSubRow && (
                  <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 uppercase shrink-0 border border-amber-300 dark:border-amber-700 flex items-center gap-0.5 leading-none" title="Dòng con (Sub)">
                    ↳ SUB
                  </span>
                )}
                {isHighlightedChild && (
                  <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded bg-blue-600 dark:bg-blue-500 text-white uppercase shrink-0 shadow-2xs leading-none">
                    MATCH
                  </span>
                )}
              </div>
            </td>
          )}
          {visibleColumns.includes('year') && (
            <td className="px-4 py-3 text-center font-medium text-slate-600 dark:text-[#a3a3a3]">
              {node.isParentNode ? (
                <EditableCell value={node.year} type="number" onSave={(val) => handleUpdateProject(node.project, 'year', val)} canWrite={canWrite} />
              ) : (
                <span className="text-slate-400 dark:text-[#838383]">{node.year || '-'}</span>
              )}
            </td>
          )}
          {visibleColumns.includes('store') && (
            <td className={cn("px-4 py-3 font-bold", node.store?.toLowerCase() === 'hcm' ? 'text-blue-600 dark:text-[#8ab4f8]' : node.store?.toLowerCase() === 'hn' ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-[#c3c3c3]')}>
              {node.isParentNode ? (
                <EditableCell value={node.store} onSave={(val) => handleUpdateProject(node.project, 'store', val)} canWrite={canWrite} />
              ) : (
                <span>{node.store || '-'}</span>
              )}
            </td>
          )}
          {visibleColumns.includes('location') && (
            <td className="px-4 py-3 text-slate-600 dark:text-[#a3a3a3]">
              <EditableCell value={node.location} onSave={(val) => handleUpdateProject(node.project, 'location', val)} canWrite={canWrite} />
            </td>
          )}
          {visibleColumns.includes('code') && (
            <td className="px-3 py-2.5 whitespace-nowrap">
              <div className="flex items-center gap-1 font-mono font-extrabold uppercase whitespace-nowrap min-w-0">
                {node.isParentNode ? (
                  <EditableCell value={node.code} onSave={(val) => handleUpdateProject(node.project, 'code', String(val || '').toUpperCase())} canWrite={canWrite} />
                ) : (
                  <span 
                    onClick={() => node.project && handleProjectLinkClick(node.project)}
                    className={cn(
                      "font-semibold whitespace-nowrap text-xs tracking-tight cursor-pointer hover:underline hover:text-blue-600 dark:hover:text-[#8ab4f8]", 
                      isSubRow ? "text-amber-950 dark:text-amber-200" : "text-slate-700 dark:text-[#c3c3c3]"
                    )}
                    title="Click to view details in Tasks"
                  >
                    {node.code}
                  </span>
                )}
              </div>
            </td>
          )}
          {visibleColumns.includes('projectName') && (
            <td 
              onClick={() => node.project && handleProjectLinkClick(node.project)}
              className={cn(
                "px-4 py-3 whitespace-normal break-words leading-snug min-w-[200px]", 
                node.project && "cursor-pointer hover:underline hover:text-blue-600 dark:hover:text-[#8ab4f8]",
                node.isParentNode ? "font-bold text-slate-800 dark:text-[#e3e3e3]" : (isSubRow ? "font-medium text-amber-950/90 dark:text-amber-200/90" : "font-normal text-slate-600 dark:text-[#c3c3c3]")
              )}
              title={node.project ? "Click to view details in Tasks" : undefined}
            >
              {node.name || '-'}
            </td>
          )}
          {visibleColumns.includes('totalBudget') && (
            <td className="px-4 py-3 text-right font-mono font-bold">
              {node.isParentNode ? (
                <span className="text-blue-800 dark:text-[#8ab4f8] font-black">{formatCurrency(node.totalBudget)}</span>
              ) : (
                <span className="text-slate-700 dark:text-[#c3c3c3]">
                  <EditableCell 
                    value={node.budget} 
                    type="number" 
                    isCurrency 
                    currency={currency} 
                    jpyRate={jpyRate} 
                    usdRate={usdRate} 
                    onSave={(val) => handleUpdateProject(node.project, 'budget', val)} 
                    canWrite={canWrite} 
                  />
                </span>
              )}
            </td>
          )}
          {visibleColumns.includes('actual') && (
            <td className="px-4 py-3 text-right font-mono font-bold">
              <div className="flex flex-col items-end gap-1">
                {(node.isParentNode ? node.totalActual : node.ownActual) !== 0 && (
                  <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase", node.hasForc ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800" : "bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-800")}>
                    {node.hasForc ? 'FORC' : 'ACT'}
                  </span>
                )}
                <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(node.isParentNode ? node.totalActual : node.ownActual)}</span>
              </div>
            </td>
          )}
          {visibleColumns.includes('supportingFee') && (
            <td className="px-4 py-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
              {formatCurrency(node.isParentNode ? node.totalSupportingFee : node.ownSupportingFee)}
            </td>
          )}
          {visibleColumns.includes('variance') && (
            <td className={`px-4 py-3 text-right font-mono font-bold ${vColor}`}>
              {formatCurrency(node.remaining)}
            </td>
          )}
          {visibleColumns.includes('type') && (
            <td className="px-4 py-3 text-slate-600 dark:text-[#a3a3a3] whitespace-normal break-words min-w-[120px]">
              <EditableCell value={node.type} onSave={(val) => handleUpdateProject(node.project, 'type', val)} canWrite={canWrite} wrapText />
            </td>
          )}
          {visibleColumns.includes('note') && (
            <td className="px-4 py-3 text-slate-600 dark:text-[#a3a3a3] whitespace-normal break-words min-w-[160px]">
              <EditableCell value={node.note} onSave={(val) => handleUpdateProject(node.project, 'note', val)} canWrite={canWrite} wrapText />
            </td>
          )}
          {visibleColumns.includes('actions') && (
            <td className="px-4 py-3 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <QuickNavButton project={node.project} title={`Quick Navigator (${node.code})`} />
                <QRCodeButton title={node.name || node.code} url={`${window.location.origin}${window.location.pathname}?tab=budget&q=${encodeURIComponent(node.code || '')}`} />
                {canWrite && (
                  <>
                    {node.isParentNode ? (
                      <button 
                        onClick={() => handleOpenLinkModal(node.project)}
                        className="p-1 text-slate-400 hover:text-blue-600 rounded bg-slate-100 hover:bg-blue-100 dark:bg-[#28282a] dark:hover:bg-[#333336] transition-colors active:scale-95"
                        title="Project Modular (Set as Main)"
                      >
                        <Layers className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      !node.isSelf && (
                        <>
                          <button 
                            onClick={() => handleOpenLinkModal(node.project)}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded bg-slate-100 hover:bg-blue-100 dark:bg-[#28282a] dark:hover:bg-[#333336] transition-colors active:scale-95"
                            title="Project Modular (Set as Main)"
                          >
                            <Layers className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleLinkParent(node.project, null)}
                            className="p-1 text-red-500 hover:text-red-700 rounded bg-red-50 hover:bg-red-100 dark:bg-[#28282a] dark:hover:bg-red-950/50 transition-colors"
                            title="Unlink (Make Standalone Parent)"
                          >
                            <Unlink className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )
                    )}
                  </>
                )}
              </div>
            </td>
          )}
        </tr>
      );

      if (isParent && isExpanded) {
        rows = rows.concat(renderRows(node.filteredChildren, depth + 1));
      }
    });
    return rows;
  };

  const renderMobileCards = (nodes: any[], depth = 0): React.ReactNode[] => {
    let cards: React.ReactNode[] = [];
    nodes.forEach((node, idx) => {
      const isParent = node.isParentNode && node.filteredChildren && node.filteredChildren.length > 0;
      const isExpanded = searchTerm.trim() 
        ? !collapsedInSearch.has(node.id || node.code) 
        : expandedParents.has(node.id || node.code);
      const vColor = (node.remaining || 0) < 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400';
      const vBg = (node.remaining || 0) < 0 ? 'bg-red-50 dark:bg-[#3b1a1a] border-red-200 dark:border-[#5c2424]' : 'bg-emerald-50 dark:bg-[#1a3821] border-emerald-200 dark:border-[#265330]';
      
      const isSelfRow = !node.isParentNode && node.isSelf;
      const isSubRow = !node.isParentNode && !node.isSelf;
      const isHighlightedChild = !node.isParentNode && Boolean(node.isSearchMatch);

      let cardStyle = "";
      if (node.isParentNode) {
        cardStyle = isParent
          ? "border-2 border-blue-500/80 dark:border-blue-500/60 shadow-md bg-gradient-to-r from-blue-50/60 to-indigo-50/40 dark:from-[#1b2030] dark:to-[#1e1e24]"
          : "border border-slate-300 dark:border-[#48484c] shadow-xs bg-white dark:bg-[#1e1e20]";
      } else if (isHighlightedChild) {
        cardStyle = isSelfRow
          ? "ml-4 border-2 border-blue-500 ring-2 ring-blue-500/50 bg-blue-100/60 dark:bg-blue-950/70 shadow-md"
          : "ml-4 border-2 border-amber-500 ring-2 ring-amber-500/50 bg-amber-100/60 dark:bg-amber-950/70 shadow-md";
      } else if (isSelfRow) {
        cardStyle = "ml-4 border-l-4 border-l-blue-500 border-t border-r border-b border-blue-200/80 dark:border-blue-900/50 bg-blue-50/30 dark:bg-[#151926]/70 shadow-xs";
      } else {
        cardStyle = "ml-4 border-l-4 border-l-amber-500 border-t border-r border-b border-amber-300/80 dark:border-amber-800/60 bg-amber-50/35 dark:bg-[#231b12]/70 shadow-xs";
      }

      cards.push(
        <div 
          key={`mobile-${node.id || `${node.code}-${node.year}-${node.store}-${node.no}`}`} 
          className={cn(
            "rounded-xl p-3.5 flex flex-col gap-2.5 transition-all",
            cardStyle
          )}
        >
          {/* Top row: Badges (Parent/Self/Sub, Year, Store) & Remaining Badge */}
          <div className="flex justify-between items-start gap-2">
            <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
              {node.isParentNode && isParent && (
                <button 
                  onClick={() => toggleExpand(node.id || node.code)} 
                  className={cn(
                    "px-2 py-0.5 text-white rounded-md transition-colors flex items-center gap-1 text-[10px] font-extrabold shadow-2xs shrink-0",
                    (node.filteredChildren?.length ?? 0) >= 2
                      ? "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                      : "bg-blue-600 hover:bg-blue-700"
                  )}
                >
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  <span>MAIN ({node.filteredChildren.length})</span>
                </button>
              )}
              {isSelfRow && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-600 text-white uppercase shrink-0 flex items-center gap-1 shadow-2xs">
                  <span>↳</span> BẢN THÂN (SELF)
                </span>
              )}
              {isSubRow && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-600 text-white uppercase shrink-0 flex items-center gap-1 shadow-2xs">
                  <span>↳</span> SUB
                </span>
              )}
              {isHighlightedChild && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-600 text-white uppercase shrink-0 shadow-2xs">
                  MATCH
                </span>
              )}
              <span className="text-[10px] font-bold text-slate-700 dark:text-[#c3c3c3] px-1.5 py-0.5 bg-slate-200/70 dark:bg-[#28282a] rounded">
                {node.year || '-'}
              </span>
              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded uppercase", node.store?.toLowerCase() === 'hcm' ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800' : node.store?.toLowerCase() === 'hn' ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800' : 'bg-slate-100 text-slate-700 dark:bg-[#28282a] dark:text-[#c3c3c3]')}>
                {node.store || '-'}
              </span>
            </div>

            <div className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md border font-mono shrink-0", vBg, vColor)}>
              Rem: {formatCurrency(node.remaining)}
            </div>
          </div>

          {/* Task Code + Task Name (placed side-by-side with highlight color for easy recognition) */}
          <div className="flex items-start gap-1.5 flex-wrap leading-snug">
            <span className={cn(
              "font-mono font-extrabold text-xs shrink-0",
              node.isParentNode ? "text-blue-900 dark:text-[#a0c4ff] text-sm" : (isSubRow ? "text-amber-900 dark:text-amber-300" : "text-slate-900 dark:text-[#e3e3e3]")
            )}>
              {node.code}
            </span>
            <span className="text-slate-300 dark:text-[#555558] shrink-0 select-none">-</span>
            <span className={cn(
              "text-xs leading-snug flex-1 min-w-0 font-bold",
              node.isParentNode ? "text-blue-700 dark:text-[#8ab4f8] text-sm" : (isSubRow ? "text-amber-950 dark:text-amber-200" : "text-slate-800 dark:text-slate-200")
            )}>
              {node.name || '-'}
            </span>
          </div>

          {/* Metrics Grid */}
          <div className={cn(
            "grid grid-cols-4 gap-1 py-2 px-1 rounded-lg border text-center",
            node.isParentNode 
              ? "bg-white/95 dark:bg-[#161a24]/90 border-blue-200/80 dark:border-blue-900/50" 
              : (isSubRow ? "bg-white/90 dark:bg-[#1c1814]/90 border-amber-200/80 dark:border-amber-900/40" : "bg-white/80 dark:bg-[#18181a]/60 border-slate-200/70 dark:border-[#38383a]")
          )}>
            <div className="flex flex-col items-center min-w-0">
              <span className="text-[9px] font-medium text-slate-400 dark:text-[#838383] uppercase mb-0.5 truncate max-w-full">
                {node.isParentNode ? "Total Budget" : (isSelfRow ? "Budget (Riêng)" : "Budget")}
              </span>
              <span className="font-mono font-bold text-blue-700 dark:text-[#8ab4f8] text-xs truncate max-w-full">
                {node.isParentNode ? (
                  formatCurrency(node.totalBudget)
                ) : (
                  <EditableCell 
                    value={node.budget} 
                    type="number" 
                    isCurrency 
                    currency={currency} 
                    jpyRate={jpyRate} 
                    usdRate={usdRate} 
                    onSave={(val) => handleUpdateProject(node.project, 'budget', val)} 
                    canWrite={canWrite} 
                  />
                )}
              </span>
            </div>
            <div className="flex flex-col items-center border-l border-slate-200 dark:border-[#38383a] min-w-0">
              <div className="flex items-center justify-center gap-1 mb-0.5 max-w-full">
                <span className={cn(
                  "text-[8px] font-bold px-1.5 py-0.2 rounded border uppercase leading-tight",
                  node.hasForc 
                    ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800" 
                    : "bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-800"
                )}>
                  {node.hasForc ? 'FORC' : 'ACT'}
                </span>
              </div>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs truncate max-w-full">
                {formatCurrency(node.isParentNode ? node.totalActual : node.ownActual)}
              </span>
            </div>
            <div className="flex flex-col items-center border-l border-slate-200 dark:border-[#38383a] min-w-0">
              <span className="text-[9px] font-medium text-slate-400 dark:text-[#838383] uppercase mb-0.5 truncate max-w-full">Support Fee</span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-xs truncate max-w-full">
                {formatCurrency(node.isParentNode ? node.totalSupportingFee : node.ownSupportingFee)}
              </span>
            </div>
            <div className="flex flex-col items-center border-l border-slate-200 dark:border-[#38383a] min-w-0">
              <span className="text-[9px] font-medium text-slate-400 dark:text-[#838383] uppercase mb-0.5 truncate max-w-full">Remaining</span>
              <span className={cn("font-mono font-bold text-xs truncate max-w-full", vColor)}>
                {formatCurrency(node.remaining)}
              </span>
            </div>
          </div>

          {/* Sub-details (location, type, note & link actions) */}
          <div className="flex flex-wrap justify-between items-center text-[11px] text-slate-500 dark:text-[#a3a3a3] gap-1.5 pt-1 border-t border-slate-100 dark:border-[#333336]">
            <div className="flex items-center gap-2 flex-wrap">
              {node.location && (
                <span className="text-[10px] bg-slate-100 dark:bg-[#28282a] px-1.5 py-0.5 rounded">
                  {node.location}
                </span>
              )}
              {node.type && (
                <span className="text-[10px] bg-slate-100 dark:bg-[#28282a] px-1.5 py-0.5 rounded">
                  {node.type}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              <QuickNavButton project={node.project} title={`Quick Navigator (${node.code})`} />
              {canWrite && (
                <>
                  {node.isParentNode ? (
                    <button 
                      onClick={() => handleOpenLinkModal(node.project)}
                      className="px-2 py-1 text-[10px] font-bold text-blue-700 hover:text-white hover:bg-blue-600 dark:text-[#8ab4f8] rounded-lg bg-blue-50 dark:bg-blue-950/40 dark:hover:bg-blue-600 dark:hover:text-white transition-colors flex items-center gap-1 border border-blue-200 dark:border-blue-800 active:scale-95"
                      title="Project Modular (Set as Main)"
                    >
                      <Layers className="w-3 h-3" /> Modular
                    </button>
                  ) : (
                    !node.isSelf && (
                      <>
                        <button 
                          onClick={() => handleOpenLinkModal(node.project)}
                          className="px-2 py-0.5 text-[10px] text-blue-600 hover:text-blue-700 dark:text-[#8ab4f8] rounded bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 transition-colors flex items-center gap-1 active:scale-95"
                          title="Project Modular (Set as Main)"
                        >
                          <Layers className="w-3 h-3" /> Modular
                        </button>
                        <button 
                          onClick={() => handleLinkParent(node.project, null)}
                          className="px-2 py-0.5 text-[10px] font-bold text-red-600 hover:text-white hover:bg-red-600 bg-red-100 dark:bg-red-950/60 dark:text-red-300 dark:hover:bg-red-600 dark:hover:text-white rounded border border-red-300 dark:border-red-800 transition-colors flex items-center gap-1"
                          title="Unlink from Main"
                        >
                          <Unlink className="w-3 h-3" /> Unlink
                        </button>
                      </>
                    )
                  )}
                </>
              )}
            </div>
          </div>

          {node.note && (
            <div className="text-[10px] text-slate-500 dark:text-[#838383] italic bg-slate-50 dark:bg-[#28282a]/50 p-1.5 rounded">
              Note: {node.note}
            </div>
          )}
        </div>
      );

      if (isParent && isExpanded) {
        cards = cards.concat(renderMobileCards(node.filteredChildren, depth + 1));
      }
    });

    return cards;
  };

  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm relative">
      <button id="budget-export-btn" onClick={handleExportBudget} className="hidden" />
      <input id="budget-import-input" type="file" accept=".csv" onChange={handleImportBudget} className="hidden" />
      {currentUser.role === 'admin' && (
        <FullReplaceImport 
          collectionName="taka_projects"
          onImportSuccess={(count) => useAppStore.getState().setToast({ title: "Thông báo", message: String(`Full replace successful! Imported ${count} projects.`) })}
          onParseRow={(row, headers) => {
            const p: any = {};
            headers.forEach((h, i) => {
              let key = h;
              if (h === 'code' || h === 'project code') key = 'code';
              if (h === 'project name') key = 'name';
              if (['code', 'name', 'year', 'store', 'location', 'type', 'note', 'budget', 'id', 'no'].includes(key)) {
                let val: any = row[i];
                if (key === 'year' || key === 'no' || key === 'budget') val = isNaN(Number(val)) ? val : Number(val);
                p[key] = val;
              }
            });
            if (!p.code) return null;
            return p;
          }}
          id="budget-full-import-btn"
          hiddenBtn={true}
        />
      )}
      <div className="px-3 sm:px-4 md:px-5 py-3 md:py-4 border-b border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 flex flex-col xl:flex-row gap-3 justify-between items-stretch xl:items-center shrink-0 print:hidden">
        {/* Header Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full xl:w-auto flex-grow min-w-0">
          <select 
            value={globalYearFilter}
            onChange={(e) => setGlobalYearFilter(e.target.value)}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[85px] sm:min-w-[95px] flex-1 sm:flex-none"
          >
            <option value="all">{t('All Years')}</option>
            {years.map(y => <option key={y} value={y}>{t('Year')} {y}</option>)}
          </select>
          <select 
            value={effectiveStore}
            onChange={(e) => setGlobalStoreFilter(e.target.value)}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[85px] sm:min-w-[95px] flex-1 sm:flex-none"
          >
            {stores.length > 1 && <option value="all">{t('All Stores')}</option>}
            {stores.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <MultiCheckboxSelect 
            value={globalLocationFilter}
            onChange={setGlobalLocationFilter}
            options={locationOptions}
            placeholder="All Locations"
            className="min-w-[95px] sm:min-w-[110px] flex-1 sm:flex-none"
          />
          <select 
            value={moneyFilter}
            onChange={(e) => {
              const val = e.target.value;
              setMoneyFilter(val);
              if (!searchTerm.trim()) {
                lastSelectedMoneyFilterRef.current = val;
                safeSetItemSession("taka_budget_money_filter", val);
              }
            }}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[110px] sm:min-w-[120px] flex-1 sm:flex-none"
          >
            <option value="has_money">{t('Has Budget or Act/Forc')}</option>
            <option value="has_budget">{t('Has Budget')}</option>
            <option value="has_act_forc">{t('Has Act/Forc')}</option>
            <option value="all">{t('All Projects')}</option>
          </select>
          <div className="relative flex-grow min-w-[150px] sm:min-w-[200px] max-w-full">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400 z-10">
              <Search className="w-4 h-4" />
            </div>
            <DebouncedSearchInput 
              value={searchTerm}
              onChange={(val) => setSearchTerm(val)}
              className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block w-full pl-9 pr-8 p-2 outline-none shadow-sm" 
              placeholder={t('Search in budget...')}
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0 self-end xl:self-center">
          {canWrite && (
            <button
              onClick={() => handleOpenLinkModal()}
              className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 dark:text-[#8ab4f8] text-xs font-bold rounded-lg border border-blue-200 dark:border-blue-800/60 shadow-xs flex items-center gap-1.5 transition-colors shrink-0 whitespace-nowrap active:scale-95"
              title="Project Modular (Link Main & Sub Budget)"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Project Modular</span>
            </button>
          )}
          <ColumnAdder availableColumns={AVAILABLE_COLUMNS} visibleColumns={visibleColumns} onAddColumn={handleToggleColumn} />
        </div>
      </div>

      <div className="hidden xl:block overflow-x-auto flex-grow pb-16">
        <table className="text-sm text-left text-slate-600 dark:text-[#a3a3a3] table-fixed min-w-full" style={{ width: `${visibleColumns.reduce((acc, col) => acc + (colWidths[col as keyof typeof colWidths] || 100), 0)}px` }}>
          <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-[#1e1e20]/50 sticky top-0 border-b border-slate-200 dark:border-[#444446] z-10 shadow-sm">
            <tr>
              {visibleColumns.includes('no') && (
                <ResizableHeader width={colWidths.no} onResize={(w) => handleResize('no', w)} className="px-3 py-3 font-bold text-center" hideable onHide={() => handleToggleColumn('no')}>
                  <div className="flex items-center justify-center gap-1">
                    {t('No.') || 'No.'}
                    <button onClick={toggleAllParents} className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-blue-600 dark:text-[#8ab4f8]">
                      {expandedParents.size === 0 ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </ResizableHeader>
              )}
              {visibleColumns.includes('year') && (
                <ResizableHeader width={colWidths.year} onResize={(w) => handleResize('year', w)} className="px-4 py-3 font-bold text-center" hideable onHide={() => handleToggleColumn('year')}>
                  {t('Year')}
                </ResizableHeader>
              )}
              {visibleColumns.includes('store') && (
                <ResizableHeader width={colWidths.store} onResize={(w) => handleResize('store', w)} className="px-4 py-3 font-bold" hideable onHide={() => handleToggleColumn('store')}>
                  {t('Store')}
                </ResizableHeader>
              )}
              {visibleColumns.includes('location') && (
                <ResizableHeader width={colWidths.location} onResize={(w) => handleResize('location', w)} className="px-4 py-3 font-bold" hideable onHide={() => handleToggleColumn('location')}>
                  {t('Location')}
                </ResizableHeader>
              )}
              {visibleColumns.includes('code') && (
                <ResizableHeader width={colWidths.code} onResize={(w) => handleResize('code', w)} className="px-4 py-3 font-bold" hideable onHide={() => handleToggleColumn('code')}>
                  {t('Code')}
                </ResizableHeader>
              )}
              {visibleColumns.includes('projectName') && (
                <ResizableHeader width={colWidths.projectName} onResize={(w) => handleResize('projectName', w)} className="px-4 py-3 font-bold" hideable onHide={() => handleToggleColumn('projectName')}>
                  {t('Project Name')}
                </ResizableHeader>
              )}
              {visibleColumns.includes('totalBudget') && (
                <ResizableHeader width={colWidths.totalBudget} onResize={(w) => handleResize('totalBudget', w)} className="px-4 py-3 font-bold text-right cursor-pointer" onClick={() => handleSort('totalBudget')} hideable onHide={() => handleToggleColumn('totalBudget')}>
                  {t('Total Budget')}
                </ResizableHeader>
              )}
              {visibleColumns.includes('actual') && (
                <ResizableHeader width={colWidths.actual} onResize={(w) => handleResize('actual', w)} className="px-4 py-3 font-bold text-right cursor-pointer" onClick={() => handleSort('actual')} hideable onHide={() => handleToggleColumn('actual')}>
                  ACT / FORC
                </ResizableHeader>
              )}
              {visibleColumns.includes('supportingFee') && (
                <ResizableHeader width={colWidths.supportingFee} onResize={(w) => handleResize('supportingFee', w)} className="px-4 py-3 font-bold text-right cursor-pointer" onClick={() => handleSort('supportingFee')} hideable onHide={() => handleToggleColumn('supportingFee')}>
                  Supporting Fee
                </ResizableHeader>
              )}
              {visibleColumns.includes('variance') && (
                <ResizableHeader width={colWidths.variance} onResize={(w) => handleResize('variance', w)} className="px-4 py-3 font-bold text-right cursor-pointer" onClick={() => handleSort('variance')} hideable onHide={() => handleToggleColumn('variance')}>
                  {t('Remaining')}
                </ResizableHeader>
              )}
              {visibleColumns.includes('type') && (
                <ResizableHeader width={colWidths.type} onResize={(w) => handleResize('type', w)} className="px-4 py-3 font-bold" hideable onHide={() => handleToggleColumn('type')}>
                  {t('Type')}
                </ResizableHeader>
              )}
              {visibleColumns.includes('note') && (
                <ResizableHeader width={colWidths.note} onResize={(w) => handleResize('note', w)} className="px-4 py-3 font-bold" hideable onHide={() => handleToggleColumn('note')}>
                  {t('Note')}
                </ResizableHeader>
              )}
              {visibleColumns.includes('actions') && (
                <ResizableHeader width={colWidths.actions} onResize={(w) => handleResize('actions', w)} className="px-4 py-3 font-bold text-center" hideable onHide={() => handleToggleColumn('actions')}>
                  {t('Actions')}
                </ResizableHeader>
              )}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-blue-50 dark:bg-[#28282a] border-b-2 border-blue-200 text-sm">
              {visibleColumns.includes('no') && <td className="px-3 py-3 font-bold text-center text-blue-900 dark:text-[#8ab4f8] uppercase"></td>}
              {visibleColumns.includes('year') && <td className="px-4 py-3 font-bold text-right text-blue-900 dark:text-[#8ab4f8] uppercase"></td>}
              {visibleColumns.includes('store') && <td className="px-4 py-3 font-bold text-right text-blue-900 dark:text-[#8ab4f8] uppercase"></td>}
              {visibleColumns.includes('location') && <td className="px-4 py-3 font-bold text-right text-blue-900 dark:text-[#8ab4f8] uppercase"></td>}
              {visibleColumns.includes('code') && <td className="px-4 py-3 font-bold text-right text-blue-900 dark:text-[#8ab4f8] uppercase"></td>}
              {visibleColumns.includes('projectName') && <td className="px-4 py-3 font-bold text-right text-blue-900 dark:text-[#8ab4f8] uppercase">{t('Total')}</td>}
              {visibleColumns.includes('totalBudget') && <td className="px-4 py-3 text-right font-mono font-bold text-blue-900 dark:text-[#8ab4f8]">{formatCurrency(totalGlobalBudget)}</td>}
              {visibleColumns.includes('actual') && <td className="px-4 py-3 text-right font-mono font-bold text-blue-900 dark:text-[#8ab4f8]">{formatCurrency(totalGlobalActual)}</td>}
              {visibleColumns.includes('supportingFee') && <td className="px-4 py-3 text-right font-mono font-bold text-indigo-700 dark:text-indigo-400">{formatCurrency(totalGlobalSupportingFee)}</td>}
              {visibleColumns.includes('variance') && <td className={`px-4 py-3 text-right font-mono font-bold ${totalVarianceColor}`}>{formatCurrency(totalGlobalRemaining)}</td>}
              {visibleColumns.includes('type') && <td className="px-4 py-3"></td>}
              {visibleColumns.includes('note') && <td className="px-4 py-3"></td>}
              {visibleColumns.includes('actions') && <td className="px-4 py-3"></td>}
            </tr>
            {renderRows(filteredRoots.slice(0, visibleCount))}
            {visibleCount < filteredRoots.length && (
              <tr>
                <td colSpan={visibleColumns.length} className="py-4 text-center">
                  <button
                    onClick={() => setVisibleCount(prev => prev + 20)}
                    className="px-6 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 font-bold rounded-full shadow-sm transition-colors text-sm"
                  >
                    Load More Projects ({filteredRoots.length - visibleCount} remaining)
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View (iOS / Tablet / Small screens) */}
      <div className="xl:hidden flex-grow overflow-y-auto flex flex-col gap-3 pb-6 px-3">
        {/* Total Budget Summary Card */}
        <div className="bg-blue-50 dark:bg-[#28282a] border border-blue-200 dark:border-[#38383a] rounded-xl p-4 shadow-sm flex flex-col gap-3 mt-2">
          <div className="text-blue-900 dark:text-[#8ab4f8] font-bold uppercase text-sm tracking-wide">Total Budget Summary</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="flex flex-col">
              <span className="text-xs text-blue-700 dark:text-[#8ab4f8] font-medium mb-0.5">Total Budget</span>
              <span className="font-mono font-bold text-base sm:text-lg text-blue-900 dark:text-[#8ab4f8] truncate">{formatCurrency(totalGlobalBudget)}</span>
            </div>
            <div className="flex flex-col border-l border-blue-200 dark:border-[#38383a] pl-3">
              <span className="text-xs text-blue-700 dark:text-[#8ab4f8] font-medium mb-0.5">ACT / FORC</span>
              <span className="font-mono font-bold text-base sm:text-lg text-emerald-600 dark:text-emerald-400 truncate">{formatCurrency(totalGlobalActual)}</span>
            </div>
            <div className="flex flex-col border-l border-blue-200 dark:border-[#38383a] pl-3">
              <span className="text-xs text-blue-700 dark:text-[#8ab4f8] font-medium mb-0.5">Support Fee</span>
              <span className="font-mono font-bold text-base sm:text-lg text-indigo-700 dark:text-indigo-400 truncate">{formatCurrency(totalGlobalSupportingFee)}</span>
            </div>
            <div className="flex flex-col border-l border-blue-200 dark:border-[#38383a] pl-3">
              <span className="text-xs text-blue-700 dark:text-[#8ab4f8] font-medium mb-0.5">Remaining</span>
              <span className={cn("font-mono font-bold text-base sm:text-lg truncate", totalVarianceColor)}>{formatCurrency(totalGlobalRemaining)}</span>
            </div>
          </div>
        </div>

        {/* Expand / Collapse All Parents for Mobile */}
        <div className="flex justify-between items-center px-1">
          <span className="text-xs text-slate-500 font-medium">
            Showing {Math.min(visibleCount, filteredRoots.length)} of {filteredRoots.length} projects
          </span>
          <button 
            onClick={toggleAllParents} 
            className="flex items-center gap-1 text-xs text-blue-600 dark:text-[#8ab4f8] font-semibold hover:underline"
          >
            {expandedParents.size === 0 ? (
              <><ChevronRight className="w-3.5 h-3.5" /> Expand Parents</>
            ) : (
              <><ChevronDown className="w-3.5 h-3.5" /> Collapse Parents</>
            )}
          </button>
        </div>

        {/* Cards */}
        {renderMobileCards(filteredRoots.slice(0, visibleCount))}

        {/* Load More on Mobile */}
        {visibleCount < filteredRoots.length && (
          <div className="py-2 text-center">
            <button
              onClick={() => setVisibleCount(prev => prev + 20)}
              className="px-6 py-2.5 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 font-bold rounded-full shadow-sm transition-colors text-xs w-full max-w-xs"
            >
              Load More Projects ({filteredRoots.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>
      
      {(isLinkModalOpen || selectedParentProject) && (() => {
        const parentStats = selectedParentProject ? getProjectFinancials(selectedParentProject) : null;
        const parentStore = selectedParentProject ? String(selectedParentProject.store || '').toLowerCase() : '';
        
        const handleCloseModal = () => {
          setIsLinkModalOpen(false);
          setSelectedParentProject(null);
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-hidden pointer-events-auto">
            <motion.div
              drag
              dragControls={dragControls}
              dragListener={false}
              dragMomentum={false}
              className="bg-white dark:bg-[#1e1e20] rounded-2xl shadow-2xl w-[96vw] max-w-6xl xl:max-w-7xl h-[90vh] max-h-[860px] flex flex-col border border-slate-200 dark:border-[#333336] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            >
              {/* Modal Drag Header */}
              <div 
                onPointerDown={(e) => dragControls.start(e)}
                className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-[#333336] flex items-center justify-between bg-slate-50/90 dark:bg-[#18181a] cursor-grab active:cursor-grabbing select-none shrink-0"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-[#8ab4f8]">
                    <Layers className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-base md:text-lg text-slate-900 dark:text-[#e3e3e3]">Project Modular (Link Budget)</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleCloseModal}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/50 dark:hover:bg-[#28282a] transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Side-by-side 2 Column Layout (Desktop: Main left, Sub right | iOS: Bảng Cha trên, Bảng Con dưới) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 p-3 sm:p-4 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden bg-slate-100/40 dark:bg-[#121214]">
                {/* PANEL CHA (BẢNG 1): DỰ ÁN CHA ĐƯỢC CHỌN (Trái trên Desktop, Trên trên iOS) */}
                <div className="flex flex-col h-[500px] lg:h-full min-h-0 bg-white dark:bg-[#1c1c1f] rounded-xl border border-emerald-200/80 dark:border-emerald-900/30 shadow-xs overflow-hidden">
                  {/* Panel Header */}
                  <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/30 flex flex-col gap-2 shrink-0">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-extrabold shadow-xs">1</span>
                        <span>Choose Main Project</span>
                      </label>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                        {candidateParentProjects.length} projects
                      </span>
                    </div>

                    {/* Search Input */}
                    <div className="relative">
                      <DebouncedSearchInput 
                        placeholder="Search main project by code, name, area..."
                        value={parentSearchTerm}
                        onChange={(val) => setParentSearchTerm(val)}
                        className="w-full pl-3 pr-8 py-1.5 border rounded-lg bg-white dark:bg-[#18181a] border-slate-200 dark:border-[#38383a] text-xs text-slate-900 dark:text-[#e3e3e3] focus:ring-2 focus:ring-emerald-500 outline-none shadow-xs font-medium"
                      />
                    </div>
                  </div>

                  {/* Parent Candidates Scrollable List */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                      Main Project List ({candidateParentProjects.length}) — Click to select
                    </div>
                    {candidateParentProjects.length === 0 ? (
                      <div className="py-16 text-center text-slate-400 dark:text-slate-500">
                        <p className="text-sm font-medium">No matching project found</p>
                        <p className="text-xs mt-1">Please adjust your search.</p>
                      </div>
                    ) : (
                      candidateParentProjects.map(p => {
                        const pStats = getProjectFinancials(p);
                        const pStore = String(p.store || '').toLowerCase();
                        const isSelected = selectedParentProject?.id === p.id || (selectedParentProject?.code === p.code && selectedParentProject?.year === p.year && selectedParentProject?.store === p.store);

                        return (
                          <div 
                            key={p.id || `${p.code}-${p.year}-${p.store}-${p.no}`} 
                            onClick={() => setSelectedParentProject(p)}
                            className={cn(
                              "p-3 rounded-xl cursor-pointer transition-all border flex flex-col gap-2 relative group",
                              isSelected
                                ? "bg-emerald-50/90 border-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-700 shadow-sm ring-2 ring-emerald-400/30"
                                : "bg-slate-50/70 hover:bg-emerald-50/40 dark:bg-[#222225] dark:hover:bg-[#28282b] border-slate-200 dark:border-[#38383a] hover:border-emerald-300 shadow-xs"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono font-extrabold text-xs text-slate-900 dark:text-[#e3e3e3]">
                                  {p.code}
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-700 dark:bg-[#1e1e20] dark:text-[#c3c3c3]">
                                  {p.year || '-'}
                                </span>
                                <span className={cn(
                                  "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                                  pStore === 'hcm' ? 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400' :
                                  pStore === 'hn' ? 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400' :
                                  'bg-slate-100 text-slate-700'
                                )}>
                                  {p.store || '-'}
                                </span>
                                {p.location && (
                                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                    {p.location}
                                  </span>
                                )}
                              </div>

                              {isSelected ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white flex items-center gap-1 shrink-0">
                                  <Check className="w-3 h-3" /> Selected Main
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded bg-white dark:bg-[#18181a] text-slate-600 dark:text-[#a3a3a3] group-hover:bg-emerald-600 group-hover:text-white transition-colors shrink-0 flex items-center gap-1 border border-slate-200 dark:border-[#38383a]">
                                  Select Main &rarr;
                                </span>
                              )}
                            </div>

                            <div className="text-xs font-bold text-slate-900 dark:text-[#e3e3e3] leading-snug">
                              {p.name || '-'}
                            </div>

                            <div className="grid grid-cols-4 gap-1.5 text-center bg-white dark:bg-[#18181a] p-1.5 rounded-lg border border-slate-200/60 dark:border-[#333336]">
                              <div>
                                <div className="text-[8px] uppercase tracking-wider text-slate-400 font-semibold truncate">Budget</div>
                                <div className="text-xs font-bold font-mono text-slate-800 dark:text-[#e3e3e3] truncate">{formatCurrency(pStats.budget)}</div>
                              </div>
                              <div>
                                <div className="flex items-center justify-center gap-1">
                                  <div className="text-[8px] uppercase tracking-wider text-slate-400 font-semibold truncate">Cost</div>
                                  {pStats.actual !== 0 && (
                                    <span className={cn("text-[8px] font-bold px-1 py-0 rounded border uppercase leading-none", pStats.hasForc ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800" : "bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-800")}>
                                      {pStats.hasForc ? 'FORC' : 'ACT'}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400 truncate">{formatCurrency(pStats.actual)}</div>
                              </div>
                              <div>
                                <div className="text-[8px] uppercase tracking-wider text-slate-400 font-semibold truncate">Support</div>
                                <div className="text-xs font-bold font-mono text-indigo-600 dark:text-indigo-400 truncate">{formatCurrency(pStats.supportingFee)}</div>
                              </div>
                              <div>
                                <div className="text-[8px] uppercase tracking-wider text-slate-400 font-semibold truncate">Remaining</div>
                                <div className={cn("text-xs font-bold font-mono truncate", pStats.remaining < 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400")}>
                                  {formatCurrency(pStats.remaining)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* PANEL CON (BẢNG 2): DỰ ÁN CON CẦN LIÊN KẾT (Phải trên Desktop, Dưới trên iOS) */}
                <div className="flex flex-col h-[500px] lg:h-full min-h-0 bg-white dark:bg-[#1c1c1f] rounded-xl border border-blue-200/80 dark:border-blue-900/30 shadow-xs overflow-hidden">
                  {/* Panel Header */}
                  <div className="p-3 bg-blue-50/60 dark:bg-blue-950/20 border-b border-blue-100 dark:border-blue-900/30 flex flex-col gap-2 shrink-0">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-extrabold shadow-xs">2</span>
                        <span>Choose Sub Project</span>
                      </label>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                        {candidateChildProjects.length} projects
                      </span>
                    </div>

                    {/* Search Input */}
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
                      <DebouncedSearchInput
                        placeholder="Search sub project by code, name, area..."
                        value={childSearchTerm}
                        onChange={(val) => setChildSearchTerm(val)}
                        className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-[#38383a] bg-white dark:bg-[#18181a] text-slate-900 dark:text-[#e3e3e3] focus:ring-2 focus:ring-blue-500 outline-none shadow-xs font-medium"
                      />
                    </div>
                  </div>

                  {/* Child Projects Scrollable List */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
                    {!selectedParentProject ? (
                      <div className="py-16 text-center text-slate-400 dark:text-slate-500">
                        <p className="text-sm font-medium">Main project not selected</p>
                        <p className="text-xs mt-1">Please select a Main project from the panel first.</p>
                      </div>
                    ) : candidateChildProjects.length === 0 ? (
                      <div className="py-12 text-center text-xs text-slate-400">
                        No matching sub project found
                      </div>
                    ) : (
                      candidateChildProjects.map(p => {
                        const pStats = getProjectFinancials(p);
                        const pStore = String(p.store || '').toLowerCase();
                        const isCurrentChild = selectedParentProject && p.parentId && String(p.parentId).trim().toUpperCase() === String(selectedParentProject.code).trim().toUpperCase();
                        const hasOtherParent = p.parentId && !isCurrentChild;

                        return (
                          <div
                            key={p.id || `${p.code}-${p.year}-${p.store}-${p.no}`}
                            className={cn(
                              "p-2.5 rounded-xl transition-all border flex flex-col gap-1.5",
                              isCurrentChild
                                ? "bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700 shadow-xs ring-2 ring-emerald-500/20"
                                : "bg-slate-50/70 hover:bg-blue-50/40 dark:bg-[#222225] dark:hover:bg-[#28282b] border-slate-200 dark:border-[#38383a]"
                            )}
                          >
                            <div className="flex items-center justify-between gap-1 flex-wrap">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono font-extrabold text-xs text-slate-900 dark:text-[#e3e3e3]">
                                  {p.code}
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-200/70 text-slate-700 dark:bg-[#18181a] dark:text-[#c3c3c3]">
                                  {p.year || '-'}
                                </span>
                                <span className={cn(
                                  "text-[10px] font-bold px-1.5 py-0.2 rounded uppercase",
                                  pStore === 'hcm' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' :
                                  pStore === 'hn' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' :
                                  'bg-slate-100 text-slate-700 dark:bg-[#18181a] dark:text-[#c3c3c3]'
                                )}>
                                  {p.store || '-'}
                                </span>
                                {p.location && (
                                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                    {p.location}
                                  </span>
                                )}
                                {hasOtherParent && (
                                  <span className="text-[9px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 rounded">
                                    Sub of: {p.parentId}
                                  </span>
                                )}
                                {(() => {
                                  const directSubCount = projects.filter(child => child.parentId && String(child.parentId).trim().toUpperCase() === String(p.code || '').trim().toUpperCase()).length;
                                  if (directSubCount > 0) {
                                    return (
                                      <span className="text-[9px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                                        ✨ Has {directSubCount} sub(s) (will move to new Main)
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>

                              {isCurrentChild ? (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5">
                                    <Check className="w-3 h-3" /> Linked
                                  </span>
                                  <button
                                    onClick={() => handleLinkParent(p, null)}
                                    className="px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-100 hover:bg-red-200 dark:bg-red-950/60 rounded border border-red-300 dark:border-red-800 transition-colors flex items-center gap-1"
                                    title="Unlink from Main"
                                  >
                                    <Unlink className="w-3 h-3" /> Unlink
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleLinkParent(p, selectedParentProject.code)}
                                  className="px-2.5 py-1 text-[10px] font-bold text-blue-700 dark:text-[#8ab4f8] bg-blue-50 hover:bg-blue-600 hover:text-white dark:bg-blue-950/40 dark:hover:bg-blue-600 dark:hover:text-white rounded-lg border border-blue-200 dark:border-blue-800 transition-colors shrink-0 flex items-center gap-1"
                                >
                                  <LinkIcon className="w-3 h-3" /> Set as Sub
                                </button>
                              )}
                            </div>

                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {p.name || '-'}
                            </div>

                            <div className="grid grid-cols-4 gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-mono pt-1 border-t border-slate-200/60 dark:border-[#2e2e32] text-center">
                              <span className="truncate">Bud: <strong className="text-slate-700 dark:text-slate-300">{formatCurrency(pStats.budget)}</strong></span>
                              <span className="truncate flex items-center justify-center gap-0.5">Act: {pStats.actual !== 0 && (
                                  <span className={cn("text-[7px] font-bold px-1 py-0 rounded border uppercase leading-none", pStats.hasForc ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800" : "bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-800")}>
                                    {pStats.hasForc ? 'FORC' : 'ACT'}
                                  </span>
                                )} <strong className="text-emerald-600 dark:text-emerald-400">{formatCurrency(pStats.actual)}</strong></span>
                              <span className="truncate">Supp: <strong className="text-indigo-600 dark:text-indigo-400">{formatCurrency(pStats.supportingFee)}</strong></span>
                              <span className="truncate">Rem: <strong className={pStats.remaining < 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}>{formatCurrency(pStats.remaining)}</strong></span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-3.5 border-t border-slate-200 dark:border-[#333336] bg-slate-50/90 dark:bg-[#18181a] flex justify-between items-center shrink-0">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {selectedParentProject 
                    ? `Managing links for Main project: [${selectedParentProject.code}] — ${selectedParentProject.name}`
                    : 'Please select a Main project to manage subs'}
                </span>
                <button 
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-200/70 hover:bg-slate-300 dark:bg-[#2e2e32] dark:hover:bg-[#38383c] rounded-xl transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        );
      })()}
    </div>
  );
}
