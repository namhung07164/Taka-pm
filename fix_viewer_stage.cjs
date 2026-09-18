const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

const target1 = `      <div ref={containerRef} className="flex-grow w-full cursor-grab active:cursor-grabbing">
        <Stage 
             ref={stageRef}
             width={dimensions.width}
             height={dimensions.height}
            draggable
            onWheel={(e) => {`;

const replacement1 = `      <div ref={containerRef} className="flex-grow w-full cursor-grab active:cursor-grabbing">
        <Stage 
             ref={stageRef}
             width={dimensions.width}
             height={dimensions.height}
             x={version.backgroundPos?.x || 0}
             y={version.backgroundPos?.y || 0}
             scaleX={version.backgroundScale || 1}
             scaleY={version.backgroundScale || 1}
            draggable
            onWheel={(e) => {`;

code = code.replace(target1, replacement1);

const target2 = `          <Layer>
             <Group
                x={version.backgroundPos?.x || 0}
                y={version.backgroundPos?.y || 0}
                scaleX={version.backgroundScale || 1}
                scaleY={version.backgroundScale || 1}
                rotation={version.backgroundRotation || 0}
             >
                {units.map((unit: any) => {`;

const replacement2 = `          <Layer>
             <Group rotation={version.backgroundRotation || 0}>
                {units.map((unit: any) => {`;

code = code.replace(target2, replacement2);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
