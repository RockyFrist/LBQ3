// ===================== LBQ3 联机服务器（独立运行） =====================
// 用法: node server/server.js [port]
// 默认端口: 3000

import { WebSocketServer } from 'ws';
import { createRoomManager } from './rooms.js';

const PORT = parseInt(process.argv[2] || process.env.PORT || '3000', 10);
const manager = createRoomManager();

const wss = new WebSocketServer({ port: PORT, path: '/ws' });

wss.on('connection', (ws, req) => {
  const addr = req.socket.remoteAddress;
  console.log(`[连接] ${addr}`);
  manager.handleConnection(ws);
  ws.on('close', () => console.log(`[断开] ${addr}`));
});

console.log(`[LBQ3] 联机服务器运行在 ws://0.0.0.0:${PORT}`);
console.log(`[LBQ3] 局域网玩家请连接 ws://<你的IP>:${PORT}`);
