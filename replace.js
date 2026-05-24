const fs = require('fs');

const files = [
  'components/Hub.tsx',
  'components/HubComponents.tsx',
  'components/Dashboard.tsx'
];

for (const file of files) {
  try {
    let content = fs.readFileSync(file, 'utf8');
    const newContent = content.replace(/rounded-full object-cover/g, 'rounded-full object-contain');
    if (content !== newContent) {
      fs.writeFileSync(file, newContent, 'utf8');
      console.log(`Updated ${file}`);
    }
  } catch (err) {
    console.error(`Error processing ${file}:`, err);
  }
}
