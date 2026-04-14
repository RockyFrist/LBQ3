import './style.css';
import { Input } from './core/input.js';
import { Game } from './game/game.js';
import { Menu } from './ui/menu.js';
import { NeuralNetwork } from './nn/nn-agent.js';
import { BrowserTrainer } from './nn/browser-train.js';
import { NetClient } from './net/net-client.js';
import { AudioManager } from './core/audio.js';
import * as C from './core/constants.js';
import { WEAPON_LIST } from './weapons/weapon-defs.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const controlsHelp = document.getElementById('controls-help');
const helpOverlay = document.getElementById('help-overlay');
const audio = new AudioManager();

// 首次用户交互后恢复 AudioContext
const resumeAudio = () => { audio.resume(); };
window.addEventListener('click', resumeAudio, { once: true });
window.addEventListener('keydown', resumeAudio, { once: true });

// 帮助面板：点击遮罩层关闭
if (helpOverlay) {
  helpOverlay.addEventListener('click', (e) => {
    // 点击遮罩区域（非面板内容）关闭
    if (e.target === helpOverlay) {
      helpOverlay.classList.add('hidden');
    }
  });
  // 关闭按钮
  const closeBtn = document.getElementById('help-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      helpOverlay.classList.add('hidden');
    });
  }
}

// 全局 H 键关闭帮助（菜单和游戏中都生效）
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyH' && helpOverlay && !helpOverlay.classList.contains('hidden')) {
    helpOverlay.classList.add('hidden');
  }
});

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width  = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  // CSS 尺寸 = 逻辑像素，确保不拉伸
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  // 存储逻辑尺寸+DPR供所有模块使用
  canvas._dpr    = dpr;
  canvas._logicW = w;
  canvas._logicH = h;
}
resize();
window.addEventListener('resize', resize);

const input = new Input(canvas);

// 应用状态
let appState = 'menu'; // 'menu' | 'playing'
let game = null;
let menu = new Menu(canvas, input);
let nnWeights = null; // 武圣权重缓存

// 异步加载 NN 权重
fetch('./nn-weights.json')
  .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
  .then(data => {
    nnWeights = NeuralNetwork.fromJSON(data);
    menu.nnWeightsLoaded = true;
  })
  .catch(() => {
    menu.nnLoadError = true;
  });

// 设置训练回调
setupTrainCallbacks(menu);
setupOnlineCallback(menu);

function setupTrainCallbacks(m) {
  m._onTrainStart = () => {
    const trainer = new BrowserTrainer({
      generations: 50,
      episodes: 10,
      curriculum: true,
      policyNet: nnWeights ? nnWeights.clone() : undefined,
    });
    m.trainer = trainer;
    trainer.start().then(() => {
      // 训练完成: 更新权重
      nnWeights = trainer.getNetwork();
      m.nnWeightsLoaded = true;
      m.nnLoadError = false;
    });
  };
  m._onDownloadWeights = () => {
    if (!nnWeights) return;
    const json = JSON.stringify(nnWeights.toJSON());
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nn-weights.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  m._onUploadWeights = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          nnWeights = NeuralNetwork.fromJSON(data);
          m.nnWeightsLoaded = true;
          m.nnLoadError = false;
        } catch (err) {
          console.error('权重文件解析失败:', err);
        }
      };
      reader.readAsText(file);
    });
    fileInput.click();
  };
}

function startGame(result) {
  appState = 'playing';
  // 根据模式显示/隐藏右侧快捷键提示，并更新内容
  const showControls = result.mode === 'pvai' || result.mode === 'wusheng' || result.mode === 'chainKill';
  if (controlsHelp) {
    controlsHelp.style.display = showControls ? '' : 'none';
    if (showControls) _updateControlsHelp(result.mode);
  }
  game = new Game(canvas, input, {
    mode: result.mode,
    diffA: result.diffA,
    diffB: result.diffB,
    rounds: result.rounds,
    simOnly: result.simOnly || false,
    onExit: returnToMenu,
    nnWeights: nnWeights,
    netClient: result.netClient || null,
    tutorialStep: result.tutorialStep || 0,
    audio: audio,
    weaponA: result.weaponA || 'dao',
    weaponB: result.weaponB || 'dao',
  });
  if (game.mode !== 'test' && game.mode !== 'jianghu' && game.mode !== 'training'
      && game.mode !== 'online_host' && game.mode !== 'online_guest' && game.mode !== 'tutorial'
      && game.mode !== 'local2p' && game.mode !== 'arena' && game.mode !== 'horseracing') {
    game.spawnEnemy();
  }
}

function returnToMenu() {
  appState = 'menu';
  game = null;
  // 清理联机状态
  if (netClient) {
    netClient.onMessage = null;
    netClient.onStateChange = null;
    netClient.onPlayersUpdate = null;
    netClient.onPoolUpdate = null;
    netClient.disconnect();
    netClient = null;
  }
  menu = new Menu(canvas, input);
  // 恢复 NN 加载状态
  if (nnWeights) menu.nnWeightsLoaded = true;
  else if (!nnWeights) menu.nnLoadError = true;
  setupTrainCallbacks(menu);
  setupOnlineCallback(menu);
  if (controlsHelp) controlsHelp.style.display = 'none';
  if (helpOverlay) helpOverlay.classList.add('hidden');
  // 确保房间面板关闭
  if (roomOverlay) roomOverlay.classList.add('hidden');
}

/** 根据游戏模式更新右侧快捷键提示内容 */
function _updateControlsHelp(mode) {
  if (!controlsHelp) return;
  const lines = [
    'WASD 移动',
    '左键 轻击',
    '右键 重击',
    '空格 招架',
    'Shift+方向 闪避',
    'F 绝技(炁满)',
  ];
  if (mode === 'training') {
    lines.push('E 召唤敌人', 'I 召唤队友', 'O 充满炁', 'P 暂停/恢复AI', 'R 重置', '1-5 难度', 'H 帮助');
  } else if (mode === 'chainKill') {
    lines.push('R 重置', 'H 帮助');
  } else {
    // pvai, wusheng
    lines.push('E 刷出敌人', 'I 召唤队友', 'R 重置', '1-5 难度', 'H 帮助');
  }
  controlsHelp.innerHTML = lines.map(l => `<div>${l}</div>`).join('');
}

// ===================== 联机房间控制器（大厅模式，最多8人） =====================
const roomOverlay = document.getElementById('room-overlay');
const roomServer = document.getElementById('room-server');
const roomNickname = document.getElementById('room-nickname');
const roomStatus = document.getElementById('room-status');
const roomCodeText = document.getElementById('room-code-text');
const roomCodeInput = document.getElementById('room-code-input');
const roomStepInit = document.getElementById('room-step-init');
const roomStepLobby = document.getElementById('room-step-lobby');
const roomPlayerList = document.getElementById('room-player-list');
const roomPlayerCount = document.getElementById('room-player-count');
const btnHostStart = document.getElementById('btn-host-start');
const roomWeaponSelect = document.getElementById('room-weapon-select');
const roomHostWeapons = document.getElementById('room-host-weapons');
const roomWeaponPool = document.getElementById('room-weapon-pool');

let netClient = null;
let _lanIP = ''; // 服务端检测的局域网IP
let _selectedWeaponId = 'dao'; // 当前选择的武器

// 从 Vite 开发服务器获取本机局域网IP（GitHub Pages上会404，无影响）
fetch('/api/lan-ip').then(r => r.json()).then(d => { _lanIP = d.ip || ''; }).catch(() => {});

function setRoomStatus(text, cls = '') {
  if (roomStatus) {
    roomStatus.textContent = text;
    roomStatus.className = 'room-status' + (cls ? ' ' + cls : '');
  }
}

function resetRoomUI() {
  if (roomStepInit) roomStepInit.style.display = '';
  if (roomStepLobby) roomStepLobby.style.display = 'none';
  if (btnHostStart) btnHostStart.style.display = 'none';
  if (roomCodeInput) roomCodeInput.value = '';
  if (roomPlayerList) roomPlayerList.innerHTML = '';
  if (roomWeaponSelect) roomWeaponSelect.innerHTML = '';
  if (roomWeaponPool) roomWeaponPool.innerHTML = '';
  if (roomHostWeapons) roomHostWeapons.style.display = 'none';
  _selectedWeaponId = 'dao';
  setRoomStatus('');
}

// 进入大厅界面
function showLobby() {
  if (roomStepInit) roomStepInit.style.display = 'none';
  if (roomStepLobby) roomStepLobby.style.display = '';
  if (roomCodeText) roomCodeText.textContent = netClient.roomCode;
  const allowed = netClient ? netClient.allowedWeapons : ['dao'];
  // 如果当前选择不在允许列表中，重置
  if (!allowed.includes(_selectedWeaponId)) _selectedWeaponId = allowed[0] || 'dao';
  renderWeaponSelect(allowed);
  // 房主显示武器池设置
  if (roomHostWeapons) {
    roomHostWeapons.style.display = (netClient && netClient.isHost) ? '' : 'none';
  }
  if (netClient && netClient.isHost) {
    renderWeaponPool(allowed);
  }
  updatePlayerListUI(netClient.players);
}

// 更新玩家列表UI
function updatePlayerListUI(players) {
  if (!roomPlayerList) return;
  if (roomPlayerCount) roomPlayerCount.textContent = `${players.length}/8`;
  const weaponMap = {};
  for (const w of WEAPON_LIST) weaponMap[w.id] = w;
  roomPlayerList.innerHTML = players.map((p, i) => {
    const hostBadge = p.isHost ? ' <span class="room-host-badge">👑房主</span>' : '';
    const selfBadge = (netClient && p.slot === netClient.slot) ? ' <span class="room-self-badge">(我)</span>' : '';
    const wp = weaponMap[p.weaponId] || weaponMap['dao'];
    const weaponTag = ` <span class="room-weapon-tag">${wp.icon}${wp.name}</span>`;
    return `<div class="room-player-item">${i + 1}. ${escapeHtml(p.name)}${weaponTag}${hostBadge}${selfBadge}</div>`;
  }).join('');
  // 只有房主显示开始按钮
  if (btnHostStart) {
    btnHostStart.style.display = (netClient && netClient.isHost) ? '' : 'none';
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// 渲染武器选择按钮
function renderWeaponSelect(allowedWeapons) {
  if (!roomWeaponSelect) return;
  roomWeaponSelect.innerHTML = WEAPON_LIST.map(w => {
    const allowed = allowedWeapons.includes(w.id);
    const selected = w.id === _selectedWeaponId;
    const cls = 'room-weapon-btn' + (selected ? ' selected' : '') + (!allowed ? ' disabled' : '');
    return `<button class="${cls}" data-wid="${w.id}" ${!allowed ? 'disabled' : ''}>${w.icon} ${w.name}</button>`;
  }).join('');
  // 绑定点击
  for (const btn of roomWeaponSelect.querySelectorAll('.room-weapon-btn:not(.disabled)')) {
    btn.addEventListener('click', () => {
      _selectedWeaponId = btn.dataset.wid;
      renderWeaponSelect(netClient ? netClient.allowedWeapons : ['dao']);
      if (netClient) netClient.updateWeapon(_selectedWeaponId);
    });
  }
}

// 渲染房主武器池设置
function renderWeaponPool(allowedWeapons) {
  if (!roomWeaponPool) return;
  roomWeaponPool.innerHTML = WEAPON_LIST.map(w => {
    const checked = allowedWeapons.includes(w.id);
    return `<label class="room-pool-label"><input type="checkbox" data-wid="${w.id}" ${checked ? 'checked' : ''} /> ${w.icon} ${w.name}</label>`;
  }).join('');
  // 绑定变更
  for (const cb of roomWeaponPool.querySelectorAll('input[type="checkbox"]')) {
    cb.addEventListener('change', () => {
      const selected = [];
      for (const c of roomWeaponPool.querySelectorAll('input[type="checkbox"]:checked')) {
        selected.push(c.dataset.wid);
      }
      // 至少保留一个
      if (selected.length === 0) {
        cb.checked = true;
        return;
      }
      if (netClient) netClient.updatePool(selected);
    });
  }
}

function showRoomOverlay() {
  resetRoomUI();
  // 默认昵称
  if (roomNickname && !roomNickname.value.trim()) {
    roomNickname.value = '玩家' + Math.floor(Math.random() * 900 + 100);
  }
  // 默认填入当前页面地址（WS共享同一端口）
  if (roomServer && !roomServer.value.trim()) {
    const host = _lanIP || location.hostname || 'localhost';
    const port = location.port || '5173';
    roomServer.value = host + ':' + port;
  }
  // HTTPS环境提示
  if (location.protocol === 'https:') {
    setRoomStatus('⚠️ 当前是HTTPS页面，无法连接ws服务器。\n请访问 http://主机IP:5173 来联机', 'error');
  }
  if (roomOverlay) roomOverlay.classList.remove('hidden');
}

function hideRoomOverlay() {
  if (roomOverlay) roomOverlay.classList.add('hidden');
  if (netClient) { netClient.disconnect(); netClient = null; }
}

// 获取昵称
function getNickname() {
  return (roomNickname ? roomNickname.value.trim() : '') || ('玩家' + Math.floor(Math.random() * 900 + 100));
}

// 通用状态处理
function setupNetClientHandlers(afterConnect) {
  netClient.onPlayersUpdate = (players) => updatePlayerListUI(players);
  netClient.onPoolUpdate = (allowedWeapons) => {
    // 如果当前选择不在允许列表中，重置
    if (!allowedWeapons.includes(_selectedWeaponId)) {
      _selectedWeaponId = allowedWeapons[0] || 'dao';
      netClient.updateWeapon(_selectedWeaponId);
    }
    renderWeaponSelect(allowedWeapons);
    if (netClient.isHost) renderWeaponPool(allowedWeapons);
  };
  netClient.onStateChange = (state, detail) => {
    switch (state) {
      case 'connecting':
        setRoomStatus('连接中...', 'waiting');
        break;
      case 'connected':
        setRoomStatus('已连接...', 'waiting');
        afterConnect();
        break;
      case 'lobby':
        setRoomStatus('等待房主开始游戏...', 'waiting');
        showLobby();
        break;
      case 'game_start': {
        setRoomStatus('游戏开始!', 'success');
        // 找到自己和对手的武器
        const myPlayer = netClient.players.find(p => p.slot === netClient.slot);
        const otherPlayer = netClient.players.find(p => p.slot !== netClient.slot);
        const myWeapon = myPlayer ? myPlayer.weaponId : _selectedWeaponId;
        const otherWeapon = otherPlayer ? otherPlayer.weaponId : 'dao';
        setTimeout(() => {
          if (roomOverlay) roomOverlay.classList.add('hidden');
          startGame({
            mode: netClient.isHost ? 'online_host' : 'online_guest',
            netClient: netClient,
            weaponA: myWeapon,
            weaponB: otherWeapon,
          });
        }, 300);
        break;
      }
      case 'player_left': {
        const who = detail ? detail.name : '对手';
        if (game) {
          // 游戏中有人离开，显示提示后返回菜单
          returnToMenu();
          // returnToMenu 会重建 menu，这里用 alert 弹出提示
          setTimeout(() => alert(`${who} 已断开连接，对局结束。`), 50);
        }
        break;
      }
      case 'error':
        setRoomStatus(netClient.errorMessage || '连接失败', 'error');
        resetRoomUI();
        break;
      case 'disconnected':
        setRoomStatus('已断开', 'error');
        resetRoomUI();
        break;
    }
  };
}

// 创建房间
if (document.getElementById('btn-create-room')) {
  document.getElementById('btn-create-room').addEventListener('click', () => {
    const addr = roomServer ? roomServer.value.trim() : (location.host || 'localhost:5173');
    if (!addr) { setRoomStatus('请输入服务器地址', 'error'); return; }
    const name = getNickname();
    netClient = new NetClient();
    setupNetClientHandlers(() => netClient.createRoom(name));
    netClient.connect('ws://' + addr + '/ws');
  });
}

// 加入房间
if (document.getElementById('btn-confirm-join')) {
  document.getElementById('btn-confirm-join').addEventListener('click', () => {
    const addr = roomServer ? roomServer.value.trim() : (location.host || 'localhost:5173');
    const code = roomCodeInput ? roomCodeInput.value.trim() : '';
    if (!addr) { setRoomStatus('请输入服务器地址', 'error'); return; }
    if (!code || code.length !== 4) { setRoomStatus('请输入4位房间号', 'error'); return; }
    const name = getNickname();
    netClient = new NetClient();
    setupNetClientHandlers(() => netClient.joinRoom(code, name));
    netClient.connect('ws://' + addr + '/ws');
  });
}

// 房主点击开始
if (btnHostStart) {
  btnHostStart.addEventListener('click', () => {
    if (netClient && netClient.isHost) {
      netClient.hostStart();
    }
  });
}

// 加入面板回车确认
if (roomCodeInput) {
  roomCodeInput.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
      document.getElementById('btn-confirm-join')?.click();
    }
  });
}

// 返回菜单
if (document.getElementById('btn-room-back')) {
  document.getElementById('btn-room-back').addEventListener('click', () => {
    hideRoomOverlay();
  });
}

// 复制邀请信息（包含访问地址+服务器地址+房间号）
if (document.getElementById('btn-copy-code')) {
  document.getElementById('btn-copy-code').addEventListener('click', () => {
    const code = roomCodeText ? roomCodeText.textContent : '';
    if (!code) return;
    let addr = roomServer ? roomServer.value.trim() : '';
    // 复制时把 localhost 替换为局域网IP
    if (_lanIP && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(addr)) {
      addr = addr.replace(/^(localhost|127\.0\.0\.1)/, _lanIP);
    }
    // 拼接访问地址（WS和页面共享同一端口）
    const gameUrl = `http://${addr}/`;
    const shareText = `【冷兵器对战】联机邀请\n游戏地址: ${gameUrl}\n房间号: ${code}`;
    const doCopy = (text) => {
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('btn-copy-code');
        if (btn) { btn.textContent = '✅ 已复制'; setTimeout(() => btn.textContent = '📋 复制', 1500); }
      }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch(_) {}
        document.body.removeChild(ta);
        const btn = document.getElementById('btn-copy-code');
        if (btn) { btn.textContent = '✅ 已复制'; setTimeout(() => btn.textContent = '📋 复制', 1500); }
      });
    };
    doCopy(shareText);
  });
}

function setupOnlineCallback(m) {
  m._onOpenOnline = () => showRoomOverlay();
}

let lastTime = 0;

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 1 / 30);
  lastTime = timestamp;

  if (appState === 'menu') {
    const dpr = canvas._dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    menu.update(dt);
    menu.draw();
    if (menu.result) {
      startGame(menu.result);
    }
  } else if (appState === 'playing' && game) {
    game.update(dt);
    if (game) game.render();
  }

  input.endFrame();
  requestAnimationFrame(loop);
}

// 初始隐藏controls-help
if (controlsHelp) controlsHelp.style.display = 'none';

requestAnimationFrame((ts) => {
  lastTime = ts;
  requestAnimationFrame(loop);
});
