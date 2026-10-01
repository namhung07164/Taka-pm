import React from 'react';

export const LiveLayoutPrintLegend: React.FC = () => {
  return (
    <div className="hidden print:flex absolute bottom-4 left-4 z-30 bg-white/95 backdrop-blur-md p-2 rounded-lg border border-slate-300 shadow-md text-[10px] text-slate-800 flex-col gap-1 pointer-events-none">
      <div className="flex items-center justify-between border-b border-slate-200 pb-1 gap-3">
        <span className="font-bold text-slate-900 tracking-wider uppercase text-[9px]">
          Tiến độ & Tình trạng mặt bằng
        </span>
        <span className="text-[8px] text-slate-500 font-mono">
          Takashimaya PM
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-0.5">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200">
          <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] border border-white"></span>
          <span className="font-semibold text-slate-700">Bình thường</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200">
          <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6] border border-white"></span>
          <span className="font-semibold text-slate-700">Đang xử lý</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200">
          <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] border border-white"></span>
          <span className="font-semibold text-slate-700">Sắp đến hạn</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] border border-white"></span>
          <span className="font-semibold text-slate-700">Chậm tiến độ</span>
        </div>
      </div>
    </div>
  );
};
