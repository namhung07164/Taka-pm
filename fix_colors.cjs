const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

const target = `    version.groups.forEach((group: any) => {
        let groupHasMatches = false;
        units.forEach((u: any) => {
            if (!group.rules || group.rules.length === 0) return;
            const data = aggregatedData[u.name.toLowerCase()];
            if (!data) return;
            
            const isMatch = group.rules.every((rule: any) => {`;

const replacement = `    version.groups.forEach((group: any) => {
        let groupHasMatches = false;
        const mappedUnitIds = new Set(version.groupMappings?.[group.id] || []);
        
        units.forEach((u: any) => {
            let isMatch = false;
            
            // Check manual mapping first
            if (mappedUnitIds.has(u.id)) {
                isMatch = true;
            }
            
            // Override with real-time dynamic rules if they exist
            if (group.rules && group.rules.length > 0) {
                const data = aggregatedData[u.name.toLowerCase()];
                if (data) {
                    isMatch = group.rules.every((rule: any) => {`;

code = code.replace(target, replacement);

const targetEnd = `                }
            });
            if (isMatch) {`;

const replacementEnd = `                }
                    });
                } else {
                    isMatch = false; // No data, so dynamic rule fails
                }
            }
            
            if (isMatch) {`;

code = code.replace(targetEnd, replacementEnd);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
