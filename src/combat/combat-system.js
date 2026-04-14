import * as C from '../core/constants.js';
import { dist, angleBetween, isInArc, normalizeAngle } from '../core/utils.js';
import { applyArmorReduction } from '../weapons/armor-defs.js';

export class CombatSystem {
  constructor(particles, camera) {
    this.particles = particles;
    this.camera = camera;
    this.playerFighter = null; // 由 Game 设置，用于判断是否触发镜头震动
    this.events = []; // 战斗事件日志（用于 UI 显示）
  }

  /** 仅在玩家参与战斗时触发镜头震动 */
  _shakeIfPlayer(a, b, intensity, duration) {
    const pf = this.playerFighter;
    if (pf && pf.alive && a !== pf && b !== pf) return;
    this.camera.shake(intensity, duration);
  }

  resolve(fighters, gameTime, dt) {
    this.events = [];

    // 清理绝技锁定：攻击者不再处于active阶段时解锁所有被锁目标
    for (const f of fighters) {
      if (f.ultimateLocked && (!f.ultimateLocked.alive ||
          f.ultimateLocked.state !== 'ultimate' || f.ultimateLocked.phase !== 'active')) {
        f.ultimateLocked = null;
      }
    }

    // 绝刀相撞：双方都在绝技active且面向对方时触发特殊弹刀
    for (let i = 0; i < fighters.length; i++) {
      for (let j = i + 1; j < fighters.length; j++) {
        const a = fighters[i], b = fighters[j];
        if (a.team === b.team) continue;
        if (a.state !== 'ultimate' || a.phase !== 'active') continue;
        if (b.state !== 'ultimate' || b.phase !== 'active') continue;
        // 双方必须面向对方
        const angAB = angleBetween(a, b);
        const angBA = angleBetween(b, a);
        if (Math.abs(normalizeAngle(angAB - a.facing)) > Math.PI / 2) continue;
        if (Math.abs(normalizeAngle(angBA - b.facing)) > Math.PI / 2) continue;
        const d = dist(a, b);
        if (d > C.ULTIMATE_RANGE * 1.2) continue;
        // 触发绝刀相撞
        a.setState('staggered', { duration: C.ULTIMATE_CLASH_STAGGER });
        b.setState('staggered', { duration: C.ULTIMATE_CLASH_STAGGER });
        a.applyKnockback(angAB + Math.PI, C.ULTIMATE_CLASH_PUSHBACK);
        b.applyKnockback(angBA + Math.PI, C.ULTIMATE_CLASH_PUSHBACK);
        // 双方返还50%炁（与被打断同等惩罚）
        a.qi = Math.floor(a.qiMax * (1 - C.QI_INTERRUPT_COST));
        b.qi = Math.floor(b.qiMax * (1 - C.QI_INTERRUPT_COST));
        a.ultimateLocked = null;
        b.ultimateLocked = null;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        this.particles.clash(mx, my, 25);
        this._shakeIfPlayer(a, b, C.SHAKE_EXECUTION, C.SHAKE_DURATION * 2);
        this.events.push({ type: 'ultimateClash', a, b });
        // 清除被这两人锁定的目标
        for (const f of fighters) {
          if (f.ultimateLocked === a || f.ultimateLocked === b) f.ultimateLocked = null;
        }
      }
    }

    // 拔刀绝技多段判定（前方扇形连斩）
    for (const f of fighters) {
      if (f.state === 'ultimate' && f.attackData &&
          (f.phase === 'active' || (f.phase === 'recovery' && f.ultimateHitsDone < f.attackData.hitCount))) {
        const d = f.attackData;
        const hitInterval = d.active / d.hitCount;
        // recovery阶段补发剩余段：update先转了phase，这里兜底最后一段
        const expectedHits = f.phase === 'recovery' ? d.hitCount : Math.floor(f.phaseTimer / hitInterval);
        if (expectedHits > f.ultimateHitsDone) {
          const isLastHit = expectedHits >= d.hitCount;
          this._resolveUltimateHit(f, fighters, isLastHit);
          f.ultimateHitsDone = expectedHits;
        }
      }
    }

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

    // 武器特效: 匕首影步（闪避穿过敌人时锁定目标朝向）
    // 武器特效: 长枪后撤刺（后向闪避时释放反刺）
    for (const f of fighters) {
      if (f.state !== 'dodging' || !f.alive) continue;
      for (const t of fighters) {
        if (t === f || t.team === f.team || !t.alive) continue;
        const d = dist(f, t);
        // 影步：闪避经过敌人身边时标记
        if (f.weapon.specials?.includes('shadowStep') && !f.shadowStepTarget &&
            f.isInvulnerable() && d < f.radius + t.radius + 20) {
          f.shadowStepTarget = t;
          this.events.push({ type: 'shadowStep', attacker: f, target: t });
        }
        // 后撤刺命中检测
        if (f._retreatStabActive && !f._retreatStabHit?.has(t)) {
          const w = f.weapon;
          const range = w.retreatStabRange || 70;
          const arc = w.retreatStabArc || Math.PI * 0.19;
          if (d <= range && isInArc(f.x, f.y, f.facing, t.x, t.y, t.radius, range, arc)) {
            if (!f._retreatStabHit) f._retreatStabHit = new Set();
            f._retreatStabHit.add(t);
            const dmg = w.retreatStabDamage || 6;
            const ang = angleBetween(f, t);
            t.takeDamage(dmg);
            t.setState('staggered', { duration: 0.20 });
            t.applyKnockback(ang, 15);
            t.flash('#fff', 0.08);
            this.particles.sparks((f.x + t.x) / 2, (f.y + t.y) / 2, ang, 4);
            this.events.push({ type: 'retreatStab', attacker: f, target: t, damage: dmg });
          }
        }
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
        const pdChance = target.perfectDodgeChance ?? 1.0;
        if (Math.random() < pdChance) {
          target.perfectDodged = true;
          this.particles.sparks(midX, midY, ang + Math.PI, 6);
          this.events.push({ type: 'perfectDodge', target });
        }
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
      // 检查攻击者是否有霸体穿透（如匕首灵巧精准，见缝插针）
      // 仅对拥有轻攻链霸体的武器生效（如大锤），不影响仅重击霸体的武器（如刀）
      const pierce = attacker.weapon.hyperArmorPierce || 0;
      const targetHasLightHA = target.weapon.lightAttacks?.some(atk => atk.hyperArmor);
      if (pierce > 0 && targetHasLightHA) {
        // 穿透：造成减伤但不打断霸体
        const pierceDmg = Math.round(atkInfo.damage * pierce);
        target.takeDamage(pierceDmg);
        target.flash('#fff', 0.06);
        this.particles.blood(midX, midY, ang, 3);
        this.events.push({ type: 'hit', attacker, target, damage: pierceDmg, atkType: 'light', pierced: true });
        attacker.hasHit.add(target);
        return;
      }
      // 无穿透：轻击被霸体无视
      this.particles.blockSpark(midX, midY, ang, 3);
      return;
    }

    // 目标在绝技active阶段被重击——受伤但不打断
    if (target.hasHyperArmor() && target.state === 'ultimate' && target.phase === 'active') {
      target.takeDamage(atkInfo.damage);
      target.flash('#fff', 0.1);
      this.particles.blood(midX, midY, ang, 6);
      this._shakeIfPlayer(attacker, target, C.SHAKE_HEAVY, C.SHAKE_DURATION);
      this.events.push({ type: 'hit', attacker, target, damage: atkInfo.damage, atkType: atkInfo.type });
      return;
    }

    // 目标可被处决
    if (target.canBeExecuted()) {
      this._resolveExecution(attacker, target);
      return;
    }

    // 目标在拔刀startup——打断绝技
    if (target.state === 'ultimate' && target.phase === 'startup') {
      this._interruptUltimate(target);
      this._applyHit(attacker, target, atkInfo, ang);
      return;
    }

    // 目标在绝对防御架势——吸收攻击并触发反击
    if (target.state === 'ultimate' && target._ultimateStance) {
      const faceDiff = Math.abs(normalizeAngle(angleBetween(target, attacker) - target.facing));
      if (faceDiff <= Math.PI / 2) {
        // 正面攻击被架势挡住，触发反击
        target._ultimateStanceTriggered = true;
        target.facing = angleBetween(target, attacker); // 面向攻击者
        attacker.hasHit.add(target);
        const midX = (attacker.x + target.x) / 2;
        const midY = (attacker.y + target.y) / 2;
        target.flash('#ffdd44', 0.15);
        this.particles.blockSpark(midX, midY, ang + Math.PI, 8);
        this._shakeIfPlayer(attacker, target, C.SHAKE_HEAVY, C.SHAKE_DURATION);
        this.events.push({ type: 'absDefenseTrigger', attacker, target });
        return;
      }
      // 背后攻击穿透架势
    }

    // 正常命中
    this._applyHit(attacker, target, atkInfo, ang);
  }

  _applyHit(attacker, target, atkInfo, ang) {
    let dmg = atkInfo.damage;
    const aw = attacker.weapon;

    // 武器特效: 背刺加成
    if (aw.specials && aw.specials.includes('backstab')) {
      const faceDiff = Math.abs(normalizeAngle(ang - target.facing));
      if (faceDiff < (aw.backstabAngle || Math.PI / 3)) {
        const origDmg = dmg;
        dmg = Math.floor(dmg * (aw.backstabMult || 1.3));
        this.events.push({ type: 'backstab', attacker, target, bonusDmg: dmg - origDmg });
      }
    }

    // 武器特效: 距离加成（长枪甜点）
    if (aw.specials && aw.specials.includes('rangeBonus')) {
      const d = dist(attacker, target);
      const [sweetMin, sweetMax] = aw.rangeBonusSweetSpot || [65, 110];
      if (d >= sweetMin && d <= sweetMax) {
        dmg = Math.floor(dmg * (aw.rangeBonusMult || 1.15));
      } else if (d < (aw.rangeBonusCloseThreshold || 40)) {
        dmg = Math.floor(dmg * (aw.rangeBonusClosePenalty || 0.75));
      }
    }

    // 武器特效: 重击额外硬直
    const stagger = (atkInfo.type === 'heavy' && attacker.weapon.heavy.hitStagger)
      ? attacker.weapon.heavy.hitStagger : C.HIT_STAGGER;
    // 轻攻击自带硬直覆写
    const lightStagger = atkInfo.hitStagger || stagger;

    // 护甲减伤
    dmg = applyArmorReduction(target.armor, dmg, atkInfo.type);
    // 护甲硬直缩减
    const armorStaggerResist = target.armor?.staggerResist || 0;

    target.takeDamage(dmg);
    const finalStagger = atkInfo.type === 'light' ? lightStagger : stagger;
    target.setState('staggered', { duration: Math.max(0.10, finalStagger - armorStaggerResist) });
    const baseKb = atkInfo.type === 'heavy' ? (attacker.weapon.heavy.knockback || C.HEAVY_HIT_KNOCKBACK) : C.HIT_KNOCKBACK;
    // 体型缩放
    const scaleRatio = (attacker.scale || 1) / (target.scale || 1);
    target.applyKnockback(ang, baseKb * scaleRatio);
    target.flash('#fff', 0.1);

    // 武器特效: 重击额外体力消耗（盾击）
    if (atkInfo.type === 'heavy') {
      const staminaDrain = attacker.weapon.heavy.staminaDrain || 0;
      if (staminaDrain > 0) {
        target.drainStamina(staminaDrain);
        this.events.push({ type: 'staminaDrain', attacker, target, amount: staminaDrain });
      }
    }

    const midX = (attacker.x + target.x) / 2;
    const midY = (attacker.y + target.y) / 2;
    this.particles.blood(midX, midY, ang, atkInfo.type === 'heavy' ? 10 : 5);
    this._shakeIfPlayer(attacker, target,
      atkInfo.type === 'heavy' ? C.SHAKE_HEAVY : C.SHAKE_LIGHT,
      C.SHAKE_DURATION
    );
    this.events.push({ type: 'hit', attacker, target, damage: dmg, atkType: atkInfo.type });
  }

  // ===================== 轻击 vs 招架 =====================
  _resolveLightVsBlock(attacker, target, atkInfo, ang, mx, my) {
    target.blockHitCount++;
    target.drainStamina(C.LIGHT_VS_BLOCK_STAMINA);
    // 武器特效: 额外体力消耗
    const extraDrain = attacker.weapon.vsBlockExtraStaminaDrain || 0;
    if (extraDrain > 0) target.drainStamina(extraDrain);
    this.particles.blockSpark(mx, my, ang, 5);
    this._shakeIfPlayer(attacker, target, C.SHAKE_LIGHT * 0.5, C.SHAKE_DURATION);

    const breakHits = target.weapon.breakHits || C.LIGHT_BREAK_HIT;
    if (target.blockHitCount >= breakHits) {
      // 破防
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
    const tw = target.weapon;
    const preciseWindow = tw.preciseParryWindow != null ? tw.preciseParryWindow : C.PRECISE_PARRY_WINDOW;
    const semiWindow = tw.semiParryWindow != null ? tw.semiParryWindow : C.SEMI_PARRY_WINDOW;
    let parryLevel;
    if (preciseWindow > 0 && timeSinceBlock <= preciseWindow) {
      parryLevel = 'precise';
    } else if (timeSinceBlock <= semiWindow) {
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

    // 攻击方进入格挡被弹状态（可招架但不可闪避/移动，原地不动）
    attacker.setState('parryStunned', { duration: result.parryStagger });
    // 停止攻击方一切位移（lunge/drift残余速度清零）
    attacker.vx = 0;
    attacker.vy = 0;
    attacker.knockbackTimer = 0;

    // 格挡后保证最小间距（至少1/3身位），防止贴脸
    const avgRadius = (attacker.radius + target.radius) / 2;
    const minGap = attacker.radius + target.radius + avgRadius * 0.88;
    const curDist = dist(attacker, target);
    if (curDist < minGap) {
      const pushBack = (minGap - curDist) / 2;
      // 双方各退一半
      attacker.x += Math.cos(ang + Math.PI) * pushBack;
      attacker.y += Math.sin(ang + Math.PI) * pushBack;
      target.x += Math.cos(ang) * pushBack;
      target.y += Math.sin(ang) * pushBack;
    }

    // 攻击方武器被架开（视觉动画）
    const deflectDuration = parryLevel === 'precise' ? 0.45 : parryLevel === 'semi' ? 0.35 : 0.25;
    attacker.parryDeflect = deflectDuration;

    // 强制双方面对面（格挡拉近后的对峙感）
    attacker.facing = ang;           // 攻击方面向防守方
    target.facing = ang + Math.PI;   // 防守方面向攻击方

    // 招架方在弹开武器动画结束后，再向攻击方步进靠近
    const pullDist = parryLevel === 'precise' ? C.PARRY_PULL_PRECISE
      : parryLevel === 'semi' ? C.PARRY_PULL_SEMI : C.PARRY_PULL_NONPRECISE;
    if (pullDist > 0) {
      // 限制拉近距离：确保拉近后不低于最小间距
      const curD = dist(attacker, target);
      const maxPull = Math.max(0, curD - minGap);
      const actualPull = Math.min(pullDist, maxPull);
      if (actualPull > 0) {
        // 延迟拉近：等武器弹开动画播完后再滑动靠近
        target.pendingPull = {
          angle: ang + Math.PI,
          distance: actualPull,
          slideDuration: C.PARRY_PULL_SLIDE_DURATION,
          delay: deflectDuration,
        };
      }
    }

    // 招架方回到idle（手动选择后续行动，形成二次博弈）
    target.parryChainCount = 0;
    target.setState('idle');

    // 格挡加速增益（格挡成功后下次攻击前摇压缩）
    const boost = C.PARRY_BOOST[parryLevel];
    target.parryBoost = { mult: boost.mult, timer: boost.duration };

    // 防止格挡成功后因Space仍然按住而误入blocking
    target.blockSuppressed = true;

    // 格挡方也有短暂停顿，与攻击方stagger同步解锁，形成真正二次博弈
    target.parryActionDelay = result.parryStagger * 0.4;

    // 特效
    const sparkCount = parryLevel === 'precise' ? 15 : parryLevel === 'semi' ? 10 : 6;
    this.particles.sparks(mx, my, ang + Math.PI, sparkCount);
    this._shakeIfPlayer(attacker, target, C.SHAKE_HEAVY, C.SHAKE_DURATION);

    if (parryLevel === 'precise') {
      target.flash('#ffff00', 0.2);
    } else {
      target.flash('#88ccff', 0.15);
    }

    // 武器特效: 精准弹反伤害反弹（剑盾）
    const reflectPct = target.weapon.parryReflectPct || 0;
    if (reflectPct > 0 && parryLevel === 'precise') {
      const reflectDmg = Math.floor(atkInfo.damage * reflectPct);
      if (reflectDmg > 0) {
        attacker.takeDamage(reflectDmg);
        attacker.flash('#ffff44', 0.12);
        this.particles.sparks(mx, my, ang, 8);
        this.events.push({ type: 'parryReflect', attacker, target, damage: reflectDmg });
      }
    }

    // 武器特效: 自动反击（长枪精准弹反自动反刺）
    if (target.weapon.autoCounter && parryLevel === 'precise') {
      const cResult = C.PARRY_RESULTS.precise;
      target.setState('parryCounter', { counterStartup: cResult.counterStartup });
      this.events.push({ type: 'autoCounter', target });
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
      this._shakeIfPlayer(a, b, C.SHAKE_CLASH, C.SHAKE_DURATION * 1.5);
      this.events.push({ type: 'heavyClash', a, b });
    } else {
      // 轻击拼刀
      a.setState('staggered', { duration: C.CLASH_STAGGER });
      b.setState('staggered', { duration: C.CLASH_STAGGER });
      a.applyKnockback(ang + Math.PI, C.CLASH_PUSHBACK);
      b.applyKnockback(ang, C.CLASH_PUSHBACK);
      this.particles.clash(mx, my, 10);
      this._shakeIfPlayer(a, b, C.SHAKE_CLASH * 0.7, C.SHAKE_DURATION);
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
    this._shakeIfPlayer(attacker, target, C.SHAKE_EXECUTION, C.SHAKE_DURATION * 2);
    this.events.push({ type: 'execution', attacker, target, damage: dmg });
  }

  // ===================== 拔刀绝技（前方多段连斩）=====================
  _resolveUltimateHit(attacker, allFighters, isLastHit) {
    const d = attacker.attackData;
    const range = d.range;
    const arc = d.arc;
    const baseDmg = d.hitDamage;
    const wu = attacker.weapon.ultimate;

    // 收集前方扇形内目标
    const targets = [];
    for (const t of allFighters) {
      if (t === attacker || t.team === attacker.team || !t.alive) continue;
      const dd = dist(attacker, t);
      if (dd > range) continue;
      // 绝技穿透格挡，但闪避i-frame仍然有效
      if (t.isInvulnerable()) continue;
      // 扇形判定
      if (!isInArc(attacker.x, attacker.y, attacker.facing, t.x, t.y, t.radius, range, arc)) continue;
      targets.push(t);
    }

    // 多目标伤害衰减
    let dmgMult = 1;
    if (targets.length === 2) dmgMult = C.ULTIMATE_MULTI_2;
    else if (targets.length >= 3) dmgMult = C.ULTIMATE_MULTI_3;
    const baseFinalDmg = Math.floor(baseDmg * dmgMult);

    const blockReduction = wu.blockReduction != null ? wu.blockReduction : C.ULTIMATE_BLOCK_REDUCTION;
    const knockback = wu.knockback || C.ULTIMATE_KNOCKBACK;

    for (const t of targets) {
      const ang = angleBetween(attacker, t);
      // 破防绝技（如大锤开山）直接突破格挡
      const breaksGuard = wu.breaksGuard || false;
      // 格挡减伤
      const blocked = t.isBlocking() && !breaksGuard;
      const dmg = blocked ? Math.floor(baseFinalDmg * blockReduction) : baseFinalDmg;
      t.takeDamage(dmg);
      t.flash(blocked ? '#89f' : '#fff', 0.1);
      // 破防效果：格挡中被命中也全额受伤+额外硬直
      if (t.isBlocking() && breaksGuard) {
        t.flash('#ffaa00', 0.15);
        this.events.push({ type: 'blockBreak', attacker, target: t });
      }
      // 命中即锁定
      t.ultimateLocked = attacker;
      if (isLastHit) {
        t.setState('staggered', { duration: 0.4 });
        t.applyKnockback(ang, knockback);
        t.ultimateLocked = null;
      } else {
        t.setState('staggered', { duration: 0.18 });
        t.applyKnockback(ang, 15);
      }
      this.particles.blood(t.x, t.y, ang, isLastHit ? 10 : 4);
    }

    if (targets.length > 0) {
      this._shakeIfPlayer(attacker, attacker, isLastHit ? C.SHAKE_HEAVY : C.SHAKE_LIGHT, C.SHAKE_DURATION);
      this.particles.ultimateSlash(attacker.x, attacker.y, attacker.facing, range, arc, isLastHit);
      this.events.push({ type: 'ultimateHit', attacker, targets, damage: baseFinalDmg, isLastHit, hitCount: targets.length });
    }

    if (isLastHit) {
      this.events.push({ type: 'ultimate', attacker, targets, damage: baseFinalDmg, hitCount: targets.length, totalHits: d.hitCount });
    }
  }

  // 绝技被打断
  _interruptUltimate(fighter) {
    fighter.qi = Math.floor(fighter.qi + fighter.qiMax * (1 - C.QI_INTERRUPT_COST));
    fighter.qi = Math.min(fighter.qi, fighter.qiMax);
    // fighter会被后续的applyHit设为staggered
    this.events.push({ type: 'ultimateInterrupt', target: fighter });
  }

  // ===================== 攻击吸附 =====================
  _applyMagnet(fighter, allFighters, dt) {
    for (const other of allFighters) {
      if (other === fighter || other.team === fighter.team || !other.alive) continue;
      const d = dist(fighter, other);
      const magnetRange = C.ATTACK_MAGNET_RANGE * (fighter.scale || 1);
      if (d > magnetRange || d < 5) continue;
      const ang = angleBetween(fighter, other);
      const diff = Math.abs(normalizeAngle(ang - fighter.facing));
      if (diff < C.ATTACK_MAGNET_ANGLE) {
        const pull = C.ATTACK_MAGNET_PULL * (1 - d / magnetRange);
        fighter.x += Math.cos(ang) * pull * dt;
        fighter.y += Math.sin(ang) * pull * dt;
      }
    }
  }
}
