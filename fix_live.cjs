const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

// The enrichedProjects variable wasn't properly declared in LiveLayoutViewer, only iterated over. Let's declare it.
code = code.replace(
  "enrichedProjects.forEach((p) => {",
  "const enrichedProjects = enrichProjects(projects, tasks);\n    enrichedProjects.forEach((p) => {"
);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
