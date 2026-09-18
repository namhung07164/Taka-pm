const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

code = code.replace(
  /                  default: return false;\s*\}\s*\}\);\s*if \(isMatch\) \{/g,
  `                  default: return false;
                }
                    });
                } else {
                    isMatch = false;
                }
            }
            if (isMatch) {`
);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
