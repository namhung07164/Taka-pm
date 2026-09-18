const fs = require('fs');
let code = fs.readFileSync('src/components/PictureMapping/components/CloudSync/CloudSyncManager.tsx', 'utf8');

code = code.replace(
  "const [actionType, setActionType] = useState<'upload' | 'download' | null>(null);",
  "const [actionType, setActionType] = useState<'upload' | 'download' | null>(null);\n  const [hasAutoLoaded, setHasAutoLoaded] = useState(false);\n\n  React.useEffect(() => {\n    const creds = getStoredR2Credentials();\n    if (!hasAutoLoaded && creds && creds.accountId && creds.accessKeyId) {\n      if (Object.keys(storeLocationData).length === 0 && mapVersions.length === 0) {\n        setHasAutoLoaded(true);\n        executeSync('download');\n      }\n    }\n  }, [hasAutoLoaded, storeLocationData, mapVersions.length]);"
);

fs.writeFileSync('src/components/PictureMapping/components/CloudSync/CloudSyncManager.tsx', code);
