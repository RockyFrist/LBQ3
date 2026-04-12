// ===================== WebSocket 客户端 =====================

export class NetClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.roomCode = null;
    this.slot = -1; // 0 = host, 1 = guest
    this.onMessage = null;      // (data) => void  — 对手的 relay 数据
    this.onStateChange = null;  // (state, detail) => void
    this._state = 'disconnected';
    this._errorMsg = '';
  }

  get state() { return this._state; }
  get errorMessage() { return this._errorMsg; }

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

  createRoom() { this._send({ type: 'create_room' }); }
  joinRoom(code) { this._send({ type: 'join_room', roomCode: code }); }
  leaveRoom() { this._send({ type: 'leave_room' }); }

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
        this.slot = 0;
        this._setState('waiting');
        break;
      case 'room_joined':
        this.roomCode = msg.roomCode;
        this.slot = msg.slot;
        this._setState('room_joined');
        break;
      case 'game_start':
        this.slot = msg.slot;
        this._setState('game_start');
        break;
      case 'relay':
        if (this.onMessage) this.onMessage(msg.data);
        break;
      case 'opponent_left':
        this._setState('opponent_left');
        break;
      case 'error':
        this._errorMsg = msg.message || '未知错误';
        this._setState('error');
        break;
    }
  }

  _setState(s) {
    this._state = s;
    if (this.onStateChange) this.onStateChange(s);
  }
}
