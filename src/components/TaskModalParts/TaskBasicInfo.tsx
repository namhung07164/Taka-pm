import React, { memo } from 'react';
import { TaskModalLogicType } from '../../hooks/useTaskModalLogic';
import { MultiSelect } from '../MultiSelect';
import { FastInput } from '../FastInput';
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

