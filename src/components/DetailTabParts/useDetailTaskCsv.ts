import React from 'react';
import { Project, Task, AppUser } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { downloadCSV, generateCSV } from '../../lib/csvUtils';
import { sortGroupTasks } from '../../lib/ganttUtils';
import { formatToCSVDate, parseCSVDate } from './detailCsvUtils';
import { parseTasksFile } from './detailTaskImportParser';
import { executeImportTasks } from './detailTaskImportExecutor';

interface UseDetailTaskCsvParams {
  filteredProjects: Project[];
  projects: Project[];
  tasks: Task[];
  appUsers: AppUser[];
  currentUser: AppUser;
}

export function useDetailTaskCsv({
  filteredProjects,
  projects,
  tasks,
  appUsers,
  currentUser,
}: UseDetailTaskCsvParams) {
  const handleExportTasks = () => {
    const headers = [
      'store',
      'location',
      'projectYear',
      'projectCode',
      'Sub-task code',
      'Task name',
      'Parent task code',
      'start',
      'finish',
      'duration',
      'party',
      'predecessor',
      'delegation',
      'task flexible',
      'comments'
    ];

    const filteredTasksToExport: Task[] = [];
    filteredProjects.forEach(p => {
      const groupTasks = sortGroupTasks(tasks.filter(t => 
        t.projectCode === p.code && 
        (t.projectYear == p.year || (!t.projectYear && !p.year)) &&
        (t.projectStore == p.store || (!t.projectStore && !p.store))
      ));
      filteredTasksToExport.push(...groupTasks);
    });

    const data = filteredTasksToExport.map((t, idx) => {
      const p = projects.find(proj => 
        proj.code === t.projectCode && 
        (t.projectYear == proj.year || (!t.projectYear && !proj.year)) &&
        (t.projectStore == proj.store || (!t.projectStore && !proj.store))
      );
      const subTaskCode = t.taskCodePhu || (p ? `${p.code}#${t.orderIndex !== undefined ? t.orderIndex + 1 : idx + 1}` : '');
      const parentTask = t.parentTaskId ? tasks.find(pt => String(pt.id) === String(t.parentTaskId)) : null;

      const commentsText = t.comments && t.comments.length > 0 
        ? t.comments.map(c => {
            const author = appUsers.find(u => 
              u.id === c.userId || 
              (u.username && String(u.username).toLowerCase() === String(c.userId).toLowerCase())
            );
            const name = c.userName || author?.username || c.userId || '';
            return `${name ? name + ': ' : ''}${c.text}`;
          }).join(' | ') 
        : '';

      return [
        t.projectStore || p?.store || '',
        p?.location || '',
        t.projectYear || p?.year || '',
        t.projectCode || '', 
        subTaskCode,
        t.name || '', 
        parentTask ? (parentTask.taskCodePhu || parentTask.name || '') : '',
        formatToCSVDate(t.start), 
        formatToCSVDate(t.finish), 
        t.duration !== undefined ? t.duration : '',
        t.party || '',
        t.predecessor || '',
        t.delegation ? 'true' : 'false',
        t.realtimeUpdate ? 'true' : 'false',
        commentsText
      ];
    });

    const csv = generateCSV(headers, data);
    downloadCSV(csv, 'taka_tasks_filtered.csv');
  };

  const handleImportTasks = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const rawParsedRowsByProject = await parseTasksFile(file, projects);
      const { count } = await executeImportTasks({
        rawParsedRowsByProject,
        projects,
        tasks,
        appUsers,
        currentUser
      });

      useAppStore.getState().setToast({
        title: "Success",
        message: `Import Tasks completed! Processed ${count} tasks without duplicates.`
      });
    } catch (err: any) {
      console.error("Import error:", err);
      useAppStore.getState().setToast({
        title: "Notice",
        message: "Failed to import file: " + (err?.message || "File processing error"),
        type: "error"
      });
    } finally {
      e.target.value = '';
    }
  };

  return {
    handleExportTasks,
    handleImportTasks,
    parseCSVDate,
    formatToCSVDate,
  };
}
