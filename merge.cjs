const fs = require('fs');
const path = require('path');

const constantsDir = path.join(process.cwd(), 'src', 'constants');
const files = fs.readdirSync(constantsDir).filter(f => f.startsWith('babyMessages') && f.endsWith('.ts'));

let allContent = '';

for (const file of files) {
  if (file === 'index.ts') continue;
  const content = fs.readFileSync(path.join(constantsDir, file), 'utf-8');
  allContent += content + '\n\n';
}

fs.writeFileSync(path.join(constantsDir, 'combinedBabyMessages.ts'), allContent, 'utf-8');
console.log('Combined successfully');
