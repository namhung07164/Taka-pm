const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

const targetLayout = `      <div className="absolute top-4 right-4 z-10 flex items-center gap-3">
         <div className="relative group">`;

const replacementLayout = `      <div className="absolute top-4 right-4 z-10 flex flex-col sm:flex-row items-end sm:items-center gap-3">
         <div className="relative group">`;
code = code.replace(targetLayout, replacementLayout);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
