import React, { useState, useEffect, useRef } from "react";
import { DependencyLine } from './ganttTypes';

export interface GanttDependencyLinksProps {
  dependencyLines: DependencyLine[];
}

export const GanttDependencyLinks: React.FC<GanttDependencyLinksProps> = React.memo(({
  dependencyLines
}) => {
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const mouseRafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (mouseRafRef.current !== null) {
        cancelAnimationFrame(mouseRafRef.current);
      }
    };
  }, []);

  if (dependencyLines.length === 0) return null;

  const activeLine = dependencyLines.find(l => l.id === hoveredLineId);

  return (
    <>
      <svg className="absolute inset-0 pointer-events-none z-[15] overflow-visible print:hidden" width="100%" height="100%">
        <defs>
          <marker
            id="arrowhead-default"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 7 3.5, 0 7" fill="#2563eb" />
          </marker>
          <marker
            id="arrowhead-hover"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <polygon points="0 0, 8 4, 0 8" fill="#1d4ed8" />
          </marker>
          <filter id="gantt-dep-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000" floodOpacity="0.18" />
          </filter>
        </defs>

        {dependencyLines.map((line, idx) => {
          const lineKey = line.id || `dep-${idx}`;
          const isHovered = hoveredLineId === lineKey;

          return (
            <g key={lineKey}>
              {/* Invisible wider hit target for easy mouse hover */}
              <path
                d={line.d}
                fill="none"
                stroke="transparent"
                strokeWidth="12"
                className="cursor-pointer pointer-events-auto"
                onMouseEnter={(e) => {
                  setHoveredLineId(lineKey);
                  setMousePos({ x: e.clientX, y: e.clientY });
                }}
                onMouseMove={(e) => {
                  const clientX = e.clientX;
                  const clientY = e.clientY;
                  if (mouseRafRef.current === null) {
                    mouseRafRef.current = requestAnimationFrame(() => {
                      setMousePos({ x: clientX, y: clientY });
                      mouseRafRef.current = null;
                    });
                  }
                }}
                onMouseLeave={() => {
                  if (mouseRafRef.current !== null) {
                    cancelAnimationFrame(mouseRafRef.current);
                    mouseRafRef.current = null;
                  }
                  setHoveredLineId(null);
                  setMousePos(null);
                }}
              />

              {/* Visible rendered path */}
              <path
                d={line.d}
                fill="none"
                stroke={isHovered ? "#1d4ed8" : (line.color || "#2563eb")}
                strokeWidth={isHovered ? "2.5" : "1.75"}
                strokeDasharray={line.isAnimated ? "4 2" : undefined}
                markerEnd={isHovered ? "url(#arrowhead-hover)" : "url(#arrowhead-default)"}
                filter="url(#gantt-dep-shadow)"
                className={`transition-all duration-150 ${isHovered ? "opacity-100" : "opacity-80 hover:opacity-100"}`}
              />
            </g>
          );
        })}
      </svg>

      {/* Floating Hover Tooltip */}
      {activeLine && mousePos && (
        <div
          className="fixed z-50 pointer-events-none bg-slate-900/95 dark:bg-slate-800/95 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-xl border border-slate-700 backdrop-blur-md flex items-center gap-2 transform -translate-x-1/2 -translate-y-full mb-2 transition-opacity duration-150 font-sans"
          style={{ left: mousePos.x, top: mousePos.y - 8 }}
        >
          <div className="flex items-center gap-1.5 font-semibold text-blue-300">
            <span className="font-mono bg-blue-900/60 px-1 py-0.5 rounded text-[10px] text-blue-200 uppercase font-extrabold">
              {activeLine.fromTaskCode || 'Task'}
            </span>
            <span className="max-w-[140px] truncate text-slate-200">
              {activeLine.fromTaskName || 'Predecessor'}
            </span>
          </div>

          <span className="text-slate-400 font-bold">➔</span>

          <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
            <span className="font-mono bg-emerald-900/60 px-1 py-0.5 rounded text-[10px] text-emerald-200 uppercase font-extrabold">
              {activeLine.toTaskCode || 'Task'}
            </span>
            <span className="max-w-[140px] truncate text-slate-200">
              {activeLine.toTaskName || 'Successor'}
            </span>
          </div>
        </div>
      )}
    </>
  );
});

GanttDependencyLinks.displayName = 'GanttDependencyLinks';
