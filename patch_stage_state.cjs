const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

const target1 = `  const [hoverInfo, setHoverInfo] = useState<{ visible: boolean; x: number; y: number; data: any; unitName: string } | null>(null);`;

const replacement1 = `  const [hoverInfo, setHoverInfo] = useState<{ visible: boolean; x: number; y: number; data: any; unitName: string } | null>(null);
  const [stageScale, setStageScale] = useState(version.backgroundScale || 1);
  const [stagePos, setStagePos] = useState(version.backgroundPos || { x: 0, y: 0 });

  useEffect(() => {
    setStageScale(version.backgroundScale || 1);
    setStagePos(version.backgroundPos || { x: 0, y: 0 });
  }, [version]);
`;
code = code.replace(target1, replacement1);

const target2 = `  useEffect(() => {
    if (stageRef.current && version) {
       stageRef.current.position(version.backgroundPos || { x: 0, y: 0 });
       stageRef.current.scale({ x: version.backgroundScale || 1, y: version.backgroundScale || 1 });
       stageRef.current.batchDraw();
    }
  }, [version.id]);`;
code = code.replace(target2, "");

const target3 = `        <Stage 
             ref={stageRef}
             width={dimensions.width}
             height={dimensions.height}
            draggable
            onWheel={(e) => {
               e.evt.preventDefault();
               const stage = stageRef.current;
               if (!stage) return;
               const scaleBy = 1.1;
               const oldScale = stage.scaleX();
               const mousePointTo = {
                 x: stage.getPointerPosition().x / oldScale - stage.x() / oldScale,
                 y: stage.getPointerPosition().y / oldScale - stage.y() / oldScale,
               };
               const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
               stage.scale({ x: newScale, y: newScale });
               stage.position({
                 x: -(mousePointTo.x - stage.getPointerPosition().x / newScale) * newScale,
                 y: -(mousePointTo.y - stage.getPointerPosition().y / newScale) * newScale,
               });
            }}`;

const replacement3 = `        <Stage 
             ref={stageRef}
             width={dimensions.width}
             height={dimensions.height}
             x={stagePos.x}
             y={stagePos.y}
             scaleX={stageScale}
             scaleY={stageScale}
            draggable
            onDragEnd={(e) => {
              setStagePos({ x: e.target.x(), y: e.target.y() });
            }}
            onWheel={(e) => {
               e.evt.preventDefault();
               const stage = stageRef.current;
               if (!stage) return;
               const scaleBy = 1.1;
               const oldScale = stageScale;
               const pointer = stage.getPointerPosition();
               const mousePointTo = {
                 x: (pointer.x - stagePos.x) / oldScale,
                 y: (pointer.y - stagePos.y) / oldScale,
               };
               const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
               setStageScale(newScale);
               setStagePos({
                 x: pointer.x - mousePointTo.x * newScale,
                 y: pointer.y - mousePointTo.y * newScale,
               });
            }}`;
code = code.replace(target3, replacement3);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
