import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Cost } from '../../types';
import { parseDateTime } from '../../lib/utils';
import { PaidDateMatches } from './costTypes';

export function useCostDateFilter() {
  const [isPaidDateFilterOpen, setIsPaidDateFilterOpen] = useState<boolean>(false);
  const [paidDateStart, setPaidDateStart] = useState<string>('');
  const [paidDateEnd, setPaidDateEnd] = useState<string>('');
  const [paidStageFilter, setPaidStageFilter] = useState<'all' | '1st' | '2nd' | '3rd'>('all');

  const [tempDateStart, setTempDateStart] = useState<string>('');
  const [tempDateEnd, setTempDateEnd] = useState<string>('');
  const debounceTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const commitDateFilter = (newStart?: string, newEnd?: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const s = newStart !== undefined ? newStart : tempDateStart;
    const e = newEnd !== undefined ? newEnd : tempDateEnd;
    setPaidDateStart(s);
    setPaidDateEnd(e);
  };

  const scheduleDebouncedDateCommit = (newStart: string, newEnd: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setPaidDateStart(newStart);
      setPaidDateEnd(newEnd);
    }, 500);
  };

  const handleTempStartChange = (val: string) => {
    setTempDateStart(val);
    scheduleDebouncedDateCommit(val, tempDateEnd);
  };

  const handleTempEndChange = (val: string) => {
    setTempDateEnd(val);
    scheduleDebouncedDateCommit(tempDateStart, val);
  };

  const handleClearPaidDateFilter = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setTempDateStart('');
    setTempDateEnd('');
    setPaidDateStart('');
    setPaidDateEnd('');
    setPaidStageFilter('all');
  };

  const checkDateInRange = (dateVal: string | undefined, start: string, end: string): boolean => {
    if (!dateVal) return false;
    const s = String(dateVal).trim();
    if (!s) return false;
    let isoDate = s.substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      const parsed = parseDateTime(s);
      if (!parsed || isNaN(parsed.getTime())) return false;
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      isoDate = `${y}-${m}-${d}`;
    }
    if (start && isoDate < start) return false;
    if (end && isoDate > end) return false;
    return true;
  };

  const getCostPaidMatches = useCallback(
    (c: Cost, start: string, end: string, stage: 'all' | '1st' | '2nd' | '3rd'): PaidDateMatches => {
      if (!start && !end) {
        return { matches: true, firstMatch: false, secondMatch: false, thirdMatch: false };
      }
      const firstMatch = checkDateInRange(c.firstPaidAt, start, end);
      const secondMatch = checkDateInRange(c.secondPaidAt, start, end);
      const thirdMatch = checkDateInRange(c.thirdPaidAt, start, end);

      let matches = false;
      if (stage === '1st') matches = firstMatch;
      else if (stage === '2nd') matches = secondMatch;
      else if (stage === '3rd') matches = thirdMatch;
      else matches = firstMatch || secondMatch || thirdMatch;

      return { matches, firstMatch, secondMatch, thirdMatch };
    },
    []
  );

  return {
    isPaidDateFilterOpen,
    setIsPaidDateFilterOpen,
    paidDateStart,
    paidDateEnd,
    paidStageFilter,
    setPaidStageFilter,
    tempDateStart,
    tempDateEnd,
    handleTempStartChange,
    handleTempEndChange,
    commitDateFilter,
    handleClearPaidDateFilter,
    getCostPaidMatches,
  };
}
