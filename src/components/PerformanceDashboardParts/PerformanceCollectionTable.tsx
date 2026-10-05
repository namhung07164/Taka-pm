import React from 'react';
import { Layers } from 'lucide-react';
import { CollectionStatItem } from './performanceTypes';

interface PerformanceCollectionTableProps {
  collectionsArray: CollectionStatItem[];
}

export const PerformanceCollectionTable: React.FC<PerformanceCollectionTableProps> = ({
  collectionsArray,
}) => {
  return (
    <div className="lg:col-span-6 bg-white dark:bg-[#27272a] rounded-xl border border-slate-200 dark:border-[#3f3f46] shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-[#3f3f46] bg-slate-50/50 dark:bg-[#27272a] flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-700 dark:text-[#e4e4e7] uppercase tracking-wider flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-blue-500" />
          Collections Breakdown
        </h4>
        <span className="text-[11px] text-slate-500 font-medium">
          {collectionsArray.length} collections monitored
        </span>
      </div>

      <div className="overflow-x-auto flex-grow max-h-[320px] overflow-y-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 dark:bg-[#1f1f22] text-slate-500 dark:text-[#a1a1aa] uppercase font-semibold sticky top-0 border-b border-slate-100 dark:border-[#3f3f46]">
            <tr>
              <th className="px-3.5 py-2.5">Collection</th>
              <th className="px-3.5 py-2.5 text-right">Server Reads</th>
              <th className="px-3.5 py-2.5 text-right">Cache Reads</th>
              <th className="px-3.5 py-2.5 text-center">Listeners</th>
              <th className="px-3.5 py-2.5 text-right">Hit Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#3f3f46]">
            {collectionsArray.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400 italic">
                  No query activity recorded in this session yet.
                </td>
              </tr>
            ) : (
              collectionsArray.map((c) => (
                <tr
                  key={c.name}
                  className="hover:bg-slate-50 dark:hover:bg-[#323236] transition-colors font-medium"
                >
                  <td className="px-3.5 py-2 text-slate-800 dark:text-[#f4f4f5] font-mono text-[11px]">
                    {c.name}
                  </td>
                  <td className="px-3.5 py-2 text-right">
                    {c.serverReads > 0 ? (
                      <span className="text-rose-600 dark:text-rose-400 font-bold">
                        {c.serverReads.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-3.5 py-2 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                    {c.cacheReads.toLocaleString()}
                  </td>
                  <td className="px-3.5 py-2 text-center">
                    {c.activeListeners > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                        {c.activeListeners} live
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-3.5 py-2 text-right">
                    <span
                      className={`font-semibold ${
                        parseFloat(c.efficiency) >= 90
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : parseFloat(c.efficiency) >= 50
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {c.efficiency}%
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
