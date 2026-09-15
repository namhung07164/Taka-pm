import fs from 'fs';
import path from 'path';

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
  if (f === 'src/lib/firebase.ts') return;
  
  let content = fs.readFileSync(f, 'utf8');
  if (content.includes('writeBatch') && content.includes('firebase/firestore')) {
    
    // Remove writeBatch from firebase/firestore import
    content = content.replace(/import\s+{([^}]*)}\s+from\s+["']firebase\/firestore["'];?/g, (match, importsStr) => {
      if (!importsStr.includes('writeBatch')) return match;
      
      const parts = importsStr.split(',').map(s => s.trim()).filter(s => s && s !== 'writeBatch');
      if (parts.length === 0) return '';
      return `import { ${parts.join(', ')} } from 'firebase/firestore';`;
    });
    
    // Add writeBatch to lib/firebase import
    // Need relative path
    const depth = f.split('/').length - 2;
    const rel = depth === 0 ? './lib/firebase' : '../'.repeat(depth) + 'lib/firebase';
    
    if (content.includes(`from "${rel}"`)) {
      content = content.replace(new RegExp(`import\\s+{([^}]*)}\\s+from\\s+["']${rel}["'];?`), (match, p1) => {
        return `import { ${p1}, writeBatch } from "${rel}";`;
      });
    } else if (content.includes(`from '${rel}'`)) {
      content = content.replace(new RegExp(`import\\s+{([^}]*)}\\s+from\\s+["']${rel}["'];?`), (match, p1) => {
        return `import { ${p1}, writeBatch } from "${rel}";`;
      });
    } else {
      content = `import { writeBatch } from "${rel}";\n` + content;
    }
    
    fs.writeFileSync(f, content, 'utf8');
    console.log("Updated", f);
  }
});
