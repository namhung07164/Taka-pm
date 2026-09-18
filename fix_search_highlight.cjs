const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

const target = `                   const targetColor = unitColorMap[unit.id];
                   const isTargeted = !!targetColor;
                   const fillColor = targetColor || "rgba(148, 163, 184, 0.1)";
                   
                   const commonProps = {
                      id: unit.id,
                      fill: fillColor,
                      opacity: isTargeted ? 0.75 : 0.3,
                      stroke: isTargeted ? '#333' : '#999',
                      strokeWidth: isTargeted ? 2 : 1,`;

const replacement = `                   const targetColor = unitColorMap[unit.id];
                   const isTargeted = !!targetColor;
                   const fillColor = targetColor || "rgba(148, 163, 184, 0.1)";
                   
                   // Handle Search Highlight
                   let isSearchMatch = false;
                   if (searchQuery.trim()) {
                       const query = searchQuery.toLowerCase().trim();
                       const unitData = aggregatedData[unit.name?.toLowerCase()] || {};
                       isSearchMatch = 
                           (unit.name || '').toLowerCase().includes(query) ||
                           (unitData.projectName || '').toLowerCase().includes(query) ||
                           (unitData.brandName || '').toLowerCase().includes(query);
                   }

                   const finalStroke = isSearchMatch ? '#ef4444' : (isTargeted ? '#333' : '#999');
                   const finalStrokeWidth = isSearchMatch ? 4 : (isTargeted ? 2 : 1);
                   const finalOpacity = isSearchMatch ? 1 : (searchQuery.trim() ? (isTargeted ? 0.2 : 0.05) : (isTargeted ? 0.75 : 0.3));
                   const finalShadow = isSearchMatch ? { shadowColor: '#ef4444', shadowBlur: 15, shadowOpacity: 1 } : {};
                   
                   const commonProps = {
                      id: unit.id,
                      fill: fillColor,
                      opacity: finalOpacity,
                      stroke: finalStroke,
                      strokeWidth: finalStrokeWidth,
                      ...finalShadow,`;

code = code.replace(target, replacement);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
