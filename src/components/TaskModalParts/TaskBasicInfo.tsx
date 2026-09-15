import React from 'react';
import { TaskModalLogicType } from '../../hooks/useTaskModalLogic';
import { MultiSelect } from '../MultiSelect';
import { PredecessorMultiInput } from '../PredecessorMultiInput';
import { FastInput } from '../FastInput';
import { Target, ExternalLink } from 'lucide-react';
import { ensureUrlProtocol } from '../../lib/utils';
import { getTaskStatus, cn, formatDisplayDateTime } from '../../lib/utils';
import { Pin, Info } from 'lucide-react';

export function TaskBasicInfo({ logic, task, onNavigateToDelegation, onClose }: { logic: TaskModalLogicType, task: any, onNavigateToDelegation: any, onClose: () => void }) {
  const {
    projects, tasks, delegationGroups, canWrite, t,
    formData, setFormData, dateErrors,
    handlePredecessorChange, handleApplyPredecessorDates, handleDateChange, handleDurationChange, toggleDurationManual,
    resolvedPredecessors, parties, appUsers, subAppUsers, nameRef
  } = logic;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">Project Code *</label>
              <select 
                value={JSON.stringify({ code: formData.projectCode || '', year: formData.projectYear || null, store: formData.projectStore || null })}
                onChange={(e) => {
                  try {
                    const val = JSON.parse(e.target.value);
                    setFormData({ ...formData, projectCode: val.code, projectYear: val.year, projectStore: val.store });
                  } catch (err) {}
                }}
                required 
                disabled={!canWrite}
                className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm bg-white dark:bg-[#1e1e20] outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
              >
                {projects.map(p => (
                  <option 
                    key={`${p.code}-${p.year}-${p.store}-${p.no}`} 
                    value={JSON.stringify({ code: p.code, year: p.year || null, store: p.store || null })}
                  >
                    {p.code} {p.store ? `(${p.store})` : ''} {p.year ? `[${p.year}]` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">{t("Project Name")}</label>
              <input 
                type="text" 
                value={projects.find(p => p.code === formData.projectCode && p.year == formData.projectYear && p.store == formData.projectStore)?.name || ''}
                readOnly
                className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm outline-none bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-500 dark:text-[#a3a3a3] cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">{t("Year")}</label>
              <input 
                type="text" 
                value={projects.find(p => p.code === formData.projectCode && p.year == formData.projectYear && p.store == formData.projectStore)?.year || ''}
                readOnly
                className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm outline-none bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-500 dark:text-[#a3a3a3] cursor-not-allowed"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">Task Name *</label>
            <FastInput 
              ref={nameRef}
              type="text" 
              inputMode="text"
              value={formData.name || ''}
              onChange={(val) => setFormData({ ...formData, name: val })}
              required 
              readOnly={!canWrite}
              className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-slate-50 read-only:text-slate-500"
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div className="col-span-1">
              <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1 flex items-center gap-1">
                <button 
                  type="button"
                  onClick={toggleDurationManual}
                  disabled={!canWrite}
                  className={cn("p-0.5 rounded transition-colors", formData.durationManual ? "text-teal-500" : "text-slate-400 dark:text-[#838383]", canWrite ? "hover:bg-slate-200 dark:hover:bg-[#333336]" : "opacity-50 cursor-not-allowed")}
                  title={formData.durationManual ? "Manual Duration" : "Auto Duration"}
                >
                  <Pin className="w-3.5 h-3.5" />
                </button>{t("Duration")}</label>
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
                <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">Start (Plan) *</label>
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
                    className={cn("p-0.5 rounded transition-colors", !formData.durationManual ? "text-teal-500" : "text-slate-400 dark:text-[#838383]", canWrite ? "hover:bg-slate-200 dark:hover:bg-[#333336]" : "opacity-50 cursor-not-allowed")}
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
                {canWrite && <button type="button" onClick={() => setFormData({ ...formData, baselineStart: formData.start })} className="text-blue-500 hover:text-blue-600 outline-none transition-colors" title="Copy from Plan"><Target className="w-3.5 h-3.5"/></button>}
              </label>
              <input 
                type="datetime-local" 
                value={formData.baselineStart || ''}
                onChange={(e) => setFormData({ ...formData, baselineStart: e.target.value })}
                readOnly={!canWrite}
                className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-slate-50 read-only:text-slate-500"
              />
            </div>
            <div>
              <label className="flex items-center justify-between text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">
                <span>{t("Baseline Finish")}</span>
                {canWrite && <button type="button" onClick={() => setFormData({ ...formData, baselineFinish: formData.finish })} className="text-blue-500 hover:text-blue-600 outline-none transition-colors" title="Copy from Plan"><Target className="w-3.5 h-3.5"/></button>}
              </label>
              <input 
                type="datetime-local" 
                value={formData.baselineFinish || ''}
                onChange={(e) => setFormData({ ...formData, baselineFinish: e.target.value })}
                readOnly={!canWrite}
                className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-slate-50 read-only:text-slate-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-400 dark:text-[#838383] uppercase">
                  {t("Predecessor")}
                  <span className="group relative inline-flex items-center" >
                    <Info className="w-3.5 h-3.5 text-amber-500 cursor-help" />
                    <div className="absolute bottom-full left-0 mb-1.5 w-56 p-2 bg-slate-800 dark:bg-slate-700 text-white text-[10px] leading-relaxed rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none z-50 normal-case font-normal shadow-xl">
                      The second predecessor requires a valid 'SF' (Start-to-Finish) or 'FF' (Finish-to-Finish) relationship.
                      <svg className="absolute top-full left-1.5 w-2 h-2 text-slate-800 dark:text-slate-700" viewBox="0 0 8 4" fill="currentColor"><path d="M0 0l4 4 4-4H0z"/></svg>
                    </div>
                  </span>
                </label>
                {resolvedPredecessors.length > 0 && (
                  <div className="flex flex-col items-end gap-0.5 truncate max-w-[200px]">
                    {resolvedPredecessors.map((rp, idx) => rp?.task && (
                      <span key={idx} className={`text-[10px] font-semibold truncate ${idx === 0 ? "text-blue-600 dark:text-blue-400" : "text-rose-600 dark:text-rose-400"}`}>
                        {idx + 1}. {rp.task.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <PredecessorMultiInput 
                value={formData.predecessor || ""}
                onChange={handlePredecessorChange}
                tasks={tasks}
                projects={projects}
                currentProjectCode={formData.projectCode}
                currentProjectYear={formData.projectYear}
                currentProjectStore={formData.projectStore}
                disabled={!canWrite}
              />
              {resolvedPredecessors.length > 0 && (
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {resolvedPredecessors.map((rp, idx) => rp?.task && (
                    <div key={idx} className={`flex items-center justify-between p-2 rounded-lg border text-xs ${
                      idx === 0 
                        ? "bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800" 
                        : "bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800"
                    }`}>
                      <div className="flex flex-col gap-0.5 truncate mr-2">
                        <span className={`font-semibold truncate ${idx === 0 ? "text-blue-800 dark:text-blue-300" : "text-rose-800 dark:text-rose-300"}`}>
                          {idx + 1}. {rp.task.name}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-[#a3a3a3]">
                          {(rp.type === 'SS' || rp.type === 'SF') ? 'Start' : 'End'}: {formatDisplayDateTime((rp.type === 'SS' || rp.type === 'SF') ? rp.task.start : rp.task.finish)} ({rp.type || "FS"}{rp.lagValue ? ` ${rp.lagSign}${rp.lagValue}d` : ""})
                        </span>
                      </div>
                      {idx === 0 && (
                        <button
                          type="button"
                          onClick={handleApplyPredecessorDates}
                          className="shrink-0 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 bg-white dark:bg-[#1e1e20] border border-blue-200 dark:border-blue-700 px-2 py-1 rounded shadow-sm hover:bg-blue-50"
                        >
                          Sync dates
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="relative w-full">
              <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">{t("Party")}</label>
              <MultiSelect
                value={formData.party || ''}
                onChange={(val) => setFormData({ ...formData, party: val })}
                options={parties}
                placeholder="Contractor A, Contractor B"
                disabled={!canWrite}
                className="w-full text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-100 dark:hover:bg-[#28282a] rounded-lg">
              {canWrite ? 'Cancel' : 'Close'}
            </button>
            {canWrite && (
              <button title="Save Task" type="submit" className="px-6 py-2 bg-slate-900 dark:bg-blue-600 text-white rounded-lg font-bold text-sm shadow-xl active:scale-95 transition-all">Save Task</button>
            )}
          </div>
        
    </>
  );
}
