import React from 'react';
import { Settings, Calendar, SlidersHorizontal, Sun, Moon, Upload, Download, ShieldAlert, Printer } from 'lucide-react';
import { AppUser, TabId } from '../../types';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';
import { useAppStore } from '../../store/useAppStore';

interface HeaderMenuDrawerProps {
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
  currentUser: AppUser;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onLoginClick: () => void;
  onLogoutClick: () => void;
  onToggleTheme?: () => void;
  theme: 'light' | 'dark';
  canWriteImportCsv?: boolean;
  isPrintPreview?: boolean;
  onPrintPreviewToggle?: () => void;
}

export function HeaderMenuDrawer({
  isMenuOpen,
  setIsMenuOpen,
  currentUser,
  activeTab,
  onTabChange,
  onLoginClick,
  onLogoutClick,
  onToggleTheme,
  theme,
  canWriteImportCsv = false,
  isPrintPreview = false,
  onPrintPreviewToggle,
}: HeaderMenuDrawerProps) {
  const { language, setLanguage, t } = useLanguage();

  const ganttViewMode = useAppStore((state) => state.ganttViewMode);
  const setGanttViewMode = useAppStore((state) => state.setGanttViewMode);
  const ganttDayWidth = useAppStore((state) => state.ganttDayWidth);
  const setGanttDayWidth = useAppStore((state) => state.setGanttDayWidth);
  const ganttScaleInput = useAppStore((state) => state.ganttScaleInput);
  const setGanttScaleInput = useAppStore((state) => state.setGanttScaleInput);
  const isGanttWidthChanged = useAppStore((state) => state.isGanttWidthChanged);
  const setIsGanttWidthChanged = useAppStore((state) => state.setIsGanttWidthChanged);
  const saveGanttDayWidth = useAppStore((state) => state.saveGanttDayWidth);

  if (!isMenuOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[9998] bg-black/20 backdrop-blur-[0.5px]"
        onClick={() => setIsMenuOpen(false)}
      />
      <div className="absolute top-10 left-0 w-64 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-2xl z-[9999] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="py-1.5">
          <button
            onClick={() => {
              if (currentUser.role === 'guest') onLoginClick();
              else onLogoutClick();
              setIsMenuOpen(false);
            }}
            className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-[#e3e3e3] font-bold hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-2.5 transition-colors border-b border-slate-100 dark:border-[#444446] mb-1 cursor-pointer"
          >
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                currentUser.role === 'guest'
                  ? 'bg-slate-300 dark:bg-slate-600'
                  : 'bg-emerald-500'
              )}
            />
            {currentUser.role === 'guest' ? t('Login') : t('Logout')}
          </button>

          {currentUser.role !== 'guest' && (
            <button
              title={t('Settings')}
              onClick={() => {
                onTabChange('setting');
                setIsMenuOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-2.5 transition-colors border-b border-slate-100 dark:border-[#444446] mb-1 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500 dark:text-[#a3a3a3]" />
              {t('Settings')}
            </button>
          )}

          {currentUser.role !== 'guest' && (
            <button
              onClick={() => {
                onTabChange('accControl');
                setIsMenuOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-2.5 transition-colors border-b border-slate-100 dark:border-[#444446] cursor-pointer"
            >
              {t('Acc control')}
            </button>
          )}

          {currentUser.role === 'admin' && (
            <button
              onClick={() => {
                onTabChange('audit');
                setIsMenuOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-2.5 transition-colors border-b border-slate-100 dark:border-[#444446] cursor-pointer"
            >
              Audit Log
            </button>
          )}

          <button
            onClick={() => {
              useAppStore.getState().setIsCalendarSyncModalOpen(true);
              setIsMenuOpen(false);
            }}
            className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-2.5 transition-colors border-b border-slate-100 dark:border-[#444446] cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
            <span>Đồng bộ Apple Calendar (iOS)</span>
          </button>

          <button
            onClick={() => {
              useAppStore.getState().setIsGanttSettingsOpen(true);
              if (activeTab !== 'gantt') {
                onTabChange('gantt');
              }
              setIsMenuOpen(false);
            }}
            className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center justify-between transition-colors border-b border-slate-100 dark:border-[#444446] cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="font-bold">Gantt Settings</span>
            </div>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              Gantt
            </span>
          </button>

          {/* Quick Utilities in Hamburger Menu */}
          <div className="py-2 border-b border-slate-100 dark:border-[#444446]">
            <div className="grid grid-cols-2 gap-1 px-3 py-1">
              {onToggleTheme && (
                <button
                  onClick={() => {
                    onToggleTheme();
                    setIsMenuOpen(false);
                  }}
                  className="flex flex-col items-center justify-center p-2 rounded-lg bg-slate-50 dark:bg-[#28282a] hover:bg-slate-100 dark:hover:bg-[#333336] text-[11px] font-medium text-slate-700 dark:text-[#e3e3e3] transition-colors cursor-pointer"
                >
                  {theme === 'dark' ? (
                    <Sun className="w-4 h-4 mb-1 text-amber-500" />
                  ) : (
                    <Moon className="w-4 h-4 mb-1 text-slate-600" />
                  )}
                  <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                </button>
              )}
              <button
                onClick={() => {
                  setLanguage(language === 'en' ? 'ja' : 'en');
                  setIsMenuOpen(false);
                }}
                className="flex flex-col items-center justify-center p-2 rounded-lg bg-slate-50 dark:bg-[#28282a] hover:bg-slate-100 dark:hover:bg-[#333336] text-[11px] font-medium text-slate-700 dark:text-[#e3e3e3] transition-colors cursor-pointer"
              >
                <span className="text-base leading-none mb-1">
                  {language === 'en' ? '🇬🇧' : '🇯🇵'}
                </span>
                <span>{language === 'en' ? 'English' : '日本語'}</span>
              </button>
            </div>

            {/* Gantt View & Scale Controls (ONLY shown when activeTab === 'gantt') */}
            {activeTab === 'gantt' && (
              <div className="mt-2 px-3 pt-2.5 border-t border-slate-100 dark:border-[#333336] flex flex-col gap-2.5">
                {/* VIEW Switch */}
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-[#e3e3e3]">
                  <span className="uppercase text-[11px] text-slate-500 dark:text-[#a3a3a3] font-bold">
                    {t('VIEW')}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const nextMode =
                          ganttViewMode === 'monthly'
                            ? 'weekly'
                            : ganttViewMode === 'weekly'
                            ? 'quarterly'
                            : 'monthly';
                        setGanttViewMode(nextMode);
                      }}
                      className="relative inline-flex h-5 w-10 items-center rounded-full bg-blue-600 transition-colors focus:outline-none cursor-pointer"
                    >
                      <span
                        className={cn(
                          'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                          ganttViewMode === 'monthly'
                            ? 'translate-x-5.5'
                            : ganttViewMode === 'weekly'
                            ? 'translate-x-3'
                            : 'translate-x-0.5'
                        )}
                      />
                    </button>
                    <span className="text-xs font-bold text-blue-600 dark:text-[#8ab4f8] capitalize min-w-[55px] text-right">
                      {ganttViewMode}
                    </span>
                  </div>
                </div>

                {/* SCALE Controls */}
                <div className="flex flex-col gap-1.5 text-xs font-bold text-slate-700 dark:text-[#e3e3e3]">
                  <div className="flex items-center justify-between">
                    <span className="uppercase text-[11px] text-slate-500 dark:text-[#a3a3a3] font-bold">
                      {t('SCALE')}
                    </span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="150"
                        value={ganttScaleInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGanttScaleInput(val);
                          const num = Number(val);
                          if (!isNaN(num) && num >= 0 && num <= 150) {
                            const calculatedDayWidth =
                              num === 0
                                ? 0.6
                                : Math.max(
                                    0.6,
                                    Math.round((num / 75) * 8 * 10) / 10
                                  );
                            setGanttDayWidth(calculatedDayWidth);
                            setIsGanttWidthChanged(true);
                          }
                        }}
                        className="w-12 px-1.5 py-0.5 text-xs text-center font-mono font-bold bg-slate-50 dark:bg-[#1c1c1e] border border-slate-300 dark:border-[#444446] text-slate-900 dark:text-white rounded outline-none"
                      />
                      <span className="text-slate-500 dark:text-[#a3a3a3] font-bold">
                        %
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0.6"
                      max="20"
                      step="0.2"
                      value={ganttDayWidth}
                      onChange={(e) => {
                        const num = Number(e.target.value);
                        setGanttDayWidth(num);
                        setGanttScaleInput(
                          String(Math.round((num / 8) * 75))
                        );
                        setIsGanttWidthChanged(true);
                      }}
                      className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    {isGanttWidthChanged && (
                      <button
                        type="button"
                        onClick={saveGanttDayWidth}
                        className="px-2 py-0.5 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow-2xs cursor-pointer shrink-0"
                      >
                        Save
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {activeTab === 'layout' && (
            <button
              onClick={() => {
                setIsMenuOpen(false);
                setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent('open-layout-edit-mode')
                  );
                }, 50);
              }}
              className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-purple-50 dark:hover:bg-purple-950/30 flex items-center gap-2.5 transition-colors border-b border-slate-100 dark:border-[#444446] cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span className="font-semibold text-purple-700 dark:text-purple-300">
                Edit Mode
              </span>
            </button>
          )}

          {currentUser.role !== 'guest' && activeTab === 'detail' && (
            <>
              {canWriteImportCsv && (
                <button
                  onClick={() => {
                    document.getElementById('detail-import-projects-input')?.click();
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                  Import Project
                </button>
              )}
              <button
                onClick={() => {
                  document.getElementById('detail-export-projects-btn')?.click();
                  setIsMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                Export Project
              </button>
              {currentUser.role === 'admin' && (
                <button
                  onClick={() => {
                    document.getElementById('detail-full-import-projects-btn')?.click();
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Full Import Project
                </button>
              )}
              <div className="h-px bg-slate-100 dark:bg-[#444446]"></div>
              {canWriteImportCsv && (
                <button
                  onClick={() => {
                    document.getElementById('detail-import-tasks-input')?.click();
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                  Import Task
                </button>
              )}
              <button
                onClick={() => {
                  document.getElementById('detail-export-tasks-btn')?.click();
                  setIsMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                Export Task
              </button>
              {currentUser.role === 'admin' && (
                <button
                  onClick={() => {
                    document.getElementById('detail-full-import-tasks-btn')?.click();
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Full Import Task
                </button>
              )}
            </>
          )}

          {currentUser.role !== 'guest' && activeTab === 'budget' && (
            <>
              {canWriteImportCsv && (
                <button
                  onClick={() => {
                    document.getElementById('budget-import-input')?.click();
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                  Import Budget
                </button>
              )}
              <button
                onClick={() => {
                  document.getElementById('budget-export-btn')?.click();
                  setIsMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                Export Budget
              </button>
              {currentUser.role === 'admin' && (
                <button
                  onClick={() => {
                    document.getElementById('budget-full-import-btn')?.click();
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Full Import Budget
                </button>
              )}
            </>
          )}

          {currentUser.role !== 'guest' && activeTab === 'cost' && (
            <>
              {canWriteImportCsv && (
                <button
                  onClick={() => {
                    document.getElementById('cost-import-input')?.click();
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                  Import Cost
                </button>
              )}
              <button
                onClick={() => {
                  document.getElementById('cost-export-btn')?.click();
                  setIsMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                Export Cost
              </button>
              {currentUser.role === 'admin' && (
                <button
                  onClick={() => {
                    document.getElementById('cost-full-import-btn')?.click();
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Full Import Cost
                </button>
              )}
            </>
          )}

          {['detail', 'budget', 'cost', 'summary', 'gantt', 'layout'].includes(activeTab) && (
            <>
              {['detail', 'budget', 'cost'].includes(activeTab) && currentUser.role !== 'guest' && (
                <div className="h-px bg-slate-100 dark:bg-[#444446]"></div>
              )}
              <button
                onClick={() => {
                  if (onPrintPreviewToggle) {
                    onPrintPreviewToggle();
                  }
                  setIsMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                {isPrintPreview ? 'Exit Print Preview' : 'Print Preview'}
              </button>

              {['gantt', 'layout'].includes(activeTab) && (
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('export-png'));
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-[#e3e3e3] font-medium hover:bg-slate-50 dark:hover:bg-[#333336]/50 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  Export as PNG
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
