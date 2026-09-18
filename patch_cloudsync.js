const fs = require('fs');
let code = fs.readFileSync('src/components/PictureMapping/components/CloudSync/CloudSyncManager.tsx', 'utf8');

code = code.replace(
  "const executeSync = async () => {",
  "const executeSync = async (forceAction?: 'upload' | 'download') => {\n    const currentAction = forceAction || actionType;"
);
code = code.replace(
  "setStatusText(actionType === 'upload' ? 'Chuẩn bị dữ liệu...' : 'Đang kết nối Cloudflare R2...');",
  "setStatusText(currentAction === 'upload' ? 'Chuẩn bị dữ liệu...' : 'Đang kết nối Cloudflare R2...');"
);
code = code.replace(
  "if (actionType === 'upload') {",
  "if (currentAction === 'upload') {"
);
code = code.replace(
  "} else if (actionType === 'download') {",
  "} else if (currentAction === 'download') {"
);
code = code.replace(
  "const [actionType, setActionType] = useState<'upload' | 'download'>('upload');",
  "const [actionType, setActionType] = useState<'upload' | 'download'>('upload');\n  const [hasAutoLoaded, setHasAutoLoaded] = useState(false);\n\n  React.useEffect(() => {\n    const creds = getStoredR2Credentials();\n    if (!hasAutoLoaded && creds && creds.accountId && creds.accessKeyId) {\n      if (Object.keys(storeLocationData).length === 0 && mapVersions.length === 0) {\n        setHasAutoLoaded(true);\n        executeSync('download');\n      }\n    }\n  }, [hasAutoLoaded, storeLocationData, mapVersions.length]);"
);

fs.writeFileSync('src/components/PictureMapping/components/CloudSync/CloudSyncManager.tsx', code);
