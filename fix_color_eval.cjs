const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

const target = `            // Override with real-time dynamic rules if they exist
            if (group.rules && group.rules.length > 0) {
                const data = aggregatedData[u.name.toLowerCase()];
                if (data) {
                    isMatch = group.rules.every((rule: any) => {`;

const replacement = `            // Only override with real-time dynamic rules if it's dynamic active
            const isDynamicActive = version.isDynamicActive !== false;
            
            if (isDynamicActive && group.rules && group.rules.length > 0) {
                const data = aggregatedData[u.name.toLowerCase()];
                if (data) {
                    isMatch = group.rules.every((rule: any) => {`;

code = code.replace(target, replacement);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
