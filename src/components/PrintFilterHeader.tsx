import React from "react";
import { Building2, Calendar, FolderGit2, FileText } from "lucide-react";
import { PrintFilterContext } from "../lib/printFilterHelper";

interface PrintFilterHeaderProps {
  context: PrintFilterContext;
  className?: string;
  pageIndex?: number;
  totalPages?: number;
}

export const PrintFilterHeader: React.FC<PrintFilterHeaderProps> = ({
  context,
  className = "",
  pageIndex,
  totalPages,
}) => {
  const isFilteredProject = context.projectCodeDisplay !== "All Projects";
  const isFilteredYear = context.yearDisplay !== "All Years";
  const isHCM = context.storeRaw === "hcm";
  const isHN = context.storeRaw === "hn";

  return (
    <div
      id="print-filter-header-banner"
      className={`w-full flex items-center justify-between px-3.5 py-1.5 bg-slate-50 dark:bg-[#18181b] border border-slate-200 dark:border-[#333336] rounded-lg text-xs shrink-0 select-none ${className}`}
    >
      {/* Left: Brand & Document Type */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5 font-black tracking-wider text-slate-900 dark:text-white uppercase text-[11px]">
          <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>TAKASHIMAYA</span>
        </div>
        <span className="text-slate-300 dark:text-slate-600 font-bold">•</span>
        <span className="font-bold text-blue-700 dark:text-blue-300 truncate text-[11px]">
          {context.tabTitle}
        </span>
        {totalPages && totalPages > 1 && typeof pageIndex === "number" && (
          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
            (Page {pageIndex + 1}/{totalPages})
          </span>
        )}
      </div>

      {/* Right: Dynamic Filter Pills (Store, Year, Project Code) */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Store Badge */}
        <div
          className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold ${
            isHCM
              ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800"
              : isHN
              ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800"
              : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
          }`}
          title={`Store Filter: ${context.storeDisplay}`}
        >
          <Building2 className="w-3 h-3 opacity-70" />
          <span>Store: {context.storeDisplay}</span>
        </div>

        {/* Year Badge */}
        <div
          className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold ${
            isFilteredYear
              ? "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800"
              : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
          }`}
          title={`Year Filter: ${context.yearDisplay}`}
        >
          <Calendar className="w-3 h-3 opacity-70" />
          <span>Year: {context.yearDisplay}</span>
        </div>

        {/* Project Code Badge */}
        <div
          className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold ${
            isFilteredProject
              ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800"
              : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
          }`}
          title={`Project Code: ${context.projectCodeDisplay}`}
        >
          <FolderGit2 className="w-3 h-3 opacity-70" />
          <span>Project: {context.projectCodeDisplay}</span>
        </div>
      </div>
    </div>
  );
};
