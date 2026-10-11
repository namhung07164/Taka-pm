import { StateCreator } from "zustand";
import { Task, Cost, Project } from "../../types";
import { AppState, OptimisticSlice } from "../storeTypes";
import { deduplicateTasksInMemory } from "../../lib/taskDeduplicationService";

export const createOptimisticSlice: StateCreator<AppState, [], [], OptimisticSlice> = (set) => ({
  optimisticUpdateTasks: (updatedTasks) => set((state) => {
    if (!updatedTasks || updatedTasks.length === 0) return state;
    const updatedMap = new Map(updatedTasks.map(t => [t.id, t]));
    const existingIds = new Set(state.tasks.map(t => t.id));
    
    const mapped = state.tasks
      .map(t => {
        const update = updatedMap.get(t.id);
        if (update) {
          if ((update as any).isDeleted) return null;
          return { ...t, ...update } as Task;
        }
        return t;
      })
      .filter((t): t is Task => t !== null);

    const newTasks = updatedTasks.filter(
      t => t.id && !existingIds.has(t.id) && !(t as any).isDeleted
    ) as Task[];

    const combined = newTasks.length > 0 ? [...mapped, ...newTasks] : mapped;
    const { dedupedTasks } = deduplicateTasksInMemory(combined, state.projects);

    return {
      tasks: dedupedTasks
    };
  }),

  optimisticDeleteTasks: (taskIds) => set((state) => {
    if (!taskIds || taskIds.length === 0) return state;
    const idSet = new Set(taskIds.map(String));
    return {
      tasks: state.tasks.filter(t => !idSet.has(String(t.id)))
    };
  }),

  optimisticUpdateCosts: (updatedCosts) => set((state) => {
    if (!updatedCosts || updatedCosts.length === 0) return state;
    const updatedMap = new Map(updatedCosts.map(c => [c.id, c]));
    const existingIds = new Set(state.costs.map(c => c.id));

    const mapped = state.costs
      .map(c => {
        const update = updatedMap.get(c.id);
        if (update) {
          if ((update as any).isDeleted) return null;
          return { ...c, ...update } as Cost;
        }
        return c;
      })
      .filter((c): c is Cost => c !== null);

    const newCosts = updatedCosts.filter(
      c => c.id && !existingIds.has(c.id) && !(c as any).isDeleted
    ) as Cost[];

    return {
      costs: newCosts.length > 0 ? [...mapped, ...newCosts] : mapped
    };
  }),

  optimisticDeleteCosts: (costIds) => set((state) => {
    if (!costIds || costIds.length === 0) return state;
    const idSet = new Set(costIds);
    return {
      costs: state.costs.filter(c => !idSet.has(c.id))
    };
  }),

  optimisticUpdateProjects: (updatedProjects) => set((state) => {
    if (!updatedProjects || updatedProjects.length === 0) return state;
    const updatedMap = new Map(updatedProjects.map(p => [p.id, p]));
    const existingIds = new Set(state.projects.map(p => p.id));

    const mapped = state.projects
      .map(p => {
        const update = updatedMap.get(p.id);
        if (update) {
          if ((update as any).isDeleted) return null;
          return { ...p, ...update } as Project;
        }
        return p;
      })
      .filter((p): p is Project => p !== null);

    const newProjects = updatedProjects.filter(
      p => p.id && !existingIds.has(p.id) && !(p as any).isDeleted
    ) as Project[];

    return {
      projects: newProjects.length > 0 ? [...mapped, ...newProjects] : mapped
    };
  }),

  optimisticDeleteProjects: (projectIds) => set((state) => {
    if (!projectIds || projectIds.length === 0) return state;
    const idSet = new Set(projectIds);
    return {
      projects: state.projects.filter(p => !idSet.has(p.id))
    };
  }),

  optimisticUpdateProjectFinancial: (projectId, updates) => set((state) => {
    return {
      projects: state.projects.map(p => {
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
          return { ...p, financial: newFin };
        }
        return p;
      })
    };
  }),

  rollbackProjectFinancial: (projectId, oldFinancial) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId ? { ...p, financial: oldFinancial } : p
    )
  })),
});
