const fs = require('fs');
let code = fs.readFileSync('src/components/LiveLayoutViewer.tsx', 'utf8');

code = code.replace(
  "import { RefreshCw, Download, Layers, Settings, Key, X, Cloud } from 'lucide-react';",
  "import { RefreshCw, Download, Layers, Settings, Key, X, Cloud, Search } from 'lucide-react';"
);

fs.writeFileSync('src/components/LiveLayoutViewer.tsx', code);
