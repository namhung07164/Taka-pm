import React, { useEffect, useMemo, useState } from 'react';
import { motion, useDragControls } from 'motion/react';
import { Layers, X, Filter, RotateCcw } from 'lucide-react';
import { Project } from '../../types';
import { ProjectFinancials } from './budgetTypes';
import { useLanguage } from '../../lib/LanguageContext';
import { getZIndexClass } from '../../lib/zIndexManager';
import { BudgetLinkParentColumn } from './BudgetLinkParentColumn';
import { BudgetLinkChildColumn } from './BudgetLinkChildColumn';

interface BudgetLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedParentProject: Project | null;
  setSelectedParentProject: (p: Project | null) => void;
  parentSearchTerm: string;
  setParentSearchTerm: (term: string) => void;
  childSearchTerm: string;
  setChildSearchTerm: (term: string) => void;
  candidateParentProjects: Project[];
  candidateChildProjects: Project[];
  linkedChildrenCount: number;
  getProjectFinancials: (p: Project) => ProjectFinancials;
  handleLinkParent: (childProject: Project, parentCode: string | null) => Promise<void>;
  formatCurrency: (val: number | undefined) => string;
  projects?: Project[];
  initialYear?: string;
  initialStore?: string;
  initialLocation?: string;
}

export function BudgetLinkModal({
  isOpen,
  onClose,
  selectedParentProject,
  setSelectedParentProject,
  parentSearchTerm,
  setParentSearchTerm,
  childSearchTerm,
  setChildSearchTerm,
  candidateParentProjects,
  candidateChildProjects,
  linkedChildrenCount,
  getProjectFinancials,
  handleLinkParent,
  formatCurrency,
  projects,
  initialYear,
  initialStore,
  initialLocation
}: BudgetLinkModalProps) {
  const { t } = useLanguage();
  const dragControls = useDragControls();

  const [modalYearFilter, setModalYearFilter] = useState<string>(initialYear || 'all');
  const [modalStoreFilter, setModalStoreFilter] = useState<string>(initialStore || 'all');
  const [modalLocationFilter, setModalLocationFilter] = useState<string>(initialLocation || 'all');

  useEffect(() => {
    if (isOpen) {
      if (selectedParentProject) {
        if (selectedParentProject.year) setModalYearFilter(String(selectedParentProject.year));
        if (selectedParentProject.store) setModalStoreFilter(String(selectedParentProject.store).toUpperCase());
      } else {
        setModalYearFilter(initialYear || 'all');
        setModalStoreFilter(initialStore || 'all');
        setModalLocationFilter(initialLocation || 'all');
      }
    }
  }, [isOpen, selectedParentProject, initialYear, initialStore, initialLocation]);

  const allProjects = projects && projects.length > 0 ? projects : candidateParentProjects;

  const availableYears = useMemo(() => {
    const set = new Set<string>();
    allProjects.forEach(p => {
      if (p.year) set.add(String(p.year).trim());
      else if (p.start) set.add(String(p.start).substring(0, 4));
    });
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [allProjects]);

  const availableLocations = useMemo(() => {
    const set = new Set<string>();
    allProjects.forEach(p => {
      if (p.location && p.location.trim()) {
        set.add(p.location.trim());
      }
    });
    return Array.from(set).sort();
  }, [allProjects]);

  const filteredParentProjects = useMemo(() => {
    const term = parentSearchTerm.trim().toLowerCase();
    return allProjects.filter(p => {
      if (modalYearFilter !== 'all') {
        const pYear = p.year ? String(p.year).trim() : (p.start ? String(p.start).substring(0, 4) : '');
        if (pYear && pYear !== modalYearFilter) return false;
      }
      if (modalStoreFilter !== 'all') {
        const pStore = String(p.store || '').trim().toUpperCase();
        if (pStore && pStore !== modalStoreFilter.toUpperCase()) return false;
      }
      if (modalLocationFilter !== 'all') {
        if (p.location !== modalLocationFilter) return false;
      }
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
  }, [allProjects, parentSearchTerm, modalYearFilter, modalStoreFilter, modalLocationFilter]);

  const filteredChildProjects = useMemo(() => {
    const parentCode = selectedParentProject ? String(selectedParentProject.code || '').trim().toUpperCase() : '';
    const parentId = selectedParentProject?.id || (selectedParentProject ? `${selectedParentProject.code}-${selectedParentProject.year}-${selectedParentProject.store}-${selectedParentProject.no}` : '');
    const term = childSearchTerm.trim().toLowerCase();

    const filtered = allProjects.filter(p => {
      const pId = p.id || `${p.code}-${p.year}-${p.store}-${p.no}`;
      const pCode = String(p.code || '').trim().toUpperCase();

      if (selectedParentProject && (pId === parentId || pCode === parentCode)) return false;
      if (selectedParentProject?.parentId && String(selectedParentProject.parentId).trim().toUpperCase() === pCode) return false;

      const targetYear = selectedParentProject?.year 
        ? String(selectedParentProject.year).trim() 
        : (modalYearFilter !== 'all' ? modalYearFilter : '');
      if (targetYear) {
        const pYear = p.year ? String(p.year).trim() : (p.start ? String(p.start).substring(0, 4) : '');
        if (pYear && pYear !== targetYear) return false;
      }

      const targetStore = selectedParentProject?.store 
        ? String(selectedParentProject.store).trim().toUpperCase() 
        : (modalStoreFilter !== 'all' ? modalStoreFilter.toUpperCase() : '');
      if (targetStore) {
        const pStore = String(p.store || '').trim().toUpperCase();
        if (pStore && pStore !== targetStore) return false;
      }

      if (modalLocationFilter !== 'all') {
        if (p.location !== modalLocationFilter) return false;
      }

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

    if (parentCode) {
      filtered.sort((a, b) => {
        const aIsChild = a.parentId && String(a.parentId).trim().toUpperCase() === parentCode ? 1 : 0;
        const bIsChild = b.parentId && String(b.parentId).trim().toUpperCase() === parentCode ? 1 : 0;
        return bIsChild - aIsChild;
      });
    }

    return filtered.slice(0, 100);
  }, [allProjects, selectedParentProject, childSearchTerm, modalYearFilter, modalStoreFilter, modalLocationFilter]);

  if (!isOpen && !selectedParentProject) return null;

  const parentStats = selectedParentProject ? getProjectFinancials(selectedParentProject) : null;

  return (
    <div className={`fixed inset-0 ${getZIndexClass('MODAL_MODULAR')} flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-hidden pointer-events-auto`}>
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
            <h3 className="font-bold text-base md:text-lg text-slate-900 dark:text-[#e3e3e3]">
              {t('Project Modular (Link Budget)')}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/50 dark:hover:bg-[#28282a] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scope Filter Toolbar: Year, Store, Location */}
        <div className="px-3.5 sm:px-4 py-2 bg-slate-50 dark:bg-[#18181a] border-b border-slate-200 dark:border-[#333336] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 mr-1">
              <Filter className="w-3.5 h-3.5 text-blue-600 dark:text-[#8ab4f8]" />
              <span>{t('Filter Scope')}:</span>
            </div>

            {/* Year Selector */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{t('Year')}:</span>
              <select
                value={modalYearFilter}
                onChange={(e) => setModalYearFilter(e.target.value)}
                className="text-xs bg-white dark:bg-[#222225] border border-slate-200 dark:border-[#444446] rounded-lg px-2 py-1 font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer shadow-2xs"
              >
                <option value="all">{t('All Years')}</option>
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Store Selector */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{t('Store')}:</span>
              <select
                value={modalStoreFilter}
                onChange={(e) => setModalStoreFilter(e.target.value)}
                className="text-xs bg-white dark:bg-[#222225] border border-slate-200 dark:border-[#444446] rounded-lg px-2 py-1 font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer shadow-2xs"
              >
                <option value="all">{t('All Stores')}</option>
                <option value="HCM">HCM</option>
                <option value="HN">HN</option>
              </select>
            </div>

            {/* Location Selector */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{t('Location')}:</span>
              <select
                value={modalLocationFilter}
                onChange={(e) => setModalLocationFilter(e.target.value)}
                className="text-xs bg-white dark:bg-[#222225] border border-slate-200 dark:border-[#444446] rounded-lg px-2 py-1 font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer shadow-2xs max-w-[140px] truncate"
              >
                <option value="all">{t('All Locations')}</option>
                {availableLocations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Reset Filter */}
          {(modalYearFilter !== 'all' || modalStoreFilter !== 'all' || modalLocationFilter !== 'all') && (
            <button
              onClick={() => {
                setModalYearFilter('all');
                setModalStoreFilter('all');
                setModalLocationFilter('all');
              }}
              className="text-[11px] font-bold text-slate-500 hover:text-blue-600 dark:hover:text-[#8ab4f8] flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{t('Reset Filter')}</span>
            </button>
          )}
        </div>

        {/* Modal Main Content: 2 Columns Side-by-Side */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 p-3 sm:p-4 overflow-y-auto lg:overflow-hidden">
          {/* Column 1: Parent Projects */}
          <BudgetLinkParentColumn
            filteredParentProjects={filteredParentProjects}
            selectedParentProject={selectedParentProject}
            setSelectedParentProject={setSelectedParentProject}
            parentSearchTerm={parentSearchTerm}
            setParentSearchTerm={setParentSearchTerm}
            parentStats={parentStats}
            linkedChildrenCount={linkedChildrenCount}
            formatCurrency={formatCurrency}
          />

          {/* Column 2: Child Projects */}
          <BudgetLinkChildColumn
            selectedParentProject={selectedParentProject}
            childSearchTerm={childSearchTerm}
            setChildSearchTerm={setChildSearchTerm}
            filteredChildProjects={filteredChildProjects}
            handleLinkParent={handleLinkParent}
            getProjectFinancials={getProjectFinancials}
            formatCurrency={formatCurrency}
          />
        </div>
      </motion.div>
    </div>
  );
}
