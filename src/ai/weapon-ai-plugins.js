// ===================== 武器AI决策插件 =====================
// 方案B：每种武器定义可选的 aiPlugin 对象，在关键决策点覆写默认行为
// enemy.js 在关键决策点先检查 weapon.aiPlugin.xxx，有则调用，无则走默认逻辑
// 返回 true 表示已处理（跳过默认逻辑），false 表示未处理

import * as C from '../core/constants.js';
import { dist, angleBetween } from '../core/utils.js';

// ===================== 匕首 AI — 闪避绕背，快速压制 =====================
export const DAGGERS_AI = {
  /**
   * 被格挡后决策：匕首轻巧，侧闪重新定位寻找背刺机会
   * @returns {boolean} true=已处理
   */
  postParried(enemy, f, pf, d, ang, cmd, cfg) {
    const roll = Math.random();
    if (roll < 0.55 && f.stamina >= C.DODGE_COST) {
      // 侧闪绕背（匕首核心战术）
      const behindAngle = ang + (Math.random() < 0.5 ? Math.PI * 0.7 : -Math.PI * 0.7);
      cmd.dodge = true;
      cmd.dodgeAngle = behindAngle;
      enemy.aiState = 'punish';
      enemy.aiTimer = 0.15;
      return true;
    } else if (roll < 0.80) {
      // 快速轻击连打（匕首速度优势）
      cmd.lightAttack = true;
      enemy.comboTarget = Math.min(3, cfg.maxCombo);
      enemy.comboCount = 1;
      enemy.aiState = 'recover';
      enemy.aiTimer = 0.4;
      return true;
    }
    // 20% 走默认逻辑
    return false;
  },

  /**
   * 成功格挡后决策：匕首利用速度优势快速反击
   */
  postParry(enemy, f, pf, d, ang, cmd, cfg) {
    const roll = Math.random();
    if (roll < 0.60) {
      // 快速连击（利用parryBoost加速）
      cmd.lightAttack = true;
      enemy.comboTarget = Math.min(3, cfg.maxCombo);
      enemy.comboCount = 1;
      enemy.aiState = 'recover';
      enemy.aiTimer = 0.5;
      return true;
    } else if (roll < 0.85 && f.stamina >= C.DODGE_COST) {
      // 闪避绕背再攻击
      const behindAngle = ang + (Math.random() < 0.5 ? Math.PI * 0.6 : -Math.PI * 0.6);
      cmd.dodge = true;
      cmd.dodgeAngle = behindAngle;
      enemy.aiState = 'punish';
      enemy.aiTimer = 0.15;
      return true;
    }
    return false;
  },

  /**
   * 接近行为：匕首绕侧走位，寻找背刺角度
   */
  approachOverride(enemy, f, pf, d, ang, cmd, cfg) {
    if (d > cfg.approachDist + 20) return false; // 远距离正常接近
    // 近距离绕侧（匕首独有的弧形切入）
    const fwdX = Math.cos(ang);
    const fwdY = Math.sin(ang);
    const perpX = -fwdY * enemy._strafeDir;
    const perpY = fwdX * enemy._strafeDir;
    // 匕首更激进的侧向比例
    cmd.moveX = fwdX * 0.4 + perpX * 0.8;
    cmd.moveY = fwdY * 0.4 + perpY * 0.8;
    return true;
  },

  /**
   * 硬直中反应：匕首永远优先闪避，不做霸体交换
   */
  staggerReact(enemy, f, pf, d, ang, cmd, cfg) {
    if (f.stamina >= C.DODGE_COST && Math.random() < cfg.dodgeChance * 2.0) {
      const behindAngle = ang + (Math.random() < 0.5 ? Math.PI * 0.7 : -Math.PI * 0.7);
      cmd.dodge = true;
      cmd.dodgeAngle = behindAngle;
      enemy.aiState = 'recover';
      enemy.aiTimer = 0.4;
      return true;
    }
    return false;
  },
};

// ===================== 大锤 AI — 霸体推进，读招重击 =====================
export const HAMMER_AI = {
  /**
   * 被格挡后决策：大锤依靠霸体硬抗，不轻易退让
   */
  postParried(enemy, f, pf, d, ang, cmd, cfg) {
    const roll = Math.random();
    if (roll < 0.50 && enemy._heavyCD <= 0) {
      // 霸体重击交换（大锤的核心策略：挨打不怕，重击回敬）
      cmd.heavyAttack = true;
      enemy.aiState = 'recover';
      enemy.aiTimer = 1.5;
      enemy._heavyCD = cfg.heavyCooldown || 0;
      return true;
    } else if (roll < 0.70) {
      // 轻击压制（大锤轻击也有霸体）
      cmd.lightAttack = true;
      enemy.comboTarget = Math.min(2, cfg.maxCombo);
      enemy.comboCount = 1;
      enemy.aiState = 'recover';
      enemy.aiTimer = 0.7;
      return true;
    } else if (roll < 0.85) {
      // 站立不退（等对手先动手，霸体吸收后反打）
      enemy.aiState = 'approach';
      enemy.aiTimer = 0.3;
      return true;
    }
    return false;
  },

  /**
   * 成功格挡后决策：大锤利用格挡加速蓄力重击
   */
  postParry(enemy, f, pf, d, ang, cmd, cfg) {
    const roll = Math.random();
    if (roll < 0.55 && enemy._heavyCD <= 0) {
      // 加速重击（parryBoost缩短蓄力，大锤最大化重击价值）
      cmd.heavyAttack = true;
      enemy.aiState = 'recover';
      enemy.aiTimer = 1.5;
      enemy._heavyCD = cfg.heavyCooldown || 0;
      return true;
    } else if (roll < 0.80) {
      // 轻击连压（霸体连招）
      cmd.lightAttack = true;
      enemy.comboTarget = Math.min(2, cfg.maxCombo);
      enemy.comboCount = 1;
      enemy.aiState = 'recover';
      enemy.aiTimer = 0.7;
      return true;
    }
    return false;
  },

  /**
   * 接近行为：大锤不绕弯，直线推进给压迫感
   */
  approachOverride(enemy, f, pf, d, ang, cmd, cfg) {
    if (d > cfg.approachDist + 50) return false;
    // 霸气直线推进（偶尔小幅横移避免被穿裆）
    const fwdX = Math.cos(ang);
    const fwdY = Math.sin(ang);
    const perpX = -fwdY * enemy._strafeDir;
    const perpY = fwdX * enemy._strafeDir;
    cmd.moveX = fwdX * 0.9 + perpX * 0.15;
    cmd.moveY = fwdY * 0.9 + perpY * 0.15;
    return true;
  },

  /**
   * 硬直中反应：大锤优先霸体重击交换，不轻易闪避
   */
  staggerReact(enemy, f, pf, d, ang, cmd, cfg) {
    const diffScale = (enemy.difficulty - 1) / 4;
    if (enemy._heavyCD <= 0 && Math.random() < 0.4 + diffScale * 0.3) {
      // 霸体重击硬交换
      cmd.heavyAttack = true;
      enemy.aiState = 'recover';
      enemy.aiTimer = 1.5;
      enemy._heavyCD = cfg.heavyCooldown || 0;
      return true;
    }
    // 大锤不擅长闪避，走默认逻辑（可能挨打）
    return false;
  },
};

// ===================== 长枪 AI — 风筝距离控制，拉打 =====================
export const SPEAR_AI = {
  /**
   * 被格挡后决策：长枪拉开距离重新建立优势
   */
  postParried(enemy, f, pf, d, ang, cmd, cfg) {
    const roll = Math.random();
    if (roll < 0.35) {
      // 后退拉开距离（长枪核心：保持射程优势）
      enemy.aiState = 'retreat';
      enemy.aiTimer = 0.15 + Math.random() * 0.20;
      return true;
    } else if (roll < 0.55 && f.stamina >= C.DODGE_COST) {
      // 后跳拉距（闪避向后）
      cmd.dodge = true;
      cmd.dodgeAngle = ang + Math.PI + (Math.random() - 0.5) * 0.5;
      enemy.aiState = 'recover';
      enemy.aiTimer = 0.4;
      return true;
    }
    return false;
  },

  /**
   * 成功格挡后决策：长枪在安全距离轻击戳刺
   */
  postParry(enemy, f, pf, d, ang, cmd, cfg) {
    const roll = Math.random();
    if (roll < 0.60) {
      // 快速前刺利用加速（长枪射程长，不需要贴近）
      cmd.lightAttack = true;
      enemy.comboTarget = 1; // 单次戳刺后拉开
      enemy.comboCount = 1;
      enemy.aiState = 'recover';
      enemy.aiTimer = 0.5;
      return true;
    } else if (roll < 0.85 && enemy._heavyCD <= 0) {
      // 加速重击突刺（长距离精准打击）
      cmd.heavyAttack = true;
      enemy.aiState = 'recover';
      enemy.aiTimer = 1.2;
      enemy._heavyCD = cfg.heavyCooldown || 0;
      return true;
    }
    return false;
  },

  /**
   * 接近行为：长枪保持最佳交战距离，不贴身
   */
  approachOverride(enemy, f, pf, d, ang, cmd, cfg) {
    const hints = f.weapon.aiHints;
    const sweetMax = hints?.preferredRange ? hints.preferredRange[1] : 85;
    const sweetMin = hints?.preferredRange ? hints.preferredRange[0] : 65;

    if (d < sweetMin) {
      // 过近 → 后退到甜点距离
      cmd.moveX = -Math.cos(ang) * 0.7;
      cmd.moveY = -Math.sin(ang) * 0.7;
      // 仍然允许攻击决策
      return false;
    }
    if (d > sweetMax + 30) return false; // 远距离正常接近
    if (d > sweetMax) {
      // 缓慢靠近到甜点范围
      const fwdX = Math.cos(ang);
      const fwdY = Math.sin(ang);
      const perpX = -fwdY * enemy._strafeDir;
      const perpY = fwdX * enemy._strafeDir;
      cmd.moveX = fwdX * 0.5 + perpX * 0.4;
      cmd.moveY = fwdY * 0.5 + perpY * 0.4;
      return false;
    }
    // 甜点范围内横向走位，但不阻止攻击决策
    const perpX = -Math.sin(ang) * enemy._strafeDir;
    const perpY = Math.cos(ang) * enemy._strafeDir;
    cmd.moveX = perpX * 0.6 + Math.cos(ang) * 0.2;
    cmd.moveY = perpY * 0.6 + Math.sin(ang) * 0.2;
    return false;
  },

  /**
   * 硬直中反应：长枪优先向后闪避拉距
   */
  staggerReact(enemy, f, pf, d, ang, cmd, cfg) {
    if (f.stamina >= C.DODGE_COST && Math.random() < cfg.dodgeChance * 1.8) {
      cmd.dodge = true;
      cmd.dodgeAngle = ang + Math.PI + (Math.random() - 0.5) * 0.6;
      enemy.aiState = 'recover';
      enemy.aiTimer = 0.4;
      return true;
    }
    return false;
  },
};

// ===================== 剑盾 AI — 龟壳反击，盾行压推 =====================
export const SHIELD_AI = {
  /**
   * 被格挡后决策：剑盾先举盾防御，等对手出手再反击
   */
  postParried(enemy, f, pf, d, ang, cmd, cfg) {
    const roll = Math.random();
    if (roll < 0.50 && enemy.blockCooldown <= 0.1) {
      // 立刻举盾（剑盾特权：blockCooldown缩短）
      cmd.blockHeld = true;
      enemy.aiState = 'defend';
      enemy.aiTimer = 0.4 + Math.random() * 0.3;
      enemy.blockCooldown = 0; // 剑盾被弹后可以更快举盾
      return true;
    } else if (roll < 0.75) {
      // 反击轻击（稳健选择）
      cmd.lightAttack = true;
      enemy.comboTarget = Math.min(2, cfg.maxCombo);
      enemy.comboCount = 1;
      enemy.aiState = 'recover';
      enemy.aiTimer = 0.5;
      return true;
    } else if (roll < 0.90 && enemy._heavyCD <= 0) {
      // 盾击（消耗对方体力）
      cmd.heavyAttack = true;
      enemy.aiState = 'recover';
      enemy.aiTimer = 1.0;
      enemy._heavyCD = cfg.heavyCooldown || 0;
      return true;
    }
    return false;
  },

  /**
   * 成功格挡后决策：剑盾稳健反击
   */
  postParry(enemy, f, pf, d, ang, cmd, cfg) {
    const roll = Math.random();
    if (roll < 0.45) {
      // 稳健轻击反击
      cmd.lightAttack = true;
      enemy.comboTarget = Math.min(2, cfg.maxCombo);
      enemy.comboCount = 1;
      enemy.aiState = 'recover';
      enemy.aiTimer = 0.5;
      return true;
    } else if (roll < 0.70 && enemy._heavyCD <= 0) {
      // 盾击压体力
      cmd.heavyAttack = true;
      enemy.aiState = 'recover';
      enemy.aiTimer = 1.0;
      enemy._heavyCD = cfg.heavyCooldown || 0;
      return true;
    } else if (roll < 0.85) {
      // 保持格挡（等对手再出手，再格挡一次）
      cmd.blockHeld = true;
      enemy.aiState = 'defend';
      enemy.aiTimer = 0.5 + Math.random() * 0.3;
      return true;
    }
    return false;
  },

  /**
   * 接近行为：盾行推进（边格挡边走）
   */
  approachOverride(enemy, f, pf, d, ang, cmd, cfg) {
    if (d > cfg.approachDist + 40) return false;
    // 盾行：近距离时举盾前进
    if (d > cfg.approachDist && enemy.blockCooldown <= 0 && f.stamina >= 2) {
      cmd.blockHeld = true;
      cmd.moveX = Math.cos(ang) * 0.8;
      cmd.moveY = Math.sin(ang) * 0.8;
      enemy.aiState = 'defend';
      enemy.aiTimer = 0.5;
      return true;
    }
    return false;
  },

  /**
   * 硬直中反应：剑盾优先格挡
   */
  staggerReact(enemy, f, pf, d, ang, cmd, cfg) {
    if (enemy.blockCooldown <= 0 && Math.random() < cfg.reactChance * 1.2) {
      cmd.blockHeld = true;
      enemy.aiState = 'defend';
      enemy.aiTimer = 0.3 + Math.random() * 0.2;
      return true;
    }
    return false;
  },
};
