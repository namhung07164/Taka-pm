const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

code = code.replace(
  "if (!unit.visible) return null;",
  "if (unit.visible === false) return null;"
);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
