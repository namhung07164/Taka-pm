import React from 'react';
import { Database, Search } from 'lucide-react';
import { ReadEvent } from '../../store/usePerformanceStore';
import { DebouncedSearchInput } from '../DebouncedSearchInput';

interface PerformanceEventLogsProps {
  currentUserInfo: string;
  deviceInfo: string;
  filterType: 'all' | 'server' | 'cache';
  setFilterType: (val: 'all' | 'server' | 'cache') => void;
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  filteredEvents: ReadEvent[];
  totalEventCount: number;
}

export const PerformanceEventLogs: React.FC<PerformanceEventLogsProps> = ({
  currentUserInfo,
  deviceInfo,
  filterType,
  setFilterType,
  searchTerm,
  setSearchTerm,
  filteredEvents,
  totalEventCount,
}) => {
  return (
    <div className="lg:col-span-6 bg-white dark:bg-[#27272a] rounded-xl border border-slate-200 dark:border-[#3f3f46] shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-2.5 border-b border-slate-100 dark:border-[#3f3f46] bg-slate-50/50 dark:bg-[#27272a] flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h4 className="text-xs font-bold text-slate-700 dark:text-[#e4e4e7] uppercase tracking-wider flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-emerald-500" />
            Live Read Events Log
          </h4>
          <span className="text-[10px] text-slate-400 font-medium">
            Session: {currentUserInfo} • {deviceInfo}
          </span>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#18181b] p-0.5 rounded-lg border border-slate-200/80 dark:border-[#3f3f46]">
          <button
            onClick={() => setFilterType('all')}
            className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-colors ${
              filterType === 'all'
                ? 'bg-white dark:bg-[#27272a] text-slate-800 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            All ({totalEventCount})
          </button>
          <button
            onClick={() => setFilterType('server')}
            className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-colors ${
              filterType === 'server'
                ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            Server Only
          </button>
          <button
            onClick={() => setFilterType('cache')}
            className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-colors ${
              filterType === 'cache'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            Cache Only
          </button>
        </div>
      </div>

      {/* Search bar inside logs */}
      <div className="px-3 py-1.5 bg-slate-50 dark:bg-[#1f1f22] border-b border-slate-100 dark:border-[#3f3f46] flex items-center gap-2 relative">
        <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" />
        <DebouncedSearchInput
          placeholder="Search collection name..."
          value={searchTerm}
          onChange={(val) => setSearchTerm(val)}
          className="w-full pl-6 pr-8 bg-transparent text-xs text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-400"
        />
      </div>

      <div className="overflow-y-auto max-h-[275px] divide-y divide-slate-100 dark:divide-[#3f3f46] flex-grow font-mono text-[11px]">
        {filteredEvents.length === 0 ? (
          <div className="p-6 text-center text-slate-400 italic">
            No matching read events found.
          </div>
        ) : (
          filteredEvents.map((ev) => (
            <div
              key={ev.id}
              className="px-3.5 py-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#323236] transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] text-slate-400 shrink-0">{ev.timestamp}</span>
                <span className="font-semibold text-slate-800 dark:text-[#ededed] truncate">
                  {ev.collection}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-[#3f3f46] text-slate-600 dark:text-[#a1a1aa] shrink-0">
                  {ev.type}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="font-bold text-slate-900 dark:text-white">
                  +{ev.count} doc{ev.count > 1 ? 's' : ''}
                </span>
                {ev.fromCache ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300/30">
                    CACHE
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-300/30">
                    SERVER
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
