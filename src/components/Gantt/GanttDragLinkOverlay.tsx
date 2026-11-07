import React from 'react';
import { Link2, AlertTriangle, Zap } from 'lucide-react';
import { useGanttLinkDragState } from './useGanttLinkDrag';
import { cn } from '../../lib/utils';

const REL_LABELS: Record<string, string> = {
  FS: 'FS · Finish ➔ Start',
  SS: 'SS · Start ➔ Start',
  FF: 'FF · Finish ➔ Finish',
  SF: 'SF · Start ➔ Finish',
};

export const GanttDragLinkOverlay: React.FC = React.memo(function GanttDragLinkOverlay() {
  const dragState = useGanttLinkDragState();

  if (!dragState) return null;

  const { startX, startY, currentX, currentY, sourceCode, sourceAnchor, target } = dragState;
  const endX = target ? target.snapX : currentX;
  const endY = target ? target.snapY : currentY;

  const dx = endX - startX;
  const dirStart = sourceAnchor === 'end' ? 1 : -1;
  const dirEnd = target ? (target.anchor === 'start' ? -1 : 1) : dx >= 0 ? -1 : 1;
  const curveTension = Math.max(36, Math.min(140, Math.abs(dx) * 0.45));

  const cp1x = startX + dirStart * curveTension;
  const cp1y = startY;
  const cp2x = endX + dirEnd * curveTension;
  const cp2y = endY;

  const pathData = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;

  const strokeColor = !target
    ? '#3b82f6'
    : target.isCyclic
    ? '#ef4444'
    : '#10b981';

  return (
    <div className="fixed inset-0 pointer-events-none z-[99998] overflow-hidden select-none">
      <svg className="w-full h-full">
        <defs>
          <marker
            id="gantt-drag-link-arrow-valid"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#10b981" />
          </marker>
          <marker
            id="gantt-drag-link-arrow-active"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#3b82f6" />
          </marker>
          <marker
            id="gantt-drag-link-arrow-error"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#ef4444" />
          </marker>
        </defs>

        {/* Soft Glow Behind Connector Line */}
        <path
          d={pathData}
          fill="none"
          stroke={strokeColor}
          strokeWidth={6}
          strokeOpacity={0.22}
          strokeLinecap="round"
        />

        {/* Animated Dashed Connector Line */}
        <path
          d={pathData}
          fill="none"
          stroke={strokeColor}
          strokeWidth={2.5}
          strokeDasharray={target && !target.isCyclic ? 'none' : '6 4'}
          strokeLinecap="round"
          markerEnd={
            !target
              ? 'url(#gantt-drag-link-arrow-active)'
              : target.isCyclic
              ? 'url(#gantt-drag-link-arrow-error)'
              : 'url(#gantt-drag-link-arrow-valid)'
          }
        />

        {/* Source Anchor Ring */}
        <circle
          cx={startX}
          cy={startY}
          r={5}
          fill={strokeColor}
          stroke="#ffffff"
          strokeWidth={2}
        />

        {/* Target Anchor Snap Ring */}
        {target && (
          <circle
            cx={endX}
            cy={endY}
            r={6.5}
            fill={target.isCyclic ? '#ef4444' : '#10b981'}
            stroke="#ffffff"
            strokeWidth={2}
          />
        )}
      </svg>

      {/* Target Bar Highlight Outline */}
      {target && (
        <div
          className={cn(
            'fixed rounded-md transition-all duration-75 pointer-events-none',
            target.isCyclic
              ? 'ring-2 ring-red-500 bg-red-500/15 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
              : 'ring-2 ring-emerald-400 bg-emerald-400/15 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
          )}
          style={{
            left: `${target.barRect.left - 2}px`,
            top: `${target.barRect.top - 2}px`,
            width: `${target.barRect.width + 4}px`,
            height: `${target.barRect.height + 4}px`,
          }}
        />
      )}

      {/* Floating HUD Badge Near Cursor */}
      <div
        className={cn(
          'fixed px-3 py-1.5 rounded-full shadow-2xl border backdrop-blur-md flex items-center gap-2 text-xs font-mono transition-colors',
          !target
            ? 'bg-slate-900/95 text-white border-blue-400/60'
            : target.isCyclic
            ? 'bg-red-950/95 text-red-100 border-red-400'
            : 'bg-slate-900/95 text-white border-emerald-400'
        )}
        style={{
          left: `${Math.min(window.innerWidth - 280, Math.max(12, currentX + 16))}px`,
          top: `${Math.max(12, currentY - 42)}px`,
        }}
      >
        {!target ? (
          <>
            <Link2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="font-bold text-blue-300">
              {sourceCode} ({sourceAnchor === 'end' ? 'Finish' : 'Start'})
            </span>
            <span className="text-slate-400">➔ Drop on target task anchor</span>
          </>
        ) : target.isCyclic ? (
          <>
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span className="font-bold text-red-200">
              {sourceCode} ➔ {target.taskCode}
            </span>
            <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full font-bold">
              Circular Dependency!
            </span>
          </>
        ) : (
          <>
            <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-bold text-emerald-300">{sourceCode}</span>
            <span className="text-slate-400">➔</span>
            <span className="font-bold text-white">{target.taskCode}</span>
            <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold">
              {REL_LABELS[target.relType] || target.relType}
            </span>
          </>
        )}
      </div>
    </div>
  );
});
