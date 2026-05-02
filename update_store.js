const fs = require('fs');
const file = 'frontend/src/store/chat/store.ts';
let content = fs.readFileSync(file, 'utf8');
if (!content.includes('restoreStreamingState:')) {
  content = content.replace(
    /resetStreamingState: \(\) => {/g,
    "restoreStreamingState: (partialState) => {\n    set((state) => ({ ...state, ...partialState }));\n  },\n\n  resetStreamingState: () => {"
  );
  fs.writeFileSync(file, content);
  console.log('Updated store.ts');
}
