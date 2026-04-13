// ===================== 房间管理（最多8人大厅） =====================
// 被 server.js (独立) 和 vite 插件共享

const MAX_PLAYERS = 8;

export function createRoomManager() {
  // code → { players: [{ws, slot, name}...], started, hostSlot }
  const rooms = new Map();
  let nextSlotId = 1; // 全局递增slot分配

  function generateCode() {
    let code;
    do { code = String(Math.floor(1000 + Math.random() * 9000)); }
    while (rooms.has(code));
    return code;
  }

  // 构建玩家列表（发送给客户端）
  function buildPlayerList(room) {
    return room.players.map(p => ({ slot: p.slot, name: p.name, isHost: p.slot === room.hostSlot, weaponId: p.weaponId || 'dao' }));
  }

  // 向房间所有人广播
  function broadcast(room, msg) {
    const data = JSON.stringify(msg);
    for (const p of room.players) {
      if (p.ws && p.ws.readyState === 1) p.ws.send(data);
    }
  }

  // 向房间内除了sender之外的人广播
  function broadcastExcept(room, sender, msg) {
    const data = JSON.stringify(msg);
    for (const p of room.players) {
      if (p.ws !== sender && p.ws && p.ws.readyState === 1) p.ws.send(data);
    }
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
          const name = sanitizeName(msg.name) || '玩家1';
          const slot = nextSlotId++;
          const player = { ws, slot, name, weaponId: 'dao' };
          rooms.set(code, { players: [player], started: false, hostSlot: slot, allowedWeapons: ['dao'] });
          ws._roomCode = code;
          ws._slot = slot;
          send(ws, { type: 'room_created', roomCode: code, slot, players: [{ slot, name, isHost: true, weaponId: 'dao' }], allowedWeapons: ['dao'] });
          console.log(`[房间] ${code} 创建 (${name})`);
          break;
        }
        case 'join_room': {
          if (ws._roomCode) break;
          const code = String(msg.roomCode).trim();
          const room = rooms.get(code);
          if (!room) { send(ws, { type: 'error', message: '房间不存在' }); break; }
          if (room.started) { send(ws, { type: 'error', message: '游戏已开始' }); break; }
          if (room.players.length >= MAX_PLAYERS) { send(ws, { type: 'error', message: '房间已满(最多' + MAX_PLAYERS + '人)' }); break; }
          const name = sanitizeName(msg.name) || ('玩家' + (room.players.length + 1));
          const slot = nextSlotId++;
          const player = { ws, slot, name, weaponId: 'dao' };
          room.players.push(player);
          ws._roomCode = code;
          ws._slot = slot;
          // 告知新玩家加入成功
          send(ws, { type: 'room_joined', roomCode: code, slot, players: buildPlayerList(room), allowedWeapons: room.allowedWeapons || ['dao'] });
          // 广播给其他人：玩家列表更新
          broadcastExcept(room, ws, { type: 'room_update', players: buildPlayerList(room) });
          console.log(`[加入] 房间 ${code} <- ${name} (${room.players.length}/${MAX_PLAYERS})`);
          break;
        }
        case 'host_start': {
          // 房主点击开始
          const room = rooms.get(ws._roomCode);
          if (!room) break;
          if (ws._slot !== room.hostSlot) break; // 非房主不能开始
          if (room.players.length < 2) { send(ws, { type: 'error', message: '至少需要2人才能开始' }); break; }
          room.started = true;
          // 给每个人发 game_start + 完整玩家列表
          const playerList = buildPlayerList(room);
          for (const p of room.players) {
            send(p.ws, { type: 'game_start', slot: p.slot, hostSlot: room.hostSlot, players: playerList, allowedWeapons: room.allowedWeapons || ['dao'] });
          }
          console.log(`[开始] 房间 ${ws._roomCode} (${room.players.length}人)`);
          break;
        }
        case 'update_weapon': {
          // 玩家更新武器选择
          const room = rooms.get(ws._roomCode);
          if (!room || room.started) break;
          const weaponId = sanitizeName(msg.weaponId) || 'dao';
          const p = room.players.find(p => p.ws === ws);
          if (p) {
            p.weaponId = weaponId;
            broadcast(room, { type: 'room_update', players: buildPlayerList(room) });
          }
          break;
        }
        case 'update_pool': {
          // 房主更新可用武器列表
          const room = rooms.get(ws._roomCode);
          if (!room || room.started) break;
          if (ws._slot !== room.hostSlot) break;
          if (Array.isArray(msg.weapons) && msg.weapons.length > 0) {
            room.allowedWeapons = msg.weapons.map(w => sanitizeName(w)).filter(Boolean);
            if (room.allowedWeapons.length === 0) room.allowedWeapons = ['dao'];
            // 将不在池中的玩家武器重置为第一个可用武器
            for (const p of room.players) {
              if (!room.allowedWeapons.includes(p.weaponId)) {
                p.weaponId = room.allowedWeapons[0];
              }
            }
            broadcast(room, { type: 'pool_update', allowedWeapons: room.allowedWeapons, players: buildPlayerList(room) });
          }
          break;
        }
        case 'relay': {
          // 转发给房间其他所有人
          const room = rooms.get(ws._roomCode);
          if (!room) break;
          for (const p of room.players) {
            if (p.ws !== ws && p.ws && p.ws.readyState === 1) {
              if (typeof raw === 'string') p.ws.send(raw);
              else p.ws.send(raw, { binary: false });
            }
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
    const leftSlot = ws._slot;
    ws._slot = -1;
    if (!room) return;

    // 找到并移除该玩家
    const idx = room.players.findIndex(p => p.ws === ws);
    const leftName = idx >= 0 ? room.players[idx].name : '???';
    if (idx >= 0) room.players.splice(idx, 1);

    if (room.players.length === 0) {
      rooms.delete(code);
      console.log(`[关闭] 房间 ${code}`);
      return;
    }

    // 如果房主离开，转移房主给第一个人
    if (leftSlot === room.hostSlot) {
      room.hostSlot = room.players[0].slot;
    }

    if (room.started) {
      // 游戏中有人离开
      broadcast(room, { type: 'player_left', slot: leftSlot, name: leftName, players: buildPlayerList(room) });
    } else {
      // 大厅中有人离开，更新列表
      broadcast(room, { type: 'room_update', players: buildPlayerList(room) });
    }
    console.log(`[离开] 房间 ${code}: ${leftName} (剩余${room.players.length}人)`);
  }

  function send(ws, msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  function sanitizeName(name) {
    if (!name || typeof name !== 'string') return '';
    return name.trim().slice(0, 12);
  }

  return { handleConnection, rooms };
}
