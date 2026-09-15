const fs = require('fs');

let content = fs.readFileSync('src/components/DetailTab.tsx', 'utf-8');

// 1. Insert import
if (!content.includes('useWindowVirtualizer')) {
  content = content.replace("import React, {", "import React, {\n  useCallback,\n  useEffect,\n  useMemo,\n  useRef,\n  useState,\n} from 'react';\nimport { useWindowVirtualizer } from '@tanstack/react-virtual';\n//");
}

fs.writeFileSync('src/components/DetailTab.tsx', content, 'utf-8');
