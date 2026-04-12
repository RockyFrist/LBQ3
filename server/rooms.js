// ===================== 房间管理 =====================
// 被 server.js (独立) 和 vite 插件共享

export function createRoomManager() {
  const rooms = new Map(); // code → { players: [ws, ws], started }

  function generateCode() {
    let code;
    do { code = String(Math.floor(1000 + Math.random() * 9000)); }
    while (rooms.has(code));
    return code;
  }

  function handleConnection(ws) {
    ws._roomCode = null;
    ws._slot = -1;

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString()); } catch { return; }

      switch (msg.type) {
        case 'create_room': {
          if (ws._roomCode) break;
          const code = generateCode();
          rooms.set(code, { players: [ws, null], started: false });
          ws._roomCode = code;
          ws._slot = 0;
          send(ws, { type: 'room_created', roomCode: code });
          console.log(`[房间] ${code} 创建`);
          break;
        }
        case 'join_room': {
          if (ws._roomCode) break;
          const code = String(msg.roomCode).trim();
          const room = rooms.get(code);
          if (!room) { send(ws, { type: 'error', message: '房间不存在' }); break; }
          if (room.players[1] !== null) { send(ws, { type: 'error', message: '房间已满' }); break; }
          room.players[1] = ws;
          ws._roomCode = code;
          ws._slot = 1;
          send(ws, { type: 'room_joined', roomCode: code, slot: 1 });
          // 开始游戏
          room.started = true;
          send(room.players[0], { type: 'game_start', slot: 0 });
          send(room.players[1], { type: 'game_start', slot: 1 });
          console.log(`[开始] 房间 ${code}`);
          break;
        }
        case 'relay': {
          // 转发给对手（直接转发原始数据加速）
          const room = rooms.get(ws._roomCode);
          if (!room) break;
          const other = room.players[ws._slot === 0 ? 1 : 0];
          if (other && other.readyState === 1) {
            // 直接转发原始消息避免二次序列化
            if (typeof raw === 'string') other.send(raw);
            else other.send(raw, { binary: false });
          }
          break;
        }
        case 'leave_room': {
          leaveRoom(ws);
          break;
        }
      }
    });

    ws.on('close', () => leaveRoom(ws));
  }

  function leaveRoom(ws) {
    const code = ws._roomCode;
    if (!code) return;
    const room = rooms.get(code);
    ws._roomCode = null;
    ws._slot = -1;
    if (!room) return;
    const otherSlot = room.players[0] === ws ? 1 : 0;
    const other = room.players[otherSlot];
    if (other && other.readyState === 1) {
      send(other, { type: 'opponent_left' });
    }
    rooms.delete(code);
    console.log(`[关闭] 房间 ${code}`);
  }

  function send(ws, msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  return { handleConnection, rooms };
}
