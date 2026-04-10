// ===================== AI HTN 计划系统 =====================
// 从 enemy.js 提取的多步策略规划模块
// 使用方式: Object.assign(Enemy.prototype, planMethods)

import * as C from '../core/constants.js';

export const planMethods = {
  _initPlan(steps) {
    this._plan = steps;
    this._planIdx = 0;
    this._planTimer = 0;
  },

  _clearPlan() {
    this._plan = [];
    this._planIdx = 0;
  },

  _advancePlan() {
    this._planIdx++;
    this._planTimer = 0;
    if (this._planIdx >= this._plan.length) {
      this._plan = [];
    }
  },

  _hasPlan() {
    return this._plan.length > 0 && this._planIdx < this._plan.length;
  },

  _executePlan(dt, f, pf, d, ang, cmd) {
    if (!this._hasPlan()) return false;

    const step = this._plan[this._planIdx];
    this._planTimer += dt;

    // 超时安全阀
    if (this._planTimer > (step.dur || 2.0)) {
      this._advancePlan();
      return this._hasPlan();
    }

    switch (step.act) {
      case 'light':
        if (f.state === 'idle') {
          cmd.lightAttack = true;
          this.comboTarget = step.combo || 1;
          this.comboCount = 1;
          this.attackCooldown = C.AI_MIN_ATTACK_INTERVAL;
          if (step.feint && f.stamina >= C.FEINT_COST + 1) {
            this.aiState = 'feint_wait';
          }
          this._advancePlan();
        }
        break;
      case 'heavy':
        if (f.state === 'idle') {
          cmd.heavyAttack = true;
          this.attackCooldown = C.AI_MIN_ATTACK_INTERVAL;
          if (step.feint && f.stamina >= C.FEINT_COST + 1) {
            this.aiState = 'feint_wait';
          }
          this._advancePlan();
        }
        break;
      case 'block':
        if (f.state === 'idle' || f.state === 'blocking') {
          cmd.blockHeld = true;
        }
        if (this._planTimer >= step.dur) this._advancePlan();
        break;
      case 'dodge':
        if (f.state === 'idle' && f.stamina >= C.DODGE_COST) {
          const side = step.side || (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
          cmd.dodge = true;
          cmd.dodgeAngle = ang + side;
          this._advancePlan();
        } else if (this._planTimer > 0.3) {
          this._advancePlan();
        }
        break;
      case 'approach':
        if (d > (step.dist || 55)) {
          cmd.moveX = Math.cos(ang);
          cmd.moveY = Math.sin(ang);
        }
        if (d <= (step.dist || 55) || this._planTimer >= step.dur) this._advancePlan();
        break;
      case 'wait':
        if (this._planTimer >= step.dur) this._advancePlan();
        break;
    }

    return true;
  },

  _checkPlanTriggers(f, pf, d, cfg) {
    if (this._hasPlan()) return;
    if (this.trainingMode) return;

    const prev = this._prevFighterState;
    const cur = f.state;
    const smartness = cfg.reactChance;

    // === 格挡成功获得加速buff → 规划反击 ===
    if (f.parryBoost.timer > 0 && !this._wasParryBoosted && cur === 'idle') {
      if (Math.random() < smartness * 1.2) {
        this._createParryFollowupPlan(f, pf, d, cfg);
        return;
      }
    }

    // === 被弹恢复 → 规划防守反击 ===
    if (prev === 'parryStunned' && cur === 'idle') {
      if (Math.random() < smartness * 0.7) {
        this._createRecoveryPlan(f, pf, d, cfg);
        return;
      }
    }

    // === 拼刀/硬直恢复 → 规划后续 ===
    if (prev === 'staggered' && cur === 'idle' && d < 90) {
      this.thinkCD = 0; // 拼刀恢复后立即允许反应
      if (Math.random() < smartness * 0.8) {
        // 高难度：恢复后有概率发动变招试探而非直接攻击
        if (cfg.feintChance > 0.2 && f.stamina >= C.FEINT_COST + 1 &&
            Math.random() < cfg.feintChance * 0.50) {
          this._createFeintPlan(d);
          return;
        }
        this._createClashFollowupPlan(f, pf, d, cfg);
        return;
      }
    }

    // === 闪避恢复 → 规划惩罚 ===
    if (prev === 'dodging' && cur === 'idle') {
      if (Math.random() < smartness * 0.9) {
        // 高难度：闪避后有概率变招而非直接惩罚
        if (cfg.feintChance > 0.2 && d < 80 && f.stamina >= C.FEINT_COST + 1 &&
            Math.random() < cfg.feintChance * 0.40) {
          this._createFeintPlan(d);
          return;
        }
        this._createDodgeFollowupPlan(f, pf, d, cfg);
        return;
      }
    }

    // === 主动压制（高难度，空闲过久）===
    if (this.difficulty >= 3 && cur === 'idle' && d < 70 && this._idleTimer > 0.8) {
      if (Math.random() < 0.015) {
        this._createPressurePlan(f, pf, d, cfg);
      }
    }
  },

  // --- 格挡成功后计划 ---
  _createParryFollowupPlan(f, pf, d, cfg) {
    const boost = f.parryBoost.mult;

    if (boost <= 0.4) {
      // 精准格挡 → 积极反击
      if (d < 70) {
        const r = Math.random();
        if (r < 0.35 && this.difficulty >= 4) {
          this._initPlan([{ act: 'heavy', dur: 1.5 }]);
        } else if (r < 0.65) {
          this._initPlan([{ act: 'light', dur: 1.0, combo: 2 }]);
        } else {
          this._initPlan([
            { act: 'wait', dur: 0.12 },
            { act: 'light', dur: 1.0 },
          ]);
        }
      } else {
        this._initPlan([
          { act: 'approach', dur: 0.4, dist: 60 },
          { act: 'light', dur: 1.0 },
        ]);
      }
    } else if (boost <= 0.6) {
      if (d < 70) {
        this._initPlan([{ act: 'light', dur: 1.0 }]);
      }
    } else {
      const opHeavyRateP = this._getPlayerHeavyRate();
      if (opHeavyRateP > 0.25 && Math.random() < 0.5) {
        this._initPlan([
          { act: 'block', dur: 0.25 },
          { act: 'light', dur: 1.0 },
        ]);
      } else if (Math.random() < 0.5) {
        this._initPlan([{ act: 'light', dur: 1.0 }]);
      }
    }
  },

  // --- 被弹恢复后计划 ---
  _createRecoveryPlan(f, pf, d, cfg) {
    const r = Math.random();
    const opHeavyRate = this._getPlayerHeavyRate();
    if (this.difficulty >= 4 && r < 0.3 && opHeavyRate > 0.2) {
      this._initPlan([
        { act: 'block', dur: 0.25 },
        { act: 'light', dur: 1.0 },
      ]);
    } else if (r < 0.3) {
      this._initPlan([{ act: 'light', dur: 1.0 }]);
    } else if (r < 0.55 && opHeavyRate > 0.2) {
      this._initPlan([{ act: 'block', dur: 0.4 + Math.random() * 0.3 }]);
    } else if (r < 0.7) {
      this._initPlan([{ act: 'dodge', dur: 0.5 }]);
    }
  },

  // --- 拼刀后计划 ---
  _createClashFollowupPlan(f, pf, d, cfg) {
    const r = Math.random();
    const opHeavyRate = this._getPlayerHeavyRate();
    if (r < 0.45) {
      this._initPlan([{ act: 'light', dur: 0.8 }]);
    } else if (r < 0.70 && opHeavyRate > 0.25) {
      this._initPlan([{ act: 'block', dur: 0.3 + Math.random() * 0.2 }]);
    } else if (r < 0.70) {
      this._initPlan([{ act: 'light', dur: 0.8 }]);
    } else if (r < 0.85 && this.difficulty >= 3) {
      this._initPlan([{ act: 'heavy', dur: 1.5 }]);
    } else {
      this._initPlan([{ act: 'dodge', dur: 0.5, side: Math.PI }]);
    }
  },

  // --- 闪避后计划 ---
  _createDodgeFollowupPlan(f, pf, d, cfg) {
    if (d < 80) {
      const r = Math.random();
      if (r < 0.6) {
        this._initPlan([{ act: 'light', dur: 1.0, combo: Math.min(2, cfg.maxCombo) }]);
      } else if (this.difficulty >= 4) {
        this._initPlan([{ act: 'heavy', dur: 1.5 }]);
      }
    } else {
      this._initPlan([
        { act: 'approach', dur: 0.5, dist: 60 },
        { act: 'light', dur: 1.0 },
      ]);
    }
  },

  // --- 主动变招计划 ---
  _createFeintPlan(d) {
    const cfg = this._cfg;
    const plans = [];

    plans.push([
      { act: 'heavy', dur: 1.5, feint: true },
      { act: 'light', dur: 1.0, combo: 2 },
    ]);

    plans.push([
      { act: 'light', dur: 1.0, feint: true },
      { act: 'heavy', dur: 1.5 },
    ]);

    const opHeavyRate = this._getPlayerHeavyRate();
    if (opHeavyRate > 0.25) {
      plans.push([
        { act: 'heavy', dur: 1.5, feint: true },
        { act: 'block', dur: 0.5 },
      ]);
    } else {
      plans.push([
        { act: 'heavy', dur: 1.5, feint: true },
        { act: 'heavy', dur: 1.5 },
      ]);
    }

    if (this.difficulty >= 4) {
      plans.push([
        { act: 'heavy', dur: 1.5, feint: true },
        { act: 'light', dur: 1.0, feint: true },
        { act: 'heavy', dur: 1.5 },
      ]);

      if (opHeavyRate > 0.25) {
        plans.push([
          { act: 'light', dur: 1.0, feint: true },
          { act: 'block', dur: 0.4 },
          { act: 'light', dur: 1.0, combo: 2 },
        ]);
      } else {
        plans.push([
          { act: 'light', dur: 1.0, feint: true },
          { act: 'heavy', dur: 1.5 },
        ]);
      }
    }

    if (d > 60) {
      plans.push([
        { act: 'approach', dur: 0.4, dist: 50 },
        { act: 'heavy', dur: 1.5, feint: true },
        { act: 'light', dur: 1.0, combo: 2 },
      ]);
    }

    this._initPlan(plans[Math.floor(Math.random() * plans.length)]);
    this._logDecision(this._gameTime, 'decide', 'feint_plan', {});
  },

  // --- 主动压制计划（高难度）---
  _createPressurePlan(f, pf, d, cfg) {
    if (f.stamina < 2) return;

    const opHeavyRate = this._getPlayerHeavyRate();
    const plans = [
      [{ act: 'light', dur: 1.0 }, { act: 'heavy', dur: 1.5 }],
      [{ act: 'heavy', dur: 1.5 }],
      [{ act: 'light', dur: 1.0 }, { act: 'light', dur: 1.0 }],
    ];

    if (opHeavyRate > 0.25) {
      plans.push(
        [{ act: 'light', dur: 1.0 }, { act: 'light', dur: 1.0 }, { act: 'block', dur: 0.3 }],
      );
    }

    if (this.difficulty >= 4 && f.stamina >= 3) {
      if (opHeavyRate > 0.25) {
        plans.push([
          { act: 'light', dur: 1.0 },
          { act: 'block', dur: 0.35 },
          { act: 'light', dur: 1.0 },
        ]);
      }
      plans.push([
        { act: 'approach', dur: 0.3, dist: 50 },
        { act: 'heavy', dur: 1.5 },
      ]);
    }

    if (this.difficulty >= 3 && f.stamina >= C.FEINT_COST + 2 && cfg.feintChance > 0) {
      plans.push([
        { act: 'heavy', dur: 1.5, feint: true },
        { act: 'wait', dur: 0.1 },
        { act: 'light', dur: 1.0, combo: 2 },
      ]);
      plans.push([
        { act: 'light', dur: 1.0, feint: true },
        { act: 'wait', dur: 0.08 },
        { act: 'heavy', dur: 1.5 },
      ]);
      if (this.difficulty >= 4) {
        plans.push([
          { act: 'heavy', dur: 1.5, feint: true },
          { act: 'heavy', dur: 1.5, feint: true },
          { act: 'heavy', dur: 1.5 },
        ]);
      }
    }

    this._initPlan(plans[Math.floor(Math.random() * plans.length)]);
  },

  // ===================== 智能重击应对（预判系统） =====================
  _reactToHeavy(pf, d, ang, cmd, cfg) {
    const feintRate = this._getPlayerHeavyFeintRate();
    const releaseRate = 1 - feintRate;
    const staminaLow = this.fighter.stamina <= 2;
    const smartness = cfg.heavyReactMult;

    let wBlock = 0.15;
    let wRead  = 0.20;
    let wDodge = 0.10;
    let wTrade = 0.10;
    let wHeavy = 0.05;

    if (releaseRate > 0.80) {
      wRead += 0.35;
      wBlock += 0.15;
      wDodge -= 0.05;
      wTrade -= 0.05;
    } else if (releaseRate > 0.55) {
      wBlock += 0.20;
      wRead += 0.15;
    } else {
      wRead += 0.30;
      wTrade += 0.10;
      wBlock -= 0.05;
    }

    if (staminaLow) {
      wBlock += wDodge * 0.8;
      wDodge *= 0.2;
    }

    const total = wBlock + wDodge + wRead + wTrade + wHeavy;
    wBlock /= total; wDodge /= total; wRead /= total; wTrade /= total; wHeavy /= total;

    if (Math.random() > smartness) return;

    const r = Math.random();
    let c = 0;

    c += wRead;
    if (r < c) {
      this.aiState = 'heavy_read';
      this.aiTimer = 1.2;
      return;
    }

    c += wBlock;
    if (r < c) {
      this.aiState = 'defend';
      this.blockDuration = 0.6 + Math.random() * 0.3;
      this.aiTimer = this.blockDuration;
      return;
    }

    c += wDodge;
    if (r < c) {
      if (this.fighter.stamina >= C.DODGE_COST) {
        cmd.dodge = true;
        cmd.dodgeAngle = ang + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
        this.aiState = 'punish';
        this.aiTimer = 0.15;
        return;
      }
    }

    c += wTrade;
    if (r < c) {
      cmd.lightAttack = true;
      this.comboTarget = 1;
      this.comboCount = 1;
      this.aiState = 'recover';
      this.aiTimer = 0.5;
      this.attackCooldown = C.AI_MIN_ATTACK_INTERVAL;
      return;
    }

    cmd.heavyAttack = true;
    this.aiState = 'recover';
    this.aiTimer = 1.2;
    this.attackCooldown = C.AI_MIN_ATTACK_INTERVAL;
  },

  // ===================== 训练模式6：拼刀训练 =====================
  _clashTrainerBehavior(dt, pf, d, ang, cmd) {
    const f = this.fighter;

    // 对手在攻击且近距离 → 防御反应
    if (d < 100 && f.state === 'idle' &&
        (pf.state === 'lightAttack' || pf.state === 'heavyAttack')) {
      if (Math.random() < 0.4 * dt * 60) {
        cmd.blockHeld = true;
        this.aiState = 'defend';
        this.aiTimer = 0.2 + Math.random() * 0.15;
        return cmd;
      }
    }

    if (d > 55) {
      cmd.moveX = Math.cos(ang);
      cmd.moveY = Math.sin(ang);
    } else if (this.attackCooldown <= 0 && f.state === 'idle') {
      cmd.lightAttack = true;
      this.attackCooldown = 0.7 + Math.random() * 0.5;
    }
    return cmd;
  },

  // ===================== 训练模式7：格挡乒乓训练 =====================
  _parryTrainerBehavior(dt, pf, d, ang, cmd) {
    const f = this.fighter;

    const playerThreat = pf.state === 'heavyAttack' ||
      (pf.state === 'lightAttack' && pf.phase !== 'recovery') ||
      (pf.state === 'parryCounter' && pf.phase !== 'recovery');
    if (playerThreat && d < 120 && f.state === 'idle') {
      cmd.blockHeld = true;
      return cmd;
    }

    if (f.state === 'blocking') {
      const stillThreat = pf.state === 'heavyAttack' ||
        (pf.state === 'lightAttack' && pf.phase !== 'recovery');
      if (stillThreat) {
        cmd.blockHeld = true;
        return cmd;
      }
      return cmd;
    }

    if (d > 60) {
      cmd.moveX = Math.cos(ang);
      cmd.moveY = Math.sin(ang);
    } else if (this.attackCooldown <= 0 && f.state === 'idle') {
      if (Math.random() < 0.55) {
        cmd.heavyAttack = true;
        this.attackCooldown = 1.0 + Math.random() * 0.5;
      } else {
        cmd.lightAttack = true;
        this.attackCooldown = 0.7 + Math.random() * 0.4;
      }
    }
    return cmd;
  },
};
