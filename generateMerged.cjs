const fs = require('fs');
const path = require('path');

const constantsDir = path.join(process.cwd(), 'src', 'constants');
const files = fs.readdirSync(constantsDir).filter(f => f.startsWith('babyMessages') && f.endsWith('.ts') && f !== 'babyMessages.ts');

let allContent = fs.readFileSync(path.join(constantsDir, 'babyMessages.ts'), 'utf-8');
let exportsContent = '';

for (const file of files) {
  if (file === 'combinedBabyMessages.ts') continue;
  const content = fs.readFileSync(path.join(constantsDir, file), 'utf-8');
  exportsContent += content + '\n\n';
}

let combinedContent = `
export type BabyMessageOption = {
  label: string;
  response: string;
};

export type BabyMessageItem = string | {
  text: string;
  options: BabyMessageOption[];
};

${allContent}
${exportsContent}

export const ALL_BABY_MESSAGES: BabyMessageItem[] = [
  ...(typeof BABY_MESSAGES !== 'undefined' ? BABY_MESSAGES : []),
  ...(typeof BABY_MESSAGES_NEW_PART_1 !== 'undefined' ? BABY_MESSAGES_NEW_PART_1 : []),
  ...(typeof BABY_MESSAGES_NEW_PART_2 !== 'undefined' ? BABY_MESSAGES_NEW_PART_2 : []),
  ...(typeof BABY_MESSAGES_NEW_PART_3 !== 'undefined' ? BABY_MESSAGES_NEW_PART_3 : []),
  ...(typeof BABY_MESSAGES_NEW_PART_4 !== 'undefined' ? BABY_MESSAGES_NEW_PART_4 : []),
  ...(typeof BABY_MESSAGES_NEW_PART_5 !== 'undefined' ? BABY_MESSAGES_NEW_PART_5 : []),
  ...(typeof BABY_MESSAGES_NEW_PART_OPTIONS !== 'undefined' ? BABY_MESSAGES_NEW_PART_OPTIONS : []),
  ...(typeof BABY_MESSAGES_STARCH !== 'undefined' ? BABY_MESSAGES_STARCH : []),
  ...(typeof BABY_MESSAGES_MOM_HARDWORK !== 'undefined' ? BABY_MESSAGES_MOM_HARDWORK : []),
  ...(typeof BABY_MESSAGES_DAD_TASKS !== 'undefined' ? BABY_MESSAGES_DAD_TASKS : []),
  ...(typeof BABY_MESSAGES_TAIWAN_FOOD !== 'undefined' ? BABY_MESSAGES_TAIWAN_FOOD : []),
  ...(typeof BABY_MESSAGES_FUTURE !== 'undefined' ? BABY_MESSAGES_FUTURE : [])
];
`;

fs.writeFileSync(path.join(constantsDir, 'babyMessages.ts'), combinedContent, 'utf-8');
console.log('Merged successfully.');
