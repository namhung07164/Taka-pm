import React, { FC, memo } from 'react';

export const CalendarSyncGuideTab: React.FC = React.memo(() => {
  return (
    <div className="space-y-3 text-xs text-slate-700 dark:text-[#d0d0d0]">
      <div className="font-bold text-sm text-slate-900 dark:text-white mb-2">
        Các bước thiết lập hiển thị trên iPhone / iPad:
      </div>

      {/* Step 1 */}
      <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#28282a] border border-slate-100 dark:border-[#333336]">
        <div className="w-6 h-6 rounded-full bg-red-600 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
          1
        </div>
        <div>
          <div className="font-bold text-slate-800 dark:text-white">Sao chép đường dẫn Webcal</div>
          <div className="text-slate-500 dark:text-[#a3a3a3] mt-0.5">
            Tại tab <strong>1-Chạm iOS</strong>, nhấn nút <strong>"Chép link"</strong> ở mục Webcal.
          </div>
        </div>
      </div>

      {/* Step 2 */}
      <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#28282a] border border-slate-100 dark:border-[#333336]">
        <div className="w-6 h-6 rounded-full bg-red-600 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
          2
        </div>
        <div>
          <div className="font-bold text-slate-800 dark:text-white">Vào Cài đặt ứng dụng Lịch trên iPhone</div>
          <div className="text-slate-500 dark:text-[#a3a3a3] mt-0.5">
            Mở <strong>Cài đặt (Settings)</strong> trên iPhone ➜ Chọn mục <strong>Lịch (Calendar)</strong> (đối với iOS 18: vào <em>Ứng dụng ➜ Lịch</em>) ➜ Chọn <strong>Tài khoản Lịch (Calendar Accounts)</strong>.
          </div>
        </div>
      </div>

      {/* Step 3 */}
      <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#28282a] border border-slate-100 dark:border-[#333336]">
        <div className="w-6 h-6 rounded-full bg-red-600 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
          3
        </div>
        <div>
          <div className="font-bold text-slate-800 dark:text-white">Thêm lịch đã đăng ký (Add Subscribed Calendar)</div>
          <div className="text-slate-500 dark:text-[#a3a3a3] mt-0.5">
            Nhấn <strong>Thêm tài khoản (Add Account)</strong> ➜ Chọn <strong>Khác (Other)</strong> ➜ Chọn <strong>Thêm lịch đã đăng ký (Add Subscribed Calendar)</strong>.
          </div>
        </div>
      </div>

      {/* Step 4 */}
      <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#28282a] border border-slate-100 dark:border-[#333336]">
        <div className="w-6 h-6 rounded-full bg-red-600 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
          4
        </div>
        <div>
          <div className="font-bold text-slate-800 dark:text-white">Dán link & Hoàn tất</div>
          <div className="text-slate-500 dark:text-[#a3a3a3] mt-0.5">
            Dán link Webcal đã chép vào ô <strong>Máy chủ (Server)</strong> ➜ Nhấn <strong>Tiếp tục (Next)</strong>. Đổi tên mô tả thành <em>"Takashimaya Projects"</em> và tại mục <strong>Tự động làm mới (Auto-Refresh)</strong> hãy chọn <strong>Mỗi giờ</strong> hoặc <strong>Hàng ngày</strong> ➜ Nhấn <strong>Lưu (Save)</strong>.
          </div>
        </div>
      </div>

      <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl text-amber-800 dark:text-amber-300 text-xs">
        💡 <strong>Gợi ý:</strong> Bạn có thể thêm <strong>Widget Lịch (Calendar Widget)</strong> ra màn hình chính iPhone hoặc Apple Watch để xem công việc sắp đến của dự án bất cứ lúc nào!
      </div>
    </div>
  );
});
CalendarSyncGuideTab.displayName = 'CalendarSyncGuideTab';
