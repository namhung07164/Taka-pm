const fs = require('fs');

let code = fs.readFileSync('src/components/DetailTab.tsx', 'utf-8');

const mainReturnIdx = code.indexOf('  return (\n    <div className="flex flex-col flex-grow bg-white');

if (mainReturnIdx === -1) {
  console.log("Could not find main return");
  process.exit(1);
}

const beforeReturn = code.substring(0, mainReturnIdx);
const afterReturn = code.substring(mainReturnIdx);

// We will inject the flattenedRows logic here
const virtualizerCode = `
  const flattenedRows = useMemo(() => {
    const rows = [];
    filteredProjects.forEach((p, pIdx) => {
      const pKey = \`\${p.code || ''}-\${p.year || ''}-\${p.store || ''}-\${p.id || p.no}\`;
      const pInfo = projectInfoMap.get(pKey) || getProjectInfo(p);
      const sortedTasks = pInfo.sortedTasks || [];
      const groupTasks = sortConfig ? [...sortedTasks].sort((a, b) => {
        let valA = '';
        let valB = '';
        let direction = 'asc';
        if (sortConfig.key === 'start') {
          valA = a.start || '9999-12-31';
          valB = b.start || '9999-12-31';
        } else if (sortConfig.key === 'finish') {
          valA = a.finish || '9999-12-31';
          valB = b.finish || '9999-12-31';
        } else if (sortConfig.key === 'taskName') {
          valA = a.name || '';
          valB = b.name || '';
        } else if (sortConfig.key === 'duration') {
          valA = a.duration || '0';
          valB = b.duration || '0';
          direction = sortConfig.direction;
          const numA = Number(valA);
          const numB = Number(valB);
          if (numA < numB) return direction === 'asc' ? -1 : 1;
          if (numA > numB) return direction === 'asc' ? 1 : -1;
          return 0;
        }
        direction = sortConfig.direction;
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
      }) : sortedTasks;
      const isExpanded = expandedCodes.includes(String(p.id!));
      const hasDelegatedSubTask = groupTasks.some(t => t.delegation);
      const isProjDelegationOn = !!(p.delegation || hasDelegatedSubTask);
      const planProgressPercent = computePlanProgressPercent(groupTasks);
      const actProgressPercent = computeActProgressPercent(groupTasks, delegationGroups);
      const isProjectMatch = lowerSearchTerm ? [p.store, p.location, p.year, p.code, p.name].some(val => String(val || "").toLowerCase().includes(lowerSearchTerm)) : true;
      const tasksToRender = isProjectMatch ? groupTasks : groupTasks.filter((t, idx) => {
        const taskFields = [
          t.taskCodePhu,
          \`\${p.code}-\${(t.orderIndex !== undefined ? t.orderIndex : idx) + 1}\`,
          t.name,
          t.duration,
          t.start,
          t.finish,
          t.party,
          formatDisplayDateMain(t.start),
          formatDisplayDateTime(t.start),
          formatDisplayDateMain(t.finish),
          formatDisplayDateTime(t.finish)
        ];
        const fieldMatch = taskFields.some(val => String(val || "").toLowerCase().includes(lowerSearchTerm));
        const notesMatch = t.notes?.some(n => String(n.content || '').toLowerCase().includes(lowerSearchTerm)) || false;
        return fieldMatch || notesMatch;
      });

      if (isProjectMatch || tasksToRender.length > 0) {
        rows.push({
          type: 'project',
          key: p.id || \`\${p.code}-\${p.year}-\${p.no}\`,
          p,
          pIdx,
          isExpanded,
          isProjDelegationOn,
          planProgressPercent,
          actProgressPercent,
          tasksToRender,
          groupTasks
        });

        if (isExpanded) {
          tasksToRender.forEach((t) => {
            const originalIndex = groupTasks.findIndex(gt => gt.id === t.id);
            const i = originalIndex !== -1 ? originalIndex : 0;
            const taskStatus = getTaskStatus(t);
            const taskStatusColorClass = getStatus(taskStatus).color;
            const delegationGroup = delegationGroupByParentKey.get(t.id);
            const actStatus = resolveActualStatus(taskStatus, delegationGroup?.subTasks || []);
            const delStatusText = actStatus.label;
            const delStatusColorClass = actStatus.color;

            rows.push({
              type: 'task',
              key: t.id,
              p,
              t,
              i,
              groupTasks,
              taskStatus,
              taskStatusColorClass,
              delStatusText,
              delStatusColorClass
            });
          });
        }
      }
    });
    return rows;
  }, [filteredProjects, projectInfoMap, expandedCodes, sortConfig, lowerSearchTerm, delegationGroups, delegationGroupByParentKey]);

  const parentRef = useRef(null);
  
  const rowVirtualizer = useWindowVirtualizer({
    count: flattenedRows.length,
    estimateSize: () => 50,
    overscan: 10,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

`;

let newCode = beforeReturn + virtualizerCode + afterReturn;

fs.writeFileSync('src/components/DetailTab.tsx', newCode, 'utf-8');
console.log("Flattened logic injected");
