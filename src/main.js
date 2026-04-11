import './style.css';
import { Input } from './core/input.js';
import { Game } from './game/game.js';
import { Menu } from './ui/menu.js';
import { NeuralNetwork } from './nn/nn-agent.js';
import { BrowserTrainer } from './nn/browser-train.js';
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
  canvas.width = Math.min(window.innerWidth, C.ARENA_W);
  canvas.height = Math.min(window.innerHeight, C.ARENA_H);
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
  if (controlsHelp) controlsHelp.style.display = result.mode === 'pvai' || result.mode === 'wusheng' || result.mode === 'jianghu' ? '' : 'none';
  game = new Game(canvas, input, {
    mode: result.mode,
    diffA: result.diffA,
    diffB: result.diffB,
    rounds: result.rounds,
    simOnly: result.simOnly || false,
    onExit: returnToMenu,
    nnWeights: nnWeights, // 传入武圣权重
  });
  if (game.mode !== 'test' && game.mode !== 'jianghu') {
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
  if (controlsHelp) controlsHelp.style.display = 'none';
  if (helpOverlay) helpOverlay.classList.add('hidden');
}

let lastTime = 0;

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 1 / 30);
  lastTime = timestamp;

  if (appState === 'menu') {
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
