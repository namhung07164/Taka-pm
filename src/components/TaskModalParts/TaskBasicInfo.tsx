import React, { memo } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';
import { TaskModalLogicType } from '../../hooks/useTaskModalLogic';
import { MultiSelect } from '../MultiSelect';
import { FastInput } from '../FastInput';
import { FastToggle } from '../DetailTabParts/FastToggle';
import { TaskDatesSection } from './TaskDatesSection';
import { TaskPredecessorSection } from './TaskPredecessorSection';

export const TaskBasicInfo = memo(function TaskBasicInfo({ 
  logic, 
  task, 
  onNavigateToDelegation, 
  onClose 
}: { 
  logic: TaskModalLogicType, 
  task: any, 
  onNavigateToDelegation: any, 
  onClose: () => void 
}) {
  const {
    projects, tasks, delegationGroups, canWrite, t,
    formData, setFormData, dateErrors,
    handlePredecessorChange, handleApplyPredecessorDates, handleDateChange, handleDurationChange, toggleDurationManual,
    resolvedPredecessors, parties, appUsers, subAppUsers, nameRef
  } = logic;

  const currentTaskDelegationGroup = React.useMemo(() => {
    if (!task) return null;
    return delegationGroups.find(g => g.parentTaskId === task.id || g.id === task.id);
  }, [task, delegationGroups]);

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
                const matchedProj = projects.find(p => p.code === val.code && String(p.year) === String(val.year) && p.store === val.store) || projects.find(p => p.code === val.code);
                setFormData({ 
                  ...formData, 
                  projectCode: val.code, 
                  projectYear: val.year, 
                  projectStore: val.store,
                  ...(!task && !formData.party && matchedProj?.party ? { party: matchedProj.party } : {})
                });
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

      {/* Delegation Toggle & Tracker Access Box */}
      <div className="mb-4 p-3 sm:p-3.5 rounded-xl border border-slate-200 dark:border-[#444446] bg-slate-50/80 dark:bg-[#252528] flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-700 dark:text-[#e3e3e3] uppercase tracking-wide flex items-center gap-1.5">
              <span className={cn("w-2 h-2 rounded-full", formData.delegation ? "bg-green-500 animate-pulse" : "bg-slate-400")}></span>
              {t("Delegation (Ủy Quyền)") || "Delegation (Ủy Quyền)"}
            </span>
            {task && task.parentTaskId && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                ↳ Sub-task Modular
              </span>
            )}
          </div>
          <FastToggle 
            value={Boolean(formData.delegation)} 
            canWrite={canWrite} 
            onToggle={(val) => setFormData({ ...formData, delegation: val })} 
          />
        </div>

        {(Boolean(formData.delegation) || !!currentTaskDelegationGroup) && (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-[#38383a] text-xs flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Trạng thái Tracker:</span>
              <span className="px-2 py-0.5 rounded-full font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px]">
                {currentTaskDelegationGroup ? `Đã có ${currentTaskDelegationGroup.subTasks?.length || 0} delegation` : 'Bật Delegation'}
              </span>
            </div>
            {task && onNavigateToDelegation && currentTaskDelegationGroup && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToDelegation(currentTaskDelegationGroup.id, task.id);
                }}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors active:scale-95 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Mở Tracker / Delegation</span>
              </button>
            )}
          </div>
        )}
      </div>

      <TaskDatesSection 
        formData={formData}
        canWrite={canWrite}
        t={t}
        toggleDurationManual={toggleDurationManual}
        handleDurationChange={handleDurationChange}
        handleDateChange={handleDateChange}
        setFormData={setFormData}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <TaskPredecessorSection 
          formData={formData}
          canWrite={canWrite}
          t={t}
          tasks={tasks}
          projects={projects}
          resolvedPredecessors={resolvedPredecessors}
          handlePredecessorChange={handlePredecessorChange}
          handleApplyPredecessorDates={handleApplyPredecessorDates}
        />

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
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-100 dark:hover:bg-[#28282a] rounded-lg cursor-pointer">
          {canWrite ? 'Cancel' : 'Close'}
        </button>
        {canWrite && (
          <button title="Save Task" type="submit" className="px-6 py-2 bg-slate-900 dark:bg-blue-600 text-white rounded-lg font-bold text-sm shadow-xl active:scale-95 transition-all cursor-pointer">Save Task</button>
        )}
      </div>
    </>
  );
});

