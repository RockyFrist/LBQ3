#!/usr/bin/env node
/**
 * Node.js 无头测试执行器（增强版）
 * 用法: node test-runner.js [options]
 *   --rounds N       轮数 (默认 100)
 *   --diffA  N       蓝方难度 1-5 (默认 5)
 *   --diffB  N       红方难度 1-5 (默认 5)
 *   --weaponA id     蓝方武器 (默认 dao)
 *   --weaponB id     红方武器 (默认 dao)
 *   --json           只输出 JSON (方便程序读取)
 *   --detail         输出每轮明细
 *   --log            输出详细事件回放日志（含位置、状态、打空等）
 *   --log-round N    只输出第N轮的详细日志（配合 --log 使用）
 */

import * as C from './src/core/constants.js';
import { Fighter } from './src/combat/fighter.js';
import { Enemy } from './src/ai/enemy.js';
import { CombatSystem } from './src/combat/combat-system.js';
import { dist, angleBetween } from './src/core/utils.js';
import { getWeapon } from './src/weapons/weapon-defs.js';

// ---- 命令行参数 ----
const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] != null ? Number(args[i + 1]) : def;
}
function getStrArg(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] != null ? args[i + 1] : def;
}
const ROUNDS     = getArg('--rounds', 100);
const DIFF_A     = getArg('--diffA', 5);
const DIFF_B     = getArg('--diffB', 5);
const WEAPON_A   = getStrArg('--weaponA', 'dao');
const WEAPON_B   = getStrArg('--weaponB', 'dao');
const JSON_ONLY  = args.includes('--json');
const DETAIL     = args.includes('--detail');
const LOG_MODE   = args.includes('--log');
const LOG_ROUND  = getArg('--log-round', -1);

// ---- Mock 视觉系统 (no-op) ----
const mockParticles = {
  sparks() {}, blockSpark() {}, blood() {}, clash() {}, execution() {},
  ultimateSlash() {},
  update() {}, particles: [],
};
const mockCamera = { shake() {}, update() {} };

// ---- 状态快照 ----
function snapshot(f, label) {
  return {
    id: label,
    x: +f.x.toFixed(1), y: +f.y.toFixed(1),
    hp: f.hp, stamina: +f.stamina.toFixed(2),
    state: f.state, phase: f.phase,
    attackType: f.attackType,
    facing: +(f.facing * 180 / Math.PI).toFixed(1),
    exhausted: f.isExhausted,
  };
}

// ---- 模拟引擎 ----
const SIM_DT = 1 / 60;
const MAX_TICKS = 60 * 60; // 每轮最多 60 秒

function runRound(diffA, diffB, collectLog, weaponA, weaponB) {
  // 创建角色
  const wA = getWeapon(weaponA || 'dao');
  const wB = getWeapon(weaponB || 'dao');
  const fighterA = new Fighter(C.ARENA_W / 2, C.ARENA_H / 2, {
    color: '#4499ff', team: 0, name: `AI-${diffA}(蓝)`, weapon: wA,
  });
  const enemyCtrl = new Enemy(C.ARENA_W / 2 + 150, C.ARENA_H / 2, diffB, { weaponId: weaponB || 'dao' });
  enemyCtrl.fighter.name = `AI-${diffB}(红)`;
  const fighterB = enemyCtrl.fighter;

  // 蓝方也用 AI 控制
  const playerAI = new Enemy(C.ARENA_W / 2, C.ARENA_H / 2, diffA, { weaponId: weaponA || 'dao' });
  playerAI.fighter = fighterA;

  // 启用决策日志
  if (collectLog) {
    playerAI.logEnabled = true;
    enemyCtrl.logEnabled = true;
  }

  const combat = new CombatSystem(mockParticles, mockCamera);
  const allFighters = [fighterA, fighterB];

  const stats = {
    duration: 0,
    hitsA: { light: 0, heavy: 0 }, hitsB: { light: 0, heavy: 0 },
    damageA: 0, damageB: 0,
    parryA: { precise: 0, semi: 0, nonPrecise: 0 },
    parryB: { precise: 0, semi: 0, nonPrecise: 0 },
    clashLight: 0, clashHeavy: 0,
    blockBreakA: 0, blockBreakB: 0,
    executionA: 0, executionB: 0,
    feintA: 0, feintB: 0,
    whiffA: { light: 0, heavy: 0, parryCounter: 0 },
    whiffB: { light: 0, heavy: 0, parryCounter: 0 },
    dodgeA: 0, dodgeB: 0,
    perfectDodgeA: 0, perfectDodgeB: 0,
    ultUsedA: 0, ultUsedB: 0,
    ultHitsA: 0, ultHitsB: 0,
    ultDmgA: 0, ultDmgB: 0,
    ultCompA: 0, ultCompB: 0,
    ultInterruptA: 0, ultInterruptB: 0,
    ultClash: 0,
    winner: 'draw', hpA: 0, hpB: 0,
  };

  // 事件回放日志
  const eventLog = collectLog ? [] : null;

  function logEvent(time, type, detail) {
    if (!eventLog) return;
    const d = dist(fighterA, fighterB);
    eventLog.push({
      t: +time.toFixed(3),
      type,
      dist: +d.toFixed(0),
      A: snapshot(fighterA, 'A'),
      B: snapshot(fighterB, 'B'),
      ...detail,
    });
  }

  let gameTime = 0;
  let hitFreezeTimer = 0;
  let timeScale = 1;
  let timeScaleTimer = 0;
  let prevStateA = 'idle', prevStateB = 'idle';
  let prevPhaseA = 'none', prevPhaseB = 'none';

  // 状态/阶段时间追踪（用于计算持续时间）
  let stateStartA = 0, stateStartB = 0;
  let phaseStartA = 0, phaseStartB = 0;

  for (let t = 0; t < MAX_TICKS; t++) {
    gameTime += SIM_DT;
    let dt = SIM_DT;

    // 冻结帧
    if (hitFreezeTimer > 0) { hitFreezeTimer -= dt; continue; }

    // 时间缩放
    if (timeScaleTimer > 0) {
      timeScaleTimer -= dt;
      dt *= timeScale;
      if (timeScaleTimer <= 0) timeScale = 1;
    }

    // AI 命令
    const emptyCmd = { moveX: 0, moveY: 0, faceAngle: 0, lightAttack: false, heavyAttack: false, blockHeld: false, dodge: false, dodgeAngle: 0 };
    const pCmd = fighterA.alive && fighterB.alive ? playerAI.getCommands(dt, fighterB) : emptyCmd;
    const eCmd = fighterB.alive && fighterA.alive ? enemyCtrl.getCommands(dt, fighterA) : emptyCmd;

    // perfectDodged 清理
    if (fighterA.perfectDodged && fighterA.perfectDodged !== 'refunded' && fighterA.state === 'idle') fighterA.perfectDodged = false;
    if (fighterA.perfectDodged === 'refunded' && fighterA.state === 'idle') fighterA.perfectDodged = false;

    // 记录更新前的状态
    prevStateA = fighterA.state;
    prevStateB = fighterB.state;

    // 清除 whiff 标记
    fighterA.lastWhiff = null;
    fighterB.lastWhiff = null;

    fighterA.update(dt, pCmd, gameTime);
    if (fighterB.alive) fighterB.update(dt, eCmd, gameTime);

    // 检测攻击发起、闪避、格挡（state transition）+ 状态持续时间
    if (collectLog) {
      // A 状态切换 → 记录旧状态持续时间
      if (fighterA.state !== prevStateA) {
        const dur = gameTime - stateStartA;
        if (prevStateA !== 'idle' && dur > 0.001) {
          logEvent(gameTime, 'stateEnd', { who: 'A', prevState: prevStateA, duration: +dur.toFixed(3) });
        }
        stateStartA = gameTime;
        phaseStartA = gameTime;
      }
      if (fighterB.state !== prevStateB) {
        const dur = gameTime - stateStartB;
        if (prevStateB !== 'idle' && dur > 0.001) {
          logEvent(gameTime, 'stateEnd', { who: 'B', prevState: prevStateB, duration: +dur.toFixed(3) });
        }
        stateStartB = gameTime;
        phaseStartB = gameTime;
      }
      // 阶段切换（startup→active→recovery）
      if (fighterA.phase !== prevPhaseA) {
        if (prevPhaseA !== 'none') {
          const pdur = gameTime - phaseStartA;
          logEvent(gameTime, 'phaseChange', { who: 'A', from: prevPhaseA, to: fighterA.phase, phaseDur: +pdur.toFixed(3) });
        }
        phaseStartA = gameTime;
        prevPhaseA = fighterA.phase;
      }
      if (fighterB.phase !== prevPhaseB) {
        if (prevPhaseB !== 'none') {
          const pdur = gameTime - phaseStartB;
          logEvent(gameTime, 'phaseChange', { who: 'B', from: prevPhaseB, to: fighterB.phase, phaseDur: +pdur.toFixed(3) });
        }
        phaseStartB = gameTime;
        prevPhaseB = fighterB.phase;
      }

      if (fighterA.state === 'lightAttack' && fighterA.phase === 'startup' && prevStateA !== 'lightAttack')
        logEvent(gameTime, 'attackStart', { who: 'A', attackType: 'light', step: fighterA.comboStep });
      if (fighterA.state === 'heavyAttack' && fighterA.phase === 'startup' && prevStateA !== 'heavyAttack')
        logEvent(gameTime, 'attackStart', { who: 'A', attackType: 'heavy' });
      if (fighterB.state === 'lightAttack' && fighterB.phase === 'startup' && prevStateB !== 'lightAttack')
        logEvent(gameTime, 'attackStart', { who: 'B', attackType: 'light', step: fighterB.comboStep });
      if (fighterB.state === 'heavyAttack' && fighterB.phase === 'startup' && prevStateB !== 'heavyAttack')
        logEvent(gameTime, 'attackStart', { who: 'B', attackType: 'heavy' });
      if (fighterA.state === 'dodging' && prevStateA !== 'dodging')
        logEvent(gameTime, 'dodge', { who: 'A' });
      if (fighterB.state === 'dodging' && prevStateB !== 'dodging')
        logEvent(gameTime, 'dodge', { who: 'B' });
      if (fighterA.state === 'blocking' && prevStateA !== 'blocking')
        logEvent(gameTime, 'blockStart', { who: 'A' });
      if (fighterB.state === 'blocking' && prevStateB !== 'blocking')
        logEvent(gameTime, 'blockStart', { who: 'B' });
    }

    // 打空检测
    if (fighterA.lastWhiff) {
      const w = fighterA.lastWhiff;
      stats.whiffA[w.type] = (stats.whiffA[w.type] || 0) + 1;
      logEvent(gameTime, 'whiff', {
        who: 'A', attackType: w.type, range: w.range,
        reason: dist(fighterA, fighterB) > w.range + 30 ? 'outOfRange' :
                fighterB.state === 'dodging' ? 'dodged' : 'missed',
      });
    }
    if (fighterB.lastWhiff) {
      const w = fighterB.lastWhiff;
      stats.whiffB[w.type] = (stats.whiffB[w.type] || 0) + 1;
      logEvent(gameTime, 'whiff', {
        who: 'B', attackType: w.type, range: w.range,
        reason: dist(fighterA, fighterB) > w.range + 30 ? 'outOfRange' :
                fighterA.state === 'dodging' ? 'dodged' : 'missed',
      });
    }

    // 闪避统计
    if (fighterA.state === 'dodging' && prevStateA !== 'dodging') stats.dodgeA++;
    if (fighterB.state === 'dodging' && prevStateB !== 'dodging') stats.dodgeB++;

    // 绝技使用统计
    if (fighterA.state === 'ultimate' && prevStateA !== 'ultimate') stats.ultUsedA++;
    if (fighterB.state === 'ultimate' && prevStateB !== 'ultimate') stats.ultUsedB++;

    // 变招统计（实际执行的变招：fighter.feinted 标记）
    if (fighterA.feinted) { stats.feintA++; fighterA.feinted = false; }
    if (fighterB.feinted) { stats.feintB++; fighterB.feinted = false; }

    // 碰撞分离
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

    // 记录事件
    for (const evt of combat.events) {
      switch (evt.type) {
        case 'hit': {
          const isA = evt.attacker === fighterA;
          const side = isA ? stats.hitsA : stats.hitsB;
          if (evt.atkType === 'heavy') side.heavy++; else side.light++;
          if (isA) stats.damageA += evt.damage; else stats.damageB += evt.damage;
          // 炁获取
          const qiGain = evt.atkType === 'parryCounter' ? C.QI_GAIN_COUNTER_HIT
            : evt.atkType === 'heavy' ? C.QI_GAIN_HEAVY_HIT : C.QI_GAIN_LIGHT_HIT;
          evt.attacker.gainQi(qiGain);
          evt.target.gainQi(evt.atkType === 'heavy' ? C.QI_GAIN_TAKEN_HEAVY : C.QI_GAIN_TAKEN_LIGHT);
          logEvent(gameTime, 'hit', {
            who: isA ? 'A' : 'B', target: isA ? 'B' : 'A',
            attackType: evt.atkType, damage: evt.damage,
            targetState: isA ? fighterB.state : fighterA.state,
          });
          break;
        }
        case 'parry': {
          const isA = evt.target === fighterA;
          (isA ? stats.parryA : stats.parryB)[evt.level]++;
          const ts = C.PARRY_TIME_SCALE[evt.level];
          if (ts && (timeScaleTimer <= 0 || ts.scale < timeScale)) {
            timeScale = ts.scale; timeScaleTimer = ts.duration;
          }
          // 格挡方炁获取
          const parryQi = evt.level === 'precise' ? C.QI_GAIN_PRECISE : evt.level === 'semi' ? C.QI_GAIN_SEMI : 0;
          if (parryQi > 0) evt.target.gainQi(parryQi);
          logEvent(gameTime, 'parry', {
            blocker: isA ? 'A' : 'B', attacker: isA ? 'B' : 'A', level: evt.level,
          });
          break;
        }
        case 'lightClash':
          stats.clashLight++;
          logEvent(gameTime, 'lightClash', {});
          break;
        case 'heavyClash':
          stats.clashHeavy++;
          logEvent(gameTime, 'heavyClash', {});
          break;
        case 'blockBreak': {
          if (evt.target === fighterA) stats.blockBreakA++;
          else stats.blockBreakB++;
          logEvent(gameTime, 'blockBreak', { target: evt.target === fighterA ? 'A' : 'B' });
          break;
        }
        case 'execution': {
          if (evt.attacker === fighterA) stats.executionA++;
          else stats.executionB++;
          evt.attacker.gainQi(C.QI_GAIN_EXECUTION);
          logEvent(gameTime, 'execution', {
            who: evt.attacker === fighterA ? 'A' : 'B',
            target: evt.target === fighterA ? 'A' : 'B',
            damage: evt.damage,
          });
          break;
        }
        case 'perfectDodge': {
          if (evt.target === fighterA) stats.perfectDodgeA++;
          else stats.perfectDodgeB++;
          logEvent(gameTime, 'perfectDodge', { who: evt.target === fighterA ? 'A' : 'B' });
          break;
        }
        case 'ultimateHit': {
          const isA = evt.attacker === fighterA;
          if (isA) { stats.ultHitsA += evt.hitCount; stats.ultDmgA += evt.damage * evt.hitCount; }
          else { stats.ultHitsB += evt.hitCount; stats.ultDmgB += evt.damage * evt.hitCount; }
          break;
        }
        case 'ultimate': {
          if (evt.attacker === fighterA) stats.ultCompA++;
          else stats.ultCompB++;
          break;
        }
        case 'ultimateInterrupt': {
          if (evt.target === fighterA) stats.ultInterruptA++;
          else stats.ultInterruptB++;
          break;
        }
        case 'ultimateClash': {
          stats.ultClash++;
          // 双方都算“被中断”
          stats.ultInterruptA++;
          stats.ultInterruptB++;
          break;
        }
      }
    }

    // 胜负
    const timeout = gameTime > 60;
    if (!fighterA.alive || !fighterB.alive || timeout) {
      stats.winner = timeout ? 'draw' : (fighterA.alive ? 'A' : fighterB.alive ? 'B' : 'draw');
      stats.duration = gameTime;
      stats.hpA = Math.max(0, fighterA.hp);
      stats.hpB = Math.max(0, fighterB.hp);
      if (collectLog) logEvent(gameTime, 'roundEnd', { winner: stats.winner, hpA: stats.hpA, hpB: stats.hpB });
      return { stats, eventLog, aiLogA: playerAI.decisionLog, aiLogB: enemyCtrl.decisionLog };
    }
  }

  stats.duration = gameTime;
  stats.hpA = Math.max(0, fighterA.hp);
  stats.hpB = Math.max(0, fighterB.hp);
  return { stats, eventLog, aiLogA: playerAI.decisionLog, aiLogB: enemyCtrl.decisionLog };
}

// ---- 执行所有轮次 ----
const allResults = [];
const t0 = performance.now();
for (let i = 0; i < ROUNDS; i++) {
  const collectLog = LOG_MODE && (LOG_ROUND < 0 || LOG_ROUND === i + 1);
  allResults.push(runRound(DIFF_A, DIFF_B, collectLog, WEAPON_A, WEAPON_B));
}
const elapsed = ((performance.now() - t0) / 1000).toFixed(2);

const allStats = allResults.map(r => r.stats);

// ---- 汇总 ----
const winsA = allStats.filter(s => s.winner === 'A').length;
const winsB = allStats.filter(s => s.winner === 'B').length;
const draws = allStats.filter(s => s.winner === 'draw').length;
const avgDur = allStats.reduce((a, s) => a + s.duration, 0) / ROUNDS;

const sum = (fn) => allStats.reduce((a, s) => a + fn(s), 0);
const totalHitsALight = sum(s => s.hitsA.light);
const totalHitsAHeavy = sum(s => s.hitsA.heavy);
const totalHitsBLight = sum(s => s.hitsB.light);
const totalHitsBHeavy = sum(s => s.hitsB.heavy);
const totalDmgA = sum(s => s.damageA);
const totalDmgB = sum(s => s.damageB);
const totalParryA = sum(s => s.parryA.precise + s.parryA.semi + s.parryA.nonPrecise);
const totalParryB = sum(s => s.parryB.precise + s.parryB.semi + s.parryB.nonPrecise);
const preciseA = sum(s => s.parryA.precise);
const preciseB = sum(s => s.parryB.precise);
const semiA = sum(s => s.parryA.semi);
const semiB = sum(s => s.parryB.semi);
const totalClashL = sum(s => s.clashLight);
const totalClashH = sum(s => s.clashHeavy);
const totalExeA = sum(s => s.executionA);
const totalExeB = sum(s => s.executionB);
const totalBrkA = sum(s => s.blockBreakA);
const totalBrkB = sum(s => s.blockBreakB);
const avgHpA = winsA ? allStats.filter(s => s.winner === 'A').reduce((a, s) => a + s.hpA, 0) / winsA : 0;
const avgHpB = winsB ? allStats.filter(s => s.winner === 'B').reduce((a, s) => a + s.hpB, 0) / winsB : 0;

// 新增统计
const whiffALight = sum(s => s.whiffA.light || 0);
const whiffAHeavy = sum(s => s.whiffA.heavy || 0);
const whiffAPC    = sum(s => s.whiffA.parryCounter || 0);
const whiffBLight = sum(s => s.whiffB.light || 0);
const whiffBHeavy = sum(s => s.whiffB.heavy || 0);
const whiffBPC    = sum(s => s.whiffB.parryCounter || 0);
const totalDodgeA = sum(s => s.dodgeA);
const totalDodgeB = sum(s => s.dodgeB);
const totalPDodgeA = sum(s => s.perfectDodgeA);
const totalPDodgeB = sum(s => s.perfectDodgeB);
const totalFeintA = sum(s => s.feintA);
const totalFeintB = sum(s => s.feintB);
const ultUsedA = sum(s => s.ultUsedA);
const ultUsedB = sum(s => s.ultUsedB);
const ultHitsA = sum(s => s.ultHitsA);
const ultHitsB = sum(s => s.ultHitsB);
const ultDmgA = sum(s => s.ultDmgA);
const ultDmgB = sum(s => s.ultDmgB);
const ultCompA = sum(s => s.ultCompA);
const ultCompB = sum(s => s.ultCompB);
const ultInterruptA = sum(s => s.ultInterruptA);
const ultInterruptB = sum(s => s.ultInterruptB);

const summary = {
  config: { rounds: ROUNDS, diffA: DIFF_A, diffB: DIFF_B, weaponA: WEAPON_A, weaponB: WEAPON_B, elapsed: `${elapsed}s` },
  wins: { A: winsA, B: winsB, draw: draws, rateA: +(winsA / ROUNDS * 100).toFixed(1), rateB: +(winsB / ROUNDS * 100).toFixed(1) },
  avgDuration: +avgDur.toFixed(2),
  hits: {
    A: { light: totalHitsALight, heavy: totalHitsAHeavy, total: totalHitsALight + totalHitsAHeavy },
    B: { light: totalHitsBLight, heavy: totalHitsBHeavy, total: totalHitsBLight + totalHitsBHeavy },
  },
  damage: { A: totalDmgA, B: totalDmgB },
  parry: {
    A: { precise: preciseA, semi: semiA, total: totalParryA },
    B: { precise: preciseB, semi: semiB, total: totalParryB },
  },
  clash: { light: totalClashL, heavy: totalClashH },
  blockBreak: { A: totalBrkA, B: totalBrkB },
  execution: { A: totalExeA, B: totalExeB },
  whiff: {
    A: { light: whiffALight, heavy: whiffAHeavy, parryCounter: whiffAPC, total: whiffALight + whiffAHeavy + whiffAPC },
    B: { light: whiffBLight, heavy: whiffBHeavy, parryCounter: whiffBPC, total: whiffBLight + whiffBHeavy + whiffBPC },
  },
  dodge: {
    A: { total: totalDodgeA, perfect: totalPDodgeA },
    B: { total: totalDodgeB, perfect: totalPDodgeB },
  },
  feint: {
    A: totalFeintA, B: totalFeintB,
    perRound: +((totalFeintA + totalFeintB) / ROUNDS).toFixed(2),
    perAI: +((totalFeintA + totalFeintB) / ROUNDS / 2).toFixed(2),
  },
  avgWinnerHp: { A: +avgHpA.toFixed(1), B: +avgHpB.toFixed(1) },
  ultimate: {
    A: { used: ultUsedA, hits: ultHitsA, damage: ultDmgA, completed: ultCompA, interrupted: ultInterruptA,
         dodged: ultUsedA - ultCompA - ultInterruptA,
         hitRate: ultUsedA ? +((ultCompA / ultUsedA) * 100).toFixed(1) : 0 },
    B: { used: ultUsedB, hits: ultHitsB, damage: ultDmgB, completed: ultCompB, interrupted: ultInterruptB,
         dodged: ultUsedB - ultCompB - ultInterruptB,
         hitRate: ultUsedB ? +((ultCompB / ultUsedB) * 100).toFixed(1) : 0 },
  },
};

// ---- 事件回放日志模式 ----
if (LOG_MODE) {
  const logRounds = [];
  for (let i = 0; i < allResults.length; i++) {
    const r = allResults[i];
    if (!r.eventLog) continue;
    logRounds.push({
      round: i + 1,
      winner: r.stats.winner,
      duration: +r.stats.duration.toFixed(2),
      hpA: r.stats.hpA, hpB: r.stats.hpB,
      events: r.eventLog,
      aiDecisionsA: r.aiLogA || [],
      aiDecisionsB: r.aiLogB || [],
      summary: {
        hitsA: r.stats.hitsA, hitsB: r.stats.hitsB,
        whiffA: r.stats.whiffA, whiffB: r.stats.whiffB,
        damageA: r.stats.damageA, damageB: r.stats.damageB,
      },
    });
  }

  if (JSON_ONLY) {
    console.log(JSON.stringify({ summary, rounds: logRounds }, null, 2));
  } else {
    console.log(JSON.stringify(summary, null, 2));
    console.log(`\n${'='.repeat(70)}`);
    console.log('  事件回放日志');
    console.log(`${'='.repeat(70)}`);

    for (const round of logRounds) {
      console.log(`\n  ── 第 ${round.round} 轮 [${round.winner === 'draw' ? '平局' : round.winner + '胜'}] ${round.duration}s  A:${round.hpA}HP B:${round.hpB}HP ──`);
      console.log(`  命中 A:轻${round.summary.hitsA.light}重${round.summary.hitsA.heavy}  B:轻${round.summary.hitsB.light}重${round.summary.hitsB.heavy}`);
      console.log(`  打空 A:轻${round.summary.whiffA.light||0}重${round.summary.whiffA.heavy||0}  B:轻${round.summary.whiffB.light||0}重${round.summary.whiffB.heavy||0}`);
      console.log();

      let prevTime = 0;
      for (const evt of round.events) {
        const timeStr = evt.t.toFixed(2).padStart(6);
        const delta = evt.t - prevTime;
        const deltaStr = prevTime > 0 ? `Δ${delta.toFixed(2).padStart(5)}` : '      ';
        prevTime = evt.t;
        const distStr = `${evt.dist}px`;
        switch (evt.type) {
          case 'attackStart':
            console.log(`  [${timeStr}s] ${deltaStr} ${evt.who} 发起${evt.attackType === 'heavy' ? '重击' : `轻击${evt.step||''}`}  距离${distStr}  ${otherSide(evt.who)}:${getState(evt, otherSide(evt.who))}`);
            break;
          case 'hit':
            console.log(`  [${timeStr}s] ${deltaStr} ⚔ ${evt.who}→${evt.target} ${evt.attackType}命中 ${evt.damage}伤  距离${distStr}  ${evt.target}当时:${evt.targetState}`);
            break;
          case 'whiff':
            console.log(`  [${timeStr}s] ${deltaStr} ✗ ${evt.who} ${evt.attackType}打空! 原因:${whiffReason(evt.reason)}  距离${distStr}  射程${evt.range}  ${otherSide(evt.who)}:${getState(evt, otherSide(evt.who))}`);
            break;
          case 'parry':
            console.log(`  [${timeStr}s] ${deltaStr} 🛡 ${evt.blocker} ${parryName(evt.level)}格挡${evt.attacker}  距离${distStr}`);
            break;
          case 'lightClash':
            console.log(`  [${timeStr}s] ${deltaStr} ⚡ 轻击拼刀!  距离${distStr}`);
            break;
          case 'heavyClash':
            console.log(`  [${timeStr}s] ${deltaStr} 💥 重击弹刀!  距离${distStr}`);
            break;
          case 'blockBreak':
            console.log(`  [${timeStr}s] ${deltaStr} 💔 ${evt.target} 被破防!  距离${distStr}`);
            break;
          case 'execution':
            console.log(`  [${timeStr}s] ${deltaStr} ☠ ${evt.who} 处决 ${evt.target}! ${evt.damage}伤  距离${distStr}`);
            break;
          case 'dodge':
            console.log(`  [${timeStr}s] ${deltaStr} 💨 ${evt.who} 闪避  距离${distStr}  ${otherSide(evt.who)}:${getState(evt, otherSide(evt.who))}`);
            break;
          case 'perfectDodge':
            console.log(`  [${timeStr}s] ${deltaStr} ✨ ${evt.who} 完美闪避!  距离${distStr}`);
            break;
          case 'blockStart':
            console.log(`  [${timeStr}s] ${deltaStr} 🛡 ${evt.who} 举盾  距离${distStr}  ${otherSide(evt.who)}:${getState(evt, otherSide(evt.who))}`);
            break;
          case 'stateEnd':
            console.log(`  [${timeStr}s] ${deltaStr} ⏱ ${evt.who} ${evt.prevState}结束 持续${(evt.duration*1000).toFixed(0)}ms`);
            break;
          case 'phaseChange':
            console.log(`  [${timeStr}s] ${deltaStr} ⏩ ${evt.who} ${evt.from}→${evt.to} (${evt.from}阶段${(evt.phaseDur*1000).toFixed(0)}ms)`);
            break;
          case 'roundEnd':
            console.log(`  [${timeStr}s] ${deltaStr} ── 结束 ${evt.winner === 'draw' ? '平局' : evt.winner + '胜'} A:${evt.hpA}HP B:${evt.hpB}HP ──`);
            break;
        }
      }

      // AI 决策分析
      if (round.aiDecisionsA.length > 0 || round.aiDecisionsB.length > 0) {
        console.log(`\n  ── AI 决策日志 ──`);
        const allDec = [
          ...round.aiDecisionsA.map(d => ({ ...d, who: 'A' })),
          ...round.aiDecisionsB.map(d => ({ ...d, who: 'B' })),
        ].sort((a, b) => a.time - b.time);
        for (const d of allDec.slice(-40)) {
          const ctx = Object.entries(d).filter(([k]) => !['time','reason','action','who'].includes(k)).map(([k,v]) => `${k}=${typeof v === 'number' ? v.toFixed ? v.toFixed(1) : v : v}`).join(' ');
          console.log(`  [${d.time.toFixed(2).padStart(6)}s] ${d.who} ${d.reason}→${d.action}  ${ctx}`);
        }
      }
    }
  }
  process.exit(0);
}

function otherSide(who) { return who === 'A' ? 'B' : 'A'; }
function getState(evt, who) {
  const s = evt[who];
  if (!s) return '?';
  return `${s.state}${s.phase !== 'none' ? '.' + s.phase : ''}`;
}
function whiffReason(r) {
  switch (r) {
    case 'outOfRange': return '距离太远';
    case 'dodged': return '对手闪避';
    default: return '未命中';
  }
}
function parryName(level) {
  switch (level) {
    case 'precise': return '精准';
    case 'semi': return '半精准';
    default: return '非精准';
  }
}

// ---- JSON 输出 ----
if (JSON_ONLY) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`\n${'='.repeat(60)}`);
  const wAName = getWeapon(WEAPON_A).name;
  const wBName = getWeapon(WEAPON_B).name;
  console.log(`  冷兵器战斗系统 · 无头测试  AI-${DIFF_A}(${wAName}) vs AI-${DIFF_B}(${wBName})`);
  console.log(`  ${ROUNDS} 轮 · 耗时 ${elapsed}s`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  胜率: 蓝方 ${winsA}胜(${(winsA / ROUNDS * 100).toFixed(1)}%)  红方 ${winsB}胜(${(winsB / ROUNDS * 100).toFixed(1)}%)  平局 ${draws}`);
  console.log(`  平均时长: ${avgDur.toFixed(1)}秒`);
  console.log(`  胜方平均残血: 蓝 ${avgHpA.toFixed(0)}HP  红 ${avgHpB.toFixed(0)}HP`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  命中  蓝方: 轻${totalHitsALight} 重${totalHitsAHeavy}  红方: 轻${totalHitsBLight} 重${totalHitsBHeavy}`);
  console.log(`  打空  蓝方: 轻${whiffALight} 重${whiffAHeavy} 反击${whiffAPC}  红方: 轻${whiffBLight} 重${whiffBHeavy} 反击${whiffBPC}`);
  console.log(`  伤害  蓝方: ${totalDmgA}  红方: ${totalDmgB}`);
  console.log(`  格挡  蓝方: ${totalParryA}(精准${preciseA})  红方: ${totalParryB}(精准${preciseB})`);
  console.log(`  拼刀: ${totalClashL}  弹刀: ${totalClashH}`);
  console.log(`  闪避  蓝方: ${totalDodgeA}(完美${totalPDodgeA})  红方: ${totalDodgeB}(完美${totalPDodgeB})`);
  console.log(`  破防  蓝方被破: ${totalBrkA}  红方被破: ${totalBrkB}`);
  console.log(`  处决  蓝方: ${totalExeA}  红方: ${totalExeB}`);
  console.log(`${'─'.repeat(60)}`);
  const ultDodgedA = ultUsedA - ultCompA - ultInterruptA;
  const ultDodgedB = ultUsedB - ultCompB - ultInterruptB;
  console.log(`  绝技  蓝方: ${ultUsedA}次(命中${ultCompA} 闪避${ultDodgedA} 打断${ultInterruptA}) 伤害${ultDmgA}`);
  console.log(`  绝技  红方: ${ultUsedB}次(命中${ultCompB} 闪避${ultDodgedB} 打断${ultInterruptB}) 伤害${ultDmgB}`);
  if (ultUsedA + ultUsedB > 0) {
    const totalUlt = ultUsedA + ultUsedB;
    const totalComp = ultCompA + ultCompB;
    const totalDodged = ultDodgedA + ultDodgedB;
    const totalInt = ultInterruptA + ultInterruptB;
    console.log(`  绝技总计: ${totalUlt}次 命中率${(totalComp/totalUlt*100).toFixed(1)}% 闪避率${(totalDodged/totalUlt*100).toFixed(1)}% 打断率${(totalInt/totalUlt*100).toFixed(1)}%`);
  }
  console.log(`${'='.repeat(60)}`);

  if (DETAIL) {
    console.log(`\n  ── 每轮明细 ──`);
    for (let i = 0; i < allStats.length; i++) {
      const s = allStats[i];
      const w = s.winner === 'A' ? '蓝胜' : s.winner === 'B' ? '红胜' : '平局';
      console.log(`  #${String(i + 1).padStart(3)} ${w} ${s.duration.toFixed(1)}s  蓝${s.hpA.toFixed(0)}HP 红${s.hpB.toFixed(0)}HP  伤:${s.damageA}/${s.damageB}  挡:${s.parryA.precise + s.parryA.semi + s.parryA.nonPrecise}/${s.parryB.precise + s.parryB.semi + s.parryB.nonPrecise}  空:${(s.whiffA.light||0)+(s.whiffA.heavy||0)}/${(s.whiffB.light||0)+(s.whiffB.heavy||0)}`);
    }
  }

  // 简单平衡建议
  console.log(`\n  ── 快速分析 ──`);
  const rateA = winsA / ROUNDS;
  if (DIFF_A === DIFF_B) {
    if (Math.abs(rateA - 0.5) < 0.05) {
      console.log(`  ✓ 同难度对称性良好 (胜率差 < 5%)`);
    } else if (rateA > 0.55) {
      console.log(`  ⚠ 蓝方(先手)优势明显 (${(rateA * 100).toFixed(1)}%), 可能存在先手偏差`);
    } else if (rateA < 0.45) {
      console.log(`  ⚠ 红方优势明显 (${((1 - rateA) * 100).toFixed(1)}%), 可能存在后手偏差`);
    } else {
      console.log(`  ~ 胜率略有倾斜 (${(rateA * 100).toFixed(1)}% vs ${((1 - rateA - draws / ROUNDS) * 100).toFixed(1)}%), 可接受范围`);
    }
  }
  if (draws / ROUNDS > 0.1) {
    console.log(`  ⚠ 平局率 ${(draws / ROUNDS * 100).toFixed(1)}% 偏高，AI可能过于保守或超时较多`);
  }
  const parryRateA = totalParryA / (totalHitsBLight + totalHitsBHeavy + totalParryA || 1);
  const parryRateB = totalParryB / (totalHitsALight + totalHitsAHeavy + totalParryB || 1);
  console.log(`  格挡率: 蓝 ${(parryRateA * 100).toFixed(1)}%  红 ${(parryRateB * 100).toFixed(1)}%`);
  if (totalExeA + totalExeB === 0) {
    console.log(`  ℹ 无处决发生 — 体力管理可能过于宽裕`);
  }
  const heavyRatioA = totalHitsAHeavy / (totalHitsALight + totalHitsAHeavy || 1);
  const heavyRatioB = totalHitsBHeavy / (totalHitsBLight + totalHitsBHeavy || 1);
  console.log(`  重击占比: 蓝 ${(heavyRatioA * 100).toFixed(1)}%  红 ${(heavyRatioB * 100).toFixed(1)}%`);
  // 打空分析
  const whiffRateA = (whiffALight + whiffAHeavy + whiffAPC) / (totalHitsALight + totalHitsAHeavy + whiffALight + whiffAHeavy + whiffAPC || 1);
  const whiffRateB = (whiffBLight + whiffBHeavy + whiffBPC) / (totalHitsBLight + totalHitsBHeavy + whiffBLight + whiffBHeavy + whiffBPC || 1);
  console.log(`  打空率: 蓝 ${(whiffRateA * 100).toFixed(1)}%  红 ${(whiffRateB * 100).toFixed(1)}%`);
  if (whiffAHeavy + whiffBHeavy > (totalHitsAHeavy + totalHitsBHeavy) * 0.5) {
    console.log(`  ⚠ 重击打空率偏高 — AI可能在距离太远时释放重击`);
  }
  console.log();
}
