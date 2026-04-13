// ===================== 武器定义 =====================
// 每把武器包含完整的参数覆写，Fighter 构造时合并
// 所有数值设计见 weapon-system.md

import * as C from '../core/constants.js';

// ---- 刀 (Dao) — 均衡型 ----
export const WEAPON_DAO = {
  id: 'dao',
  name: '刀',
  icon: '🗡️',
  color: '#4488ff',
  accentColor: '#88bbff',

  speedMult: 1.0,

  lightAttacks: [
    { startup: 0.15, active: 0.14, recovery: 0.36, range: 55, arc: Math.PI * 0.32, damage: 8,  name: '前刺' },
    { startup: 0.15, active: 0.14, recovery: 0.36, range: 58, arc: Math.PI * 0.40, damage: 9,  name: '斜砍' },
    { startup: 0.22, active: 0.18, recovery: 0.70, range: 62, arc: Math.PI * 0.50, damage: 13, name: '横扫' },
  ],
  comboWindow: 0.45,
  lightLunge: 12,
  lightDrift: 80,

  heavy: {
    startup: 0.70, active: 0.18, recovery: 0.65,
    range: 78, arc: Math.PI * 0.40, damage: 28,
    lunge: 18, drift: 35, knockback: 80,
    hyperArmor: true,
    hitStagger: C.HIT_STAGGER,
    staminaDrain: 0,
    special: null,
  },

  preciseParryWindow: 0.12,
  semiParryWindow: 0.55,
  blockRecovery: 0.55,
  counterDamage: 15,
  counterRange: 65,
  counterArc: Math.PI * 0.35,
  counterLunge: 30,
  counterDrift: 120,
  breakHits: 3,
  blockStaminaCost: -1,        // -1 = 使用标准 PARRY_RESULTS
  parryReflectPct: 0,
  autoCounter: false,

  dodgeSpeed: 370,
  dodgeInvuln: 0.18,
  perfectDodgeStaminaBonus: 1,

  canMoveWhileBlocking: false,
  blockMoveSpeedMult: 0,
  vsBlockExtraStaminaDrain: 0,

  ultimate: {
    type: 'multislash',
    startup: 0.28,
    active: 0.60,
    recovery: 0.35,
    range: 90,
    arc: Math.PI * 2 / 3,
    hitDamage: 7,
    hitCount: 4,
    knockback: 60,
    drift: 120,
    blockReduction: 0.50,
    name: '拔刀',
  },

  specials: [],

  aiHints: {
    preferredRange: [45, 70],
    aggressiveness: 0.50,
    dodgeBias: 0.50,
    blockBias: 0.50,
    heavyBias: 0.50,
  },
};

// ---- 匕首 (Daggers) — 速度/闪避型 ----
export const WEAPON_DAGGERS = {
  id: 'daggers',
  name: '匕首',
  icon: '🗡🗡',
  color: '#cc66ff',
  accentColor: '#dd99ff',

  speedMult: 1.20,

  lightAttacks: [
    { startup: 0.08, active: 0.10, recovery: 0.22, range: 42, arc: Math.PI * 0.24, damage: 7, name: '左刺' },
    { startup: 0.08, active: 0.10, recovery: 0.22, range: 44, arc: Math.PI * 0.24, damage: 7, name: '右刺' },
    { startup: 0.10, active: 0.10, recovery: 0.22, range: 46, arc: Math.PI * 0.27, damage: 8, name: '双刺' },
    { startup: 0.10, active: 0.12, recovery: 0.25, range: 46, arc: Math.PI * 0.27, damage: 9, name: '旋刺' },
    { startup: 0.12, active: 0.14, recovery: 0.50, range: 50, arc: Math.PI * 0.32, damage: 12, name: '交叉斩' },
  ],
  comboWindow: 0.35,
  lightLunge: 14,
  lightDrift: 100,

  heavy: {
    startup: 0.35, active: 0.14, recovery: 0.45,
    range: 58, arc: Math.PI * 0.30, damage: 25,
    lunge: 40, drift: 40, knockback: 40,
    hyperArmor: false,
    hitStagger: C.HIT_STAGGER,
    staminaDrain: 0,
    special: 'dash',
  },

  preciseParryWindow: 0,         // 无精准弹反
  semiParryWindow: 0.55,
  blockRecovery: 0.55,
  counterDamage: 12,
  counterRange: 50,
  counterArc: Math.PI * 0.30,
  counterLunge: 20,
  counterDrift: 100,
  breakHits: 2,                  // 更容易被破防
  blockStaminaCost: 2,           // 格挡消耗2体力
  parryReflectPct: 0,
  autoCounter: false,

  dodgeSpeed: 420,
  dodgeInvuln: 0.24,
  perfectDodgeStaminaBonus: 2,   // 完美闪避净回复2体力

  canMoveWhileBlocking: false,
  blockMoveSpeedMult: 0,
  vsBlockExtraStaminaDrain: 0,

  ultimate: {
    type: 'shadowkill',
    startup: 0.22,
    dashDist: 110,
    dashDuration: 0.15,
    active: 0.70,
    recovery: 0.35,
    missRecovery: 0.55,
    range: 55,
    arc: Math.PI,
    hitDamage: 6,
    hitCount: 6,
    knockback: 40,
    drift: 60,
    blockReduction: 1.0,         // 不减伤
    backstabMult: 1.3,
    name: '影杀',
  },

  specials: ['shadowStep', 'backstab'],

  // 影步参数
  shadowStepFacingLock: 0.30,    // 目标朝向锁定时间

  // 背刺参数
  backstabAngle: Math.PI / 3,    // 背后60°内算背刺
  backstabMult: 1.3,

  // 霸体穿透：轻攻可对霸体目标造成40%伤害（匕首灵巧精准，见缝插针）
  hyperArmorPierce: 0.80,

  aiHints: {
    preferredRange: [30, 50],
    aggressiveness: 0.70,
    dodgeBias: 0.70,
    blockBias: 0.15,
    heavyBias: 0.30,
  },
};

// ---- 大锤 (War Hammer) — 力量/霸体型 ----
export const WEAPON_HAMMER = {
  id: 'hammer',
  name: '大锤',
  icon: '🔨',
  color: '#ff8844',
  accentColor: '#ffbb66',

  speedMult: 0.85,

  lightAttacks: [
    { startup: 0.20, active: 0.16, recovery: 0.42, range: 62, arc: Math.PI * 0.33, damage: 14, name: '横扫',
      hyperArmor: true },
    { startup: 0.22, active: 0.18, recovery: 0.45, range: 66, arc: Math.PI * 0.38, damage: 16, name: '上挑',
      hyperArmor: true },
    { startup: 0.30, active: 0.20, recovery: 0.85, range: 72, arc: Math.PI * 0.50, damage: 18, name: '砸地',
      hyperArmor: true, hitStagger: 0.48 },
  ],
  comboWindow: 0.50,
  lightLunge: 12,
  lightDrift: 55,

  heavy: {
    startup: 1.05, active: 0.20, recovery: 0.85,
    range: 78, arc: Math.PI * 2, damage: 32,    // 360° AoE
    lunge: 70, drift: 0, knockback: 85,
    hyperArmor: true,
    hitStagger: 0.50,
    staminaDrain: 0,
    special: 'aoe360',
  },

  preciseParryWindow: 0,         // 无精准弹反
  semiParryWindow: 0.55,
  blockRecovery: 0.70,           // 格挡后摇更长
  counterDamage: 18,
  counterRange: 70,
  counterArc: Math.PI * 0.40,
  counterLunge: 25,
  counterDrift: 80,
  breakHits: 3,
  blockStaminaCost: -1,
  parryReflectPct: 0,
  autoCounter: false,

  dodgeSpeed: 300,
  dodgeInvuln: 0.15,
  perfectDodgeStaminaBonus: 1,

  canMoveWhileBlocking: false,
  blockMoveSpeedMult: 0,
  vsBlockExtraStaminaDrain: 1,   // 命中格挡额外消耗1体力

  ultimate: {
    type: 'groundslam',
    startup: 0.42,
    jumpDuration: 0.40,
    active: 0.10,
    recovery: 0.55,
    range: 95,
    arc: Math.PI * 2,            // 360° AoE
    hitDamage: 35,
    hitCount: 1,
    knockback: 80,
    drift: 0,
    blockReduction: 0.50,
    hitStagger: 0.60,
    breaksGuard: true,           // 直接破防
    name: '开山',
  },

  specials: ['quakeShield'],

  aiHints: {
    preferredRange: [50, 72],
    aggressiveness: 0.60,
    dodgeBias: 0.25,
    blockBias: 0.40,
    heavyBias: 0.50,
  },
};

// ---- 长枪 (Spear) — 距离/控制型 ----
export const WEAPON_SPEAR = {
  id: 'spear',
  name: '长枪',
  icon: '🔱',
  color: '#44ccbb',
  accentColor: '#88eedd',

  speedMult: 1.0,

  lightAttacks: [
    { startup: 0.13, active: 0.12, recovery: 0.32, range: 75, arc: Math.PI * 0.20, damage: 8, name: '前刺' },
    { startup: 0.13, active: 0.12, recovery: 0.32, range: 80, arc: Math.PI * 0.23, damage: 8, name: '横扫' },
    { startup: 0.18, active: 0.16, recovery: 0.60, range: 88, arc: Math.PI * 0.30, damage: 14, name: '突刺' },
  ],
  comboWindow: 0.45,
  lightLunge: 10,
  lightDrift: 70,

  heavy: {
    startup: 0.65, active: 0.14, recovery: 0.60,
    range: 110, arc: Math.PI * 0.11, damage: 25,
    lunge: 30, drift: 50, knockback: 60,
    hyperArmor: true,
    hitStagger: 0.45,
    staminaDrain: 0,
    special: null,
  },

  preciseParryWindow: 0.12,
  semiParryWindow: 0.55,
  blockRecovery: 0.55,
  counterDamage: 18,
  counterRange: 80,
  counterArc: Math.PI * 0.25,
  counterLunge: 20,
  counterDrift: 100,
  breakHits: 3,
  blockStaminaCost: -1,
  parryReflectPct: 0,
  autoCounter: true,             // 精准弹反自动反刺

  dodgeSpeed: 370,
  dodgeInvuln: 0.18,
  perfectDodgeStaminaBonus: 1,

  canMoveWhileBlocking: false,
  blockMoveSpeedMult: 0,
  vsBlockExtraStaminaDrain: 0,

  ultimate: {
    type: 'whirlwind',
    startup: 0.25,
    active: 0.80,
    recovery: 0.45,
    range: 95,
    arc: Math.PI * 2,            // 360°
    hitDamage: 6,
    hitCount: 4,
    knockback: 50,               // 每段击退
    drift: 0,
    blockReduction: 0.50,
    name: '龙舞',
  },

  specials: ['retreatStab', 'rangeBonus'],

  // 后撤刺参数
  retreatStabDamage: 6,
  retreatStabRange: 70,
  retreatStabArc: Math.PI * 0.19,

  // 距离加成参数
  rangeBonusSweetSpot: [65, 110],
  rangeBonusMult: 1.15,
  rangeBonusClosePenalty: 0.75,
  rangeBonusCloseThreshold: 40,

  aiHints: {
    preferredRange: [65, 85],
    aggressiveness: 0.45,
    dodgeBias: 0.50,
    blockBias: 0.45,
    heavyBias: 0.55,
  },
};

// ---- 剑盾 (Sword & Shield) — 防御/反击型 ----
export const WEAPON_SHIELD = {
  id: 'shield',
  name: '剑盾',
  icon: '🛡️',
  color: '#ffcc44',
  accentColor: '#ffee88',

  speedMult: 0.95,

  lightAttacks: [
    { startup: 0.15, active: 0.14, recovery: 0.35, range: 52, arc: Math.PI * 0.30, damage: 8, name: '横斜' },
    { startup: 0.15, active: 0.14, recovery: 0.35, range: 56, arc: Math.PI * 0.32, damage: 8, name: '刺击' },
    { startup: 0.20, active: 0.16, recovery: 0.55, range: 60, arc: Math.PI * 0.36, damage: 12, name: '上斜' },
  ],
  comboWindow: 0.45,
  lightLunge: 12,
  lightDrift: 80,

  heavy: {
    startup: 0.50, active: 0.16, recovery: 0.50,
    range: 60, arc: Math.PI * 0.60, damage: 15,
    lunge: 30, drift: 10, knockback: 55,
    hyperArmor: true,
    hitStagger: 0.55,
    staminaDrain: 2,            // 盾击消耗对方2体力
    special: 'shieldBash',
  },

  preciseParryWindow: 0.13,     // 精准弹反窗口
  semiParryWindow: 0.55,
  blockRecovery: 0.45,          // 更快恢复
  counterDamage: 14,
  counterRange: 65,
  counterArc: Math.PI * 0.35,
  counterLunge: 30,
  counterDrift: 120,
  breakHits: 4,                  // 更难破防
  blockStaminaCost: 0,           // 格挡不消耗体力
  parryReflectPct: 0.30,        // 精准弹反反弹30%伤害
  autoCounter: false,

  dodgeSpeed: 370,
  dodgeInvuln: 0.18,
  perfectDodgeStaminaBonus: 1,

  canMoveWhileBlocking: true,    // 盾行
  blockMoveSpeedMult: 0.40,
  vsBlockExtraStaminaDrain: 0,

  ultimate: {
    type: 'absolutedefense',
    startup: 0.20,
    stanceDuration: 1.20,
    active: 0.10,               // 反击active时间
    recovery: 0.30,
    range: 70,
    arc: Math.PI * 2 / 3,       // 前方120°
    hitDamage: 35,
    hitCount: 1,
    knockback: 70,
    drift: 0,
    blockReduction: 0.30,
    counterDamage: 35,
    counterRange: 70,
    counterStagger: 0.50,
    qiRefundOnMiss: 0.60,        // 无人攻击返还60%炁
    name: '绝对防御',
  },

  specials: ['shieldWalk', 'parryReflect'],

  aiHints: {
    preferredRange: [40, 58],
    aggressiveness: 0.50,
    dodgeBias: 0.25,
    blockBias: 0.50,
    heavyBias: 0.25,
  },
};

// ---- 武器注册表 ----
export const WEAPONS = {
  dao: WEAPON_DAO,
  daggers: WEAPON_DAGGERS,
  hammer: WEAPON_HAMMER,
  spear: WEAPON_SPEAR,
  shield: WEAPON_SHIELD,
};

export const WEAPON_LIST = [WEAPON_DAO, WEAPON_DAGGERS, WEAPON_HAMMER, WEAPON_SPEAR, WEAPON_SHIELD];

export function getWeapon(id) {
  return WEAPONS[id] || WEAPON_DAO;
}

export function randomWeapon() {
  const ids = Object.keys(WEAPONS);
  return ids[Math.floor(Math.random() * ids.length)];
}
