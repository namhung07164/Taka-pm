const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

code = code.replace(
  "floor: u.location || \"\",",
  "floor: u.location || locationFilter || \"\","
);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
