import './style.css';
import { Input } from './core/input.js';
import { Game } from './game/game.js';
import { Menu } from './ui/menu.js';
import { NeuralNetwork } from './nn/nn-agent.js';
import { BrowserTrainer } from './nn/browser-train.js';
import { NetClient } from './net/net-client.js';
import * as C from './core/constants.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const controlsHelp = document.getElementById('controls-help');
const helpOverlay = document.getElementById('help-overlay');

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
  });
  if (game.mode !== 'test' && game.mode !== 'jianghu' && game.mode !== 'training'
      && game.mode !== 'online_host' && game.mode !== 'online_guest' && game.mode !== 'tutorial') {
    game.spawnEnemy();
  }
}

function returnToMenu() {
  appState = 'menu';
  game = null;
  menu = new Menu(canvas, input);
  // 恢复 NN 加载状态
  if (nnWeights) menu.nnWeightsLoaded = true;
  else if (!nnWeights) menu.nnLoadError = true;
  setupTrainCallbacks(menu);
  setupOnlineCallback(menu);
  if (controlsHelp) controlsHelp.style.display = 'none';
  if (helpOverlay) helpOverlay.classList.add('hidden');
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

// ===================== 联机房间控制器 =====================
const roomOverlay = document.getElementById('room-overlay');
const roomServer = document.getElementById('room-server');
const roomStatus = document.getElementById('room-status');
const roomCodeDisplay = document.getElementById('room-code-display');
const roomCodeText = document.getElementById('room-code-text');
const roomCodeInput = document.getElementById('room-code-input');
const actionsInit = document.getElementById('room-actions-init');

let netClient = null;

function setRoomStatus(text, cls = '') {
  if (roomStatus) {
    roomStatus.textContent = text;
    roomStatus.className = 'room-status' + (cls ? ' ' + cls : '');
  }
}

function resetRoomUI() {
  if (actionsInit) actionsInit.classList.remove('hidden');
  if (roomCodeDisplay) roomCodeDisplay.classList.add('hidden');
  if (roomCodeInput) roomCodeInput.value = '';
  setRoomStatus('');
}

function showRoomOverlay() {
  resetRoomUI();
  if (roomOverlay) roomOverlay.classList.remove('hidden');
}

function hideRoomOverlay() {
  if (roomOverlay) roomOverlay.classList.add('hidden');
  if (netClient) { netClient.disconnect(); netClient = null; }
}

// 创建房间
if (document.getElementById('btn-create-room')) {
  document.getElementById('btn-create-room').addEventListener('click', () => {
    const addr = roomServer ? roomServer.value.trim() : 'localhost:3000';
    if (!addr) { setRoomStatus('请输入服务器地址', 'error'); return; }
    netClient = new NetClient();
    netClient.onStateChange = (state) => {
      switch (state) {
        case 'connecting':
          setRoomStatus('连接中...', 'waiting');
          if (actionsInit) actionsInit.classList.add('hidden');
          break;
        case 'connected':
          setRoomStatus('已连接，创建房间...', 'waiting');
          netClient.createRoom();
          break;
        case 'waiting':
          setRoomStatus('等待对手加入...', 'waiting');
          if (roomCodeDisplay) roomCodeDisplay.classList.remove('hidden');
          if (roomCodeText) roomCodeText.textContent = netClient.roomCode;
          break;
        case 'game_start':
          setRoomStatus('对手已加入! 游戏开始!', 'success');
          setTimeout(() => {
            if (roomOverlay) roomOverlay.classList.add('hidden');
            startGame({
              mode: netClient.slot === 0 ? 'online_host' : 'online_guest',
              netClient: netClient,
            });
          }, 300);
          break;
        case 'opponent_left':
          setRoomStatus('对手已断开', 'error');
          if (game) { returnToMenu(); showRoomOverlay(); }
          resetRoomUI();
          break;
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
    netClient.connect('ws://' + addr);
  });
}

// 加入房间
if (document.getElementById('btn-confirm-join')) {
  document.getElementById('btn-confirm-join').addEventListener('click', () => {
    const addr = roomServer ? roomServer.value.trim() : 'localhost:3000';
    const code = roomCodeInput ? roomCodeInput.value.trim() : '';
    if (!addr) { setRoomStatus('请输入服务器地址', 'error'); return; }
    if (!code || code.length !== 4) { setRoomStatus('请输入4位房间号', 'error'); return; }
    netClient = new NetClient();
    netClient.onStateChange = (state) => {
      switch (state) {
        case 'connecting':
          setRoomStatus('连接中...', 'waiting');
          break;
        case 'connected':
          setRoomStatus('已连接，加入房间...', 'waiting');
          netClient.joinRoom(code);
          break;
        case 'game_start':
          setRoomStatus('加入成功! 游戏开始!', 'success');
          setTimeout(() => {
            if (roomOverlay) roomOverlay.classList.add('hidden');
            startGame({
              mode: netClient.slot === 0 ? 'online_host' : 'online_guest',
              netClient: netClient,
            });
          }, 300);
          break;
        case 'opponent_left':
          setRoomStatus('对手已断开', 'error');
          if (game) { returnToMenu(); showRoomOverlay(); }
          resetRoomUI();
          break;
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
    netClient.connect('ws://' + addr);
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

// 复制房间号
if (document.getElementById('btn-copy-code')) {
  document.getElementById('btn-copy-code').addEventListener('click', () => {
    const code = roomCodeText ? roomCodeText.textContent : '';
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById('btn-copy-code');
      if (btn) { btn.textContent = '✅ 已复制'; setTimeout(() => btn.textContent = '📋 复制', 1500); }
    }).catch(() => {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = code; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    });
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
