const fs = require('fs');

let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

// 1. Add fields to initial dataMap
code = code.replace(
  `appProjectStatus: "", appProjectBudget: 0, appProjectActual: 0, appProjectCode: ""`,
  `appProjectStatus: "", appProjectBudget: 0, appProjectActual: 0, appProjectCode: "", projectName: "", startDate: "", handoverDate: "", openingDate: "", detail: "", party: ""`
);

// 2. Add Project fields mapping
code = code.replace(
  `dataMap[code].appProjectCode = String(p.code);`,
  `dataMap[code].appProjectCode = String(p.code);
            dataMap[code].projectName = p.name || "";
            dataMap[code].startDate = p.start || p.computedTakStart || "";
            dataMap[code].handoverDate = p.handover || p.computedTakCompl || "";
            dataMap[code].openingDate = p.opening || p.computedOpening || "";
            dataMap[code].detail = p.detail || "";
            dataMap[code].party = p.party || p.contractor || "";`
);

// 3. Add states for hover
const stateCode = `  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoverInfo, setHoverInfo] = useState<{ visible: boolean; x: number; y: number; data: any; unitName: string } | null>(null);`;
code = code.replace(`  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });`, stateCode);

// 4. Handlers
const handlersCode = `                   const commonProps = {
                      id: unit.id,
                      fill: fillColor,
                      opacity: isTargeted ? 0.75 : 0.3,
                      stroke: isTargeted ? '#333' : '#999',
                      strokeWidth: isTargeted ? 2 : 1,
                      x: unit.x,
                      y: unit.y,
                      rotation: unit.rotation || 0,
                      onMouseEnter: (e: any) => {
                         const container = e.target.getStage().container();
                         container.style.cursor = 'pointer';
                         setHoverInfo({
                            visible: true,
                            x: e.evt.clientX,
                            y: e.evt.clientY,
                            data: aggregatedData[unit.name.toLowerCase()] || {},
                            unitName: unit.name
                         });
                      },
                      onMouseMove: (e: any) => {
                         setHoverInfo(prev => prev ? { ...prev, x: e.evt.clientX, y: e.evt.clientY } : null);
                      },
                      onMouseLeave: (e: any) => {
                         const container = e.target.getStage().container();
                         container.style.cursor = 'grab';
                         setHoverInfo(null);
                      }
                   };`;
code = code.replace(/const commonProps = \{[\s\S]*?rotation: unit.rotation \|\| 0,\s*\};/, handlersCode);


// 5. Tooltip JSX
const tooltipJSX = `      <div ref={containerRef} className="flex-grow w-full cursor-grab active:cursor-grabbing">
        <Stage`;
        
const newTooltipJSX = `      {hoverInfo && hoverInfo.visible && (
        <div 
          className="fixed z-50 pointer-events-none bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border border-slate-200/60 p-4 w-72 text-sm text-slate-700 transition-opacity duration-150"
          style={{ 
            left: hoverInfo.x + 15, 
            top: hoverInfo.y + 15,
            transform: hoverInfo.x > window.innerWidth - 300 ? 'translateX(-100%)' : 'none',
            transformOrigin: 'top left'
          }}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="font-bold text-lg text-slate-800">{hoverInfo.unitName}</div>
              {hoverInfo.data.appProjectStatus && (
                <span className={\`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider \${
                  hoverInfo.data.appProjectStatus === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                  hoverInfo.data.appProjectStatus === 'On Process' ? 'bg-blue-100 text-blue-700' :
                  hoverInfo.data.appProjectStatus === 'Delay' ? 'bg-rose-100 text-rose-700' :
                  'bg-amber-100 text-amber-700'
                }\`}>
                  {hoverInfo.data.appProjectStatus}
                </span>
              )}
            </div>
            
            {(hoverInfo.data.projectName || hoverInfo.data.brandName) && (
              <div>
                <div className="text-xs text-slate-400 font-medium uppercase mb-0.5">Brand / Project</div>
                <div className="font-semibold text-slate-700">{hoverInfo.data.projectName || hoverInfo.data.brandName}</div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {hoverInfo.data.size > 0 && (
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <div className="text-[10px] text-slate-400 font-medium uppercase mb-0.5">Size (m²)</div>
                  <div className="font-semibold text-slate-700">{Number(hoverInfo.data.size).toLocaleString('en-US')}</div>
                </div>
              )}
              {hoverInfo.data.floor && (
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <div className="text-[10px] text-slate-400 font-medium uppercase mb-0.5">Location</div>
                  <div className="font-semibold text-slate-700">{hoverInfo.data.floor}</div>
                </div>
              )}
            </div>

            {(hoverInfo.data.appProjectBudget > 0 || hoverInfo.data.appProjectActual > 0) && (
              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
                <div>
                  <div className="text-[10px] text-slate-400 font-medium uppercase mb-0.5">Budget</div>
                  <div className="font-medium text-slate-700">{Number(hoverInfo.data.appProjectBudget).toLocaleString('en-US')} <span className="text-[10px] text-slate-400">VND</span></div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-medium uppercase mb-0.5">Actual</div>
                  <div className="font-medium text-slate-700">{Number(hoverInfo.data.appProjectActual).toLocaleString('en-US')} <span className="text-[10px] text-slate-400">VND</span></div>
                </div>
              </div>
            )}

            {(hoverInfo.data.startDate || hoverInfo.data.handoverDate || hoverInfo.data.openingDate) && (
              <div className="border-t border-slate-100 pt-2 flex flex-col gap-1.5">
                {hoverInfo.data.startDate && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Start:</span>
                    <span className="font-medium text-slate-700">{hoverInfo.data.startDate}</span>
                  </div>
                )}
                {hoverInfo.data.handoverDate && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Handover:</span>
                    <span className="font-medium text-slate-700">{hoverInfo.data.handoverDate}</span>
                  </div>
                )}
                {hoverInfo.data.openingDate && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Opening:</span>
                    <span className="font-medium text-slate-700">{hoverInfo.data.openingDate}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <div ref={containerRef} className="flex-grow w-full cursor-grab active:cursor-grabbing">
        <Stage`;

code = code.replace(`      <div ref={containerRef} className="flex-grow w-full cursor-grab active:cursor-grabbing">
        <Stage`, newTooltipJSX);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
