/**
 * 诊断测试：精确测量格挡后玩家 vs AI 的出手时序
 * 模拟真实游戏循环，逐帧推进，对比不同输入模式下的响应速度
 */
import { Fighter } from './src/combat/fighter.js';
import { CombatSystem } from './src/combat/combat-system.js';
import { Enemy } from './src/ai/enemy.js';
import * as C from './src/core/constants.js';
import { dist } from './src/core/utils.js';

const FPS = 60;
const FRAME_DT = 1 / FPS; // 16.67ms per frame

// Mock particles & camera
const mockParticles = { sparks() {}, blockSpark() {}, blood() {} };
const mockCamera = { shake() {} };

/**
 * 逐帧模拟一次格挡场景，测量从格挡发生到各方首次进入攻击状态的帧数
 */
function testParryTiming(label, {
  playerIsParrier,    // true=玩家格挡AI, false=AI格挡玩家
  humanClickDelay,    // 玩家在hitFreeze结束后多少真实帧点击攻击(0=hitFreeze期间就点了)
  spaceHeld,          // 玩家是否持续按住Space(格挡键)
}) {
  // 创建两个fighter，距离50px
  const playerF = new Fighter(400, 400, { name: '玩家', team: 0 });
  const aiF = new Fighter(450, 400, { name: 'AI-D5', team: 1 });
  const ai = new Enemy(450, 400, 5);
  ai.fighter = aiF;

  const combat = new CombatSystem(mockParticles, mockCamera);

  // 设置初始状态：一方重击active，一方blocking
  const attacker = playerIsParrier ? aiF : playerF;
  const blocker = playerIsParrier ? playerF : aiF;

  attacker.setState('heavyAttack');
  attacker.attackData = {
    startup: C.HEAVY_CHARGE, active: C.HEAVY_ACTIVE,
    recovery: C.HEAVY_RECOVERY, range: C.HEAVY_RANGE,
    arc: C.HEAVY_ARC, damage: C.HEAVY_DAMAGE,
  };
  attacker.phase = 'active';
  attacker.phaseTimer = 0;
  attacker.facing = playerIsParrier ? Math.PI : 0; // face each other

  blocker.setState('blocking', { time: 0 }); // blockStartTime=0
  blocker.facing = playerIsParrier ? 0 : Math.PI;

  // 模拟游戏循环
  let gameTime = 0.001; // slightly after 0 so parry is precise
  let hitFreezeTimer = 0;
  let timeScale = 1;
  let timeScaleTimer = 0;
  let frame = 0;
  let parryFrame = -1;
  let playerFirstAttackFrame = -1;
  let aiFirstAttackFrame = -1;
  let playerFirstAttackGameTime = -1;
  let aiFirstAttackGameTime = -1;
  let parryGameTime = 0;
  let playerBlockedAfterParry = false;
  let playerBlockRecoveryFrames = 0;
  let humanClicked = false;

  // Run up to 300 frames (5 seconds real time)
  for (frame = 0; frame < 300; frame++) {
    let dt = FRAME_DT;
    gameTime += dt;

    // hitFreeze check
    if (hitFreezeTimer > 0) {
      hitFreezeTimer -= dt;
      // 模拟玩家hitFreeze期间的缓冲 (game.js hitFreeze code)
      if (humanClickDelay === 0 && !humanClicked) {
        // 玩家在hitFreeze期间就点了
        playerF.bufferInput('lightAttack');
        humanClicked = true;
      }
      continue; // early return like game.js
    }

    // timeScale
    if (timeScaleTimer > 0) {
      timeScaleTimer -= dt;
      dt *= timeScale;
      if (timeScaleTimer <= 0) timeScale = 1;
    }

    // 构造玩家命令（模拟真实输入）
    const playerCmd = {
      moveX: 0, moveY: 0,
      faceAngle: Math.atan2(aiF.y - playerF.y, aiF.x - playerF.x),
      lightAttack: false,
      heavyAttack: false,
      blockHeld: spaceHeld, // 是否持续按着Space（blockSuppressed在fighter内部处理）
      dodge: false,
      dodgeAngle: 0,
    };

    // 模拟玩家点击攻击
    if (!humanClicked && parryFrame >= 0) {
      const framesSinceParry = frame - parryFrame;
      // humanClickDelay=0 means during hitFreeze (already handled above)
      // humanClickDelay>0 means N frames after hitFreeze ends
      if (humanClickDelay > 0 && framesSinceParry >= humanClickDelay) {
        playerCmd.lightAttack = true;
        humanClicked = true;
      }
    }

    // 更新玩家fighter
    playerF.update(dt, playerCmd, gameTime);

    // AI命令
    const aiCmd = ai.getCommands(dt, playerF);
    aiF.update(dt, aiCmd, gameTime);

    // 碰撞分离
    const dx = aiF.x - playerF.x;
    const dy = aiF.y - playerF.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const minD = playerF.radius + aiF.radius;
    if (d < minD && d > 0.1) {
      const overlap = (minD - d) / 2;
      const nx = dx / d, ny = dy / d;
      playerF.x -= nx * overlap;
      playerF.y -= ny * overlap;
      aiF.x += nx * overlap;
      aiF.y += ny * overlap;
    }

    // 战斗判定
    combat.resolve([playerF, aiF], gameTime, dt);

    // 检测格挡事件
    for (const evt of combat.events) {
      if (evt.type === 'parry' && parryFrame < 0) {
        parryFrame = frame;
        parryGameTime = gameTime;
        // 模拟hitFreeze和timeScale
        const result = C.PARRY_RESULTS[evt.level];
        hitFreezeTimer = result.hitFreeze;
        const ts = C.PARRY_TIME_SCALE[evt.level];
        timeScale = ts.scale;
        timeScaleTimer = ts.duration;
      }
    }

    // 检测首次进入攻击状态
    if (parryFrame >= 0) {
      if (playerFirstAttackFrame < 0 &&
          (playerF.state === 'lightAttack' || playerF.state === 'heavyAttack')) {
        playerFirstAttackFrame = frame;
        playerFirstAttackGameTime = gameTime;
      }
      if (aiFirstAttackFrame < 0 &&
          (aiF.state === 'lightAttack' || aiF.state === 'heavyAttack')) {
        aiFirstAttackFrame = frame;
        aiFirstAttackGameTime = gameTime;
      }
      // 检测玩家是否误入blocking
      if (!playerBlockedAfterParry && playerIsParrier &&
          playerF.state === 'blocking' && frame > parryFrame + 1) {
        playerBlockedAfterParry = true;
      }
      if (playerBlockedAfterParry && playerF.state === 'blockRecovery') {
        playerBlockRecoveryFrames++;
      }
    }

    // 两方都已攻击或超时
    if (playerFirstAttackFrame >= 0 && aiFirstAttackFrame >= 0) break;
  }

  // 报告
  const results = {
    label,
    parryFrame,
    playerIsParrier,
    spaceHeld,
    humanClickDelay,
    playerFirstAttackFrame: playerFirstAttackFrame >= 0 ? playerFirstAttackFrame - parryFrame : 'NEVER',
    aiFirstAttackFrame: aiFirstAttackFrame >= 0 ? aiFirstAttackFrame - parryFrame : 'NEVER',
    playerFirstAttackRealMs: playerFirstAttackFrame >= 0 ? Math.round((playerFirstAttackFrame - parryFrame) * FRAME_DT * 1000) : 'NEVER',
    aiFirstAttackRealMs: aiFirstAttackFrame >= 0 ? Math.round((aiFirstAttackFrame - parryFrame) * FRAME_DT * 1000) : 'NEVER',
    playerFirstAttackGameMs: playerFirstAttackGameTime >= 0 ? Math.round((playerFirstAttackGameTime - parryGameTime) * 1000) : 'NEVER',
    aiFirstAttackGameMs: aiFirstAttackGameTime >= 0 ? Math.round((aiFirstAttackGameTime - parryGameTime) * 1000) : 'NEVER',
    playerBlockedAfterParry,
    playerBlockRecoveryFrames,
  };

  return results;
}

console.log('═══════════════════════════════════════════════════════════');
console.log('  格挡后出手时序诊断测试');
console.log('═══════════════════════════════════════════════════════════\n');

const tests = [
  // === 玩家格挡AI的场景 ===
  {
    label: '玩家精准格挡AI | Space松开 | hitFreeze中点击',
    playerIsParrier: true, humanClickDelay: 0, spaceHeld: false,
  },
  {
    label: '玩家精准格挡AI | Space松开 | freeze后3帧(50ms)点击',
    playerIsParrier: true, humanClickDelay: 15, spaceHeld: false,
  },
  {
    label: '玩家精准格挡AI | Space松开 | freeze后12帧(200ms)点击',
    playerIsParrier: true, humanClickDelay: 25, spaceHeld: false,
  },
  {
    label: '玩家精准格挡AI | Space持续按住 | hitFreeze中点击',
    playerIsParrier: true, humanClickDelay: 0, spaceHeld: true,
  },
  {
    label: '玩家精准格挡AI | Space持续按住 | freeze后3帧(50ms)点击',
    playerIsParrier: true, humanClickDelay: 15, spaceHeld: true,
  },
  {
    label: '玩家精准格挡AI | Space持续按住 | 不点击(只按Space)',
    playerIsParrier: true, humanClickDelay: 9999, spaceHeld: true,
  },

  // === AI格挡玩家的场景 ===
  {
    label: 'AI精准格挡玩家 | 玩家被弹后立即点击',
    playerIsParrier: false, humanClickDelay: 0, spaceHeld: false,
  },
  {
    label: 'AI精准格挡玩家 | 玩家被弹后200ms点击',
    playerIsParrier: false, humanClickDelay: 25, spaceHeld: false,
  },
];

for (const t of tests) {
  const r = testParryTiming(t.label, t);
  console.log(`【${r.label}】`);
  console.log(`  格挡方: ${r.playerIsParrier ? '玩家' : 'AI'}`);
  console.log(`  玩家首次攻击: 格挡后 ${r.playerFirstAttackFrame} 帧 (${r.playerFirstAttackRealMs}ms真实 / ${r.playerFirstAttackGameMs}ms游戏)`);
  console.log(`  AI首次攻击:   格挡后 ${r.aiFirstAttackFrame} 帧 (${r.aiFirstAttackRealMs}ms真实 / ${r.aiFirstAttackGameMs}ms游戏)`);
  if (r.playerBlockedAfterParry) {
    console.log(`  ⚠️ 玩家格挡后误入blocking! (blockRecovery持续 ${r.playerBlockRecoveryFrames} 帧)`);
  }
  const diff = typeof r.playerFirstAttackRealMs === 'number' && typeof r.aiFirstAttackRealMs === 'number'
    ? r.playerFirstAttackRealMs - r.aiFirstAttackRealMs : '?';
  console.log(`  差值: 玩家比AI慢 ${diff}ms (正数=玩家慢, 负数=玩家快)`);
  console.log();
}
