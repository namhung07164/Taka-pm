const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

const target = `                  default: return false;
                }
            });
            if (isMatch) {`;

const replacement = `                  default: return false;
                }
                    });
                } else {
                    isMatch = false;
                }
            }
            if (isMatch) {`;

code = code.replace(target, replacement);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
