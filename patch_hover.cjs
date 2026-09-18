const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

const targetHover = `                      onMouseEnter: (e: any) => {
                         const container = e.target.getStage().container();
                         container.style.cursor = 'pointer';
                         setHoverInfo({
                            visible: true,
                            x: e.evt.clientX,
                            y: e.evt.clientY,
                            data: aggregatedData[unit.name?.toLowerCase() || ''] || {},
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
                      }`;

const replacementHover = `                      onMouseEnter: (e: any) => {
                         const container = e.target.getStage().container();
                         container.style.cursor = 'pointer';
                         setHoverInfo({
                            visible: true,
                            x: e.evt.clientX,
                            y: e.evt.clientY,
                            data: aggregatedData[unit.name?.toLowerCase() || ''] || {},
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
                      },
                      onClick: (e: any) => {
                         setHoverInfo({
                            visible: true,
                            x: e.evt.clientX,
                            y: e.evt.clientY,
                            data: aggregatedData[unit.name?.toLowerCase() || ''] || {},
                            unitName: unit.name
                         });
                      },
                      onTap: (e: any) => {
                         const clientX = e.evt.changedTouches ? e.evt.changedTouches[0].clientX : e.evt.clientX;
                         const clientY = e.evt.changedTouches ? e.evt.changedTouches[0].clientY : e.evt.clientY;
                         setHoverInfo({
                            visible: true,
                            x: clientX,
                            y: clientY,
                            data: aggregatedData[unit.name?.toLowerCase() || ''] || {},
                            unitName: unit.name
                         });
                      }`;
code = code.replace(targetHover, replacementHover);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
