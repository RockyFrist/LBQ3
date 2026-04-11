import * as C from '../core/constants.js';

export class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = camera;
  }

  clear(w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w || this.canvas.width, h || this.canvas.height);
  }

  drawGrid() {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const step = 60;
    for (let x = 0; x <= C.ARENA_W; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, C.ARENA_H); ctx.stroke();
    }
    for (let y = 0; y <= C.ARENA_H; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(C.ARENA_W, y); ctx.stroke();
    }
    // 边界
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, C.ARENA_W, C.ARENA_H);
    ctx.restore();
  }

  drawFighter(fighter) {
    if (!fighter.alive) return;
    const ctx = this.ctx;
    const f = fighter;
    ctx.save();
    ctx.translate(f.x, f.y);

    // 残影
    ctx.save();
    ctx.translate(-f.x, -f.y);
    for (const ai of f.afterimages) {
      const a = (ai.timer / 0.2) * 0.3;
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(ai.x, ai.y, f.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // 体力归零闪烁
    if (f.isExhausted && Math.floor(f.stateTimer * 8) % 2) {
      ctx.globalAlpha = 0.5;
    }

    // 受击闪烁
    if (f.damageFlash > 0) {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(f.damageFlash * 60);
    }

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(3, 3, f.radius * 1.2, f.radius * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // ---- 身体（肩甲轮廓） ----
    let bodyColor = f.color;
    if (f.flashTimer > 0) bodyColor = f.flashColor;
    const r = f.radius;

    // 外圈铠甲纹（暗色底）
    ctx.fillStyle = this._darken(bodyColor, 0.4);
    ctx.beginPath();
    ctx.arc(0, 0, r + 1, 0, Math.PI * 2);
    ctx.fill();

    // 身体主圆
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // 肩甲高光（上半弧）
    const hlGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
    hlGrad.addColorStop(0, 'rgba(255,255,255,0.25)');
    hlGrad.addColorStop(0.6, 'rgba(255,255,255,0.05)');
    hlGrad.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = hlGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // 朝向线（剑）— 在头部之前绘制，避免遮挡面部
    this._drawWeapon(ctx, f);

    // 头部（朝向方向偏移的小圆）
    ctx.save();
    ctx.rotate(f.facing);
    const headR = r * 0.42;
    const headOff = r * 0.3; // 头部向前偏移
    // 头发/头盔
    ctx.fillStyle = this._darken(bodyColor, 0.3);
    ctx.beginPath();
    ctx.arc(headOff, 0, headR + 1.5, 0, Math.PI * 2);
    ctx.fill();
    // 面部
    ctx.fillStyle = '#e8d5b7'; // 肤色
    ctx.beginPath();
    ctx.arc(headOff, 0, headR, 0, Math.PI * 2);
    ctx.fill();
    // 面部阴影（下半）
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.arc(headOff, 0, headR, 0, Math.PI);
    ctx.fill();
    // 眼部区域（朝前的方向线暗示）
    ctx.fillStyle = 'rgba(40,30,20,0.6)';
    const eyeY = headR * 0.25;
    ctx.fillRect(headOff + headR * 0.25, -eyeY - 1, headR * 0.35, 2);
    ctx.fillRect(headOff + headR * 0.25, eyeY - 1, headR * 0.35, 2);
    ctx.restore();

    // 外缘描边
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 1;

    // ---- 脚下体力环 ----
    this._drawStaminaRing(ctx, f);

    // ---- 脚下体力豆（无间冥庙风格）----
    this._drawStaminaDots(ctx, f);

    // 状态特效
    this._drawStateEffect(ctx, f);

    ctx.restore();
  }

  /** 角色脚下体力弧环 — 类似异人之下/只狼的近身体力指示 */
  _drawStaminaRing(ctx, f) {
    const max = C.STAMINA_MAX;
    const cur = f.stamina;
    if (max <= 0) return;

    const ringR = f.radius + 4;       // 环半径（紧贴身体外侧）
    const startAngle = Math.PI * 0.5;  // 从正下方开始
    const totalArc = Math.PI * 1.4;    // 总弧长（不满圆，留缺口朝上）
    const gapArc = 0.08;               // 段间缝隙弧度

    // 每个体力点对应的弧度
    const segArc = (totalArc - gapArc * (max - 1)) / max;

    ctx.save();
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    for (let i = 0; i < max; i++) {
      const a0 = startAngle - totalArc / 2 + i * (segArc + gapArc);
      const a1 = a0 + segArc;

      if (i < cur) {
        // 有体力 — 金色（体力耗尽时红色闪烁）
        if (f.isExhausted) {
          const flash = Math.sin(f.stateTimer * 10) * 0.3 + 0.7;
          ctx.strokeStyle = `rgba(255,60,40,${flash * 0.9})`;
        } else {
          const alpha = cur >= max ? 0.7 : 0.85;
          ctx.strokeStyle = `rgba(255,200,50,${alpha})`;
        }
      } else {
        // 已消耗 — 暗色底
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      }

      ctx.beginPath();
      ctx.arc(0, 0, ringR, a0, a1);
      ctx.stroke();
    }

    // 体力恢复进度指示（下一点恢复中时，对应段显示渐变填充）
    if (cur < max && f.staminaRegenTimer > 0 && !f.isExhausted) {
      const progress = 1 - f.staminaRegenTimer / C.STAMINA_REGEN_INTERVAL;
      const idx = cur; // 正在恢复的那个段下标
      const a0 = startAngle - totalArc / 2 + idx * (segArc + gapArc);
      const a1 = a0 + segArc * Math.max(0, progress);
      ctx.strokeStyle = `rgba(255,200,50,${0.15 + 0.35 * progress})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, ringR, a0, a1);
      ctx.stroke();
    }

    ctx.restore();
  }

  /** 角色脚下体力豆 — 无间冥庙风格水平排列小圆点 */
  _drawStaminaDots(ctx, f) {
    const max = C.STAMINA_MAX;
    const cur = f.stamina;
    if (max <= 0) return;

    const dotR = 2.5;          // 每个豆半径
    const gap = 7;             // 豆中心间距
    const y = f.radius + 22;  // 位于体力环下方、状态文字上方
    const totalW = (max - 1) * gap;
    const startX = -totalW / 2;

    ctx.save();
    for (let i = 0; i < max; i++) {
      const cx = startX + i * gap;
      if (i < cur) {
        // 有体力 — 金色实心豆
        if (f.isExhausted) {
          const flash = Math.sin(f.stateTimer * 10) * 0.3 + 0.7;
          ctx.fillStyle = `rgba(255,60,40,${flash * 0.9})`;
        } else {
          const alpha = cur >= max ? 0.7 : 0.9;
          ctx.fillStyle = `rgba(255,200,50,${alpha})`;
        }
        ctx.beginPath();
        ctx.arc(cx, y, dotR, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 已消耗 — 暗色空心圆
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, y, dotR, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 恢复进度指示（正在恢复的豆显示渐填充）
    if (cur < max && f.staminaRegenTimer > 0 && !f.isExhausted) {
      const progress = 1 - f.staminaRegenTimer / C.STAMINA_REGEN_INTERVAL;
      const cx = startX + cur * gap;
      ctx.fillStyle = `rgba(255,200,50,${0.1 + 0.4 * progress})`;
      ctx.beginPath();
      ctx.arc(cx, y, dotR * progress, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawWeapon(ctx, f) {
    const r = f.radius;
    const len = r * 2.0;
    ctx.save();

    // 武器角度偏移
    let weaponOffset = 0;
    // 攻击前摇时武器后拉动画
    if (f.phase === 'startup' && f.attackData &&
        (f.state === 'lightAttack' || f.state === 'heavyAttack' || f.state === 'parryCounter')) {
      const progress = Math.min(1, f.phaseTimer / f.attackData.startup);
      weaponOffset = -Math.PI * 0.3 * (1 - progress * progress);
    }
    // 格挡架开动画（武器被弹向侧面）
    if (f.parryDeflect > 0) {
      const t = Math.min(1, f.parryDeflect / 0.35);
      // 先快速弹开再缓慢回正: easeOutQuad
      const ease = t * (2 - t);
      weaponOffset = Math.PI * 0.55 * ease;
    }
    ctx.rotate(f.facing + weaponOffset);

    // 握柄
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(r * 0.3, 0);
    ctx.lineTo(r * 0.55, 0);
    ctx.stroke();

    // 护手（十字）
    ctx.strokeStyle = '#aa8844';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(r * 0.55, -6);
    ctx.lineTo(r * 0.55, 6);
    ctx.stroke();

    // 剑身（渐变+双刃）
    const bladeStart = r * 0.55;
    const bladeGrad = ctx.createLinearGradient(bladeStart, 0, len, 0);
    bladeGrad.addColorStop(0, '#ccc');
    bladeGrad.addColorStop(0.4, '#eee');
    bladeGrad.addColorStop(0.8, '#ddd');
    bladeGrad.addColorStop(1, '#fff');
    ctx.fillStyle = bladeGrad;
    ctx.beginPath();
    ctx.moveTo(bladeStart, -2.5);
    ctx.lineTo(len - 4, -1.8);
    ctx.lineTo(len, 0);
    ctx.lineTo(len - 4, 1.8);
    ctx.lineTo(bladeStart, 2.5);
    ctx.closePath();
    ctx.fill();
    // 剑身中线
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(bladeStart + 2, 0);
    ctx.lineTo(len - 6, 0);
    ctx.stroke();

    ctx.restore();
  }

  _drawStateEffect(ctx, f) {
    // 攻击前摇预告弧线（幽灵弧线）
    if (f.phase === 'startup' && f.attackData &&
        (f.state === 'lightAttack' || f.state === 'heavyAttack' || f.state === 'parryCounter')) {
      ctx.save();
      ctx.rotate(f.facing);
      const range = f.attackData.range;
      const arc = f.attackData.arc;
      const progress = Math.min(1, f.phaseTimer / f.attackData.startup);
      // 虚线描边显示即将命中的扇形区域
      ctx.setLineDash([4, 4]);
      const alpha = 0.10 + 0.25 * progress;
      ctx.strokeStyle = f.attackType === 'heavy'
        ? `rgba(255,100,50,${alpha})`
        : f.attackType === 'parryCounter'
          ? `rgba(100,220,255,${alpha})`
          : `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, range, -arc / 2, arc / 2);
      ctx.stroke();
      // 方向线
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(range * Math.cos(-arc / 2), range * Math.sin(-arc / 2));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(range * Math.cos(arc / 2), range * Math.sin(arc / 2));
      ctx.stroke();
      // 微弱填充
      ctx.fillStyle = f.attackType === 'heavy'
        ? `rgba(255,100,50,${0.03 + 0.05 * progress})`
        : `rgba(255,255,255,${0.02 + 0.04 * progress})`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, range, -arc / 2, arc / 2);
      ctx.closePath();
      ctx.fill();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 攻击弧（更醒目）
    if (f.phase === 'active' && f.attackData) {
      ctx.save();
      ctx.rotate(f.facing);
      const range = f.attackData.range;
      const arc = f.attackData.arc;
      let color, edgeColor;
      switch (f.attackType) {
        case 'heavy':
          color = 'rgba(255,60,30,0.35)';
          edgeColor = 'rgba(255,100,50,0.7)';
          break;
        case 'parryCounter':
          color = 'rgba(100,200,255,0.35)';
          edgeColor = 'rgba(100,220,255,0.7)';
          break;
        default:
          color = 'rgba(255,255,255,0.25)';
          edgeColor = 'rgba(255,255,255,0.5)';
      }
      // 填充弧
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, range, -arc / 2, arc / 2);
      ctx.closePath();
      ctx.fill();
      // 边缘（更粗更亮）
      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, range, -arc / 2, arc / 2);
      ctx.stroke();
      // 横扫线
      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(range * Math.cos(-arc / 2), range * Math.sin(-arc / 2));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(range * Math.cos(arc / 2), range * Math.sin(arc / 2));
      ctx.stroke();
      ctx.restore();
    }

    // 重击蓄力（更醒目）
    if (f.state === 'heavyAttack' && f.phase === 'startup') {
      const progress = Math.min(1, f.phaseTimer / C.HEAVY_CHARGE);
      // 外圈脉冲
      const pulse = Math.sin(f.phaseTimer * 12) * 0.15 + 0.85;
      const r = f.radius + 12 + 18 * progress * pulse;
      const red = Math.floor(255);
      const green = Math.floor(50 + 100 * (1 - progress));
      ctx.strokeStyle = `rgba(${red}, ${green}, 30, ${0.4 + 0.5 * progress})`;
      ctx.lineWidth = 3 + progress * 4;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      // 内圈填充
      ctx.fillStyle = `rgba(${red}, ${green}, 30, ${0.08 + 0.15 * progress})`;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      // 进度环
      ctx.strokeStyle = `rgba(255, 200, 50, ${0.6 + 0.4 * progress})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, f.radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.stroke();
      // 蓄力文字
      ctx.save();
      ctx.rotate(0); // 文字不随角色旋转
      ctx.textAlign = 'center';
      ctx.font = `bold 13px "Microsoft YaHei", sans-serif`;
      ctx.fillStyle = `rgba(255, ${green}, 50, ${0.6 + 0.4 * progress})`;
      ctx.fillText('蓄力...', 0, f.radius + 38);
      ctx.restore();
    }

    // 招架盾弧（更醒目）
    if (f.state === 'blocking') {
      ctx.save();
      ctx.rotate(f.facing);
      const shieldR = f.radius + 10;
      // 盾光脉冲
      const pulse = Math.sin(f.stateTimer * 6) * 0.15 + 0.85;
      ctx.strokeStyle = `rgba(100,180,255,${0.7 * pulse})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, shieldR, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.stroke();
      // 外层光晕
      ctx.strokeStyle = `rgba(100,180,255,${0.25 * pulse})`;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(0, 0, shieldR + 3, -Math.PI * 0.42, Math.PI * 0.42);
      ctx.stroke();
      // 盾面填充
      ctx.fillStyle = `rgba(100,180,255,${0.08 * pulse})`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, shieldR, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 招架后摇
    if (f.state === 'blockRecovery') {
      ctx.save();
      ctx.rotate(f.facing);
      const progress = f.stateTimer / C.BLOCK_RECOVERY_TIME;
      ctx.strokeStyle = `rgba(100,180,255,${0.3 * (1 - progress)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, f.radius + 8, -Math.PI * 0.4, Math.PI * 0.4);
      ctx.stroke();
      ctx.restore();
    }

    // 格挡加速增益（武器发光）
    if (f.parryBoost && f.parryBoost.timer > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(f.parryBoost.timer * 14);
      // 武器方向光芒
      ctx.save();
      ctx.rotate(f.facing);
      const glowLen = f.radius * 2.2;
      const grad = ctx.createLinearGradient(f.radius * 0.5, 0, glowLen, 0);
      grad.addColorStop(0, `rgba(100,255,200,${0.5 * pulse})`);
      grad.addColorStop(1, `rgba(100,255,200,0)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(f.radius * 0.5, 0);
      ctx.lineTo(glowLen, 0);
      ctx.stroke();
      ctx.restore();
      // 身体外圈
      ctx.strokeStyle = `rgba(100,255,200,${0.3 * pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, f.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 硬直状态抖动 + 标记
    if (f.state === 'staggered' || f.state === 'parryStunned') {
      const jitter = (Math.random() - 0.5) * 6;
      ctx.translate(jitter, jitter);
      // 硬直外环
      const stProg = f.stateTimer / (f.staggerDuration || 0.35);
      ctx.strokeStyle = f.state === 'parryStunned'
        ? `rgba(255,200,50,${0.6 * (1 - stProg)})`
        : `rgba(255,140,0,${0.5 * (1 - stProg)})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, f.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 处决特效（更夸张）
    if (f.state === 'executed') {
      const progress = f.stateTimer / C.EXECUTION_DURATION;
      // 多层扩散环
      ctx.strokeStyle = `rgba(255, 0, 0, ${0.6 * (1 - progress)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, f.radius + 30 * progress, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 0, 0, ${0.25 * (1 - progress)})`;
      ctx.beginPath();
      ctx.arc(0, 0, f.radius + 30 * progress, 0, Math.PI * 2);
      ctx.fill();
      // 内圈
      ctx.fillStyle = `rgba(255, 50, 0, ${0.4 * (1 - progress)})`;
      ctx.beginPath();
      ctx.arc(0, 0, f.radius + 10 * progress, 0, Math.PI * 2);
      ctx.fill();
    }

    // 完美闪避标记（更醒目）
    if (f.perfectDodged && f.state === 'dodging') {
      const pulse = Math.sin(f.stateTimer * 20) * 0.3 + 0.7;
      ctx.strokeStyle = `rgba(255,255,100,${0.9 * pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, f.radius + 14, 0, Math.PI * 2);
      ctx.stroke();
      // 外层光环
      ctx.strokeStyle = `rgba(255,255,100,${0.3 * pulse})`;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, f.radius + 18, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ——— 状态标签（角色下方） ———
    this._drawStateLabel(ctx, f);
  }

  _drawStateLabel(ctx, f) {
    let label = '';
    let color = '#fff';
    switch (f.state) {
      case 'heavyAttack':
        if (f.phase === 'startup') { label = '⚡蓄力'; color = '#ff8844'; }
        else if (f.phase === 'active') { label = '⚡重击!'; color = '#ff4422'; }
        break;
      case 'blocking': label = '🛡招架'; color = '#88ccff'; break;
      case 'blockRecovery': label = '后摇'; color = '#4488aa'; break;
      case 'staggered': label = '✦硬直'; color = '#ff8800'; break;
      case 'parryStunned': label = '⚡被弹(可招架)'; color = '#ffcc33'; break;
      case 'parryCounter': label = '↩反击!'; color = '#00ddff'; break;
      case 'executing': label = '⚔处决!'; color = '#ff0000'; break;
      case 'executed': label = '💀被处决'; color = '#ff0000'; break;
      case 'dodging':
        if (f.perfectDodged) { label = '✨完美闪避!'; color = '#ffff00'; }
        break;
    }
    if (f.isExhausted && !label) {
      label = '⚠体力耗尽'; color = '#ff4444';
    }
    if (!label && f.parryBoost && f.parryBoost.timer > 0) {
      label = '⚡加速!'; color = '#66ffcc';
    }
    if (!label) return;
    ctx.save();
    // 取消父级旋转（label始终水平）
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeText(label, 0, f.radius + 38);
    ctx.fillStyle = color;
    ctx.fillText(label, 0, f.radius + 38);
    ctx.restore();
  }

  drawParticles(particleSystem) {
    const ctx = this.ctx;
    particleSystem.draw(ctx);
  }

  drawFloatingTexts(texts) {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    for (const ft of texts) {
      const lifeRatio = ft.timer / ft.maxTimer;
      // 生命周期进度 0→1
      const popPhase = 1 - lifeRatio;

      // 大字（≥24）弹出效果明显，小字（<18）几乎不弹
      const isBig = ft.fontSize >= 24;
      let scale;
      if (isBig) {
        if (popPhase < 0.12) {
          scale = 1 + popPhase / 0.12 * 0.35; // 1 → 1.35
        } else {
          scale = 1.35 - (popPhase - 0.12) / 0.88 * 0.35; // 1.35 → 1.0
        }
      } else {
        scale = 1.0; // 小字不弹出，减少视觉噪音
      }

      // 淡出：根据字号调整淡出时机
      const fadeStart = isBig ? 0.25 : 0.35;
      const alpha = lifeRatio < fadeStart ? lifeRatio / fadeStart : 1;

      ctx.globalAlpha = alpha;
      const sz = Math.round(ft.fontSize * scale);
      ctx.font = `bold ${sz}px "Microsoft YaHei", sans-serif`;
      // 描边（大字粗描边，小字细描边）
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = isBig ? 4 : 2.5;
      ctx.lineJoin = 'round';
      ctx.strokeText(ft.text, ft.x, ft.y);
      // 填充
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawScreenFlash(flash, w, h) {
    if (!flash || flash.timer <= 0) return;
    const alpha = flash.timer / flash.maxTimer;
    const ctx = this.ctx;
    w = w || this.canvas._logicW || this.canvas.width;
    h = h || this.canvas._logicH || this.canvas.height;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = flash.color;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawSlowMoEffect(scale, timer, w, h) {
    const ctx = this.ctx;
    w = w || this.canvas._logicW || this.canvas.width;
    h = h || this.canvas._logicH || this.canvas.height;
    const intensity = (1 - scale) * 0.18 * Math.min(1, timer * 3);
    ctx.save();
    // 暗角 vignette（中央透明，边缘变暗）— 不改变角色颜色
    const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.7);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.6, `rgba(0,0,0,${intensity * 0.4})`);
    grad.addColorStop(1, `rgba(0,0,0,${intensity * 2})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // 边框辉光指示慢动作
    ctx.strokeStyle = `rgba(100, 180, 255, ${Math.min(1, intensity * 3)})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.restore();
  }

  /** 将 CSS 颜色字符串变暗 (amount 0~1) */
  _darken(color, amount) {
    // 解析 hex #rrggbb 或 #rgb
    let r, g, b;
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      }
    } else {
      return color; // 不支持的格式直接返回
    }
    const f = 1 - amount;
    return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
  }
}
