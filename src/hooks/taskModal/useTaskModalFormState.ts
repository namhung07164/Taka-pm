import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Project, Task } from '../../types';
import { getDefaultDatetimeLocal, formatToDatetimeLocal, parseDateTime } from '../../lib/utils';
import { calculateTaskDatesFromPredecessors, parsePredecessors, buildTaskNoMap } from '../../lib/ganttUtils';
import { useAppStore } from '../../store/useAppStore';

export interface UseTaskModalFormStateProps {
  task: Task | null;
  isOpen: boolean;
  prefillProjectCode: string | null;
  prefillProjectYear?: string | number | null;
  prefillProjectStore?: string | null;
  projects: Project[];
  tasks: Task[];
  t: (key: string) => string;
}

export function useTaskModalFormState({
  task,
  isOpen,
  prefillProjectCode,
  prefillProjectYear,
  prefillProjectStore,
  projects,
  tasks,
  t
}: UseTaskModalFormStateProps) {
  const [dateErrors, setDateErrors] = useState<any>({});
  const nameRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Partial<Task>>(() => {
    if (task) return task;
    const defaultDate = getDefaultDatetimeLocal();
    const targetProj = projects?.find(p => 
      p.code === prefillProjectCode &&
      (prefillProjectStore ? p.store === prefillProjectStore : true) &&
      (prefillProjectYear ? String(p.year) === String(prefillProjectYear) : true)
    ) || projects?.find(p => p.code === prefillProjectCode) || (projects && projects.length > 0 ? projects[0] : null);

    return {
      projectId: targetProj?.id || undefined,
      projectCode: prefillProjectCode || targetProj?.code || '',
      projectYear: prefillProjectYear || targetProj?.year || undefined,
      projectStore: prefillProjectStore || targetProj?.store || undefined,
      location: targetProj?.location || undefined,
      name: '',
      start: defaultDate,
      finish: defaultDate,
      baselineStart: defaultDate,
      baselineFinish: defaultDate,
      duration: '0',
      durationManual: true,
      finishManual: false,
      party: targetProj?.party || 'Takashimaya',
      predecessors: task?.predecessors || []
    };
  });

  useEffect(() => {
    if (!isOpen) return;
    if (task) {
      setFormData({
        ...task,
        predecessor: task.predecessor || ''
      });
    } else {
      const defaultDate = getDefaultDatetimeLocal();
      const targetProj = projects?.find(p => 
        p.code === prefillProjectCode &&
        (prefillProjectStore ? p.store === prefillProjectStore : true) &&
        (prefillProjectYear ? String(p.year) === String(prefillProjectYear) : true)
      ) || projects?.find(p => p.code === prefillProjectCode) || (projects && projects.length > 0 ? projects[0] : null);

      setFormData({
        projectId: targetProj?.id || undefined,
        projectCode: prefillProjectCode || targetProj?.code || '',
        projectYear: prefillProjectYear || targetProj?.year || undefined,
        projectStore: prefillProjectStore || targetProj?.store || undefined,
        location: targetProj?.location || undefined,
        name: '',
        start: defaultDate,
        finish: defaultDate,
        baselineStart: defaultDate,
        baselineFinish: defaultDate,
        duration: '0',
        durationManual: true,
        finishManual: false,
        party: targetProj?.party || 'Takashimaya',
        predecessors: []
      });
    }
  }, [task?.id, isOpen, prefillProjectCode, prefillProjectYear, prefillProjectStore]);

  const currentProject = useMemo(() => {
    return projects.find(p => 
      p.code === (formData.projectCode || task?.projectCode) &&
      (formData.projectStore ? p.store === formData.projectStore : true) &&
      (formData.projectYear ? String(p.year) === String(formData.projectYear) : true)
    ) || projects.find(p => p.code === (formData.projectCode || task?.projectCode));
  }, [projects, formData.projectCode, formData.projectStore, formData.projectYear, task?.projectCode]);

  const resolvedPredecessors = useMemo(() => {
    if (!formData.predecessor?.trim()) return [];
    try {
      const taskNoMap = buildTaskNoMap(projects || [], tasks || []);
      const dummyTask: Task = {
        id: task?.id || 'temp',
        projectId: formData.projectId || task?.projectId || currentProject?.id,
        projectCode: formData.projectCode || task?.projectCode || currentProject?.code || '',
        projectYear: formData.projectYear || task?.projectYear || currentProject?.year,
        projectStore: formData.projectStore || task?.projectStore || currentProject?.store,
        location: formData.location || task?.location || currentProject?.location,
        name: formData.name || '',
        start: formData.start,
        finish: formData.finish,
        duration: formData.duration,
        durationManual: true,
        finishManual: false
      };
      return parsePredecessors(formData.predecessor, taskNoMap, dummyTask);
    } catch {
      return [];
    }
  }, [formData.predecessor, formData.projectId, formData.projectCode, formData.projectYear, formData.projectStore, formData.location, currentProject, projects, tasks, task?.id, task?.projectId, task?.projectCode, task?.projectYear, task?.projectStore, task?.location]);

  const handlePredecessorChange = (val: string) => {
    const isFilled = Boolean(val.trim());
    const parts = val.split(',').map(s => s.trim()).filter(Boolean);
    const updated = { 
      ...formData, 
      predecessor: val, 
      realtimeUpdate: isFilled,
      ...(parts.length >= 2 ? { durationManual: false } : {})
    };

    if (isFilled) {
      try {
        const currentTasks = useAppStore.getState().tasks || tasks || [];
        const taskNoMap = buildTaskNoMap(projects || [], currentTasks);
        const dummyTask: Task = {
          id: task?.id || 'temp',
          projectId: updated.projectId || task?.projectId || currentProject?.id,
          projectCode: updated.projectCode || currentProject?.code || '',
          projectYear: updated.projectYear || currentProject?.year,
          projectStore: updated.projectStore || currentProject?.store,
          location: updated.location || task?.location || currentProject?.location,
          name: updated.name || '',
          start: updated.start,
          finish: updated.finish,
          duration: updated.duration,
          durationManual: updated.durationManual ?? (parts.length >= 2 ? false : true),
          finishManual: updated.finishManual ?? false
        };
        const parsed = parsePredecessors(val, taskNoMap, dummyTask);

        if (parsed.length > 0) {
          const calcResult = calculateTaskDatesFromPredecessors(dummyTask, parsed);
          if (calcResult) {
            updated.start = calcResult.start;
            updated.finish = calcResult.finish;
            updated.duration = calcResult.duration;
            updated.durationManual = calcResult.durationManual;

            if (!task?.baselineStart && !formData.baselineStart) {
              updated.baselineStart = calcResult.start;
            }
            if (!task?.baselineFinish && !formData.baselineFinish) {
              updated.baselineFinish = calcResult.finish;
            }
          }
        }
      } catch (err) {
        console.warn("Predecessor auto-calc err:", err);
      }
    }

    setFormData(updated);
  };

  const handleApplyPredecessorDates = () => {
    if (formData.predecessor) {
      if (resolvedPredecessors.length > 0) {
        const dummyTask: Task = {
          id: task?.id || 'temp',
          projectCode: formData.projectCode || '',
          projectYear: formData.projectYear,
          projectStore: formData.projectStore,
          name: formData.name || '',
          start: formData.start,
          finish: formData.finish,
          duration: formData.duration,
          durationManual: formData.durationManual ?? true,
          finishManual: formData.finishManual ?? false
        };
        const calcResult = calculateTaskDatesFromPredecessors(dummyTask, resolvedPredecessors);
        if (calcResult) {
          setFormData(prev => ({
            ...prev,
            start: calcResult.start,
            finish: calcResult.finish,
            duration: calcResult.duration,
            durationManual: calcResult.durationManual,
            ...(!task?.baselineStart && !prev.baselineStart ? { baselineStart: calcResult.start } : {}),
            ...(!task?.baselineFinish && !prev.baselineFinish ? { baselineFinish: calcResult.finish } : {})
          }));
          useAppStore.getState().setToast({
            title: t("Dates Synced") || "Dates Synced",
            message: t("Task dates and duration synced with predecessors.") || "Task dates and duration synced with predecessors."
          });
          return;
        }
      }
      handlePredecessorChange(formData.predecessor);
      useAppStore.getState().setToast({
        title: t("Dates Synced") || "Dates Synced",
        message: t("Task dates and duration synced with predecessors.") || "Task dates and duration synced with predecessors."
      });
    }
  };

  const handleDateChange = (field: 'start' | 'finish', value: string) => {
    const nextData = { ...formData, [field]: value };
    
    if (field === 'start') {
      if (nextData.durationManual) {
        if (nextData.start && nextData.duration !== undefined && nextData.duration !== '') {
          const s = parseDateTime(nextData.start);
          if (s && !isNaN(s.getTime())) {
            const days = parseFloat(String(nextData.duration));
            if (!isNaN(days)) {
              const f = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
              nextData.finish = formatToDatetimeLocal(f);
            }
          }
        }
      } else {
        if (nextData.start && nextData.finish) {
          const s = parseDateTime(nextData.start);
          const f = parseDateTime(nextData.finish);
          if (s && f && !isNaN(s.getTime()) && !isNaN(f.getTime())) {
            const diffDays = (f.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
            nextData.duration = String(diffDays >= 0 ? Number(diffDays.toFixed(2)) : 0);
          }
        }
      }
    } else {
      if (nextData.start && nextData.finish) {
        const s = parseDateTime(nextData.start);
        const f = parseDateTime(nextData.finish);
        if (s && f && !isNaN(s.getTime()) && !isNaN(f.getTime())) {
          const diffDays = (f.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
          nextData.duration = String(diffDays >= 0 ? Number(diffDays.toFixed(2)) : 0);
        }
      }
    }

    if (!task?.baselineStart && !formData.baselineStart && nextData.start) {
      nextData.baselineStart = nextData.start;
    }
    if (!task?.baselineFinish && !formData.baselineFinish && nextData.finish) {
      nextData.baselineFinish = nextData.finish;
    }

    setFormData(nextData);
  };

  const handleDurationChange = (value: string) => {
    const sanitizedValue = value.replace(',', '.');
    const nextData = { ...formData, duration: sanitizedValue };
    
    if (nextData.start) {
      const s = parseDateTime(nextData.start);
      if (s && !isNaN(s.getTime())) {
        const days = parseFloat(sanitizedValue);
        if (!isNaN(days) && days >= 0) {
          const f = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
          nextData.finish = formatToDatetimeLocal(f);

          if (!task?.baselineFinish && !formData.baselineFinish && nextData.finish) {
            nextData.baselineFinish = nextData.finish;
          }
        }
      }
    }
    setFormData(nextData);
  };

  const toggleDurationManual = () => {
    setFormData(prev => ({ ...prev, durationManual: !prev.durationManual }));
  };

  return {
    formData,
    setFormData,
    dateErrors,
    setDateErrors,
    nameRef,
    currentProject,
    resolvedPredecessors,
    handlePredecessorChange,
    handleApplyPredecessorDates,
    handleDateChange,
    handleDurationChange,
    toggleDurationManual
  };
}
