import React from 'react';
import {
  Server,
  HardDrive,
  Zap,
  Radio,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { CollectionStatItem } from './performanceTypes';

interface PerformanceMetricsCardsProps {
  serverReads: number;
  cacheReads: number;
  cacheEfficiency: string;
  activeListeners: number;
  sessionDuration: string;
  heavyCollections: CollectionStatItem[];
}

export const PerformanceMetricsCards: React.FC<PerformanceMetricsCardsProps> = ({
  serverReads,
  cacheReads,
  cacheEfficiency,
  activeListeners,
  sessionDuration,
  heavyCollections,
}) => {
  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* Billable Reads */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#27272a] border border-slate-200 dark:border-[#3f3f46] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa]">
              Billable Server Reads
            </span>
            <Server className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {serverReads.toLocaleString()}
              </span>
              <span className="text-xs font-medium text-slate-500">docs</span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px]">
              {serverReads < 200 ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5">
                  <CheckCircle2 className="w-3 h-3" /> Highly Optimized
                </span>
              ) : serverReads < 1500 ? (
                <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-0.5">
                  <AlertTriangle className="w-3 h-3" /> Moderate
                </span>
              ) : (
                <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-0.5">
                  <AlertTriangle className="w-3 h-3" /> High Query Spike
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Cache Reads */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#27272a] border border-slate-200 dark:border-[#3f3f46] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa]">
              Saved by Cache (Free)
            </span>
            <HardDrive className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {cacheReads.toLocaleString()}
              </span>
              <span className="text-xs font-medium text-slate-500">docs</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-[#a1a1aa]">
              Served instantly from local IndexedDB
            </p>
          </div>
        </div>

        {/* Cache Efficiency Ratio */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#27272a] border border-slate-200 dark:border-[#3f3f46] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa]">
              Cache Hit Ratio
            </span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {cacheEfficiency}%
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-[#3f3f46] h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, parseFloat(cacheEfficiency)))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Active Listeners & Duration */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#27272a] border border-slate-200 dark:border-[#3f3f46] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa]">
              Active Subscriptions
            </span>
            <Radio className="w-4 h-4 text-purple-500 animate-pulse" />
          </div>
          <div className="mt-2.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-purple-600 dark:text-purple-400">
                {activeListeners}
              </span>
              <span className="text-xs font-medium text-slate-500">listeners</span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500 dark:text-[#a1a1aa]">
              <Clock className="w-3 h-3" /> Session time: {sessionDuration}
            </div>
          </div>
        </div>
      </div>

      {/* Diagnostics / Inefficiency Alerts */}
      {heavyCollections.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex items-start gap-3 text-xs">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-sm">Query Pattern Notice:</span> Heavy server traffic detected in{' '}
            {heavyCollections.map((c) => `"${c.name}" (${c.serverReads} reads)`).join(', ')}. This is standard during
            the first load on a fresh device without pre-existing cache, but subsequent reloads will read from IndexedDB.
          </div>
        </div>
      )}
    </div>
  );
};
