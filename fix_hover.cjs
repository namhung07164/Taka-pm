const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

code = code.replace(
  "data: aggregatedData[unit.name.toLowerCase()] || {},",
  "data: aggregatedData[unit.name?.toLowerCase() || ''] || {},"
);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
