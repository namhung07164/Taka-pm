import React, { Suspense, useState } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { RefreshCw, Smartphone, Monitor, Bell, Activity, Database, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../lib/utils";
import { doc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from "../lib/firebase";
import { requestNotificationPermission } from "../lib/notifications";
import { useAppStore } from "../store/useAppStore";
import { bumpConfigVersion } from "../lib/configCacheService";
import { lazyWithRetry } from "../lib/lazyWithRetry";
import { FirestorePerformanceDashboard } from "./FirestorePerformanceDashboard";
import { SettingNotificationRules } from "./SettingTabParts/SettingNotificationRules";
import { SettingDataMaintenance } from "./SettingTabParts/SettingDataMaintenance";
import { SettingTabProps, ConfirmModalState } from "./SettingTabParts/settingTypes";

const ConfirmModal = lazyWithRetry(() => import('./ConfirmModal').then(m => ({ default: m.ConfirmModal })), 'ConfirmModal');
const DesktopOptimizationModal = lazyWithRetry(() => import('./DesktopOptimizationModal').then(m => ({ default: m.DesktopOptimizationModal })), 'DesktopOptimizationModal');

export function SettingTab({ rules }: SettingTabProps) {
  const currentUser = useAppStore(state => state.currentUser)!;
  const { t } = useLanguage();
  
  const [showPerformanceDashboard, setShowPerformanceDashboard] = useState(false);
  const [showDataMaintenance, setShowDataMaintenance] = useState(false);
  const [showDesktopOptModal, setShowDesktopOptModal] = useState(false);

  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const canWrite = currentUser.role === 'admin' || currentUser.canWrite;
  const isAdmin = currentUser.role === 'admin';

  const jpyRate = useAppStore(state => state.jpyRate);
  const usdRate = useAppStore(state => state.usdRate);
  const [jpyRateInput, setJpyRateInput] = useState(jpyRate.toString());
  const [usdRateInput, setUsdRateInput] = useState(usdRate.toString());

  const handleSaveExchangeRates = async () => {
    const parsedJpy = parseFloat(jpyRateInput);
    const parsedUsd = parseFloat(usdRateInput);
    
    if (isNaN(parsedJpy) || isNaN(parsedUsd)) {
      useAppStore.getState().setToast({ title: "Notice", message: "Please enter valid numbers for exchange rates." });
      return;
    }
    
    useAppStore.getState().setJpyRate(parsedJpy);
    useAppStore.getState().setUsdRate(parsedUsd);
    
    try {
      await setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_settings", "exchange_rates"), { 
        jpyRate: parsedJpy,
        usdRate: parsedUsd
      }, { merge: true });
      bumpConfigVersion('rates');
      useAppStore.getState().setToast({ title: "Notice", message: "Exchange rates updated successfully." });
    } catch (error) { 
      console.error(error); 
      useAppStore.getState().setToast({ title: "Notice", message: "Failed to update exchange rates." });
    }
  };

  const handleEnablePush = async () => {
    if (currentUser.id === "guest") {
      useAppStore.getState().setToast({ title: "Notice", message: "Please login first to enable push notifications." });
      return;
    }
    if (currentUser.notification === false) {
      useAppStore.getState().setToast({ title: "Notice", message: "Push notifications are disabled for your account by the administrator." });
      return;
    }
    await requestNotificationPermission(currentUser.id);
  };

  const triggerConfirmAction = (title: string, message: string, onConfirm: () => Promise<void>) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: async () => {
        await onConfirm();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm overflow-hidden overflow-y-auto">
      <Suspense fallback={null}>
        {confirmModal.isOpen && (
          <ConfirmModal 
            isOpen={confirmModal.isOpen}
            title={confirmModal.title}
            message={confirmModal.message}
            onConfirm={confirmModal.onConfirm}
            onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
          />
        )}
      </Suspense>

      <div className="px-5 py-4 border-b border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 shrink-0">
        <h2 className="text-lg font-bold text-slate-800 dark:text-[#e3e3e3]">{t("Settings")}</h2>
      </div>
      
      <div className="p-5 flex flex-col md:flex-row gap-4 border-b border-slate-200 dark:border-[#444446] bg-white dark:bg-[#1e1e20] items-center">
        {currentUser.role !== 'guest' && (
          <>
            <button 
              title="Refresh"
              onClick={() => {
                if (window.confirm("Do you want to refresh the app to update to the latest version?")) {
                  window.location.reload();
                }
              }}
              className="px-5 py-3 rounded-lg border border-slate-200 dark:border-[#444446] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 transition-colors flex items-center gap-3 font-medium text-slate-700 dark:text-[#c3c3c3] w-full md:w-auto shadow-sm"
            >
              <RefreshCw className="w-5 h-5 text-emerald-500" />
              Force Update App
            </button>
            
            <button 
              title="Enable Push (iOS/PWA)"
              onClick={handleEnablePush}
              className="px-5 py-3 rounded-lg border border-slate-200 dark:border-[#444446] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 transition-colors flex items-center gap-3 font-medium text-slate-700 dark:text-[#c3c3c3] w-full md:w-auto shadow-sm"
            >
              <Smartphone className="w-5 h-5 text-blue-500" />
              Enable Push (iOS/PWA)
            </button>

            <button 
              title="Cấu hình tối ưu Desktop (Chống ngủ tab Chrome/Edge)"
              onClick={() => setShowDesktopOptModal(true)}
              className="px-5 py-3 rounded-lg border border-slate-200 dark:border-[#444446] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 transition-colors flex items-center gap-3 font-medium text-slate-700 dark:text-[#c3c3c3] w-full md:w-auto shadow-sm"
            >
              <Monitor className="w-5 h-5 text-indigo-500" />
              Tối ưu Desktop (Chống ngủ tab)
            </button>
            
            <button 
              onClick={async () => {
                const { testLocalNotification } = await import("../lib/notifications");
                testLocalNotification();
              }}
              className="px-5 py-3 rounded-lg border border-slate-200 dark:border-[#444446] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 transition-colors flex items-center gap-3 font-medium text-slate-700 dark:text-[#c3c3c3] w-full md:w-auto shadow-sm"
            >
              <Bell className="w-5 h-5 text-blue-500" />
              Test Local Notification
            </button>

            {isAdmin && (
              <>
                <button 
                  onClick={() => setShowPerformanceDashboard(prev => !prev)}
                  title="Toggle Firestore Performance & Read Monitor"
                  className={cn(
                    "px-5 py-3 rounded-lg border transition-colors flex items-center gap-3 font-medium w-full md:w-auto shadow-sm",
                    showPerformanceDashboard 
                      ? "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                      : "border-slate-200 dark:border-[#444446] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 text-slate-700 dark:text-[#c3c3c3]"
                  )}
                >
                  <Activity className="w-5 h-5 text-blue-500" />
                  Performance Monitor
                  {showPerformanceDashboard ? (
                    <ChevronUp className="w-4 h-4 ml-auto md:ml-1 text-blue-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 ml-auto md:ml-1 text-slate-400" />
                  )}
                </button>

                <button 
                  onClick={() => setShowDataMaintenance(prev => !prev)}
                  title="Bảo trì Dữ liệu & Bộ nhớ đệm (Database Maintenance)"
                  className={cn(
                    "px-5 py-3 rounded-lg border transition-colors flex items-center gap-3 font-medium w-full md:w-auto shadow-sm",
                    showDataMaintenance 
                      ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300"
                      : "border-slate-200 dark:border-[#444446] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 text-slate-700 dark:text-[#c3c3c3]"
                  )}
                >
                  <Database className="w-5 h-5 text-amber-500" />
                  Database Maintenance
                  {showDataMaintenance ? (
                    <ChevronUp className="w-4 h-4 ml-auto md:ml-1 text-amber-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 ml-auto md:ml-1 text-slate-400" />
                  )}
                </button>
              </>
            )}
          </>
        )}
      </div>

      {isAdmin && showDataMaintenance && (
        <SettingDataMaintenance 
          isAdmin={isAdmin}
          onConfirmAction={triggerConfirmAction}
        />
      )}

      {isAdmin && showPerformanceDashboard && (
        <FirestorePerformanceDashboard onClose={() => setShowPerformanceDashboard(false)} />
      )}

      {isAdmin && (
        <>
          <div className="px-5 py-4 border-b border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 flex justify-between items-center shrink-0">
            <h2 className="text-md font-bold text-slate-800 dark:text-[#e3e3e3]">Currency Exchange</h2>
          </div>
          <div className="p-4 md:p-5 flex flex-col bg-white dark:bg-[#1e1e20] border-b border-slate-100 dark:border-[#333336] gap-4">
            <div className="flex flex-col md:flex-row flex-wrap gap-4 items-end w-full">
              <div className="w-full md:w-auto">
                <label className="block text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase mb-1">JPY Rate (1 JPY = x VND)</label>
                <input 
                  type="number" 
                  value={jpyRateInput}
                  onChange={(e) => setJpyRateInput(e.target.value)}
                  className="w-full md:w-48 p-2 rounded-lg border border-slate-300 dark:border-[#555558] text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-[#1e1e20]" 
                />
              </div>
              <div className="w-full md:w-auto">
                <label className="block text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase mb-1">USD Rate (1 USD = x VND)</label>
                <input 
                  type="number" 
                  value={usdRateInput}
                  onChange={(e) => setUsdRateInput(e.target.value)}
                  className="w-full md:w-48 p-2 rounded-lg border border-slate-300 dark:border-[#555558] text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-[#1e1e20]" 
                />
              </div>
              <button 
                onClick={handleSaveExchangeRates}
                disabled={!canWrite}
                className="px-6 py-2 bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm shadow-md transition-colors h-[38px] disabled:opacity-50 w-full md:w-auto mt-2 md:mt-0"
              >
                Save Rates
              </button>
            </div>
          </div>

          <SettingNotificationRules
            rules={rules}
            canWrite={canWrite}
            onConfirmDelete={triggerConfirmAction}
          />
        </>
      )}

      <Suspense fallback={null}>
        {showDesktopOptModal && (
          <DesktopOptimizationModal 
            isOpen={showDesktopOptModal} 
            onClose={() => setShowDesktopOptModal(false)} 
          />
        )}
      </Suspense>
    </div>
  );
}

export default SettingTab;
