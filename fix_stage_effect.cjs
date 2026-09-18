const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

const target1 = `        <Stage 
             ref={stageRef}
             width={dimensions.width}
             height={dimensions.height}
             x={version.backgroundPos?.x || 0}
             y={version.backgroundPos?.y || 0}
             scaleX={version.backgroundScale || 1}
             scaleY={version.backgroundScale || 1}
            draggable`;

const replacement1 = `        <Stage 
             ref={stageRef}
             width={dimensions.width}
             height={dimensions.height}
            draggable`;

code = code.replace(target1, replacement1);

const target2 = `  useEffect(() => {
    const updateSize = () => {`;

const replacement2 = `  useEffect(() => {
    if (stageRef.current && version) {
       stageRef.current.position(version.backgroundPos || { x: 0, y: 0 });
       stageRef.current.scale({ x: version.backgroundScale || 1, y: version.backgroundScale || 1 });
       stageRef.current.batchDraw();
    }
  }, [version.id]);

  useEffect(() => {
    const updateSize = () => {`;

code = code.replace(target2, replacement2);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
