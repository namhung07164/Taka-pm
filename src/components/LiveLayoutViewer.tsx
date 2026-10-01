import React from 'react';
import Konva from 'konva';
import { RefreshCw, Layers, Settings } from 'lucide-react';

import { LiveLayoutViewerProps } from './LiveLayoutParts/liveLayoutTypes';
import { useLiveLayoutR2Config } from './LiveLayoutParts/useLiveLayoutR2Config';
import { LiveLayoutR2Modal } from './LiveLayoutParts/LiveLayoutR2Modal';
import { LiveLayoutMainView } from './LiveLayoutParts/LiveLayoutMainView';

// Performance tuning for older iOS WebKit & high-fps dragging
Konva.hitOnDragEnabled = false;
Konva.dragDistance = 3;
Konva.dragButtons = [0];

export function LiveLayoutViewer({
  storeFilter,
  locationFilter,
  yearFilter,
  targetUnitSearch,
  onUnitSelected,
  onClearFocus,
}: LiveLayoutViewerProps) {
  const {
    config,
    loading,
    error,
    showConfigModal,
    setShowConfigModal,
    cfgAccountId,
    setCfgAccountId,
    cfgBucketName,
    setCfgBucketName,
    cfgAccessKey,
    setCfgAccessKey,
    cfgSecretKey,
    setCfgSecretKey,
    initFormFromStorage,
    loadConfig,
    handleSaveR2Config,
  } = useLiveLayoutR2Config();

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mb-2" />
        <p className="text-sm font-medium">Đang tải cấu hình Bản đồ Chuyên đề (Thematic Map)...</p>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-amber-600 dark:text-amber-400 p-4">
        <Layers className="w-10 h-10 mb-2 opacity-50" />
        <p className="text-sm font-medium px-4 text-center max-w-md">{error}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={() => {
              initFormFromStorage();
              setShowConfigModal(true);
            }}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Settings className="w-4 h-4" />
            Cấu hình R2 Cloudflare
          </button>
          <button
            onClick={loadConfig}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Thử lại
          </button>
        </div>

        <LiveLayoutR2Modal
          isOpen={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          cfgAccountId={cfgAccountId}
          setCfgAccountId={setCfgAccountId}
          cfgBucketName={cfgBucketName}
          setCfgBucketName={setCfgBucketName}
          cfgAccessKey={cfgAccessKey}
          setCfgAccessKey={setCfgAccessKey}
          cfgSecretKey={cfgSecretKey}
          setCfgSecretKey={setCfgSecretKey}
          onSave={handleSaveR2Config}
        />
      </div>
    );
  }

  return (
    <LiveLayoutMainView
      config={config}
      storeFilter={storeFilter}
      locationFilter={locationFilter}
      yearFilter={yearFilter}
      targetUnitSearch={targetUnitSearch}
      onUnitSelected={onUnitSelected}
      onClearFocus={onClearFocus}
      onRefreshConfig={loadConfig}
    />
  );
}
