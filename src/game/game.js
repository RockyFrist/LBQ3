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

export class Game {
  constructor(canvas, input, opts = {}) {
    this.canvas = canvas;
    this.input = input;
    this.camera = new Camera();
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

    this._rebuildFighterList();

    if (this.mode === 'test') {
      if (this.testSimOnly) {
        this._runAllTestsSync();
      } else {
        this._startTestRound();
      }
    }
  }

  spawnEnemy() {
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

    // ===== 胜利阶段：玩家可自由移动，AI做表演散步 =====
    if (this._victoryTimer >= 0) {
      this._victoryTimer += dt;
      const pf = this.player.fighter;
      const enemy0 = this.enemies[0]?.fighter;
      const noop = { moveX: 0, moveY: 0, faceAngle: 0, lightAttack: false, heavyAttack: false, blockHeld: false, dodge: false, dodgeAngle: 0 };
      const isPlayerMode = this.mode === 'pvai' || this.mode === 'wusheng';

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
    } else if (this._victoryTimer < 0 && this.enemies.length > 0) {
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
    // 纯数据模式：只绘制结果
    if (this.testSimOnly && this.testDone) {
      const ctx = this.canvas.getContext('2d');
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this._drawTestResults();
      return;
    }

    this.renderer.clear();
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

    // 屏幕闪光
    this.renderer.drawScreenFlash(this.screenFlash);

    // 慢动作视觉
    if (this.timeScaleTimer > 0) {
      this.renderer.drawSlowMoEffect(this.timeScale, this.timeScaleTimer);
    }

    // HUD
    const target = this._getTarget();
    this.ui.draw(this.player.fighter, target, this.enemies, this.difficulty);

    // 模式标签
    if (this.mode === 'spectate') {
      this._drawModeLabel('🦗 斗蛐蛐 · R重置 · ESC返回菜单');
    } else if (this.mode === 'test') {
      this._drawModeLabel(`📊 自动测试 ×${this.testSpeed} · 第 ${this.testRound}/${this.testRounds} 轮`);
    }

    // 测试结果
    if (this.testDone) {
      this._drawTestResults();
    }
  }

  _drawModeLabel(text) {
    const ctx = this.canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, this.canvas.height - 30, this.canvas.width, 30);
    ctx.fillStyle = '#aaa';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, this.canvas.width / 2, this.canvas.height - 10);
  }

}

// 混入提取的模块方法
Object.assign(Game.prototype, eventLogMethods);
Object.assign(Game.prototype, testModeMethods);
