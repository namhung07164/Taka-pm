import React, { useState } from "react";
import { Project, DelegationGroup, AppUser } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { getStatus, formatDisplayDateMain } from '../../lib/utils';

interface UseGeneralGoogleSyncParams {
  currentUser: AppUser;
  projects: Project[];
  delegationGroups: DelegationGroup[];
}

export function useGeneralGoogleSync({
  currentUser,
  projects,
  delegationGroups
}: UseGeneralGoogleSyncParams) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleGoogleSync = async () => {
    if (currentUser.role !== 'admin') return;
    if (!useAppStore.getState().isDelegationsRequested) {
      useAppStore.getState().setIsDelegationsRequested(true);
    }
    const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwPAZcZ8wGQ1CVPYn_5h4arJ2dqX7T9rpWPMAmEuc3Q2G4BB7l59Mbxb8Ep0aQE6GA1/exec';
    
    setIsSyncing(true);
    
    const projectsData = projects.map(p => {
      const pYear = p.year ? String(p.year) : (p.computedTakStart ? String(p.computedTakStart).substring(0, 4) : '');
      const status = getStatus(p.computedTakStart, p.computedTakCompl, p.computedOpening || p.opening, p.code);
      
      const projectDelegations = delegationGroups.filter(g => g.projectCode === p.code);
      let delegationTaskStr = '';
      if (projectDelegations.length > 0) {
        delegationTaskStr = projectDelegations.map(g => {
          let st = g.subTasks?.[0]?.delegationStatus || g.subTasks?.[0]?.status || 'Assigned';
          if (st === 'Accepted') st = 'On process';
          return `${g.name} (${st})`;
        }).join('; ');
      }
      
      const now = new Date();
      let activeTaskNames: string[] = [];
      if (p.taskSummaries) {
        const activeTasks = p.taskSummaries.filter(t => {
          if (!t.start || !t.finish) return false;
          const start = new Date(t.start);
          const finish = new Date(t.finish);
          return now >= start && now <= finish;
        });
        activeTaskNames = activeTasks.map(t => t.name);
      }
      let taskLines: string[] = [];
      activeTaskNames.forEach(name => {
        taskLines.push(...name.split('\n').filter((l: string) => l.trim() !== ''));
      });
      let detailString = taskLines.length > 0 ? taskLines.join('\n') : (p.detail || '');
      
      return {
        projectId: p.id || p.no, // Unique ID for upsert
        year: pYear,
        store: p.store || '',
        location: p.location || '',
        code: p.code || '',
        linkCodes: p.linkCodes || p.code || '',
        projectName: p.name || '',
        status: status,
        detail: detailString,
        startPlan: p.computedTakStart ? formatDisplayDateMain(p.computedTakStart) : '',
        finishPlan: p.computedTakCompl ? formatDisplayDateMain(p.computedTakCompl) : '',
        delegationTask: delegationTaskStr
      };
    });

    try {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'upsert', projects: projectsData })
      });
      
      useAppStore.getState().setToast({ title: "Notice", message: "Sent project sync request to Google Sheets!" });
    } catch(err) {
      console.error(err);
      useAppStore.getState().setToast({ title: "Error", message: (err instanceof Error ? err.message : String(err)) });
    } finally {
      setIsSyncing(false);
    }
  };

  return {
    isSyncing,
    handleGoogleSync
  };
}
