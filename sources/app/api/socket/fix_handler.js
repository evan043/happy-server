const fs = require('fs');
let content = fs.readFileSync('sessionSpawnHandler.ts', 'utf8');

// Remove the broken onAny section
content = content.replace(/\n\n    \/\/ DEBUG: Log ALL events received on this socket\n    socket\.onAny\(\(eventName, \.\.\.args\) => \{\n        log\({ module: 'websocket' }, \);\n    \}\);/g, '');

// Add proper onAny listener
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("socket.on('session:spawn'")) {
    lines.splice(i + 1, 0,
      "    // DEBUG: Log ALL events received on this socket",
      "    socket.onAny((eventName, ...args) => {",
      "        log({ module: 'websocket' }, '[SOCKET DEBUG] Event received: ' + eventName + ', args count: ' + args.length + ', socketId: ' + socket.id);",
      "    });",
      ""
    );
    break;
  }
}

fs.writeFileSync('sessionSpawnHandler.ts', lines.join('\n'));
console.log('Fixed onAny listener');
