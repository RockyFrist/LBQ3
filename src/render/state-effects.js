// ===================== 战斗状态视觉特效 =====================
// 从 renderer.js 提取：_drawStateEffect, _drawStateLabel
// 使用方式: Object.assign(Renderer.prototype, stateEffectsMethods)

import * as C from '../core/constants.js';

export const stateEffectsMethods = {
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
  },

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
  },
};
