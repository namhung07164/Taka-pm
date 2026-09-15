const fs = require('fs');
const glob = require('glob');

function findFiles(dir, ext) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = dir + '/' + file;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(findFiles(file, ext));
    } else if (file.endsWith(ext)) {
      results.push(file);
    }
  });
  return results;
}

const files = findFiles('src', '.tsx').concat(findFiles('src', '.ts'));
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  if (content.includes('from "firebase/firestore"') || content.includes("from 'firebase/firestore'")) {
    // If they import writeBatch, setDoc, updateDoc, deleteDoc
    // We should change them to import from lib/firebase
    let newContent = content;
    // Replace writeBatch
    if (newContent.includes('writeBatch')) {
      newContent = newContent.replace(/import\s+{([^}]*writeBatch[^}]*)}\s+from\s+["']firebase\/firestore["'];?/g, (match, p1) => {
         const cleanImports = p1.split(',').map(s => s.trim()).filter(s => s !== 'writeBatch' && s !== '');
         let newImport = '';
         if (cleanImports.length > 0) {
           newImport = `import { ${cleanImports.join(', ')} } from "firebase/firestore";\n`;
         }
         // Add writeBatch from firebase.ts
         // We need to calculate relative path to lib/firebase
         const depth = f.split('/').length - 2;
         const prefix = depth === 0 ? './lib/firebase' : '../'.repeat(depth) + 'lib/firebase';
         newImport += `import { writeBatch } from "${prefix}";`;
         return newImport;
      });
    }
    
    // Check if it's the App.tsx which has writeBatch imported
    // Wait, simpler way: I can just write a sed command or do it manually since there are 25 files.
    // Or I can just redefine `window.writeBatch`? No.
  }
});
