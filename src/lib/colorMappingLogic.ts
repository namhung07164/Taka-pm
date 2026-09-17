import { Project } from "../types";
import { getStatus } from "./utils";

export const STATUS_COLORS = {
  "Canceled": "rgba(148, 163, 184, 0.75)", // slate-400
  "Upcoming": "rgba(203, 213, 225, 0.6)",  // slate-300
  "On process": "rgba(245, 158, 11, 0.75)",// amber-500
  "Handover": "rgba(56, 189, 248, 0.75)",  // sky-400
  "Completed": "rgba(16, 185, 129, 0.75)", // emerald-500
  "Default": "rgba(148, 163, 184, 0.1)"    // transparent slate
};

const STATUS_PRIORITY = {
  "On process": 5,
  "Handover": 4,
  "Upcoming": 3,
  "Completed": 2,
  "Canceled": 1,
  "Default": 0
};

export function computeColorMap(projects: Project[]): Record<string, string> {
  const colorMap: Record<string, string> = {};
  const currentPriority: Record<string, number> = {};

  for (const p of projects) {
    if (!p.code) continue;
    
    // Project code might contain multiple units like "L1-01, L1-02"
    const unitNames = String(p.code).split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
    const status = getStatus(p.start, p.handover, p.opening, p.code);
    const priority = STATUS_PRIORITY[status as keyof typeof STATUS_PRIORITY] || 0;
    
    for (const unitName of unitNames) {
      if (!currentPriority[unitName] || priority > currentPriority[unitName]) {
        currentPriority[unitName] = priority;
        colorMap[unitName] = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS["Default"];
      }
    }
  }

  return colorMap;
}
