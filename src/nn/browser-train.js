/**
 * 浏览器端训练模块 — 在 UI 中直接训练武圣 NN
 * 使用 async chunked execution 避免阻塞 UI
 */

import * as C from '../core/constants.js';
import { Fighter } from '../combat/fighter.js';
import { Enemy } from '../ai/enemy.js';
import { CombatSystem } from '../combat/combat-system.js';
import { dist, angleBetween } from '../core/utils.js';
import {
  NeuralNetwork, extractState, actionToCommand,
  PolicyGradientTrainer, ACTIONS,
} from './nn-agent.js';

// ---- Mock (无渲染) ----
const mockParticles = {
  sparks() {}, blockSpark() {}, blood() {}, clash() {}, execution() {},
  update() {}, particles: [],
};
const mockCamera = { shake() {}, update() {} };

const SIM_DT = 1 / 60;
const MAX_TICKS = 60 * 60; // 60秒超时
const DECISION_INTERVAL = 0.1;

// ---- 运行一局 ----
function runEpisode(policyNet, opponentType, opponentDiff) {
  const fighterA = new Fighter(C.ARENA_W / 2, C.ARENA_H / 2, {
    color: '#ff00ff', team: 0, name: 'NN武圣',
  });

  let fighterB, enemyCtrl;
  let opPolicyNet = null;
  if (opponentType === 'ai') {
    enemyCtrl = new Enemy(C.ARENA_W / 2 + 150, C.ARENA_H / 2, opponentDiff);
    fighterB = enemyCtrl.fighter;
  } else {
    opPolicyNet = policyNet.clone();
    fighterB = new Fighter(C.ARENA_W / 2 + 150, C.ARENA_H / 2, {
      color: '#ff4444', team: 1, name: 'NN对手',
    });
  }

  const combat = new CombatSystem(mockParticles, mockCamera);
  const allFighters = [fighterA, fighterB];
  const trajectoryA = [];
  const trajectoryB = [];
  let gameTime = 0;
  let hitFreezeTimer = 0;
  let timeScale = 1, timeScaleTimer = 0;
  let actionTimerA = 0, actionTimerB = 0;
  let lastActionA = 0, lastActionB = 0;
  let prevHpA = C.MAX_HP, prevHpB = C.MAX_HP;

  for (let t = 0; t < MAX_TICKS; t++) {
    gameTime += SIM_DT;
    let dt = SIM_DT;

    if (hitFreezeTimer > 0) { hitFreezeTimer -= dt; continue; }

    if (timeScaleTimer > 0) {
      timeScaleTimer -= dt;
      dt *= timeScale;
      if (timeScaleTimer <= 0) timeScale = 1;
    }

    // NN 决策 (A)
    actionTimerA -= dt;
    if (actionTimerA <= 0 && fighterA.alive && fighterB.alive) {
      actionTimerA = DECISION_INTERVAL;
      const state = extractState(fighterA, fighterB);
      const { action, prob } = policyNet.sampleAction(state);
      lastActionA = action;
      trajectoryA.push({ state: Array.from(state), action, prob, reward: 0 });
    }

    // 对手命令
    let cmdB;
    if (opponentType === 'ai') {
      cmdB = fighterB.alive && fighterA.alive
        ? enemyCtrl.getCommands(dt, fighterA)
        : { moveX: 0, moveY: 0, faceAngle: 0, lightAttack: false, heavyAttack: false, blockHeld: false, dodge: false, dodgeAngle: 0 };
    } else {
      actionTimerB -= dt;
      if (actionTimerB <= 0 && fighterB.alive && fighterA.alive) {
        actionTimerB = DECISION_INTERVAL;
        const stateB = extractState(fighterB, fighterA);
        const { action: actB, prob: probB } = opPolicyNet.sampleAction(stateB);
        lastActionB = actB;
        trajectoryB.push({ state: Array.from(stateB), action: actB, prob: probB, reward: 0 });
      }
      cmdB = actionToCommand(lastActionB, fighterB, fighterA);
    }

    const cmdA = actionToCommand(lastActionA, fighterA, fighterB);

    if (fighterA.perfectDodged && fighterA.perfectDodged !== 'refunded' && fighterA.state === 'idle') fighterA.perfectDodged = false;
    if (fighterA.perfectDodged === 'refunded' && fighterA.state === 'idle') fighterA.perfectDodged = false;

    fighterA.update(dt, cmdA, gameTime);
    if (fighterB.alive) fighterB.update(dt, cmdB, gameTime);

    // 碰撞
    const dx = fighterB.x - fighterA.x;
    const dy = fighterB.y - fighterA.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const minD = fighterA.radius + fighterB.radius;
    if (d < minD && d > 0.1) {
      const overlap = (minD - d) / 2;
      const nx = dx / d, ny = dy / d;
      fighterA.x -= nx * overlap; fighterA.y -= ny * overlap;
      fighterB.x += nx * overlap; fighterB.y += ny * overlap;
    }

    combat.resolve(allFighters, gameTime, dt);

    // 中间奖励
    const hpDeltaA = fighterA.hp - prevHpA;
    const hpDeltaB = fighterB.hp - prevHpB;
    if (trajectoryA.length > 0) {
      const last = trajectoryA[trajectoryA.length - 1];
      last.reward += (-hpDeltaB) * 0.01;
      last.reward += hpDeltaA * 0.01;
    }
    if (trajectoryB.length > 0) {
      const last = trajectoryB[trajectoryB.length - 1];
      last.reward += (-hpDeltaA) * 0.01;
      last.reward += hpDeltaB * 0.01;
    }
    prevHpA = fighterA.hp;
    prevHpB = fighterB.hp;

    for (const evt of combat.events) {
      if (evt.type === 'parry') {
        const isA = evt.target === fighterA;
        if (trajectoryA.length > 0) trajectoryA[trajectoryA.length - 1].reward += isA ? 0.15 : -0.1;
        if (trajectoryB.length > 0) trajectoryB[trajectoryB.length - 1].reward += isA ? -0.1 : 0.15;
        const ts = C.PARRY_TIME_SCALE[evt.level];
        if (ts && (timeScaleTimer <= 0 || ts.scale < timeScale)) {
          timeScale = ts.scale; timeScaleTimer = ts.duration;
        }
      }
    }

    // 胜负
    if (!fighterA.alive || !fighterB.alive || gameTime > 60) {
      const winner = gameTime > 60 ? 'draw' : fighterA.alive ? 'A' : 'B';
      const finalA = winner === 'A' ? 1.0 : winner === 'B' ? -1.0 : -0.1;
      const finalB = winner === 'B' ? 1.0 : winner === 'A' ? -1.0 : -0.1;
      if (trajectoryA.length > 0) trajectoryA[trajectoryA.length - 1].reward += finalA;
      if (trajectoryB.length > 0) trajectoryB[trajectoryB.length - 1].reward += finalB;
      return { winner, duration: gameTime, trajectoryA, trajectoryB };
    }
  }

  if (trajectoryA.length > 0) trajectoryA[trajectoryA.length - 1].reward -= 0.1;
  if (trajectoryB.length > 0) trajectoryB[trajectoryB.length - 1].reward -= 0.1;
  return { winner: 'draw', duration: gameTime, trajectoryA, trajectoryB };
}

// ---- 评估 ----
function evaluate(policyNet, diff, rounds) {
  let wins = 0;
  for (let i = 0; i < rounds; i++) {
    const result = runEpisode(policyNet, 'ai', diff);
    if (result.winner === 'A') wins++;
  }
  return wins / rounds;
}

// ---- 浏览器训练器 ----
export class BrowserTrainer {
  constructor(opts = {}) {
    this.generations = opts.generations || 50;
    this.episodes = opts.episodes || 10;
    this.lr = opts.lr || 0.001;
    this.gamma = opts.gamma || 0.99;
    this.curriculum = opts.curriculum !== undefined ? opts.curriculum : true;

    this.policyNet = opts.policyNet || new NeuralNetwork([24, 64, 32, ACTIONS.length]);
    this.trainer = new PolicyGradientTrainer(this.policyNet, { lr: this.lr, gamma: this.gamma });

    // 状态
    this.running = false;
    this.paused = false;
    this.currentGen = 0;
    this.currentEp = 0;
    this.currDiff = this.curriculum ? 1 : 5;
    this.winRate = 0;
    this.avgDuration = 0;
    this.evalRates = {}; // { 1: 0.8, 2: 0.5, ... }
    this.log = []; // 最近的日志
    this._aborted = false;
  }

  /** 异步训练入口 — 不阻塞 UI */
  async start() {
    this.running = true;
    this._aborted = false;
    this.log = [];

    this._addLog(`开始训练: ${this.generations}代×${this.episodes}局 ${this.curriculum ? '课程学习' : `vs D${this.currDiff}`}`);

    for (let gen = 0; gen < this.generations; gen++) {
      if (this._aborted) break;
      this.currentGen = gen + 1;

      let wins = 0, totalDuration = 0;
      const allTrajectories = [];

      for (let ep = 0; ep < this.episodes; ep++) {
        if (this._aborted) break;
        this.currentEp = ep + 1;

        const opType = this.currDiff > 0 ? 'ai' : 'self';
        const result = runEpisode(this.policyNet, opType, this.currDiff);

        if (result.winner === 'A') wins++;
        totalDuration += result.duration;
        allTrajectories.push(result.trajectoryA);
        if (opType === 'self' && result.trajectoryB.length > 0) {
          allTrajectories.push(result.trajectoryB);
        }

        // 每局后让出控制权给 UI
        await this._yield();
      }

      if (this._aborted) break;

      // 批量梯度更新
      for (const traj of allTrajectories) {
        if (traj.length > 0) {
          this.trainer.updateAnalytic(traj);
        }
      }

      this.winRate = wins / this.episodes;
      this.avgDuration = totalDuration / this.episodes;

      this._addLog(`[${gen + 1}/${this.generations}] D${this.currDiff} 胜率${(this.winRate * 100).toFixed(0)}% 时长${this.avgDuration.toFixed(1)}s`);

      // 课程学习晋级
      if (this.curriculum && this.winRate >= 0.7 && this.currDiff < 5) {
        this.currDiff++;
        this._addLog(`★ 晋级! 对手升至 D${this.currDiff}`);
      }

      // 每代后让出控制权
      await this._yield();

      // 暂停支持
      while (this.paused && !this._aborted) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    if (!this._aborted) {
      // 最终评估
      this._addLog('评估中...');
      await this._yield();
      for (let d = 1; d <= 5; d++) {
        const wr = evaluate(this.policyNet, d, 20);
        this.evalRates[d] = wr;
        this._addLog(`vs D${d}: ${(wr * 100).toFixed(0)}%`);
        await this._yield();
      }
    }

    this.running = false;
    this._addLog(this._aborted ? '训练已停止' : '训练完成!');
  }

  stop() {
    this._aborted = true;
  }

  togglePause() {
    this.paused = !this.paused;
  }

  /** 获取当前权重的 JSON (用于下载/保存) */
  getWeightsJSON() {
    return this.policyNet.toJSON();
  }

  /** 获取 NeuralNetwork 实例 */
  getNetwork() {
    return this.policyNet;
  }

  /** 进度 0~1 */
  get progress() {
    if (this.generations === 0) return 1;
    return ((this.currentGen - 1) * this.episodes + this.currentEp) / (this.generations * this.episodes);
  }

  _addLog(msg) {
    this.log.push(msg);
    if (this.log.length > 20) this.log.shift();
  }

  /** 让出 CPU 一帧，使 UI 可以刷新 */
  _yield() {
    return new Promise(r => setTimeout(r, 0));
  }
}
