import { StateCreator } from "zustand";
import { Task, Cost, Project } from "../../types";
import { AppState, OptimisticSlice } from "../storeTypes";
import { deduplicateTasksInMemory } from "../../lib/taskDeduplicationService";
import { rollupParentTaskDatesAndStatus } from "../../lib/taskRollupService";
import {
  bulkPersistProjects,
  bulkPersistTasks,
  bulkPersistCosts,
  deleteLocalRecord,
} from "../../lib/localDb";

export const createOptimisticSlice: StateCreator<AppState, [], [], OptimisticSlice> = (set) => ({
  optimisticUpdateTasks: (updatedTasks) => set((state) => {
    if (!updatedTasks || updatedTasks.length === 0) return state;
    const sanitizedUpdates = updatedTasks.map((ut) => {
      if (!ut || typeof ut !== "object") return ut;
      if (!("_isVirtualSummary" in ut)) return ut;
      const copy: any = { ...ut };
      delete copy._isVirtualSummary;
      return copy as Partial<Task> & { id: string };
    });
    const updatedMap = new Map(sanitizedUpdates.map(t => [t.id, t]));
    const existingIds = new Set(state.tasks.map(t => t.id));
    let hasIdentityOrNameChange = false;
    
    const mapped = state.tasks
      .map(t => {
        const update = updatedMap.get(t.id);
        if (update) {
          if ((update as any).isDeleted) return null;
          if (
            (update.name !== undefined && update.name !== t.name) ||
            (update.taskCodePhu !== undefined && update.taskCodePhu !== t.taskCodePhu) ||
            (update.projectCode !== undefined && update.projectCode !== t.projectCode)
          ) {
            hasIdentityOrNameChange = true;
          }
          const merged: any = { ...t, ...update };
          delete merged._isVirtualSummary;
          return merged as Task;
        }
        return t;
      })
      .filter((t): t is Task => t !== null);

    const newTasks = sanitizedUpdates.filter(
      t => t.id && !existingIds.has(t.id) && !(t as any).isDeleted
    ) as Task[];

    let finalTasks: Task[];
    if (newTasks.length === 0 && !hasIdentityOrNameChange) {
      finalTasks = rollupParentTaskDatesAndStatus(mapped, state.delegationGroups);
    } else {
      const combined = newTasks.length > 0 ? [...mapped, ...newTasks] : mapped;
      const { dedupedTasks } = deduplicateTasksInMemory(combined, state.projects);
      finalTasks = rollupParentTaskDatesAndStatus(dedupedTasks, state.delegationGroups);
    }

    const touchedProjectIds = new Set<string>();
    const touchedIds = new Set<string>();
    updatedTasks.forEach((ut) => {
      if (ut.id) touchedIds.add(String(ut.id));
      if (ut.projectId) touchedProjectIds.add(String(ut.projectId));
    });
    const toPersist = finalTasks.filter(
      (ft) =>
        ft.id &&
        (touchedIds.has(String(ft.id)) ||
          (ft.isModularParent && ft.projectId && touchedProjectIds.has(String(ft.projectId))))
    );
    if (toPersist.length > 0) {
      setTimeout(() => {
        bulkPersistTasks(toPersist).catch(() => {});
      }, 0);
    }

    return { tasks: finalTasks };
  }),

  optimisticDeleteTasks: (taskIds) => set((state) => {
    if (!taskIds || taskIds.length === 0) return state;
    const idSet = new Set(taskIds.map(String));
    setTimeout(() => {
      idSet.forEach((id) => {
        deleteLocalRecord("taka_tasks", id).catch(() => {});
      });
    }, 0);
    const remaining = state.tasks.filter(t => !idSet.has(String(t.id)));
    return {
      tasks: rollupParentTaskDatesAndStatus(remaining, state.delegationGroups)
    };
  }),

  optimisticUpdateCosts: (updatedCosts) => set((state) => {
    if (!updatedCosts || updatedCosts.length === 0) return state;
    const updatedMap = new Map(updatedCosts.map(c => [c.id, c]));
    const existingIds = new Set(state.costs.map(c => c.id));
    const toPersist: Cost[] = [];

    const mapped = state.costs
      .map(c => {
        const update = updatedMap.get(c.id);
        if (update) {
          if ((update as any).isDeleted) return null;
          const merged = { ...c, ...update } as Cost;
          toPersist.push(merged);
          return merged;
        }
        return c;
      })
      .filter((c): c is Cost => c !== null);

    const newCosts = updatedCosts.filter(
      c => c.id && !existingIds.has(c.id) && !(c as any).isDeleted
    ) as Cost[];
    toPersist.push(...newCosts);

    if (toPersist.length > 0) {
      setTimeout(() => {
        bulkPersistCosts(toPersist).catch(() => {});
      }, 0);
    }

    return {
      costs: newCosts.length > 0 ? [...mapped, ...newCosts] : mapped
    };
  }),

  optimisticDeleteCosts: (costIds) => set((state) => {
    if (!costIds || costIds.length === 0) return state;
    const idSet = new Set(costIds);
    setTimeout(() => {
      idSet.forEach((id) => {
        deleteLocalRecord("taka_costs", String(id)).catch(() => {});
      });
    }, 0);
    return {
      costs: state.costs.filter(c => !idSet.has(c.id))
    };
  }),

  optimisticUpdateProjects: (updatedProjects) => set((state) => {
    if (!updatedProjects || updatedProjects.length === 0) return state;
    const updatedMap = new Map(updatedProjects.map(p => [p.id, p]));
    const existingIds = new Set(state.projects.map(p => p.id));
    const toPersist: Project[] = [];

    const mapped = state.projects
      .map(p => {
        const update = updatedMap.get(p.id);
        if (update) {
          if ((update as any).isDeleted) return null;
          const merged = { ...p, ...update } as Project;
          toPersist.push(merged);
          return merged;
        }
        return p;
      })
      .filter((p): p is Project => p !== null);

    const newProjects = updatedProjects.filter(
      p => p.id && !existingIds.has(p.id) && !(p as any).isDeleted
    ) as Project[];
    toPersist.push(...newProjects);

    if (toPersist.length > 0) {
      setTimeout(() => {
        bulkPersistProjects(toPersist).catch(() => {});
      }, 0);
    }

    return {
      projects: newProjects.length > 0 ? [...mapped, ...newProjects] : mapped
    };
  }),

  optimisticDeleteProjects: (projectIds) => set((state) => {
    if (!projectIds || projectIds.length === 0) return state;
    const idSet = new Set(projectIds);
    setTimeout(() => {
      idSet.forEach((id) => {
        deleteLocalRecord("taka_projects", String(id)).catch(() => {});
      });
    }, 0);
    return {
      projects: state.projects.filter(p => !idSet.has(p.id))
    };
  }),

  optimisticUpdateProjectFinancial: (projectId, updates) => set((state) => {
    let persistedProj: Project | null = null;
    const nextProjects = state.projects.map(p => {
      if (p.id === projectId) {
        const newFin = JSON.parse(JSON.stringify(p.financial || {}));
        
        for (const [key, value] of Object.entries(updates)) {
          if (key.startsWith('financial.')) {
            const parts = key.split('.');
            parts.shift(); // remove 'financial'
            let current = newFin;
            for (let i = 0; i < parts.length - 1; i++) {
              if (!current[parts[i]]) current[parts[i]] = {};
              current = current[parts[i]];
            }
            const lastPart = parts[parts.length - 1];
            current[lastPart] = (current[lastPart] || 0) + (value as number);
          }
        }
        persistedProj = { ...p, financial: newFin };
        return persistedProj;
      }
      return p;
    });
    if (persistedProj) {
      const targetProj = persistedProj;
      setTimeout(() => {
        bulkPersistProjects([targetProj]).catch(() => {});
      }, 0);
    }
    return { projects: nextProjects };
  }),

  rollbackProjectFinancial: (projectId, oldFinancial) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId ? { ...p, financial: oldFinancial } : p
    )
  })),
});
