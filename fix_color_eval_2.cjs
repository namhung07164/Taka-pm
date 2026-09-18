const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

const target = `            if (isDynamicActive && group.rules && group.rules.length > 0) {
                const data = aggregatedData[u.name.toLowerCase()];
                if (data) {
                    isMatch = group.rules.every((rule: any) => {`;

const replacement = `            if (group.rules && group.rules.length > 0) {
                // Determine whether to evaluate dynamic rule. 
                // Only evaluate if it's dynamic active OR if there are no manual mappings
                const hasManualMapping = version.groupMappings && Object.values(version.groupMappings).some(m => Array.isArray(m) && m.length > 0);
                if (version.isDynamicActive !== false || !hasManualMapping) {
                    const data = aggregatedData[u.name.toLowerCase()];
                    if (data) {
                        isMatch = group.rules.every((rule: any) => {`;

code = code.replace(target, replacement);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
