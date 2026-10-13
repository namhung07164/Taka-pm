import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import React, { useEffect, useRef, useState } from 'react';
import {
  TabId,
  AppUser,
  PermissionMatrix,
  AppRole,
  PermissionModule,
} from "../types";
import { cn } from "../lib/utils";
import {
  Calendar,
  LayoutDashboard,
  List,
  PieChart,
  DollarSign,
  Shield,
  Bell,
  Settings,
  HelpCircle,
  BarChartHorizontal,
  FileText,
  Menu,
  X,
  ChevronDown,
  Image,
} from "lucide-react";
import { useLanguage } from "../lib/LanguageContext";
import { RibbonDisplayMenu } from "./RibbonDisplayMenu";

interface NavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

type ParentTabId = "Report" | "Index" | "Financial" | "Delegation" | "Help";

const parentTabs: { id: ParentTabId; label: string }[] = [
  { id: "Report", label: "Report" },
  { id: "Index", label: "Index" },
  { id: "Financial", label: "Financial" },
  { id: "Delegation", label: "Delegation" },
  { id: "Help", label: "Help" },
];

const childTabMap: Record<ParentTabId, TabId[]> = {
  Report: ["calendar", "layout", "summary"],
  Index: ["general", "gantt", "detail"],
  Financial: ["budget", "cost"],
  Delegation: ["taskDelegationCalendar", "taskDelegation"],
  Help: ["manual", "csv_export", "picture_mapping"],
};

export function Navigation({
  activeTab, onTabChange}: NavigationProps) {

  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);
  const theme = useAppStore(state => state.theme);
  const appUsers = useAppStore(state => state.appUsers);
  const subAppUsers = useAppStore(state => state.subAppUsers);
  const parties = useAppStore(state => state.parties);

  const isAdmin = currentUser.role === "admin";
  const role = (
    currentUser.role === "admin"
      ? "admin"
      : (currentUser.role as string)?.toUpperCase() === "CP"
      ? "CP"
      : (currentUser.role as string)?.toLowerCase() === "manager"
      ? "Manager"
      : (currentUser.role as string)?.toLowerCase() === "staff"
      ? "Staff"
      : (currentUser.role as string)?.toLowerCase() === "external"
      ? "External"
      : currentUser.role
  ) as AppRole;
  const perms = permissionMatrix[role]?.See;
  const writePerms = permissionMatrix[role]?.Write;
  const { t } = useLanguage();

  const canSeeModule = (module: PermissionModule) => {
    if (module === 'taskDelegation') return isAdmin || !!perms?.[module];
    return isAdmin || !!perms?.[module] || !!writePerms?.[module];
  };

  const activeParentTab =
    (Object.keys(childTabMap) as ParentTabId[]).find((p) =>
      childTabMap[p].includes(activeTab),
    ) || "Report";
  const [expandedParent, setExpandedParent] = useState<ParentTabId | null>(
    null,
  );
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileNavRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMobileMenuOpen && !expandedParent) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (isMobileMenuOpen) setIsMobileMenuOpen(false);
        if (expandedParent) setExpandedParent(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen, expandedParent]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        mobileNavRef.current &&
        !mobileNavRef.current.contains(event.target as Node)
      ) {
        setExpandedParent(null);
      }
    };

    if (expandedParent) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [expandedParent]);

  const tabs: {
    id: TabId;
    label: string;
    icon: React.ElementType;
    hidden?: boolean;
  }[] = [
    // Report
    {
      id: "calendar",
      label: t("Calendar"),
      icon: Calendar,
      hidden: !(canSeeModule("calendar") || canSeeModule("report")),
    },
    {
      id: "layout",
      label: "Layout",
      icon: LayoutDashboard,
      hidden: !canSeeModule("layout"),
    },
    {
      id: "summary",
      label: t("Summary"),
      icon: FileText,
      hidden: !(canSeeModule("summary") || canSeeModule("report")),
    },
    // Index
    {
      id: "general",
      label: t("General"),
      icon: LayoutDashboard,
      hidden: !canSeeModule("general"),
    },
    {
      id: "gantt",
      label: t("Gantt"),
      icon: BarChartHorizontal,
      hidden: !canSeeModule("report"),
    },
    {
      id: "detail",
      label: t("Task detail"),
      icon: List,
      hidden: !canSeeModule("detail"),
    },
    // Financial
    {
      id: "budget",
      label: t("Budget"),
      icon: PieChart,
      hidden: !canSeeModule("budget"),
    },
    {
      id: "cost",
      label: t("Cost"),
      icon: DollarSign,
      hidden: !canSeeModule("costDetail"),
    },
    // Delegation
    {
      id: "taskDelegationCalendar",
      label: t("Del. Calendar"),
      icon: Calendar,
      hidden: !canSeeModule("taskDelegation"),
    },
    {
      id: "taskDelegation",
      label: t("Delegation"),
      icon: List,
      hidden: !canSeeModule("taskDelegation"),
    },
    // Help
    { id: "manual", label: t("Manual"), icon: HelpCircle, hidden: false },
    { id: "csv_export", label: t("Import csv"), icon: FileText, hidden: !canSeeModule("importCsv") },
    { id: "picture_mapping", label: t("Picture mapping"), icon: Image, hidden: !canSeeModule("pictureMapping") },
    // Auxiliary hidden tabs
    { id: "accControl", label: t("Access"), icon: Shield, hidden: true },
    { id: "notification", label: t("Notifs"), icon: Bell, hidden: true },
    { id: "setting", label: t("Settings"), icon: Settings, hidden: true },
  ];

  const visibleParentTabs = parentTabs.filter((pt) => {
    return childTabMap[pt.id as ParentTabId].some((childId) => {
      const tab = tabs.find((t) => t.id === childId);
      return tab && !tab.hidden;
    });
  });

  const [hoveredParentTab, setHoveredParentTab] = useState<ParentTabId | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnterParent = (parentId: ParentTabId) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredParentTab(parentId);
  };

  const handleMouseLeaveParent = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredParentTab(null);
    }, 180);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const handleParentTabClick = (parentId: ParentTabId) => {
    const firstVisibleChild = childTabMap[parentId].find((childId) => {
      const tab = tabs.find((t) => t.id === childId);
      return tab && !tab.hidden;
    });
    if (firstVisibleChild) {
      onTabChange(firstVisibleChild);
    }
    setHoveredParentTab(null);
  };

  const activeTabObj = tabs.find((t) => t.id === activeTab);
  const activeChildLabel = activeTabObj ? activeTabObj.label : activeTab;
  const ActiveTabIcon = activeTabObj?.icon;

  return (
    <>
      {/* Desktop Navigation (Hidden on mobile) */}
      <div className="hidden lg:block border-b border-slate-200 dark:border-[#444446] mb-3 shrink-0 sticky top-[48px] z-40 bg-white/95 dark:bg-[#1e1e20]/95 pt-1.5 pb-2 transition-colors">
        <nav className="flex items-center gap-2.5 relative flex-wrap" aria-label="Parent Tabs">
          {visibleParentTabs.map((pt) => {
            const parentChildTabs = childTabMap[pt.id as ParentTabId]
              .map((childId) => tabs.find((t) => t.id === childId))
              .filter((t): t is (typeof tabs)[0] => !!t && !t.hidden);
            const isHovered = hoveredParentTab === pt.id;
            const isCurrentActiveParent = activeParentTab === pt.id;

            return (
              <div
                key={pt.id}
                className="relative"
                onMouseEnter={() => handleMouseEnterParent(pt.id as ParentTabId)}
                onMouseLeave={handleMouseLeaveParent}
              >
                <button
                  onClick={() => handleParentTabClick(pt.id as ParentTabId)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-sm font-bold transition-all flex items-center gap-1.5 select-none",
                    isCurrentActiveParent
                      ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 shadow-sm"
                      : "bg-slate-100 dark:bg-[#1e1e20] text-slate-600 dark:text-[#c3c3c3] hover:bg-slate-200 dark:hover:bg-[#333336]",
                  )}
                >
                  <span>
                    {t(pt.id)}
                  </span>
                  <ChevronDown
                    className={cn(
                      "w-3.5 h-3.5 transition-transform duration-200 opacity-60",
                      isHovered ? "rotate-180 opacity-100" : ""
                    )}
                  />
                </button>

                {/* Hover Dropdown Menu */}
                {isHovered && parentChildTabs.length > 0 && (
                  <div
                    className="absolute top-full left-0 pt-1.5 z-50 min-w-[210px]"
                    onMouseEnter={() => handleMouseEnterParent(pt.id as ParentTabId)}
                    onMouseLeave={handleMouseLeaveParent}
                  >
                    <div className="bg-white dark:bg-[#1e1e20] rounded-xl shadow-xl border border-slate-200 dark:border-[#444446] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-sm">
                      <div className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#838383] border-b border-slate-100 dark:border-[#333336] mb-1">
                        {t(pt.id)}
                      </div>
                      {parentChildTabs.map((childTab) => {
                        const Icon = childTab.icon;
                        const isActive = activeTab === childTab.id;
                        return (
                          <button
                            key={childTab.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onTabChange(childTab.id);
                              setHoveredParentTab(null);
                            }}
                            className={cn(
                              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors text-left w-full group",
                              isActive
                                ? "bg-blue-50 text-blue-600 dark:bg-[#28282a] dark:text-[#8ab4f8] font-bold"
                                : "text-slate-700 dark:text-[#c3c3c3] hover:bg-slate-100 dark:hover:bg-[#28282a]"
                            )}
                          >
                            <Icon
                              className={cn(
                                "w-4 h-4 shrink-0 transition-transform group-hover:scale-110",
                                isActive
                                   ? "text-blue-600 dark:text-[#8ab4f8]"
                                  : "text-slate-500 dark:text-[#838383]"
                              )}
                            />
                            <span className="truncate">{childTab.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Active Child Tab Indicator Button (Placed right after Help) */}
          {activeTabObj && (
            <div className="flex items-center ml-1">
              <button
                type="button"
                onClick={() => onTabChange(activeTab)}
                className="px-3.5 py-1.5 rounded-full text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600 dark:text-white shadow-sm flex items-center gap-1.5 transition-all ring-2 ring-blue-400/30 dark:ring-blue-400/20 active:scale-95 cursor-pointer select-none"
                title={`Đang mở tab: ${activeChildLabel}`}
              >
                {ActiveTabIcon && <ActiveTabIcon className="w-4 h-4 shrink-0 text-white" />}
                <span className="font-extrabold tracking-wide">On {activeChildLabel}</span>
              </button>
            </div>
          )}
        </nav>
      </div>

      {/* Mobile Navigation - Hamburger Menu */}
      <div className="lg:hidden">
        {/* Floating Menu Pill - Main Tab Switcher Menu */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] print:hidden">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="bg-slate-800/95 dark:bg-slate-200/95 text-white dark:text-slate-900 px-5 py-2.5 rounded-full shadow-2xl hover:bg-slate-700 dark:hover:bg-white transition-all flex items-center gap-2 font-semibold text-sm border border-slate-600/30 dark:border-slate-300 active:scale-95 touch-manipulation cursor-pointer pointer-events-auto"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-4 h-4" />
            <span>{t("Menu")}</span>
          </button>
        </div>

        {/* Slide-out Drawer */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-[70] flex justify-end">
            {/* Overlay */}
            <div
              className="absolute inset-0 bg-black/50 transition-opacity backdrop-blur-sm"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            {/* Drawer */}
            <div className="relative w-[280px] max-w-[80vw] bg-white dark:bg-[#1e1e20] h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 ease-out">
              <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-[#333336]">
                <span className="font-bold text-lg text-slate-800 dark:text-[#f3f3f3]">Navigation</span>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-[#333336] rounded-full transition-colors"
                  aria-label="Close Navigation Menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Mobile Ribbon Display Section */}
                <div className="p-3 bg-slate-50 dark:bg-[#28282a] rounded-xl border border-slate-200/80 dark:border-[#333336]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600 dark:text-[#c3c3c3]">Ribbon Display</span>
                    <RibbonDisplayMenu variant="navbar" />
                  </div>
                </div>
                {visibleParentTabs.map((pt) => {
                  const childTabs = childTabMap[pt.id as ParentTabId]
                    .map((childId) => tabs.find((t) => t.id === childId))
                    .filter((t): t is (typeof tabs)[0] => !!t && !t.hidden);
                  if (childTabs.length === 0) return null;
                  return (
                    <div key={pt.id}>
                      <h3 className="text-xs font-bold text-slate-400 dark:text-[#838383] uppercase tracking-wider mb-2 px-2">
                        {t(pt.id)}
                      </h3>
                      <div className="space-y-1">
                        {childTabs.map((tab) => {
                          const Icon = tab.icon;
                          const isActive = activeTab === tab.id;
                          return (
                            <button
                              key={tab.id}
                              onClick={() => {
                                onTabChange(tab.id);
                                setIsMobileMenuOpen(false);
                              }}
                              className={cn(
                                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                                isActive
                                  ? "bg-blue-50 text-blue-600 dark:bg-[#28282a] dark:text-[#8ab4f8]"
                                  : "text-slate-600 dark:text-[#c3c3c3] hover:bg-slate-100 dark:hover:bg-[#333336]"
                              )}
                            >
                              <Icon className="w-5 h-5" />
                              {tab.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
