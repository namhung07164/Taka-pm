import React, { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy, doc } from 'firebase/firestore';
import {   db, APP_ID , writeBatch , deleteDoc } from "../lib/firebase";
import { DevicePerformanceData } from "../store/usePerformanceStore";
import { reportDevicePerformance, getOrCreateDeviceId } from "../lib/deviceTelemetry";
import { useAppStore } from "../store/useAppStore";
import { matchesAdvancedSearch } from "../lib/utils";
import { DebouncedSearchInput } from './DebouncedSearchInput';
import {
  Smartphone,
  Monitor,
  Laptop,
  Server,
  HardDrive,
  RefreshCw,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Trash2,
  ShieldAlert,
  Search,
  Filter,
  Users,
} from "lucide-react";

export function GlobalFleetMonitorView() {
  const [devices, setDevices] = useState<DevicePerformanceData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const setToast = useAppStore((state) => state.setToast);
  const currentDeviceId = getOrCreateDeviceId();

  useEffect(() => {
    setIsLoading(true);
    const colRef = collection(db, "artifacts", APP_ID, "public", "data", "taka_device_metrics");
    const q = query(colRef);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loaded: DevicePerformanceData[] = [];
        const now = Date.now();

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as DevicePerformanceData;
          // Determine activity status: active within 3 mins = online, within 15 mins = idle, else offline
          const diffMs = now - (data.lastActiveTimestamp || 0);
          let status: "online" | "idle" | "offline" = "offline";
          if (diffMs < 3 * 60 * 1000) {
            status = "online";
          } else if (diffMs < 15 * 60 * 1000) {
            status = "idle";
          }

          loaded.push({
            ...data,
            deviceId: docSnap.id,
            status,
          });
        });

        // Sort: Current device first, then most recently active
        loaded.sort((a, b) => {
          if (a.deviceId === currentDeviceId) return -1;
          if (b.deviceId === currentDeviceId) return 1;
          return (b.lastActiveTimestamp || 0) - (a.lastActiveTimestamp || 0);
        });

        setDevices(loaded);
        setIsLoading(false);
      },
      (err) => {
        console.error("Error listening to taka_device_metrics:", err);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentDeviceId]);

  const handleManualSyncThisDevice = async () => {
    setIsRefreshing(true);
    await reportDevicePerformance(true);
    setTimeout(() => setIsRefreshing(false), 600);
    setToast({
      title: "Đồng bộ thành công",
      message: "Chỉ số thiết bị hiện tại đã được cập nhật lên hệ thống.",
      type: "success",
    });
  };

  const handleClearStaleDevices = async () => {
    if (!window.confirm("Bạn có muốn xóa dữ liệu của các thiết bị không hoạt động trên 24 giờ khỏi bảng theo dõi?")) {
      return;
    }

    try {
      const now = Date.now();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      const stale = devices.filter((d) => d.deviceId !== currentDeviceId && now - (d.lastActiveTimestamp || 0) > twentyFourHours);

      if (stale.length === 0) {
        setToast({ title: "Thông báo", message: "Không có thiết bị cũ nào quá 24h cần xóa." });
        return;
      }

      const batch = writeBatch(db);
      stale.forEach((d) => {
        const ref = doc(db, "artifacts", APP_ID, "public", "data", "taka_device_metrics", d.deviceId);
        batch.delete(ref);
      });
      batch.commit().catch(e => console.error("Batch commit failed", e));

      setToast({
        title: "Đã dọn dẹp",
        message: `Đã xóa ${stale.length} thiết bị cũ không còn hoạt động.`,
        type: "success",
      });
    } catch (err) {
      console.error(err);
      setToast({ title: "Lỗi", message: "Không thể dọn dẹp thiết bị.", type: "error" });
    }
  };

  // Aggregated fleet metrics
  const totalFleetServerReads = devices.reduce((sum, d) => sum + (d.serverReads || 0), 0);
  const totalFleetCacheReads = devices.reduce((sum, d) => sum + (d.cacheReads || 0), 0);
  const totalFleetOps = totalFleetServerReads + totalFleetCacheReads;
  const fleetHitRate = totalFleetOps > 0 ? ((totalFleetCacheReads / totalFleetOps) * 100).toFixed(1) : "100.0";
  const onlineCount = devices.filter((d) => d.status === "online").length;

  const filteredDevices = devices.filter((d) => {
    if (roleFilter !== "all" && d.userRole !== roleFilter) return false;
    if (searchTerm) {
      return matchesAdvancedSearch(searchTerm, [d.deviceName, d.userName, d.platform, d.deviceId]);
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Fleet KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* Total Fleet Server Reads */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#27272a] border border-slate-200 dark:border-[#3f3f46] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa]">
              Tổng Server Reads (All)
            </span>
            <Server className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {totalFleetServerReads.toLocaleString()}
              </span>
              <span className="text-xs font-medium text-slate-500">docs</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Từ tất cả các máy kết nối
            </div>
          </div>
        </div>

        {/* Total Fleet Cache Reads */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#27272a] border border-slate-200 dark:border-[#3f3f46] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa]">
              Cache Tiết Kiệm (All)
            </span>
            <HardDrive className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {totalFleetCacheReads.toLocaleString()}
              </span>
              <span className="text-xs font-medium text-slate-500">docs</span>
            </div>
            <div className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Đọc trực tiếp từ thiết bị
            </div>
          </div>
        </div>

        {/* Fleet Cache Hit Rate */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#27272a] border border-slate-200 dark:border-[#3f3f46] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa]">
              Tỷ Lệ Cache Toàn Mạng
            </span>
            <Radio className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {fleetHitRate}%
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-[#3f3f46] h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.max(0, parseFloat(fleetHitRate)))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Active Connected Devices */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#27272a] border border-slate-200 dark:border-[#3f3f46] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa]">
              Thiết Bị Đang Kết Nối
            </span>
            <Users className="w-4 h-4 text-purple-500" />
          </div>
          <div className="mt-2.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-purple-600 dark:text-purple-400">
                {onlineCount}
              </span>
              <span className="text-xs font-medium text-slate-500">/ {devices.length} thiết bị</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Đang hoạt động trong 3 phút qua
            </div>
          </div>
        </div>
      </div>

      {/* Fleet Filter Bar & Controls */}
      <div className="bg-white dark:bg-[#27272a] rounded-xl border border-slate-200 dark:border-[#3f3f46] p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2 flex-grow max-w-md">
          <div className="relative w-full">
            <DebouncedSearchInput
              placeholder="Tìm theo tên máy, người dùng, hệ điều hành (Windows, iPhone...)..."
              value={searchTerm}
              onChange={(val) => setSearchTerm(val)}
              className="w-full"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-[#1f1f22] border border-slate-200 dark:border-[#3f3f46] rounded-lg text-slate-700 dark:text-slate-200 outline-none"
          >
            <option value="all">Tất cả vai trò</option>
            <option value="admin">Admin</option>
            <option value="user">User</option>
            <option value="guest">Guest</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleManualSyncThisDevice}
            disabled={isRefreshing}
            title="Nhấn để gửi báo cáo số liệu của máy này lên bảng theo dõi (Chế độ thủ công, không tốn lượt ghi tự động)"
            className="px-3.5 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Đang gửi..." : "Đồng bộ thủ công máy này"}
          </button>
          <button
            onClick={handleClearStaleDevices}
            className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-[#27272a] hover:bg-slate-50 dark:hover:bg-[#323236] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#3f3f46] rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-400" />
            Dọn máy offline (&gt;24h)
          </button>
        </div>
      </div>

      {/* Info notice explaining manual sync zero-cost mode */}
      <div className="px-4 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>
            <strong>Chế độ Thủ Công (Tiết Kiệm Tuyệt Đối 0 VNĐ):</strong> Ứng dụng đã tắt hoàn toàn tiến trình ghi tự động ngầm. Khi muốn cập nhật chỉ số của máy nào lên bảng điều khiển này, người dùng tại máy đó chỉ cần bấm nút <strong>"Đồng bộ thủ công máy này"</strong> (chỉ tốn đúng 1 lượt Write duy nhất khi bấm).
          </span>
        </div>
      </div>

      {/* Devices List Table */}
      <div className="bg-white dark:bg-[#27272a] rounded-xl border border-slate-200 dark:border-[#3f3f46] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 dark:bg-[#1f1f22] border-b border-slate-200 dark:border-[#3f3f46] text-slate-500 dark:text-[#a1a1aa] font-semibold uppercase text-[10px] tracking-wider">
                <th className="px-4 py-3">Thiết bị & Người dùng</th>
                <th className="px-3 py-3">Nền tảng / Trình duyệt</th>
                <th className="px-3 py-3 text-right">Server Reads</th>
                <th className="px-3 py-3 text-right">Cache Reads</th>
                <th className="px-3 py-3 text-right">Cache Rate</th>
                <th className="px-3 py-3 text-center">Trạng thái</th>
                <th className="px-4 py-3 text-right">Hoạt động gần nhất</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#3f3f46]">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                    Đang nạp danh sách thiết bị...
                  </td>
                </tr>
              ) : filteredDevices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 italic">
                    Không tìm thấy thiết bị nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredDevices.map((dev) => {
                  const isCurrent = dev.deviceId === currentDeviceId;
                  const isMobile = dev.platform?.includes("iPhone") || dev.platform?.includes("Android");

                  return (
                    <tr
                      key={dev.deviceId}
                      className={`hover:bg-slate-50 dark:hover:bg-[#323236] transition-colors ${
                        isCurrent ? "bg-blue-50/40 dark:bg-blue-950/20" : ""
                      }`}
                    >
                      {/* Device & User */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`p-2 rounded-lg shrink-0 ${
                              isCurrent
                                ? "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300"
                                : "bg-slate-100 dark:bg-[#3f3f46] text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            {isMobile ? <Smartphone className="w-4 h-4" /> : <Laptop className="w-4 h-4" />}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 dark:text-[#ededed] flex items-center gap-1.5">
                              {dev.userName}
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-600 text-white">
                                  Máy này (Current)
                                </span>
                              )}
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-[#3f3f46] text-slate-600 dark:text-slate-300 uppercase font-mono">
                                {dev.userRole}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              ID: {dev.deviceId.substring(0, 14)}...
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Platform */}
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300 font-medium">
                        <div>{dev.deviceName}</div>
                        <div className="text-[10px] text-slate-400">{dev.platform}</div>
                      </td>

                      {/* Server Reads */}
                      <td className="px-3 py-3 text-right font-bold">
                        {dev.serverReads > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400">
                            {dev.serverReads.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">0</span>
                        )}
                      </td>

                      {/* Cache Reads */}
                      <td className="px-3 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {dev.cacheReads.toLocaleString()}
                      </td>

                      {/* Cache Hit Rate */}
                      <td className="px-3 py-3 text-right">
                        <span
                          className={`font-black ${
                            dev.cacheHitRate >= 90
                              ? "text-emerald-600 dark:text-emerald-400"
                              : dev.cacheHitRate >= 50
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {dev.cacheHitRate}%
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3 text-center">
                        {dev.status === "online" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300/40">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Online
                          </span>
                        ) : dev.status === "idle" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-300/40">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Chờ (Idle)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-[#3f3f46] text-slate-500 dark:text-slate-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Offline
                          </span>
                        )}
                      </td>

                      {/* Last Active */}
                      <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                        <div>{dev.lastActiveAt || "-"}</div>
                        {dev.sessionDurationSec ? (
                          <div className="text-[10px] text-slate-400">
                            Đã mở {Math.floor(dev.sessionDurationSec / 60)} phút
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
