import * as C from '../core/constants.js';
import { dist, angleBetween, randomRange } from '../core/utils.js';
import { Player } from '../combat/player.js';
import { Enemy } from '../ai/enemy.js';
import { CombatSystem } from '../combat/combat-system.js';
import { ParticleSystem } from '../render/particles.js';
import { Camera } from '../core/camera.js';
import { Renderer } from '../render/renderer.js';
import { UI } from '../ui/ui.js';
import { extractState, actionToCommand } from '../nn/nn-agent.js';
import { eventLogMethods } from './event-log.js';
import { testModeMethods } from './test-mode.js';
import { jianghuModeMethods } from './jianghu-mode.js';
import { settingsPanelMethods } from './settings-panel.js';
import { effectsMethods } from './effects.js';
import { tutorialModeMethods } from './tutorial-mode.js';
import { JIANGHU_MAX_LIVES } from './jianghu-stages.js';
import { Fighter } from '../combat/fighter.js';
import { snapshotFighter, applyFighterSnapshot, serializeEvent, deserializeEvent } from '../net/net-sync.js';

export class Game {
  constructor(canvas, input, opts = {}) {
    this.canvas = canvas;
    this.input = input;
    this.camera = new Camera();
    this.camera.resize(canvas._logicW || canvas.width, canvas._logicH || canvas.height);
    this.particles = new ParticleSystem();
    this.renderer = new Renderer(canvas, this.camera);
    this.combat = new CombatSystem(this.particles, this.camera);
    this.ui = new UI(canvas);

    // 模式: 'pvai' | 'spectate' | 'test'
    this.mode = opts.mode || 'pvai';
    this.onExit = opts.onExit || null; // 返回菜单回调

    this.gameTime = 0;
    this.paused = false;
    this.showHelp = false;
    this.difficulty = opts.diffB || 2;
    this.player = new Player(C.ARENA_W / 2, C.ARENA_H / 2);
    this.enemies = [];
    this.allFighters = [];

    // AI代替玩家（观战/测试模式）
    this.playerAI = null;
    if (this.mode === 'spectate' || this.mode === 'test') {
      const diffA = opts.diffA || 3;
      this.playerAI = new Enemy(C.ARENA_W / 2, C.ARENA_H / 2, diffA);
      this.playerAI.fighter = this.player.fighter; // 复用player的fighter
      this.playerAI.fighter.name = `AI-${diffA}(蓝)`;
      this.playerAI.fighter.color = '#4499ff';
    }

    // 告知战斗系统玩家角色（用于判断是否触发镜头/特效）
    // 观战/测试模式下 playerFighter 为 null → 所有战斗都触发特效
    this.combat.playerFighter =
      (this.mode !== 'spectate' && this.mode !== 'test') ? this.player.fighter : null;

    // 武圣(神经网络)模式
    this.nnWeights = opts.nnWeights || null; // NeuralNetwork 实例
    this._nnActionTimer = 0;
    this._nnLastAction = 0;
    this._nnDecisionInterval = 0.1; // 每 0.1s 决策一次
    if (this.mode === 'wusheng_spectate') {
      // 武圣观战: NN 控制蓝方, D5 控制红方
      this.playerAI = { fighter: this.player.fighter, isNN: true };
      this.player.fighter.name = '武圣(NN)';
      this.player.fighter.color = '#ff00ff';
    } else if (this.mode === 'wusheng') {
      // 玩家挑战武圣: 玩家操作蓝方, NN 控制红方
      this.player.fighter.name = '玩家';
    }

    // 测试模式
    this.testSpeed = 8; // 视觉模式倍速
    this.testSimOnly = opts.simOnly || false; // 纯数据模式（无渲染）
    this.testRounds = opts.rounds || 20;
    this.testRound = 0;
    this.testDone = false;
    this.testStats = [];
    this.testRoundStats = null; // 当前轮统计
    this.testDiffA = opts.diffA || 3;
    this.testDiffB = opts.diffB || 3;

    // 浮动文字
    this.floatingTexts = [];
    // 屏幕闪光
    this.screenFlash = { color: '', timer: 0, maxTimer: 0 };
    // 冻结帧（hitstop）
    this.hitFreezeTimer = 0;
    // 时间缩放（慢动作博弈窗口）
    this.timeScale = 1;
    this.timeScaleTimer = 0;
    // 胜利散步
    this._victoryTimer = -1;
    // 测试结果帧延迟（防止菜单点击穿透）
    this._testResultReady = false;
    // DOM帮助面板
    this.helpOverlay = document.getElementById('help-overlay');

    // ===== 队友系统 =====
    this.allies = []; // AI队友列表

    // ===== 设置面板 =====
    this.settingsOpen = false;
    this._settingsClickCd = 0;

    // ===== 江湖行 =====
    this.jianghuStage = 0;       // 当前关卡索引
    this.jianghuLives = JIANGHU_MAX_LIVES;
    this.jianghuPhase = 'story';  // 'story' | 'fight' | 'victory' | 'defeat' | 'complete'
    this.jianghuStoryTimer = 0;
    this.jianghuFadeTimer = 0;

    // ===== 连战模式 =====
    this.chainKills = 0;         // 连战击杀数
    this._chainSpawnDelay = 0;   // 击杀后延迟spawn

    this._rebuildFighterList();

    // ===== 联机对战初始化 =====
    if (this.mode === 'online_host' || this.mode === 'online_guest') {
      this._setupOnline(opts);
    }

    if (this.mode === 'test') {
      if (this.testSimOnly) {
        this._runAllTestsSync();
      } else {
        this._startTestRound();
      }
    }

    if (this.mode === 'jianghu') {
      this.jianghuPhase = 'story';
      this.jianghuStoryTimer = 0;
    }

    // ===== 教学模式初始化 =====
    if (this.mode === 'tutorial') {
      this._TutorialEnemyClass = Enemy;
      this._setupTutorial(opts.tutorialStep || 0);
    }
  }

  spawnEnemy(opts = {}) {
    const angle = Math.random() * Math.PI * 2;
    const r = 150 + Math.random() * 100;
    const px = this.player.fighter.x;
    const py = this.player.fighter.y;
    let ex = px + Math.cos(angle) * r;
    let ey = py + Math.sin(angle) * r;
    ex = Math.max(40, Math.min(C.ARENA_W - 40, ex));
    ey = Math.max(40, Math.min(C.ARENA_H - 40, ey));

    if (this.mode === 'wusheng' && this.nnWeights) {
      // 武圣挑战: 用 NN 控制敌人
      const enemy = new Enemy(ex, ey, 5); // 基础难度5骨架
      enemy.fighter.name = '武圣(NN)';
      enemy.fighter.color = '#ff00ff';
      enemy._isNN = true;
      this.enemies.push(enemy);
      this._rebuildFighterList();
      this.ui.addLog('武圣(NN) 现身!');
      return;
    }
    if (this.mode === 'wusheng_spectate') {
      // 武圣观战: 普通 D5 敌人
      const enemy = new Enemy(ex, ey, 5);
      enemy.fighter.name = 'AI-5(红)';
      this.enemies.push(enemy);
      this._rebuildFighterList();
      this.ui.addLog('AI-5(红) 出现了!');
      return;
    }

    const enemy = new Enemy(ex, ey, this.difficulty);
    if (this.mode === 'spectate' || this.mode === 'test') {
      enemy.fighter.name = `AI-${this.difficulty}(红)`;
    } else {
      enemy.fighter.name = `敌人${this.enemies.length + 1}`;
    }
    this.enemies.push(enemy);
    this._rebuildFighterList();
    this.ui.addLog(`${enemy.fighter.name} 出现了!`);
  }

  /** 江湖行专用: 按关卡数据生成敌人 */
  _spawnJianghuEnemy() {
    const stage = JIANGHU_STAGES[this.jianghuStage];
    if (!stage) return;
    const ec = stage.enemy;
    const px = this.player.fighter.x;
    const py = this.player.fighter.y;
    const angle = Math.random() * Math.PI * 2;
    const r = 160;
    let ex = px + Math.cos(angle) * r;
    let ey = py + Math.sin(angle) * r;
    ex = Math.max(60, Math.min(C.ARENA_W - 60, ex));
    ey = Math.max(60, Math.min(C.ARENA_H - 60, ey));

    const enemy = new Enemy(ex, ey, ec.difficulty, {
      scale: ec.scale,
      hpMult: ec.hpMult,
      color: ec.color,
      name: ec.name,
    });
    this.enemies.push(enemy);
    this._rebuildFighterList();
    this.ui.addLog(`${ec.name} 现身!`);
  }

  reset() {
    this._victoryTimer = -1;
    this.player = new Player(C.ARENA_W / 2, C.ARENA_H / 2);
    if (this.playerAI && this.playerAI.isNN) {
      // 武圣观战: 重新设置 NN 代理
      this.playerAI = { fighter: this.player.fighter, isNN: true };
      this.player.fighter.name = '武圣(NN)';
      this.player.fighter.color = '#ff00ff';
      this._nnActionTimer = 0;
      this._nnLastAction = 0;
    } else if (this.playerAI) {
      const diffA = this.playerAI.difficulty;
      this.playerAI = new Enemy(C.ARENA_W / 2, C.ARENA_H / 2, diffA);
      this.playerAI.fighter = this.player.fighter;
      this.playerAI.fighter.name = `AI-${diffA}(蓝)`;
      this.playerAI.fighter.color = '#4499ff';
    }
    if (this.mode === 'wusheng') {
      this.player.fighter.name = '玩家';
      this._nnActionTimer = 0;
      this._nnLastAction = 0;
    }
    this.enemies = [];
    this.allies = [];
    this.particles.particles = [];
    this._rebuildFighterList();
    if (this.mode !== 'training') this.spawnEnemy();
    this.ui.addLog('--- 重置 ---');
  }

  spawnAlly() {
    const angle = Math.random() * Math.PI * 2;
    const r = 100 + Math.random() * 60;
    const px = this.player.fighter.x;
    const py = this.player.fighter.y;
    let ax = px + Math.cos(angle) * r;
    let ay = py + Math.sin(angle) * r;
    ax = Math.max(40, Math.min(C.ARENA_W - 40, ax));
    ay = Math.max(40, Math.min(C.ARENA_H - 40, ay));
    const ally = new Enemy(ax, ay, this.difficulty);
    ally.fighter.name = `队友${this.allies.length + 1}`;
    ally.fighter.color = '#44ddaa';
    ally.fighter.team = 0; // 和玩家同队，不互相伤害
    ally._isAlly = true;
    this.allies.push(ally);
    this._rebuildFighterList();
    this.ui.addLog(`队友${this.allies.length} 加入!`);
  }

  _rebuildFighterList() {
    if (this.remoteFighter) {
      // 联机模式: allFighters[0] = slot0(主机), allFighters[1] = slot1(客机)
      if (this.mode === 'online_host') {
        this.allFighters = [this.player.fighter, this.remoteFighter];
      } else {
        this.allFighters = [this.remoteFighter, this.player.fighter];
      }
      return;
    }
    this.allFighters = [this.player.fighter];
    for (const a of this.allies) {
      this.allFighters.push(a.fighter);
    }
    for (const e of this.enemies) {
      this.allFighters.push(e.fighter);
    }
  }

  _getTarget() {
    let nearest = null;
    let minD = Infinity;
    const pf = this.player.fighter;
    for (const e of this.enemies) {
      if (!e.fighter.alive) continue;
      const d = dist(pf, e.fighter);
      if (d < minD) { minD = d; nearest = e.fighter; }
    }
    return nearest;
  }

  update(dt) {
    const input = this.input;

    // 同步视口尺寸（窗口可能被拉伸）
    this.camera.resize(this.canvas._logicW || this.canvas.width, this.canvas._logicH || this.canvas.height);

    // 将屏幕鼠标坐标转换为世界坐标（供 player faceAngle 使用）
    const wm = this.camera.screenToWorld(input.mouseX, input.mouseY);
    input._worldMouseX = wm.x;
    input._worldMouseY = wm.y;

    // ESC 返回菜单
    if (input.pressed('Escape') && this.onExit) {
      if (this.netClient) this.netClient.disconnect();
      this.onExit();
      return;
    }

    // 测试完成时按键返回（跳过第1帧防止菜单点击穿透）
    if (this.testDone) {
      if (!this._testResultReady) {
        this._testResultReady = true;
        return;
      }
      if (input.pressed('Escape') || input.pressed('Space') || input.mouseLeftDown) {
        if (this.onExit) this.onExit();
      }
      return;
    }

    // 帮助/暂停切换（仅对战/训练模式）
    if ((this.mode === 'pvai' || this.mode === 'training' || this.mode === 'chainKill') && input.pressed('KeyH')) {
      this.showHelp = !this.showHelp;
      this.paused = this.showHelp;
      if (this.helpOverlay) {
        this.helpOverlay.classList.toggle('hidden', !this.showHelp);
      }
    }

    // 设置面板（所有非测试模式）
    this._settingsClickCd -= dt;
    if (this.mode !== 'test' && input.pressed('KeyP')) {
      this.settingsOpen = !this.settingsOpen;
    }
    // 设置按钮点击检测
    if (this.mode !== 'test' && input.mouseLeftDown && this._settingsClickCd <= 0) {
      const r = this._getSettingsBtnRect();
      if (input.mouseX >= r.x && input.mouseX <= r.x + r.w &&
          input.mouseY >= r.y && input.mouseY <= r.y + r.h) {
        this.settingsOpen = !this.settingsOpen;
        this._settingsClickCd = 0.3;
      }
    }
    if (this.settingsOpen) {
      this._updateSettings(dt);
      return; // 暂停游戏逻辑
    }

    // 难度切换 (1-7)（仅对战/训练模式）
    if (this.mode === 'pvai' || this.mode === 'training' || this.mode === 'chainKill') {
      for (let i = 1; i <= 7; i++) {
        if (input.pressed(`Digit${i}`)) {
          this.difficulty = i;
          this.ui.addLog(`AI难度设为 ${i}`);
        }
      }
    }

    // 暂停时只处理UI输入，不更新游戏逻辑
    if (this.paused) return;

    // 联机客机: 只发送输入 + 接收状态 + 渲染
    if (this.mode === 'online_guest') {
      this._updateOnlineGuest(dt);
      return;
    }

    // 教学模式
    if (this.mode === 'tutorial') {
      this._updateTutorial(dt);
      return;
    }

    // 江湖行模式
    if (this.mode === 'jianghu') {
      this._updateJianghu(dt);
      return;
    }

    // 测试模式：多次tick
    if (this.mode === 'test') {
      for (let step = 0; step < this.testSpeed; step++) {
        this._tick(dt);
        if (this.testDone) return;
      }
      return;
    }

    this._tick(dt);
  }

  _tick(dt) {
    this.gameTime += dt;

    // 浮动文字更新（冻结帧期间也更新）
    for (const ft of this.floatingTexts) {
      ft.timer -= dt;
      ft.y += ft.vy * dt;
      ft.vy *= 0.96;
    }
    this.floatingTexts = this.floatingTexts.filter(ft => ft.timer > 0);

    // 屏幕闪光更新
    if (this.screenFlash.timer > 0) {
      this.screenFlash.timer -= dt;
    }

    // 冻结帧（hitstop）
    if (this.hitFreezeTimer > 0) {
      this.hitFreezeTimer -= dt;

      // 冻结期间仍然采集玩家输入到缓冲（防止点击被吞）
      if (this.mode === 'pvai' || this.mode === 'wusheng' || this.mode === 'training' || this.mode === 'chainKill' || this.mode === 'online_host') {
        const freezeCmd = this.player.getCommands(this.input);
        const pf = this.player.fighter;
        // 只缓冲攻击/闪避意图，不缓冲持续按住的格挡（避免格挡后误入blocking）
        if (freezeCmd.lightAttack) pf.bufferInput('lightAttack');
        else if (freezeCmd.heavyAttack) pf.bufferInput('heavyAttack');
        else if (freezeCmd.dodge) pf.bufferInput('dodge', { angle: freezeCmd.dodgeAngle });
        // Freeze期间松开Space则解除blockSuppressed，后续可正常格挡
        if (!freezeCmd.blockHeld) pf.blockSuppressed = false;
      }

      if (this.mode !== 'test') {
        this.particles.update(dt);
        this._updateCameraTarget();
        this.camera.update(dt);
      }
      this.ui.update(dt);
      return;
    }

    // 时间缩放（慢动作）
    if (this.timeScaleTimer > 0) {
      this.timeScaleTimer -= dt;
      dt *= this.timeScale;
      if (this.timeScaleTimer <= 0) {
        this.timeScale = 1;
      }
    }

    const input = this.input;

    // 对战模式按键
    if (this.mode === 'pvai' || this.mode === 'wusheng' || this.mode === 'training' || this.mode === 'chainKill') {
      if (input.pressed('KeyE') && this._victoryTimer < 0) this.spawnEnemy();
      if (input.pressed('KeyI') && this._victoryTimer < 0) this.spawnAlly();
      if (input.pressed('KeyR')) { this._victoryTimer = -1; this.chainKills = 0; this.reset(); return; }
    }
    // 观战模式按键
    if (this.mode === 'spectate' || this.mode === 'wusheng_spectate') {
      if (input.pressed('KeyR')) { this._victoryTimer = -1; this.reset(); return; }
    }
    // 江湖行模式不允许R/E键

    // ===== 胜利阶段：玩家可自由移动，AI做表演散步 =====
    if (this._victoryTimer >= 0) {
      this._victoryTimer += dt;
      const pf = this.player.fighter;
      const enemy0 = this.enemies[0]?.fighter;
      const noop = { moveX: 0, moveY: 0, faceAngle: 0, lightAttack: false, heavyAttack: false, blockHeld: false, dodge: false, dodgeAngle: 0 };
      const isPlayerMode = this.mode === 'pvai' || this.mode === 'wusheng' || this.mode === 'jianghu' || this.mode === 'training' || this.mode === 'chainKill';

      // 联机主机: 单局结束倒计时 → 重置进入下一局
      if (this.mode === 'online_host' && this._onlineRoundDelay > 0) {
        this._onlineRoundDelay -= dt;
        if (this._onlineRoundDelay <= 0) {
          this._onlineResetRound();
          return;
        }
      }

      // 联机: 比赛结束后按R请求再来一局
      if ((this.mode === 'online_host' || this.mode === 'online_guest') && this._onlineMatchOver) {
        if (input.pressed('KeyR') && !this._rematchSelf) {
          this._rematchSelf = true;
          if (this.netClient) this.netClient.sendRelay({ type: 'rematch' });
          this.ui.addLog('你请求了再来一局，等待对手同意...');
        }
        // 主机: 双方同意则重置整场比赛
        if (this.mode === 'online_host' && this._rematchSelf && this._rematchRemote) {
          this._onlineRematch();
          return;
        }
      }

      if (pf.alive) {
        if (isPlayerMode || this.mode === 'online_host') {
          // 玩家胜利: 键盘自由移动（不能攻击/防御）
          const raw = this.player.getCommands(input);
          pf.update(dt, { ...noop, moveX: raw.moveX, moveY: raw.moveY, faceAngle: raw.faceAngle }, this.gameTime);
        } else {
          // AI胜利: 表演散步（远离对手）
          const walking = this._victoryTimer > 0.3 && this._victoryTimer < 2.5;
          if (enemy0) {
            const ang = Math.atan2(pf.y - enemy0.y, pf.x - enemy0.x);
            pf.update(dt, { ...noop, faceAngle: ang, moveX: walking ? Math.cos(ang) * 0.4 : 0, moveY: walking ? Math.sin(ang) * 0.4 : 0 }, this.gameTime);
          } else {
            pf.update(dt, noop, this.gameTime);
          }
        }
      }
      // 联机主机: 胜利阶段也更新远程玩家 + 发送状态
      if (this.mode === 'online_host' && this.remoteFighter) {
        if (this.remoteFighter.alive) {
          this.remoteFighter.update(dt, this._remoteCmd || noop, this.gameTime);
        }
        this.combat.events = []; // 胜利阶段不产生新事件，清空防止重发
        this._sendNetState();
      }
      for (const enemy of this.enemies) {
        if (!enemy.fighter.alive) continue;
        // AI敌人胜利: 表演散步
        const walking = this._victoryTimer > 0.3 && this._victoryTimer < 2.5;
        const ang = Math.atan2(enemy.fighter.y - pf.y, enemy.fighter.x - pf.x);
        enemy.fighter.update(dt, { ...noop, faceAngle: ang, moveX: walking ? Math.cos(ang) * 0.4 : 0, moveY: walking ? Math.sin(ang) * 0.4 : 0 }, this.gameTime);
      }

      this.particles.update(dt);
      this._updateCameraTarget();
      this.camera.update(dt);
      this.ui.update(dt);
      return;
    }

    // 玩家命令（AI代替或键盘或NN）
    const pf = this.player.fighter;
    let pCmd;
    if (this.playerAI && this.playerAI.isNN && this.nnWeights && pf.alive) {
      // 武圣观战: NN 控制蓝方
      const target = this.enemies[0] ? this.enemies[0].fighter : null;
      if (target) {
        pCmd = this._getNNCommand(dt, pf, target);
      } else {
        pCmd = { moveX: 0, moveY: 0, faceAngle: 0, lightAttack: false, heavyAttack: false, blockHeld: false, dodge: false, dodgeAngle: 0 };
      }
    } else if (this.playerAI && !this.playerAI.isNN && pf.alive) {
      const target = this.enemies[0] ? this.enemies[0].fighter : null;
      if (target) {
        pCmd = this.playerAI.getCommands(dt, target);
      } else {
        pCmd = { moveX: 0, moveY: 0, faceAngle: 0, lightAttack: false, heavyAttack: false, blockHeld: false, dodge: false, dodgeAngle: 0 };
      }
    } else {
      pCmd = this.player.getCommands(input);
    }

    // 完美闪避标记清理
    if (pf.perfectDodged && pf.perfectDodged !== 'refunded' && pf.state === 'idle') {
      pf.perfectDodged = false;
    }
    if (pf.perfectDodged === 'refunded' && pf.state === 'idle') {
      pf.perfectDodged = false;
    }

    pf.update(dt, pCmd, this.gameTime);

    // 联机主机: 用网络输入更新远程玩家
    if (this.mode === 'online_host' && this.remoteFighter && this.remoteFighter.alive) {
      const noop = { moveX: 0, moveY: 0, faceAngle: 0, lightAttack: false, heavyAttack: false, blockHeld: false, dodge: false, dodgeAngle: 0 };
      this.remoteFighter.update(dt, this._remoteCmd || noop, this.gameTime);
    }

    // 敌人更新（选择最近的对手为目标，不一定是玩家）
    for (const enemy of this.enemies) {
      const ef = enemy.fighter;
      if (!ef.alive) continue;
      let eCmd;
      if (enemy._isNN && this.nnWeights) {
        eCmd = this._getNNCommand(dt, ef, pf);
      } else {
        // 找最近的敌对目标（玩家 + 队友）
        let target = pf, minD = pf.alive ? dist(ef, pf) : Infinity;
        for (const ally of this.allies) {
          if (!ally.fighter.alive) continue;
          const d = dist(ef, ally.fighter);
          if (d < minD) { minD = d; target = ally.fighter; }
        }
        eCmd = target && target.alive ? enemy.getCommands(dt, target) : { moveX: 0, moveY: 0, faceAngle: 0, lightAttack: false, heavyAttack: false, blockHeld: false, dodge: false, dodgeAngle: 0 };
      }
      ef.update(dt, eCmd, this.gameTime);
    }

    // 队友AI更新（以最近敌人为目标）
    for (const ally of this.allies) {
      const af = ally.fighter;
      if (!af.alive) continue;
      // 找最近活着的敌人
      let target = null, minD = Infinity;
      for (const e of this.enemies) {
        if (!e.fighter.alive) continue;
        const d = dist(af, e.fighter);
        if (d < minD) { minD = d; target = e.fighter; }
      }
      const aCmd = target ? ally.getCommands(dt, target) : { moveX: 0, moveY: 0, faceAngle: 0, lightAttack: false, heavyAttack: false, blockHeld: false, dodge: false, dodgeAngle: 0 };
      af.update(dt, aCmd, this.gameTime);
    }

    // 碰撞分离
    this._separateFighters();

    // 战斗判定
    this.combat.resolve(this.allFighters, this.gameTime, dt);

    // 变招视觉反馈
    for (const fighter of this.allFighters) {
      if (fighter.feinted) {
        if (this.mode !== 'test') {
          this.addFloatingText(fighter.x, fighter.y - 30, '变招!', '#ff88ff', 20, 0.8, -40);
        }
        this.ui.addLog(`${fighter.name} 变招! (-${C.FEINT_COST}体力)`);
        // 教学模式由 _updateTutorial 检测后清除，此处跳过
        if (this.mode !== 'tutorial') {
          fighter.feinted = false;
        }
      }
    }

    // 战斗事件
    for (const evt of this.combat.events) {
      this._logEvent(evt);
      if (this.mode === 'test' && this.testRoundStats) {
        this._recordTestEvent(evt);
      }
    }

    // 联机主机: 发送状态快照给客机
    if (this.mode === 'online_host' && this.netClient) {
      this._sendNetState();
      this.combat.events = []; // 发送后清空，避免下帧重发
    }

    // 粒子等
    if (this.mode !== 'test') {
      this.particles.update(dt);
      this._updateCameraTarget();
      this.camera.update(dt);
    }
    this.ui.update(dt);

    // 清理死亡敌人和队友
    this.enemies = this.enemies.filter(e => e.fighter.alive || e.fighter.stateTimer < 2);
    this.allies = this.allies.filter(a => a.fighter.alive || a.fighter.stateTimer < 2);
    this._rebuildFighterList();

    // 胜负检测
    if (this.mode === 'test') {
      const aAlive = pf.alive;
      const bAlive = this.enemies.some(e => e.fighter.alive);
      const timeout = this.gameTime > 60;
      if (!aAlive || !bAlive || timeout) {
        const winner = timeout ? 'draw' : (aAlive ? 'A' : bAlive ? 'B' : 'draw');
        this._endTestRound(winner);
      }
    } else if (this.mode === 'chainKill' && this._victoryTimer < 0 && this.enemies.length > 0) {
      const aAlive = pf.alive;
      const bAlive = this.enemies.some(e => e.fighter.alive);
      if (!aAlive || !bAlive) {
        if (aAlive) {
          // 连战胜利：增加击杀数，玩家变大，自动spawn下一个
          this.chainKills++;
          const newScale = 1 + this.chainKills * 0.08;
          pf.scale = newScale;
          pf.radius = C.FIGHTER_RADIUS * newScale;
          this.ui.addLog(`连斩 ×${this.chainKills}!`);
          this.addFloatingText(pf.x, pf.y - 50, `连斩 ×${this.chainKills}`, '#ff6633', 28, 1.5, -30);
          // 恢复40%HP
          pf.hp = Math.min(pf.maxHp, pf.hp + Math.floor(pf.maxHp * 0.4));
          // 延迟1秒后自动spawn
          this._chainSpawnDelay = 1.0;
          this.enemies = [];
          this._rebuildFighterList();
        } else {
          this._victoryTimer = 0;
          this.ui.addLog(`连战结束! 总计连斩 ×${this.chainKills}`);
        }
      }
    } else if (this.mode === 'chainKill' && this._chainSpawnDelay > 0) {
      this._chainSpawnDelay -= dt;
      if (this._chainSpawnDelay <= 0) {
        this.spawnEnemy();
      }
    } else if (this.mode === 'online_host' && this._victoryTimer < 0 && this.remoteFighter) {
      const f0Alive = this.allFighters[0].alive;
      const f1Alive = this.allFighters[1].alive;
      if (!f0Alive || !f1Alive) {
        this._victoryTimer = 0;
        const winSlot = f0Alive ? 0 : 1;
        this._onlineWins[winSlot]++;
        const w = this._onlineWins;
        if (w[0] >= 3 || w[1] >= 3) {
          this._onlineMatchOver = true;
          const winner = this.allFighters[winSlot];
          this.ui.addLog(`${winner.name} 赢得比赛! (${w[0]}:${w[1]}) ESC返回菜单`);
        } else {
          const winner = this.allFighters[winSlot];
          this.ui.addLog(`第${this._onlineRound}局 ${winner.name} 胜! (${w[0]}:${w[1]}) 准备下一局...`);
          this._onlineRoundDelay = 2.5; // 2.5秒后进入下一局
        }
      }
    } else if (this.mode !== 'jianghu' && this.mode !== 'chainKill' && this.mode !== 'online_host' && this.mode !== 'online_guest' && this.mode !== 'tutorial' && this._victoryTimer < 0 && this.enemies.length > 0) {
      const aAlive = pf.alive;
      const bAlive = this.enemies.some(e => e.fighter.alive);
      if (!aAlive || !bAlive) {
        this._victoryTimer = 0;
        if (aAlive) {
          const name = this.playerAI ? pf.name : '玩家';
          this.ui.addLog(`${name} 胜利！按 R 重置`);
        } else {
          const winner = this.enemies.find(e => e.fighter.alive);
          const name = winner ? winner.fighter.name : '敌方';
          this.ui.addLog(`${name} 胜利！按 R 重置`);
        }
      }
    }
  }

  _separateFighters() {
    const fighters = this.allFighters.filter(f => f.alive);
    for (let i = 0; i < fighters.length; i++) {
      for (let j = i + 1; j < fighters.length; j++) {
        const a = fighters[i], b = fighters[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const minD = a.radius + b.radius;
        if (d < minD && d > 0.1) {
          const overlap = (minD - d) / 2;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
        }
      }
    }
  }

  /** NN武圣决策: 每 0.1s 采样一次动作 */
  _getNNCommand(dt, me, opponent) {
    this._nnActionTimer -= dt;
    if (this._nnActionTimer <= 0) {
      this._nnActionTimer = this._nnDecisionInterval;
      const state = extractState(me, opponent);
      const { action } = this.nnWeights.sampleAction(state);
      this._nnLastAction = action;
    }
    return actionToCommand(this._nnLastAction, me, opponent);
  }

  render() {
    const dpr = this.canvas._dpr || 1;
    const lw = this.canvas._logicW || this.canvas.width;
    const lh = this.canvas._logicH || this.canvas.height;
    const ctx = this.renderer.ctx;

    // DPI 缩放：所有后续绘制均在逻辑像素坐标系下
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 纯数据模式：只绘制结果
    if (this.testSimOnly && this.testDone) {
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, lw, lh);
      this._drawTestResults();
      return;
    }

    // 清屏（全屏逻辑尺寸）
    this.renderer.clear(lw, lh);

    // ===== 世界空间绘制（竞技场 + 角色 + 粒子 + 浮动文字） =====
    ctx.save();
    this.camera.applyWorldTransform(ctx);

    this.renderer.drawGrid();

    // 绘制角色（先画敌人再画队友再画玩家，玩家在上层）
    if (this.remoteFighter) {
      // 联机模式: 只有两个角色
      this.renderer.drawFighter(this.remoteFighter);
      this.renderer.drawFighter(this.player.fighter);
    } else {
      for (const enemy of this.enemies) {
        this.renderer.drawFighter(enemy.fighter);
      }
      for (const ally of this.allies) {
        this.renderer.drawFighter(ally.fighter);
      }
      this.renderer.drawFighter(this.player.fighter);
    }

    // 粒子
    this.renderer.drawParticles(this.particles);

    // 浮动战斗文字
    this.renderer.drawFloatingTexts(this.floatingTexts);

    ctx.restore();
    // ===== 世界空间结束 =====

    // ===== 屏幕空间绘制（HUD、覆盖层等） =====

    // 屏幕闪光
    this.renderer.drawScreenFlash(this.screenFlash, lw, lh);

    // 慢动作视觉
    if (this.timeScaleTimer > 0) {
      this.renderer.drawSlowMoEffect(this.timeScale, this.timeScaleTimer, lw, lh);
    }

    // HUD
    const target = this.remoteFighter || this._getTarget();
    this.ui.draw(this.player.fighter, target, this.remoteFighter ? [this.remoteFighter] : this.enemies.map(e => e.fighter), this.difficulty);

    // 模式标签
    if (this.mode === 'online_host' || this.mode === 'online_guest') {
      this._drawOnlineScoreHUD();
    } else if (this.mode === 'spectate') {
      this._drawModeLabel('🦗 斗蛐蛐 · R重置 · ESC返回菜单');
    } else if (this.mode === 'test') {
      this._drawModeLabel(`📊 自动测试 ×${this.testSpeed} · 第 ${this.testRound}/${this.testRounds} 轮`);
    } else if (this.mode === 'jianghu') {
      const stage = JIANGHU_STAGES[this.jianghuStage];
      this._drawModeLabel(`🏔 江湖行 · 第${this.jianghuStage + 1}关 ${stage ? stage.name : ''} · ❤×${this.jianghuLives}`);
    } else if (this.mode === 'training') {
      this._drawModeLabel(`🎯 自由训练 · U召敌 · I召队友 · R重置 · 1-5难度(当前${this.difficulty})`);
    } else if (this.mode === 'chainKill') {
      this._drawModeLabel(`⚔ 连战模式 · 连斩 ×${this.chainKills} · R重置 · ESC返回`);
    } else if (this.mode === 'tutorial') {
      this._drawModeLabel('📖 教学模式 · ESC返回菜单');
    }

    // 江湖行覆盖层（剧情/过关/失败）
    if (this.mode === 'jianghu') {
      this._drawJianghuOverlay();
    }

    // 教学模式覆盖层
    if (this.mode === 'tutorial') {
      this._drawTutorialOverlay();
    }

    // 测试结果
    if (this.testDone) {
      this._drawTestResults();
    }

    // 设置按钮（非测试模式，右上角）
    if (this.mode !== 'test') {
      this._drawSettingsBtn();
    }

    // 设置面板覆盖层
    if (this.settingsOpen) {
      this._drawSettings();
    }
  }

  _drawModeLabel(text) {
    const ctx = this.canvas.getContext('2d');
    const lw = this.canvas._logicW || this.canvas.width;
    const lh = this.canvas._logicH || this.canvas.height;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, lh - 30, lw, 30);
    ctx.fillStyle = '#aaa';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, lw / 2, lh - 10);
  }

  /** 联机模式: 顶部比分 + 底部模式标签 */
  _drawOnlineScoreHUD() {
    const ctx = this.canvas.getContext('2d');
    const lw = this.canvas._logicW || this.canvas.width;
    const w = this._onlineWins || [0, 0];
    const round = this._onlineRound || 1;
    const isHost = this.mode === 'online_host';

    // 底部模式标签
    this._drawModeLabel(`🌐 联机对战 · 五局三胜 · 第${round}局 · ESC返回菜单`);

    // ---- 顶部比分面板 ----
    const panelW = 260, panelH = 44;
    const px = (lw - panelW) / 2, py = 12;

    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(px, py, panelW, panelH, 6);
    ctx.fill();

    // 玩家1 名字 + 分数 + 玩家2
    ctx.font = 'bold 15px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cy = py + panelH / 2;

    // 玩家1(蓝)
    ctx.fillStyle = '#4499ff';
    ctx.fillText('玩家1', px + 50, cy);

    // 分数
    ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${w[0]}`, px + panelW / 2 - 18, cy);
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#666';
    ctx.fillText(':', px + panelW / 2, cy);
    ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${w[1]}`, px + panelW / 2 + 18, cy);

    // 玩家2(红)
    ctx.font = 'bold 15px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#ff4444';
    ctx.fillText('玩家2', px + panelW - 50, cy);

    // 局数圆点指示器 (5局)
    const dotY = py + panelH + 6;
    const dotR = 4, dotGap = 14;
    const dotsW = 4 * dotGap;
    const dotStartX = (lw - dotsW) / 2;
    for (let i = 0; i < 5; i++) {
      const dx = dotStartX + i * dotGap;
      ctx.beginPath();
      ctx.arc(dx, dotY, dotR, 0, Math.PI * 2);
      if (i < w[0] + w[1]) {
        // 已完成的局: 显示赢家颜色
        // 需要推算每局赢家 — 简化: 前w[0]个蓝，后w[1]个红（交替不精确但视觉够用）
        // 更好的做法: 按局数顺序，这里简单用填充
        const totalPlayed = w[0] + w[1];
        // 无法知道每局赢家顺序，用交替色表示
        ctx.fillStyle = i < round - 1 ? (i % 2 === 0 ? '#4499ff55' : '#ff444455') : 'rgba(255,255,255,0.15)';
        // 简化: 蓝色填w[0]个，红色填w[1]个
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
      }
      ctx.fill();
    }
    // 覆盖：蓝色胜局点
    for (let i = 0; i < w[0]; i++) {
      const dx = dotStartX + i * dotGap;
      ctx.beginPath();
      ctx.arc(dx, dotY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = '#4499ff';
      ctx.fill();
    }
    // 红色胜局点(从右边开始)
    for (let i = 0; i < w[1]; i++) {
      const dx = dotStartX + (4 - i) * dotGap;
      ctx.beginPath();
      ctx.arc(dx, dotY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4444';
      ctx.fill();
    }

    // 整场结束: 显示胜者覆盖
    if (this._onlineMatchOver && this._victoryTimer >= 0) {
      const alpha = Math.min(0.7, this._victoryTimer * 0.3);
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.fillRect(0, 0, lw, this.canvas._logicH || this.canvas.height);
      ctx.font = 'bold 36px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const matchWinner = w[0] >= 3 ? '玩家1' : '玩家2';
      const matchColor = w[0] >= 3 ? '#4499ff' : '#ff4444';
      const ch = (this.canvas._logicH || this.canvas.height) / 2;
      ctx.fillStyle = matchColor;
      ctx.fillText(`${matchWinner} 赢得比赛!`, lw / 2, ch - 20);
      ctx.font = '20px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#ccc';
      ctx.fillText(`${w[0]} : ${w[1]}`, lw / 2, ch + 20);
      ctx.font = '14px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#888';
      ctx.fillText('ESC 返回菜单', lw / 2, ch + 55);

      // 再来一局提示
      ctx.font = '16px "Microsoft YaHei", sans-serif';
      if (this._rematchSelf && this._rematchRemote) {
        ctx.fillStyle = '#44ff88';
        ctx.fillText('双方同意! 即将重新开始...', lw / 2, ch + 85);
      } else if (this._rematchSelf) {
        ctx.fillStyle = '#ffcc44';
        ctx.fillText('等待对手同意再来一局...', lw / 2, ch + 85);
      } else if (this._rematchRemote) {
        ctx.fillStyle = '#44ffaa';
        ctx.fillText('对手请求再来一局! 按 R 同意', lw / 2, ch + 85);
      } else {
        ctx.fillStyle = '#aaa';
        ctx.fillText('按 R 再来一局', lw / 2, ch + 85);
      }
    }

    ctx.textBaseline = 'alphabetic';
  }

  // ===================== 镜头跟踪 =====================
  _updateCameraTarget() {
    const pf = this.player.fighter;
    let tx = pf.x, ty = pf.y;
    // 联机模式: 跟踪两个玩家的中点
    if (this.remoteFighter && this.remoteFighter.alive) {
      tx = (pf.x + this.remoteFighter.x) / 2;
      ty = (pf.y + this.remoteFighter.y) / 2;
    } else {
      const target = this._getTarget();
      if (target && target.alive) {
        tx = (pf.x + target.x) / 2;
        ty = (pf.y + target.y) / 2;
      }
    }
    this.camera.setTarget(tx, ty);
  }

  // ===================== 联机对战 =====================
  _setupOnline(opts) {
    const isHost = this.mode === 'online_host';
    this.localSlot = isHost ? 0 : 1;
    this.netClient = opts.netClient || null;
    this._remoteCmd = null;
    this._pendingNetState = null;
    this.remoteFighter = null;

    if (isHost) {
      // 主机 = slot 0 (蓝, 左)
      this.player.fighter.x = C.ARENA_W / 2 - 80;
      this.player.fighter.color = '#4499ff';
      this.player.fighter.name = '玩家1';
      this.player.fighter.team = 0;
      // 远程 = slot 1 (红, 右)
      this.remoteFighter = new Fighter(
        C.ARENA_W / 2 + 80, C.ARENA_H / 2,
        { color: '#ff4444', team: 1, name: '玩家2' }
      );
    } else {
      // 客机 = slot 1 (红, 右)
      this.player.fighter.x = C.ARENA_W / 2 + 80;
      this.player.fighter.color = '#ff4444';
      this.player.fighter.name = '玩家2';
      this.player.fighter.team = 1;
      // 远程 = slot 0 (蓝, 左)
      this.remoteFighter = new Fighter(
        C.ARENA_W / 2 - 80, C.ARENA_H / 2,
        { color: '#4499ff', team: 0, name: '玩家1' }
      );
    }

    this.combat.playerFighter = this.player.fighter;
    this._rebuildFighterList();

    // ===== 五局三胜 =====
    this._onlineWins = [0, 0];   // [slot0得分, slot1得分]
    this._onlineRound = 1;       // 当前局数
    this._onlineRoundDelay = -1; // 单局结束后进入下一局的倒计时
    this._onlineMatchOver = false; // 整场比赛结束
    this._onlineVictoryLogged = false;

    // ===== 再来一局 =====
    this._rematchSelf = false;   // 本方已请求再来一局
    this._rematchRemote = false; // 对方已请求再来一局

    // 网络消息处理
    if (this.netClient) {
      this.netClient.onMessage = (data) => this._onNetMessage(data);
    }
  }

  _onNetMessage(data) {
    if (this.mode === 'online_host' && data.type === 'input') {
      this._remoteCmd = data.cmd;
    } else if (this.mode === 'online_guest' && data.type === 'state') {
      this._pendingNetState = data;
    }
    // 再来一局（双方都可收到）
    if (data.type === 'rematch') {
      this._rematchRemote = true;
    }
  }

  /** 主机: 每帧发送状态快照给客机 */
  _sendNetState() {
    if (!this.netClient) return;
    const state = {
      type: 'state',
      f: this.allFighters.map(f => snapshotFighter(f)),
      gt: this.gameTime,
      vt: this._victoryTimer,
      ev: this.combat.events.map(e => serializeEvent(e, this.allFighters)),
      // 五局三胜
      ow: this._onlineWins,
      or: this._onlineRound,
      om: this._onlineMatchOver,
      // 再来一局
      rs: this._rematchSelf,
      rr: this._rematchRemote,
    };
    this.netClient.sendRelay(state);
  }

  /** 主机: 重置单局，进入下一局 */
  _onlineResetRound() {
    this._onlineRound++;
    this._victoryTimer = -1;
    this._onlineRoundDelay = -1;
    this.particles.particles = [];
    this.floatingTexts = [];
    // 重置两个fighter位置和状态
    const f0 = this.allFighters[0];
    const f1 = this.allFighters[1];
    this._resetOnlineFighter(f0, C.ARENA_W / 2 - 80);
    this._resetOnlineFighter(f1, C.ARENA_W / 2 + 80);
    this.ui.addLog(`--- 第${this._onlineRound}局 ---`);
  }

  /** 重置单个联机fighter到初始状态 */
  _resetOnlineFighter(f, spawnX) {
    f.x = spawnX;
    f.y = C.ARENA_H / 2;
    f.vx = 0;
    f.vy = 0;
    f.hp = f.maxHp;
    f.stamina = C.STAMINA_MAX;
    f.alive = true;
    f.state = 'idle';
    f.phase = 'none';
    f.stateTimer = 0;
    f.phaseTimer = 0;
    f.attackType = 'none';
    f.attackData = null;
    f.comboStep = 0;
    f.isExhausted = false;
    f.speedMult = 1;
    f.flashTimer = 0;
    f.damageFlash = 0;
    f.parryDeflect = 0;
    f.knockbackTimer = 0;
    f.knockbackVx = 0;
    f.knockbackVy = 0;
    f.blockHitCount = 0;
    f.blockSuppressed = false;
    f.parryActionDelay = 0;
    f.perfectDodged = false;
    f.feinted = false;
    f.afterimages = [];
    f.staminaRegenTimer = 0;
    f.inputBuffer = { action: null, params: null, timer: 0 };
    f.hasHit = new Set();
    f.parryBoost = { mult: 1, timer: 0 };
  }

  /** 主机: 双方同意再来一局，重置整场比赛 */
  _onlineRematch() {
    this._onlineWins = [0, 0];
    this._onlineRound = 1;
    this._onlineRoundDelay = -1;
    this._onlineMatchOver = false;
    this._onlineVictoryLogged = false;
    this._rematchSelf = false;
    this._rematchRemote = false;
    this._victoryTimer = -1;
    this.particles.particles = [];
    this.floatingTexts = [];
    const f0 = this.allFighters[0];
    const f1 = this.allFighters[1];
    this._resetOnlineFighter(f0, C.ARENA_W / 2 - 80);
    this._resetOnlineFighter(f1, C.ARENA_W / 2 + 80);
    this.ui.addLog('=== 新一场比赛开始 ===');
  }

  /** 客机: 完整的每帧逻辑（不运行物理/战斗） */
  _updateOnlineGuest(dt) {
    const input = this.input;

    // ESC 退出
    if (input.pressed('Escape') && this.onExit) {
      if (this.netClient) this.netClient.disconnect();
      this.onExit();
      return;
    }

    // 比赛结束后按R请求再来一局
    if (this._onlineMatchOver && input.pressed('KeyR') && !this._rematchSelf) {
      this._rematchSelf = true;
      if (this.netClient) this.netClient.sendRelay({ type: 'rematch' });
      this.ui.addLog('你请求了再来一局，等待对手同意...');
    }

    // 发送输入给主机
    if (this._victoryTimer < 0) {
      const pCmd = this.player.getCommands(input);
      if (this.netClient) {
        this.netClient.sendRelay({
          type: 'input',
          cmd: {
            moveX: pCmd.moveX, moveY: pCmd.moveY,
            faceAngle: pCmd.faceAngle,
            lightAttack: pCmd.lightAttack,
            heavyAttack: pCmd.heavyAttack,
            blockHeld: pCmd.blockHeld,
            dodge: pCmd.dodge,
            dodgeAngle: pCmd.dodgeAngle,
          }
        });
      }
    }

    // 应用主机发来的状态
    if (this._pendingNetState) {
      this._applyNetState(this._pendingNetState);
      this._pendingNetState = null;
    }

    // 本地计时器衰减
    for (const ft of this.floatingTexts) {
      ft.timer -= dt;
      ft.y += ft.vy * dt;
      ft.vy *= 0.96;
    }
    this.floatingTexts = this.floatingTexts.filter(ft => ft.timer > 0);
    if (this.screenFlash.timer > 0) this.screenFlash.timer -= dt;
    if (this.hitFreezeTimer > 0) this.hitFreezeTimer -= dt;
    if (this.timeScaleTimer > 0) {
      this.timeScaleTimer -= dt;
      if (this.timeScaleTimer <= 0) this.timeScale = 1;
    }

    // 视觉更新
    this.particles.update(dt);
    this._updateCameraTarget();
    this.camera.update(dt);
    this.ui.update(dt);
  }

  /** 客机: 应用主机状态快照 */
  _applyNetState(state) {
    // 应用角色状态
    for (let i = 0; i < state.f.length && i < this.allFighters.length; i++) {
      applyFighterSnapshot(this.allFighters[i], state.f[i]);
    }
    this.gameTime = state.gt;
    this._victoryTimer = state.vt;

    // 五局三胜状态同步
    if (state.ow) this._onlineWins = state.ow;
    if (state.or) this._onlineRound = state.or;
    if (state.om !== undefined) this._onlineMatchOver = state.om;

    // 再来一局状态同步（主机重置时客机跟随）
    if (state.rs !== undefined && state.rr !== undefined) {
      // 主机已重置时（两个都变false），客机也重置本地标记
      if (!state.rs && !state.rr && (this._rematchSelf || this._rematchRemote)) {
        this._rematchSelf = false;
        this._rematchRemote = false;
        this._onlineVictoryLogged = false;
        this.ui.addLog('=== 新一场比赛开始 ===');
      }
    }

    // 处理战斗事件（生成粒子、浮动文字、特效）
    if (state.ev && state.ev.length > 0) {
      for (const rawEvt of state.ev) {
        const evt = deserializeEvent(rawEvt, this.allFighters);
        this._processNetEvent(evt);
      }
    }

    // 单局胜负显示
    if (this._victoryTimer >= 0 && !this._onlineVictoryLogged) {
      this._onlineVictoryLogged = true;
      const f0 = this.allFighters[0], f1 = this.allFighters[1];
      const winner = f0.alive ? f0 : f1;
      const w = this._onlineWins;
      if (this._onlineMatchOver) {
        this.ui.addLog(`${winner.name} 赢得比赛! (${w[0]}:${w[1]}) ESC返回菜单`);
      } else {
        this.ui.addLog(`第${this._onlineRound}局 ${winner.name} 胜! (${w[0]}:${w[1]})`);
      }
    }
    // 新一局开始时重置标记
    if (this._victoryTimer < 0) {
      this._onlineVictoryLogged = false;
    }
  }

  /** 客机: 从事件生成粒子和视觉效果 */
  _processNetEvent(evt) {
    switch (evt.type) {
      case 'hit': {
        if (evt.attacker && evt.target) {
          const ang = Math.atan2(evt.target.y - evt.attacker.y, evt.target.x - evt.attacker.x);
          const mx = (evt.attacker.x + evt.target.x) / 2;
          const my = (evt.attacker.y + evt.target.y) / 2;
          this.particles.blood(mx, my, ang, evt.atkType === 'heavy' ? 10 : 5);
          this.camera.shake(evt.atkType === 'heavy' ? C.SHAKE_HEAVY : C.SHAKE_LIGHT, C.SHAKE_DURATION);
        }
        break;
      }
      case 'parry': {
        if (evt.attacker && evt.target) {
          const mx = (evt.attacker.x + evt.target.x) / 2;
          const my = (evt.attacker.y + evt.target.y) / 2;
          const ang = Math.atan2(evt.target.y - evt.attacker.y, evt.target.x - evt.attacker.x);
          const cnt = evt.level === 'precise' ? 15 : evt.level === 'semi' ? 10 : 6;
          this.particles.sparks(mx, my, ang + Math.PI, cnt);
          this.camera.shake(C.SHAKE_HEAVY, C.SHAKE_DURATION);
        }
        break;
      }
      case 'blocked': {
        if (evt.attacker && evt.target) {
          const mx = (evt.attacker.x + evt.target.x) / 2;
          const my = (evt.attacker.y + evt.target.y) / 2;
          const ang = Math.atan2(evt.target.y - evt.attacker.y, evt.target.x - evt.attacker.x);
          this.particles.blockSpark(mx, my, ang, 5);
        }
        break;
      }
      case 'blockBreak': {
        if (evt.target) {
          this.camera.shake(C.SHAKE_HEAVY, C.SHAKE_DURATION);
        }
        break;
      }
      case 'lightClash':
      case 'heavyClash': {
        if (evt.a && evt.b) {
          const mx = (evt.a.x + evt.b.x) / 2;
          const my = (evt.a.y + evt.b.y) / 2;
          this.particles.clash(mx, my, evt.type === 'heavyClash' ? 16 : 10);
          this.camera.shake(evt.type === 'heavyClash' ? C.SHAKE_CLASH : C.SHAKE_CLASH * 0.7, C.SHAKE_DURATION);
        }
        break;
      }
      case 'execution': {
        if (evt.target) {
          this.particles.execution(evt.target.x, evt.target.y, 25);
          this.camera.shake(C.SHAKE_EXECUTION, C.SHAKE_DURATION * 2);
        }
        break;
      }
      case 'perfectDodge': {
        if (evt.target) {
          this.particles.sparks(evt.target.x, evt.target.y, 0, 6);
        }
        break;
      }
      case 'hyperAbsorb': {
        if (evt.a && evt.b) {
          const mx = (evt.a.x + evt.b.x) / 2;
          const my = (evt.a.y + evt.b.y) / 2;
          this.particles.blockSpark(mx, my, 0, 3);
        }
        break;
      }
    }
    // 浮动文字、屏幕闪光、顿帧、慢动作
    this._logEvent(evt);
  }
}

// 混入提取的模块方法
Object.assign(Game.prototype, eventLogMethods);
Object.assign(Game.prototype, testModeMethods);
Object.assign(Game.prototype, jianghuModeMethods);
Object.assign(Game.prototype, settingsPanelMethods);
Object.assign(Game.prototype, effectsMethods);
Object.assign(Game.prototype, tutorialModeMethods);
