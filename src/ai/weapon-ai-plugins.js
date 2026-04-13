// ===================== 武器AI决策插件 =====================
// 方案B：每种武器定义可选的 aiPlugin 对象，在关键决策点覆写默认行为
// enemy.js 在关键决策点先检查 weapon.aiPlugin.xxx，有则调用，无则走默认逻辑
// 返回 true 表示已处理（跳过默认逻辑），false 表示未处理

import * as C from '../core/constants.js';
import { dist, angleBetween } from '../core/utils.js';

/**
 * 难度缩放：低难度AI使用插件行为概率更低，更多走默认逻辑
 * D1=0.20  D2=0.40  D3=0.60  D4=0.80  D5=1.00
 * @param {object} enemy - Enemy实例
 * @param {number} baseChance - 基准概率（D5水平）
 * @returns {boolean} 按难度缩放后的掷骰结果
 */
function pluginRoll(enemy, baseChance) {
  const scale = 0.2 + (enemy.difficulty - 1) / 4 * 0.8; // D1=0.20 D5=1.00
  return Math.random() < baseChance * scale;
}

// ===================== 匕首 AI — 闪避绕背，快速压制 =====================
export const DAGGERS_AI = {
  /**
   * 被格挡后决策：匕首轻巧，侧闪重新定位寻找背刺机会
   * @returns {boolean} true=已处理
   */
  postParried(enemy, f, pf, d, ang, cmd, cfg) {
    if (pluginRoll(enemy, 0.55) && f.stamina >= C.DODGE_COST) {
      // 侧闪绕背（匕首核心战术）
      const behindAngle = ang + (Math.random() < 0.5 ? Math.PI * 0.7 : -Math.PI * 0.7);
      cmd.dodge = true;
      cmd.dodgeAngle = behindAngle;
      enemy.aiState = 'punish';
      enemy.aiTimer = 0.15;
      return true;
    } else if (pluginRoll(enemy, 0.35)) {
      // 快速轻击连打（匕首速度优势）
      cmd.lightAttack = true;
      enemy.comboTarget = Math.min(3, cfg.maxCombo);
      enemy.comboCount = 1;
      enemy.aiState = 'recover';
      enemy.aiTimer = 0.4;
      return true;
    }
    // 走默认逻辑（低难度更频繁走这里）
    return false;
  },

  /**
   * 成功格挡后决策：匕首利用速度优势快速反击
   */
  postParry(enemy, f, pf, d, ang, cmd, cfg) {
    if (pluginRoll(enemy, 0.60)) {
      // 快速连击（利用parryBoost加速）
      cmd.lightAttack = true;
      enemy.comboTarget = Math.min(3, cfg.maxCombo);
      enemy.comboCount = 1;
      enemy.aiState = 'recover';
      enemy.aiTimer = 0.5;
      return true;
    } else if (pluginRoll(enemy, 0.35) && f.stamina >= C.DODGE_COST) {
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
    if (enemy.difficulty < 3) return false; // 低难度不绕侧
    // 近距离绕侧（匕首独有的弧形切入），难度越高侧向比例越大
    const fwdX = Math.cos(ang);
    const fwdY = Math.sin(ang);
    const perpX = -fwdY * enemy._strafeDir;
    const perpY = fwdX * enemy._strafeDir;
    const effectiveDiff = Math.min(4, enemy.difficulty); // D5绕侧不超过D4，避免接近太慢
    const strafeScale = 0.4 + (effectiveDiff - 3) / 2 * 0.4; // D3=0.4 D4/D5=0.6
    cmd.moveX = fwdX * (1 - strafeScale * 0.75) + perpX * strafeScale;
    cmd.moveY = fwdY * (1 - strafeScale * 0.75) + perpY * strafeScale;
    return true;
  },

  /**
   * 硬直中反应：匕首永远优先闪避，不做霸体交换
   */
  staggerReact(enemy, f, pf, d, ang, cmd, cfg) {
    // dodgeChance已含难度缩放，再乘1.5（原2.0太强导致低难度也高闪避）
    if (f.stamina >= C.DODGE_COST && Math.random() < cfg.dodgeChance * 1.5) {
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
    if (pluginRoll(enemy, 0.50) && enemy._heavyCD <= 0) {
      // 霸体重击交换（大锤的核心策略：挨打不怕，重击回敬）
      cmd.heavyAttack = true;
      enemy.aiState = 'recover';
      enemy.aiTimer = 1.5;
      enemy._heavyCD = cfg.heavyCooldown || 0;
      return true;
    } else if (pluginRoll(enemy, 0.30)) {
      // 轻击压制（大锤轻击也有霸体）
      cmd.lightAttack = true;
      enemy.comboTarget = Math.min(2, cfg.maxCombo);
      enemy.comboCount = 1;
      enemy.aiState = 'recover';
      enemy.aiTimer = 0.7;
      return true;
    } else if (pluginRoll(enemy, 0.20)) {
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
    if (pluginRoll(enemy, 0.55) && enemy._heavyCD <= 0) {
      // 加速重击（parryBoost缩短蓄力，大锤最大化重击价值）
      cmd.heavyAttack = true;
      enemy.aiState = 'recover';
      enemy.aiTimer = 1.5;
      enemy._heavyCD = cfg.heavyCooldown || 0;
      return true;
    } else if (pluginRoll(enemy, 0.35)) {
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
    if (enemy.difficulty < 2) return false; // D1走默认接近
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
    if (enemy._heavyCD <= 0 && Math.random() < 0.15 + diffScale * 0.45) {
      // 霸体重击硬交换（D1=15% D3=37% D5=60%）
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
    if (pluginRoll(enemy, 0.35)) {
      // 后退拉开距离（长枪核心：保持射程优势）
      enemy.aiState = 'retreat';
      enemy.aiTimer = 0.15 + Math.random() * 0.20;
      return true;
    } else if (pluginRoll(enemy, 0.25) && f.stamina >= C.DODGE_COST) {
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
    if (pluginRoll(enemy, 0.60)) {
      // 快速前刺利用加速（长枪射程长，不需要贴近）
      cmd.lightAttack = true;
      enemy.comboTarget = 1; // 单次戛刺后拉开
      enemy.comboCount = 1;
      enemy.aiState = 'recover';
      enemy.aiTimer = 0.5;
      return true;
    } else if (pluginRoll(enemy, 0.30) && enemy._heavyCD <= 0) {
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

    // D1-D2不做距离管理，D3+开始保持甜点距离
    if (enemy.difficulty < 3) return false;

    if (d < sweetMin) {
      // 过近 → 后退到甜点距离（难度越高后退越果断）
      const retreatStr = 0.4 + (enemy.difficulty - 3) / 2 * 0.3; // D3=0.4 D5=0.7
      cmd.moveX = -Math.cos(ang) * retreatStr;
      cmd.moveY = -Math.sin(ang) * retreatStr;
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
    // dodgeChance已含难度缩放，再乘1.5
    if (f.stamina >= C.DODGE_COST && Math.random() < cfg.dodgeChance * 1.5) {
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
    if (pluginRoll(enemy, 0.25) && enemy.blockCooldown <= 0.1) {
      // 举盾防御（降低概率，被弹后应优先反击）
      cmd.blockHeld = true;
      enemy.aiState = 'defend';
      enemy.aiTimer = 0.3 + Math.random() * 0.2;
      enemy.blockCooldown = 0;
      return true;
    } else if (pluginRoll(enemy, 0.45)) {
      // 反击轻击（主要选择）
      cmd.lightAttack = true;
      enemy.comboTarget = Math.min(2, cfg.maxCombo);
      enemy.comboCount = 1;
      enemy.aiState = 'recover';
      enemy.aiTimer = 0.5;
      return true;
    } else if (pluginRoll(enemy, 0.25) && enemy._heavyCD <= 0) {
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
   * 成功格挡后决策：剑盾积极反击（不浪费格反优势）
   */
  postParry(enemy, f, pf, d, ang, cmd, cfg) {
    if (pluginRoll(enemy, 0.55)) {
      // 稳健轻击反击（提高概率，格反后应积极利用优势）
      cmd.lightAttack = true;
      enemy.comboTarget = Math.min(2, cfg.maxCombo);
      enemy.comboCount = 1;
      enemy.aiState = 'recover';
      enemy.aiTimer = 0.5;
      return true;
    } else if (pluginRoll(enemy, 0.35) && enemy._heavyCD <= 0) {
      // 盾击压体力
      cmd.heavyAttack = true;
      enemy.aiState = 'recover';
      enemy.aiTimer = 1.0;
      enemy._heavyCD = cfg.heavyCooldown || 0;
      return true;
    }
    return false;
  },

  /**
   * 接近行为：盾行推进（对手有攻击威胁时边格挡边走）
   */
  approachOverride(enemy, f, pf, d, ang, cmd, cfg) {
    if (d > cfg.approachDist + 40) return false;
    if (enemy.difficulty < 3) return false; // 低难度不盾行
    // 仅在对手有攻击威胁时才盾行（避免无意义举盾浪费时间+暂停体力回复）
    const oppThreat = pf.state === 'lightAttack' || pf.state === 'heavyAttack' || pf.state === 'parryCounter';
    if (oppThreat && d > cfg.approachDist && enemy.blockCooldown <= 0 && f.stamina >= 2) {
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
   * 硬直中反应：剑盾优先格挡（但不过度防御）
   */
  staggerReact(enemy, f, pf, d, ang, cmd, cfg) {
    // 使用pluginRoll缩放 + 降低乘数（原0.8过高导致D5过度防御）
    if (enemy.blockCooldown <= 0 && pluginRoll(enemy, 0.45)) {
      cmd.blockHeld = true;
      enemy.aiState = 'defend';
      enemy.aiTimer = 0.3 + Math.random() * 0.2;
      return true;
    }
    return false;
  },
};
