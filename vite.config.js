import { defineConfig } from 'vite';
import { WebSocketServer } from 'ws';
import { createRoomManager } from './server/rooms.js';
import os from 'os';

// 获取本机局域网IP
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const lanIP = getLocalIP();

export default defineConfig({
  base: './',
  define: {
    __LAN_IP__: JSON.stringify(lanIP),
  },
  server: {
    host: '0.0.0.0',
    open: true
  },
  plugins: [{
    name: 'lbq3-ws-server',
    configureServer() {
      // 在 Vite 开发服务器启动时同时启动联机 WS 服务器（端口 3000）
      const manager = createRoomManager();
      try {
        const wss = new WebSocketServer({ port: 3000 });
        wss.on('connection', (ws) => manager.handleConnection(ws));
        wss.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            console.warn('[LBQ3] 端口 3000 被占用，联机服务未启动。可用 npm run server 单独运行');
          } else {
            console.error('[LBQ3] WebSocket 错误:', err.message);
          }
        });
        console.log('[LBQ3] 联机WebSocket运行在 ws://localhost:3000');
      } catch (e) {
        console.warn('[LBQ3] 联机WebSocket启动失败:', e.message);
      }
    },
  }]
});
