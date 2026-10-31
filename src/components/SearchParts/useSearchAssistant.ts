import { useState, useMemo, useCallback, RefObject } from 'react';
import {
  getRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
  stripSearchAccents,
} from '../../lib/utils';

interface UseSearchAssistantProps {
  inputRef: RefObject<HTMLInputElement | null>;
  isAssistantEnabled: boolean;
  commitValueImmediately: (val: string, recordHistory?: boolean) => void;
  scheduleDebounce: (val: string) => void;
  onHasValueChange: (hasVal: boolean) => void;
}

export function useSearchAssistant({
  inputRef,
  isAssistantEnabled,
  commitValueImmediately,
  scheduleDebounce,
  onHasValueChange,
}: UseSearchAssistantProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [showSyntaxTips, setShowSyntaxTips] = useState(false);
  const [filterTextForHistory, setFilterTextForHistory] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => getRecentSearches());
  const [activeRecentIdx, setActiveRecentIdx] = useState<number>(-1);

  const matchingRecentSearches = useMemo(() => {
    const q = stripSearchAccents(filterTextForHistory);
    if (!q) return recentSearches.slice(0, 5);
    return recentSearches
      .filter((item) => {
        const normItem = stripSearchAccents(item);
        return normItem.includes(q) && normItem !== q;
      })
      .slice(0, 5);
  }, [recentSearches, filterTextForHistory]);

  const handleSelectRecent = useCallback(
    (query: string) => {
      commitValueImmediately(query, true);
      setIsPopoverOpen(false);
      setActiveRecentIdx(-1);
    },
    [commitValueImmediately]
  );

  const handleRemoveRecent = useCallback((query: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRecentSearches(removeRecentSearch(query));
  }, []);

  const handleClearAllRecent = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRecentSearches(clearRecentSearches());
  }, []);

  const handleInsertOperator = useCallback(
    (operatorType: 'and' | 'or' | 'exact' | 'exclude') => {
      const el = inputRef.current;
      if (!el) return;
      const cur = el.value;
      let next = cur;

      if (operatorType === 'and') {
        next = cur.trim() ? `${cur.trimEnd()} + ` : '';
      } else if (operatorType === 'or') {
        next = cur.trim() ? `${cur.trimEnd()}, ` : '';
      } else if (operatorType === 'exclude') {
        next = cur.trim() ? `${cur.trimEnd()} -` : '-';
      } else if (operatorType === 'exact') {
        const trimmed = cur.trim();
        if (trimmed && !trimmed.startsWith('"')) {
          next = `"${trimmed}"`;
        } else {
          next = cur ? `${cur} ""` : '""';
        }
      }

      el.value = next;
      const nextHas = next.length > 0;
      onHasValueChange(nextHas);
      setFilterTextForHistory(next);
      el.focus();
      if (operatorType === 'exact' && next.endsWith('""')) {
        const pos = next.length - 1;
        el.setSelectionRange(pos, pos);
      } else {
        el.setSelectionRange(next.length, next.length);
      }
      scheduleDebounce(next);
    },
    [inputRef, onHasValueChange, scheduleDebounce]
  );

  const handleAssistantKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): boolean => {
      if (!isAssistantEnabled || !isPopoverOpen) return false;

      if (matchingRecentSearches.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveRecentIdx((prev) =>
            prev < matchingRecentSearches.length - 1 ? prev + 1 : 0
          );
          return true;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveRecentIdx((prev) =>
            prev > 0 ? prev - 1 : matchingRecentSearches.length - 1
          );
          return true;
        }
      }

      if (e.key === 'Enter' && activeRecentIdx >= 0 && activeRecentIdx < matchingRecentSearches.length) {
        e.preventDefault();
        const chosen = matchingRecentSearches[activeRecentIdx];
        commitValueImmediately(chosen, true);
        setIsPopoverOpen(false);
        setActiveRecentIdx(-1);
        return true;
      }

      return false;
    },
    [isAssistantEnabled, isPopoverOpen, matchingRecentSearches, activeRecentIdx, commitValueImmediately]
  );

  const openAssistantOnFocus = useCallback((currentVal: string) => {
    if (isAssistantEnabled) {
      setRecentSearches(getRecentSearches());
      setFilterTextForHistory(currentVal);
      setIsPopoverOpen(true);
      setActiveRecentIdx(-1);
    }
  }, [isAssistantEnabled]);

  const closeAssistantOnBlur = useCallback((currentVal: string) => {
    setIsPopoverOpen(false);
    setShowSyntaxTips(false);
    setActiveRecentIdx(-1);
    if (isAssistantEnabled && currentVal.trim().length >= 2) {
      setRecentSearches(addRecentSearch(currentVal.trim()));
    }
  }, [isAssistantEnabled]);

  return {
    isPopoverOpen,
    setIsPopoverOpen,
    showSyntaxTips,
    setShowSyntaxTips,
    setFilterTextForHistory,
    matchingRecentSearches,
    activeRecentIdx,
    setActiveRecentIdx,
    handleSelectRecent,
    handleRemoveRecent,
    handleClearAllRecent,
    handleInsertOperator,
    handleAssistantKeyDown,
    openAssistantOnFocus,
    closeAssistantOnBlur,
  };
}
