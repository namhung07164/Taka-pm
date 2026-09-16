import React from 'react';
import DataMappingTab from './PictureMapping/components/DataMappingTab';

export function PictureMappingTab() {
  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] p-6 text-slate-800 dark:text-[#e3e3e3] overflow-hidden">
      <DataMappingTab />
    </div>
  );
}
