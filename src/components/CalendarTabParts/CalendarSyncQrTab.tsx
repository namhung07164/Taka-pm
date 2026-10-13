import React, { FC, memo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck } from 'lucide-react';

interface CalendarSyncQrTabProps {
  webcalUrl: string;
  publishedUrl: string;
}

export const CalendarSyncQrTab: React.FC<CalendarSyncQrTabProps> = React.memo(({
  webcalUrl,
  publishedUrl,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-4 text-center space-y-4">
      <div className="p-4 bg-white rounded-2xl shadow-md border border-slate-200">
        <QRCodeSVG 
          value={webcalUrl || publishedUrl || (typeof window !== 'undefined' ? window.location.href : '')} 
          size={200}
          level="M"
          includeMargin={true}
        />
      </div>

      <div className="max-w-md space-y-1.5">
        <h4 className="font-bold text-slate-800 dark:text-white text-sm sm:text-base">
          📱 Quét bằng Camera của iPhone
        </h4>
        <p className="text-xs text-slate-500 dark:text-[#a3a3a3] leading-relaxed">
          Mở ứng dụng <strong>Camera</strong> trên iPhone và hướng vào mã QR này. 
          Một thông báo màu vàng <strong>"Mở trong Lịch"</strong> hoặc <strong>"Thêm đăng ký lịch"</strong> sẽ xuất hiện ➜ Chạm vào thông báo để thêm lịch ngay lập tức!
        </p>
      </div>

      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-[#28282a] text-xs text-slate-600 dark:text-[#c3c3c3]">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
        Mã QR mã hóa chuẩn webcal an toàn cho iOS
      </div>
    </div>
  );
});
CalendarSyncQrTab.displayName = 'CalendarSyncQrTab';
