import * as C from '../core/constants.js';

export class UI {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.combatLog = [];
    this.logTimer = 0;
  }

  addLog(text) {
    this.combatLog.unshift({ text, timer: 2.5 });
    if (this.combatLog.length > 6) this.combatLog.pop();
  }

  update(dt) {
    for (const log of this.combatLog) log.timer -= dt;
    this.combatLog = this.combatLog.filter(l => l.timer > 0);
  }

  draw(player, targetEnemy, enemies, difficulty) {
    const ctx = this.ctx;
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;

    // ===== 左上角：玩家信息 =====
    this._drawCharInfo(ctx, player, 14, 14, false);

    // ===== 右上角：目标敌人信息 =====
    if (targetEnemy && targetEnemy.alive) {
      this._drawCharInfo(ctx, targetEnemy, cw - 14, 14, true);
    }

    // ===== 顶部中央：难度显示 =====
    const diffNames = ['新手', '普通', '熟练', '困难', '大师', '拼刀训练', '格挡训练'];
    const diffColors = ['#66cc66', '#cccc66', '#ff9933', '#ff5555', '#ff2222', '#44aaff', '#ff88ff'];
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = diffColors[difficulty - 1] || '#fff';
    ctx.fillText(`难度 ${diffNames[difficulty - 1] || difficulty}`, cw / 2, 24);

    // ===== 敌人数量 =====
    const aliveCount = enemies.filter(e => e.alive).length;
    if (aliveCount > 1) {
      ctx.fillStyle = '#ff8888';
      ctx.font = '12px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`敌人 ×${aliveCount}`, cw / 2, 40);
    }

    // 战斗日志
    this._drawCombatLog(ctx, cw);
  }

  /** 绘制角色简要信息面板（名字 + HP + 体力 + 状态） */
  _drawCharInfo(ctx, f, x, y, alignRight) {
    ctx.save();
    const nameColor = f.team === 0 ? '#88bbff' : '#ff8888';

    // 名字 + 武器
    ctx.fillStyle = nameColor;
    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    ctx.textAlign = alignRight ? 'right' : 'left';
    const dispName = f.weapon ? `${f.name} ${f.weapon.icon}` : f.name;
    ctx.fillText(dispName, x, y + 12);

    // HP文字
    const hpRatio = Math.max(0, f.hp / f.maxHp);
    const hpColor = hpRatio > 0.5 ? '#66dd66' : hpRatio > 0.25 ? '#ddaa33' : '#dd4444';
    ctx.fillStyle = hpColor;
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillText(`HP ${f.hp}/${f.maxHp}`, x, y + 28);

    // 体力点
    const stX = alignRight ? x - (C.STAMINA_MAX - 1) * 10 : x;
    const stY = y + 40;
    for (let i = 0; i < C.STAMINA_MAX; i++) {
      const cx = stX + i * 10;
      if (i < f.stamina) {
        ctx.fillStyle = f.isExhausted ? '#ff4444' : '#ffcc33';
        ctx.beginPath();
        ctx.arc(cx, stY, 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, stY, 3.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 状态文字
    let stateText = '';
    let stateColor = '#888';
    switch (f.state) {
      case 'lightAttack': stateText = `轻击 ${f.comboStep}/${f.weapon ? f.weapon.lightAttacks.length : 3}`; stateColor = '#fff'; break;
      case 'heavyAttack': stateText = f.phase === 'startup' ? '蓄力...' : '重击!'; stateColor = '#ff6633'; break;
      case 'blocking': stateText = '招架'; stateColor = '#66aaff'; break;
      case 'dodging': stateText = f.perfectDodged ? '完美闪避!' : '闪避'; stateColor = f.perfectDodged ? '#ffff00' : '#aaa'; break;
      case 'staggered': stateText = '硬直'; stateColor = '#ff8800'; break;
      case 'parryStunned': stateText = '被弹!'; stateColor = '#ffcc33'; break;
      case 'parryCounter': stateText = '反击!'; stateColor = '#00ddff'; break;
      case 'executing': stateText = '处决!'; stateColor = '#ff0000'; break;
      case 'executed': stateText = '被处决'; stateColor = '#ff0000'; break;
      case 'ultimate': stateText = f.weapon ? f.weapon.ultimate.name : '乱刀斩!'; stateColor = '#aaddff'; break;
      default:
        if (f.isExhausted) { stateText = '体力耗尽!'; stateColor = '#ff4444'; }
        else if (f.parryBoost && f.parryBoost.timer > 0) { stateText = '加速!'; stateColor = '#66ffcc'; }
    }
    if (stateText) {
      ctx.fillStyle = stateColor;
      ctx.font = '11px "Segoe UI", sans-serif';
      ctx.fillText(stateText, x, y + 54);
    }

    // 炁条（能量条）— 与HP同宽，醒目显示
    const qiBarW = 56;
    const qiBarH = 7;
    const qiX = alignRight ? x - qiBarW : x;
    const qiY = y + 60;
    const qiRatio = Math.min(1, (f.qi || 0) / (f.qiMax || C.QI_MAX));
    // 底色边框
    ctx.fillStyle = 'rgba(30,40,60,0.6)';
    ctx.fillRect(qiX - 1, qiY - 1, qiBarW + 2, qiBarH + 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(qiX, qiY, qiBarW, qiBarH);
    // 填充色
    if (qiRatio > 0) {
      const full = qiRatio >= 1;
      if (full) {
        // 满炁闪烁发光
        const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.008);
        ctx.fillStyle = `rgba(120,200,255,${pulse})`;
        ctx.fillRect(qiX, qiY, qiBarW, qiBarH);
        // 高光描边
        ctx.strokeStyle = `rgba(200,240,255,${0.5 + 0.3 * Math.sin(Date.now() * 0.006)})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(qiX, qiY, qiBarW, qiBarH);
      } else {
        // 渐变：深蓝→浅蓝
        const grad = ctx.createLinearGradient(qiX, 0, qiX + qiBarW * qiRatio, 0);
        grad.addColorStop(0, '#3366aa');
        grad.addColorStop(1, '#66aaee');
        ctx.fillStyle = grad;
        ctx.fillRect(qiX, qiY, qiBarW * qiRatio, qiBarH);
      }
    }
    // 炁文字标签
    ctx.fillStyle = qiRatio >= 1 ? '#88ddff' : 'rgba(180,210,240,0.7)';
    ctx.font = '10px "Segoe UI", sans-serif';
    const qiLabel = qiRatio >= 1 ? '炁 MAX [F]' : `炁 ${Math.floor((f.qi || 0))}/${f.qiMax || C.QI_MAX}`;
    ctx.fillText(qiLabel, alignRight ? qiX + qiBarW : qiX, qiY + qiBarH + 12);

    ctx.restore();
  }

  _drawCombatLog(ctx, cw) {
    const x = cw / 2;
    let y = 56;
    ctx.textAlign = 'center';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    for (const log of this.combatLog) {
      const alpha = Math.min(1, log.timer);
      ctx.strokeStyle = `rgba(0,0,0,${alpha * 0.7})`;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(log.text, x, y);
      ctx.fillStyle = `rgba(255,255,200,${alpha * 0.9})`;
      ctx.fillText(log.text, x, y);
      y += 20;
    }
  }
}
