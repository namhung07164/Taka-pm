const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

code = code.replace(
  "  const [hoverInfo, setHoverInfo] = useState<{ visible: boolean; x: number; y: number; data: any; unitName: string } | null>(null);",
  "  const [hoverInfo, setHoverInfo] = useState<{ visible: boolean; x: number; y: number; data: any; unitName: string } | null>(null);\n  const [searchQuery, setSearchQuery] = useState('');"
);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
