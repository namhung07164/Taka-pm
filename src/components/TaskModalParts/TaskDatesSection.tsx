import React, { Dispatch, SetStateAction, memo } from 'react';
import { Pin, Target } from 'lucide-react';
import { FastInput } from '../FastInput';
import { cn } from '../../lib/utils';

interface TaskDatesSectionProps {
  formData: any;
  canWrite: boolean;
  t: (key: string) => string;
  toggleDurationManual: () => void;
  handleDurationChange: (val: string) => void;
  handleDateChange: (field: 'start' | 'finish', value: string) => void;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
}

export const TaskDatesSection = memo(function TaskDatesSection({
  formData,
  canWrite,
  t,
  toggleDurationManual,
  handleDurationChange,
  handleDateChange,
  setFormData,
}: TaskDatesSectionProps) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="col-span-1">
          <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1 flex items-center gap-1">
            <button 
              type="button"
              onClick={toggleDurationManual}
              disabled={!canWrite}
              className={cn(
                "p-0.5 rounded transition-colors", 
                formData.durationManual ? "text-teal-500" : "text-slate-400 dark:text-[#838383]", 
                canWrite ? "hover:bg-slate-200 dark:hover:bg-[#333336]" : "opacity-50 cursor-not-allowed"
              )}
              title={formData.durationManual ? "Manual Duration" : "Auto Duration"}
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
            {t("Duration")}
          </label>
          <FastInput 
            type="text" 
            inputMode="decimal"
            value={formData.duration !== undefined && formData.duration !== null ? String(formData.duration) : ''}
            onChange={(val) => handleDurationChange(val)}
            disabled={!formData.durationManual || !canWrite}
            className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
          />
        </div>

        <div className="col-span-1 lg:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">
              Start (Plan) *
            </label>
            <input 
              type="datetime-local" 
              value={formData.start}
              onChange={(e) => handleDateChange('start', e.target.value)}
              required 
              readOnly={!canWrite}
              className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-slate-50 read-only:text-slate-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1 flex items-center gap-1">
              <button 
                type="button"
                onClick={toggleDurationManual}
                disabled={!canWrite}
                className={cn(
                  "p-0.5 rounded transition-colors", 
                  !formData.durationManual ? "text-teal-500" : "text-slate-400 dark:text-[#838383]", 
                  canWrite ? "hover:bg-slate-200 dark:hover:bg-[#333336]" : "opacity-50 cursor-not-allowed"
                )}
                title={!formData.durationManual ? "Manual Finish" : "Auto Finish"}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>
              Finish (Plan) *
            </label>
            <input 
              type="datetime-local" 
              value={formData.finish}
              onChange={(e) => handleDateChange('finish', e.target.value)}
              required 
              disabled={formData.durationManual || !canWrite}
              className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
        </div>
      </div>

      {parseFloat(String(formData.duration || "0")) < 0 && (
        <div className="mb-4 p-3 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-lg text-sm text-orange-700 dark:text-orange-400">
          <strong>Warning:</strong> The selected dates result in a negative duration. The duration will be auto-corrected to 0 upon saving.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="flex items-center justify-between text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">
            <span>{t("Baseline Start")}</span>
            {canWrite && (
              <button 
                type="button" 
                onClick={() => setFormData((prev: any) => ({ ...prev, baselineStart: prev.start }))} 
                className="text-blue-500 hover:text-blue-600 outline-none transition-colors cursor-pointer" 
                title="Copy from Plan"
              >
                <Target className="w-3.5 h-3.5"/>
              </button>
            )}
          </label>
          <input 
            type="datetime-local" 
            value={formData.baselineStart || ''}
            onChange={(e) => setFormData((prev: any) => ({ ...prev, baselineStart: e.target.value }))}
            readOnly={!canWrite}
            className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-slate-50 read-only:text-slate-500"
          />
        </div>

        <div>
          <label className="flex items-center justify-between text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">
            <span>{t("Baseline Finish")}</span>
            {canWrite && (
              <button 
                type="button" 
                onClick={() => setFormData((prev: any) => ({ ...prev, baselineFinish: prev.finish }))} 
                className="text-blue-500 hover:text-blue-600 outline-none transition-colors cursor-pointer" 
                title="Copy from Plan"
              >
                <Target className="w-3.5 h-3.5"/>
              </button>
            )}
          </label>
          <input 
            type="datetime-local" 
            value={formData.baselineFinish || ''}
            onChange={(e) => setFormData((prev: any) => ({ ...prev, baselineFinish: e.target.value }))}
            readOnly={!canWrite}
            className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-slate-50 read-only:text-slate-500"
          />
        </div>
      </div>
    </>
  );
});
