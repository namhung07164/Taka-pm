import React, { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import { 
  Search, 
  X, 
  FolderKanban, 
  CheckSquare, 
  Users, 
  User, 
  ChevronRight, 
  BarChartHorizontal, 
  ListOrdered, 
  MapPin, 
  ExternalLink,
  Command,
  ArrowRight,
  Clock,
  Building2,
  Calendar
} from 'lucide-react';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { useAppStore } from '../store/useAppStore';
import { Project, Task, TabId, AppRole } from '../types';
import { cn, formatDisplayDateMain, matchesAdvancedSearch } from '../lib/utils';
import { useLanguage } from '../lib/LanguageContext';

export interface GlobalSearchProps {
  onQuickNavigate?: (targetTab: TabId, target: any) => void;
  onTabChange?: (tab: TabId) => void;
  isModalOnly?: boolean;
  className?: string;
}

interface AssigneeResult {
  name: string;
  taskCount: number;
  projectCount: number;
  projectCodes: string[];
  tasks: Task[];
  projects: Project[];
}

type SearchCategory = 'all' | 'projects' | 'tasks' | 'assignees';

type SearchItem = 
  | { type: 'project'; data: Project; key: string }
  | { type: 'task'; data: Task; parentProject?: Project; key: string }
  | { type: 'assignee'; data: AssigneeResult; key: string };

function HighlightMatch({ text, query }: { text: string | undefined | null; query: string }) {
  if (!text) return null;
  if (!query || !query.trim()) return <>{text}</>;

  const cleanQuery = query.trim().replace(/[+,"*]/g, ' ').trim();
  const words = cleanQuery.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return <>{text}</>;

  // Build regex from words
  const escapedWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escapedWords.join('|')})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = words.some(w => w.toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <mark 
            key={i} 
            className="bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold px-0.5 rounded"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({
  onQuickNavigate,
  onTabChange,
  isModalOnly = false,
  className = ''
}) => {
  const { enrichedProjects: projects, filteredTasks: tasks } = useEnrichedData();
  const allProjects = useAppStore(state => state.projects);
  const appUsers = useAppStore(state => state.appUsers);
  const parties = useAppStore(state => state.parties);
  const delegationGroups = useAppStore(state => state.delegationGroups);
  const isTasksRequested = useAppStore(state => state.isTasksRequested);
  const setIsTasksRequested = useAppStore(state => state.setIsTasksRequested);
  const setQuickNavTarget = useAppStore(state => state.setQuickNavTarget);
  const currentUser = useAppStore(state => state.currentUser);
  const { t } = useLanguage();

  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<SearchCategory>('all');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Lazy load tasks when search is opened
  const ensureTasksLoaded = () => {
    if (!isTasksRequested) {
      setIsTasksRequested(true);
    }
  };

  // Keyboard shortcut listener for '/'
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // If typing in any input/textarea, ignore unless it is our search input
      const target = e.target as HTMLElement | null;
      const isInputFocused = target && (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable
      );

      if (e.key === '/' && !isInputFocused && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        ensureTasksLoaded();
        setIsOpen(true);
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 50);
      }

      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, isTasksRequested]);

  // Handle click outside to close dropdown
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Index project lookup map for fast task parent resolution
  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    const list = projects.length > 0 ? projects : allProjects;
    list.forEach(p => {
      if (p.code) {
        map.set(String(p.code).trim().toUpperCase(), p);
      }
    });
    return map;
  }, [projects, allProjects]);

  // Build Assignees Index
  const assigneeIndex = useMemo(() => {
    const map = new Map<string, AssigneeResult>();

    const registerAssignee = (rawName: string, task?: Task, project?: Project) => {
      if (!rawName) return;
      const trimmed = rawName.trim();
      if (!trimmed || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') return;

      const key = trimmed.toLowerCase();
      let record = map.get(key);
      if (!record) {
        record = {
          name: trimmed,
          taskCount: 0,
          projectCount: 0,
          projectCodes: [],
          tasks: [],
          projects: []
        };
        map.set(key, record);
      }

      if (task) {
        if (!record.tasks.some(t => t.id === task.id)) {
          record.tasks.push(task);
          record.taskCount++;
        }
        if (task.projectCode && !record.projectCodes.includes(task.projectCode)) {
          record.projectCodes.push(task.projectCode);
        }
      }

      if (project) {
        if (!record.projects.some(p => p.code === project.code && p.year === project.year)) {
          record.projects.push(project);
          record.projectCount++;
        }
        if (project.code && !record.projectCodes.includes(project.code)) {
          record.projectCodes.push(project.code);
        }
      }
    };

    // 1. Collect from tasks party
    tasks.forEach(t => {
      if (t.party) {
        const parts = t.party.split(/[,;/+]+/).map(s => s.trim()).filter(Boolean);
        parts.forEach(pName => registerAssignee(pName, t));
      }
    });

    // 2. Collect from projects party
    (projects.length > 0 ? projects : allProjects).forEach(p => {
      if (p.party) {
        const parts = p.party.split(/[,;/+]+/).map(s => s.trim()).filter(Boolean);
        parts.forEach(pName => registerAssignee(pName, undefined, p));
      }
    });

    // 3. Collect from delegation groups
    delegationGroups.forEach(g => {
      (g.subTasks || []).forEach(st => {
        if (st.party) {
          const parts = st.party.split(/[,;/+]+/).map(s => s.trim()).filter(Boolean);
          parts.forEach(pName => registerAssignee(pName));
        }
      });
    });

    // 4. Collect from app users & configured parties
    appUsers.forEach(u => {
      if (u.name) registerAssignee(u.name);
      if (u.username) registerAssignee(u.username);
    });
    parties.forEach(p => registerAssignee(p));

    return Array.from(map.values()).sort((a, b) => (b.taskCount + b.projectCount) - (a.taskCount + a.projectCount));
  }, [tasks, projects, allProjects, delegationGroups, appUsers, parties]);

  // Search Results filtering
  const { matchingProjects, matchingTasks, matchingAssignees } = useMemo(() => {
    const query = deferredSearch.trim();
    if (!query) {
      return {
        matchingProjects: (projects.length > 0 ? projects : allProjects).slice(0, 10),
        matchingTasks: tasks.slice(0, 10),
        matchingAssignees: assigneeIndex.slice(0, 8)
      };
    }

    // 1. Filter Projects: by name, code, store, year, party
    const activeProjects = projects.length > 0 ? projects : allProjects;
    const filteredProjects = activeProjects.filter(p => {
      return matchesAdvancedSearch(query, [
        p.name,
        p.code,
        p.store,
        p.year,
        p.location,
        p.party,
        p.type
      ]);
    }).sort((a, b) => {
      const qLower = query.toLowerCase();
      const aCode = String(a.code || '').toLowerCase();
      const bCode = String(b.code || '').toLowerCase();
      const aName = String(a.name || '').toLowerCase();
      const bName = String(b.name || '').toLowerCase();

      // Exact code match first
      if (aCode === qLower && bCode !== qLower) return -1;
      if (bCode === qLower && aCode !== qLower) return 1;
      // Code startsWith query
      if (aCode.startsWith(qLower) && !bCode.startsWith(qLower)) return -1;
      if (bCode.startsWith(qLower) && !aCode.startsWith(qLower)) return 1;
      // Name startsWith query
      if (aName.startsWith(qLower) && !bName.startsWith(qLower)) return -1;
      if (bName.startsWith(qLower) && !aName.startsWith(qLower)) return 1;

      return 0;
    });

    // 2. Filter Tasks: by name, taskCodePhu, projectCode, party
    const filteredTasks = tasks.filter(t => {
      const parentP = projectMap.get(String(t.projectCode || '').trim().toUpperCase());
      return matchesAdvancedSearch(query, [
        t.name,
        t.taskCodePhu,
        t.projectCode,
        t.party,
        parentP?.name,
        t.projectStore,
        t.projectYear
      ]);
    }).sort((a, b) => {
      const qLower = query.toLowerCase();
      const aName = String(a.name || '').toLowerCase();
      const bName = String(b.name || '').toLowerCase();
      if (aName.startsWith(qLower) && !bName.startsWith(qLower)) return -1;
      if (bName.startsWith(qLower) && !aName.startsWith(qLower)) return 1;
      return 0;
    });

    // 3. Filter Assignees: by name
    const filteredAssignees = assigneeIndex.filter(a => {
      return matchesAdvancedSearch(query, [a.name, ...a.projectCodes]);
    });

    return {
      matchingProjects: filteredProjects,
      matchingTasks: filteredTasks,
      matchingAssignees: filteredAssignees
    };
  }, [deferredSearch, projects, allProjects, tasks, assigneeIndex, projectMap]);

  // Prepare flattened results for keyboard navigation & active tab filtering
  const visibleItems = useMemo<SearchItem[]>(() => {
    const list: SearchItem[] = [];

    if (activeCategory === 'all' || activeCategory === 'projects') {
      const limit = activeCategory === 'all' ? 6 : 50;
      matchingProjects.slice(0, limit).forEach(p => {
        list.push({ type: 'project', data: p, key: `p-${p.code}-${p.year}-${p.store}` });
      });
    }

    if (activeCategory === 'all' || activeCategory === 'tasks') {
      const limit = activeCategory === 'all' ? 10 : 50;
      matchingTasks.slice(0, limit).forEach(t => {
        const parentP = projectMap.get(String(t.projectCode || '').trim().toUpperCase());
        list.push({ type: 'task', data: t, parentProject: parentP, key: `t-${t.id}` });
      });
    }

    if (activeCategory === 'all' || activeCategory === 'assignees') {
      const limit = activeCategory === 'all' ? 6 : 50;
      matchingAssignees.slice(0, limit).forEach(a => {
        list.push({ type: 'assignee', data: a, key: `a-${a.name}` });
      });
    }

    return list;
  }, [activeCategory, matchingProjects, matchingTasks, matchingAssignees, projectMap]);

  // Reset highlight index when query or category changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [deferredSearch, activeCategory]);

  // Execute navigation
  const executeNavigation = (item: SearchItem, targetTab: TabId = 'detail') => {
    setIsOpen(false);
    inputRef.current?.blur();

    if (item.type === 'project') {
      const p = item.data;
      if (onQuickNavigate) {
        onQuickNavigate(targetTab, { project: p });
      } else {
        useAppStore.getState().setGlobalYearFilter(p.year ? String(p.year) : 'all');
        if (p.store) useAppStore.getState().setGlobalStoreFilter(p.store);
        useAppStore.getState().setDetailTabFilterCode(p.code);
        onTabChange?.(targetTab);
      }
    } else if (item.type === 'task') {
      const t = item.data;
      const parentP = item.parentProject || projectMap.get(String(t.projectCode || '').trim().toUpperCase()) || {
        code: t.projectCode,
        year: t.projectYear,
        store: t.projectStore,
        no: 1,
        name: t.projectCode
      } as Project;

      if (onQuickNavigate) {
        onQuickNavigate(targetTab, {
          project: parentP,
          task: t,
          taskCode: t.taskCodePhu || parentP.code
        });
      } else {
        if (t.projectYear) useAppStore.getState().setGlobalYearFilter(String(t.projectYear));
        if (t.projectStore) useAppStore.getState().setGlobalStoreFilter(t.projectStore);
        useAppStore.getState().setDetailTabFilterCode(t.projectCode);
        useAppStore.getState().setDetailTabFocusTaskId(t.id);
        onTabChange?.(targetTab);
      }
    } else if (item.type === 'assignee') {
      const a = item.data;
      // Filter Detail tab by assignee name
      useAppStore.getState().setGlobalStoreFilter('all');
      useAppStore.getState().setGlobalYearFilter('all');
      useAppStore.getState().setDetailTabFilterCode(a.name);
      onTabChange?.('detail');
    }
  };

  // Keyboard navigation within the dropdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        ensureTasksLoaded();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (visibleItems.length > 0 ? (prev + 1) % visibleItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (visibleItems.length > 0 ? (prev - 1 + visibleItems.length) % visibleItems.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visibleItems.length > 0 && highlightedIndex >= 0 && highlightedIndex < visibleItems.length) {
        executeNavigation(visibleItems[highlightedIndex]);
      }
    } else if (e.key === 'Tab') {
      // Cycle through categories
      e.preventDefault();
      const categories: SearchCategory[] = ['all', 'projects', 'tasks', 'assignees'];
      const currentIndex = categories.indexOf(activeCategory);
      const nextIndex = e.shiftKey
        ? (currentIndex - 1 + categories.length) % categories.length
        : (currentIndex + 1) % categories.length;
      setActiveCategory(categories[nextIndex]);
    }
  };

  // Scroll highlighted item into view smoothly
  useEffect(() => {
    if (!resultsContainerRef.current) return;
    const activeEl = resultsContainerRef.current.querySelector(`[data-search-index="${highlightedIndex}"]`);
    if (activeEl) {
      (activeEl as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const totalResultsCount = matchingProjects.length + matchingTasks.length + matchingAssignees.length;

  return (
    <div ref={containerRef} className={cn("relative w-full max-w-lg min-w-0", className)}>
      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <div className="absolute left-3 pointer-events-none text-slate-400 dark:text-slate-500">
          <Search className="w-4 h-4" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          data-global-search-input="true"
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) {
              ensureTasksLoaded();
              setIsOpen(true);
            }
          }}
          onFocus={() => {
            ensureTasksLoaded();
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t("Search projects, tasks, assignees... (Press /)")}
          className="w-full pl-9 pr-14 py-1.5 sm:py-2 text-xs sm:text-sm bg-slate-50 dark:bg-[#28282a] hover:bg-slate-100/80 dark:hover:bg-[#303034] focus:bg-white dark:focus:bg-[#1e1e20] text-slate-800 dark:text-[#e3e3e3] placeholder-slate-400 dark:placeholder-slate-500 rounded-xl border border-slate-200/90 dark:border-[#444446] focus:border-blue-500 dark:focus:border-blue-400 outline-none transition-all shadow-2xs focus:shadow-md focus:ring-2 focus:ring-blue-400/20"
        />

        {/* Clear or Shortcut Indicator */}
        <div className="absolute right-2.5 flex items-center gap-1">
          {searchTerm ? (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                inputRef.current?.focus();
              }}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-[#333336] border border-slate-300 dark:border-slate-600 rounded-md shadow-2xs select-none">
              /
            </kbd>
          )}
        </div>
      </div>

      {/* Floating Results Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop on mobile for touch clarity */}
          <div 
            className="fixed inset-0 z-40 bg-black/20 sm:hidden backdrop-blur-2xs"
            onClick={() => setIsOpen(false)}
          />

          <div 
            className="absolute top-full left-0 right-0 mt-2 z-50 bg-white dark:bg-[#1e1e20] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#444446] overflow-hidden flex flex-col max-h-[80vh] sm:max-h-[540px] animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Header: Category Filter Tabs */}
            <div className="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-slate-100 dark:border-[#333336] bg-slate-50/70 dark:bg-[#252528] select-none gap-1 shrink-0 overflow-x-auto">
              <div className="flex items-center gap-1 flex-nowrap">
                <button
                  type="button"
                  onClick={() => setActiveCategory('all')}
                  className={cn(
                    "px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 active:scale-95 touch-manipulation cursor-pointer shrink-0",
                    activeCategory === 'all'
                      ? "bg-blue-600 text-white shadow-2xs"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-[#333336]"
                  )}
                >
                  <span>All</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
                    activeCategory === 'all' ? "bg-blue-700 text-white" : "bg-slate-200 dark:bg-[#38383b] text-slate-700 dark:text-slate-300"
                  )}>
                    {totalResultsCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveCategory('projects')}
                  className={cn(
                    "px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 active:scale-95 touch-manipulation cursor-pointer shrink-0",
                    activeCategory === 'projects'
                      ? "bg-blue-600 text-white shadow-2xs"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-[#333336]"
                  )}
                >
                  <FolderKanban className="w-3.5 h-3.5" />
                  <span>Projects</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
                    activeCategory === 'projects' ? "bg-blue-700 text-white" : "bg-slate-200 dark:bg-[#38383b] text-slate-700 dark:text-slate-300"
                  )}>
                    {matchingProjects.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveCategory('tasks')}
                  className={cn(
                    "px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 active:scale-95 touch-manipulation cursor-pointer shrink-0",
                    activeCategory === 'tasks'
                      ? "bg-blue-600 text-white shadow-2xs"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-[#333336]"
                  )}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Tasks</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
                    activeCategory === 'tasks' ? "bg-blue-700 text-white" : "bg-slate-200 dark:bg-[#38383b] text-slate-700 dark:text-slate-300"
                  )}>
                    {matchingTasks.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveCategory('assignees')}
                  className={cn(
                    "px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 active:scale-95 touch-manipulation cursor-pointer shrink-0",
                    activeCategory === 'assignees'
                      ? "bg-blue-600 text-white shadow-2xs"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-[#333336]"
                  )}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Assignees</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
                    activeCategory === 'assignees' ? "bg-blue-700 text-white" : "bg-slate-200 dark:bg-[#38383b] text-slate-700 dark:text-slate-300"
                  )}>
                    {matchingAssignees.length}
                  </span>
                </button>
              </div>

              <div className="hidden sm:flex items-center text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                <kbd className="px-1 py-0.5 rounded bg-slate-200/80 dark:bg-[#38383b]">Tab</kbd>
                <span className="ml-1">to cycle</span>
              </div>
            </div>

            {/* Dropdown Body: Scrollable Results List */}
            <div 
              ref={resultsContainerRef}
              className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-[#2e2e32] p-1.5"
            >
              {visibleItems.length === 0 ? (
                <div className="py-10 text-center text-slate-400 dark:text-slate-500">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-semibold">
                    {searchTerm ? `No matches found for "${searchTerm}"` : 'Type to search across projects, tasks and assignees'}
                  </p>
                  <p className="text-xs mt-1 text-slate-400">
                    Try searching by Project code (e.g. L1-01), Task name, or Assignee (e.g. Con1, CP)
                  </p>
                </div>
              ) : (
                visibleItems.map((item, index) => {
                  const isHighlighted = highlightedIndex === index;

                  // Render Project Item
                  if (item.type === 'project') {
                    const p = item.data;
                    const isHcm = (p.store || '').toUpperCase() === 'HCM';

                    return (
                      <div
                        key={item.key}
                        data-search-index={index}
                        onClick={() => executeNavigation(item, 'detail')}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className={cn(
                          "group p-2.5 rounded-xl transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2",
                          isHighlighted 
                            ? "bg-blue-50 dark:bg-[#282830] ring-1 ring-blue-400/40" 
                            : "hover:bg-slate-50 dark:hover:bg-[#242427]"
                        )}
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <div className="p-2 rounded-lg bg-blue-100/70 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                            <FolderKanban className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {/* Store Tag */}
                              <span className={cn(
                                "text-[10px] font-extrabold px-1.5 py-0.5 rounded leading-none uppercase",
                                isHcm 
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-[#8ab4f8]" 
                                  : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                              )}>
                                {p.store || 'ALL'}
                              </span>

                              {/* Year */}
                              {p.year && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#333336] text-slate-600 dark:text-slate-300 leading-none">
                                  {p.year}
                                </span>
                              )}

                              {/* Project Code */}
                              <span className="font-mono font-extrabold text-xs sm:text-sm text-blue-700 dark:text-[#8ab4f8]">
                                <HighlightMatch text={p.code} query={deferredSearch} />
                              </span>

                              {/* Status Badge */}
                              {p.computedStatus && (
                                <span className={cn(
                                  "text-[10px] font-bold px-1.5 py-0.5 rounded leading-none",
                                  p.computedStatus === 'Completed' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" :
                                  p.computedStatus === 'Delayed' ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" :
                                  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                )}>
                                  {p.computedStatus}
                                </span>
                              )}
                            </div>

                            {/* Project Name */}
                            <div className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-[#e3e3e3] truncate mt-1">
                              <HighlightMatch text={p.name} query={deferredSearch} />
                            </div>

                            {/* Progress & Party Info */}
                            <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex-wrap">
                              {p.computedPlanProgress !== undefined && (
                                <span className="flex items-center gap-1 font-mono">
                                  <span className="text-slate-400">PLAN:</span>
                                  <span className="font-bold text-blue-600 dark:text-blue-400">{p.computedPlanProgress}%</span>
                                </span>
                              )}
                              {p.computedActProgress !== undefined && (
                                <span className="flex items-center gap-1 font-mono">
                                  <span className="text-slate-400">ACT:</span>
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{p.computedActProgress}%</span>
                                </span>
                              )}
                              {p.party && (
                                <span className="text-purple-600 dark:text-purple-400 font-medium">
                                  Party: <HighlightMatch text={p.party} query={deferredSearch} />
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Quick Navigation Action Buttons */}
                        <div className="flex items-center gap-1 shrink-0 self-end sm:self-center pt-1 sm:pt-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              executeNavigation(item, 'detail');
                            }}
                            className="px-2 py-1 text-[11px] font-bold rounded-lg border border-blue-200 dark:border-blue-900 bg-white dark:bg-[#1e1e20] text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white transition-all shadow-2xs active:scale-95"
                            title="Jump to Detail Tab"
                          >
                            Detail
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              executeNavigation(item, 'gantt');
                            }}
                            className="px-2 py-1 text-[11px] font-bold rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-[#1e1e20] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white dark:hover:bg-emerald-600 dark:hover:text-white transition-all shadow-2xs active:scale-95"
                            title="Jump to Gantt Tab"
                          >
                            Gantt
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQuickNavTarget({ project: p });
                              setIsOpen(false);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            title="Open 5-Tab Quick Navigation"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  }

                  // Render Task Item
                  if (item.type === 'task') {
                    const t = item.data;
                    const parentP = item.parentProject;

                    return (
                      <div
                        key={item.key}
                        data-search-index={index}
                        onClick={() => executeNavigation(item, 'detail')}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className={cn(
                          "group p-2.5 rounded-xl transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2",
                          isHighlighted 
                            ? "bg-blue-50 dark:bg-[#282830] ring-1 ring-blue-400/40" 
                            : "hover:bg-slate-50 dark:hover:bg-[#242427]"
                        )}
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <div className="p-2 rounded-lg bg-emerald-100/70 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                            <CheckSquare className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {/* Subtask Code */}
                              <span className="font-mono font-bold text-xs px-1.5 py-0.5 rounded bg-amber-100/80 dark:bg-amber-950 text-amber-900 dark:text-amber-300 leading-none">
                                <HighlightMatch text={t.taskCodePhu || 'Task'} query={deferredSearch} />
                              </span>

                              {/* Parent Project Code & Name */}
                              <span className="font-mono text-xs text-slate-500 dark:text-slate-400 font-semibold truncate max-w-[200px]">
                                {t.projectCode} {parentP?.name ? `(${parentP.name})` : ''}
                              </span>

                              {/* Party / Assignee */}
                              {t.party && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-purple-400/60 dark:border-purple-600 bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 leading-none">
                                  <HighlightMatch text={t.party} query={deferredSearch} />
                                </span>
                              )}
                            </div>

                            {/* Task Name */}
                            <div className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-[#e3e3e3] truncate mt-1">
                              <HighlightMatch text={t.name} query={deferredSearch} />
                            </div>

                            {/* Timeline Dates */}
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
                              <span className="text-blue-600 dark:text-blue-400 font-medium">
                                {formatDisplayDateMain(t.start)}
                              </span>
                              <span>→</span>
                              <span className="text-pink-600 dark:text-pink-400 font-medium">
                                {formatDisplayDateMain(t.finish)}
                              </span>
                              {t.duration && (
                                <span className="text-slate-400">({t.duration})</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Quick Jump Buttons */}
                        <div className="flex items-center gap-1 shrink-0 self-end sm:self-center pt-1 sm:pt-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              executeNavigation(item, 'detail');
                            }}
                            className="px-2 py-1 text-[11px] font-bold rounded-lg border border-blue-200 dark:border-blue-900 bg-white dark:bg-[#1e1e20] text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white transition-all shadow-2xs active:scale-95"
                            title="Focus in Detail Tab"
                          >
                            Detail
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              executeNavigation(item, 'gantt');
                            }}
                            className="px-2 py-1 text-[11px] font-bold rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-[#1e1e20] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white dark:hover:bg-emerald-600 dark:hover:text-white transition-all shadow-2xs active:scale-95"
                            title="Focus in Gantt Tab"
                          >
                            Gantt
                          </button>
                        </div>
                      </div>
                    );
                  }

                  // Render Assignee Item
                  if (item.type === 'assignee') {
                    const a = item.data;

                    return (
                      <div
                        key={item.key}
                        data-search-index={index}
                        onClick={() => executeNavigation(item, 'detail')}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className={cn(
                          "group p-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-2",
                          isHighlighted 
                            ? "bg-blue-50 dark:bg-[#282830] ring-1 ring-blue-400/40" 
                            : "hover:bg-slate-50 dark:hover:bg-[#242427]"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="p-2 rounded-lg bg-purple-100/70 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 shrink-0">
                            <User className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-[#e3e3e3] truncate">
                              <HighlightMatch text={a.name} query={deferredSearch} />
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              <span>{a.taskCount} tasks assigned</span>
                              <span>•</span>
                              <span>{a.projectCount || a.projectCodes.length} projects</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:underline flex items-center gap-1">
                            <span>Filter tasks</span>
                            <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    );
                  }

                  return null;
                })
              )}
            </div>

            {/* Footer: Keyboard Hints */}
            <div className="px-3 py-2 border-t border-slate-100 dark:border-[#333336] bg-slate-50/90 dark:bg-[#222225] flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 select-none shrink-0">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-slate-200/80 dark:bg-[#38383b] font-mono">↑↓</kbd>
                  <span>to navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-slate-200/80 dark:bg-[#38383b] font-mono">↵</kbd>
                  <span>to select</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-slate-200/80 dark:bg-[#38383b] font-mono">esc</kbd>
                  <span>to close</span>
                </span>
              </div>

              <div className="text-[10px] font-mono text-slate-400">
                {totalResultsCount} results
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
