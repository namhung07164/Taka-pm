const fs = require('fs');
const glob = require('glob'); // Need to check if glob is available, or use a simple recursive read

// We'll write a simple recursive function
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
let total = 0;
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  if (content.includes('from "firebase/firestore"')) {
    console.log(f);
    total++;
  }
});
console.log("Total files with firestore import:", total);
