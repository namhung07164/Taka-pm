const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');
console.log("has groups check: ", code.includes("if (!version.groups)"));
console.log("has color mapping check: ", code.includes("unitColorMap"));
