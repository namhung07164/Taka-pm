import React, { useMemo } from 'react';
import {
  FolderPlus,
  PlusCircle,
  Sun,
  Moon,
  Maximize2,
  Minimize2,
  CalendarCheck,
  Printer,
  DollarSign,
  ImageDown,
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
  Tag,
  AlertCircle,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useEnrichedData } from '../../hooks/useEnrichedData';
import { TabId, AppRole } from '../../types';
import { PaletteItem, CommandCategory, CommandPaletteModalProps } from './commandPaletteTypes';

interface UseCommandPaletteItemsProps {
  searchQuery: string;
  selectedCategory: CommandCategory;
  onClose: () => void;
  onTabChange: (tab: TabId) => void;
  onToggleTheme?: () => void;
  onToggleFocusMode?: () => void;
  onPrintPreviewToggle?: () => void;
}

export function useCommandPaletteItems({
  searchQuery,
  selectedCategory,
  onClose,
  onTabChange,
  onToggleTheme,
  onToggleFocusMode,
  onPrintPreviewToggle,
}: UseCommandPaletteItemsProps) {
  const currentUser = useAppStore((state) => state.currentUser);
  const permissionMatrix = useAppStore((state) => state.permissionMatrix);
  const theme = useAppStore((state) => state.theme);
  const isFocusMode = useAppStore((state) => state.isFocusMode);
  const currency = useAppStore((state) => state.currency);
  const setCurrency = useAppStore((state) => state.setCurrency);
  const locations = useAppStore((state) => state.locations);
  const setIsProjectModalOpen = useAppStore((state) => state.setIsProjectModalOpen);
  const setEditingProject = useAppStore((state) => state.setEditingProject);
  const setIsTaskModalOpen = useAppStore((state) => state.setIsTaskModalOpen);
  const setEditingTask = useAppStore((state) => state.setEditingTask);
  const setIsReadOnlyModal = useAppStore((state) => state.setIsReadOnlyModal);
  const setModalInitialTab = useAppStore((state) => state.setModalInitialTab);
  const setPrefillProjectCode = useAppStore((state) => state.setPrefillProjectCode);
  const setPrefillProjectYear = useAppStore((state) => state.setPrefillProjectYear);
  const triggerGanttToday = useAppStore((state) => state.triggerGanttToday);
  const setLayoutTabFilters = useAppStore((state) => state.setLayoutTabFilters);
  const setGanttTabFocusTaskId = useAppStore((state) => state.setGanttTabFocusTaskId);
  const setDetailTabFocusTaskId = useAppStore((state) => state.setDetailTabFocusTaskId);
  const setQuickNavTarget = useAppStore((state) => state.setQuickNavTarget);

  const { enrichedProjects: projects, filteredTasks: tasks } = useEnrichedData();

  const userRole = (currentUser?.role || 'guest') as AppRole;
  const isAdmin = currentUser?.role === 'admin';
  const perms = permissionMatrix[userRole] || {};

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
    const tabs: Array<{
      id: TabId;
      label: string;
      desc: string;
      icon: React.ElementType;
      shortcut?: string;
    }> = [
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
      { id: 'notification', label: 'Notifications Tab', desc: 'Critical milestones, handover & opening alerts', icon: AlertCircle },
      { id: 'setting', label: 'Settings Tab', desc: 'Notification rules, threshold days, and display preferences', icon: Settings },
      { id: 'manual', label: 'User Manual Tab', desc: 'Standard operating procedures and user manual', icon: HelpCircle },
    ];

    return tabs.map((tab) => ({
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
    return list.map((floor) => ({
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
    return projects.map((p) => {
      const isHCM = (p.store || '').toUpperCase() === 'HCM';
      const desc = p.detail || (p as any).description || p.note || '';
      return {
        id: `proj-${p.id || p.code}`,
        category: 'projects' as const,
        title: p.name || 'Untitled Project',
        subtitle: `${p.year || ''} • ${p.store || 'HCM'} • Floor ${p.location || 'N/A'}${
          desc ? ` • ${desc.length > 80 ? desc.slice(0, 80) + '...' : desc}` : ''
        }`,
        code: `${p.code || ''} ${p.linkCodes || ''} ${desc}`,
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
    return tasks.map((t) => {
      const runningStatus = t.runningStatus || 'In Progress';
      const percent = (t as any).percent ?? (t as any).progress ?? 0;
      return {
        id: `task-${t.id}`,
        category: 'tasks',
        title: t.name || 'Untitled Task',
        subtitle: `Project ${t.projectCode || ''} • Party: ${t.party || 'Internal'} • Status: ${runningStatus}`,
        code: t.taskCodePhu || t.projectCode,
        badge: `${percent}%`,
        badgeColor:
          percent >= 100
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
      .filter((item) => {
        const titleMatch = item.title.toLowerCase().includes(q);
        const subMatch = (item.subtitle || '').toLowerCase().includes(q);
        const codeMatch = (item.code || '').toLowerCase().includes(q);
        const badgeMatch = (item.badge || '').toLowerCase().includes(q);
        return titleMatch || subMatch || codeMatch || badgeMatch;
      })
      .slice(0, 30);
  }, [searchQuery, selectedCategory, actionItems, navItems, floorItems, projectItems, taskItems]);

  return {
    filteredItems,
  };
}
