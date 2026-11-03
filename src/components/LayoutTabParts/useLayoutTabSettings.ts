import React, { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { setDoc } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { usePerformanceStore } from '../../store/usePerformanceStore';
import { executeTriggerExportProcess } from '../PictureMapping/lib/dynamicExportService';
import { isValidUrl } from './layoutTabSearchUtils';

interface UseLayoutTabSettingsProps {
  activeStore: string;
  locFilterStr: string;
  canWrite?: boolean;
}

const LAYOUT_SETTINGS_CACHE_KEY = 'taka_cache_layout_settings_v1';
const LAYOUT_EXPORT_TS_KEY = 'taka_layout_export_ts_v1';

// Module-level singleton listener pool to prevent re-reading taka_settings on every tab switch
let sharedLayoutSettingsData: Record<string, any> | null = null;
let sharedLayoutTriggerData: Record<string, any> | null = null;
let sharedUnsubLayout: (() => void) | null = null;
let sharedUnsubTrigger: (() => void) | null = null;
const layoutSettingsSubscribers = new Set<(data: Record<string, any>) => void>();
const layoutTriggerSubscribers = new Set<(data: Record<string, any>) => void>();

function ensureSharedLayoutListeners() {
  if (!sharedUnsubLayout) {
    usePerformanceStore.getState().registerListener('taka_settings/layout');
    sharedUnsubLayout = onSnapshot(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_settings', 'layout'), (docSnap) => {
      usePerformanceStore.getState().trackSnapshot('taka_settings/layout', docSnap);
      if (docSnap.exists()) {
        const data = docSnap.data();
        sharedLayoutSettingsData = data;
        try {
          localStorage.setItem(LAYOUT_SETTINGS_CACHE_KEY, JSON.stringify(data));
        } catch {}
        layoutSettingsSubscribers.forEach((cb) => cb(data));
      }
    }, (error) => {
      console.error('Error listening to layout settings', error);
    });
  }
  if (!sharedUnsubTrigger) {
    usePerformanceStore.getState().registerListener('taka_settings/layout_trigger');
    sharedUnsubTrigger = onSnapshot(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_settings', 'layout_trigger'), (docSnap) => {
      usePerformanceStore.getState().trackSnapshot('taka_settings/layout_trigger', docSnap);
      if (docSnap.exists()) {
        const data = docSnap.data();
        sharedLayoutTriggerData = data;
        layoutTriggerSubscribers.forEach((cb) => cb(data));
      }
    }, (error) => {
      console.error('Error listening to layout_trigger', error);
    });
  }
}

export function useLayoutTabSettings({ activeStore, locFilterStr, canWrite = false }: UseLayoutTabSettingsProps) {
  const [layoutSettings, setLayoutSettings] = useState<Record<string, any>>(() => {
    if (sharedLayoutSettingsData) return sharedLayoutSettingsData;
    try {
      const raw = localStorage.getItem(LAYOUT_SETTINGS_CACHE_KEY);
      if (raw) return JSON.parse(raw) || {};
    } catch {}
    return {};
  });
  const [url, setUrl] = useState<string>('https://drive.google.com/file/d/1hxzPKKhQWhQ-tAThmgan8eNqqy5GN-Ds/preview');
  const [isEditing, setIsEditing] = useState(false);
  const [editUrl, setEditUrl] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatusMessage, setExportStatusMessage] = useState<string>('');
  const [cacheBuster, setCacheBuster] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(LAYOUT_EXPORT_TS_KEY));
      if (saved > 0) return saved;
    } catch {}
    return 1;
  });

  const docKey = `url_${activeStore}_${locFilterStr}`;

  // Reuse warm singleton listener for layout settings & triggers across tab switches (0 extra reads)
  useEffect(() => {
    ensureSharedLayoutListeners();
    if (sharedLayoutSettingsData) {
      setLayoutSettings(sharedLayoutSettingsData);
    }
    const handleTriggerUpdate = (data: Record<string, any>) => {
      if (data.is_ready_to_export === false) {
        setIsExporting(false);
        if (data.export_completed_at) {
          setCacheBuster(data.export_completed_at);
          try {
            localStorage.setItem(LAYOUT_EXPORT_TS_KEY, String(data.export_completed_at));
          } catch {}
        }
      } else if (data.is_ready_to_export === true) {
        if (data.requested_at && Date.now() - data.requested_at < 15000) {
          setIsExporting(true);
        } else {
          setIsExporting(false);
        }
      }
    };
    if (sharedLayoutTriggerData) {
      handleTriggerUpdate(sharedLayoutTriggerData);
    }
    layoutSettingsSubscribers.add(setLayoutSettings);
    layoutTriggerSubscribers.add(handleTriggerUpdate);

    return () => {
      layoutSettingsSubscribers.delete(setLayoutSettings);
      layoutTriggerSubscribers.delete(handleTriggerUpdate);
    };
  }, []);

  // Synchronize URL when docKey, layoutSettings, or activeStore changes
  useEffect(() => {
    if (layoutSettings[docKey] && isValidUrl(layoutSettings[docKey])) {
      setUrl(layoutSettings[docKey]);
    } else if (layoutSettings[`url_${activeStore}`] && isValidUrl(layoutSettings[`url_${activeStore}`])) {
      setUrl(layoutSettings[`url_${activeStore}`]);
    } else {
      setUrl('');
    }
  }, [docKey, layoutSettings, activeStore]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (isExporting) {
      timeoutId = setTimeout(() => {
        setIsExporting(false);
        setExportStatusMessage('');
      }, 30000);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isExporting]);

  const handleSave = async () => {
    if (!canWrite) return;
    try {
      const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_settings', 'layout');
      const updates: Record<string, any> = { [docKey]: editUrl };
      setDoc(docRef, updates, { merge: true });
      setUrl(editUrl);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving layout URL', error);
    }
  };

  const handleTriggerReExport = async () => {
    if (!canWrite || isExporting) return;
    try {
      setIsExporting(true);
      setExportStatusMessage('Bước 1/4: Đang tải dữ liệu từ Cloudflare R2...');
      const targetStore = (activeStore === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
      
      const res = await executeTriggerExportProcess(targetStore, (status) => {
        setExportStatusMessage(status);
      });

      setCacheBuster(Date.now());
      setIsExporting(false);
      setExportStatusMessage('');
      alert(`✅ ${res.message}`);
    } catch (error: any) {
      console.error('Error triggering layout export', error);
      setIsExporting(false);
      setExportStatusMessage('');
      alert(`⚠️ Lỗi khi Trigger Export:\n${error?.message || error}`);
    }
  };

  const getCleanUrl = useCallback((inputUrl: string | undefined | null) => {
    if (!inputUrl) return undefined;
    let cleanUrl = inputUrl;
    if (cleanUrl.includes('/view')) {
      cleanUrl = cleanUrl.replace('/view', '/preview');
    }
    if (cleanUrl) {
      const separator = cleanUrl.includes('?') ? '&' : '?';
      return `${cleanUrl}${separator}t=${cacheBuster}`;
    }
    return undefined;
  }, [cacheBuster]);

  const fallbackSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';

  return {
    url,
    isEditing,
    setIsEditing,
    editUrl,
    setEditUrl,
    handleSave,
    isExporting,
    exportStatusMessage,
    handleTriggerReExport,
    getCleanUrl,
    fallbackSvg,
    cacheBuster,
    setCacheBuster,
  };
}
