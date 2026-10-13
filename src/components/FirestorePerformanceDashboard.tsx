import React, { useEffect, useMemo, useState } from 'react';
import { usePerformanceStore } from '../store/usePerformanceStore';
import { matchesAdvancedSearch } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import { GlobalFleetMonitorView } from './GlobalFleetMonitorView';
import { FirestorePerformanceDashboardProps, CollectionStatItem } from './PerformanceDashboardParts/performanceTypes';
import { PerformanceHeader } from './PerformanceDashboardParts/PerformanceHeader';
import { PerformanceMetricsCards } from './PerformanceDashboardParts/PerformanceMetricsCards';
import { PerformanceCollectionTable } from './PerformanceDashboardParts/PerformanceCollectionTable';
import { PerformanceEventLogs } from './PerformanceDashboardParts/PerformanceEventLogs';

export function FirestorePerformanceDashboard({
  onClose,
}: FirestorePerformanceDashboardProps = {}) {
  const [activeViewMode, setActiveViewMode] = useState<'session' | 'fleet'>('session');
  const serverReads = usePerformanceStore((state) => state.serverReads);
  const cacheReads = usePerformanceStore((state) => state.cacheReads);
  const activeListeners = usePerformanceStore((state) => state.activeListeners);
  const sessionStartTime = usePerformanceStore((state) => state.sessionStartTime);
  const collectionStats = usePerformanceStore((state) => state.collectionStats);
  const events = usePerformanceStore((state) => state.events);
  const resetStats = usePerformanceStore((state) => state.resetStats);

  const setToast = useAppStore((state) => state.setToast);
  const currentUser = useAppStore((state) => state.currentUser);

  const deviceInfo = useMemo(() => {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    if (ua.indexOf('Firefox') > -1) browser = 'Firefox';
    else if (ua.indexOf('SamsungBrowser') > -1) browser = 'Samsung Browser';
    else if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) browser = 'Opera';
    else if (ua.indexOf('Edge') > -1 || ua.indexOf('Edg') > -1) browser = 'Edge';
    else if (ua.indexOf('Chrome') > -1) browser = 'Chrome';
    else if (ua.indexOf('Safari') > -1) browser = 'Safari';

    let os = 'Unknown OS';
    if (ua.indexOf('Win') > -1) os = 'Windows';
    else if (ua.indexOf('Mac') > -1) os = 'MacOS';
    else if (ua.indexOf('Linux') > -1) os = 'Linux';
    else if (ua.indexOf('Android') > -1) os = 'Android';
    else if (ua.indexOf('like Mac') > -1) os = 'iOS';

    return `${browser} on ${os}`;
  }, []);

  const [filterType, setFilterType] = useState<'all' | 'server' | 'cache'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sessionDuration, setSessionDuration] = useState('0m 0s');
  const [copied, setCopied] = useState(false);

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
    totalOps > 0 ? ((cacheReads / totalOps) * 100).toFixed(1) : '100.0';

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (filterType === 'server' && ev.fromCache) return false;
      if (filterType === 'cache' && !ev.fromCache) return false;
      if (
        searchTerm &&
        !matchesAdvancedSearch(searchTerm, [ev.collection, ev.type, ev.details, ev.id])
      ) {
        return false;
      }
      return true;
    });
  }, [events, filterType, searchTerm]);

  // Query health assessment
  const collectionsArray: CollectionStatItem[] = useMemo(() => {
    return Object.entries(collectionStats).map(([name, stat]) => ({
      name,
      ...stat,
      efficiency:
        stat.serverReads + stat.cacheReads > 0
          ? ((stat.cacheReads / (stat.serverReads + stat.cacheReads)) * 100).toFixed(1)
          : '100.0',
    }));
  }, [collectionStats]);

  const heavyCollections = useMemo(
    () => collectionsArray.filter((c) => c.serverReads > 500),
    [collectionsArray]
  );

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
  .join('\n')}
=============================================`;

    navigator.clipboard.writeText(report);
    setCopied(true);
    setToast({
      title: 'Copied!',
      message: 'Firestore session report copied to clipboard.',
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
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `firestore-performance-${new Date().toISOString().substring(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      id="firestore-performance-dashboard"
      className="flex flex-col gap-5 p-5 bg-slate-50/50 dark:bg-[#18181b]/50 border-t border-slate-200 dark:border-[#3f3f46]"
    >
      <PerformanceHeader
        activeViewMode={activeViewMode}
        setActiveViewMode={setActiveViewMode}
        copied={copied}
        onCopySummary={handleCopySummary}
        onExportJson={handleExportJson}
        onResetStats={resetStats}
        onClose={onClose}
      />

      {activeViewMode === 'fleet' ? (
        <GlobalFleetMonitorView />
      ) : (
        <>
          <PerformanceMetricsCards
            serverReads={serverReads}
            cacheReads={cacheReads}
            cacheEfficiency={cacheEfficiency}
            activeListeners={activeListeners}
            sessionDuration={sessionDuration}
            heavyCollections={heavyCollections}
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <PerformanceCollectionTable collectionsArray={collectionsArray} />
            <PerformanceEventLogs
              currentUserInfo={currentUser?.username || currentUser?.id || 'Anonymous'}
              deviceInfo={deviceInfo}
              filterType={filterType}
              setFilterType={setFilterType}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              filteredEvents={filteredEvents}
              totalEventCount={events.length}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default FirestorePerformanceDashboard;
