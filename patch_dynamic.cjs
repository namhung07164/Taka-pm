const fs = require('fs');
let code = fs.readFileSync('src/components/PictureMapping/components/DataMapping/DynamicHierarchyTab.tsx', 'utf8');

code = code.replace(
  "import { getStatus } from \"../../../../lib/utils\";",
  "import { getStatus, enrichProjects } from \"../../../../lib/utils\";"
);
code = code.replace(
  "const projects = useAppStore(state => state.projects);",
  "const projects = useAppStore(state => state.projects);\n  const tasks = useAppStore(state => state.tasks);"
);
code = code.replace(
  "const aggregatedData = useMemo(() => {",
  "const enrichedProjects = useMemo(() => enrichProjects(projects, tasks), [projects, tasks]);\n\n  const aggregatedData = useMemo(() => {"
);
code = code.replace(
  "// Merge real Project data\n    projects.forEach((p) => {",
  "// Merge real Project data\n    enrichedProjects.forEach((p) => {"
);
code = code.replace(
  "const status = getStatus(p.start, p.handover, p.opening, p.code);",
  "const status = getStatus(p.computedTakStart || p.start, p.computedTakCompl || p.handover, p.computedOpening || p.opening, p.code);"
);
code = code.replace(
  "}, [unitNamesStr, summaryData, projects]);",
  "}, [unitNamesStr, summaryData, enrichedProjects]);"
);

fs.writeFileSync('src/components/PictureMapping/components/DataMapping/DynamicHierarchyTab.tsx', code);
