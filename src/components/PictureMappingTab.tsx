import React from 'react';
import DataMappingTab from './PictureMapping/components/DataMappingTab';

export function PictureMappingTab() {
  return (
    <div className="flex flex-col flex-grow w-full bg-white dark:bg-[#1e1e20] p-3 sm:p-5 text-slate-800 dark:text-[#e3e3e3] overflow-hidden min-h-[calc(100vh-220px)] h-[calc(100vh-220px)] rounded-2xl border border-slate-200/80 dark:border-[#333336] shadow-sm">
      <div className="flex-1 w-full min-h-0 flex flex-col h-full">
        <DataMappingTab />
      </div>
    </div>
  );
}
