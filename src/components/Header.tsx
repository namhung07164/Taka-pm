import { useEnrichedData } from '../hooks/useEnrichedData';
import { safeGetItemLocal, safeSetItemLocal, safeRemoveItemLocal, safeGetItemSession, safeSetItemSession, safeRemoveItemSession } from "../lib/storage";
import { useAppStore } from "../store/useAppStore";
import { doc } from 'firebase/firestore';
import {  db, APP_ID , setDoc } from "../lib/firebase";
import { useState, useEffect, useRef } from "react";
import {
  Menu,
  Bell,
  Clock,
  Undo2,
  Home,
  Maximize,
  Minimize,
  ScanQrCode,
  Settings,
  Sun,
  Moon,
  Upload,
  Download,
  ShieldAlert,
  Printer,
  HelpCircle,
  Lock,
  Calendar,
  BarChartHorizontal,
  LayoutDashboard,
  FileText,
  List,
  PieChart,
  DollarSign,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { ShortcutsModal } from "./ShortcutsModal";
import { QRScannerModal } from "./QRScannerModal";
import { AppUser, TabId, AppRole } from "../types";
import { cn } from "../lib/utils";
import { useLanguage } from "../lib/LanguageContext";

interface HeaderProps {
  cloudStatus: "online" | "syncing" | "offline";
  onLoginClick: () => void;
  onLogoutClick: () => void;
  onTabChange: (tab: TabId) => void;
  activeTab: TabId;
  notificationCount?: number;
  onUndo?: () => void;
  canUndo?: boolean;
  hasDataToUndo?: boolean;
  undoDescription?: string;
  onToggleTheme?: () => void;
  onPrintClick?: () => void;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  isPrintPreview?: boolean;
  onPrintPreviewToggle?: () => void;
  onDeepLink?: (scannedText: string) => void;
}

export function Header({
  cloudStatus, onLoginClick, onLogoutClick, onTabChange, activeTab, notificationCount = 0, onUndo, canUndo = false, hasDataToUndo = false, undoDescription, onToggleTheme, isFocusMode = false, onToggleFocusMode, onPrintClick, isPrintPreview = false, onPrintPreviewToggle, onDeepLink}: HeaderProps) {

  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);
  const theme = useAppStore(state => state.theme);
  const appUsers = useAppStore(state => state.appUsers);
  const subAppUsers = useAppStore(state => state.subAppUsers);
  const parties = useAppStore(state => state.parties);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const menuRef = useRef<HTMLDivElement>(null);
  const { language, setLanguage, t } = useLanguage();
  
  const currency = useAppStore(state => state.currency);
  const setCurrency = useAppStore(state => state.setCurrency);
  const canWriteImportCsv = currentUser?.role === 'admin' || !!permissionMatrix[currentUser?.role as AppRole]?.Write?.importCsv;
  const jpyRate = useAppStore(state => state.jpyRate);
  const usdRate = useAppStore(state => state.usdRate);

  const handleCurrencyClick = () => {
    let nextCurrency: 'VND' | 'JPY' | 'USD' = 'VND';
    if (currency === 'VND') nextCurrency = 'JPY';
    else if (currency === 'JPY') nextCurrency = 'USD';
    setCurrency(nextCurrency);
  };

  const handleCurrencyContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (currentUser.role !== 'admin') return;
    const jpyInput = window.prompt("Enter JPY exchange rate (e.g. 160):", jpyRate.toString());
    if (jpyInput !== null) {
      const parsedJpy = parseFloat(jpyInput);
      if (!isNaN(parsedJpy)) {
        useAppStore.getState().setJpyRate(parsedJpy);
        try {
          setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_settings", "exchange_rates"), { jpyRate: parsedJpy }, { merge: true });
        } catch (error) { console.error(error); }
      }
    }
    const usdInput = window.prompt("Enter USD exchange rate (e.g. 25000):", usdRate.toString());
    if (usdInput !== null) {
      const parsedUsd = parseFloat(usdInput);
      if (!isNaN(parsedUsd)) {
        useAppStore.getState().setUsdRate(parsedUsd);
        try {
          setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_settings", "exchange_rates"), { usdRate: parsedUsd }, { merge: true });
        } catch (error) { console.error(error); }
      }
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const formatTime = (date: Date) => {
    const opt: Intl.DateTimeFormatOptions = {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    };
    return new Intl.DateTimeFormat("en-US", opt).format(date);
  };

  const statusColors = {
    online: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-[#1a3821] dark:border-[#265330] dark:text-emerald-400",
    syncing: "text-blue-600 bg-blue-50 border-blue-200 dark:bg-[#28282a] dark:border-[#444446] dark:text-[#8ab4f8]",
    offline: "text-red-600 bg-red-50 border-red-200 dark:bg-[#3b1a1a] dark:border-[#5c2424] dark:text-red-400",
  };

  return (
    <div className="sticky top-0 z-50 bg-white/95 dark:bg-[#1e1e20]/95 pb-3 mb-4 flex flex-wrap xl:flex-nowrap gap-3 sm:gap-4 justify-between items-center pt-3 px-3 -mx-3 -mt-3 border-b border-slate-100 dark:border-[#333336] lg:pt-4 lg:-mt-4 lg:px-6 lg:-mx-6 rounded-t-xl transition-colors min-w-0">
      <div className="flex flex-wrap gap-2 sm:gap-3 items-center relative min-w-0 shrink">
        <div ref={menuRef} className="relative shrink-0">
          <button title="Menu"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-1.5 sm:p-2 hover:bg-slate-100 dark:hover:bg-[#28282a] rounded-lg transition-colors outline-none"
          >
            <Menu className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700 dark:text-[#c3c3c3]" />
          </button>

          {isMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-[9998] bg-black/20 backdrop-blur-[0.5px]"
                onClick={() => setIsMenuOpen(false)}
              />
              <div className="absolute top-12 left-0 w-60 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-2xl z-[9999] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="py-2">
                <button onClick={() => {
                    if (currentUser.role === "guest") onLoginClick();
                    else onLogoutClick();
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-5 py-3 text-sm text-slate-700 dark:text-[#e3e3e3] font-bold hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-3 transition-colors border-b border-slate-100 dark:border-[#444446] mb-1"
                >
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      currentUser.role === "guest"
                        ? "bg-slate-300 dark:bg-slate-600"
                        : "bg-emerald-500",
                    )}
                  />
                  {currentUser.role === "guest" ? t("Login") : t("Logout")}
                </button>

                {currentUser.role !== "guest" && (
                  <button title={t("Settings")}
                    onClick={() => {
                      onTabChange("setting");
                      setIsMenuOpen(false);
                    }}
                    className="w-full text-left px-5 py-3 text-sm text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-3 transition-colors border-b border-slate-100 dark:border-[#444446] mb-1"
                  >
                    <Settings className="w-4 h-4 text-slate-500 dark:text-[#a3a3a3]" />
                    {t("Settings")}
                  </button>
                )}

                {currentUser.role !== "guest" && (
                  <button onClick={() => {
                      onTabChange("accControl");
                      setIsMenuOpen(false);
                    }}
                    className="w-full text-left px-5 py-3 text-sm text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-3 transition-colors border-b border-slate-100 dark:border-[#444446]"
                  >
                    {t("Acc control")}
                  </button>
                )}

{currentUser.role === "admin" && (
                  <button onClick={() => {
                      onTabChange("audit");
                      setIsMenuOpen(false);
                    }}
                    className="w-full text-left px-5 py-3 text-sm text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-3 transition-colors border-b border-slate-100 dark:border-[#444446]"
                  >
                    Audit Log
                  </button>
                )}

                <button 
                  onClick={() => {
                    useAppStore.getState().setIsCalendarSyncModalOpen(true);
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-5 py-3 text-sm text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-3 transition-colors border-b border-slate-100 dark:border-[#444446]"
                >
                  <Calendar className="w-4 h-4 text-red-600 dark:text-red-400" />
                  <span>Đồng bộ Apple Calendar (iOS)</span>
                </button>

                {activeTab === 'layout' && (
                  <button 
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent("open-layout-edit-mode"));
                      setIsMenuOpen(false);
                    }}
                    className="w-full text-left px-5 py-3 text-sm text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-purple-50 dark:hover:bg-purple-950/30 flex items-center gap-3 transition-colors border-b border-slate-100 dark:border-[#444446]"
                  >
                    <SlidersHorizontal className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span className="font-semibold text-purple-700 dark:text-purple-300">Edit Mode</span>
                  </button>
                )}

                {currentUser.role !== "guest" && activeTab === 'detail' && (
                  <>
                    {canWriteImportCsv && (
                      <button onClick={() => { document.getElementById('detail-import-projects-input')?.click(); setIsMenuOpen(false); }} className="w-full text-left px-5 py-3 text-sm text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-3 transition-colors">
                        <Upload className="w-4 h-4 text-slate-500" />
                        Import Project
                      </button>
                    )}
                    <button onClick={() => { document.getElementById('detail-export-projects-btn')?.click(); setIsMenuOpen(false); }} className="w-full text-left px-5 py-3 text-sm text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-3 transition-colors">
                      <Download className="w-4 h-4 text-slate-500" />
                      Export Project
                    </button>
                    {currentUser.role === 'admin' && (
                      <button onClick={() => { document.getElementById('detail-full-import-projects-btn')?.click(); setIsMenuOpen(false); }} className="w-full text-left px-5 py-3 text-sm text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors">
                        <ShieldAlert className="w-4 h-4" />
                        Full Import Project
                      </button>
                    )}
                    <div className="h-px bg-slate-100 dark:bg-[#444446]"></div>
                    {canWriteImportCsv && (
                      <button onClick={() => { document.getElementById('detail-import-tasks-input')?.click(); setIsMenuOpen(false); }} className="w-full text-left px-5 py-3 text-sm text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-3 transition-colors">
                        <Upload className="w-4 h-4 text-slate-500" />
                        Import Task
                      </button>
                    )}
                    <button onClick={() => { document.getElementById('detail-export-tasks-btn')?.click(); setIsMenuOpen(false); }} className="w-full text-left px-5 py-3 text-sm text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-3 transition-colors">
                      <Download className="w-4 h-4 text-slate-500" />
                      Export Task
                    </button>
                    {currentUser.role === 'admin' && (
                      <button onClick={() => { document.getElementById('detail-full-import-tasks-btn')?.click(); setIsMenuOpen(false); }} className="w-full text-left px-5 py-3 text-sm text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors">
                        <ShieldAlert className="w-4 h-4" />
                        Full Import Task
                      </button>
                    )}
                  </>
                )}

                {currentUser.role !== "guest" && activeTab === 'budget' && (
                  <>
                    {canWriteImportCsv && (
                      <button onClick={() => { document.getElementById('budget-import-input')?.click(); setIsMenuOpen(false); }} className="w-full text-left px-5 py-3 text-sm text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-3 transition-colors">
                        <Upload className="w-4 h-4 text-slate-500" />
                        Import Budget
                      </button>
                    )}
                    <button onClick={() => { document.getElementById('budget-export-btn')?.click(); setIsMenuOpen(false); }} className="w-full text-left px-5 py-3 text-sm text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-3 transition-colors">
                      <Download className="w-4 h-4 text-slate-500" />
                      Export Budget
                    </button>
                    {currentUser.role === 'admin' && (
                      <button onClick={() => { document.getElementById('budget-full-import-btn')?.click(); setIsMenuOpen(false); }} className="w-full text-left px-5 py-3 text-sm text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors">
                        <ShieldAlert className="w-4 h-4" />
                        Full Import Budget
                      </button>
                    )}
                  </>
                )}
                {currentUser.role !== "guest" && activeTab === 'cost' && (
                  <>
                    {canWriteImportCsv && (
                      <button onClick={() => { document.getElementById('cost-import-input')?.click(); setIsMenuOpen(false); }} className="w-full text-left px-5 py-3 text-sm text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-3 transition-colors">
                        <Upload className="w-4 h-4 text-slate-500" />
                        Import Cost
                      </button>
                    )}
                    <button onClick={() => { document.getElementById('cost-export-btn')?.click(); setIsMenuOpen(false); }} className="w-full text-left px-5 py-3 text-sm text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-3 transition-colors">
                      <Download className="w-4 h-4 text-slate-500" />
                      Export Cost
                    </button>
                    {currentUser.role === 'admin' && (
                      <button onClick={() => { document.getElementById('cost-full-import-btn')?.click(); setIsMenuOpen(false); }} className="w-full text-left px-5 py-3 text-sm text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors">
                        <ShieldAlert className="w-4 h-4" />
                        Full Import Cost
                      </button>
                    )}
                  </>
                )}

                {['detail', 'budget', 'cost', 'summary', 'gantt', 'layout'].includes(activeTab) && (
                  <>
                    {['detail', 'budget', 'cost'].includes(activeTab) && currentUser.role !== "guest" && (
                      <div className="h-px bg-slate-100 dark:bg-[#444446]"></div>
                    )}
                    <button 
                      onClick={() => { 
                        if (onPrintPreviewToggle) {
                          onPrintPreviewToggle();
                        }
                        setIsMenuOpen(false); 
                      }} 
                      className="w-full text-left px-5 py-3 text-sm text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-3 transition-colors"
                    >
                      <Printer className="w-4 h-4 text-slate-500" />
                      {isPrintPreview ? 'Exit Print Preview' : 'Print Preview'}
                    </button>

                    {['gantt', 'layout'].includes(activeTab) && (
                      <button 
                        onClick={() => { 
                          window.dispatchEvent(new CustomEvent("export-png"));
                          setIsMenuOpen(false); 
                        }} 
                        className="w-full text-left px-5 py-3 text-sm text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-3 transition-colors"
                      >
                        <Download className="w-4 h-4 text-slate-500" />
                        Export as PNG
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            </>
          )}
        </div>

        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white dark:bg-[#1e1e20] border border-slate-100 dark:border-[#444446] rounded-xl flex items-center justify-center shadow-sm shrink-0 transition-colors">
          <svg
            className="w-7 h-7 sm:w-9 sm:h-9 text-red-600 dark:text-red-500"
            viewBox="0 0 100 100"
            fill="currentColor"
          >
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
            />
            <text
              x="50"
              y="65"
              fontFamily="Arial"
              fontSize="50"
              textAnchor="middle"
              fill="currentColor"
              fontWeight="bold"
            >
              高
            </text>
          </svg>
        </div>

        <button onClick={() => onTabChange("notification")}
          className="relative p-1.5 sm:p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-[#28282a] hover:text-slate-600 dark:hover:text-slate-300 rounded-full transition-colors focus:outline-none shrink-0"
        >
          <Bell className="w-5 h-5 sm:w-6 sm:h-6" />
          {notificationCount > 0 && (
            <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full border-2 border-white dark:border-slate-900 text-[8px] font-bold text-white flex items-center justify-center">
              {notificationCount > 9 ? "9+" : notificationCount}
            </span>
          )}
        </button>

        <div className="min-w-0">
          <h1 className="text-sm sm:text-base md:text-xl lg:text-2xl font-bold text-slate-800 dark:text-[#f3f3f3] leading-tight flex items-center gap-1.5 sm:gap-2 truncate">
            <span className="hidden sm:inline">{t("Takashimaya Project")}</span>
            <span className="sm:hidden">{t("Taka PM")}</span>
            <span
              className={cn(
                "text-[10px] uppercase font-bold px-1.5 sm:px-2 py-0.5 rounded-full border hidden md:inline-block",
                statusColors[cloudStatus],
              )}
            >
              {cloudStatus === "online"
                ? t("Cloud Online")
                : cloudStatus === "syncing"
                  ? t("Syncing...")
                  : t("Offline")}
            </span>
            <span
              className={cn(
                "w-2 h-2 rounded-full md:hidden",
                cloudStatus === "online"
                  ? "bg-emerald-500"
                  : cloudStatus === "syncing"
                    ? "bg-blue-500"
                    : "bg-red-500",
              )}
            />
          </h1>
          <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 flex-wrap">
            <span
              className={cn(
                "px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                currentUser.role === "admin"
                  ? "bg-blue-600 text-white"
                  : currentUser.role === "user"
                    ? "bg-emerald-600 text-white dark:bg-emerald-700"
                    : "bg-slate-100 dark:bg-[#1e1e20] text-slate-700 dark:text-[#c3c3c3]",
              )}
            >
              {currentUser.role === "admin"
                ? t("ADMIN")
                : String(currentUser.username || t("GUEST")).toUpperCase()}
            </span>
            <span className="hidden lg:inline text-[10px] sm:text-xs text-slate-500 dark:text-[#a3a3a3]">{t("Cloud Sync Enabled")}</span>

            {/* Active Child Tab Indicator on Mobile & iPad (Placed directly under Cloud Online) */}
            {(() => {
              const tabInfoMap: Partial<Record<TabId, { label: string; icon: React.ElementType }>> = {
                calendar: { label: t("Calendar"), icon: Calendar },
                gantt: { label: t("Gantt"), icon: BarChartHorizontal },
                layout: { label: "Layout", icon: LayoutDashboard },
                summary: { label: t("Summary"), icon: FileText },
                general: { label: t("General"), icon: LayoutDashboard },
                detail: { label: t("Task detail"), icon: List },
                budget: { label: t("Budget"), icon: PieChart },
                taskDelegation: { label: t("Delegation"), icon: List },
                taskDelegationCalendar: { label: t("Del. Calendar"), icon: Calendar },
                cost: { label: t("Cost"), icon: DollarSign },
                accControl: { label: t("Access"), icon: Shield },
                audit: { label: "Audit Log", icon: Shield },
                notification: { label: t("Notifs"), icon: Bell },
                setting: { label: t("Settings"), icon: Settings },
                manual: { label: t("Manual"), icon: HelpCircle },
              };
              const currentTabInfo = tabInfoMap[activeTab];
              if (!currentTabInfo) return null;
              const ActiveIcon = currentTabInfo.icon;
              return (
                <button
                  type="button"
                  onClick={() => onTabChange(activeTab)}
                  className="lg:hidden px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600 dark:text-white shadow-sm flex items-center gap-1 transition-all ring-2 ring-blue-400/30 active:scale-95 cursor-pointer select-none shrink-0"
                  title={`Đang mở tab: ${currentTabInfo.label}`}
                >
                  <ActiveIcon className="w-3 h-3 shrink-0 text-white" />
                  <span className="font-extrabold tracking-wide whitespace-nowrap">
                    On {currentTabInfo.label}
                  </span>
                </button>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-end items-center gap-1 sm:gap-2 shrink-0 ml-auto">
        <button
          onClick={() => setIsQRScannerOpen(true)}
          className="flex items-center justify-center p-1.5 hover:bg-slate-100 dark:hover:bg-[#28282a] rounded-lg transition-colors border border-slate-200 dark:border-[#444446] shadow-sm text-slate-600 dark:text-[#a3a3a3] hover:text-blue-600 dark:hover:text-blue-400"
          title="Quét mã QR (Scan QR Code)"
        >
          <ScanQrCode className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            className="flex items-center justify-center p-1.5 hover:bg-slate-100 dark:hover:bg-[#28282a] text-slate-500 dark:text-[#a3a3a3] rounded-lg transition-colors border border-slate-200 dark:border-[#444446] shadow-sm"
            title="Toggle Theme"
          >
            {theme === "dark" ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>
        )}
        
        <div className="flex items-center gap-1">
          <button 
            onClick={handleCurrencyClick}
            onContextMenu={handleCurrencyContextMenu}
            className="flex items-center justify-center p-1.5 min-w-[68px] sm:min-w-[76px] bg-slate-50 hover:bg-slate-100 dark:bg-[#1e1e20] dark:hover:bg-[#28282a] text-slate-700 dark:text-[#c3c3c3] rounded-lg transition-colors border border-slate-200 dark:border-[#444446] shadow-sm text-xs font-bold"
            title={
              currency === 'VND'
                ? (currentUser.role === 'admin' ? "Currency: '000 VND (Right-click to set exchange rates)" : "Currency: '000 VND")
                : (currentUser.role === 'admin'
                    ? `Currency: ${currency} (1 ${currency} = ${currency === 'JPY' ? jpyRate.toLocaleString('en-US') : usdRate.toLocaleString('en-US')} VND - Right-click to set exchange rates)`
                    : `Currency: ${currency} (1 ${currency} = ${currency === 'JPY' ? jpyRate.toLocaleString('en-US') : usdRate.toLocaleString('en-US')} VND)`
                  )
            }
          >
            {currency === 'VND' ? "'000 VND" : currency === 'JPY' ? '万円' : 'USD'}
          </button>
          {currency === 'JPY' && (
            <span className="text-[11px] font-mono font-medium text-slate-400 dark:text-[#838383] px-1 hidden 2xl:inline-block whitespace-nowrap">
              (1 JPY = {jpyRate.toLocaleString('en-US')} VND)
            </span>
          )}
          {currency === 'USD' && (
            <span className="text-[11px] font-mono font-medium text-slate-400 dark:text-[#838383] px-1 hidden 2xl:inline-block whitespace-nowrap">
              (1 USD = {usdRate.toLocaleString('en-US')} VND)
            </span>
          )}
        </div>

        <button onClick={() => setLanguage(language === 'en' ? 'ja' : 'en')}
          className="flex items-center justify-center p-1.5 hover:bg-slate-100 dark:hover:bg-[#28282a] rounded-lg transition-colors border border-slate-200 dark:border-[#444446] shadow-sm"
          title="Toggle Language"
        >
          {language === 'en' ? (
            <span className="text-base sm:text-lg leading-none" role="img" aria-label="English">🇬🇧</span>
          ) : (
            <span className="text-base sm:text-lg leading-none" role="img" aria-label="Japanese">🇯🇵</span>
          )}
        </button>

        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1.5 sm:p-2 text-slate-500 dark:text-[#a3a3a3] hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-[#333336] rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 relative"
          title={undoDescription || "Nothing to undo"}
        >
          <Undo2 className="w-4 h-4 sm:w-5 sm:h-5" />
          {hasDataToUndo && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full border border-white dark:border-slate-900"></span>
          )}
        </button>

        {currency !== 'VND' && (
          <span 
            title={`Converted to ${currency}. Switch to VND to edit numbers.`}
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 sm:px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-sm shrink-0 cursor-default"
          >
            <Lock className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Read-only</span>
          </span>
        )}
        <div className="hidden xl:flex bg-blue-50 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8] px-3 sm:px-4 py-1.5 rounded-lg text-xs font-mono border border-blue-100 dark:border-[#444446] items-center gap-2 shadow-sm transition-colors shrink-0">
          <Clock className="w-3.5 h-3.5" />
          <span>{formatTime(currentTime)}</span>
        </div>
      </div>
      <QRScannerModal 
        isOpen={isQRScannerOpen} 
        onClose={() => setIsQRScannerOpen(false)} 
        onScan={(url) => {
          if (!url) return;
          setIsQRScannerOpen(false);
          if (onDeepLink) {
            onDeepLink(url);
          } else {
            window.location.href = url;
          }
        }} 
      />
    </div>
  );
}
