import * as C from '../core/constants.js';
import { clamp, normalizeAngle, angleDiff } from '../core/utils.js';
import { WEAPON_DAO } from '../weapons/weapon-defs.js';

/*
  状态列表:
    idle, lightAttack, heavyAttack, blocking, blockRecovery,
    dodging, staggered, parryStunned, parryCounter,
    executing, executed
*/

export class Fighter {
  constructor(x, y, { color = '#4488ff', team = 0, name = '', scale = 1, hpMult = 1, weapon = null } = {}) {
    this.x = x;
    this.y = y;
    this.facing = 0;
    this.vx = 0;
    this.vy = 0;
    this.weapon = weapon || WEAPON_DAO;
    this.color = color;
    this.team = team;
    this.name = name;
    this.scale = scale;
    this.radius = C.FIGHTER_RADIUS * scale;

    // 生命
    this.maxHp = Math.round(C.MAX_HP * hpMult);
    this.hp = this.maxHp;
    this.alive = true;

    // 体力
    this.stamina = C.STAMINA_MAX;
    this.staminaRegenTimer = 0;
    this.staminaRegenPaused = false;
    this.staminaPauseTimer = 0;

    // 状态
    this.state = 'idle';
    this.stateTimer = 0;
    this.phase = 'none';
    this.phaseTimer = 0;

    // 攻击
    this.comboStep = 0;        // 1,2,3
    this.attackData = null;    // 当前攻击数据
    this.attackType = 'none';  // 'light','heavy','parryCounter'
    this.hasHit = new Set();   // 当次攻击已命中目标

    // 变招
    this.canFeint = true;

    // 防御
    this.blockStartTime = 0;
    this.blockHitCount = 0;

    // 格挡反击链
    this.parryChainCount = 0;
    this.parryCounterSpeedMult = 1;

    // 招架松手延迟
    this.blockLingerTimer = 0;

    // 体力归零
    this.isExhausted = false;
    this.exhaustedTimer = 0;
    this.speedMult = 1;

    // 闪避
    this.dodgeAngle = 0;
    this.perfectDodged = false;

    // 绝技锁定（被连斩命中后无法闪避脱离）
    this.ultimateLocked = null;

    // 硬直时长（动态设置）
    this.staggerDuration = 0;

    // 处决
    this.executionTarget = null;

    // 视觉
    this.flashTimer = 0;
    this.flashColor = '#fff';
    this.damageFlash = 0;
    this.afterimages = [];

    // 击退
    this.knockbackTimer = 0;
    this.knockbackDuration = C.KNOCKBACK_SLIDE_DURATION;
    this.knockbackVx = 0;
    this.knockbackVy = 0;

    // 变招视觉反馈
    this.feinted = false;

    // 格挡架开动画（被格挡方武器偏转）
    this.parryDeflect = 0; // 剩余时间，> 0 时武器被架开

    // 延迟拉近（格挡弹开武器后再拉近）
    this.pendingPull = null; // { angle, distance, slideDuration, delay }

    // 预输入缓冲
    this.inputBuffer = null;       // { action, params, timer }

    // 格挡加速增益
    this.parryBoost = { mult: 1, timer: 0 };

    // 打空追踪（供外部读取）
    this.lastWhiff = null;

    // 格挡成功后防止持续按住Space误入blocking
    this.blockSuppressed = false;

    // 格挡成功后短暂停顿（格挡方也无法立即行动，与攻击方同步解锁形成二次博弈）
    this.parryActionDelay = 0;

    // 炁（绝技能量）
    this.qi = 0;
    this.qiMax = C.QI_MAX;
    this.ultimateJustActivated = false;

    // 朝向锁定（影步等特殊效果）
    this.facingLocked = 0;
  }

  // ===================== 状态切换 =====================
  setState(s, params = {}) {
    // 退出旧状态
    if (this.state === 'blocking') {
      this.staminaRegenPaused = false;
    }
    // 任何非idle状态转换都清除格挡抑制（已完成首次决策后恢复正常格挡能力）
    if (this.blockSuppressed && s !== 'idle') {
      this.blockSuppressed = false;
    }
    this.state = s;
    this.stateTimer = 0;
    this.phase = 'none';
    this.phaseTimer = 0;
    this.hasHit = new Set();
    this.attackData = null;

    switch (s) {
      case 'idle':
        this.attackType = 'none';
        this.comboStep = 0;
        this.parryChainCount = 0;
        break;

      case 'lightAttack': {
        this.comboStep = params.comboStep || 1;
        this.canFeint = params.canFeint !== undefined ? params.canFeint : true;
        const idx = this.comboStep - 1;
        const wLA = this.weapon.lightAttacks;
        this.attackData = { ...wLA[Math.min(idx, wLA.length - 1)] };
        this.attackData.range *= this.scale;
        // 格挡加速增益
        if (this.parryBoost.timer > 0) {
          this.attackData.startup *= this.parryBoost.mult;
          this.parryBoost.timer = 0;
        }
        this.attackType = 'light';
        this.phase = 'startup';
        break;
      }
      case 'heavyAttack': {
        this.canFeint = params.canFeint !== undefined ? params.canFeint : true;
        const wH = this.weapon.heavy;
        this.attackData = {
          startup: wH.startup, active: wH.active,
          recovery: wH.recovery, range: wH.range * this.scale,
          arc: wH.arc, damage: wH.damage,
        };
        // 格挡加速增益
        if (this.parryBoost.timer > 0) {
          this.attackData.startup *= this.parryBoost.mult;
          this.parryBoost.timer = 0;
        }
        this.attackType = 'heavy';
        this.phase = 'startup';
        break;
      }
      case 'blocking':
        this.blockStartTime = params.time || 0;
        this.blockHitCount = 0;
        this.staminaRegenPaused = true;
        this.staminaPauseTimer = C.BLOCK_STAMINA_PAUSE;
        break;

      case 'blockRecovery':
        break;

      case 'dodging':
        this.dodgeAngle = params.angle !== undefined ? params.angle : this.facing;
        this.perfectDodged = false;
        if (this.stamina >= C.DODGE_COST) {
          this.stamina -= C.DODGE_COST;
        } else {
          // 体力不足无法闪避，回到idle
          this.setState('idle');
          return;
        }
        {
          const dodgeSpd = (this.weapon.dodgeSpeed || C.DODGE_SPEED) * this.speedMult;
          this.vx = Math.cos(this.dodgeAngle) * dodgeSpd;
          this.vy = Math.sin(this.dodgeAngle) * dodgeSpd;
        }
        break;

      case 'staggered':
        this.staggerDuration = params.duration || C.HIT_STAGGER;
        this.attackType = 'none';
        break;

      // 格挡被弹状态：不能移动/闪避/攻击，但可以按防御（用于乒乓）
      case 'parryStunned':
        this.staggerDuration = params.duration || 0.40;
        this.attackType = 'none';
        break;

      case 'parryCounter': {
        const baseStartup = params.counterStartup || 0.16;
        const chain = this.parryChainCount;
        const mult = 1 + chain * C.PARRY_CHAIN_DECAY;
        const w = this.weapon;
        this.attackData = {
          startup: baseStartup * mult,
          active: C.PARRY_COUNTER_ACTIVE,
          recovery: C.PARRY_COUNTER_RECOVERY,
          range: (w.counterRange || C.PARRY_COUNTER_RANGE) * this.scale,
          arc: w.counterArc || C.PARRY_COUNTER_ARC,
          damage: w.counterDamage || C.PARRY_COUNTER_DAMAGE,
        };
        this.attackType = 'parryCounter';
        this.phase = 'startup';
        this.canFeint = false;
        this.parryChainCount++;
        break;
      }
      case 'executing':
        this.executionTarget = params.target || null;
        break;

      case 'executed':
        break;

      case 'ultimate': {
        // 绝技：startup → active → recovery
        this.attackType = 'ultimate';
        this.phase = 'startup';
        this.ultimateStartupBegin = true;
        const wu = this.weapon.ultimate;
        this.attackData = {
          startup: wu.startup || C.ULTIMATE_STARTUP,
          active: wu.active || C.ULTIMATE_ACTIVE,
          recovery: wu.recovery || C.ULTIMATE_RECOVERY,
          range: (wu.range || C.ULTIMATE_RANGE) * this.scale,
          arc: wu.arc || C.ULTIMATE_ARC,
          hitDamage: wu.hitDamage || C.ULTIMATE_HIT_DAMAGE,
          hitCount: wu.hitCount || C.ULTIMATE_HIT_COUNT,
          type: wu.type || 'multislash',
        };
        this.ultimateHitsDone = 0;
        this.canFeint = false;
        break;
      }
    }
  }

  // ===================== 主更新 =====================
  update(dt, commands, gameTime) {
    this.stateTimer += dt;
    this.phaseTimer += dt;
    if (this.flashTimer > 0) this.flashTimer -= dt;
    if (this.damageFlash > 0) this.damageFlash -= dt;

    // 预输入缓冲更新
    if (this.inputBuffer) {
      this.inputBuffer.timer -= dt;
      if (this.inputBuffer.timer <= 0) this.inputBuffer = null;
    }

    // 格挡架开动画衰减
    if (this.parryDeflect > 0) this.parryDeflect -= dt;

    // 延迟拉近：弹开武器动画播完后再向攻击方滑动靠近
    if (this.pendingPull) {
      this.pendingPull.delay -= dt;
      if (this.pendingPull.delay <= 0) {
        const p = this.pendingPull;
        this.applyKnockback(p.angle, p.distance, p.slideDuration);
        this.pendingPull = null;
      }
    }

    // 格挡加速增益衰减
    if (this.parryBoost.timer > 0) {
      this.parryBoost.timer -= dt;
      if (this.parryBoost.timer <= 0) {
        this.parryBoost.mult = 1;
      }
    }

    // 格挡成功后行动延迟计时
    if (this.parryActionDelay > 0) this.parryActionDelay -= dt;

    // 朝向锁定计时
    if (this.facingLocked > 0) this.facingLocked -= dt;

    this.updateStamina(dt);
    this.updateExhaustion(dt);
    this.updateAfterimages(dt);

    // 状态分发（先处理状态逻辑，再应用移动）
    const handler = this[`update_${this.state}`];
    if (handler) handler.call(this, dt, commands, gameTime);

    this.updateMovement(dt, commands);
  }

  // 预输入缓冲：在无法行动时记录操作意图，状态结束后立即执行
  // 新输入覆盖旧输入（只保留最后一次操作意图）
  bufferInput(action, params = {}) {
    this.inputBuffer = { action, params, timer: C.INPUT_BUFFER_DURATION };
  }

  // 通用预输入采集：在任何锁定状态中持续检测玩家/AI输入
  _bufferFromCmd(cmd) {
    if (!cmd) return;
    // 绝技最高优先：稀有资源（攒满炁），不应被其他操作吞掉
    if (cmd.ultimate && this.isUltimateReady()) this.bufferInput('ultimate');
    else if (cmd.lightAttack) this.bufferInput('lightAttack');
    else if (cmd.heavyAttack) this.bufferInput('heavyAttack');
    else if (cmd.blockHeld && !this.blockSuppressed) this.bufferInput('block');
    else if (cmd.dodge) this.bufferInput('dodge', { angle: cmd.dodgeAngle });
  }

  // 消费缓冲输入（回到idle时调用）
  _consumeBuffer(gameTime) {
    if (!this.inputBuffer) return false;
    const buf = this.inputBuffer;
    this.inputBuffer = null;
    switch (buf.action) {
      case 'lightAttack':
        this.setState('lightAttack', { comboStep: 1 });
        return true;
      case 'heavyAttack':
        this.setState('heavyAttack');
        return true;
      case 'block':
        if (this.blockSuppressed) return false;
        this.setState('blocking', { time: gameTime });
        return true;
      case 'dodge':
        if (this.stamina >= C.DODGE_COST && !this.isExhausted) {
          this.setState('dodging', { angle: buf.params.angle });
          return true;
        }
        break;
      case 'ultimate':
        if (this.isUltimateReady()) {
          this.setState('ultimate');
          return true;
        }
        break;
    }
    return false;
  }

  // ===================== 各状态更新 =====================
  update_idle(dt, cmd, gameTime) {
    // 格挡成功后短暂停顿：只允许移动/转向，缓冲意图等延迟结束后执行
    if (this.parryActionDelay > 0) {
      if (cmd && cmd.faceAngle !== undefined) this.facing = cmd.faceAngle;
      this._bufferFromCmd(cmd);
      return;
    }

    // 先尝试消费缓冲输入
    if (this._consumeBuffer(gameTime)) return;

    if (!cmd) return;
    if (cmd.faceAngle !== undefined) this.facing = cmd.faceAngle;

    if (cmd.dodge && this.stamina >= C.DODGE_COST && !this.isExhausted) {
      this.setState('dodging', { angle: cmd.dodgeAngle });
      return;
    }
    // 绝技优先于普通攻击
    if (cmd.ultimate && this.isUltimateReady()) {
      this.setState('ultimate');
      return;
    }
    // 攻击优先于格挡：玩家格挡后可能仍按着Space，此时点击攻击应优先出招
    if (cmd.lightAttack) {
      this.setState('lightAttack', { comboStep: 1 });
      return;
    }
    if (cmd.heavyAttack) {
      this.setState('heavyAttack');
      return;
    }
    if (cmd.blockHeld) {
      if (!this.blockSuppressed) {
        this.setState('blocking', { time: gameTime });
        return;
      }
    } else {
      // Space松开后解除抑制，下次按Space可正常格挡
      this.blockSuppressed = false;
    }
  }

  update_lightAttack(dt, cmd, gameTime) {
    if (cmd && cmd.faceAngle !== undefined && this.phase === 'startup') {
      this.facing = cmd.faceAngle;
    }
    this._updateAttackPhases(dt, cmd, gameTime);
  }

  update_heavyAttack(dt, cmd, gameTime) {
    if (cmd && cmd.faceAngle !== undefined && this.phase === 'startup') {
      this.facing = cmd.faceAngle;
    }
    this._updateAttackPhases(dt, cmd, gameTime);
  }

  update_parryCounter(dt, cmd, gameTime) {
    this._updateAttackPhases(dt, cmd, gameTime);
  }

  _updateAttackPhases(dt, cmd, gameTime) {
    const d = this.attackData;
    if (!d) { this.setState('idle'); return; }

    if (this.phase === 'startup') {
      // 闪避取消（不算变招，只消耗正常闪避体力）
      if (cmd && cmd.dodge && this.stamina >= C.DODGE_COST && !this.isExhausted) {
        this.setState('dodging', { angle: cmd.dodgeAngle });
        return;
      }
      // 变招检测（已命中目标后不可变招）
      if (cmd && this.canFeint && this.hasHit.size === 0 && this.stamina >= C.FEINT_COST) {
        if (this._tryFeint(cmd, gameTime)) return;
      }
      if (this.phaseTimer >= d.startup) {
        this.phase = 'active';
        this.phaseTimer = 0;
        // 攻击位移：进入active瞬间一次性前冲（lunge）
        const lunge = this.attackType === 'heavy' ? (this.weapon.heavy.lunge || C.HEAVY_ATTACK_LUNGE)
          : this.attackType === 'parryCounter' ? (this.weapon.counterLunge || C.PARRY_COUNTER_LUNGE)
          : (this.weapon.lightLunge || C.LIGHT_ATTACK_LUNGE);
        this.x += Math.cos(this.facing) * lunge;
        this.y += Math.sin(this.facing) * lunge;
      }
    }

    if (this.phase === 'active') {
      // 攻击位移：active期间持续前推（drift），模拟挥刀惯性
      const drift = this.attackType === 'heavy' ? (this.weapon.heavy.drift || C.HEAVY_ATTACK_DRIFT)
        : this.attackType === 'parryCounter' ? (this.weapon.counterDrift || C.PARRY_COUNTER_DRIFT)
        : (this.weapon.lightDrift || C.LIGHT_ATTACK_DRIFT);
      this.x += Math.cos(this.facing) * drift * dt;
      this.y += Math.sin(this.facing) * drift * dt;

      // 预输入缓冲：active阶段无法操作，记录下一步意图
      this._bufferFromCmd(cmd);

      if (this.phaseTimer >= d.active) {
        // 打空检测：active→recovery时如果没命中任何目标
        if (this.hasHit.size === 0) {
          this.lastWhiff = { type: this.attackType, range: d.range };
        }
        this.phase = 'recovery';
        this.phaseTimer = 0;
      }
    }

    if (this.phase === 'recovery') {
      // 闪避取消（不算变招）
      if (cmd && cmd.dodge && this.stamina >= C.DODGE_COST && !this.isExhausted) {
        this.setState('dodging', { angle: cmd.dodgeAngle });
        return;
      }
      // 变招（已命中目标后不可变招）
      if (cmd && this.canFeint && this.hasHit.size === 0 && this.stamina >= C.FEINT_COST) {
        if (this._tryFeint(cmd, gameTime)) return;
      }
      // 轻击连击衔接（支持buffer输入：玩家在active阶段点击的攻击也能触发连击）
      const wantsLight = (cmd && cmd.lightAttack) ||
        (this.inputBuffer && this.inputBuffer.action === 'lightAttack');
      const maxCombo = this.weapon.lightAttacks.length;
      if (this.attackType === 'light' && this.comboStep < maxCombo &&
          wantsLight && this.phaseTimer < (this.weapon.comboWindow || C.LIGHT_COMBO_WINDOW)) {
        if (this.inputBuffer && this.inputBuffer.action === 'lightAttack') {
          this.inputBuffer = null; // 消费buffer
        }
        this.setState('lightAttack', { comboStep: this.comboStep + 1, canFeint: this.canFeint });
        return;
      }
      if (this.phaseTimer >= d.recovery) {
        this.setState('idle');
      }
    }
  }

  _tryFeint(cmd, gameTime) {
    // 变招仅限：轻击↔重击，攻击→防御。不包含闪避。
    if (this.attackType === 'light' && cmd.heavyAttack) {
      this.stamina -= C.FEINT_COST;
      this.feinted = true;
      this.setState('heavyAttack', { canFeint: false });
      return true;
    }
    if (this.attackType === 'light' && cmd.blockHeld) {
      this.stamina -= C.FEINT_COST;
      this.feinted = true;
      this.setState('blocking', { time: gameTime });
      this.canFeint = false;
      return true;
    }
    if (this.attackType === 'heavy' && cmd.lightAttack) {
      this.stamina -= C.FEINT_COST;
      this.feinted = true;
      this.setState('lightAttack', { comboStep: 1, canFeint: false });
      return true;
    }
    if (this.attackType === 'heavy' && cmd.blockHeld) {
      this.stamina -= C.FEINT_COST;
      this.feinted = true;
      this.setState('blocking', { time: gameTime });
      this.canFeint = false;
      return true;
    }
    return false;
  }

  _applyMagnet() {
    // 由 combat.js 外部处理
  }

  update_blocking(dt, cmd, gameTime) {
    if (cmd && cmd.faceAngle !== undefined) this.facing = cmd.faceAngle;
    // 持续暂停体力恢复
    this.staminaRegenPaused = true;
    this.staminaPauseTimer = C.BLOCK_STAMINA_PAUSE;

    // 格挡变招：格挡中按攻击可变招为攻击（消耗体力）
    if (cmd && this.stamina >= C.FEINT_COST && this.blockHitCount === 0) {
      if (cmd.lightAttack) {
        this.stamina -= C.FEINT_COST;
        this.feinted = true;
        this.setState('lightAttack', { comboStep: 1, canFeint: false });
        return;
      }
      if (cmd.heavyAttack) {
        this.stamina -= C.FEINT_COST;
        this.feinted = true;
        this.setState('heavyAttack', { canFeint: false });
        return;
      }
    }

    if (cmd && !cmd.blockHeld) {
      // 松手后 grace period — 仍然维持招架一小段时间
      this.blockLingerTimer += dt;
      if (this.blockLingerTimer >= C.BLOCK_LINGER_TIME) {
        this.blockLingerTimer = 0;
        this.setState('blockRecovery');
      }
      return;
    }
    this.blockLingerTimer = 0;

    // 防御中不能闪避（设计要求）
  }

  update_blockRecovery(dt, cmd) {
    if (cmd && cmd.faceAngle !== undefined) this.facing = cmd.faceAngle;
    this._bufferFromCmd(cmd);
    if (this.stateTimer >= (this.weapon.blockRecovery || C.BLOCK_RECOVERY_TIME)) {
      this.setState('idle');
    }
  }

  update_dodging(dt, cmd) {
    const t = this.stateTimer;
    const dodgeSpd = (this.weapon.dodgeSpeed || C.DODGE_SPEED) * this.speedMult;
    this.vx = Math.cos(this.dodgeAngle) * dodgeSpd;
    this.vy = Math.sin(this.dodgeAngle) * dodgeSpd;

    const invulnEnd = this.weapon.dodgeInvuln || C.DODGE_INVULN_END;
    // 残影
    if (t < invulnEnd) {
      this.afterimages.push({ x: this.x, y: this.y, alpha: 0.5, timer: 0.2 });
    }

    // 预输入缓冲：闪避中记录下一步意图
    this._bufferFromCmd(cmd);

    // 完美闪避回复体力
    if (this.perfectDodged && this.perfectDodged !== 'refunded') {
      const bonus = this.weapon.perfectDodgeStaminaBonus != null ? this.weapon.perfectDodgeStaminaBonus : 1;
      this.stamina = Math.min(this.stamina + C.DODGE_COST + bonus, C.STAMINA_MAX);
      this.perfectDodged = 'refunded';
    }

    if (t >= C.DODGE_DURATION) {
      this.vx = 0;
      this.vy = 0;
      this.setState('idle');
    }
  }

  update_staggered(dt, cmd) {
    this._bufferFromCmd(cmd);
    if (this.stateTimer >= this.staggerDuration) {
      this.setState('idle');
    }
  }

  // 格挡被弹后：短暂硬直→回到idle→二次博弈决策
  update_parryStunned(dt, cmd, gameTime) {
    // 预输入缓冲：只缓冲攻击/闪避，不缓冲格挡
    // （被弹后应优先反击创造拼刀，而非再次举盾）
    if (cmd) {
      if (cmd.lightAttack) this.bufferInput('lightAttack');
      else if (cmd.heavyAttack) this.bufferInput('heavyAttack');
      else if (cmd.dodge) this.bufferInput('dodge', { angle: cmd.dodgeAngle });
    }
    if (this.stateTimer >= this.staggerDuration) {
      this.setState('idle');
    }
  }

  update_executing(dt) {
    if (this.stateTimer >= C.EXECUTION_DURATION) {
      this.setState('idle');
    }
  }

  update_ultimate(dt, cmd, gameTime) {
    const d = this.attackData;
    if (!d) { this.setState('idle'); return; }

    if (this.phase === 'startup') {
      // 蓄势阶段可被打断（由combat-system处理）
      if (this.phaseTimer >= d.startup) {
        // 消耗全部炁
        this.qi = 0;
        this.phase = 'active';
        this.phaseTimer = 0;
        this.ultimateHitsDone = 0;
        this.hasHit = new Set();
        this.ultimateJustActivated = true;
      }
    } else if (this.phase === 'active') {
      // 绝技漂移
      const drift = this.weapon.ultimate.drift != null ? this.weapon.ultimate.drift : C.ULTIMATE_DRIFT;
      this.x += Math.cos(this.facing) * drift * dt;
      this.y += Math.sin(this.facing) * drift * dt;
      if (this.phaseTimer >= d.active) {
        this.phase = 'recovery';
        this.phaseTimer = 0;
      }
    } else if (this.phase === 'recovery') {
      this._bufferFromCmd(cmd);
      if (this.phaseTimer >= d.recovery) {
        this.setState('idle');
      }
    }
  }

  update_executed(dt) {
    if (this.stateTimer >= C.EXECUTION_DURATION) {
      // 被处决后回满体力
      this.stamina = C.STAMINA_MAX;
      this.isExhausted = false;
      this.speedMult = 1;
      this.setState('idle');
    }
  }

  // ===================== 移动 =====================
  updateMovement(dt, cmd) {
    if (this.knockbackTimer > 0) {
      // 击退滑动（线性减速，由快到慢，总位移 = distance）
      this.knockbackTimer -= dt;
      const ratio = Math.max(0, this.knockbackTimer) / this.knockbackDuration;
      this.vx = this.knockbackVx * ratio;
      this.vy = this.knockbackVy * ratio;
    } else {
      // 只在可移动状态下处理方向输入
      const movable = this.state === 'idle' || this.state === 'blocking';
      if (movable && cmd && (cmd.moveX || cmd.moveY)) {
        // 体型越大移速越慢: scale 1.5 → ×0.88
        const scaleSpdMult = 1 / Math.pow(this.scale, 0.3);
        const weaponSpdMult = this.weapon.speedMult || 1;
        // 盾行：格挡中可移动
        const blockMoveMult = (this.state === 'blocking' && this.weapon.canMoveWhileBlocking)
          ? (this.weapon.blockMoveSpeedMult || 0) : 1;
        const spd = C.FIGHTER_SPEED * this.speedMult * scaleSpdMult * weaponSpdMult * blockMoveMult;
        this.vx = (cmd.moveX || 0) * spd;
        this.vy = (cmd.moveY || 0) * spd;
      } else if (this.state !== 'dodging') {
        this.vx *= 0.8;
        this.vy *= 0.8;
        if (Math.abs(this.vx) < 1) this.vx = 0;
        if (Math.abs(this.vy) < 1) this.vy = 0;
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 边界（额外留出视觉空间，防止角色半身出屏）
    const margin = this.radius + 14;
    this.x = clamp(this.x, margin, C.ARENA_W - margin);
    this.y = clamp(this.y, margin, C.ARENA_H - margin);
  }

  // ===================== 体力 =====================
  updateStamina(dt) {
    if (this.staminaPauseTimer > 0) {
      this.staminaPauseTimer -= dt;
      return;
    }
    if (this.staminaRegenPaused) return;

    this.staminaRegenTimer += dt;
    if (this.staminaRegenTimer >= C.STAMINA_REGEN_INTERVAL) {
      this.staminaRegenTimer -= C.STAMINA_REGEN_INTERVAL;
      if (this.stamina < C.STAMINA_MAX) {
        this.stamina = Math.min(this.stamina + 1, C.STAMINA_MAX);
        if (this.stamina > 0 && this.isExhausted && this.exhaustedTimer <= 0) {
          this.isExhausted = false;
          this.speedMult = 1;
        }
      }
    }
  }

  updateExhaustion(dt) {
    if (this.isExhausted) {
      this.exhaustedTimer -= dt;
      this.speedMult = C.EXHAUSTED_SPEED_MULT;
    }
  }

  drainStamina(amount) {
    this.stamina = Math.max(0, this.stamina - amount);
    if (this.stamina <= 0 && !this.isExhausted) {
      this.isExhausted = true;
      this.exhaustedTimer = C.EXHAUSTED_PAUSE;
      this.staminaPauseTimer = C.EXHAUSTED_PAUSE;
      this.speedMult = C.EXHAUSTED_SPEED_MULT;
    }
  }

  // ===================== 受击 =====================
  takeDamage(amount) {
    this.hp -= amount;
    this.damageFlash = 0.12;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  applyKnockback(angle, distance, duration) {
    // 线性减速滑动 — v(t) = v0*(1-t/T), 总位移 = distance 像素
    const dur = duration || C.KNOCKBACK_SLIDE_DURATION;
    const speed = 2 * distance / dur;
    this.knockbackVx = Math.cos(angle) * speed;
    this.knockbackVy = Math.sin(angle) * speed;
    this.knockbackDuration = dur;
    this.knockbackTimer = dur;
  }

  flash(color, duration) {
    this.flashColor = color;
    this.flashTimer = duration;
  }

  // ===================== 查询 =====================
  isInvulnerable() {
    // 被绝技锁定时无法获得无敌帧
    if (this.ultimateLocked) return false;
    const invulnEnd = this.weapon.dodgeInvuln || C.DODGE_INVULN_END;
    return this.state === 'dodging' && this.stateTimer < invulnEnd;
  }

  hasHyperArmor() {
    // 绝技连斩阶段强制霸体
    if (this.state === 'ultimate') return this.phase !== 'startup';
    // 体力耗尽时重击失去霸体
    if (this.isExhausted) return false;
    // 武器特有霸体逻辑
    if (this.state === 'heavyAttack' && (this.phase === 'startup' || this.phase === 'active')) {
      return this.weapon.heavy.hyperArmor !== false;
    }
    // 某些武器轻攻击也有霸体（如大锤第3段）
    if (this.state === 'lightAttack' && this.phase === 'active' && this.attackData && this.attackData.hyperArmor) {
      return true;
    }
    return false;
  }

  isBlocking() {
    return this.state === 'blocking';
  }

  isAttackActive() {
    if (this.state === 'ultimate') return false; // 绝技由专用逻辑处理
    return this.phase === 'active' &&
      (this.state === 'lightAttack' || this.state === 'heavyAttack' || this.state === 'parryCounter');
  }

  // 武器正在挥动（startup后半段 + active）— 用于拼刀碰撞检测
  isSwinging() {
    const atkState = this.state === 'lightAttack' || this.state === 'heavyAttack';
    if (!atkState || !this.attackData) return false;
    if (this.phase === 'active') return true;
    if (this.phase === 'startup') {
      return this.phaseTimer >= this.attackData.startup * C.CLASH_SWING_RATIO;
    }
    return false;
  }

  getSwingType() {
    if (!this.isSwinging()) return null;
    return this.attackType;
  }

  canBeExecuted() {
    return this.isExhausted && this.state !== 'executed' && this.state !== 'executing' && this.state !== 'ultimate';
  }

  gainQi(amount) {
    this.qi = Math.min(this.qiMax, this.qi + amount);
  }

  isUltimateReady() {
    return this.qi >= this.qiMax;
  }

  getAttackInfo() {
    if (!this.isAttackActive() || !this.attackData) return null;
    return {
      type: this.attackType,
      range: this.attackData.range,
      arc: this.attackData.arc,
      damage: this.attackData.damage,
    };
  }

  // ===================== 残影 =====================
  updateAfterimages(dt) {
    for (const ai of this.afterimages) ai.timer -= dt;
    this.afterimages = this.afterimages.filter(ai => ai.timer > 0);
  }
}
