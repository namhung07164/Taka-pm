import React, { useEffect, useState } from 'react';
import { safeGetItemLocal, safeSetItemLocal, safeRemoveItemLocal, safeGetItemSession, safeSetItemSession, safeRemoveItemSession } from "../lib/storage";
import { AppUser } from '../types';
import { getDefaultStoreFilter } from '../lib/utils';

export function useTaskFilters(currentUser: AppUser) {
  const [searchTerm, setSearchTerm] = useState(() => {
    return safeGetItemSession("taka_detail_search") || "";
  });
  useEffect(() => {
    const timer = setTimeout(() => {
      safeSetItemSession("taka_detail_search", searchTerm);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const [yearFilter, setYearFilter] = useState(() => {
    return safeGetItemSession("taka_detail_year") || "all";
  });
  useEffect(() => {
    safeSetItemSession("taka_detail_year", yearFilter);
  }, [yearFilter]);

  const [storeFilter, setStoreFilter] = useState(() =>
    getDefaultStoreFilter(currentUser),
  );
  useEffect(() => {
    safeSetItemLocal(`taka_store_filter_${currentUser.id}`, storeFilter);
  }, [storeFilter, currentUser.id]);

  const [locationFilter, setLocationFilter] = useState<string[]>(() => {
    try {
      const stored = safeGetItemSession("taka_detail_location");
      if (!stored || stored === "all") return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    safeSetItemSession("taka_detail_location", JSON.stringify(locationFilter));
  }, [locationFilter]);

  const [statusFilter, setStatusFilter] = useState(() => {
    return safeGetItemSession("taka_detail_status") || "all";
  });
  useEffect(() => {
    safeSetItemSession("taka_detail_status", statusFilter);
  }, [statusFilter]);

  const [actStatusFilter, setActStatusFilter] = useState(() => {
    return safeGetItemSession("taka_detail_act_status") || "all";
  });
  useEffect(() => {
    safeSetItemSession("taka_detail_act_status", actStatusFilter);
  }, [actStatusFilter]);

  return {
    searchTerm, setSearchTerm,
    yearFilter, setYearFilter,
    storeFilter, setStoreFilter,
    locationFilter, setLocationFilter,
    statusFilter, setStatusFilter,
    actStatusFilter, setActStatusFilter
  };
}
