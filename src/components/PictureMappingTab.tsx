import React from 'react';
import DataMappingTab from './PictureMapping/components/DataMappingTab';

export function PictureMappingTab() {
  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] p-6 text-slate-800 dark:text-[#e3e3e3] overflow-hidden min-h-0">
      <div className="flex-1 w-full min-h-0 flex flex-col">
        <DataMappingTab />
      </div>
    </div>
  );
}
