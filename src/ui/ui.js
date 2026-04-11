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
    const cw = this.canvas.width;

    // 玩家状态（左上）
    this._drawFighterHUD(ctx, player, 20, 20, false);

    // 目标敌人状态（右上）
    if (targetEnemy && targetEnemy.alive) {
      this._drawFighterHUD(ctx, targetEnemy, cw - 260, 20, true);
    }

    // 顶部中央状态栏
    const diffNames = ['新手', '普通', '熟练', '困难', '大师', '拼刀训练', '格挡训练'];
    const diffColors = ['#66cc66', '#cccc66', '#ff9933', '#ff5555', '#ff2222', '#44aaff', '#ff88ff'];
    ctx.font = '13px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = diffColors[difficulty - 1] || '#fff';
    ctx.fillText(`难度: ${diffNames[difficulty - 1] || difficulty}`, cw / 2, 20);

    // 战斗日志
    this._drawCombatLog(ctx, cw);

    // 状态文字（角色脚下）
    // 这个在 game.js 中通过 renderer 绘制
  }

  _drawFighterHUD(ctx, fighter, x, y, isEnemy) {
    const f = fighter;
    const barW = 240;
    const barH = 16;

    // 名字
    ctx.fillStyle = isEnemy ? '#ff6666' : '#66aaff';
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(f.name, x, y + 12);

    // 血条背景
    const hpY = y + 22;
    ctx.fillStyle = '#333';
    ctx.fillRect(x, hpY, barW, barH);

    // 血条
    const hpRatio = Math.max(0, f.hp / f.maxHp);
    const hpColor = hpRatio > 0.5 ? '#44cc44' : hpRatio > 0.25 ? '#ccaa22' : '#cc3333';
    ctx.fillStyle = hpColor;
    ctx.fillRect(x, hpY, barW * hpRatio, barH);

    // 血条边框
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, hpY, barW, barH);

    // 血量数字
    ctx.fillStyle = '#fff';
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${f.hp} / ${f.maxHp}`, x + barW / 2, hpY + 12);

    // 体力点
    const stY = hpY + barH + 6;
    const dotR = 8;
    const dotGap = 4;
    for (let i = 0; i < C.STAMINA_MAX; i++) {
      const dx = x + i * (dotR * 2 + dotGap) + dotR;
      const dy = stY + dotR;
      ctx.beginPath();
      ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
      if (i < f.stamina) {
        ctx.fillStyle = f.isExhausted ? '#ff4444' : '#ffcc33';
      } else {
        ctx.fillStyle = '#333';
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 体力数字
    ctx.fillStyle = '#aaa';
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${f.stamina}/${C.STAMINA_MAX}`, x + C.STAMINA_MAX * (dotR * 2 + dotGap) + 4, stY + dotR + 4);

    // 状态标签
    const stateY = stY + dotR * 2 + 10;
    let stateText = '';
    let stateColor = '#888';
    switch (f.state) {
      case 'lightAttack':
        stateText = `轻击 ${f.comboStep}/3`;
        stateColor = '#fff';
        break;
      case 'heavyAttack':
        stateText = f.phase === 'startup' ? '重击蓄力...' : '重击!';
        stateColor = '#ff6633';
        break;
      case 'blocking':
        stateText = '招架中';
        stateColor = '#66aaff';
        break;
      case 'blockRecovery':
        stateText = '招架后摇';
        stateColor = '#4488aa';
        break;
      case 'dodging':
        stateText = f.perfectDodged ? '完美闪避!' : '闪避';
        stateColor = f.perfectDodged ? '#ffff00' : '#aaa';
        break;
      case 'staggered':
        stateText = '硬直';
        stateColor = '#ff8800';
        break;
      case 'parryStunned':
        stateText = '武器被弹!';
        stateColor = '#ffcc33';
        break;
      case 'parryCounter':
        stateText = '格挡反击!';
        stateColor = '#00ddff';
        break;
      case 'executing':
        stateText = '处决!';
        stateColor = '#ff0000';
        break;
      case 'executed':
        stateText = '被处决...';
        stateColor = '#ff0000';
        break;
      default:
        if (f.isExhausted) {
          stateText = '体力耗尽!';
          stateColor = '#ff4444';
        } else if (f.parryBoost && f.parryBoost.timer > 0) {
          stateText = '加速反击!';
          stateColor = '#66ffcc';
        }
    }
    if (stateText) {
      ctx.fillStyle = stateColor;
      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(stateText, x, stateY);
    }
  }

  _drawCombatLog(ctx, cw) {
    const x = cw / 2;
    let y = 40;
    ctx.textAlign = 'center';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    for (const log of this.combatLog) {
      const alpha = Math.min(1, log.timer);
      // 描边使文字在任何背景上都能读
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
