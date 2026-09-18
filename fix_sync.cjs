const fs = require('fs');
let code = fs.readFileSync('src/components/PictureMapping/components/CloudSync/CloudSyncManager.tsx', 'utf8');

// Strip out any existing React.useEffect related to auto-load.
const regex = /  React\.useEffect\(\(\) => \{\n    const creds = getStoredR2Credentials\(\);\n    if \(!hasAutoLoaded && creds && creds\.accountId && creds\.accessKeyId\) \{\n      if \(Object\.keys\(storeLocationData\)\.length === 0 && mapVersions\.length === 0\) \{\n        setHasAutoLoaded\(true\);\n        executeSync\('download'\);\n      \}\n    \}\n  \}, \[hasAutoLoaded, storeLocationData, mapVersions\.length\]\);\n/g;
code = code.replace(regex, "");

// Insert after `units, setUnits\n  } = useDataStore();`
code = code.replace(
  "units, setUnits\n  } = useDataStore();",
  "units, setUnits\n  } = useDataStore();\n\n  React.useEffect(() => {\n    const creds = getStoredR2Credentials();\n    if (!hasAutoLoaded && creds && creds.accountId && creds.accessKeyId) {\n      if (Object.keys(storeLocationData).length === 0 && mapVersions.length === 0) {\n        setHasAutoLoaded(true);\n        executeSync('download');\n      }\n    }\n  // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [hasAutoLoaded, storeLocationData, mapVersions.length]);"
);

fs.writeFileSync('src/components/PictureMapping/components/CloudSync/CloudSyncManager.tsx', code);
