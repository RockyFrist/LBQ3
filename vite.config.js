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

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    open: true
  },
  plugins: [{
    name: 'lbq3-ws-server',
    configureServer(server) {
      // 提供 /api/lan-ip 接口，让前端获取本机局域网IP
      const lanIP = getLocalIP();
      server.middlewares.use('/api/lan-ip', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ip: lanIP }));
      });

      // 联机 WS 服务器：共享 Vite HTTP 端口，路径 /ws
      const manager = createRoomManager();
      const wss = new WebSocketServer({ noServer: true });
      wss.on('connection', (ws) => manager.handleConnection(ws));

      server.httpServer.on('upgrade', (req, socket, head) => {
        const url = req.url || '';
        // 只拦截 /ws 路径，其它(如 Vite HMR)放行
        if (url === '/ws' || url.startsWith('/ws?')) {
          wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
          });
        }
      });
      console.log('[LBQ3] 联机WebSocket共享Vite端口，路径 /ws');
    },
  }]
});
