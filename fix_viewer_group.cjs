const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

const target = `          <Layer>
             <Group
                x={version.backgroundPos?.x || 0}
                y={version.backgroundPos?.y || 0}
                scaleX={version.backgroundScale || 1}
                scaleY={version.backgroundScale || 1}
                rotation={version.backgroundRotation || 0}
             >
                {units.map((unit: any) => {`;

const replacement = `          <Layer>
             <Group>
                {units.map((unit: any) => {`;

code = code.replace(target, replacement);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
