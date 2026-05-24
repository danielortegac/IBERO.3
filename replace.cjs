const fs = require('fs');
const glob = require('fs').readdirSync; // not real glob, but we can just use given files
const files = [
  'components/Hub.tsx',
  'components/HubComponents.tsx',
  'components/Dashboard.tsx',
  'components/Projects.tsx',
  'components/Sidebar.tsx',
  'components/Wallet.tsx',
  'components/NotificationsPanel.tsx',
  'components/CallOverlay.tsx',
  'components/Partners.tsx',
  'components/PresentationBuilder.tsx'
];

for (const file of files) {
  try {
    let content = fs.readFileSync(file, 'utf8');
    let newContent = content.replace(/rounded-full(.*?)object-cover/g, "rounded-full$1object-contain");
    newContent = newContent.replace(/object-cover(.*?)rounded-full/g, "object-contain$1rounded-full");
    
    // specifically handle w-6 h-6 rounded-full in Hub.tsx that might not even have object-cover
    if (file === 'components/Hub.tsx') {
        newContent = newContent.replace(/className="w-6 h-6 rounded-full mb-1/g, 'className="w-6 h-6 rounded-full object-contain mb-1');
    }
    
    if (content !== newContent) {
      fs.writeFileSync(file, newContent, 'utf8');
      console.log(`Updated ${file}`);
    }
  } catch (err) {
    // console.error(`Error processing ${file}:`, err);
  }
}
