const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

const target = `                        isMatch = group.rules.every((rule: any) => {
                let val = data[rule.field];`;

const replacement = `                        isMatch = group.rules.every((rule: any) => {
                            let val = data[rule.field];`;

code = code.replace(target, replacement);

const target2 = `                }
                    });
                } else {
                    isMatch = false;
                }
            }`;

const replacement2 = `                }
                        });
                    } else {
                        // isMatch = false; // Do not unset isMatch here, it might be true from manual mapping
                    }
                }
            }`;

code = code.replace(target2, replacement2);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
