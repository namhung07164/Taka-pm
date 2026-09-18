const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

code = code.replace(
  "import { getStatus } from '../lib/utils';",
  "import { getStatus, enrichProjects } from '../lib/utils';"
);
code = code.replace(
  "const projects = useAppStore(state => state.projects);",
  "const projects = useAppStore(state => state.projects);\n  const tasks = useAppStore(state => state.tasks);"
);
code = code.replace(
  "const activeMapVersionId = r2Version?.id || null;",
  "const activeMapVersionId = r2Version?.id || null;\n\n  const enrichedProjects = useMemo(() => enrichProjects(projects, tasks), [projects, tasks]);"
);
code = code.replace(
  "projects.forEach((p) => {",
  "enrichedProjects.forEach((p) => {"
);
code = code.replace(
  "const status = getStatus(p.start, p.handover, p.opening, p.code);",
  "const status = getStatus(p.computedTakStart || p.start, p.computedTakCompl || p.handover, p.computedOpening || p.opening, p.code);"
);
code = code.replace(
  "}, [storeFilter, locationFilter, r2Version, r2Units, projects]);",
  "}, [storeFilter, locationFilter, r2Version, r2Units, enrichedProjects]);"
);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
