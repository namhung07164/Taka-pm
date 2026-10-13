import React, { useCallback, useState } from 'react';
import { Project, Task } from '../../types';

interface UseDetailSubTaskSortParams {
  tasks: Task[];
  filteredProjects: Project[];
  activeProjectInView: Project | null;
  handleSortSubTasks: (p: Project, groupTasks: Task[]) => Promise<void>;
}

export function useDetailSubTaskSort({
  tasks,
  filteredProjects,
  activeProjectInView,
  handleSortSubTasks,
}: UseDetailSubTaskSortParams) {
  const [isSortingSubTasks, setIsSortingSubTasks] = useState(false);

  const handleSortActiveOrAll = useCallback(async () => {
    setIsSortingSubTasks(true);
    try {
      if (activeProjectInView) {
        const projTasks = tasks.filter(t => 
          (activeProjectInView.id && t.projectId ? t.projectId === activeProjectInView.id : false) ||
          (t.projectCode && String(t.projectCode).trim().toLowerCase() === String(activeProjectInView.code).trim().toLowerCase())
        );
        await handleSortSubTasks(activeProjectInView, projTasks);
      } else if (filteredProjects && filteredProjects.length > 0) {
        for (const p of filteredProjects) {
          const projTasks = tasks.filter(t => 
            (p.id && t.projectId ? t.projectId === p.id : false) ||
            (t.projectCode && String(t.projectCode).trim().toLowerCase() === String(p.code).trim().toLowerCase())
          );
          if (projTasks.length > 0) {
            await handleSortSubTasks(p, projTasks);
          }
        }
      }
    } catch (err) {
      console.error("Error sorting subtasks:", err);
    } finally {
      setIsSortingSubTasks(false);
    }
  }, [activeProjectInView, filteredProjects, tasks, handleSortSubTasks]);

  return {
    isSortingSubTasks,
    handleSortActiveOrAll,
  };
}
