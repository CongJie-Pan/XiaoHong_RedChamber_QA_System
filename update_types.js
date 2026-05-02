const fs = require('fs');
const file = 'frontend/src/store/chat/types.ts';
let content = fs.readFileSync(file, 'utf8');
if (!content.includes('restoreStreamingState:')) {
  content = content.replace(
    /resetStreamingState: \(\) => void;/g,
    "resetStreamingState: () => void;\n\n  /** Restore streaming state when switching back to an active stream */\n  restoreStreamingState: (state: Partial<ChatState>) => void;"
  );
  fs.writeFileSync(file, content);
  console.log('Updated types.ts');
}
