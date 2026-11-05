import React, { useMemo, useState } from 'react';
import { motion, useDragControls } from 'motion/react';
import {
  ShieldCheck,
  AlertTriangle,
  FileWarning,
  TrendingDown,
  GripHorizontal,
  X,
  ExternalLink,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { Project, Cost } from '../../types';
import { cn } from '../../lib/utils';
import { isCostBelongsToProject } from './costMatchingEngine';

interface CostHealthInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  costs: Cost[];
  globalYearFilter: string;
  effectiveStore: string;
  formatCurrency: (val: number | undefined) => string;
  canWrite: boolean;
  onSelectProjectCode: (code: string) => void;
  onDeleteOrphanCost?: (cost: Cost) => void;
}

type HealthTab = 'orphans' | 'overpaid' | 'overbudget';

export const CostHealthInspectorModal: React.FC<CostHealthInspectorModalProps> = ({
  isOpen,
  onClose,
  projects,
  costs,
  globalYearFilter,
  effectiveStore,
  formatCurrency,
  canWrite,
  onSelectProjectCode,
  onDeleteOrphanCost,
}) => {
  const dragControls = useDragControls();
  const [activeTab, setActiveTab] = useState<HealthTab>('orphans');

  const auditResults = useMemo(() => {
    const activeProjects = projects.filter((p) => !p.isDeleted);
    const allProjectIds = new Set<string>(
      activeProjects.map((p) => (p.id ? String(p.id).trim() : '')).filter(Boolean)
    );

    const scopedCosts = costs.filter((c) => {
      if (!c || c.isDeleted) return false;
      const cYear = String(
        c.projectYear !== undefined && c.projectYear !== null
          ? c.projectYear
          : (c as any).year || ''
      ).trim();
      if (
        globalYearFilter !== 'all' &&
        cYear &&
        cYear.toLowerCase() !== 'all' &&
        cYear !== String(globalYearFilter).trim()
      ) {
        return false;
      }
      const cStore = String(c.projectStore || (c as any).store || '')
        .trim()
        .toUpperCase();
      if (
        effectiveStore !== 'all' &&
        cStore &&
        cStore !== effectiveStore.trim().toUpperCase()
      ) {
        return false;
      }
      return true;
    });

    const orphanedCosts: Cost[] = [];
    const overpaidCosts: Array<{ cost: Cost; totalPaid: number; excess: number }> = [];

    for (let i = 0; i < scopedCosts.length; i++) {
      const c = scopedCosts[i];
      const matchesAnyProject = activeProjects.some((p) => {
        const knownOthers = new Set<string>(allProjectIds);
        if (p.id) knownOthers.delete(String(p.id).trim());
        return isCostBelongsToProject(c, p, knownOthers);
      });

      if (!matchesAnyProject) {
        orphanedCosts.push(c);
      }

      const act = Number(c.actual) || 0;
      const paid =
        (Number(c.firstPaid) || 0) +
        (Number(c.secondPaid) || 0) +
        (Number(c.thirdPaid) || 0);
      if (paid > act) {
        overpaidCosts.push({ cost: c, totalPaid: paid, excess: paid - act });
      }
    }

    const scopedProjects = activeProjects.filter((p) => {
      const pYear = p.year
        ? String(p.year).trim()
        : p.start
        ? String(p.start).substring(0, 4)
        : '';
      if (globalYearFilter !== 'all' && pYear !== String(globalYearFilter).trim()) {
        return false;
      }
      if (
        effectiveStore !== 'all' &&
        String(p.store || '').toUpperCase().trim() !== effectiveStore.toUpperCase().trim()
      ) {
        return false;
      }
      return true;
    });

    const overBudgetProjects: Array<{
      project: Project;
      budget: number;
      actual: number;
      sup: number;
      remaining: number;
      burnPct: number;
    }> = [];

    for (let i = 0; i < scopedProjects.length; i++) {
      const p = scopedProjects[i];
      const knownOthers = new Set<string>(allProjectIds);
      if (p.id) knownOthers.delete(String(p.id).trim());
      const pCosts = scopedCosts.filter((c) => isCostBelongsToProject(c, p, knownOthers));
      const actual = pCosts.reduce((s, c) => s + (Number(c.actual) || 0), 0);
      const sup =
        pCosts.length > 0
          ? pCosts.reduce((s, c) => s + (Number(c.supportingFee) || 0), 0)
          : Number(p.supportingFee) || 0;
      const budget = Number(p.financial?.totalApproved ?? p.budget) || 0;
      const remaining = budget - actual + sup;

      if (remaining < 0) {
        const netSpend = Math.max(0, actual - sup);
        const burnPct = budget > 0 ? Math.round((netSpend / budget) * 100) : 100;
        overBudgetProjects.push({
          project: p,
          budget,
          actual,
          sup,
          remaining,
          burnPct,
        });
      }
    }

    return {
      orphanedCosts,
      overpaidCosts,
      overBudgetProjects,
      totalIssues:
        orphanedCosts.length + overpaidCosts.length + overBudgetProjects.length,
    };
  }, [projects, costs, globalYearFilter, effectiveStore]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-3 bg-slate-900/50 dark:bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <motion.div
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-3xl bg-white dark:bg-[#1e1e20] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#38383a] overflow-hidden flex flex-col max-h-[84vh]"
      >
        {/* Draggable Modal Header */}
        <div
          onPointerDown={(e) => dragControls.start(e)}
          className="modal-handle flex items-center justify-between px-4 py-3 bg-slate-100 dark:bg-[#252528] border-b border-slate-200 dark:border-[#333336] cursor-grab active:cursor-grabbing select-none"
        >
          <div className="flex items-center gap-2">
            <GripHorizontal className="w-4 h-4 text-slate-400" />
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">
              Financial Data Health & Reconciliation Inspector
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-200 dark:bg-[#333336] text-slate-700 dark:text-slate-300 font-bold">
              Scope: {effectiveStore === 'all' ? 'All Stores' : effectiveStore} •{' '}
              {globalYearFilter === 'all' ? 'All Years' : globalYearFilter}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-[#38383a] transition-colors cursor-pointer"
            title="Close Inspector"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-[#18181a] border-b border-slate-200 dark:border-[#333336]">
          <button
            type="button"
            onClick={() => setActiveTab('orphans')}
            className={cn(
              'flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95',
              activeTab === 'orphans'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-700 text-amber-800 dark:text-amber-300 shadow-2xs'
                : 'bg-white dark:bg-[#1e1e20] border-slate-200 dark:border-[#333336] text-slate-600 dark:text-slate-300'
            )}
          >
            <span className="flex items-center gap-1.5">
              <FileWarning className="w-3.5 h-3.5 text-amber-500" />
              <span>Orphaned Costs</span>
            </span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
              {auditResults.orphanedCosts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('overpaid')}
            className={cn(
              'flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95',
              activeTab === 'overpaid'
                ? 'bg-red-50 dark:bg-red-950/40 border-red-400 dark:border-red-700 text-red-800 dark:text-red-300 shadow-2xs'
                : 'bg-white dark:bg-[#1e1e20] border-slate-200 dark:border-[#333336] text-slate-600 dark:text-slate-300'
            )}
          >
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
              <span>Paid &gt; Actual</span>
            </span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200">
              {auditResults.overpaidCosts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('overbudget')}
            className={cn(
              'flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95',
              activeTab === 'overbudget'
                ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-400 dark:border-purple-700 text-purple-800 dark:text-purple-300 shadow-2xs'
                : 'bg-white dark:bg-[#1e1e20] border-slate-200 dark:border-[#333336] text-slate-600 dark:text-slate-300'
            )}
          >
            <span className="flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-purple-500" />
              <span>Over-Budget</span>
            </span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200">
              {auditResults.overBudgetProjects.length}
            </span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {activeTab === 'orphans' && (
            <>
              {auditResults.orphanedCosts.length === 0 ? (
                <div className="py-10 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    0 Orphaned Cost Entries
                  </p>
                  <p className="text-xs">
                    Every cost entry in this scope is cleanly linked to an active project.
                  </p>
                </div>
              ) : (
                auditResults.orphanedCosts.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-mono font-bold text-amber-800 dark:text-amber-300">
                        <span>Code: {c.projectCode || (c as any).code || 'UNSET'}</span>
                        <span>•</span>
                        <span>Store: {c.projectStore || 'N/A'}</span>
                        <span>•</span>
                        <span>Year: {c.projectYear || 'N/A'}</span>
                        {c.projectId && <span>• ID: {c.projectId}</span>}
                      </div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 truncate">
                        {c.description || 'Untitled Cost Entry'}{' '}
                        {c.vendor ? `(${c.vendor})` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(c.actual)}
                      </span>
                      {canWrite && onDeleteOrphanCost && (
                        <button
                          type="button"
                          onClick={() => onDeleteOrphanCost(c)}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors cursor-pointer"
                          title="Delete orphaned cost record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {activeTab === 'overpaid' && (
            <>
              {auditResults.overpaidCosts.length === 0 ? (
                <div className="py-10 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    All Payment Milestones Within Actual/Forecast
                  </p>
                  <p className="text-xs">
                    No cost entries have 1st + 2nd + 3rd Paid exceeding Actual/Forecast.
                  </p>
                </div>
              ) : (
                auditResults.overpaidCosts.map(({ cost: c, totalPaid, excess }) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/20 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-blue-700 dark:text-blue-400 uppercase">
                          {c.projectCode}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 font-bold">
                          Exceeds by +{formatCurrency(excess)}
                        </span>
                      </div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 truncate">
                        {c.description || 'Cost Entry'}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                        Actual: {formatCurrency(c.actual)} | Total Paid: {formatCurrency(totalPaid)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (c.projectCode) onSelectProjectCode(c.projectCode);
                        onClose();
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1 shrink-0 cursor-pointer active:scale-95"
                    >
                      <span>Inspect</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </>
          )}

          {activeTab === 'overbudget' && (
            <>
              {auditResults.overBudgetProjects.length === 0 ? (
                <div className="py-10 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    0 Over-Budget Projects
                  </p>
                  <p className="text-xs">
                    All projects in this scope have non-negative Remaining budget.
                  </p>
                </div>
              ) : (
                auditResults.overBudgetProjects.map(
                  ({ project: p, budget, actual, remaining, burnPct }) => (
                    <div
                      key={p.id || p.code}
                      className="p-3 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/30 dark:bg-purple-950/20 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold text-blue-700 dark:text-blue-400 uppercase">
                            {p.code}
                          </span>
                          <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                            {p.name}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 font-bold">
                            {burnPct}% Burn
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                          Budget: {formatCurrency(budget)} • Actual: {formatCurrency(actual)} •{' '}
                          <span className="text-red-600 dark:text-red-400 font-bold">
                            Remaining: {formatCurrency(remaining)}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (p.code) onSelectProjectCode(p.code);
                          onClose();
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1 shrink-0 cursor-pointer active:scale-95"
                      >
                        <span>Filter Project</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  )
                )
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default CostHealthInspectorModal;
