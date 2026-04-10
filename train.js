#!/usr/bin/env node
/**
 * 神经网络自博弈训练脚本
 *
 * 用法:
 *   node train.js                        # 默认训练 100 代
 *   node train.js --generations 500      # 训练 500 代
 *   node train.js --episodes 20          # 每代 20 局
 *   node train.js --lr 0.002             # 学习率
 *   node train.js --load weights.json    # 加载已有权重继续训练
 *   node train.js --opponent-diff 5      # 对手使用 D5 AI (默认: 自博弈)
 *   node train.js --eval                 # 只评估，不训练
 *
 * 训练模式:
 *   1. 自博弈 (默认): NN vs NN 的克隆体
 *   2. 对抗固定AI: NN vs D1~D5 AI
 *   3. 课程学习: 先打D1, 胜率>70%后升D2, ..., 直到D5
 */

import * as C from './src/constants.js';
import { Fighter } from './src/fighter.js';
import { Enemy } from './src/enemy.js';
import { CombatSystem } from './src/combat.js';
import { dist, angleBetween } from './src/utils.js';
import {
  NeuralNetwork, extractState, actionToCommand,
  PolicyGradientTrainer, ACTIONS,
} from './src/nn-agent.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// ---- 参数 ----
const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] != null ? Number(args[i + 1]) : def;
}
function getArgStr(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] != null ? args[i + 1] : def;
}

const GENERATIONS   = getArg('--generations', 100);
const EPISODES      = getArg('--episodes', 10);
const LR            = getArg('--lr', 0.001);
const GAMMA         = getArg('--gamma', 0.99);
const OPPONENT_DIFF = getArg('--opponent-diff', 0); // 0 = 自博弈
const CURRICULUM    = args.includes('--curriculum');
const EVAL_ONLY     = args.includes('--eval');
const LOAD_PATH     = getArgStr('--load', null);
const SAVE_PATH     = getArgStr('--save', 'nn-weights.json');

// ---- Mock ----
const mockParticles = {
  sparks() {}, blockSpark() {}, blood() {}, clash() {}, execution() {},
  update() {}, particles: [],
};
const mockCamera = { shake() {}, update() {} };

const SIM_DT = 1 / 60;
const MAX_TICKS = 60 * 60;

// ---- 创建/加载网络 ----
const STATE_DIM = 24;
const ACTION_DIM = ACTIONS.length; // 8

let policyNet;
if (LOAD_PATH && existsSync(LOAD_PATH)) {
  const data = JSON.parse(readFileSync(LOAD_PATH, 'utf-8'));
  policyNet = NeuralNetwork.fromJSON(data);
  console.log(`  已加载权重: ${LOAD_PATH}`);
} else {
  policyNet = new NeuralNetwork([STATE_DIM, 64, 32, ACTION_DIM]);
  console.log(`  新建网络: ${STATE_DIM}→64→32→${ACTION_DIM}`);
}

const trainer = new PolicyGradientTrainer(policyNet, { lr: LR, gamma: GAMMA });

// ---- 运行一局 NN vs Opponent ----
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
    // 自博弈: 对手使用策略网络的克隆
    opPolicyNet = policyNet.clone();
    fighterB = new Fighter(C.ARENA_W / 2 + 150, C.ARENA_H / 2, {
      color: '#ff4444', team: 1, name: 'NN对手',
    });
  }

  const combat = new CombatSystem(mockParticles, mockCamera);
  const allFighters = [fighterA, fighterB];

  const trajectoryA = [];
  const trajectoryB = []; // 自博弈时使用
  const events = [];
  let gameTime = 0;
  let hitFreezeTimer = 0;
  let timeScale = 1;
  let timeScaleTimer = 0;
  let actionTimerA = 0, actionTimerB = 0;
  let lastActionA = 0, lastActionB = 0;
  const DECISION_INTERVAL = 0.1;
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
      const { action, prob, probs } = policyNet.sampleAction(state);
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
      // 自博弈 NN 对手
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

    // perfectDodged 清理
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

    // 战斗判定
    combat.resolve(allFighters, gameTime, dt);

    // 收集中间奖励 (HP变化)
    const hpDeltaA = fighterA.hp - prevHpA;
    const hpDeltaB = fighterB.hp - prevHpB;
    if (trajectoryA.length > 0) {
      const last = trajectoryA[trajectoryA.length - 1];
      // 伤害对手 +, 被伤害 -
      last.reward += (-hpDeltaB) * 0.01; // 对手掉血 = 正奖励
      last.reward += hpDeltaA * 0.01;    // 自己掉血 = 负奖励
    }
    if (trajectoryB.length > 0) {
      const last = trajectoryB[trajectoryB.length - 1];
      last.reward += (-hpDeltaA) * 0.01;
      last.reward += hpDeltaB * 0.01;
    }
    prevHpA = fighterA.hp;
    prevHpB = fighterB.hp;

    // 战斗事件奖励
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

      // 终局奖励
      const finalA = winner === 'A' ? 1.0 : winner === 'B' ? -1.0 : -0.1; // 平局轻微惩罚
      const finalB = winner === 'B' ? 1.0 : winner === 'A' ? -1.0 : -0.1;

      if (trajectoryA.length > 0) trajectoryA[trajectoryA.length - 1].reward += finalA;
      if (trajectoryB.length > 0) trajectoryB[trajectoryB.length - 1].reward += finalB;

      return {
        winner,
        duration: gameTime,
        hpA: Math.max(0, fighterA.hp),
        hpB: Math.max(0, fighterB.hp),
        trajectoryA,
        trajectoryB,
        events,
      };
    }
  }

  // 超时
  if (trajectoryA.length > 0) trajectoryA[trajectoryA.length - 1].reward -= 0.1;
  if (trajectoryB.length > 0) trajectoryB[trajectoryB.length - 1].reward -= 0.1;

  return {
    winner: 'draw',
    duration: gameTime,
    hpA: Math.max(0, fighterA.hp),
    hpB: Math.max(0, fighterB.hp),
    trajectoryA,
    trajectoryB,
    events,
  };
}

// ---- 评估 ----
function evaluate(policyNet, diff, rounds = 50) {
  let wins = 0;
  for (let i = 0; i < rounds; i++) {
    const result = runEpisode(policyNet, 'ai', diff);
    if (result.winner === 'A') wins++;
  }
  return wins / rounds;
}

// ---- 主训练循环 ----
console.log(`\n${'='.repeat(60)}`);
console.log(`  武圣训练系统 · 神经网络自博弈`);
console.log(`  ${GENERATIONS}代 × ${EPISODES}局/代  lr=${LR}  γ=${GAMMA}`);
console.log(`  对手: ${OPPONENT_DIFF > 0 ? `固定AI D${OPPONENT_DIFF}` : CURRICULUM ? '课程学习 D1→D5' : '自博弈'}`);
console.log(`${'='.repeat(60)}\n`);

if (EVAL_ONLY) {
  console.log('  ── 评估模式 ──');
  for (let d = 1; d <= 5; d++) {
    const wr = evaluate(policyNet, d, 50);
    console.log(`  vs D${d}: ${(wr * 100).toFixed(1)}% 胜率`);
  }
  process.exit(0);
}

let currDiff = CURRICULUM ? 1 : OPPONENT_DIFF;
const history = [];

for (let gen = 0; gen < GENERATIONS; gen++) {
  const genStart = performance.now();
  let totalWins = 0, totalDuration = 0, totalLoss = 0;
  const allTrajectories = [];

  for (let ep = 0; ep < EPISODES; ep++) {
    const opType = currDiff > 0 ? 'ai' : 'self';
    const result = runEpisode(policyNet, opType, currDiff);

    if (result.winner === 'A') totalWins++;
    totalDuration += result.duration;
    allTrajectories.push(result.trajectoryA);

    // 自博弈: 也用对手轨迹训练（镜像学习）
    if (opType === 'self' && result.trajectoryB.length > 0) {
      allTrajectories.push(result.trajectoryB);
    }
  }

  // 批量更新：合并所有轨迹
  for (const traj of allTrajectories) {
    if (traj.length > 0) {
      const loss = trainer.updateAnalytic(traj);
      totalLoss += loss;
    }
  }

  const winRate = totalWins / EPISODES;
  const avgDur = totalDuration / EPISODES;
  const avgLoss = totalLoss / allTrajectories.length;
  const genTime = ((performance.now() - genStart) / 1000).toFixed(1);

  // 日志
  const bar = '█'.repeat(Math.floor(winRate * 20)) + '░'.repeat(20 - Math.floor(winRate * 20));
  console.log(`  [${String(gen + 1).padStart(4)}/${GENERATIONS}] ${bar} ${(winRate * 100).toFixed(0).padStart(3)}% 胜  ${avgDur.toFixed(1)}s  loss=${avgLoss.toFixed(4)}  ${genTime}s`);

  history.push({ gen: gen + 1, winRate, avgDur, avgLoss });

  // 课程学习: 升难度
  if (CURRICULUM && winRate >= 0.7 && currDiff < 5) {
    currDiff++;
    console.log(`\n  ★ 晋级! 对手升至 D${currDiff}\n`);
  }

  // 每 10 代保存检查点
  if ((gen + 1) % 10 === 0) {
    const saveName = SAVE_PATH.replace('.json', `-gen${gen + 1}.json`);
    writeFileSync(saveName, JSON.stringify(policyNet.toJSON()), 'utf-8');
  }
}

// ---- 保存最终权重 ----
writeFileSync(SAVE_PATH, JSON.stringify(policyNet.toJSON()), 'utf-8');
console.log(`\n  权重已保存: ${SAVE_PATH}`);

// ---- 最终评估 ----
console.log(`\n  ── 最终评估 ──`);
for (let d = 1; d <= 5; d++) {
  const wr = evaluate(policyNet, d, 50);
  console.log(`  vs D${d}: ${(wr * 100).toFixed(1)}% 胜率`);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  训练完成!`);
console.log(`${'='.repeat(60)}\n`);
