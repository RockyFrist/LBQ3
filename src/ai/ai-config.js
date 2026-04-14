// ===================== AI 难度配置 =====================
// 从 enemy.js 提取的独立模块，集中管理各难度等级参数

/**
 * 根据难度等级返回 AI 配置参数
 * @param {number} d - 难度等级 1-5(对战) 6-7(训练) 99(神级)
 */
export function buildAIConfig(d) {
  // 神级难度99: 全面碾压 — D5的每项参数都更优，攻防兼备
  if (d === 99) return {
    reactChance: 0.98,
    dodgeChance: 0.12,
    thinkCD: 0.01,
    attackRate: 0.38,
    heavyRate: 0.62,
    maxCombo: 6,
    blockDurBase: 0.62,
    retreatWhenLow: 0.10,
    approachDist: 40,
    heavyReactMult: 0.99,
    heavyReactDist: 190,
    punishRate: 0.99,
    feintChance: 0.10,
    blockChance: 0.18,
    perfectDodgeChance: 0.98,
    heavyReactDelay: 0.005,
    heavyCooldown: 0,
    blockCooldownBase: 0.8,
    // 神级AI额外能力
    patternReadSpeed: 2.5,     // 读取玩家模式速度翻倍
    counterAdaptRate: 0.95,    // 针对性变招概率
  };

  // 训练模式6: 拼刀训练 — 只用轻击，有节奏地对攻（不再无脑spam）
  if (d === 6) return {
    reactChance: 0.05, dodgeChance: 0, thinkCD: 0.15,
    attackRate: 0.85, heavyRate: 0, maxCombo: 1,
    blockDurBase: 0, retreatWhenLow: 0, approachDist: 50,
    heavyReactMult: 0, heavyReactDist: 0, punishRate: 0, feintChance: 0,
  };
  // 训练模式7: 格挡反击训练 — 用重击和防御，积极格挡
  if (d === 7) return {
    reactChance: 0.90, dodgeChance: 0.10, thinkCD: 0.06,
    attackRate: 0.30, heavyRate: 0.55, maxCombo: 1,
    blockDurBase: 0.80, retreatWhenLow: 0.01, approachDist: 55,
    heavyReactMult: 0.85, heavyReactDist: 140, punishRate: 0.65, feintChance: 0.12,
  };

  return {
    // D1=新手 D2=普通 D3=熟练 D4=困难 D5=大师
    // D1几乎不防，反应极慢；D2偶尔格挡但破绽多
    // D5防御与D4持平，通过攻击速度/惩罚/效率拉开差距
    reactChance:     [0.15, 0.30, 0.62, 0.82, 0.82][d - 1],
    dodgeChance:     [0.03, 0.05, 0.08, 0.12, 0.14][d - 1],
    thinkCD:         [0.50, 0.32, 0.16, 0.08, 0.03][d - 1],
    attackRate:      [0.20, 0.30, 0.45, 0.60, 0.40][d - 1],
    heavyRate:       [0.05, 0.12, 0.26, 0.36, 0.60][d - 1],
    maxCombo:        [1,    1,    3,    4,    5   ][d - 1],
    blockDurBase:    [0.15, 0.25, 0.50, 0.65, 0.55][d - 1],
    retreatWhenLow:  [0.01, 0.02, 0.07, 0.10, 0.14][d - 1],
    approachDist:    [90,   78,   58,   48,   42  ][d - 1],
    heavyReactMult:  [0.10, 0.30, 0.65, 0.90, 0.90][d - 1],
    heavyReactDist:  [50,   70,   115,  155,  155 ][d - 1],
    punishRate:      [0.03, 0.10, 0.30, 0.65, 0.95][d - 1],
    feintChance:     [0.01, 0.02, 0.06, 0.08, 0.08][d - 1],
    blockChance:     [0.01, 0.03, 0.10, 0.15, 0.15][d - 1],
    perfectDodgeChance: [0.05, 0.15, 0.35, 0.55, 0.75][d - 1],
    heavyReactDelay: [0.20, 0.12, 0.06, 0.03, 0.03][d - 1],
    heavyCooldown:   [4.0,  2.5,  1.2,  0.5,  0  ][d - 1],
    blockCooldownBase: [6.0,  5.0,  4.0,  3.0,  3.0][d - 1],
  };
}
