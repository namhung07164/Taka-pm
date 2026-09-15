import React, { useState, useEffect } from "react";
import { usePerformanceStore, ReadEvent } from "../store/usePerformanceStore";
import {
  Activity,
  Zap,
  HardDrive,
  Radio,
  Clock,
  RotateCcw,
  Copy,
  Download,
  CheckCircle2,
  AlertTriangle,
  Server,
  Database,
  Search,
  Filter,
  Layers,
  X,
  Users,
  Smartphone,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { DebouncedSearchInput } from './DebouncedSearchInput';
import { GlobalFleetMonitorView } from "./GlobalFleetMonitorView";

interface FirestorePerformanceDashboardProps {
  onClose?: () => void;
}

export function FirestorePerformanceDashboard({ onClose }: FirestorePerformanceDashboardProps = {}) {
  const [activeViewMode, setActiveViewMode] = useState<"session" | "fleet">("session");
  const serverReads = usePerformanceStore((state) => state.serverReads);
  const cacheReads = usePerformanceStore((state) => state.cacheReads);
  const activeListeners = usePerformanceStore((state) => state.activeListeners);
  const sessionStartTime = usePerformanceStore((state) => state.sessionStartTime);
  const collectionStats = usePerformanceStore((state) => state.collectionStats);
  const events = usePerformanceStore((state) => state.events);
  const resetStats = usePerformanceStore((state) => state.resetStats);

  const setToast = useAppStore((state) => state.setToast);
  const currentUser = useAppStore((state) => state.currentUser);

  const deviceInfo = React.useMemo(() => {
    const ua = navigator.userAgent;
    let browser = "Unknown";
    if (ua.indexOf("Firefox") > -1) browser = "Firefox";
    else if (ua.indexOf("SamsungBrowser") > -1) browser = "Samsung Browser";
    else if (ua.indexOf("Opera") > -1 || ua.indexOf("OPR") > -1) browser = "Opera";
    else if (ua.indexOf("Edge") > -1 || ua.indexOf("Edg") > -1) browser = "Edge";
    else if (ua.indexOf("Chrome") > -1) browser = "Chrome";
    else if (ua.indexOf("Safari") > -1) browser = "Safari";
    
    let os = "Unknown OS";
    if (ua.indexOf("Win") > -1) os = "Windows";
    else if (ua.indexOf("Mac") > -1) os = "MacOS";
    else if (ua.indexOf("Linux") > -1) os = "Linux";
    else if (ua.indexOf("Android") > -1) os = "Android";
    else if (ua.indexOf("like Mac") > -1) os = "iOS";

    return `${browser} on ${os}`;
  }, []);

  const [filterType, setFilterType] = useState<"all" | "server" | "cache">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sessionDuration, setSessionDuration] = useState("0m 0s");

  useEffect(() => {
    if (!onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  const [copied, setCopied] = useState(false);

  // Live timer for session duration
  useEffect(() => {
    const updateTimer = () => {
      const elapsedSec = Math.floor((Date.now() - sessionStartTime) / 1000);
      const m = Math.floor(elapsedSec / 60);
      const s = elapsedSec % 60;
      setSessionDuration(`${m}m ${s}s`);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [sessionStartTime]);

  const totalOps = serverReads + cacheReads;
  const cacheEfficiency =
    totalOps > 0 ? ((cacheReads / totalOps) * 100).toFixed(1) : "100.0";

  // Filtered Events
  const filteredEvents = events.filter((ev) => {
    if (filterType === "server" && ev.fromCache) return false;
    if (filterType === "cache" && !ev.fromCache) return false;
    if (searchTerm && !ev.collection.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    return true;
  });

  // Query health assessment
  const collectionsArray = Object.entries(collectionStats).map(([name, stat]) => ({
    name,
    ...stat,
    efficiency:
      stat.serverReads + stat.cacheReads > 0
        ? ((stat.cacheReads / (stat.serverReads + stat.cacheReads)) * 100).toFixed(1)
        : "100.0",
  }));

  const heavyCollections = collectionsArray.filter((c) => c.serverReads > 500);

  const handleCopySummary = () => {
    const report = `=== FIRESTORE PERFORMANCE SESSION REPORT ===
Session Duration: ${sessionDuration}
Billable Server Reads: ${serverReads.toLocaleString()}
Cache Saved Reads: ${cacheReads.toLocaleString()}
Cache Efficiency: ${cacheEfficiency}%
Active Listeners: ${activeListeners}

Collection Breakdown:
${collectionsArray
  .map(
    (c) =>
      `- ${c.name}: Server ${c.serverReads} | Cache ${c.cacheReads} | Listeners ${c.activeListeners} | Eff: ${c.efficiency}%`
  )
  .join("\n")}
=============================================`;

    navigator.clipboard.writeText(report);
    setCopied(true);
    setToast({
      title: "Copied!",
      message: "Firestore session report copied to clipboard.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportJson = () => {
    const data = {
      generatedAt: new Date().toISOString(),
      sessionDuration,
      serverReads,
      cacheReads,
      cacheEfficiency: `${cacheEfficiency}%`,
      activeListeners,
      collectionStats,
      recentEvents: events,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `firestore-performance-${new Date().toISOString().substring(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div id="firestore-performance-dashboard" className="flex flex-col gap-5 p-5 bg-slate-50/50 dark:bg-[#18181b]/50 border-t border-slate-200 dark:border-[#3f3f46]">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-[#ededed] flex items-center gap-2">
                Firestore Performance & Read Monitor
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-300/40">
                  Live Session
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#a1a1aa]">
                Theo dõi và đo lường chi phí lượt đọc (Reads/Writes), tỷ lệ Cache IndexedDB và hiệu năng mạng.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {activeViewMode === "session" && (
            <>
              <button
                onClick={handleCopySummary}
                className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-[#27272a] hover:bg-slate-100 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-[#d4d4d8] border border-slate-200 dark:border-[#3f3f46] rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy Report"}
              </button>
              <button
                onClick={handleExportJson}
                className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-[#27272a] hover:bg-slate-100 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-[#d4d4d8] border border-slate-200 dark:border-[#3f3f46] rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                Export JSON
              </button>
              <button
                onClick={resetStats}
                title="Reset counters for this session"
                className="px-3 py-1.5 text-xs font-medium bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Counters
              </button>
            </>
          )}
          {onClose && (
            <button
              onClick={onClose}
              title="Close Performance Dashboard"
              className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-[#3f3f46] rounded-lg transition-colors border border-transparent hover:border-slate-300 dark:hover:border-[#52525b]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scope Mode Switcher: Single Device Session vs All Devices Fleet */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-[#27272a] rounded-xl border border-slate-200 dark:border-[#3f3f46] w-fit">
        <button
          onClick={() => setActiveViewMode("session")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
            activeViewMode === "session"
              ? "bg-white dark:bg-[#18181b] text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200/60 dark:border-[#3f3f46]"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Activity className="w-4 h-4" />
          Thiết Bị Này (Current Device Session)
        </button>

        <button
          onClick={() => setActiveViewMode("fleet")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
            activeViewMode === "fleet"
              ? "bg-white dark:bg-[#18181b] text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200/60 dark:border-[#3f3f46]"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Users className="w-4 h-4" />
          Toàn Bộ Thiết Bị (All Devices Fleet)
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold">
            Mới
          </span>
        </button>
      </div>

      {activeViewMode === "fleet" ? (
        <GlobalFleetMonitorView />
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* Billable Reads */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#27272a] border border-slate-200 dark:border-[#3f3f46] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa]">
              Billable Server Reads
            </span>
            <Server className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {serverReads.toLocaleString()}
              </span>
              <span className="text-xs font-medium text-slate-500">docs</span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px]">
              {serverReads < 200 ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5">
                  <CheckCircle2 className="w-3 h-3" /> Highly Optimized
                </span>
              ) : serverReads < 1500 ? (
                <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-0.5">
                  <AlertTriangle className="w-3 h-3" /> Moderate
                </span>
              ) : (
                <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-0.5">
                  <AlertTriangle className="w-3 h-3" /> High Query Spike
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Cache Reads */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#27272a] border border-slate-200 dark:border-[#3f3f46] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa]">
              Saved by Cache (Free)
            </span>
            <HardDrive className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {cacheReads.toLocaleString()}
              </span>
              <span className="text-xs font-medium text-slate-500">docs</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-[#a1a1aa]">
              Served instantly from local IndexedDB
            </p>
          </div>
        </div>

        {/* Cache Efficiency Ratio */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#27272a] border border-slate-200 dark:border-[#3f3f46] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa]">
              Cache Hit Ratio
            </span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {cacheEfficiency}%
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-100 dark:bg-[#3f3f46] h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, parseFloat(cacheEfficiency)))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Active Listeners & Duration */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#27272a] border border-slate-200 dark:border-[#3f3f46] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#a1a1aa]">
              Active Subscriptions
            </span>
            <Radio className="w-4 h-4 text-purple-500 animate-pulse" />
          </div>
          <div className="mt-2.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-purple-600 dark:text-purple-400">
                {activeListeners}
              </span>
              <span className="text-xs font-medium text-slate-500">listeners</span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500 dark:text-[#a1a1aa]">
              <Clock className="w-3 h-3" /> Session time: {sessionDuration}
            </div>
          </div>
        </div>
      </div>

      {/* Diagnostics / Inefficiency Alerts */}
      {heavyCollections.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex items-start gap-3 text-xs">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-sm">Query Pattern Notice:</span> Heavy server traffic detected in{" "}
            {heavyCollections.map((c) => `"${c.name}" (${c.serverReads} reads)`).join(", ")}. This is standard during
            the first load on a fresh device without pre-existing cache, but subsequent reloads will read from IndexedDB.
          </div>
        </div>
      )}

      {/* Breakdown Table & Event Logs Tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Collection Matrix */}
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
                              ? "text-emerald-600 dark:text-emerald-400"
                              : parseFloat(c.efficiency) >= 50
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-rose-600 dark:text-rose-400"
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

        {/* Real-time Event Feed */}
        <div className="lg:col-span-6 bg-white dark:bg-[#27272a] rounded-xl border border-slate-200 dark:border-[#3f3f46] shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 border-b border-slate-100 dark:border-[#3f3f46] bg-slate-50/50 dark:bg-[#27272a] flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <h4 className="text-xs font-bold text-slate-700 dark:text-[#e4e4e7] uppercase tracking-wider flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-emerald-500" />
                Live Read Events Log
              </h4>
              <span className="text-[10px] text-slate-400 font-medium">
                Session: {currentUser?.username || currentUser?.id || 'Anonymous'} • {deviceInfo}
              </span>
            </div>

            {/* Filter buttons */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#18181b] p-0.5 rounded-lg border border-slate-200/80 dark:border-[#3f3f46]">
              <button
                onClick={() => setFilterType("all")}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-colors ${
                  filterType === "all"
                    ? "bg-white dark:bg-[#27272a] text-slate-800 dark:text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                }`}
              >
                All ({events.length})
              </button>
              <button
                onClick={() => setFilterType("server")}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-colors ${
                  filterType === "server"
                    ? "bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                }`}
              >
                Server Only
              </button>
              <button
                onClick={() => setFilterType("cache")}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-colors ${
                  filterType === "cache"
                    ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
                }`}
              >
                Cache Only
              </button>
            </div>
          </div>

          {/* Search bar inside logs */}
          <div className="px-3 py-1.5 bg-slate-50 dark:bg-[#1f1f22] border-b border-slate-100 dark:border-[#3f3f46] flex items-center gap-2 relative">
            <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" />
            <DebouncedSearchInput
              placeholder="Search collection name..."
              value={searchTerm}
              onChange={(val) => setSearchTerm(val)}
              className="w-full pl-6 pr-8 bg-transparent text-xs text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="overflow-y-auto max-h-[275px] divide-y divide-slate-100 dark:divide-[#3f3f46] flex-grow font-mono text-[11px]">
            {filteredEvents.length === 0 ? (
              <div className="p-6 text-center text-slate-400 italic">
                No matching read events found.
              </div>
            ) : (
              filteredEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="px-3.5 py-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#323236] transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-slate-400 shrink-0">{ev.timestamp}</span>
                    <span className="font-semibold text-slate-800 dark:text-[#ededed] truncate">
                      {ev.collection}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-[#3f3f46] text-slate-600 dark:text-[#a1a1aa] shrink-0">
                      {ev.type}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-slate-900 dark:text-white">
                      +{ev.count} doc{ev.count > 1 ? "s" : ""}
                    </span>
                    {ev.fromCache ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300/30">
                        CACHE
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-300/30">
                        SERVER
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
