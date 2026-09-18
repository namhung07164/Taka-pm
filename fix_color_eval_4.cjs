const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

const target = `                if (version.isDynamicActive !== false || !hasManualMapping) {
                    const data = aggregatedData[u.name.toLowerCase()];
                    if (data) {
                        isMatch = group.rules.every((rule: any) => {`;

const replacement = `                if (isDynamicActive || !hasManualMapping) {
                    const data = aggregatedData[u.name?.toLowerCase() || ''];
                    if (data) {
                        const passedRules = group.rules.every((rule: any) => {`;

code = code.replace(target, replacement);

const target2 = `                        });
                    } else {
                        // isMatch = false; // Do not unset isMatch here, it might be true from manual mapping
                    }
                }
            }`;

const replacement2 = `                        });
                        if (passedRules) isMatch = true; // Set to true if it passed dynamic rules
                    }
                }
            }`;

code = code.replace(target2, replacement2);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
