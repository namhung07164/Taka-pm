const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

const target1 = `              <KonvaImage
                image={bgImage}
                x={version.imagePos?.x || 0}
                y={version.imagePos?.y || 0}
                scaleX={version.imageScale || 1}
                scaleY={version.imageScale || 1}
              />`;

const replacement1 = `              <KonvaImage
                image={bgImage}
                x={version.imagePos?.x || 0}
                y={version.imagePos?.y || 0}
                scaleX={version.imageScale || 1}
                scaleY={version.imageScale || 1}
                rotation={version.backgroundRotation || 0}
              />`;

code = code.replace(target1, replacement1);

const target2 = `          <Layer>
             <Group rotation={version.backgroundRotation || 0}>
                {units.map((unit: any) => {`;

const replacement2 = `          <Layer>
             <Group>
                {units.map((unit: any) => {`;

code = code.replace(target2, replacement2);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
