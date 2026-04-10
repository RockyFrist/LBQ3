import * as C from '../core/constants.js';
import { dist, angleBetween, isInArc, normalizeAngle } from '../core/utils.js';

export class CombatSystem {
  constructor(particles, camera) {
    this.particles = particles;
    this.camera = camera;
    this.events = []; // 战斗事件日志（用于 UI 显示）
  }

  resolve(fighters, gameTime, dt) {
    this.events = [];
    // 处理所有两两配对
    for (let i = 0; i < fighters.length; i++) {
      for (let j = i + 1; j < fighters.length; j++) {
        const a = fighters[i], b = fighters[j];
        if (a.team === b.team) continue;
        if (!a.alive || !b.alive) continue;
        this._resolvePair(a, b, gameTime);
      }
    }
    // 攻击吸附
    for (const f of fighters) {
      if (f.phase === 'startup' && f.attackData) {
        this._applyMagnet(f, fighters, dt);
      }
    }
  }

  _resolvePair(a, b, gameTime) {
    // —— 武器碰撞检测（模拟3D刀剑碰撞）——
    // 双方都在挥刀中（startup后半+active）且距离足够近且面向对方
    const aSwing = a.isSwinging() && !a.hasHit.has(b);
    const bSwing = b.isSwinging() && !b.hasHit.has(a);
    if (aSwing && bSwing) {
      const d = dist(a, b);
      if (d < C.CLASH_DETECT_RANGE) {
        const aType = a.getSwingType();
        const bType = b.getSwingType();
        if (aType && bType) {
          const aFacesB = Math.abs(normalizeAngle(angleBetween(a, b) - a.facing)) < Math.PI / 2;
          const bFacesA = Math.abs(normalizeAngle(angleBetween(b, a) - b.facing)) < Math.PI / 2;
          if (aFacesB && bFacesA) {
            this._resolveClash(a, b,
              { type: aType, ...a.attackData },
              { type: bType, ...b.attackData }
            );
            return;
          }
        }
      }
    }

    // —— 正常攻击命中检测 ——
    const aAtk = a.isAttackActive() && !a.hasHit.has(b);
    const bAtk = b.isAttackActive() && !b.hasHit.has(a);

    const aInfo = aAtk ? a.getAttackInfo() : null;
    const bInfo = bAtk ? b.getAttackInfo() : null;

    const aHitsB = aInfo && isInArc(a.x, a.y, a.facing, b.x, b.y, b.radius, aInfo.range, aInfo.arc);
    const bHitsA = bInfo && isInArc(b.x, b.y, b.facing, a.x, a.y, a.radius, bInfo.range, bInfo.arc);

    if (aHitsB && bHitsA) {
      this._resolveClash(a, b, aInfo, bInfo);
    } else if (aHitsB) {
      this._resolveAttack(a, b, aInfo, gameTime);
    } else if (bHitsA) {
      this._resolveAttack(b, a, bInfo, gameTime);
    }
  }

  // ===================== 攻击命中 =====================
  _resolveAttack(attacker, target, atkInfo, gameTime) {
    attacker.hasHit.add(target);
    const ang = angleBetween(attacker, target);
    const midX = (attacker.x + target.x) / 2;
    const midY = (attacker.y + target.y) / 2;

    // 目标无敌（闪避 i-frame）
    if (target.isInvulnerable()) {
      // 完美闪避检测
      if (target.state === 'dodging' && target.stateTimer < C.PERFECT_DODGE_WINDOW) {
        target.perfectDodged = true;
        this.particles.sparks(midX, midY, ang + Math.PI, 6);
        this.events.push({ type: 'perfectDodge', target });
      }
      return;
    }

    // 目标在招架
    if (target.isBlocking()) {
      // 检查目标面朝攻击者（±90°）
      const faceDiff = Math.abs(normalizeAngle(angleBetween(target, attacker) - target.facing));
      if (faceDiff > Math.PI / 2) {
        // 背后攻击，招架无效
        this._applyHit(attacker, target, atkInfo, ang);
        return;
      }

      if (atkInfo.type === 'light') {
        this._resolveLightVsBlock(attacker, target, atkInfo, ang, midX, midY);
      } else {
        this._resolveHeavyVsBlock(attacker, target, atkInfo, ang, midX, midY, gameTime);
      }
      return;
    }

    // 目标有霸体但攻击者是轻击
    if (target.hasHyperArmor() && atkInfo.type === 'light') {
      // 轻击被霸体无视
      this.particles.blockSpark(midX, midY, ang, 3);
      return;
    }

    // 目标可被处决
    if (target.canBeExecuted()) {
      this._resolveExecution(attacker, target);
      return;
    }

    // 正常命中
    this._applyHit(attacker, target, atkInfo, ang);
  }

  _applyHit(attacker, target, atkInfo, ang) {
    target.takeDamage(atkInfo.damage);
    target.setState('staggered', { duration: C.HIT_STAGGER });
    const kb = atkInfo.type === 'heavy' ? C.HEAVY_HIT_KNOCKBACK : C.HIT_KNOCKBACK;
    target.applyKnockback(ang, kb);
    target.flash('#fff', 0.1);

    const midX = (attacker.x + target.x) / 2;
    const midY = (attacker.y + target.y) / 2;
    this.particles.blood(midX, midY, ang, atkInfo.type === 'heavy' ? 10 : 5);
    this.camera.shake(
      atkInfo.type === 'heavy' ? C.SHAKE_HEAVY : C.SHAKE_LIGHT,
      C.SHAKE_DURATION
    );
    this.events.push({ type: 'hit', attacker, target, damage: atkInfo.damage, atkType: atkInfo.type });
  }

  // ===================== 轻击 vs 招架 =====================
  _resolveLightVsBlock(attacker, target, atkInfo, ang, mx, my) {
    target.blockHitCount++;
    target.drainStamina(C.LIGHT_VS_BLOCK_STAMINA);
    this.particles.blockSpark(mx, my, ang, 5);
    this.camera.shake(C.SHAKE_LIGHT * 0.5, C.SHAKE_DURATION);

    if (target.blockHitCount >= C.LIGHT_BREAK_HIT) {
      // 第3下破防
      target.setState('staggered', { duration: C.BLOCK_BREAK_STUN });
      target.flash('#ffaa00', 0.15);
      this.events.push({ type: 'blockBreak', attacker, target });
    } else {
      this.events.push({ type: 'blocked', attacker, target, hitCount: target.blockHitCount });
    }
  }

  // ===================== 重击/反击 vs 招架（格挡） =====================
  _resolveHeavyVsBlock(attacker, target, atkInfo, ang, mx, my, gameTime) {
    const timeSinceBlock = gameTime - target.blockStartTime;
    let parryLevel;
    if (timeSinceBlock <= C.PRECISE_PARRY_WINDOW) {
      parryLevel = 'precise';
    } else if (timeSinceBlock <= C.SEMI_PARRY_WINDOW) {
      parryLevel = 'semi';
    } else {
      parryLevel = 'nonPrecise';
    }

    const result = C.PARRY_RESULTS[parryLevel];

    // 扣攻击方体力
    attacker.drainStamina(result.enemyDrain);
    // 扣招架方体力（非精准格挡）
    if (result.selfCost > 0) {
      target.drainStamina(result.selfCost);
    }

    // 攻击方进入格挡被弹状态（可招架但不可闪避/移动）
    attacker.setState('parryStunned', { duration: result.parryStagger });
    attacker.applyKnockback(ang + Math.PI, result.parryKnockback);

    // 招架方向攻击方步进靠近（只狼识破前冲效果，确保反击不会打空）
    const pullDist = parryLevel === 'precise' ? C.PARRY_PULL_PRECISE
      : parryLevel === 'semi' ? C.PARRY_PULL_SEMI : C.PARRY_PULL_NONPRECISE;
    if (pullDist > 0) {
      target.x += Math.cos(ang) * pullDist;
      target.y += Math.sin(ang) * pullDist;
    }

    // 招架方回到idle（手动选择后续行动，形成二次博弈）
    target.parryChainCount = 0;
    target.setState('idle');

    // 特效
    const sparkCount = parryLevel === 'precise' ? 15 : parryLevel === 'semi' ? 10 : 6;
    this.particles.sparks(mx, my, ang + Math.PI, sparkCount);
    this.camera.shake(C.SHAKE_HEAVY, C.SHAKE_DURATION);

    if (parryLevel === 'precise') {
      target.flash('#ffff00', 0.2);
    } else {
      target.flash('#88ccff', 0.15);
    }

    this.events.push({ type: 'parry', attacker, target, level: parryLevel });
  }

  // ===================== 拼刀 / 弹刀 =====================
  _resolveClash(a, b, aInfo, bInfo) {
    a.hasHit.add(b);
    b.hasHit.add(a);
    const ang = angleBetween(a, b);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;

    // 轻击 vs 重击 → 重击赢（仅当重击已进入active阶段）
    if (aInfo.type === 'light' && bInfo.type === 'heavy') {
      if (b.phase === 'active') {
        this._applyHit(b, a, bInfo, ang + Math.PI);
      } else {
        // 重击还在蓄力中，霸体吸收轻击，不造成伤害
        b.hasHit.delete(a); // 重击仍在蓄力，允许active阶段再次命中
        this.particles.blockSpark(mx, my, ang, 3);
        a.setState('staggered', { duration: C.CLASH_STAGGER });
        a.applyKnockback(ang + Math.PI, C.CLASH_PUSHBACK);
        this.events.push({ type: 'hyperAbsorb', a: b, b: a });
      }
      return;
    }
    if (aInfo.type === 'heavy' && bInfo.type === 'light') {
      if (a.phase === 'active') {
        this._applyHit(a, b, aInfo, ang);
      } else {
        // 重击还在蓄力中，霸体吸收轻击，不造成伤害
        a.hasHit.delete(b); // 重击仍在蓄力，允许active阶段再次命中
        this.particles.blockSpark(mx, my, ang, 3);
        b.setState('staggered', { duration: C.CLASH_STAGGER });
        b.applyKnockback(ang, C.CLASH_PUSHBACK);
        this.events.push({ type: 'hyperAbsorb', a, b });
      }
      return;
    }

    // 同类型拼刀
    if (aInfo.type === 'heavy' && bInfo.type === 'heavy') {
      // 弹刀
      a.drainStamina(C.HEAVY_CLASH_STAMINA);
      b.drainStamina(C.HEAVY_CLASH_STAMINA);
      a.setState('staggered', { duration: C.HEAVY_CLASH_STAGGER });
      b.setState('staggered', { duration: C.HEAVY_CLASH_STAGGER });
      a.applyKnockback(ang + Math.PI, C.HEAVY_CLASH_PUSHBACK);
      b.applyKnockback(ang, C.HEAVY_CLASH_PUSHBACK);
      this.particles.clash(mx, my, 16);
      this.camera.shake(C.SHAKE_CLASH, C.SHAKE_DURATION * 1.5);
      this.events.push({ type: 'heavyClash', a, b });
    } else {
      // 轻击拼刀
      a.setState('staggered', { duration: C.CLASH_STAGGER });
      b.setState('staggered', { duration: C.CLASH_STAGGER });
      a.applyKnockback(ang + Math.PI, C.CLASH_PUSHBACK);
      b.applyKnockback(ang, C.CLASH_PUSHBACK);
      this.particles.clash(mx, my, 10);
      this.camera.shake(C.SHAKE_CLASH * 0.7, C.SHAKE_DURATION);
      this.events.push({ type: 'lightClash', a, b });
    }
  }

  // ===================== 处决 =====================
  _resolveExecution(attacker, target) {
    const dmg = Math.floor(target.maxHp * C.EXECUTION_DAMAGE_PCT);
    target.takeDamage(dmg);
    target.setState('executed');
    attacker.setState('executing', { target });

    this.particles.execution(target.x, target.y, 25);
    this.camera.shake(C.SHAKE_EXECUTION, C.SHAKE_DURATION * 2);
    this.events.push({ type: 'execution', attacker, target, damage: dmg });
  }

  // ===================== 攻击吸附 =====================
  _applyMagnet(fighter, allFighters, dt) {
    for (const other of allFighters) {
      if (other === fighter || other.team === fighter.team || !other.alive) continue;
      const d = dist(fighter, other);
      if (d > C.ATTACK_MAGNET_RANGE || d < 5) continue;
      const ang = angleBetween(fighter, other);
      const diff = Math.abs(normalizeAngle(ang - fighter.facing));
      if (diff < C.ATTACK_MAGNET_ANGLE) {
        const pull = C.ATTACK_MAGNET_PULL * (1 - d / C.ATTACK_MAGNET_RANGE);
        fighter.x += Math.cos(ang) * pull * dt;
        fighter.y += Math.sin(ang) * pull * dt;
      }
    }
  }
}
