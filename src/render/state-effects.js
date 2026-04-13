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

    // 满炁气流特效（角色周围白蓝旋涡）
    if (f.qi >= (f.qiMax || C.QI_MAX) && f.state !== 'ultimate') {
      const pulse = 0.4 + 0.3 * Math.sin(Date.now() * 0.006);
      ctx.strokeStyle = `rgba(170,220,255,${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, f.radius + 10 + Math.sin(Date.now() * 0.004) * 3, 0, Math.PI * 2);
      ctx.stroke();
      // 炁字提示
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = `rgba(170,220,255,${0.5 + 0.3 * Math.sin(Date.now() * 0.005)})`;
      ctx.fillText('炁', 0, -(f.radius + 16));
      ctx.restore();
    }

    // 拔刀绝技特效
    if (f.state === 'ultimate') {
      const ultType = f.attackData?.type || 'multislash';
      // 角色外环（全阶段可见，颜色按类型区分）
      const pulseAll = 0.3 + 0.3 * Math.sin(Date.now() * 0.008);
      let ringColor;
      switch (ultType) {
        case 'shadowkill':       ringColor = [160, 100, 255]; break;
        case 'groundslam':       ringColor = [255, 120, 30]; break;
        case 'absolutedefense':  ringColor = [255, 220, 60]; break;
        default:                 ringColor = [255, 50, 20]; break;
      }
      const [rr, rg, rb] = ringColor;
      ctx.strokeStyle = `rgba(${rr},${rg},${rb},${f.phase === 'active' ? 0.6 + pulseAll : 0.4 + 0.3 * pulseAll})`;
      ctx.lineWidth = f.phase === 'active' ? 5 : f.phase === 'startup' ? 4 : 3;
      ctx.beginPath();
      ctx.arc(0, 0, f.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
      if (f.phase === 'active' || f.phase === 'startup' || f.phase === 'stance' || f.phase === 'dash' || f.phase === 'jump') {
        ctx.fillStyle = `rgba(${rr},${rg},${rb},${f.phase === 'active' ? 0.08 + 0.06 * pulseAll : 0.04 + 0.04 * pulseAll})`;
        ctx.beginPath();
        ctx.arc(0, 0, f.radius + 8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.rotate(f.facing); // 所有效果朝角色面向方向
      if (f.phase === 'startup') {
        // 蓄势：红光聚拢至前方，越来越亮
        const progress = Math.min(1, f.phaseTimer / C.ULTIMATE_STARTUP);
        const r = f.radius + 15 * (1 - progress);
        const pulse = 0.5 + 0.5 * Math.sin(f.phaseTimer * 25);
        // 开始瞬间爆亮（前20%进度额外强化，确保第一时间引起注意）
        const burstAlpha = progress < 0.2 ? 1.0 - progress * 4 : 0; // 瞬间高亮衰减
        // 红色脉冲圈
        ctx.strokeStyle = `rgba(${rr},${rg},${rb},${Math.min(1, (0.5 + 0.5 * progress) * pulse + burstAlpha * 0.5)})`;
        ctx.lineWidth = 2 + 4 * progress + burstAlpha * 3;
        const ultArc = f.attackData?.arc || C.ULTIMATE_ARC;
        ctx.beginPath();
        ctx.arc(0, 0, r, -ultArc / 2, ultArc / 2);
        ctx.stroke();
        // 扇形填充
        ctx.fillStyle = `rgba(${rr},${rg},${rb},${Math.min(0.5, (0.08 + 0.16 * progress) * pulse + burstAlpha * 0.2)})`;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, -ultArc / 2, ultArc / 2);
        ctx.closePath();
        ctx.fill();
        // 危险扇形范围预警线
        const ultRange = f.attackData?.range || C.ULTIMATE_RANGE;
        ctx.strokeStyle = `rgba(${rr},${rg},${rb},${0.25 + 0.25 * progress})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, ultRange, -ultArc / 2, ultArc / 2);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        // 内圈白光聚拢
        ctx.strokeStyle = `rgba(255,200,180,${0.3 + 0.3 * progress})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, f.radius + 3, -ultArc / 3, ultArc / 3);
        ctx.stroke();
      } else if (f.phase === 'dash') {
        // 影杀冲刺: 紫色拖尾
        const range = f.attackData?.range || 55;
        ctx.strokeStyle = 'rgba(160,100,255,0.6)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-f.radius * 3, -4);
        ctx.lineTo(range * 0.5, 0);
        ctx.moveTo(-f.radius * 3, 4);
        ctx.lineTo(range * 0.5, 0);
        ctx.stroke();
        ctx.fillStyle = 'rgba(160,100,255,0.12)';
        ctx.beginPath();
        ctx.ellipse(0, 0, range * 0.6, f.radius * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (f.phase === 'jump') {
        // 开山跳跃: 360°落点预警圆(地面阴影扩大)
        const jumpDur = f.weapon?.ultimate?.jumpDuration || 0.40;
        const t = f.phaseTimer / jumpDur;
        const impactR = (f.attackData?.range || 95) * (0.3 + 0.7 * t);
        ctx.strokeStyle = `rgba(255,80,30,${0.3 + 0.4 * t})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.arc(0, 0, impactR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(255,80,30,${0.05 + 0.1 * t})`;
        ctx.beginPath();
        ctx.arc(0, 0, impactR, 0, Math.PI * 2);
        ctx.fill();
      } else if (f.phase === 'stance') {
        // 绝对防御架势: 金色盾形光环
        const pulse = 0.6 + 0.4 * Math.sin(f.phaseTimer * 8);
        const shieldR = f.radius + 14;
        ctx.strokeStyle = `rgba(255,220,60,${0.7 * pulse})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, shieldR, -Math.PI * 0.55, Math.PI * 0.55);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,220,60,${0.12 * pulse})`;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, shieldR, -Math.PI * 0.55, Math.PI * 0.55);
        ctx.closePath();
        ctx.fill();
        // "等待..."文字
        ctx.save();
        ctx.rotate(-f.facing); // 取消旋转，文字水平
        ctx.textAlign = 'center';
        ctx.font = 'bold 11px "Microsoft YaHei", sans-serif';
        ctx.fillStyle = `rgba(255,220,60,${0.5 + 0.3 * pulse})`;
        ctx.fillText('架势中...', 0, f.radius + 50);
        ctx.restore();
      } else if (f.phase === 'active') {
        // 连斩：前方扇形快速挥刀弧线
        const range = f.attackData ? f.attackData.range : C.ULTIMATE_RANGE;
        const arc = f.attackData ? f.attackData.arc : C.ULTIMATE_ARC;
        const hitCount = f.attackData ? f.attackData.hitCount : C.ULTIMATE_HIT_COUNT;
        const hitInterval = (f.attackData ? f.attackData.active : C.ULTIMATE_ACTIVE) / hitCount;
        const hitPhase = (f.phaseTimer % hitInterval) / hitInterval;
        // 左右交替挥刀弧
        const hitIdx = Math.floor(f.phaseTimer / hitInterval);
        const swingDir = hitIdx % 2 === 0 ? 1 : -1;
        const swingAngle = (hitPhase - 0.5) * arc * swingDir;
        // 刀光弧
        ctx.strokeStyle = `rgba(255,220,200,${0.7 + 0.3 * (1 - hitPhase)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        const startA = swingAngle - arc * 0.3;
        const endA = swingAngle + arc * 0.3;
        ctx.arc(0, 0, range * (0.5 + 0.5 * hitPhase), startA, endA);
        ctx.stroke();
        // 扇形范围指示
        ctx.fillStyle = `rgba(${rr},${rg},${rb},${0.05})`;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, range, -arc / 2, arc / 2);
        ctx.closePath();
        ctx.fill();
        // 内圈发光
        ctx.strokeStyle = `rgba(255,200,150,${0.4})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, f.radius + 5, -arc / 2, arc / 2);
        ctx.stroke();
        // 开山砸地瞬间: 大范围震波
        if (ultType === 'groundslam') {
          const slamProg = f.phaseTimer / (f.attackData?.active || 0.10);
          const waveR = range * (0.5 + 0.8 * slamProg);
          ctx.strokeStyle = `rgba(255,120,30,${0.7 * (1 - slamProg)})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(0, 0, waveR, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (f.phase === 'recovery') {
        // 收刀：残余刀痕淡出
        const progress = Math.min(1, f.phaseTimer / C.ULTIMATE_RECOVERY);
        const range = f.attackData ? f.attackData.range : C.ULTIMATE_RANGE;
        ctx.strokeStyle = `rgba(255,180,140,${0.3 * (1 - progress)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, range * 0.6, -0.4, 0.4);
        ctx.stroke();
      }
      ctx.restore();
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
      case 'ultimate': {
        const ultName = f.weapon?.ultimate?.name || '绝技';
        if (f.phase === 'startup') { label = '⚡蓄势'; color = '#ff4422'; }
        else if (f.phase === 'dash') { label = `⚔${ultName}·突进!`; color = '#aa88ff'; }
        else if (f.phase === 'jump') { label = `⚔${ultName}·跳跃!`; color = '#ff6622'; }
        else if (f.phase === 'stance') { label = `🛡${ultName}!`; color = '#ffdd44'; }
        else if (f.phase === 'active') { label = `⚔${ultName}!`; color = '#ff4422'; }
        else if (f.phase === 'recovery') { label = '收招'; color = '#88aacc'; }
        break;
      }
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
