import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Command,
  ArrowRight,
  FolderPlus,
  PlusCircle,
  Sun,
  Moon,
  Maximize2,
  Minimize2,
  Printer,
  ScanQrCode,
  CalendarCheck,
  ImageDown,
  DollarSign,
  LayoutDashboard,
  Calendar,
  BarChartHorizontal,
  List,
  PieChart,
  Shield,
  FileText,
  Settings,
  HelpCircle,
  Building2,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  GripHorizontal,
  ChevronRight,
  Hash,
  Sparkles,
  MapPin,
  Tag,
  ArrowUpDown,
  CornerDownLeft,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { TabId, Project, Task, AppRole } from '../types';
import { cn } from '../lib/utils';
import { useLanguage } from '../lib/LanguageContext';

export interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTabChange: (tab: TabId) => void;
  onToggleTheme?: () => void;
  onToggleFocusMode?: () => void;
  onPrintPreviewToggle?: () => void;
}

type CommandCategory = 'all' | 'actions' | 'navigation' | 'floors' | 'projects' | 'tasks';

interface PaletteItem {
  id: string;
  category: 'actions' | 'navigation' | 'floors' | 'projects' | 'tasks';
  title: string;
  subtitle?: string;
  code?: string;
  badge?: string;
  badgeColor?: string;
  icon: React.ElementType;
  iconColor?: string;
  shortcut?: string;
  onSelect: () => void;
  score?: number;
}

export function CommandPaletteModal({
  isOpen,
  onClose,
  onTabChange,
  onToggleTheme,
  onToggleFocusMode,
  onPrintPreviewToggle,
}: CommandPaletteModalProps) {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CommandCategory>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Store bindings
  const currentUser = useAppStore(state => state.currentUser);
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const theme = useAppStore(state => state.theme);
  const isFocusMode = useAppStore(state => state.isFocusMode);
  const currency = useAppStore(state => state.currency);
  const setCurrency = useAppStore(state => state.setCurrency);
  const locations = useAppStore(state => state.locations);
  const setIsProjectModalOpen = useAppStore(state => state.setIsProjectModalOpen);
  const setEditingProject = useAppStore(state => state.setEditingProject);
  const setIsTaskModalOpen = useAppStore(state => state.setIsTaskModalOpen);
  const setEditingTask = useAppStore(state => state.setEditingTask);
  const setIsReadOnlyModal = useAppStore(state => state.setIsReadOnlyModal);
  const setModalInitialTab = useAppStore(state => state.setModalInitialTab);
  const setPrefillProjectCode = useAppStore(state => state.setPrefillProjectCode);
  const setPrefillProjectYear = useAppStore(state => state.setPrefillProjectYear);
  const triggerGanttToday = useAppStore(state => state.triggerGanttToday);
  const setLayoutTabFilters = useAppStore(state => state.setLayoutTabFilters);
  const setGanttTabFocusTaskId = useAppStore(state => state.setGanttTabFocusTaskId);
  const setDetailTabFocusTaskId = useAppStore(state => state.setDetailTabFocusTaskId);
  const setDetailTabFilterCode = useAppStore(state => state.setDetailTabFilterCode);
  const setQuickNavTarget = useAppStore(state => state.setQuickNavTarget);

  const { enrichedProjects: projects, filteredTasks: tasks } = useEnrichedData();

  const userRole = (currentUser?.role || 'guest') as AppRole;
  const isAdmin = currentUser?.role === 'admin';
  const perms = permissionMatrix[userRole] || {};

  // Auto focus input on open
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedCategory('all');
      setSelectedIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle Tab / Category categories
  const categories: Array<{ id: CommandCategory; label: string; icon: React.ElementType }> = [
    { id: 'all', label: 'All', icon: Sparkles },
    { id: 'actions', label: 'Actions', icon: ZapIcon },
    { id: 'navigation', label: 'Navigation', icon: CompassIcon },
    { id: 'floors', label: 'Floors', icon: Building2 },
    { id: 'projects', label: 'Projects', icon: Tag },
    { id: 'tasks', label: 'Tasks', icon: List },
  ];

  function ZapIcon(props: any) {
    return <Sparkles {...props} />;
  }
  function CompassIcon(props: any) {
    return <LayoutDashboard {...props} />;
  }

  // 1. Build Quick Actions
  const actionItems: PaletteItem[] = useMemo(() => {
    const items: PaletteItem[] = [];

    // New Project
    if (isAdmin || !!(perms as any)?.Write?.general) {
      items.push({
        id: 'action-new-project',
        category: 'actions',
        title: 'Create New Project',
        subtitle: 'Open blank project modal',
        icon: FolderPlus,
        iconColor: 'text-blue-500 bg-blue-50 dark:bg-blue-950/50',
        shortcut: 'P',
        onSelect: () => {
          setEditingProject(null);
          setIsReadOnlyModal(false);
          setModalInitialTab('details');
          setIsProjectModalOpen(true);
          onClose();
        },
      });
    }

    // New Task
    if (isAdmin || !!(perms as any)?.Write?.detail) {
      items.push({
        id: 'action-new-task',
        category: 'actions',
        title: 'Create New Task',
        subtitle: 'Add new task to current or selected project',
        icon: PlusCircle,
        iconColor: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/50',
        shortcut: 'T',
        onSelect: () => {
          setEditingTask(null);
          setIsReadOnlyModal(false);
          setModalInitialTab('details');
          const safeP = projects && projects.length > 0 ? projects[0] : null;
          setPrefillProjectCode(safeP?.code || '');
          setPrefillProjectYear(safeP?.year || null);
          setIsTaskModalOpen(true);
          onClose();
        },
      });
    }

    // Toggle Theme
    items.push({
      id: 'action-toggle-theme',
      category: 'actions',
      title: theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode',
      subtitle: `Currently in ${theme === 'dark' ? 'Dark' : 'Light'} theme`,
      icon: theme === 'dark' ? Sun : Moon,
      iconColor: 'text-amber-500 bg-amber-50 dark:bg-amber-950/50',
      onSelect: () => {
        onToggleTheme?.();
        onClose();
      },
    });

    // Toggle Focus Mode
    items.push({
      id: 'action-toggle-focus',
      category: 'actions',
      title: isFocusMode ? 'Exit Focus Mode' : 'Enter Focus Mode',
      subtitle: 'Maximize workspace and hide toolbars',
      icon: isFocusMode ? Minimize2 : Maximize2,
      iconColor: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950/50',
      shortcut: 'Shift+F',
      onSelect: () => {
        onToggleFocusMode?.();
        onClose();
      },
    });

    // Go to Today in Gantt
    items.push({
      id: 'action-gantt-today',
      category: 'actions',
      title: 'Go to Today (Gantt Timeline)',
      subtitle: 'Scroll timeline directly to Today vertical marker',
      icon: CalendarCheck,
      iconColor: 'text-rose-500 bg-rose-50 dark:bg-rose-950/50',
      onSelect: () => {
        onTabChange('gantt');
        triggerGanttToday();
        onClose();
      },
    });

    // Print Preview
    items.push({
      id: 'action-print-preview',
      category: 'actions',
      title: 'Toggle Print Preview',
      subtitle: 'High-fidelity PDF and paper export preview',
      icon: Printer,
      iconColor: 'text-purple-500 bg-purple-50 dark:bg-purple-950/50',
      onSelect: () => {
        onPrintPreviewToggle?.();
        onClose();
      },
    });

    // Switch Currency
    items.push({
      id: 'action-currency',
      category: 'actions',
      title: `Cycle Currency (Current: ${currency === 'VND' ? "'000 VND" : currency === 'JPY' ? '万円' : 'USD'})`,
      subtitle: 'Switch between VND, JPY, and USD display rates',
      icon: DollarSign,
      iconColor: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/50',
      onSelect: () => {
        let next: 'VND' | 'JPY' | 'USD' = 'VND';
        if (currency === 'VND') next = 'JPY';
        else if (currency === 'JPY') next = 'USD';
        setCurrency(next);
        onClose();
      },
    });

    // Export PNG
    items.push({
      id: 'action-export-png',
      category: 'actions',
      title: 'Export Active View as PNG',
      subtitle: 'Capture high resolution image snapshot',
      icon: ImageDown,
      iconColor: 'text-cyan-500 bg-cyan-50 dark:bg-cyan-950/50',
      onSelect: () => {
        window.dispatchEvent(new CustomEvent('export-png'));
        onClose();
      },
    });

    return items;
  }, [
    isAdmin,
    perms,
    theme,
    isFocusMode,
    currency,
    projects,
    onClose,
    onTabChange,
    onToggleTheme,
    onToggleFocusMode,
    onPrintPreviewToggle,
    setEditingProject,
    setIsReadOnlyModal,
    setModalInitialTab,
    setIsProjectModalOpen,
    setEditingTask,
    setPrefillProjectCode,
    setPrefillProjectYear,
    setIsTaskModalOpen,
    triggerGanttToday,
    setCurrency,
  ]);

  // 2. Build Navigation Items (Tabs)
  const navItems: PaletteItem[] = useMemo(() => {
    const tabs: Array<{ id: TabId; label: string; desc: string; icon: React.ElementType; shortcut?: string }> = [
      { id: 'general', label: 'General Tab', desc: 'Project overview and master summary table', icon: LayoutDashboard, shortcut: '1' },
      { id: 'calendar', label: 'Calendar Tab', desc: 'Monthly project & task delivery schedule', icon: Calendar, shortcut: '2' },
      { id: 'gantt', label: 'Gantt Chart Tab', desc: 'Interactive timeline with dependencies & today pin', icon: BarChartHorizontal, shortcut: '3' },
      { id: 'detail', label: 'Task Detail Tab', desc: 'Granular task list with inline status & progress', icon: List, shortcut: '4' },
      { id: 'budget', label: 'Budget Tab', desc: 'Capital expenditure and cash flow management', icon: PieChart, shortcut: '5' },
      { id: 'cost', label: 'Cost Detail Tab', desc: 'Detailed payment vouchers & vendor expenses', icon: DollarSign, shortcut: '6' },
      { id: 'layout', label: 'Floor Layout Tab', desc: 'Interactive 2D architectural map & store locator', icon: Building2, shortcut: '7' },
      { id: 'summary', label: 'Summary Matrix Tab', desc: 'Cross-functional executive KPIs and metrics', icon: FileText, shortcut: '8' },
      { id: 'taskDelegation', label: 'Task Delegation Tab', desc: 'Multi-party vendor and contractor assignment', icon: List, shortcut: '9' },
      { id: 'taskDelegationCalendar', label: 'Delegation Calendar Tab', desc: 'Timeline view of contractor work schedules', icon: Calendar },
      { id: 'accControl', label: 'Access Control Tab', desc: 'User permissions, roles, and store access matrix', icon: Shield },
      { id: 'audit', label: 'Audit Log Tab', desc: 'Append-only chronological change history', icon: Shield },
      { id: 'csv_export', label: 'CSV Export / Import Tab', desc: 'Bulk data migration and backup engine', icon: FileText },
      { id: 'picture_mapping', label: 'Picture Mapping Tab', desc: 'Floor plan image and anchor configuration', icon: ImageDown },
      { id: 'notification', label: 'Notifications Tab', desc: 'Critical milestones, handover & opening alerts', icon: BellIcon },
      { id: 'setting', label: 'Settings Tab', desc: 'Notification rules, threshold days, and display preferences', icon: Settings },
      { id: 'manual', label: 'User Manual Tab', desc: 'Standard operating procedures and user manual', icon: HelpCircle },
    ];

    function BellIcon(props: any) {
      return <AlertCircle {...props} />;
    }

    return tabs.map(tab => ({
      id: `nav-${tab.id}`,
      category: 'navigation',
      title: tab.label,
      subtitle: tab.desc,
      icon: tab.icon,
      iconColor: 'text-slate-600 dark:text-[#a3a3a3] bg-slate-100 dark:bg-[#28282a]',
      shortcut: tab.shortcut,
      onSelect: () => {
        onTabChange(tab.id);
        onClose();
      },
    }));
  }, [onTabChange, onClose]);

  // 3. Build Floor Layout Items
  const floorItems: PaletteItem[] = useMemo(() => {
    const list = locations && locations.length > 0 ? locations : ['L1', 'L2', 'L3', 'B1', 'B2', '3F', '4F'];
    return list.map(floor => ({
      id: `floor-${floor}`,
      category: 'floors',
      title: `Floor ${floor} Layout`,
      subtitle: `Jump directly to Floor ${floor} architectural floor plan`,
      badge: floor,
      badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300',
      icon: Building2,
      iconColor: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/50',
      onSelect: () => {
        setLayoutTabFilters({ location: floor });
        onTabChange('layout');
        onClose();
      },
    }));
  }, [locations, setLayoutTabFilters, onTabChange, onClose]);

  // 4. Build Projects Items
  const projectItems: PaletteItem[] = useMemo(() => {
    if (!projects || projects.length === 0) return [];
    return projects.map(p => {
      const isHCM = (p.store || '').toUpperCase() === 'HCM';
      return {
        id: `proj-${p.id || p.code}`,
        category: 'projects',
        title: p.name || 'Untitled Project',
        subtitle: `${p.year || ''} • ${p.store || 'HCM'} • Floor ${p.location || 'N/A'}`,
        code: p.code,
        badge: p.store || 'HCM',
        badgeColor: isHCM
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
          : 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300',
        icon: Tag,
        iconColor: isHCM
          ? 'text-blue-600 dark:text-[#8ab4f8] bg-blue-50 dark:bg-blue-950/50'
          : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50',
        onSelect: () => {
          setQuickNavTarget({ project: p });
          onClose();
        },
      };
    });
  }, [projects, setQuickNavTarget, onClose]);

  // 5. Build Tasks Items
  const taskItems: PaletteItem[] = useMemo(() => {
    if (!tasks || tasks.length === 0) return [];
    return tasks.map(t => {
      const runningStatus = t.runningStatus || 'In Progress';
      const percent = (t as any).percent ?? (t as any).progress ?? 0;
      return {
        id: `task-${t.id}`,
        category: 'tasks',
        title: t.name || 'Untitled Task',
        subtitle: `Project ${t.projectCode || ''} • Party: ${t.party || 'Internal'} • Status: ${runningStatus}`,
        code: t.taskCodePhu || t.projectCode,
        badge: `${percent}%`,
        badgeColor: percent >= 100
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
          : 'bg-slate-100 text-slate-700 dark:bg-[#333336] dark:text-[#c3c3c3]',
        icon: List,
        iconColor: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50',
        onSelect: () => {
          setGanttTabFocusTaskId(t.id);
          setDetailTabFocusTaskId(t.id);
          onTabChange('gantt');
          onClose();
        },
      };
    });
  }, [tasks, setGanttTabFocusTaskId, setDetailTabFocusTaskId, onTabChange, onClose]);

  // Combine & Filter based on searchQuery and selectedCategory
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const pool = [
      ...(selectedCategory === 'all' || selectedCategory === 'actions' ? actionItems : []),
      ...(selectedCategory === 'all' || selectedCategory === 'navigation' ? navItems : []),
      ...(selectedCategory === 'all' || selectedCategory === 'floors' ? floorItems : []),
      ...(selectedCategory === 'all' || selectedCategory === 'projects' ? projectItems : []),
      ...(selectedCategory === 'all' || selectedCategory === 'tasks' ? taskItems : []),
    ];

    if (!q) {
      // Return top priority items when search is empty
      if (selectedCategory === 'all') {
        return [
          ...actionItems.slice(0, 4),
          ...navItems.slice(0, 4),
          ...floorItems.slice(0, 3),
          ...projectItems.slice(0, 5),
          ...taskItems.slice(0, 4),
        ];
      }
      return pool.slice(0, 25);
    }

    return pool
      .filter(item => {
        const titleMatch = item.title.toLowerCase().includes(q);
        const subMatch = (item.subtitle || '').toLowerCase().includes(q);
        const codeMatch = (item.code || '').toLowerCase().includes(q);
        const badgeMatch = (item.badge || '').toLowerCase().includes(q);
        return titleMatch || subMatch || codeMatch || badgeMatch;
      })
      .slice(0, 30);
  }, [searchQuery, selectedCategory, actionItems, navItems, floorItems, projectItems, taskItems]);

  // Adjust active index within range
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery, selectedCategory]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredItems.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].onSelect();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const catKeys = categories.map(c => c.id);
        const currentCatIdx = catKeys.indexOf(selectedCategory);
        const nextCatIdx = e.shiftKey
          ? (currentCatIdx - 1 + catKeys.length) % catKeys.length
          : (currentCatIdx + 1) % catKeys.length;
        setSelectedCategory(catKeys[nextCatIdx]);
      }
    },
    [filteredItems, selectedIndex, selectedCategory, categories, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-16 sm:pt-24 p-3 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, scale: 0.96, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -10 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="w-full max-w-2xl bg-white dark:bg-[#1e1e20] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#38383a] overflow-hidden flex flex-col max-h-[82vh]"
        onKeyDown={handleKeyDown}
      >
        {/* Top Draggable Handle & Search Bar Header */}
        <div className="border-b border-slate-100 dark:border-[#333336] p-3 sm:p-4 bg-slate-50/70 dark:bg-[#252528]/70">
          <div className="flex items-center justify-between gap-2 mb-2 px-1 text-slate-400 dark:text-[#838383]">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#a3a3a3]">
              <Command className="w-3.5 h-3.5" />
              <span>Command Palette</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-[#38383a] text-slate-600 dark:text-[#c3c3c3]">
                Esc to close
              </span>
              <button
                onClick={onClose}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-[#f3f3f3] hover:bg-slate-200 dark:hover:bg-[#38383a] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="relative flex items-center">
            <Search className="absolute left-3.5 w-5 h-5 text-slate-400 dark:text-[#838383] pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search projects, tasks, floors, actions, or jump to tab..."
              className="w-full pl-11 pr-24 py-2.5 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl text-slate-800 dark:text-[#f3f3f3] placeholder-slate-400 dark:placeholder-[#838383] text-sm sm:text-base font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs transition-all"
            />
            <div className="absolute right-3 flex items-center gap-1 pointer-events-none">
              <kbd className="text-[10px] font-mono font-bold bg-slate-100 dark:bg-[#28282a] text-slate-500 dark:text-[#a3a3a3] border border-slate-200 dark:border-[#444446] px-1.5 py-0.5 rounded shadow-2xs">
                ⌘K
              </kbd>
            </div>
          </div>

          {/* Filter Categories Chips */}
          <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto no-scrollbar pb-0.5">
            {categories.map(cat => {
              const Icon = cat.icon;
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer active:scale-95 touch-manipulation',
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white dark:bg-[#1e1e20] text-slate-600 dark:text-[#c3c3c3] hover:bg-slate-200/70 dark:hover:bg-[#333336] border border-slate-200/80 dark:border-[#38383a]'
                  )}
                >
                  <Icon className="w-3 h-3" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* List of Filtered Items */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-slate-100/50 dark:divide-[#28282a]/50"
        >
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-[#838383]">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">No results found for "{searchQuery}"</p>
              <p className="text-xs text-slate-400 mt-1">Try typing project codes, task names, or actions like "Gantt" or "Theme"</p>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  data-index={idx}
                  onClick={item.onSelect}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    'group px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-all',
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-[#8ab4f8] shadow-2xs'
                      : 'hover:bg-slate-50 dark:hover:bg-[#252528] text-slate-700 dark:text-[#e3e3e3]'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-2xs transition-colors',
                        item.iconColor || 'bg-slate-100 dark:bg-[#28282a] text-slate-600 dark:text-[#c3c3c3]'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {item.code && (
                          <span className="font-mono font-extrabold text-xs text-blue-700 dark:text-[#8ab4f8] uppercase shrink-0">
                            {item.code}
                          </span>
                        )}
                        <span className="font-semibold text-sm truncate">{item.title}</span>
                        {item.badge && (
                          <span
                            className={cn(
                              'text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0',
                              item.badgeColor || 'bg-slate-100 text-slate-700 dark:bg-[#28282a] dark:text-[#c3c3c3]'
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <p className="text-xs text-slate-400 dark:text-[#838383] truncate mt-0.5">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right Shortcut or Action Indicator */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.shortcut && (
                      <kbd className="text-[10px] font-mono font-bold bg-white dark:bg-[#28282a] text-slate-500 dark:text-[#a3a3a3] border border-slate-200 dark:border-[#444446] px-1.5 py-0.5 rounded shadow-2xs">
                        {item.shortcut}
                      </kbd>
                    )}
                    <CornerDownLeft
                      className={cn(
                        'w-3.5 h-3.5 transition-opacity',
                        isSelected ? 'opacity-100 text-blue-600 dark:text-blue-400' : 'opacity-0 group-hover:opacity-60'
                      )}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Footer Status Bar */}
        <div className="border-t border-slate-100 dark:border-[#333336] px-4 py-2 bg-slate-50/80 dark:bg-[#252528]/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-[#838383]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="font-mono bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] px-1 rounded">↑↓</kbd> Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="font-mono bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] px-1 rounded">↵</kbd> Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="font-mono bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] px-1 rounded">Tab</kbd> Category
            </span>
          </div>

          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
            <span>{filteredItems.length} results</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
