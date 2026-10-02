import React from 'react';
import { DependencyLine } from './ganttTypes';

export interface GanttDependencyLinksProps {
  dependencyLines: DependencyLine[];
}

export const GanttDependencyLinks: React.FC<GanttDependencyLinksProps> = React.memo(({
  dependencyLines
}) => {
  if (dependencyLines.length === 0) return null;

  return (
    <svg className="absolute inset-0 pointer-events-none z-[15] overflow-visible print:hidden" width="100%" height="100%">
      <defs>
        <marker
          id="arrowhead"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 6 3, 0 6" fill="#1d4ed8" />
        </marker>
      </defs>
      {dependencyLines.map((line, idx) => (
        <path
          key={line.id || `dep-${idx}`}
          d={line.d}
          fill="none"
          stroke={line.color || "#1d4ed8"}
          strokeWidth="1.5"
          markerEnd="url(#arrowhead)"
          className={line.isAnimated ? "opacity-90 animate-pulse" : "opacity-70"}
        />
      ))}
    </svg>
  );
});

GanttDependencyLinks.displayName = 'GanttDependencyLinks';
