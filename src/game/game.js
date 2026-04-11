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
import { JIANGHU_STAGES, JIANGHU_MAX_LIVES, JIANGHU_HEAL_RATIO } from './jianghu-stages.js';

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

    // ===== 江湖行 =====
    this.jianghuStage = 0;       // 当前关卡索引
    this.jianghuLives = JIANGHU_MAX_LIVES;
    this.jianghuPhase = 'story';  // 'story' | 'fight' | 'victory' | 'defeat' | 'complete'
    this.jianghuStoryTimer = 0;
    this.jianghuFadeTimer = 0;

    this._rebuildFighterList();

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
    this.particles.particles = [];
    this._rebuildFighterList();
    this.spawnEnemy();
    this.ui.addLog('--- 重置 ---');
  }

  _rebuildFighterList() {
    this.allFighters = [this.player.fighter];
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

    // 帮助/暂停切换（仅对战模式）
    if (this.mode === 'pvai' && input.pressed('KeyH')) {
      this.showHelp = !this.showHelp;
      this.paused = this.showHelp;
      if (this.helpOverlay) {
        this.helpOverlay.classList.toggle('hidden', !this.showHelp);
      }
    }

    // 难度切换 (1-7)（仅对战模式）
    if (this.mode === 'pvai') {
      for (let i = 1; i <= 7; i++) {
        if (input.pressed(`Digit${i}`)) {
          this.difficulty = i;
          this.ui.addLog(`AI难度设为 ${i}`);
        }
      }
    }

    // 暂停时只处理UI输入，不更新游戏逻辑
    if (this.paused) return;

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
      if (this.mode === 'pvai' || this.mode === 'wusheng') {
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
    if (this.mode === 'pvai' || this.mode === 'wusheng') {
      if (input.pressed('KeyE') && this._victoryTimer < 0) this.spawnEnemy();
      if (input.pressed('KeyR')) { this._victoryTimer = -1; this.reset(); return; }
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
      const isPlayerMode = this.mode === 'pvai' || this.mode === 'wusheng' || this.mode === 'jianghu';

      if (pf.alive) {
        if (isPlayerMode) {
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
      for (const enemy of this.enemies) {
        if (!enemy.fighter.alive) continue;
        // AI敌人胜利: 表演散步
        const walking = this._victoryTimer > 0.3 && this._victoryTimer < 2.5;
        const ang = Math.atan2(enemy.fighter.y - pf.y, enemy.fighter.x - pf.x);
        enemy.fighter.update(dt, { ...noop, faceAngle: ang, moveX: walking ? Math.cos(ang) * 0.4 : 0, moveY: walking ? Math.sin(ang) * 0.4 : 0 }, this.gameTime);
      }

      this.particles.update(dt);
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

    // 敌人更新
    for (const enemy of this.enemies) {
      const ef = enemy.fighter;
      if (!ef.alive) continue;
      let eCmd;
      if (enemy._isNN && this.nnWeights) {
        // 武圣挑战: NN 控制敌人
        eCmd = this._getNNCommand(dt, ef, pf);
      } else {
        eCmd = enemy.getCommands(dt, pf);
      }
      ef.update(dt, eCmd, this.gameTime);
    }

    // 碰撞分离
    this._separateFighters();

    // 战斗判定
    this.combat.resolve(this.allFighters, this.gameTime, dt);

    // 变招视觉反馈
    for (const fighter of this.allFighters) {
      if (fighter.feinted) {
        fighter.feinted = false;
        if (this.mode !== 'test') {
          this.addFloatingText(fighter.x, fighter.y - 30, '变招!', '#ff88ff', 20, 0.8, -40);
        }
        this.ui.addLog(`${fighter.name} 变招! (-${C.FEINT_COST}体力)`);
      }
    }

    // 战斗事件
    for (const evt of this.combat.events) {
      this._logEvent(evt);
      if (this.mode === 'test' && this.testRoundStats) {
        this._recordTestEvent(evt);
      }
    }

    // 粒子等
    if (this.mode !== 'test') {
      this.particles.update(dt);
      this.camera.update(dt);
    }
    this.ui.update(dt);

    // 清理死亡敌人
    this.enemies = this.enemies.filter(e => e.fighter.alive || e.fighter.stateTimer < 2);
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
    } else if (this.mode !== 'jianghu' && this._victoryTimer < 0 && this.enemies.length > 0) {
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

  addFloatingText(x, y, text, color, size = 18, duration = 1.2, vy = -50) {
    // 自动散开：检查附近是否已有文字，有则偏移
    for (const ft of this.floatingTexts) {
      if (ft.timer > ft.maxTimer * 0.7 && Math.abs(ft.x - x) < 60 && Math.abs(ft.y - y) < 20) {
        y -= 22;
      }
    }
    this.floatingTexts.push({
      x, y, text, color,
      fontSize: size,
      timer: duration,
      maxTimer: duration,
      vy
    });
  }

  flashScreen(color, duration = 0.12) {
    this.screenFlash = { color, timer: duration, maxTimer: duration };
  }

  applyHitFreeze(duration) {
    this.hitFreezeTimer = Math.max(this.hitFreezeTimer, duration);
  }

  applyTimeScale(scale, duration) {
    // 只接受更强的减速效果
    if (this.timeScaleTimer > 0 && scale >= this.timeScale) return;
    this.timeScale = scale;
    this.timeScaleTimer = duration;
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

    // 绘制角色（先画敌人再画玩家，玩家在上层）
    for (const enemy of this.enemies) {
      this.renderer.drawFighter(enemy.fighter);
    }
    this.renderer.drawFighter(this.player.fighter);

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
    const target = this._getTarget();
    this.ui.draw(this.player.fighter, target, this.enemies, this.difficulty);

    // 模式标签
    if (this.mode === 'spectate') {
      this._drawModeLabel('🦗 斗蛐蛐 · R重置 · ESC返回菜单');
    } else if (this.mode === 'test') {
      this._drawModeLabel(`📊 自动测试 ×${this.testSpeed} · 第 ${this.testRound}/${this.testRounds} 轮`);
    } else if (this.mode === 'jianghu') {
      const stage = JIANGHU_STAGES[this.jianghuStage];
      this._drawModeLabel(`🏔 江湖行 · 第${this.jianghuStage + 1}关 ${stage ? stage.name : ''} · ❤×${this.jianghuLives}`);
    }

    // 江湖行覆盖层（剧情/过关/失败）
    if (this.mode === 'jianghu') {
      this._drawJianghuOverlay();
    }

    // 测试结果
    if (this.testDone) {
      this._drawTestResults();
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

  // ===================== 江湖行逻辑 =====================
  _updateJianghu(dt) {
    const input = this.input;

    if (this.jianghuPhase === 'story') {
      this.jianghuStoryTimer += dt;
      // 点击或空格跳过剧情
      if (this.jianghuStoryTimer > 0.5 &&
          (input.pressed('Space') || input.mouseLeftDown)) {
        this._startJianghuFight();
      }
      return;
    }

    if (this.jianghuPhase === 'fight') {
      this._tick(dt);
      // 检测胜负
      const pf = this.player.fighter;
      const enemyAlive = this.enemies.some(e => e.fighter.alive);
      if (!pf.alive) {
        // 玩家被击败
        this.jianghuLives--;
        if (this.jianghuLives <= 0) {
          this.jianghuPhase = 'defeat';
        } else {
          // 还有剩余生命，重试当前关
          this.jianghuPhase = 'story';
          this.jianghuStoryTimer = 0;
          this.ui.addLog(`剩余生命: ${this.jianghuLives}`);
        }
        this.jianghuFadeTimer = 0;
      } else if (!enemyAlive && this._victoryTimer < 0) {
        this._victoryTimer = 0;
        // 短暂胜利展示后推进
        this.jianghuFadeTimer = 0;
        this.jianghuPhase = 'victory';
        this.ui.addLog(`${JIANGHU_STAGES[this.jianghuStage].enemy.name} 被击败!`);
      }
      return;
    }

    if (this.jianghuPhase === 'victory') {
      this.jianghuFadeTimer += dt;
      if (this.jianghuFadeTimer > 1.0 &&
          (input.pressed('Space') || input.mouseLeftDown)) {
        this.jianghuStage++;
        if (this.jianghuStage >= JIANGHU_STAGES.length) {
          this.jianghuPhase = 'complete';
          this.jianghuFadeTimer = 0;
        } else {
          // 回复部分HP进入下一关
          const pf = this.player.fighter;
          const heal = Math.round(pf.maxHp * JIANGHU_HEAL_RATIO);
          pf.hp = Math.min(pf.maxHp, pf.hp + heal);
          this.jianghuPhase = 'story';
          this.jianghuStoryTimer = 0;
        }
      }
      return;
    }

    if (this.jianghuPhase === 'defeat' || this.jianghuPhase === 'complete') {
      this.jianghuFadeTimer += dt;
      if (this.jianghuFadeTimer > 1.0 &&
          (input.pressed('Space') || input.mouseLeftDown || input.pressed('Escape'))) {
        if (this.onExit) this.onExit();
      }
      return;
    }
  }

  _startJianghuFight() {
    this.jianghuPhase = 'fight';
    this._victoryTimer = -1;

    // 重置玩家位置（保留HP）
    const pf = this.player.fighter;
    const prevHp = pf.hp;
    const prevMaxHp = pf.maxHp;
    pf.x = C.ARENA_W / 2;
    pf.y = C.ARENA_H / 2;
    pf.vx = 0;
    pf.vy = 0;
    pf.facing = 0;
    pf.state = 'idle';
    pf.stateTimer = 0;
    pf.phase = 'none';
    pf.stamina = C.STAMINA_MAX;
    pf.isExhausted = false;
    pf.speedMult = 1;
    pf.blockSuppressed = false;
    pf.parryActionDelay = 0;
    pf.knockbackTimer = 0;
    pf.inputBuffer = null;
    pf.alive = true;
    // 首关或重试时回满HP
    if (this.jianghuStage === 0 || prevHp <= 0) {
      pf.hp = prevMaxHp;
    } else {
      pf.hp = prevHp;
    }

    this.enemies = [];
    this.particles.particles = [];
    this._rebuildFighterList();
    this._spawnJianghuEnemy();
    this.gameTime = 0;
    this.floatingTexts = [];
  }

  _drawJianghuOverlay() {
    const ctx = this.canvas.getContext('2d');
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const stage = JIANGHU_STAGES[this.jianghuStage];

    if (this.jianghuPhase === 'story' && stage) {
      // 全屏暗幕 + 剧情文字
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(0, 0, cw, ch);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffcc44';
      ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
      ctx.fillText(`第${stage.id}关 · ${stage.name}`, cw / 2, ch * 0.28);

      ctx.fillStyle = '#ccc';
      ctx.font = '16px "Microsoft YaHei", sans-serif';
      // 自动换行
      this._drawWrappedText(ctx, stage.story, cw / 2, ch * 0.42, cw * 0.7, 26);

      // 敌人信息
      ctx.fillStyle = stage.enemy.color;
      ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
      ctx.fillText(`对手: ${stage.enemy.name}`, cw / 2, ch * 0.62);

      const scaleText = stage.enemy.scale !== 1 ? ` · 体型×${stage.enemy.scale}` : '';
      const hpText = stage.enemy.hpMult !== 1 ? ` · 血量×${stage.enemy.hpMult}` : '';
      ctx.fillStyle = '#888';
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.fillText(`难度 ${stage.enemy.difficulty}${scaleText}${hpText}`, cw / 2, ch * 0.67);

      // 生命
      ctx.fillStyle = '#ff4444';
      ctx.font = '16px "Microsoft YaHei", sans-serif';
      ctx.fillText('❤'.repeat(this.jianghuLives) + '♡'.repeat(JIANGHU_MAX_LIVES - this.jianghuLives), cw / 2, ch * 0.75);

      // 提示
      const alpha = 0.4 + 0.3 * Math.sin(this.jianghuStoryTimer * 3);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.font = '14px "Microsoft YaHei", sans-serif';
      ctx.fillText('点击或按空格开始战斗', cw / 2, ch * 0.88);
    }

    if (this.jianghuPhase === 'victory' && stage) {
      const alpha = Math.min(1, this.jianghuFadeTimer / 0.5);
      ctx.fillStyle = `rgba(0,0,0,${0.6 * alpha})`;
      ctx.fillRect(0, 0, cw, ch);

      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,204,68,${alpha})`;
      ctx.font = 'bold 32px "Microsoft YaHei", sans-serif';
      ctx.fillText('胜!', cw / 2, ch * 0.35);

      ctx.fillStyle = `rgba(200,200,200,${alpha})`;
      ctx.font = '16px "Microsoft YaHei", sans-serif';
      ctx.fillText(`${stage.enemy.name} 已被击败`, cw / 2, ch * 0.45);

      if (this.jianghuStage < JIANGHU_STAGES.length - 1) {
        ctx.fillStyle = `rgba(136,255,136,${alpha})`;
        ctx.font = '14px "Microsoft YaHei", sans-serif';
        ctx.fillText(`回复 ${Math.round(JIANGHU_HEAL_RATIO * 100)}% HP · 进入下一关`, cw / 2, ch * 0.55);
      }

      if (this.jianghuFadeTimer > 1.0) {
        const pa = 0.4 + 0.3 * Math.sin(this.jianghuFadeTimer * 3);
        ctx.fillStyle = `rgba(255,255,255,${pa})`;
        ctx.font = '14px "Microsoft YaHei", sans-serif';
        ctx.fillText('点击或按空格继续', cw / 2, ch * 0.70);
      }
    }

    if (this.jianghuPhase === 'defeat') {
      const alpha = Math.min(1, this.jianghuFadeTimer / 0.5);
      ctx.fillStyle = `rgba(0,0,0,${0.8 * alpha})`;
      ctx.fillRect(0, 0, cw, ch);

      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,68,68,${alpha})`;
      ctx.font = 'bold 32px "Microsoft YaHei", sans-serif';
      ctx.fillText('江湖路断', cw / 2, ch * 0.35);

      ctx.fillStyle = `rgba(200,200,200,${alpha})`;
      ctx.font = '16px "Microsoft YaHei", sans-serif';
      ctx.fillText(`止步第${this.jianghuStage + 1}关 · ${stage ? stage.name : ''}`, cw / 2, ch * 0.45);

      if (this.jianghuFadeTimer > 1.0) {
        const pa = 0.4 + 0.3 * Math.sin(this.jianghuFadeTimer * 3);
        ctx.fillStyle = `rgba(255,255,255,${pa})`;
        ctx.font = '14px "Microsoft YaHei", sans-serif';
        ctx.fillText('点击或按ESC返回菜单', cw / 2, ch * 0.60);
      }
    }

    if (this.jianghuPhase === 'complete') {
      const alpha = Math.min(1, this.jianghuFadeTimer / 0.5);
      ctx.fillStyle = `rgba(0,0,0,${0.85 * alpha})`;
      ctx.fillRect(0, 0, cw, ch);

      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,215,0,${alpha})`;
      ctx.font = 'bold 36px "Microsoft YaHei", sans-serif';
      ctx.fillText('🏆 江湖行 · 通关!', cw / 2, ch * 0.30);

      ctx.fillStyle = `rgba(255,204,100,${alpha})`;
      ctx.font = '18px "Microsoft YaHei", sans-serif';
      ctx.fillText('你历经十关磨难，终成一代宗师。', cw / 2, ch * 0.42);
      ctx.fillText(`剩余生命: ${'❤'.repeat(this.jianghuLives)}`, cw / 2, ch * 0.52);

      if (this.jianghuFadeTimer > 1.0) {
        const pa = 0.4 + 0.3 * Math.sin(this.jianghuFadeTimer * 3);
        ctx.fillStyle = `rgba(255,255,255,${pa})`;
        ctx.font = '14px "Microsoft YaHei", sans-serif';
        ctx.fillText('点击或按ESC返回菜单', cw / 2, ch * 0.68);
      }
    }
  }

  /** 自动换行绘制文字 */
  _drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    const chars = text.split('');
    let line = '';
    let curY = y;
    for (const ch of chars) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line.length > 0) {
        ctx.fillText(line, x, curY);
        line = ch;
        curY += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, curY);
  }

}

// 混入提取的模块方法
Object.assign(Game.prototype, eventLogMethods);
Object.assign(Game.prototype, testModeMethods);
