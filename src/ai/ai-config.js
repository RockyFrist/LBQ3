// ===================== AI 难度配置 =====================
// 从 enemy.js 提取的独立模块，集中管理各难度等级参数

/**
 * 根据难度等级返回 AI 配置参数
 * @param {number} d - 难度等级 1-5(对战) 6-7(训练)
 */
export function buildAIConfig(d) {
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
    // 核心差异：D5反应极快+惩罚极准，D1-D3靠攻击频率弥补但失误多
    reactChance:     [0.35, 0.50, 0.62, 0.82, 0.97][d - 1],
    dodgeChance:     [0.08, 0.14, 0.20, 0.30, 0.38][d - 1],
    thinkCD:         [0.35, 0.22, 0.16, 0.06, 0.02][d - 1],
    attackRate:      [0.35, 0.42, 0.50, 0.60, 0.68][d - 1],
    heavyRate:       [0.12, 0.20, 0.26, 0.35, 0.42][d - 1],
    maxCombo:        [1,    2,    3,    3,    3   ][d - 1],
    blockDurBase:    [0.25, 0.38, 0.50, 0.65, 0.85][d - 1],
    retreatWhenLow:  [0.02, 0.04, 0.07, 0.10, 0.14][d - 1],
    approachDist:    [80,   68,   58,   48,   42  ][d - 1],
    heavyReactMult:  [0.30, 0.50, 0.65, 0.90, 0.99][d - 1],
    heavyReactDist:  [70,   95,   115,  155,  175 ][d - 1],
    punishRate:      [0.10, 0.25, 0.35, 0.72, 0.95][d - 1],
    feintChance:     [0.03, 0.08, 0.18, 0.45, 0.65][d - 1],
  };
}
