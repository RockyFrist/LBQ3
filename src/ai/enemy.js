import { Fighter } from '../combat/fighter.js';
import { dist, angleBetween, randomRange, normalizeAngle } from '../core/utils.js';
import * as C from '../core/constants.js';
import { buildAIConfig } from './ai-config.js';
import { planMethods } from './ai-plans.js';

export class Enemy {
  constructor(x, y, difficulty = 2, { scale = 1, hpMult = 1, color = '#ff4444', name = '敌人' } = {}) {
    this.fighter = new Fighter(x, y, { color, team: 1, name, scale, hpMult });
    this.difficulty = difficulty;
    this.aiState = 'approach';
    this.aiTimer = 0;
    this.thinkCD = 0;
    this.comboTarget = 0;
    this.comboCount = 0;
    this.blockDuration = 0;
    this.blockCooldown = 0;
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
    this._heavyCD = 0;          // 重击专属冷却
    this._staggerReacted = false; // 硬直中是否已做过决策

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
    this._cfg = buildAIConfig(difficulty);
    this.trainingMode = difficulty >= 6 ? difficulty : 0;
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

    // 懒初始化：确保 fighter 上有完美闪避概率（test-runner 可能替换 fighter）
    if (f.perfectDodgeChance === undefined) {
      f.perfectDodgeChance = cfg.perfectDodgeChance ?? 1.0;
    }

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
    if (this.blockCooldown > 0) this.blockCooldown -= dt;
    if (this._heavyCD > 0) this._heavyCD -= dt;
    this._trackPlayer(pf);

    // 硬直决策保护：离开硬直状态后重置标志
    if (f.state !== 'staggered') this._staggerReacted = false;

    // HTN 计划管理
    if (this._hasPlan() && (f.state === 'staggered' || f.state === 'executed' || !f.alive)) {
      this._clearPlan();
    }

    // 二次博弈：格挡相关状态转换后重置AI决策，避免旧定时器阻止行动
    const justExitedParryStunned = this._prevFighterState === 'parryStunned' && f.state !== 'parryStunned';
    const hasParryBoost = f.parryBoost && f.parryBoost.timer > 0;
    if (justExitedParryStunned) {
      // AI攻击被格挡后恢复：清除recover定时器，允许立即行动
      // 设置blockCooldown防止立刻再举盾
      this.aiState = 'approach';
      this.aiTimer = 0;
      this.attackCooldown = 0;
      this.thinkCD = 0;
      this.blockCooldown = 1.0;
    }
    if (hasParryBoost && !this._wasParryBoosted && f.state === 'idle') {
      // AI成功格挡获得parryBoost → 立即切换到进攻模式利用增益
      this.aiState = 'approach';
      this.aiTimer = 0;
      this.attackCooldown = 0;
      this.thinkCD = 0;
    }

    // 被击后防御意识：出硬直后短暂观望，打破AI互相交替砍的循环
    // 高难度AI更善于打破"你打我两下我打你两下"的死循环
    const justExitedStagger = this._prevFighterState === 'staggered' && f.state === 'idle';
    if (justExitedStagger && d < 100) {
      // D1=15% D2=30% D3=45% D4=60% D5=75%
      const cautionChance = 0.15 + (this.difficulty - 1) / 4 * 0.60;
      if (Math.random() < cautionChance) {
        const roll = Math.random();
        if (roll < 0.45) {
          // 后退拉开距离
          this.aiState = 'retreat';
          this.aiTimer = 0.2 + Math.random() * 0.3;
        } else if (roll < 0.75 && f.stamina >= C.DODGE_COST) {
          // 侧闪脱离
          cmd.dodge = true;
          cmd.dodgeAngle = ang + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
          this.aiState = 'recover';
          this.aiTimer = 0.4;
        } else if (roll < 0.90) {
          // 霸体重击交换（打断对手节奏）— 冷却中转轻击
          if (this._heavyCD > 0) {
            cmd.lightAttack = true;
            this.comboTarget = 1;
            this.comboCount = 1;
            this.aiState = 'recover';
            this.aiTimer = 0.5;
          } else {
            cmd.heavyAttack = true;
            this.aiState = 'recover';
            this.aiTimer = 1.0;
            this._heavyCD = cfg.heavyCooldown || 0;
          }
        } else {
          // 轻击抢拼刀（可能触发拼刀打断循环）
          cmd.lightAttack = true;
          this.comboTarget = 1;
          this.comboCount = 1;
          this.aiState = 'recover';
          this.aiTimer = 0.5;
        }
        this.attackCooldown = 0.15;
      }
    }

    this._prevFighterState = f.state;

    // _checkPlanTriggers 需要旧的 _wasParryBoosted 值来检测首次获得 parryBoost
    this._checkPlanTriggers(f, pf, d, cfg);

    // 在 _checkPlanTriggers 之后才更新 _wasParryBoosted（否则计划触发条件永远为 false）
    this._wasParryBoosted = f.parryBoost && f.parryBoost.timer > 0;
    // 低难度AI完全承诺，高难度AI有机会取消（快速反射）
    const isAttacking = this.aiState === 'attack' || this.aiState === 'heavy' ||
      (f.state === 'lightAttack' && f.phase === 'startup') ||
      (f.state === 'heavyAttack' && f.phase === 'startup');
    const wasAttacking = this._wasAttacking || false;
    if (isAttacking && !wasAttacking) {
      // 刚进入攻击状态，一次性投掷承诺
      // 二次方缩放：高难度AI更多读招机会 D1=0% D3=14% D4=31% D5=55%
      const diffScale = (this.difficulty - 1) / 4;
      const commitBreakChance = diffScale * diffScale * 0.55;
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
        // 变招→格挡只在对手正在蓄力重击时才有格反收益
        const blockWorth = pf.state === 'heavyAttack' && pf.phase === 'startup';
        if (f.attackType === 'light') {
          if (blockWorth) {
            // 轻击→防御（对手正在蓄重击，等格反）
            cmd.blockHeld = true;
            this.aiState = 'defend';
            this.aiTimer = 0.3 + Math.random() * 0.15;
            this._logDecision(this._gameTime, 'feint_exec', 'light_to_block', {});
          } else {
            // 轻击→重击（对手不爱出重击，格挡无收益，改为攻击型变招）
            cmd.heavyAttack = true;
            this.aiState = 'recover';
            this.aiTimer = 0.5;
            this._logDecision(this._gameTime, 'feint_exec', 'light_to_heavy', {});
          }
        } else if (f.attackType === 'heavy') {
          // 重击变招：根据对手风格选策略
          const r = Math.random();
          const blockChance = blockWorth ? 0.40 : 0;
          if (r >= blockChance) {
            // 重击→轻击（最常见，快速打出）
            cmd.lightAttack = true;
            this.aiState = 'recover';
            this.aiTimer = 0.3;
            this._logDecision(this._gameTime, 'feint_exec', 'heavy_to_light', {});
          } else {
            // 重击→格挡（对手爱出重击时等格反）
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
            // 对手在格挡，轻击变重击（重击vs格挡=格反机会）
            cmd.heavyAttack = true;
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

      // 硬直中二次博弈：拼刀/被击后的猜拳决策（每次硬直只决策一次）
      if (f.state === 'staggered' && d < 100 && !this._staggerReacted) {
        // 区分轻击和重击/格反（排除已结束的recovery阶段）
        const incomingLight = pf.state === 'lightAttack' && pf.phase !== 'recovery';
        const incomingHeavy = pf.state === 'heavyAttack' ||
          (pf.state === 'parryCounter' && pf.phase !== 'recovery');

        if (incomingHeavy && Math.random() < cfg.reactChance && this.blockCooldown <= 0) {
          // 重击/格反来袭 → 格挡有收益（格反机会）
          cmd.blockHeld = true;
          this.aiState = 'defend';
          this.aiTimer = 0.25 + Math.random() * 0.15;
          this._staggerReacted = true;
          this._logDecision(this._gameTime, 'stagger_react', 'block', { dist: +d.toFixed(0), opState: pf.state, opPhase: pf.phase });
        } else if (incomingLight) {
          // 轻击来袭 → 闪避或霸体交换
          const diffScaleD = (this.difficulty - 1) / 4;
          if (Math.random() < cfg.dodgeChance * 1.5 && f.stamina >= C.DODGE_COST) {
            cmd.dodge = true;
            cmd.dodgeAngle = ang + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
            this.aiState = 'recover';
            this.aiTimer = 0.4;
            this._staggerReacted = true;
            this._logDecision(this._gameTime, 'stagger_react', 'dodge', { dist: +d.toFixed(0), opState: pf.state });
          } else if (this._heavyCD <= 0 && Math.random() < diffScaleD * 0.5) {
            // 高难度：霸体重击交换（吸收轻击，重击反打）— 冷却中不触发
            cmd.heavyAttack = true;
            this.aiState = 'recover';
            this.aiTimer = 1.2;
            this._staggerReacted = true;
            this._heavyCD = cfg.heavyCooldown || 0;
            this._logDecision(this._gameTime, 'stagger_react', 'heavy_trade', { dist: +d.toFixed(0) });
          }
          // else: 接受命中后自然恢复（不白白浪费体力举盾）
        } else if (!incomingLight && !incomingHeavy && f.stateTimer > f.staggerDuration * 0.4) {
          // 对手还没出招 → 主动博弈
          const diffScaleG = (this.difficulty - 1) / 4;
          const guessChance = diffScaleG * 0.65; // D3=0.33 D4=0.49 D5=0.65
          if (Math.random() < guessChance) {
            const guess = Math.random();
            const opHeavyRateG = this._getPlayerHeavyRate();
            // 低难度偏重击（笨），高难度偏轻击（快速精准）
            const heavyGuessThresh = 0.60 - diffScaleG * 0.30; // D3=0.45 D5=0.30
            if (guess < heavyGuessThresh && this._heavyCD <= 0) {
              cmd.heavyAttack = true;
              this.aiState = 'recover';
              this.aiTimer = 1.2;
              this._staggerReacted = true;
              this._heavyCD = cfg.heavyCooldown || 0;
              this._logDecision(this._gameTime, 'stagger_guess', 'heavy', { dist: +d.toFixed(0), opState: pf.state });
            } else {
              cmd.lightAttack = true;
              this.comboTarget = Math.min(2, cfg.maxCombo);
              this.comboCount = 1;
              this.aiState = 'recover';
              this.aiTimer = 0.6;
              this._staggerReacted = true;
              this._logDecision(this._gameTime, 'stagger_guess', 'light', { dist: +d.toFixed(0), opState: pf.state });
            }
          }
        }
      }

      // 轻击连击衔接
      if (f.state === 'lightAttack' && f.phase === 'recovery' && this.comboCount < this.comboTarget) {
        // 连击途中有概率变招（中断combo→重击或格挡）
        if (cfg.feintChance > 0.15 && this.comboCount >= 1 &&
            f.stamina >= C.FEINT_COST + 1 && Math.random() < cfg.feintChance * 0.3) {
          const opHeavyRate = this._getPlayerHeavyRate();
          // 格挡只在对手爱出重击时有意义（格反收益），否则切重击
          if (opHeavyRate > 0.25 && Math.random() < 0.35) {
            cmd.blockHeld = true; // 轻击→格挡（等对手重击后格反）
          } else {
            cmd.heavyAttack = true; // 轻击→重击（节奏变化）
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

    // 格挡被弹状态：不举盾（被弹后应优先反击，格挡由恢复后决策处理）
    if (f.state === 'parryStunned') {
      return cmd;
    }

    // ===== 防御状态维持（所有模式通用，确保训练模式也能格挡） =====
    if (f.state === 'blocking' && this.aiState === 'defend') {
      // 被命中后缩短格挡时间（不管对手当前状态，被打就赶紧松手）
      if (f.blockHitCount > 0) {
        this.aiTimer = Math.min(this.aiTimer, 0.05);
      }
      cmd.blockHeld = true;
      if (this.aiTimer <= 0) {
        this.aiState = 'recover';
        this.aiTimer = 0.10;
        this.attackCooldown = 0;
        this.blockCooldown = cfg.blockCooldownBase || 5.0; // 格挡结束后冷却防止频繁举盾
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
        pf.stateTimer >= (cfg.heavyReactDelay || 0) &&
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
        if (Math.random() < cfg.reactChance && this.blockCooldown <= 0) {
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
        // === 识别轻击 → 反击/闪避（体力低时少量格挡） ===
        const stmLowL = f.stamina <= 2;
        if (stmLowL && this.blockCooldown <= 0 && Math.random() < 0.20) {
          // 体力低时少量格挡（闪避太贵）
          this.aiState = 'defend';
          this.blockDuration = cfg.blockDurBase * 0.5 + Math.random() * 0.2;
          this.aiTimer = this.blockDuration;
        } else if (d < 70 && Math.random() < 0.55) {
          cmd.lightAttack = true;
          this.comboTarget = Math.min(2, cfg.maxCombo);
          this.comboCount = 1;
          this.aiState = 'recover';
          this.aiTimer = 0.6;
        } else if (f.stamina >= C.DODGE_COST && Math.random() < 0.5) {
          const dodgeA = ang + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
          cmd.dodge = true;
          cmd.dodgeAngle = dodgeA;
          this.aiState = 'recover';
          this.aiTimer = 0.4;
        } else {
          cmd.heavyAttack = true;
          this.aiState = 'recover';
          this.aiTimer = 1.2;
        }
      } else {
        // === 基础反应（低难度默认 + 高难度未识别时） ===
        // 不确定攻击类型时：只在有可能是重击时才格挡
        const r = Math.random();
        const opponentHeavyRate = this._getPlayerHeavyRate();
        // 只有对手重击率较高时才考虑格挡（否则大概率是轻击，格挡无意义）
        const adjustedBlockChance = cfg.blockChance + (opponentHeavyRate > 0.20 ? cfg.reactChance * opponentHeavyRate * 0.5 : 0);
        const adjustedDodgeChance = cfg.dodgeChance;

        if (r < adjustedBlockChance && this.blockCooldown <= 0) {
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
            // 低难度变向慢（可预测），高难度变向快
            const strafePeriod = 1.2 - (this.difficulty - 1) * 0.15; // D2=1.05 D5=0.60
            if (this._strafeTimer > strafePeriod + Math.random() * 0.3) {
              this._strafeTimer = 0;
              this._strafeDir = -this._strafeDir;
            }
            const perpX = -fwdY * this._strafeDir;
            const perpY = fwdX * this._strafeDir;
            const strafe = 0.4 + (this.difficulty - 1) * 0.1; // D2=0.5, D5=0.8
            const fwd = 0.9 - (this.difficulty - 1) * 0.05; // D2=0.85(直冲) D5=0.70(斜切)
            cmd.moveX = fwdX * fwd + perpX * strafe;
            cmd.moveY = fwdY * fwd + perpY * strafe;
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
        // 重击冷却中 → 转为轻击（防止低难度AI无限重击）
        if (this._heavyCD > 0) {
          cmd.lightAttack = true;
          this.comboTarget = 1;
          this.comboCount = 1;
          this.aiState = 'recover';
          this.aiTimer = 0.5;
          this.attackCooldown = C.AI_MIN_ATTACK_INTERVAL;
          break;
        }
        // 高难度重击变招（概率与轻击持平）
        if (cfg.feintChance > 0 && Math.random() < cfg.feintChance &&
            f.stamina >= C.FEINT_COST + 1) {
          cmd.heavyAttack = true;
          this.aiState = 'feint_wait';
          this.attackCooldown = C.AI_MIN_ATTACK_INTERVAL;
          this._heavyCD = cfg.heavyCooldown || 0;
          this._logDecision(this._gameTime, 'feint_init', 'heavy', {});
          return cmd;
        }
        cmd.heavyAttack = true;
        this.aiState = 'recover';
        this.aiTimer = 1.2;
        this.attackCooldown = C.AI_MIN_ATTACK_INTERVAL;
        this._heavyCD = cfg.heavyCooldown || 0;
        break;
      }
      case 'defend': {
        cmd.blockHeld = true;
        if (this.aiTimer <= 0) {
          this.blockCooldown = cfg.blockCooldownBase || 5.0; // 格挡结束后冷却防止频繁举盾
          // 防御结束后：近距离优先反击，远距离回到接近
          if (d < 80 && this.attackCooldown <= 0) {
            if (cfg.feintChance > 0.2 && f.stamina >= C.FEINT_COST + 1 &&
                !this._hasPlan() && Math.random() < cfg.feintChance * 0.3) {
              this._createFeintPlan(d);
              this.aiState = 'approach';
              this._logDecision(this._gameTime, 'feint_defend', 'plan', { dist: +d.toFixed(0) });
            } else {
              // 直接反击而非进入recover等待
              cmd.lightAttack = true;
              this.comboTarget = Math.min(2, cfg.maxCombo);
              this.comboCount = 1;
              this.aiState = 'recover';
              this.aiTimer = 0.5;
              this.attackCooldown = C.AI_MIN_ATTACK_INTERVAL;
            }
          } else {
            this.aiState = 'approach';
            this.aiTimer = 0;
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
          // 玩家释放重击！根据难度混合应对
          const rr = Math.random();
          const diffReadScale = (this.difficulty - 1) / 4; // 0~1
          const blockRate = 0.30 + diffReadScale * 0.35; // D1=30%, D5=65%
          if (rr < blockRate && this.blockCooldown <= 0) {
            cmd.blockHeld = true;
            this.aiState = 'defend';
            this.aiTimer = 0.5;
          } else if (rr < blockRate + 0.25 && f.stamina >= C.DODGE_COST) {
            cmd.dodge = true;
            cmd.dodgeAngle = ang + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
            this.aiState = 'recover';
            this.aiTimer = 0.4;
          } else {
            // 硬吃/交换 — 用霸体重击交换（冷却中转轻击）
            if (this._heavyCD > 0) {
              cmd.lightAttack = true;
              this.comboTarget = 1;
              this.comboCount = 1;
              this.aiState = 'recover';
              this.aiTimer = 0.5;
            } else {
              cmd.heavyAttack = true;
              this.aiState = 'recover';
              this.aiTimer = 1.2;
              this._heavyCD = cfg.heavyCooldown || 0;
            }
          }
        } else {
          // 蓄力中 → 等待释放，不提前举盾
          if (this.aiTimer <= 0) {
            // 等待超时 → 回到接近（对手可能一直蓄力不放）
            this.aiState = 'approach';
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
      case 'dodge_away': {
        // 体力耗尽时闪避脱离
        if (f.state === 'idle' && f.stamina >= C.DODGE_COST) {
          cmd.dodge = true;
          cmd.dodgeAngle = ang + Math.PI; // 向后闪避
        }
        this.aiState = 'retreat';
        this.aiTimer = 0.6 + Math.random() * 0.4;
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
        const footsieStrafe = 0.15 + (this.difficulty - 1) * 0.06; // D3=0.27 D5=0.39
        if (this._footsiePhase === 0) {
          // 前探：走进攻击范围
          cmd.moveX = fwdX * 0.6 + perpX * footsieStrafe;
          cmd.moveY = fwdY * 0.6 + perpY * footsieStrafe;
          if (d < targetDist - 10) this._footsiePhase = 1;
        } else {
          // 后撤：退出攻击范围
          cmd.moveX = -fwdX * 0.5 + perpX * footsieStrafe;
          cmd.moveY = -fwdY * 0.5 + perpY * footsieStrafe;
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
      // 体力空了：优先撤退拉距等回复，格挡会暂停回复所以尽量少用
      if (d < 70 && f.stamina >= C.DODGE_COST && r < 0.3) {
        // 近身且还够闪避体力：闪避脱离
        this.aiState = 'dodge_away';
        return;
      }
      if (r < 0.75) {
        // 大概率后撤拉距
        this.aiState = 'retreat';
        this.aiTimer = 0.8 + Math.random() * 0.7;
      } else {
        // 远距离等回复
        this.aiState = 'retreat';
        this.aiTimer = 0.6 + Math.random() * 0.4;
      }
      return;
    }

    // 反重击spam：对手爱用重击时偏向轻击快攻（不主动举盾，靠reactToHeavy处理）
    const heavyRate = this._getPlayerHeavyRate();
    if (heavyRate > 0.5 && cfg.heavyReactMult > 0.3) {
      if (r < 0.70) {
        this.aiState = 'attack';
        this.comboTarget = Math.min(2, cfg.maxCombo);
        this.comboCount = 0;
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
      // 不主动举盾（格挡由reactToHeavy和重击识别处理）
      if (Math.random() < 0.65) {
        // 大概率再次进攻
        this.aiState = 'attack';
        this.comboTarget = 1 + Math.floor(Math.random() * cfg.maxCombo);
        this.comboCount = 0;
      } else {
        this.aiState = 'retreat';
        this.aiTimer = 0.3 + Math.random() * 0.5;
      }
    }
  }

  // HTN 计划系统和重击应对、训练模式行为 → 见 ai-plans.js (mixin)
}

// 将计划系统方法混入 Enemy 原型
Object.assign(Enemy.prototype, planMethods);
