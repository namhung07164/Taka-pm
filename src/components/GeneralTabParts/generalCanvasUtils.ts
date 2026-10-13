import React, { Dispatch, SetStateAction } from 'react';
import { Project } from '../../types';
import { getStatus, formatDisplayDateMain, computePlanProgressFromSummaries, computeActProgressFromSummaries } from '../../lib/utils';
import { SortConfig } from './generalTypes';
import { useAppStore } from '../../store/useAppStore';

interface DrawGeneralCanvasParams {
  canvas: HTMLCanvasElement;
  wrapper: HTMLDivElement;
  paginatedProjects: Project[];
  pinnedProjects: string[];
  sortConfig: SortConfig | null;
  theme: string;
  flashToggle: boolean;
  t: (key: string) => string;
}

export function drawGeneralCanvas({
  canvas,
  wrapper,
  paginatedProjects,
  pinnedProjects,
  sortConfig,
  theme,
  flashToggle,
  t
}: DrawGeneralCanvasParams) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rowHeight = 70;
  const headerHeight = 60;
  const baseWidths = [100, 75, 80, 140, 210, 125, 210, 105, 105, 105];
  const logicalWidth = Math.max(wrapper.clientWidth, 1280);
  const totalBase = baseWidths.reduce((a, b) => a + b, 0);
  const scale = logicalWidth / totalBase;
  const colWidths = baseWidths.map(w => w * scale);
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const totalHeight = Math.max(headerHeight + paginatedProjects.length * rowHeight + 30, wrapper.clientHeight);

  canvas.width = totalWidth * dpr;
  canvas.height = totalHeight * dpr;
  canvas.style.width = totalWidth + 'px';
  canvas.style.height = totalHeight + 'px';

  ctx.scale(dpr, dpr);

  const isDark = theme === 'dark' || (typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  ctx.fillStyle = isDark ? '#1e1e20' : '#ffffff';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  const cols = [
    { label: t('Year'), key: 'year' },
    { label: t('Store'), key: 'store' },
    { label: t('Location'), key: 'location' },
    { label: t('Code'), key: 'code' },
    { label: t('Project'), key: 'name' },
    { label: t('Status'), key: 'status' },
    { label: t('Details'), key: 'detail' },
    { label: t('Pj Start'), key: 'start' },
    { label: t('Pj Compl'), key: 'handover' },
    { label: t('Opening'), key: 'opening' }
  ];

  const fontSans = 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const fontMono = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';

  paginatedProjects.forEach((item, i) => {
    const y = headerHeight + i * rowHeight;
    const status = getStatus(item.computedTakStart, item.computedTakCompl, item.computedOpening || item.opening, item.code);
    
    if (isDark) {
      ctx.fillStyle = (i % 2 === 0) ? '#18181b' : '#202025';
    } else {
      ctx.fillStyle = (i % 2 === 0) ? '#ffffff' : '#f8fafc';
    }
    ctx.fillRect(0, y, totalWidth, rowHeight);
    
    ctx.strokeStyle = isDark ? '#2a2a2e' : '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + rowHeight);
    ctx.lineTo(totalWidth, y + rowHeight);
    ctx.stroke();

    let colX = 0;
    cols.forEach((col, colIdx) => {
      const width = colWidths[colIdx];
      ctx.globalAlpha = (status === 'Canceled' && col.key !== 'status') ? 0.45 : 1.0;

      let text = String(item[col.key as keyof Project] || '');
      let progressPercent = 0;
      let actProgressPercent = 0;
      if (col.key === 'status') {
          progressPercent = (item.computedPlanProgress && item.computedPlanProgress > 0)
            ? item.computedPlanProgress
            : (item.taskSummaries && item.taskSummaries.length > 0 ? computePlanProgressFromSummaries(item.taskSummaries) : (item.computedPlanProgress ?? 0));
          actProgressPercent = (item.computedActProgress && item.computedActProgress > 0)
            ? item.computedActProgress
            : (item.taskSummaries && item.taskSummaries.length > 0 ? computeActProgressFromSummaries(item.taskSummaries) : (item.computedActProgress ?? 0));
      }
      
      let activeTaskNames: string[] = [];
      if (col.key === 'detail' && item.taskSummaries) {
        const now = new Date();
        const activeTasks = item.taskSummaries.filter(t => {
          if (!t.start || !t.finish) return false;
          const start = new Date(t.start);
          const finish = new Date(t.finish);
          return now >= start && now <= finish;
        });
        activeTaskNames = activeTasks.map(t => t.name);
      }

      if (col.key === 'no') text = String(i + 1);
      if (col.key === 'status') text = status;
      if (col.key === 'start') text = formatDisplayDateMain(item.computedTakStart || item.start);
      else if (col.key === 'handover') text = formatDisplayDateMain(item.computedTakCompl || item.handover || (item as any).takCompl);
      else if (col.key === 'opening') text = formatDisplayDateMain(item.computedOpening || item.opening);

      let isFlashingRed = false;
      let isFlashingGreen = false;
      if (col.key === 'start' || col.key === 'handover' || col.key === 'opening') {
         let dateStr = '';
         if (col.key === 'start') dateStr = item.computedTakStart || item.start || '';
         else if (col.key === 'handover') dateStr = item.computedTakCompl || item.handover || (item as any).takCompl || '';
         else if (col.key === 'opening') dateStr = item.computedOpening || item.opening || '';
         
         if (dateStr && status !== 'Completed' && status !== 'Canceled') {
           const d = new Date(dateStr);
           if (!isNaN(d.getTime())) {
             const today = new Date();
             today.setHours(0, 0, 0, 0);
             const target = new Date(d);
             target.setHours(0, 0, 0, 0);
             const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
             
             if (diffDays <= 1) isFlashingRed = true;
             else if (diffDays <= 3) isFlashingGreen = true;
           }
         }
      }

      // Clip cell boundary to prevent text overflow into adjacent columns
      ctx.save();
      ctx.beginPath();
      ctx.rect(colX, y, width, rowHeight);
      ctx.clip();

      if (isFlashingRed && flashToggle) {
        ctx.fillStyle = isDark ? '#7f1d1d' : '#fee2e2';
        ctx.fillRect(colX + 2, y + 2, width - 4, rowHeight - 4);
        ctx.fillStyle = isDark ? '#fca5a5' : '#dc2626';
        ctx.font = `700 12.5px ${fontMono}`;
      } else if (isFlashingGreen && flashToggle) {
        ctx.fillStyle = isDark ? '#14532d' : '#dcfce7';
        ctx.fillRect(colX + 2, y + 2, width - 4, rowHeight - 4);
        ctx.fillStyle = isDark ? '#86efac' : '#16a34a';
        ctx.font = `700 12.5px ${fontMono}`;
      } else {
        if (col.key === 'code') {
           ctx.fillStyle = isDark ? '#93c5fd' : '#1d4ed8';
           ctx.font = `700 13px ${fontMono}`;
         }
        else if (col.key === 'store') {
          ctx.font = `700 13.5px ${fontSans}`;
          if (text.toLowerCase() === 'hcm') ctx.fillStyle = isDark ? '#60a5fa' : '#2563eb';
          else if (text.toLowerCase() === 'hn') ctx.fillStyle = isDark ? '#f87171' : '#dc2626';
          else ctx.fillStyle = isDark ? '#e2e8f0' : '#475569';
        }
        else if (col.key === 'name') {
           ctx.fillStyle = isDark ? '#ffffff' : '#0f172a';
           ctx.font = `700 13px ${fontSans}`;
         }
        else if (col.key === 'year') {
           const isPinned = item.id ? pinnedProjects.includes(item.id) : false;
           if (isPinned) {
              ctx.fillStyle = isDark ? '#60a5fa' : '#2563eb';
              ctx.font = `700 13.5px ${fontSans}`;
           } else {
              ctx.fillStyle = isDark ? '#e2e8f0' : '#334155';
              ctx.font = `600 13.5px ${fontSans}`;
           }
        }
        else if (col.key === 'location') {
           ctx.fillStyle = isDark ? '#cbd5e1' : '#334155';
           ctx.font = `600 13px ${fontSans}`;
         }
        else if (col.key === 'start' || col.key === 'handover' || col.key === 'opening') {
          ctx.fillStyle = isDark ? '#f1f5f9' : '#1e293b';
          ctx.font = `600 12.5px ${fontMono}`;
        }
        else if (col.key === 'status') {
          ctx.font = `700 11px ${fontSans}`;
          if (text === 'Completed') ctx.fillStyle = isDark ? '#4ade80' : '#15803d';
          else if (text === 'Handover') ctx.fillStyle = isDark ? '#60a5fa' : '#1d4ed8';
          else if (text === 'On process') ctx.fillStyle = isDark ? '#fb923c' : '#c2410c';
          else if (text === 'Canceled') ctx.fillStyle = isDark ? '#f87171' : '#b91c1c';
          else ctx.fillStyle = isDark ? '#e2e8f0' : '#475569';
        } else {
           ctx.fillStyle = isDark ? '#e2e8f0' : '#334155';
           ctx.font = `500 13px ${fontSans}`;
         }
      }

      ctx.textBaseline = 'middle';
      if (col.key === 'no') {
        ctx.textAlign = 'center';
        ctx.fillText(text, colX + width / 2, y + rowHeight / 2);
        ctx.textAlign = 'left';
      } else if (col.key === 'start' || col.key === 'handover' || col.key === 'opening') {
        ctx.textAlign = 'center';
        ctx.fillText(text, colX + width / 2, y + rowHeight / 2);
        ctx.textAlign = 'left';
      } else if (col.key === 'detail') {
        ctx.textBaseline = 'top';
        let lineY = y + 12;
        
        let taskLines: string[] = [];
        activeTaskNames.forEach(name => {
          taskLines.push(...name.split('\n').filter((l: string) => l.trim() !== ''));
        });

        taskLines.forEach((taskName, tIdx) => {
          if (lineY > y + rowHeight - 14) return;
          if (tIdx % 3 === 0) ctx.fillStyle = isDark ? '#93c5fd' : '#1d4ed8';
          else if (tIdx % 3 === 1) ctx.fillStyle = isDark ? '#fdba74' : '#c2410c';
          else ctx.fillStyle = isDark ? '#a7f3d0' : '#047857';
          ctx.font = `600 12px ${fontSans}`;
          
          const words = taskName.split(' ');
          let line = '';
          for (let n = 0; n < words.length; n++) {
            let testLine = line + words[n] + ' ';
            if (ctx.measureText(testLine).width > width - 20 && n > 0) {
              ctx.fillText(line, colX + 10, lineY);
              line = words[n] + ' ';
              lineY += 15;
              if (lineY > y + rowHeight - 14) break;
            } else {
              line = testLine;
            }
          }
          if (lineY <= y + rowHeight - 14) {
            ctx.fillText(line, colX + 10, lineY);
            lineY += 15;
          }
        });
      } else if (col.key === 'status') {
        // Status Pill Badge
        const badgeWidth = Math.min(width - 16, 96);
        const badgeHeight = 20;
        const badgeX = colX + (width - badgeWidth) / 2;
        const badgeY = y + 8;
        
        let badgeBg = isDark ? '#27272a' : '#f1f5f9';
        let badgeText = isDark ? '#f8fafc' : '#0f172a';
        if (text === 'Completed') {
          badgeBg = isDark ? '#14532d' : '#dcfce7';
          badgeText = isDark ? '#4ade80' : '#15803d';
        } else if (text === 'Handover') {
          badgeBg = isDark ? '#1e3a8a' : '#dbeafe';
          badgeText = isDark ? '#60a5fa' : '#1d4ed8';
        } else if (text === 'On process') {
          badgeBg = isDark ? '#7c2d12' : '#ffedd5';
          badgeText = isDark ? '#fb923c' : '#c2410c';
        } else if (text === 'Canceled') {
          badgeBg = isDark ? '#7f1d1d' : '#fee2e2';
          badgeText = isDark ? '#f87171' : '#b91c1c';
        }
        
        ctx.fillStyle = badgeBg;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 5);
        else ctx.rect(badgeX, badgeY, badgeWidth, badgeHeight);
        ctx.fill();

        ctx.fillStyle = badgeText;
        ctx.font = `700 10.5px ${fontSans}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, colX + (width / 2), badgeY + badgeHeight / 2);

        // Plan & Act Progress bars with side-by-side percentage labels (no overlap)
        const barWidth = Math.max(width - 64, 45);
        const barHeight = 4;
        const barX = colX + 8;
        const textX = colX + width - 6;

        // Plan Progress Row
        const planY = badgeY + badgeHeight + 8;
        ctx.fillStyle = isDark ? '#27272a' : '#e2e8f0';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(barX, planY, barWidth, barHeight, 2);
        else ctx.rect(barX, planY, barWidth, barHeight);
        ctx.fill();

        if (progressPercent > 0) {
           ctx.fillStyle = isDark ? '#38bdf8' : '#2563eb';
           ctx.beginPath();
           if (ctx.roundRect) ctx.roundRect(barX, planY, Math.min(barWidth, barWidth * (progressPercent / 100)), barHeight, 2);
           else ctx.rect(barX, planY, Math.min(barWidth, barWidth * (progressPercent / 100)), barHeight);
           ctx.fill();
        }

        ctx.fillStyle = isDark ? '#38bdf8' : '#1d4ed8';
        ctx.font = `700 9.5px ${fontMono}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${progressPercent}% (P)`, textX, planY + 2);

        // Actual Progress Row (Only drawn if project delegation is green or has active delegations)
        const allStoreTasks = useAppStore.getState().tasks || [];
        const storeDelegationGroups = useAppStore.getState().delegationGroups || [];
        const projectTasks = allStoreTasks.filter(t => 
          (item.id && String(t.projectId) === String(item.id)) || 
          (item.code && t.projectCode === item.code)
        );
        const hasProjectDelegation = Boolean(
          (item as any).delegation ||
          (item as any).hasDelegation ||
          (projectTasks.length > 0 && projectTasks.some(t => Boolean(t.delegation))) ||
          (item.taskSummaries && item.taskSummaries.length > 0 && item.taskSummaries.some((ts: any) => Boolean(ts.delegation))) ||
          (storeDelegationGroups && storeDelegationGroups.some(g => 
            (item.code && g.projectCode === item.code) || 
            (item.id && (g as any).projectId === item.id) ||
            (projectTasks.some(t => t.id === g.parentTaskId))
          ))
        );

        if (hasProjectDelegation) {
          const actY = planY + 12;
          ctx.fillStyle = isDark ? '#27272a' : '#e2e8f0';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(barX, actY, barWidth, barHeight, 2);
          else ctx.rect(barX, actY, barWidth, barHeight);
          ctx.fill();

          if (actProgressPercent > 0) {
             ctx.fillStyle = isDark ? '#34d399' : '#10b981';
             ctx.beginPath();
             if (ctx.roundRect) ctx.roundRect(barX, actY, Math.min(barWidth, barWidth * (actProgressPercent / 100)), barHeight, 2);
             else ctx.rect(barX, actY, Math.min(barWidth, barWidth * (actProgressPercent / 100)), barHeight);
             ctx.fill();
          }

          ctx.fillStyle = isDark ? '#34d399' : '#047857';
          ctx.font = `700 9.5px ${fontMono}`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${actProgressPercent}% (A)`, textX, actY + 2);
        }
        ctx.textAlign = 'left';
      } else if (col.key === 'name') {
        ctx.textBaseline = 'top';
        const words = text.split(' ');
        let line = '';
        let lineY = y + 16;
        for (let n = 0; n < words.length; n++) {
          let testLine = line + words[n] + ' ';
          if (ctx.measureText(testLine).width > width - 20 && n > 0) {
            ctx.fillText(line, colX + 10, lineY);
            line = words[n] + ' ';
            lineY += 16;
            if (lineY > y + rowHeight - 16) break;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line, colX + 10, lineY);
      } else {
        if (col.key === 'year') {
          const isPinned = item.id ? pinnedProjects.includes(item.id) : false;
          const textX = isPinned ? colX + 58 : colX + 28;
          ctx.fillText(text, textX, y + rowHeight / 2);
        } else {
          ctx.fillText(text, colX + 10, y + rowHeight / 2);
        }
      }

      ctx.restore();
      colX += width;
    });
  });

  // Header Row Background & Text
  ctx.fillStyle = isDark ? '#111113' : '#0f172a';
  ctx.fillRect(0, 0, totalWidth, headerHeight);

  ctx.strokeStyle = isDark ? '#27272a' : '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, headerHeight);
  ctx.lineTo(totalWidth, headerHeight);
  ctx.stroke();

  ctx.fillStyle = isDark ? '#ffffff' : '#ffffff';
  ctx.font = `700 12px ${fontSans}`;
  ctx.textBaseline = 'middle';

  let hX = 0;
  cols.forEach((col, i) => {
    const width = colWidths[i];
    let label = String(col.label || '').toUpperCase();
    if (sortConfig && sortConfig.key === col.key) {
      label += sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
    }
    
    const words = label.split(' ');
    let line = '';
    let lineY = headerHeight / 2;
    
    if (ctx.measureText(label).width > width - 20) {
      lineY = headerHeight / 2 - 7;
    }

    if (col.key === 'no' || col.key === 'status') {
      ctx.textAlign = 'center';
      ctx.fillText(label, hX + width / 2, headerHeight / 2);
      ctx.textAlign = 'left';
    } else {
      for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        if (ctx.measureText(testLine).width > width - 15 && n > 0) {
          ctx.fillText(line, hX + 12, lineY);
          line = words[n] + ' ';
          lineY += 15;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, hX + 12, lineY);
    }
    hX += width;
  });
}

interface ResolveCanvasClickParams {
  e: React.MouseEvent<HTMLCanvasElement>;
  canvas: HTMLCanvasElement;
  wrapper: HTMLDivElement;
  paginatedProjects: Project[];
  onProjectClick: (p: Project) => void;
  handlePinToggle: (e: React.MouseEvent, id: string) => void;
  setSortConfig: React.Dispatch<React.SetStateAction<SortConfig | null>>;
  t: (key: string) => string;
}

export function resolveCanvasClick({
  e,
  canvas,
  wrapper,
  paginatedProjects,
  onProjectClick,
  handlePinToggle,
  setSortConfig,
  t
}: ResolveCanvasClickParams) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const headerHeight = 60;
  const rowHeight = 70;

  if (y <= headerHeight) {
    const baseWidths = [100, 75, 80, 140, 210, 125, 210, 105, 105, 105];
    const logicalWidth = Math.max(wrapper.clientWidth, 1280);
    const totalBase = baseWidths.reduce((a, b) => a + b, 0);
    const scale = logicalWidth / totalBase;
    const colWidths = baseWidths.map(w => w * scale);
    
    const cols = [
      { label: t('Year'), key: 'year' },
      { label: t('Store'), key: 'store' },
      { label: t('Location'), key: 'location' },
      { label: t('Code'), key: 'code' },
      { label: t('Project'), key: 'name' },
      { label: t('Status'), key: 'status' },
      { label: t('Details'), key: 'detail' },
      { label: t('Tak start'), key: 'start' },
      { label: t('Tak compl'), key: 'handover' },
      { label: t('Opening'), key: 'opening' }
    ];

    let currentX = 0;
    for (let i = 0; i < cols.length; i++) {
      const colWidth = colWidths[i];
      if (x >= currentX && x <= currentX + colWidth) {
        const key = cols[i].key;
        if (key === 'start' || key === 'handover' || key === 'opening') {
          setSortConfig(prev => {
            if (prev && prev.key === key) {
              if (prev.direction === 'asc') return { key, direction: 'desc' };
              return null;
            }
            return { key, direction: 'asc' };
          });
        }
        break;
      }
      currentX += colWidth;
    }
    return;
  }

  const idx = Math.floor((y - headerHeight) / rowHeight);
  if (idx >= 0 && idx < paginatedProjects.length) {
    const baseWidths = [100, 75, 80, 140, 210, 125, 210, 105, 105, 105];
    const logicalWidth = Math.max(wrapper.clientWidth, 1280);
    const totalBase = baseWidths.reduce((a, b) => a + b, 0);
    const scale = logicalWidth / totalBase;
    const noColWidth = 100 * scale;
    const clickedProject = paginatedProjects[idx];
    
    if (x < noColWidth && clickedProject.id) {
      handlePinToggle(e, clickedProject.id);
      return;
    }
    
    onProjectClick(clickedProject);
  }
}
