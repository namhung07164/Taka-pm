import React from 'react';
import DataMappingTab from './PictureMapping/components/DataMappingTab';

export function PictureMappingTab() {
  return (
    <div className="flex flex-col flex-grow w-full bg-slate-950 text-slate-100 overflow-hidden min-h-[calc(100vh-135px)] h-[calc(100vh-135px)] rounded-xl border border-slate-800 shadow-xl p-1 sm:p-1.5">
      <div className="flex-1 w-full min-h-0 flex flex-col h-full overflow-hidden">
        <DataMappingTab />
      </div>
    </div>
  );
}
