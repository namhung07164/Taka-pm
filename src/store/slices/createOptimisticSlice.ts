import { StateCreator } from "zustand";
import { Task, Cost, Project } from "../../types";
import { AppState, OptimisticSlice } from "../storeTypes";

export const createOptimisticSlice: StateCreator<AppState, [], [], OptimisticSlice> = (set) => ({
  optimisticUpdateTasks: (updatedTasks) => set((state) => {
    const updatedMap = new Map(updatedTasks.map(t => [t.id, t]));
    return {
      tasks: state.tasks.map(t => {
        const update = updatedMap.get(t.id);
        if (update) {
          return { ...t, ...update } as Task;
        }
        return t;
      })
    };
  }),

  optimisticUpdateCosts: (updatedCosts) => set((state) => {
    const updatedMap = new Map(updatedCosts.map(c => [c.id, c]));
    return {
      costs: state.costs.map(c => {
        const update = updatedMap.get(c.id);
        if (update) {
          return { ...c, ...update } as Cost;
        }
        return c;
      })
    };
  }),

  optimisticUpdateProjects: (updatedProjects) => set((state) => {
    const updatedMap = new Map(updatedProjects.map(p => [p.id, p]));
    return {
      projects: state.projects.map(p => {
        const update = updatedMap.get(p.id);
        if (update) {
          return { ...p, ...update } as Project;
        }
        return p;
      })
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
