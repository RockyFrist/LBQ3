// ===================== WebSocket 客户端（大厅模式） =====================

export class NetClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.roomCode = null;
    this.slot = -1;
    this.players = [];          // [{slot, name, isHost, weaponId}...]
    this.allowedWeapons = ['dao']; // 房主设置的可用武器池
    this.onMessage = null;      // (data) => void  — relay 数据
    this.onStateChange = null;  // (state, detail) => void
    this.onPlayersUpdate = null; // (players) => void — 玩家列表变更
    this.onPoolUpdate = null;   // (allowedWeapons) => void — 武器池变更
    this._state = 'disconnected';
    this._errorMsg = '';
  }

  get state() { return this._state; }
  get errorMessage() { return this._errorMsg; }
  get isHost() { return this.players.some(p => p.slot === this.slot && p.isHost); }

  connect(url) {
    if (this.ws) this.disconnect();
    this._setState('connecting');
    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      this._errorMsg = '连接失败';
      this._setState('error');
      return;
    }
    this.ws.onopen = () => {
      this.connected = true;
      this._setState('connected');
    };
    this.ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this._handleMessage(msg);
    };
    this.ws.onclose = () => {
      this.connected = false;
      if (this._state !== 'error') this._setState('disconnected');
    };
    this.ws.onerror = () => {
      this._errorMsg = '连接失败';
      this._setState('error');
    };
  }

  createRoom(name) { this._send({ type: 'create_room', name }); }
  joinRoom(code, name) { this._send({ type: 'join_room', roomCode: code, name }); }
  hostStart() { this._send({ type: 'host_start' }); }
  leaveRoom() { this._send({ type: 'leave_room' }); }
  updateWeapon(weaponId) { this._send({ type: 'update_weapon', weaponId }); }
  updatePool(weapons) { this._send({ type: 'update_pool', weapons }); }

  sendRelay(data) {
    this._send({ type: 'relay', data });
  }

  disconnect() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.roomCode = null;
    this.slot = -1;
    this.players = [];
    this.allowedWeapons = ['dao'];
    this._setState('disconnected');
  }

  _send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'room_created':
        this.roomCode = msg.roomCode;
        this.slot = msg.slot;
        this.players = msg.players || [];
        this.allowedWeapons = msg.allowedWeapons || ['dao'];
        this._setState('lobby');
        break;
      case 'room_joined':
        this.roomCode = msg.roomCode;
        this.slot = msg.slot;
        this.players = msg.players || [];
        this.allowedWeapons = msg.allowedWeapons || ['dao'];
        this._setState('lobby');
        break;
      case 'room_update':
        this.players = msg.players || [];
        if (this.onPlayersUpdate) this.onPlayersUpdate(this.players);
        break;
      case 'pool_update':
        this.allowedWeapons = msg.allowedWeapons || ['dao'];
        this.players = msg.players || [];
        if (this.onPoolUpdate) this.onPoolUpdate(this.allowedWeapons);
        if (this.onPlayersUpdate) this.onPlayersUpdate(this.players);
        break;
      case 'game_start':
        this.slot = msg.slot;
        this.players = msg.players || [];
        this.allowedWeapons = msg.allowedWeapons || ['dao'];
        this._setState('game_start');
        break;
      case 'relay':
        if (this.onMessage) this.onMessage(msg.data);
        break;
      case 'player_left':
        this.players = msg.players || [];
        if (this.onPlayersUpdate) this.onPlayersUpdate(this.players);
        this._setState('player_left', msg);
        break;
      case 'error':
        this._errorMsg = msg.message || '未知错误';
        this._setState('error');
        break;
    }
  }

  _setState(s, detail) {
    this._state = s;
    if (this.onStateChange) this.onStateChange(s, detail);
  }
}
