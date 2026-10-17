import React, { memo, useMemo } from 'react';
import { ExternalLink, Unlink, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { TaskModalLogicType } from '../../hooks/useTaskModalLogic';
import { MultiSelect } from '../MultiSelect';
import { FastInput } from '../FastInput';
import { FastToggle } from '../DetailTabParts/FastToggle';
import { TaskDatesSection } from './TaskDatesSection';
import { TaskPredecessorSection } from './TaskPredecessorSection';
import { useAppStore } from '../../store/useAppStore';

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
    resolvedPredecessors, parties, appUsers, subAppUsers, nameRef,
    handleUnlinkParentInModal, handleDeleteTaskInModal
  } = logic;

  const currentTaskDelegationGroup = React.useMemo(() => {
    if (!task) return null;
    return delegationGroups.find(g => g.parentTaskId === task.id || g.id === task.id);
  }, [task, delegationGroups]);

  const subTasksOfCurrent = React.useMemo(() => {
    if (!task?.id) return [];
    const tId = String(task.id);
    const code = task.taskCodePhu ? String(task.taskCodePhu).trim().toLowerCase() : '';
    const tProjId = task.projectId ? String(task.projectId).trim() : '';
    const tCode = task.projectCode ? String(task.projectCode).trim().toLowerCase() : '';
    const tYear = task.projectYear !== undefined && task.projectYear !== null ? String(task.projectYear).trim() : '';
    const tStore = task.projectStore ? String(task.projectStore).trim().toUpperCase() : '';
    return tasks.filter(t => {
      if (String(t.id) === tId) return false;
      const raw = t.parentTaskId || (t as any).parentId;
      if (!raw) return false;
      if (String(raw) === tId) return true;
      const rawStr = String(raw).trim().toLowerCase();
      if (code && rawStr === code) {
        if (tProjId && t.projectId && String(t.projectId).trim() !== tProjId) return false;
        if (tCode && t.projectCode && String(t.projectCode).trim().toLowerCase() !== tCode) return false;
        if (tYear && t.projectYear && String(t.projectYear).trim() !== tYear) return false;
        if (tStore && t.projectStore && String(t.projectStore).trim().toUpperCase() !== tStore) return false;
        return true;
      }
      return false;
    });
  }, [task, tasks]);

  const handleUnlinkAllSubtasks = async () => {
    if (subTasksOfCurrent.length === 0) return;
    try {
      const { localDb } = await import('../../lib/localDb');
      const now = new Date().toISOString();
      const childIds = subTasksOfCurrent.map(c => c.id);
      const prevAll = useAppStore.getState().tasks;
      const updated = prevAll.map(t => childIds.includes(t.id) ? { ...t, parentTaskId: undefined, parentId: undefined, updatedAt: now } : t);
      useAppStore.getState().setTasks(updated);
      await Promise.all(childIds.map(id => (localDb.tasks.update as any)(id, { parentTaskId: null, parentId: null, updatedAt: now })));
      const { doc, deleteField } = await import('firebase/firestore');
      const { writeBatch } = await import('../../lib/firestoreWrites');
      const { db, APP_ID } = await import('../../lib/firebase');
      const batch = writeBatch(db);
      childIds.forEach(id => {
        const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id);
        batch.update(ref, { parentTaskId: deleteField(), parentId: null, updatedAt: now });
      });
      await batch.commit();
      useAppStore.getState().setToast({ title: "Success", message: `Unlinked ${childIds.length} subtask(s).` });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">{t("Project Code") || "Project Code *"} *</label>
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
          <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">{t("Project Name") || "Project Name"}</label>
          <input 
            type="text" 
            value={projects.find(p => p.code === formData.projectCode && p.year == formData.projectYear && p.store == formData.projectStore)?.name || ''}
            readOnly
            className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm outline-none bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-500 dark:text-[#a3a3a3] cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">{t("Year") || "Year"}</label>
          <input 
            type="text" 
            value={projects.find(p => p.code === formData.projectCode && p.year == formData.projectYear && p.store == formData.projectStore)?.year || ''}
            readOnly
            className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm outline-none bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-500 dark:text-[#a3a3a3] cursor-not-allowed"
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">{t("Task Name") || "Task Name *"} *</label>
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
              {t("Delegation") || "Delegation"}
            </span>
            {(Boolean(formData.parentTaskId) || Boolean((formData as any).parentId) || Boolean(task?.parentTaskId) || Boolean((task as any)?.parentId)) && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                  ↳ Sub-task
                </span>
                {canWrite && handleUnlinkParentInModal && (
                  <button
                    type="button"
                    onClick={handleUnlinkParentInModal}
                    className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 hover:bg-amber-300 dark:bg-amber-900/60 dark:hover:bg-amber-800 text-amber-900 dark:text-amber-200 border border-amber-400 dark:border-amber-600 transition-colors cursor-pointer active:scale-95"
                    title="Unlink this task from parent task"
                  >
                    <Unlink className="w-2.5 h-2.5" />
                    <span>Unlink Parent</span>
                  </button>
                )}
              </div>
            )}
            {subTasksOfCurrent.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-700">
                  Parent Task ({subTasksOfCurrent.length} sub-tasks)
                </span>
                {canWrite && (
                  <button
                    type="button"
                    onClick={handleUnlinkAllSubtasks}
                    className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-200 hover:bg-purple-300 dark:bg-purple-900/60 dark:hover:bg-purple-800 text-purple-900 dark:text-purple-200 border border-purple-400 dark:border-purple-600 transition-colors cursor-pointer active:scale-95"
                    title="Unlink all sub-tasks from this parent task"
                  >
                    <Unlink className="w-2.5 h-2.5" />
                    <span>Unlink Sub-tasks</span>
                  </button>
                )}
              </div>
            )}
          </div>
          <FastToggle 
            value={Boolean(formData.delegation)} 
            canWrite={canWrite} 
            onToggle={(val) => setFormData({ ...formData, delegation: val })} 
          />
        </div>

        {(Boolean(formData.delegation) || !!currentTaskDelegationGroup) ? (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-[#38383a] text-xs flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Tracker Status:</span>
              <span className="px-2 py-0.5 rounded-full font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px]">
                {currentTaskDelegationGroup ? `${currentTaskDelegationGroup.subTasks?.length || 0} delegations` : 'Delegation Active'}
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
                <span>Open Tracker / Delegation</span>
              </button>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 dark:text-[#a3a3a3] italic pt-1 border-t border-slate-200/60 dark:border-[#38383a]">
            Note: Actual status (Act Status) will not update unless Delegation is ENABLED.
          </p>
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

      {/* Predecessor Section (Full width for clear task name visibility & zero overlap) */}
      <div className="mb-4 w-full">
        <TaskPredecessorSection 
          task={task}
          formData={formData}
          canWrite={canWrite}
          t={t}
          tasks={tasks}
          projects={projects}
          resolvedPredecessors={resolvedPredecessors}
          handlePredecessorChange={handlePredecessorChange}
          handleApplyPredecessorDates={handleApplyPredecessorDates}
          setFormData={setFormData}
        />
      </div>

      {/* Party Selection */}
      <div className="mb-6 w-full">
        <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">{t("Party") || "Responsible Parties / Contractors"}</label>
        <MultiSelect
          value={formData.party || ''}
          onChange={(val) => setFormData({ ...formData, party: val })}
          options={parties}
          placeholder="Contractor A, Contractor B"
          disabled={!canWrite}
          className="w-full text-sm"
        />
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        {task && canWrite && handleDeleteTaskInModal ? (
          <button
            type="button"
            onClick={handleDeleteTaskInModal}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors cursor-pointer active:scale-95"
            title="Delete this task"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Task</span>
          </button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-100 dark:hover:bg-[#28282a] rounded-lg cursor-pointer">
            {canWrite ? 'Cancel' : 'Close'}
          </button>
          {canWrite && (
            <button title="Save Task" type="submit" className="px-6 py-2 bg-slate-900 dark:bg-blue-600 text-white rounded-lg font-bold text-sm shadow-xl active:scale-95 transition-all cursor-pointer">Save Task</button>
          )}
        </div>
      </div>
    </>
  );
});

