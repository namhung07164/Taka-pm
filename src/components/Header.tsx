import { useEnrichedData } from '../hooks/useEnrichedData';
import { safeGetItemLocal, safeSetItemLocal, safeRemoveItemLocal, safeGetItemSession, safeSetItemSession, safeRemoveItemSession } from "../lib/storage";
import { useAppStore } from "../store/useAppStore";
import { doc } from 'firebase/firestore';
import {  db, APP_ID , setDoc } from "../lib/firebase";
import React, { Suspense, useEffect, useRef, useState } from 'react';
import {
  Menu,
  Bell,
  Clock,
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
  Search,
  Command,
} from "lucide-react";
import { lazyWithRetry } from "../lib/lazyWithRetry";
const QRScannerModal = lazyWithRetry(() => import("./QRScannerModal").then(m => ({ default: m.QRScannerModal })), "QRScannerModal");
import { AppUser, TabId, AppRole } from "../types";
import { cn } from "../lib/utils";
import { useLanguage } from "../lib/LanguageContext";
import { HeaderMenuDrawer } from "./HeaderParts/HeaderMenuDrawer";
import { HeaderUndoRedoControls } from "./HeaderParts/HeaderUndoRedoControls";
import { RibbonDisplayMenu } from "./RibbonDisplayMenu";

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
  onRedo?: () => void;
  canRedo?: boolean;
  hasDataToRedo?: boolean;
  redoDescription?: string;
  onToggleTheme?: () => void;
  onPrintClick?: () => void;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  isPrintPreview?: boolean;
  onPrintPreviewToggle?: () => void;
  onDeepLink?: (scannedText: string) => void;
  onQuickNavigate?: (targetTab: TabId, target: any) => void;
}

export function Header({
  cloudStatus, onLoginClick, onLogoutClick, onTabChange, activeTab, notificationCount = 0, onUndo, canUndo = false, hasDataToUndo = false, undoDescription, onRedo, canRedo = false, hasDataToRedo = false, redoDescription, onToggleTheme, isFocusMode = false, onToggleFocusMode, onPrintClick, isPrintPreview = false, onPrintPreviewToggle, onDeepLink, onQuickNavigate}: HeaderProps) {

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
  const showQuickAccessToolbar = useAppStore(state => state.showQuickAccessToolbar);
  const canWriteImportCsv = currentUser?.role === 'admin' || !!permissionMatrix[currentUser?.role as AppRole]?.Write?.importCsv;
  const jpyRate = useAppStore(state => state.jpyRate);
  const usdRate = useAppStore(state => state.usdRate);

  const ganttViewMode = useAppStore(state => state.ganttViewMode);
  const setGanttViewMode = useAppStore(state => state.setGanttViewMode);
  const ganttDayWidth = useAppStore(state => state.ganttDayWidth);
  const setGanttDayWidth = useAppStore(state => state.setGanttDayWidth);
  const ganttScaleInput = useAppStore(state => state.ganttScaleInput);
  const setGanttScaleInput = useAppStore(state => state.setGanttScaleInput);
  const isGanttWidthChanged = useAppStore(state => state.isGanttWidthChanged);
  const setIsGanttWidthChanged = useAppStore(state => state.setIsGanttWidthChanged);
  const saveGanttDayWidth = useAppStore(state => state.saveGanttDayWidth);

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

  const formatCompactTime = (date: Date) => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    const secs = date.getSeconds().toString().padStart(2, '0');
    return `${day} ${month} ${year} ${hours}:${mins}:${secs}`;
  };

  const formatFullTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const statusColors = {
    online: "text-emerald-700 bg-emerald-50/90 border-emerald-200 dark:bg-[#1a3821] dark:border-[#265330] dark:text-emerald-400",
    syncing: "text-blue-700 bg-blue-50/90 border-blue-200 dark:bg-[#28282a] dark:border-[#444446] dark:text-[#8ab4f8]",
    offline: "text-red-700 bg-red-50/90 border-red-200 dark:bg-[#3b1a1a] dark:border-[#5c2424] dark:text-red-400",
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 dark:bg-[#1e1e20]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-[#333336] py-2 px-3 sm:px-4 mb-2.5 rounded-t-xl transition-all min-w-0 flex items-center justify-between gap-2 sm:gap-3">
      {/* Left: Brand Identity & Menu */}
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink">
        <div ref={menuRef} className="relative shrink-0">
          <button
            title="Menu"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="h-8 w-8 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-[#28282a] text-slate-700 dark:text-[#c3c3c3] rounded-lg transition-colors outline-none cursor-pointer active:scale-95 touch-manipulation"
          >
            <Menu className="w-5 h-5" />
          </button>

          <HeaderMenuDrawer
            isMenuOpen={isMenuOpen}
            setIsMenuOpen={setIsMenuOpen}
            currentUser={currentUser}
            activeTab={activeTab}
            onTabChange={onTabChange}
            onLoginClick={onLoginClick}
            onLogoutClick={onLogoutClick}
            onToggleTheme={onToggleTheme}
            theme={theme}
            canWriteImportCsv={canWriteImportCsv}
            isPrintPreview={isPrintPreview}
            onPrintPreviewToggle={onPrintPreviewToggle}
          />
        </div>

        {/* Japanese Takashimaya Logo */}
        <div className="w-8 h-8 sm:w-8.5 sm:h-8.5 bg-white dark:bg-[#28282a] border border-slate-200/90 dark:border-[#444446] rounded-lg flex items-center justify-center shadow-2xs shrink-0 transition-colors">
          <svg
            className="w-5.5 h-5.5 sm:w-6 sm:h-6 text-red-600 dark:text-red-500"
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

        {/* Title & Status Badge Lockup */}
        <div className="min-w-0 flex flex-col justify-center shrink-0">
          <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
            <h1 className="text-xs sm:text-sm md:text-base font-extrabold text-slate-900 dark:text-[#f3f3f3] leading-tight shrink-0 whitespace-nowrap">
              T-Project
            </h1>
            <span
              className={cn(
                "text-[10px] uppercase font-bold px-1.5 py-0.2 rounded-md border hidden md:inline-flex items-center gap-1",
                statusColors[cloudStatus],
              )}
            >
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                cloudStatus === "online" ? "bg-emerald-500 animate-pulse" : cloudStatus === "syncing" ? "bg-blue-500 animate-pulse" : "bg-red-500"
              )} />
              {cloudStatus === "online"
                ? t("Cloud Online")
                : cloudStatus === "syncing"
                  ? t("Syncing...")
                  : t("Offline")}
            </span>
            <span
              className={cn(
                "w-2 h-2 rounded-full md:hidden shrink-0",
                cloudStatus === "online"
                  ? "bg-emerald-500"
                  : cloudStatus === "syncing"
                    ? "bg-blue-500"
                    : "bg-red-500",
              )}
              title={`Cloud status: ${cloudStatus}`}
            />
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            <span
              className={cn(
                "px-1.5 py-0.2 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-wider",
                currentUser.role === "admin"
                  ? "bg-blue-600 text-white"
                  : currentUser.role === "user"
                    ? "bg-emerald-600 text-white dark:bg-emerald-700"
                    : "bg-slate-100 dark:bg-[#28282a] text-slate-700 dark:text-[#c3c3c3]",
              )}
            >
              {currentUser.role === "admin"
                ? t("ADMIN")
                : String(currentUser.username || t("GUEST")).toUpperCase()}
            </span>
            <span className="hidden xl:inline text-[10px] font-medium text-slate-400 dark:text-[#838383]">
              • {t("Cloud Sync Enabled")}
            </span>

            {/* Active Child Tab Indicator on iPad/Tablet */}
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
                  className="hidden sm:inline-flex lg:hidden px-2 py-0.2 rounded-md text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600 shadow-2xs items-center gap-1 transition-all active:scale-95 cursor-pointer select-none shrink-0"
                  title={`Active tab: ${currentTabInfo.label}`}
                >
                  <ActiveIcon className="w-2.5 h-2.5 shrink-0 text-white" />
                  <span className="font-extrabold tracking-wide whitespace-nowrap">
                    On {currentTabInfo.label}
                  </span>
                </button>
              );
            })()}
          </div>
        </div>

        {/* Right Header Controls Group (Always visible on Mobile, iPad & Desktop) */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
          {/* Undo and Redo Controls */}
          <HeaderUndoRedoControls
            onUndo={onUndo}
            canUndo={canUndo}
            hasDataToUndo={hasDataToUndo}
            undoDescription={undoDescription}
            onRedo={onRedo}
            canRedo={canRedo}
            hasDataToRedo={hasDataToRedo}
            redoDescription={redoDescription}
          />

          {/* Currency Selector (Visible on Main Header) */}
          <button 
            onClick={handleCurrencyClick}
            onContextMenu={handleCurrencyContextMenu}
            className="h-8 px-2 sm:px-2.5 min-w-[50px] sm:min-w-[64px] bg-slate-50 hover:bg-slate-100 dark:bg-[#28282a] dark:hover:bg-[#333336] text-slate-700 dark:text-[#c3c3c3] rounded-lg transition-colors border border-slate-200 dark:border-[#444446] shadow-2xs text-[10px] sm:text-xs font-bold font-mono flex items-center justify-center active:scale-95 touch-manipulation shrink-0 cursor-pointer"
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

          {/* QR Scanner Button */}
          <button
            onClick={() => setIsQRScannerOpen(true)}
            className="h-8 w-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 dark:bg-[#28282a] dark:hover:bg-[#333336] rounded-lg transition-colors border border-slate-200 dark:border-[#444446] shadow-2xs text-slate-600 dark:text-[#a3a3a3] hover:text-blue-600 dark:hover:text-blue-400 active:scale-95 touch-manipulation shrink-0 cursor-pointer"
            title="Scan QR Code"
          >
            <ScanQrCode className="w-4 h-4" />
          </button>

          {/* Notification Bell */}
          <button
            onClick={() => onTabChange("notification")}
            className="relative h-8 w-8 flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-[#28282a] hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors focus:outline-none shrink-0"
            title="Notifications"
          >
            <Bell className="w-4.5 h-4.5" />
            {notificationCount > 0 && (
              <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-red-500 rounded-full border border-white dark:border-[#1e1e20] text-[8px] font-bold text-white flex items-center justify-center">
                {notificationCount > 9 ? "9+" : notificationCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Right: Quick Access & Controls Toolbar */}
      <div className="hidden md:flex items-center justify-end gap-1.5 shrink-0 ml-auto min-w-0">
        {showQuickAccessToolbar && (
          <>
            {/* Search Command Palette */}
            <button
              onClick={() => useAppStore.getState().setIsCommandPaletteOpen(true)}
              className="h-8 px-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-[#28282a] dark:hover:bg-[#333336] text-slate-600 dark:text-[#a3a3a3] hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors border border-slate-200 dark:border-[#444446] shadow-2xs text-xs font-semibold cursor-pointer active:scale-95 touch-manipulation flex items-center gap-1.5"
              title="Open Command Palette (Ctrl+K)"
            >
              <Search className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden lg:inline font-medium">Search...</span>
              <kbd className="hidden xl:inline-block text-[9px] font-mono font-bold bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] px-1 py-0.2 rounded text-slate-500 dark:text-[#a3a3a3]">
                ⌘K
              </kbd>
            </button>

            {/* Currency Rates Indicator */}
            {currency === 'JPY' && (
              <span className="h-8 px-2 text-[11px] font-mono font-medium text-slate-500 dark:text-[#a3a3a3] bg-slate-50/60 dark:bg-[#28282a]/60 border border-slate-200/60 dark:border-[#444446]/60 rounded-lg hidden 2xl:flex items-center whitespace-nowrap">
                1 JPY = {jpyRate.toLocaleString('en-US')} VND
              </span>
            )}
            {currency === 'USD' && (
              <span className="h-8 px-2 text-[11px] font-mono font-medium text-slate-500 dark:text-[#a3a3a3] bg-slate-50/60 dark:bg-[#28282a]/60 border border-slate-200/60 dark:border-[#444446]/60 rounded-lg hidden 2xl:flex items-center whitespace-nowrap">
                1 USD = {usdRate.toLocaleString('en-US')} VND
              </span>
            )}

            {/* Read-only Lock Indicator */}
            {currency !== 'VND' && (
              <span 
                title={`Converted to ${currency}. Switch to VND to edit numbers.`}
                className="h-8 px-2 inline-flex items-center gap-1 text-[11px] font-semibold rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-2xs shrink-0 cursor-default"
              >
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Read-only</span>
              </span>
            )}

            {/* Theme Toggle */}
            {onToggleTheme && (
              <button
                onClick={onToggleTheme}
                className="h-8 w-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 dark:bg-[#28282a] dark:hover:bg-[#333336] text-slate-500 dark:text-[#a3a3a3] rounded-lg transition-colors border border-slate-200 dark:border-[#444446] shadow-2xs active:scale-95 touch-manipulation"
                title="Toggle Theme"
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            )}

            {/* Language Switcher */}
            <button onClick={() => setLanguage(language === 'en' ? 'ja' : 'en')}
              className="h-8 px-2 bg-slate-50 hover:bg-slate-100 dark:bg-[#28282a] dark:hover:bg-[#333336] rounded-lg transition-colors border border-slate-200 dark:border-[#444446] shadow-2xs active:scale-95 touch-manipulation flex items-center justify-center"
              title="Toggle Language"
            >
              {language === 'en' ? (
                <span className="text-sm leading-none" role="img" aria-label="English">🇬🇧</span>
              ) : (
                <span className="text-sm leading-none" role="img" aria-label="Japanese">🇯🇵</span>
              )}
            </button>

            {/* Realtime Clock Widget */}
            <div 
              title={`Today: ${formatFullTime(currentTime)}`}
              className="h-8 px-2.5 bg-blue-50 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8] rounded-lg text-xs font-mono font-bold border border-blue-100 dark:border-[#444446] hidden lg:flex items-center gap-1.5 shadow-2xs transition-colors shrink-0 select-none whitespace-nowrap"
            >
              <Clock className="w-3.5 h-3.5 shrink-0 text-blue-600 dark:text-[#8ab4f8]" />
              <span>{formatCompactTime(currentTime)}</span>
            </div>

            {/* Ribbon Display Options on Header */}
            <RibbonDisplayMenu variant="header" className="hidden lg:inline-flex shrink-0" />
          </>
        )}
      </div>
      {isQRScannerOpen && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}
    </header>
  );
}
