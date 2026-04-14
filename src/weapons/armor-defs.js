// ===================== 护甲定义 =====================
// 不同护甲对战斗各维度的影响
// 默认不穿护甲 (none)，护甲在选武器时可选

import * as C from '../core/constants.js';

// ---- 无护甲 (默认) ----
export const ARMOR_NONE = {
  id: 'none',
  name: '无甲',
  icon: '👤',
  color: null,            // 使用角色默认颜色
  desc: '轻装上阵，灵活自如',

  // 属性修正
  hpBonus: 0,              // HP加成（绝对值）
  speedMult: 1.0,          // 移动速度倍率
  dodgeSpeedMult: 1.0,     // 闪避速度倍率
  dodgeDistMult: 1.0,      // 闪避距离倍率（影响 dodgeDuration）
  damageReduction: 0,      // 固定伤害减免（每次受击）
  damageReductionPct: 0,   // 百分比伤害减免（0~1）
  staggerResist: 0,        // 硬直缩减（秒）
  blockCostReduction: 0,   // 格挡体力消耗减免
  heavyDamageResist: 0,    // 重击额外减伤百分比
  lightDamageResist: 0,    // 轻击额外减伤百分比
  executionResist: false,  // 是否抗处决（被耗尽体力时仍能闪避）

  // 视觉参数
  renderLayer: 'none',     // 渲染类型
  thickness: 0,            // 护甲厚度（渲染用）
  armorColor: null,        // 护甲颜色
};

// ---- 轻甲 (Light Armor) — 布甲 ----
export const ARMOR_LIGHT = {
  id: 'light',
  name: '布甲',
  icon: '🧥',
  color: '#8B7355',
  desc: '轻便灵活，微量防护',

  hpBonus: 5,
  speedMult: 0.97,
  dodgeSpeedMult: 1.0,
  dodgeDistMult: 1.0,
  damageReduction: 1,
  damageReductionPct: 0.05,
  staggerResist: 0,
  blockCostReduction: 0,
  heavyDamageResist: 0,
  lightDamageResist: 0.05,
  executionResist: false,

  renderLayer: 'light',
  thickness: 2,
  armorColor: '#8B7355',
};

// ---- 中甲 (Medium Armor) — 皮甲 ----
export const ARMOR_MEDIUM = {
  id: 'medium',
  name: '皮甲',
  icon: '🦺',
  color: '#A0522D',
  desc: '均衡防护，略降灵活',

  hpBonus: 10,
  speedMult: 0.92,
  dodgeSpeedMult: 0.95,
  dodgeDistMult: 0.95,
  damageReduction: 2,
  damageReductionPct: 0.10,
  staggerResist: 0.03,
  blockCostReduction: 0,
  heavyDamageResist: 0.05,
  lightDamageResist: 0.08,
  executionResist: false,

  renderLayer: 'medium',
  thickness: 3,
  armorColor: '#8B4513',
};

// ---- 重甲 (Heavy Armor) — 铁甲 ----
export const ARMOR_HEAVY = {
  id: 'heavy',
  name: '铁甲',
  icon: '🛡️',
  color: '#708090',
  desc: '坚固防护，大幅降低灵活',

  hpBonus: 20,
  speedMult: 0.82,
  dodgeSpeedMult: 0.80,
  dodgeDistMult: 0.85,
  damageReduction: 3,
  damageReductionPct: 0.18,
  staggerResist: 0.06,
  blockCostReduction: 1,
  heavyDamageResist: 0.12,
  lightDamageResist: 0.15,
  executionResist: false,

  renderLayer: 'heavy',
  thickness: 4,
  armorColor: '#5F6B7A',
};

// ---- 板甲 (Plate Armor) — 最重 ----
export const ARMOR_PLATE = {
  id: 'plate',
  name: '板甲',
  icon: '⚔️',
  color: '#4A5568',
  desc: '极致防护，严重影响灵活',

  hpBonus: 30,
  speedMult: 0.72,
  dodgeSpeedMult: 0.70,
  dodgeDistMult: 0.75,
  damageReduction: 5,
  damageReductionPct: 0.25,
  staggerResist: 0.10,
  blockCostReduction: 1,
  heavyDamageResist: 0.18,
  lightDamageResist: 0.20,
  executionResist: true,

  renderLayer: 'plate',
  thickness: 5,
  armorColor: '#3D4A5C',
};

// ---- 护甲注册表 ----
export const ARMORS = {
  none: ARMOR_NONE,
  light: ARMOR_LIGHT,
  medium: ARMOR_MEDIUM,
  heavy: ARMOR_HEAVY,
  plate: ARMOR_PLATE,
};

export const ARMOR_LIST = [ARMOR_NONE, ARMOR_LIGHT, ARMOR_MEDIUM, ARMOR_HEAVY, ARMOR_PLATE];

export function getArmor(id) {
  return ARMORS[id] || ARMOR_NONE;
}

/**
 * 计算护甲对伤害的减免
 * @param {object} armor 护甲定义对象
 * @param {number} rawDamage 原始伤害
 * @param {'light'|'heavy'|'counter'|'ultimate'} atkType 攻击类型
 * @returns {number} 减免后伤害（最低1）
 */
export function applyArmorReduction(armor, rawDamage, atkType) {
  if (!armor || armor.id === 'none') return rawDamage;
  let dmg = rawDamage;
  // 固定减免
  dmg -= armor.damageReduction;
  // 百分比减免
  dmg *= (1 - armor.damageReductionPct);
  // 类型特化减免
  if (atkType === 'heavy' || atkType === 'ultimate') {
    dmg *= (1 - armor.heavyDamageResist);
  } else if (atkType === 'light' || atkType === 'counter') {
    dmg *= (1 - armor.lightDamageResist);
  }
  return Math.max(1, Math.round(dmg));
}
