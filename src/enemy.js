import { Fighter } from './fighter.js';
import { dist, angleBetween, randomRange, normalizeAngle } from './utils.js';
import * as C from './constants.js';

export class Enemy {
  constructor(x, y, difficulty = 2) {
    this.fighter = new Fighter(x, y, { color: '#ff4444', team: 1, name: '敌人' });
    this.difficulty = difficulty;
    this.aiState = 'approach';
    this.aiTimer = 0;
    this.thinkCD = 0;
    this.comboTarget = 0;
    this.comboCount = 0;
    this.blockDuration = 0;
    this.retreatTimer = 0;

    // 玩家行为追踪
    this._playerHistory = [];
    this._lastPlayerState = 'idle';
    this._lastPlayerPhase = 'none';
    // 重击变招追踪
    this._heavyFeints = 0;
    this._heavyReleases = 0;

    // AI 节奏控制
    this.attackCooldown = 0;
    this._idleTimer = 0;

    // 走位系统
    this._strafeDir = Math.random() < 0.5 ? 1 : -1; // 横向移动方向
    this._strafeTimer = 0;
    this._footsiePhase = 0; // 0=前进 1=后退

    // HTN 计划系统（多步策略链）
    this._plan = [];
    this._planIdx = 0;
    this._planTimer = 0;
    this._prevFighterState = 'idle';
    this._wasParryBoosted = false;
    this._attackCommitted = false; // 攻击承诺标志（一次性决定，非每帧重复掷骰）

    // 决策日志（外部可读取）
    this.decisionLog = [];  // { time, reason, action, context }
    this.logEnabled = false;
    this._gameTime = 0;

    // 难度参数
    // difficulty 1=新手  2=普通  3=熟练  4=困难  5=大师
    //           6=拼刀训练  7=格挡乒乓训练
    this._cfg = this._buildConfig(difficulty);
    this.trainingMode = difficulty >= 6 ? difficulty : 0;
  }

  _buildConfig(d) {
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

  _logDecision(time, reason, action, context) {
    if (!this.logEnabled) return;
    this.decisionLog.push({ time: +time.toFixed(3), reason, action, ...context });
    if (this.decisionLog.length > 500) this.decisionLog.shift();
  }

  // ===================== 玩家行为追踪 =====================
  _trackPlayer(pf) {
    const stateChanged = pf.state !== this._lastPlayerState;
    const phaseChanged = pf.phase !== this._lastPlayerPhase;

    if (stateChanged || phaseChanged) {
      const prevState = this._lastPlayerState;
      const prevPhase = this._lastPlayerPhase;
      this._lastPlayerState = pf.state;
      this._lastPlayerPhase = pf.phase;

      // 追踪重击变招率：startup中取消=变招，进入active=释放
      if (prevState === 'heavyAttack' && prevPhase === 'startup' && pf.state !== 'heavyAttack') {
        this._heavyFeints++;
      }
      if (pf.state === 'heavyAttack' && pf.phase === 'active' && prevPhase === 'startup') {
        this._heavyReleases++;
      }

      // 通用行为追踪
      if (stateChanged) {
        if (pf.state === 'heavyAttack' || pf.state === 'lightAttack' ||
            pf.state === 'blocking' || pf.state === 'dodging') {
          this._playerHistory.push(pf.state);
          if (this._playerHistory.length > 8) this._playerHistory.shift();
        }
      }
    }
  }

  _getPlayerHeavyRate() {
    const attacks = this._playerHistory.filter(s => s === 'heavyAttack' || s === 'lightAttack');
    if (attacks.length < 3) return 0;
    return attacks.filter(s => s === 'heavyAttack').length / attacks.length;
  }

  _getPlayerHeavyFeintRate() {
    const total = this._heavyFeints + this._heavyReleases;
    if (total < 2) return 0.25; // 样本不足时默认假设
    return this._heavyFeints / total;
  }

  // ===================== AI 主循环 =====================
  getCommands(dt, playerFighter) {
    const f = this.fighter;
    const pf = playerFighter;
    const d = dist(f, pf);
    const ang = angleBetween(f, pf);
    const cfg = this._cfg;
    this._gameTime += dt;

    const cmd = {
      moveX: 0, moveY: 0,
      faceAngle: ang,
      lightAttack: false,
      heavyAttack: false,
      blockHeld: false,
      dodge: false,
      dodgeAngle: 0,
    };

    this.thinkCD -= dt;
    this.aiTimer -= dt;
    this.attackCooldown -= dt;
    this._trackPlayer(pf);

    // HTN 计划管理
    if (this._hasPlan() && (f.state === 'staggered' || f.state === 'executed' || !f.alive)) {
      this._clearPlan();
    }
    this._checkPlanTriggers(f, pf, d, cfg);
    this._prevFighterState = f.state;
    this._wasParryBoosted = f.parryBoost && f.parryBoost.timer > 0;

    // 攻击承诺：当AI决定攻击或进入startup时，一次性决定是否承诺
    // 低难度AI完全承诺，高难度AI有机会取消（快速反射）
    const isAttacking = this.aiState === 'attack' || this.aiState === 'heavy' ||
      (f.state === 'lightAttack' && f.phase === 'startup') ||
      (f.state === 'heavyAttack' && f.phase === 'startup');
    const wasAttacking = this._wasAttacking || false;
    if (isAttacking && !wasAttacking) {
      // 刚进入攻击状态，一次性投掷承诺
      // 二次方缩放：高难度AI更多读招机会 D1=0% D3=9% D4=20% D5=35%
      const diffScale = (this.difficulty - 1) / 4;
      const commitBreakChance = diffScale * diffScale * 0.35;
      this._attackCommitted = Math.random() > commitBreakChance;
    } else if (!isAttacking) {
      this._attackCommitted = false;
    }
    this._wasAttacking = isAttacking;

    // 空闲时间追踪（长时间不攻击则强制接近）
    if (f.state === 'idle' && (this.aiState === 'approach' || this.aiState === 'recover')) {
      this._idleTimer += dt;
    } else if (f.state === 'lightAttack' || f.state === 'heavyAttack') {
      this._idleTimer = 0;
    }

    // ===== 特殊状态处理 =====

    // 攻击/硬直动画中：处理变招和连击
    if (f.state === 'lightAttack' || f.state === 'heavyAttack' ||
        f.state === 'parryCounter' || f.state === 'staggered' ||
        f.state === 'dodging' || f.state === 'executed' || f.state === 'executing') {

      // AI变招：在startup阶段取消攻击
      if (this.aiState === 'feint_wait' && f.phase === 'startup') {
        if (f.attackType === 'light') {
          // 轻击→防御（骗对手反击后格反）
          cmd.blockHeld = true;
          this.aiState = 'defend';
          this.aiTimer = 0.3 + Math.random() * 0.15;
          this._logDecision(this._gameTime, 'feint_exec', 'light_to_block', {});
        } else if (f.attackType === 'heavy') {
          // 重击变招：两种策略
          const r = Math.random();
          if (r < 0.55) {
            // 重击→轻击（最常见，快速打出）
            cmd.lightAttack = true;
            this.aiState = 'recover';
            this.aiTimer = 0.3;
            this._logDecision(this._gameTime, 'feint_exec', 'heavy_to_light', {});
          } else {
            // 重击→格挡（等对手出手后格反）
            cmd.blockHeld = true;
            this.aiState = 'defend';
            this.aiTimer = 0.4 + Math.random() * 0.2;
            this._logDecision(this._gameTime, 'feint_exec', 'heavy_to_block', {});
          }
        }
        this.attackCooldown = 0.15; // 变招后快速恢复攻击能力
        return cmd;
      }

      // 重击对冲博弈：AI蓄力中发现玩家也在蓄力重击 → 考虑变招
      if (f.state === 'heavyAttack' && f.phase === 'startup' &&
          pf.state === 'heavyAttack' && pf.phase === 'startup' &&
          this.aiState !== 'feint_wait') {
        const feintChance = cfg.feintChance * 1.5; // 对冲时变招概率更高
        if (feintChance > 0 && f.stamina >= C.FEINT_COST + 1 &&
            Math.random() < feintChance * dt * 5) {
          // 变招策略：格挡（等对手重击出来格反）或轻击（快速打断）
          if (Math.random() < 0.6) {
            cmd.blockHeld = true; // 重击→格挡：等对手释放重击后格反
          } else {
            cmd.lightAttack = true; // 重击→轻击
          }
          this.aiState = 'recover';
          this.aiTimer = 0.5;
          this._logDecision(this._gameTime, 'feint_react', 'heavy_vs_heavy', { opState: pf.state });
          return cmd;
        }
      }

      // 反应式变招：AI攻击startup阶段发现对手举盾 → 变招骗招
      if ((f.state === 'lightAttack' || f.state === 'heavyAttack') &&
          f.phase === 'startup' && this.aiState !== 'feint_wait' &&
          pf.state === 'blocking' &&
          cfg.feintChance > 0 && f.stamina >= C.FEINT_COST + 1) {
        const reactFeint = cfg.feintChance * 0.6;
        if (Math.random() < reactFeint * dt * 8) {
          if (f.attackType === 'light') {
            // 轻击→举盾，等对手放弃格挡后再出手
            cmd.blockHeld = true;
          } else {
            // 重击→轻击，快速打出
            cmd.lightAttack = true;
          }
          this.aiState = 'recover';
          this.aiTimer = 0.4;
          this._logDecision(this._gameTime, 'feint_react', 'vs_block', { opState: pf.state, atkType: f.attackType });
          return cmd;
        }
      }

      // 硬直中二次博弈：拼刀/被击后的猜拳决策
      if (f.state === 'staggered' && d < 100) {
        // 区分轻击和重击/格反（排除已结束的recovery阶段）
        const incomingLight = pf.state === 'lightAttack' && pf.phase !== 'recovery';
        const incomingHeavy = pf.state === 'heavyAttack' ||
          (pf.state === 'parryCounter' && pf.phase !== 'recovery');

        if (incomingHeavy && Math.random() < cfg.reactChance) {
          // 重击/格反来袭 → 格挡有收益（格反机会）
          cmd.blockHeld = true;
          this.aiState = 'defend';
          this.aiTimer = 0.25 + Math.random() * 0.15;
          this._logDecision(this._gameTime, 'stagger_react', 'block', { dist: +d.toFixed(0), opState: pf.state, opPhase: pf.phase });
        } else if (incomingLight) {
          // 轻击来袭 → 格挡无格反收益，选择闪避或霸体交换
          const diffScaleD = (this.difficulty - 1) / 4;
          if (Math.random() < cfg.dodgeChance * 2 && f.stamina >= C.DODGE_COST) {
            cmd.dodge = true;
            cmd.dodgeAngle = ang + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
            this.aiState = 'recover';
            this.aiTimer = 0.4;
            this._logDecision(this._gameTime, 'stagger_react', 'dodge', { dist: +d.toFixed(0), opState: pf.state });
          } else if (Math.random() < diffScaleD * 0.5) {
            // 高难度：霸体重击交换（吸收轻击，重击反打）
            cmd.heavyAttack = true;
            this.aiState = 'recover';
            this.aiTimer = 1.2;
            this._logDecision(this._gameTime, 'stagger_react', 'heavy_trade', { dist: +d.toFixed(0) });
          }
          // else: 接受命中后自然恢复（不白白浪费体力举盾）
        } else if (!incomingLight && !incomingHeavy && f.stateTimer > f.staggerDuration * 0.4) {
          // 对手还没出招 → 主动博弈
          const diffScaleG = (this.difficulty - 1) / 4;
          const guessChance = diffScaleG * 0.50;
          if (Math.random() < guessChance) {
            const guess = Math.random();
            if (guess < 0.40) {
              cmd.heavyAttack = true;
              this.aiState = 'recover';
              this.aiTimer = 1.2;
              this._logDecision(this._gameTime, 'stagger_guess', 'heavy', { dist: +d.toFixed(0), opState: pf.state });
            } else if (guess < 0.55) {
              // 只在对手可能出重击时格挡才有意义
              cmd.blockHeld = true;
              this.aiState = 'defend';
              this.aiTimer = cfg.blockDurBase + Math.random() * 0.3;
              this._logDecision(this._gameTime, 'stagger_guess', 'block', { dist: +d.toFixed(0), opState: pf.state });
            } else {
              cmd.lightAttack = true;
              this.comboTarget = Math.min(2, cfg.maxCombo);
              this.comboCount = 1;
              this.aiState = 'recover';
              this.aiTimer = 0.6;
              this._logDecision(this._gameTime, 'stagger_guess', 'light', { dist: +d.toFixed(0), opState: pf.state });
            }
          }
        }
      }

      // 轻击连击衔接
      if (f.state === 'lightAttack' && f.phase === 'recovery' && this.comboCount < this.comboTarget) {
        // 连击途中有概率变招（中断combo→格挡或重击）
        if (cfg.feintChance > 0.15 && this.comboCount >= 1 &&
            f.stamina >= C.FEINT_COST + 1 && Math.random() < cfg.feintChance * 0.3) {
          if (Math.random() < 0.6) {
            cmd.heavyAttack = true; // 轻击→重击（节奏变化）
          } else {
            cmd.blockHeld = true; // 轻击→格挡（安全取消）
          }
          this.comboTarget = 0; // 终止连击
          this.aiState = 'recover';
          this.aiTimer = 0.3;
          this._logDecision(this._gameTime, 'feint_combo', 'mid_combo', { combo: this.comboCount });
        } else {
          cmd.lightAttack = true;
          this.comboCount++;
        }
      }
      return cmd;
    }

    // 格挡被弹状态：AI根据难度决定是否按防御（乒乓）
    if (f.state === 'parryStunned') {
      const pingPongChance = cfg.reactChance * 0.8;
      if (Math.random() < pingPongChance) {
        cmd.blockHeld = true;
      }
      return cmd;
    }

    // ===== 防御状态维持（所有模式通用，确保训练模式也能格挡） =====
    if (f.state === 'blocking' && this.aiState === 'defend') {
      // 被轻击命中 → 格挡无格反收益，尽快松手准备反击
      if (f.blockHitCount > 0 && pf.state === 'lightAttack') {
        this.aiTimer = Math.min(this.aiTimer, 0.05);
      }
      cmd.blockHeld = true;
      if (this.aiTimer <= 0) {
        this.aiState = 'recover';
        this.aiTimer = 0.15;
        this.attackCooldown = 0; // 防御结束后允许立即反击
      }
      return cmd;
    }

    // ===== 训练模式：独立行为路径 =====
    if (this.trainingMode === 6) return this._clashTrainerBehavior(dt, pf, d, ang, cmd);
    if (this.trainingMode === 7) return this._parryTrainerBehavior(dt, pf, d, ang, cmd);

    // ===== 强制接敌：长时间不攻击时主动出击 =====
    if (!this._hasPlan() && this._idleTimer > C.AI_MAX_IDLE_TIME && d < cfg.approachDist + 30 && f.state === 'idle') {
      cmd.lightAttack = true;
      this.comboTarget = 1;
      this.comboCount = 1;
      this.aiState = 'recover';
      this.aiTimer = 0.6;
      this._idleTimer = 0;
      this.attackCooldown = C.AI_MIN_ATTACK_INTERVAL;
      return cmd;
    }

    // ===== 优先级1：智能应对玩家重击蓄力（不受thinkCD限制，始终持续监控） =====
    const heavyStartup = pf.state === 'heavyAttack' && pf.phase === 'startup';
    if (heavyStartup && d < cfg.heavyReactDist &&
        this.aiState !== 'defend' && this.aiState !== 'heavy_read') {
      this._reactToHeavy(pf, d, ang, cmd, cfg);
      return cmd;
    }

    // ===== 优先级2：惩罚玩家后摇/硬直 =====
    const playerRecovery =
      (pf.state === 'heavyAttack' && pf.phase === 'recovery') ||
      (pf.state === 'lightAttack' && pf.phase === 'recovery' && pf.comboStep >= 3) ||
      pf.state === 'staggered' ||
      pf.state === 'parryStunned' ||
      pf.state === 'blockRecovery';
    if (playerRecovery && d < 90 && this.thinkCD <= 0 &&
        Math.random() < cfg.punishRate && this.aiState !== 'punish') {
      cmd.lightAttack = true;
      this.comboTarget = Math.min(2, cfg.maxCombo);
      this.comboCount = 1;
      this.aiState = 'recover';
      this.aiTimer = 0.6;
      this.thinkCD = cfg.thinkCD;
      return cmd;
    }

    // ===== 优先级3：反应玩家攻击 =====
    // 攻击承诺：使用一次性决定的标志，而非每帧重新掷骰
    const aiCommitted = this._attackCommitted;
    const playerThreat = pf.isAttackActive() ||
      (pf.state === 'parryCounter' && pf.phase === 'startup') ||
      (pf.isSwinging && pf.isSwinging());
    if (playerThreat && d < 120 && this.thinkCD <= 0 && !aiCommitted) {
      const r = Math.random();
      // 根据对手当前攻击类型 + 自身难度智能选择反应
      const diffScaleR = (this.difficulty - 1) / 4; // 0(D1) ~ 1(D5)
      const isHeavyThreat = pf.state === 'heavyAttack';

      // 高难度AI能区分轻/重攻击并采取最优反应（二次方缩放拉开识别精度）
      // D1=0% D3=25% D4=56% D5=100%
      const identifyChance = diffScaleR * diffScaleR;
      if (isHeavyThreat && Math.random() < identifyChance) {
        // === 识别重击 → 格挡（争取精准格反 → 巨大收益） ===
        if (Math.random() < cfg.reactChance) {
          this.aiState = 'defend';
          this.blockDuration = cfg.blockDurBase + Math.random() * 0.4;
          this.aiTimer = this.blockDuration;
        } else if (f.stamina >= C.DODGE_COST) {
          const dodgeA = ang + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
          cmd.dodge = true;
          cmd.dodgeAngle = dodgeA;
          this.aiState = 'recover';
          this.aiTimer = 0.4;
        }
      } else if (!isHeavyThreat && Math.random() < identifyChance) {
        // === 识别轻击 → 反击（拼刀或打后摇，避免无效格挡） ===
        if (d < 70 && Math.random() < 0.55) {
          cmd.lightAttack = true;
          this.comboTarget = Math.min(2, cfg.maxCombo);
          this.comboCount = 1;
          this.aiState = 'recover';
          this.aiTimer = 0.6;
        } else {
          cmd.heavyAttack = true;
          this.aiState = 'recover';
          this.aiTimer = 1.2;
        }
      } else {
        // === 基础反应（低难度默认 + 高难度未识别时） ===
        const r = Math.random();
        const opponentHeavyRate = this._getPlayerHeavyRate();
        // 对手越少用重击，格挡收益越低（轻击vs格挡=白耗体力）
        const blockBias = Math.max(0.08, opponentHeavyRate * 1.5) * (1.2 - diffScaleR * 0.5);
        const adjustedBlockChance = cfg.reactChance * Math.min(1, blockBias);
        const adjustedDodgeChance = cfg.dodgeChance;

        if (r < adjustedBlockChance) {
          this.aiState = 'defend';
          this.blockDuration = cfg.blockDurBase + Math.random() * 0.4;
          this.aiTimer = this.blockDuration;
        } else if (r < adjustedBlockChance + adjustedDodgeChance && f.stamina >= C.DODGE_COST) {
          const dodgeA = ang + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
          cmd.dodge = true;
          cmd.dodgeAngle = dodgeA;
          this.aiState = 'recover';
          this.aiTimer = 0.4;
        } else {
          // 用霸体硬抗（但如果对手爱用重击就别硬抗）
          const heavyRate = this._getPlayerHeavyRate();
          if (heavyRate > 0.5 && f.stamina >= C.DODGE_COST) {
            const dodgeA = ang + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
            cmd.dodge = true;
            cmd.dodgeAngle = dodgeA;
            this.aiState = 'punish';
            this.aiTimer = 0.15;
          } else {
            cmd.heavyAttack = true;
            this.aiState = 'recover';
            this.aiTimer = 1.2;
          }
        }
      }
      this.thinkCD = cfg.thinkCD;
      return cmd;
    }

    // ===== HTN 计划执行 =====
    if (this._hasPlan() && f.state === 'idle') {
      if (this._executePlan(dt, f, pf, d, ang, cmd)) {
        return cmd;
      }
    }

    // ===== 状态机 =====
    switch (this.aiState) {
      case 'approach': {
        if (d > cfg.approachDist) {
          const fwdX = Math.cos(ang);
          const fwdY = Math.sin(ang);
          // 中距离时添加横向移动（走位感）
          if (d < cfg.approachDist + 80 && this.difficulty >= 2) {
            this._strafeTimer += dt;
            if (this._strafeTimer > 0.6 + Math.random() * 0.4) {
              this._strafeTimer = 0;
              this._strafeDir = -this._strafeDir; // 变换方向
            }
            const perpX = -fwdY * this._strafeDir;
            const perpY = fwdX * this._strafeDir;
            const strafe = 0.4 + (this.difficulty - 1) * 0.1; // D2=0.5, D5=0.8
            cmd.moveX = fwdX * 0.7 + perpX * strafe;
            cmd.moveY = fwdY * 0.7 + perpY * strafe;
          } else {
            cmd.moveX = fwdX;
            cmd.moveY = fwdY;
          }
        } else if (this.thinkCD <= 0) {
          // 到达攻击距离：偶尔进入footsie试探
          if (this.difficulty >= 3 && Math.random() < 0.15) {
            this.aiState = 'footsie';
            this.aiTimer = 0.6 + Math.random() * 0.8;
            this._footsiePhase = 0;
            break;
          }
          // 接近范围内直接发起变招探试（不经_decide，缩短决策链）
          if (cfg.feintChance > 0.15 && f.stamina >= C.FEINT_COST + 1 &&
              this.attackCooldown <= 0 && Math.random() < cfg.feintChance * 0.25) {
            // 直接发起重击变招
            cmd.heavyAttack = true;
            this.aiState = 'feint_wait';
            this.attackCooldown = C.AI_MIN_ATTACK_INTERVAL;
            this._logDecision(this._gameTime, 'feint_probe', 'heavy', { dist: +d.toFixed(0) });
            return cmd;
          }
          this._decide(d);
          this.thinkCD = cfg.thinkCD;
        }
        break;
      }
      case 'attack': {
        if (this.attackCooldown > 0) { this.aiState = 'approach'; break; }
        // 高难度变招：轻击→防御
        if (cfg.feintChance > 0 && Math.random() < cfg.feintChance &&
            f.stamina >= C.FEINT_COST + 1) {
          cmd.lightAttack = true;
          this.aiState = 'feint_wait';
          this.attackCooldown = C.AI_MIN_ATTACK_INTERVAL;
          this._logDecision(this._gameTime, 'feint_init', 'light', {});
          return cmd;
        }
        cmd.lightAttack = true;
        this.comboCount = 1;
        this.aiState = 'recover';
        this.aiTimer = 0.5 + this.comboTarget * 0.3;
        this.attackCooldown = C.AI_MIN_ATTACK_INTERVAL;
        break;
      }
      case 'heavy': {
        if (this.attackCooldown > 0) { this.aiState = 'approach'; break; }
        // 高难度重击变招（概率与轻击持平）
        if (cfg.feintChance > 0 && Math.random() < cfg.feintChance &&
            f.stamina >= C.FEINT_COST + 1) {
          cmd.heavyAttack = true;
          this.aiState = 'feint_wait';
          this.attackCooldown = C.AI_MIN_ATTACK_INTERVAL;
          this._logDecision(this._gameTime, 'feint_init', 'heavy', {});
          return cmd;
        }
        cmd.heavyAttack = true;
        this.aiState = 'recover';
        this.aiTimer = 1.2;
        this.attackCooldown = C.AI_MIN_ATTACK_INTERVAL;
        break;
      }
      case 'defend': {
        cmd.blockHeld = true;
        if (this.aiTimer <= 0) {
          // 防御结束后有概率直接发起变招（防守反击变招）
          if (cfg.feintChance > 0.2 && d < 80 &&
              f.stamina >= C.FEINT_COST + 1 && this.attackCooldown <= 0 &&
              !this._hasPlan() && Math.random() < cfg.feintChance * 0.2) {
            this._createFeintPlan(d);
            this.aiState = 'approach';
            this._logDecision(this._gameTime, 'feint_defend', 'plan', { dist: +d.toFixed(0) });
          } else {
            this.aiState = 'recover';
            this.aiTimer = 0.3;
          }
        }
        break;
      }
      case 'punish': {
        // 闪避后追击反击
        if (this.aiTimer <= 0) {
          if (d < 80) {
            cmd.lightAttack = true;
            this.comboTarget = Math.min(2, cfg.maxCombo);
            this.comboCount = 1;
            this.aiState = 'recover';
            this.aiTimer = 0.5;
          } else {
            // 靠近对手
            cmd.moveX = Math.cos(ang);
            cmd.moveY = Math.sin(ang);
            // 追不到就放弃
            if (this.aiTimer < -0.5) {
              this.aiState = 'approach';
            }
          }
        }
        break;
      }
      case 'feint_wait': {
        // 如果不在攻击startup里，说明错过了，恢复
        this.aiState = 'recover';
        this.aiTimer = 0.3;
        break;
      }
      case 'heavy_read': {
        // 持续观察玩家重击：预判释放/变招
        if (pf.state !== 'heavyAttack') {
          // 玩家取消了重击（变招/闪避等）→ 趁机惩罚
          if (d < 80 && Math.random() < cfg.punishRate) {
            cmd.lightAttack = true;
            this.comboTarget = Math.min(2, cfg.maxCombo);
            this.comboCount = 1;
            this.aiState = 'recover';
            this.aiTimer = 0.5;
            this.attackCooldown = C.AI_MIN_ATTACK_INTERVAL;
          } else {
            this.aiState = 'approach';
          }
        } else if (pf.phase === 'active') {
          // 玩家释放重击！立刻举盾格挡
          cmd.blockHeld = true;
          this.aiState = 'defend';
          this.aiTimer = 0.5;
        } else {
          // 蓄力中：根据蓄力进度决定是否提前举盾（预判即将释放）
          const chargeProgress = pf.phaseTimer / (pf.attackData ? pf.attackData.startup : C.HEAVY_CHARGE);
          const releaseRate = 1 - this._getPlayerHeavyFeintRate();
          // 蓄力接近70%+，且玩家很少变招 → 提前举盾以获得精准格挡
          if (chargeProgress > 0.65 && releaseRate > 0.6) {
            cmd.blockHeld = true;
            this.aiState = 'defend';
            this.aiTimer = 0.6;
          } else if (this.aiTimer <= 0) {
            // 等待超时，默认举盾
            cmd.blockHeld = true;
            this.aiState = 'defend';
            this.aiTimer = 0.4;
          }
        }
        break;
      }
      case 'retreat': {
        // 斜向后退（更自然的走位）
        const backX = -Math.cos(ang);
        const backY = -Math.sin(ang);
        const perpX = -backY * this._strafeDir;
        const perpY = backX * this._strafeDir;
        cmd.moveX = backX * 0.75 + perpX * 0.45;
        cmd.moveY = backY * 0.75 + perpY * 0.45;
        if (this.aiTimer <= 0 || d > 200) {
          this.aiState = 'approach';
        }
        break;
      }
      case 'recover': {
        // 等待恢复
        if (this.aiTimer <= 0) {
          // 恢复后有概率直接发起变招试探（不经_decide，增加变招频率）
          if (cfg.feintChance > 0.25 && d < cfg.approachDist + 10 &&
              f.state === 'idle' && f.stamina >= C.FEINT_COST + 1 &&
              this.attackCooldown <= 0 && !this._hasPlan() &&
              Math.random() < cfg.feintChance * 0.25) {
            this._createFeintPlan(d);
            this._logDecision(this._gameTime, 'feint_recover', 'plan', { dist: +d.toFixed(0) });
          }
          this.aiState = 'approach';
        }
        break;
      }
      case 'footsie': {
        // 攻击边缘进出试探（给对手压力，不实际出招）
        const fwdX = Math.cos(ang);
        const fwdY = Math.sin(ang);
        const perpX = -fwdY * this._strafeDir;
        const perpY = fwdX * this._strafeDir;
        const targetDist = cfg.approachDist;
        if (this._footsiePhase === 0) {
          // 前探：走进攻击范围
          cmd.moveX = fwdX * 0.6 + perpX * 0.3;
          cmd.moveY = fwdY * 0.6 + perpY * 0.3;
          if (d < targetDist - 10) this._footsiePhase = 1;
        } else {
          // 后撤：退出攻击范围
          cmd.moveX = -fwdX * 0.5 + perpX * 0.4;
          cmd.moveY = -fwdY * 0.5 + perpY * 0.4;
          if (d > targetDist + 15) this._footsiePhase = 0;
        }
        // 对手出招则立即反应
        if (pf.state === 'lightAttack' || pf.state === 'heavyAttack') {
          this.aiState = 'approach';
          this.thinkCD = 0;
          break;
        }
        if (this.aiTimer <= 0) {
          this.aiState = 'approach';
          this.thinkCD = 0;
        }
        break;
      }
      default:
        this.aiState = 'approach';
    }

    // 低体力时更保守
    if (f.stamina <= 1 && this.aiState === 'approach' && Math.random() < cfg.retreatWhenLow) {
      this.aiState = 'retreat';
      this.aiTimer = 0.5 + Math.random() * 0.5;
    }

    return cmd;
  }

  _decide(d) {
    const r = Math.random();
    const f = this.fighter;
    const cfg = this._cfg;

    if (f.isExhausted) {
      // 体力空了，尽量防御或后退
      if (r < 0.6) {
        this.aiState = 'defend';
        this.aiTimer = cfg.blockDurBase + Math.random() * 0.5;
      } else {
        this.aiState = 'retreat';
        this.aiTimer = 0.5;
      }
      return;
    }

    // 反重击spam：对手爱用重击时偏向轻击快攻
    const heavyRate = this._getPlayerHeavyRate();
    if (heavyRate > 0.5 && cfg.heavyReactMult > 0.3) {
      if (r < 0.55) {
        this.aiState = 'attack';
        this.comboTarget = Math.min(2, cfg.maxCombo);
        this.comboCount = 0;
      } else if (r < 0.80) {
        this.aiState = 'defend';
        this.aiTimer = cfg.blockDurBase;
      } else {
        this.aiState = 'retreat';
        this.aiTimer = 0.3;
      }
      return;
    }

    if (r < cfg.attackRate) {
      // 主动变招：有概率不直接攻击，而是发起变招计划
      if (cfg.feintChance > 0.1 && f.stamina >= C.FEINT_COST + 1 &&
          Math.random() < cfg.feintChance * 0.7) {
        this._createFeintPlan(d);
        return;
      }
      this.aiState = 'attack';
      this.comboTarget = 1 + Math.floor(Math.random() * cfg.maxCombo);
      this.comboCount = 0;
      this._logDecision(this._gameTime, 'decide', 'attack', { dist: +d.toFixed(0), combo: this.comboTarget });
    } else if (r < cfg.attackRate + cfg.heavyRate) {
      // 重击也可以变招
      if (cfg.feintChance > 0.1 && f.stamina >= C.FEINT_COST + 1 &&
          Math.random() < cfg.feintChance * 0.6) {
        this._createFeintPlan(d);
        return;
      }
      this.aiState = 'heavy';
      this._logDecision(this._gameTime, 'decide', 'heavy', { dist: +d.toFixed(0) });
    } else {
      // 根据对手重击倾向和自身难度决定是否主动防御
      // 低难度AI：本能龟防（不懂防御无意义）；高难度：判断对手风格
      const opponentHeavyRate = this._getPlayerHeavyRate();
      const diffScale = (this.difficulty - 1) / 4; // 0(D1) ~ 1(D5)
      // 低难度有少量防御倾向；高难度只在对手出重击时才防御
      const baseDefendRate = 0.06 * (1 - diffScale); // D1=0.06, D5=0
      const smartDefendRate = Math.min(0.20, opponentHeavyRate * 0.4) * diffScale; // D5看对手重击率
      const defendRate = baseDefendRate + smartDefendRate;
      
      if (Math.random() < defendRate) {
        this.aiState = 'defend';
        this.blockDuration = cfg.blockDurBase + Math.random() * 0.6;
        this.aiTimer = this.blockDuration;
      } else if (Math.random() < 0.65) {
        // 大概率再次进攻（对拼比空防更有价值）
        this.aiState = 'attack';
        this.comboTarget = 1 + Math.floor(Math.random() * cfg.maxCombo);
        this.comboCount = 0;
      } else {
        this.aiState = 'retreat';
        this.aiTimer = 0.3 + Math.random() * 0.5;
      }
    }
  }

  // ===================== HTN 计划系统 =====================

  _initPlan(steps) {
    this._plan = steps;
    this._planIdx = 0;
    this._planTimer = 0;
  }

  _clearPlan() {
    this._plan = [];
    this._planIdx = 0;
  }

  _advancePlan() {
    this._planIdx++;
    this._planTimer = 0;
    if (this._planIdx >= this._plan.length) {
      this._plan = [];
    }
  }

  _hasPlan() {
    return this._plan.length > 0 && this._planIdx < this._plan.length;
  }

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
  }

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
  }

  // --- 格挡成功后计划 ---
  _createParryFollowupPlan(f, pf, d, cfg) {
    const boost = f.parryBoost.mult;

    if (boost <= 0.4) {
      // 精准格挡 → 积极反击
      if (d < 70) {
        const r = Math.random();
        if (r < 0.35 && this.difficulty >= 4) {
          // 加速重击 → 被格挡可形成乒乓
          this._initPlan([{ act: 'heavy', dur: 1.5 }]);
        } else if (r < 0.65) {
          // 加速轻击连击 → 安全伤害
          this._initPlan([{ act: 'light', dur: 1.0, combo: 2 }]);
        } else {
          // 延迟一拍再攻击（出其不意）
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
      // 半精准 → 轻击反击
      if (d < 70) {
        this._initPlan([{ act: 'light', dur: 1.0 }]);
      }
    } else {
      // 非精准 → 保守
      if (Math.random() < 0.5) {
        this._initPlan([
          { act: 'block', dur: 0.25 },
          { act: 'light', dur: 1.0 },
        ]);
      }
    }
  }

  // --- 被弹恢复后计划 ---
  _createRecoveryPlan(f, pf, d, cfg) {
    const r = Math.random();
    if (this.difficulty >= 4 && r < 0.3) {
      // 格挡后立刻反击
      this._initPlan([
        { act: 'block', dur: 0.25 },
        { act: 'light', dur: 1.0 },
      ]);
    } else if (r < 0.6) {
      // 纯防御
      this._initPlan([{ act: 'block', dur: 0.4 + Math.random() * 0.3 }]);
    } else if (r < 0.8) {
      // 闪避撤退
      this._initPlan([{ act: 'dodge', dur: 0.5 }]);
    }
    // else: 回到正常AI
  }

  // --- 拼刀后计划 ---
  _createClashFollowupPlan(f, pf, d, cfg) {
    const r = Math.random();
    if (r < 0.45) {
      // 再次轻击 → 追求连续拼刀节奏
      this._initPlan([{ act: 'light', dur: 0.8 }]);
    } else if (r < 0.70) {
      // 格挡等对手出手
      this._initPlan([{ act: 'block', dur: 0.3 + Math.random() * 0.2 }]);
    } else if (r < 0.85 && this.difficulty >= 3) {
      // 重击压制
      this._initPlan([{ act: 'heavy', dur: 1.5 }]);
    } else {
      // 后闪避开
      this._initPlan([{ act: 'dodge', dur: 0.5, side: Math.PI }]);
    }
  }

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
  }

  // --- 主动变招计划（从_decide进入）---
  _createFeintPlan(d) {
    const cfg = this._cfg;
    const plans = [];

    // 假重击→真轻击连（最经典的变招）
    plans.push([
      { act: 'heavy', dur: 1.5, feint: true },
      { act: 'light', dur: 1.0, combo: 2 },
    ]);

    // 假轻击→真重击
    plans.push([
      { act: 'light', dur: 1.0, feint: true },
      { act: 'heavy', dur: 1.5 },
    ]);

    // 假重击→格挡（等格反）
    plans.push([
      { act: 'heavy', dur: 1.5, feint: true },
      { act: 'block', dur: 0.5 },
    ]);

    if (this.difficulty >= 4) {
      // 双重假动作：假重→假轻→真重
      plans.push([
        { act: 'heavy', dur: 1.5, feint: true },
        { act: 'light', dur: 1.0, feint: true },
        { act: 'heavy', dur: 1.5 },
      ]);

      // 假轻→格挡→轻击（骗反击后格反再打）
      plans.push([
        { act: 'light', dur: 1.0, feint: true },
        { act: 'block', dur: 0.4 },
        { act: 'light', dur: 1.0, combo: 2 },
      ]);
    }

    if (d > 60) {
      // 远距离：接近后变招
      plans.push([
        { act: 'approach', dur: 0.4, dist: 50 },
        { act: 'heavy', dur: 1.5, feint: true },
        { act: 'light', dur: 1.0, combo: 2 },
      ]);
    }

    this._initPlan(plans[Math.floor(Math.random() * plans.length)]);
    this._logDecision(this._gameTime, 'decide', 'feint_plan', {});
  }

  // --- 主动压制计划（高难度）---
  _createPressurePlan(f, pf, d, cfg) {
    if (f.stamina < 2) return;

    const plans = [
      // 轻击连打 → 格挡（安全压制）
      [{ act: 'light', dur: 1.0 }, { act: 'light', dur: 1.0 }, { act: 'block', dur: 0.3 }],
      // 轻击 → 重击（混合节奏）
      [{ act: 'light', dur: 1.0 }, { act: 'heavy', dur: 1.5 }],
      // 重击（高风险高回报）
      [{ act: 'heavy', dur: 1.5 }],
    ];

    // 高难度增加更多策略选项
    if (this.difficulty >= 4 && f.stamina >= 3) {
      // 轻击 → 格挡 → 轻击（试探→防守→反击）
      plans.push([
        { act: 'light', dur: 1.0 },
        { act: 'block', dur: 0.35 },
        { act: 'light', dur: 1.0 },
      ]);
      // 接近 → 重击
      plans.push([
        { act: 'approach', dur: 0.3, dist: 50 },
        { act: 'heavy', dur: 1.5 },
      ]);
    }

    // 变招专用计划（需要足够体力）
    if (this.difficulty >= 3 && f.stamina >= C.FEINT_COST + 2 && cfg.feintChance > 0) {
      // 假重击 → 等一拍 → 真轻击连击
      plans.push([
        { act: 'heavy', dur: 1.5, feint: true },
        { act: 'wait', dur: 0.1 },
        { act: 'light', dur: 1.0, combo: 2 },
      ]);
      // 假轻击 → 真重击
      plans.push([
        { act: 'light', dur: 1.0, feint: true },
        { act: 'wait', dur: 0.08 },
        { act: 'heavy', dur: 1.5 },
      ]);
      if (this.difficulty >= 4) {
        // 假重击 → 假重击 → 真重击（双重假动作）
        plans.push([
          { act: 'heavy', dur: 1.5, feint: true },
          { act: 'heavy', dur: 1.5, feint: true },
          { act: 'heavy', dur: 1.5 },
        ]);
      }
    }

    this._initPlan(plans[Math.floor(Math.random() * plans.length)]);
  }

  // ===================== 智能重击应对（预判系统） =====================
  _reactToHeavy(pf, d, ang, cmd, cfg) {
    const feintRate = this._getPlayerHeavyFeintRate();
    const releaseRate = 1 - feintRate;
    const staminaLow = this.fighter.stamina <= 2;
    const smartness = cfg.heavyReactMult;

    // 核心预判：玩家释放率越高 → AI格挡信心越强，能拿精准格挡
    // 变招率高 → 观察等待，抓变招惩罚

    // 基础策略权重
    let wBlock = 0.15;
    let wRead  = 0.20;
    let wDodge = 0.10;
    let wTrade = 0.10;
    let wHeavy = 0.05;

    // === 基于释放率动态调整 ===
    if (releaseRate > 0.80) {
      // 玩家几乎不变招 → heavy_read等精准格挡时机
      wRead += 0.35;
      wBlock += 0.15;
      wDodge -= 0.05;
      wTrade -= 0.05;
    } else if (releaseRate > 0.55) {
      wBlock += 0.20;
      wRead += 0.15;
    } else {
      // 玩家常变招 → 多等待抓空档
      wRead += 0.30;
      wTrade += 0.10;
      wBlock -= 0.05;
    }

    // 体力低 → 避免闪避，多格挡
    if (staminaLow) {
      wBlock += wDodge * 0.8;
      wDodge *= 0.2;
    }

    // 归一化
    const total = wBlock + wDodge + wRead + wTrade + wHeavy;
    wBlock /= total; wDodge /= total; wRead /= total; wTrade /= total; wHeavy /= total;

    // 难度缩放：smartness=1时100%反应
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
      // 体力不足 → 回退到后续选项
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
  }

  // ===================== 训练模式6：拼刀训练 =====================
  _clashTrainerBehavior(dt, pf, d, ang, cmd) {
    const f = this.fighter;

    // 对手在攻击且近距离 → 防御反应（修复被连续轻击打死的问题）
    if (d < 100 && f.state === 'idle' &&
        (pf.state === 'lightAttack' || pf.state === 'heavyAttack')) {
      if (Math.random() < 0.4 * dt * 60) { // 每帧约40%概率举盾
        cmd.blockHeld = true;
        this.aiState = 'defend';
        this.aiTimer = 0.2 + Math.random() * 0.15;
        return cmd;
      }
    }

    // 简单节奏：接近 → 单次轻击 → 冷却 → 重复
    if (d > 55) {
      cmd.moveX = Math.cos(ang);
      cmd.moveY = Math.sin(ang);
    } else if (this.attackCooldown <= 0 && f.state === 'idle') {
      cmd.lightAttack = true;
      this.attackCooldown = 0.7 + Math.random() * 0.5;
    }
    return cmd;
  }

  // ===================== 训练模式7：格挡乒乓训练 =====================
  _parryTrainerBehavior(dt, pf, d, ang, cmd) {
    const f = this.fighter;

    // 遇到玩家重击/攻击时举盾（给玩家格挡练习的对象）
    const playerThreat = pf.state === 'heavyAttack' ||
      (pf.state === 'lightAttack' && pf.phase !== 'recovery') ||
      (pf.state === 'parryCounter' && pf.phase !== 'recovery');
    if (playerThreat && d < 120 && f.state === 'idle') {
      cmd.blockHeld = true;
      return cmd;
    }

    // 保持防御直到威胁消除
    if (f.state === 'blocking') {
      const stillThreat = pf.state === 'heavyAttack' ||
        (pf.state === 'lightAttack' && pf.phase !== 'recovery');
      if (stillThreat) {
        cmd.blockHeld = true;
        return cmd;
      }
      // 放下盾
      return cmd;
    }

    // 接近并有节奏地攻击
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
  }
}
