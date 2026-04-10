import * as C from '../core/constants.js';
import { clamp, normalizeAngle, angleDiff } from '../core/utils.js';

/*
  状态列表:
    idle, lightAttack, heavyAttack, blocking, blockRecovery,
    dodging, staggered, parryStunned, parryCounter,
    executing, executed
*/

export class Fighter {
  constructor(x, y, { color = '#4488ff', team = 0, name = '' } = {}) {
    this.x = x;
    this.y = y;
    this.facing = 0;
    this.vx = 0;
    this.vy = 0;
    this.color = color;
    this.team = team;
    this.name = name;
    this.radius = C.FIGHTER_RADIUS;

    // 生命
    this.hp = C.MAX_HP;
    this.maxHp = C.MAX_HP;
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
    this.knockbackVx = 0;
    this.knockbackVy = 0;

    // 变招视觉反馈
    this.feinted = false;

    // 预输入缓冲
    this.inputBuffer = null;       // { action, params, timer }

    // 格挡加速增益
    this.parryBoost = { mult: 1, timer: 0 };

    // 打空追踪（供外部读取）
    this.lastWhiff = null;
  }

  // ===================== 状态切换 =====================
  setState(s, params = {}) {
    // 退出旧状态
    if (this.state === 'blocking') {
      this.staminaRegenPaused = false;
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
        this.attackData = { ...C.LIGHT_ATTACKS[idx] };
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
        this.attackData = {
          startup: C.HEAVY_CHARGE, active: C.HEAVY_ACTIVE,
          recovery: C.HEAVY_RECOVERY, range: C.HEAVY_RANGE,
          arc: C.HEAVY_ARC, damage: C.HEAVY_DAMAGE,
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
        this.vx = Math.cos(this.dodgeAngle) * C.DODGE_SPEED * this.speedMult;
        this.vy = Math.sin(this.dodgeAngle) * C.DODGE_SPEED * this.speedMult;
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
        this.attackData = {
          startup: baseStartup * mult,
          active: C.PARRY_COUNTER_ACTIVE,
          recovery: C.PARRY_COUNTER_RECOVERY,
          range: C.PARRY_COUNTER_RANGE,
          arc: C.PARRY_COUNTER_ARC,
          damage: C.PARRY_COUNTER_DAMAGE,
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

    // 格挡加速增益衰减
    if (this.parryBoost.timer > 0) {
      this.parryBoost.timer -= dt;
      if (this.parryBoost.timer <= 0) {
        this.parryBoost.mult = 1;
      }
    }

    this.updateStamina(dt);
    this.updateExhaustion(dt);
    this.updateAfterimages(dt);

    // 状态分发（先处理状态逻辑，再应用移动）
    const handler = this[`update_${this.state}`];
    if (handler) handler.call(this, dt, commands, gameTime);

    this.updateMovement(dt, commands);
  }

  // 缓存输入（在无法行动时记录操作意图）
  bufferInput(action, params = {}) {
    this.inputBuffer = { action, params, timer: C.INPUT_BUFFER_DURATION };
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
        this.setState('blocking', { time: gameTime });
        return true;
      case 'dodge':
        if (this.stamina >= C.DODGE_COST && !this.isExhausted) {
          this.setState('dodging', { angle: buf.params.angle });
          return true;
        }
        break;
    }
    return false;
  }

  // ===================== 各状态更新 =====================
  update_idle(dt, cmd, gameTime) {
    // 先尝试消费缓冲输入
    if (this._consumeBuffer(gameTime)) return;

    if (!cmd) return;
    if (cmd.faceAngle !== undefined) this.facing = cmd.faceAngle;

    if (cmd.dodge && this.stamina >= C.DODGE_COST && !this.isExhausted) {
      this.setState('dodging', { angle: cmd.dodgeAngle });
      return;
    }
    if (cmd.blockHeld) {
      this.setState('blocking', { time: gameTime });
      return;
    }
    if (cmd.lightAttack) {
      this.setState('lightAttack', { comboStep: 1 });
      return;
    }
    if (cmd.heavyAttack) {
      this.setState('heavyAttack');
      return;
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
        const lunge = this.attackType === 'heavy' ? C.HEAVY_ATTACK_LUNGE
          : this.attackType === 'parryCounter' ? C.PARRY_COUNTER_LUNGE
          : C.LIGHT_ATTACK_LUNGE;
        this.x += Math.cos(this.facing) * lunge;
        this.y += Math.sin(this.facing) * lunge;
      }
    }

    if (this.phase === 'active') {
      // 攻击位移：active期间持续前推（drift），模拟挥刀惯性
      const drift = this.attackType === 'heavy' ? C.HEAVY_ATTACK_DRIFT
        : this.attackType === 'parryCounter' ? C.PARRY_COUNTER_DRIFT
        : C.LIGHT_ATTACK_DRIFT;
      this.x += Math.cos(this.facing) * drift * dt;
      this.y += Math.sin(this.facing) * drift * dt;

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
      // 轻击连击衔接
      if (this.attackType === 'light' && this.comboStep < 3 &&
          cmd && cmd.lightAttack && this.phaseTimer < C.LIGHT_COMBO_WINDOW) {
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
    // 预输入缓冲：后摇中按攻击/防御/闪避
    if (cmd) {
      if (cmd.lightAttack) this.bufferInput('lightAttack');
      else if (cmd.heavyAttack) this.bufferInput('heavyAttack');
      else if (cmd.blockHeld) this.bufferInput('block');
      else if (cmd.dodge) this.bufferInput('dodge', { angle: cmd.dodgeAngle });
    }
    if (this.stateTimer >= C.BLOCK_RECOVERY_TIME) {
      this.setState('idle');
    }
  }

  update_dodging(dt) {
    const t = this.stateTimer;
    const speed = C.DODGE_SPEED * this.speedMult;
    this.vx = Math.cos(this.dodgeAngle) * speed;
    this.vy = Math.sin(this.dodgeAngle) * speed;

    // 残影
    if (t < C.DODGE_INVULN_END) {
      this.afterimages.push({ x: this.x, y: this.y, alpha: 0.5, timer: 0.2 });
    }

    // 完美闪避退还体力
    if (this.perfectDodged && this.stamina < C.STAMINA_MAX) {
      this.stamina = Math.min(this.stamina + C.DODGE_COST, C.STAMINA_MAX);
      this.perfectDodged = 'refunded'; // 标记已退还，防止重复
    }

    if (t >= C.DODGE_DURATION) {
      this.vx = 0;
      this.vy = 0;
      this.setState('idle');
    }
  }

  update_staggered(dt, cmd) {
    // 预输入缓冲：硬直中按操作
    if (cmd) {
      if (cmd.lightAttack) this.bufferInput('lightAttack');
      else if (cmd.heavyAttack) this.bufferInput('heavyAttack');
      else if (cmd.blockHeld) this.bufferInput('block');
      else if (cmd.dodge) this.bufferInput('dodge', { angle: cmd.dodgeAngle });
    }
    if (this.stateTimer >= this.staggerDuration) {
      this.setState('idle');
    }
  }

  // 格挡被弹后：可以按防御进入blocking（乒乓），或者硬吃反击
  update_parryStunned(dt, cmd, gameTime) {
    if (cmd && cmd.blockHeld && this.stateTimer >= 0.12) {
      // 允许在被弹后0.12s起按防御（给人类可操作的反应缓冲）
      this.setState('blocking', { time: gameTime });
      return;
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

  update_executed(dt) {
    if (this.stateTimer >= C.EXECUTION_DURATION) {
      this.stamina = C.EXHAUSTED_RESTORE;
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
      const ratio = Math.max(0, this.knockbackTimer) / C.KNOCKBACK_SLIDE_DURATION;
      this.vx = this.knockbackVx * ratio;
      this.vy = this.knockbackVy * ratio;
    } else {
      // 只在可移动状态下处理方向输入
      const movable = this.state === 'idle' || this.state === 'blocking';
      if (movable && cmd && (cmd.moveX || cmd.moveY)) {
        const spd = C.FIGHTER_SPEED * this.speedMult;
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

  applyKnockback(angle, distance) {
    // 线性减速滑动 — v(t) = v0*(1-t/T), 总位移 = distance 像素
    const dur = C.KNOCKBACK_SLIDE_DURATION;
    const speed = 2 * distance / dur;
    this.knockbackVx = Math.cos(angle) * speed;
    this.knockbackVy = Math.sin(angle) * speed;
    this.knockbackTimer = dur;
  }

  flash(color, duration) {
    this.flashColor = color;
    this.flashTimer = duration;
  }

  // ===================== 查询 =====================
  isInvulnerable() {
    return this.state === 'dodging' && this.stateTimer < C.DODGE_INVULN_END;
  }

  hasHyperArmor() {
    return this.state === 'heavyAttack' && (this.phase === 'startup' || this.phase === 'active');
  }

  isBlocking() {
    return this.state === 'blocking';
  }

  isAttackActive() {
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
    return this.isExhausted && this.state !== 'executed' && this.state !== 'executing';
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
