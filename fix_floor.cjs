const fs = require('fs');

// --- Fix DynamicHierarchyTab ---
let dyn = fs.readFileSync('src/components/PictureMapping/components/DataMapping/DynamicHierarchyTab.tsx', 'utf8');

dyn = dyn.replace(
  "({ id: u.id, name: u.name }))), [units]);",
  "({ id: u.id, name: u.name, location: u.location }))), [units]);"
);

dyn = dyn.replace(
  "floor: \"\",",
  "floor: u.location || \"\","
);

dyn = dyn.replace(
  "dataMap[key].floor = (sumData as any).floor || \"\";",
  "dataMap[key].floor = dataMap[key].floor || (sumData as any).floor || \"\";"
);

fs.writeFileSync('src/components/PictureMapping/components/DataMapping/DynamicHierarchyTab.tsx', dyn);

// --- Fix LiveLayoutViewer ---
let live = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

live = live.replace(
  "brandCode: \"\", brandName: \"\", classCode: \"\", floor: \"\",",
  "brandCode: \"\", brandName: \"\", classCode: \"\", floor: u.location || \"\","
);

live = live.replace(
  "floor: (sumData as any).floor || \"\",",
  "floor: dataMap[key].floor || (sumData as any).floor || \"\","
);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', live);
