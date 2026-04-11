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

    // ===== 异人之下/格斗游戏风格顶部血条 =====
    const topY = 16;           // 顶部起始Y
    const barH = 20;           // 血条高度
    const barGap = 12;         // 左右条之间间隔
    const barMaxW = Math.min(cw * 0.38, 360); // 每侧血条最大宽度
    const centerX = cw / 2;
    const staminaH = 8;        // 体力条高度
    const staminaY = topY + barH + 4;

    // --- 玩家（左侧，从中间向左延伸）---
    this._drawFightingBar(ctx, player, centerX - barGap / 2, topY, barMaxW, barH, staminaY, staminaH, false);

    // --- 敌人（右侧，从中间向右延伸）---
    if (targetEnemy && targetEnemy.alive) {
      this._drawFightingBar(ctx, targetEnemy, centerX + barGap / 2, topY, barMaxW, barH, staminaY, staminaH, true);
    }

    // VS标识
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('VS', centerX, topY + barH / 2 + 4);

    // 顶部中央难度（在VS下方）
    const diffNames = ['新手', '普通', '熟练', '困难', '大师', '拼刀训练', '格挡训练'];
    const diffColors = ['#66cc66', '#cccc66', '#ff9933', '#ff5555', '#ff2222', '#44aaff', '#ff88ff'];
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = diffColors[difficulty - 1] || '#fff';
    ctx.fillText(`难度 ${diffNames[difficulty - 1] || difficulty}`, centerX, staminaY + staminaH + 14);

    // 战斗日志
    this._drawCombatLog(ctx, cw);
  }

  _drawFightingBar(ctx, f, edgeX, topY, maxW, barH, staminaY, staminaH, isRight) {
    const hpRatio = Math.max(0, f.hp / f.maxHp);

    // 血条背景
    const bgX = isRight ? edgeX : edgeX - maxW;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bgX, topY, maxW, barH);

    // 血条填充（从中间向外延伸）
    const hpW = maxW * hpRatio;
    const hpColor = hpRatio > 0.5 ? '#44cc44' : hpRatio > 0.25 ? '#ccaa22' : '#cc3333';
    ctx.fillStyle = hpColor;
    if (isRight) {
      ctx.fillRect(edgeX, topY, hpW, barH);
    } else {
      ctx.fillRect(edgeX - hpW, topY, hpW, barH);
    }

    // 低血量脉冲效果
    if (hpRatio <= 0.25 && hpRatio > 0) {
      const pulse = Math.sin(Date.now() * 0.008) * 0.15 + 0.15;
      ctx.fillStyle = `rgba(255,50,50,${pulse})`;
      if (isRight) {
        ctx.fillRect(edgeX, topY, hpW, barH);
      } else {
        ctx.fillRect(edgeX - hpW, topY, hpW, barH);
      }
    }

    // 血条边框
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bgX, topY, maxW, barH);

    // 血量数字
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${f.hp}/${f.maxHp}`, bgX + maxW / 2, topY + barH / 2 + 4);

    // 名字（外侧）
    ctx.fillStyle = isRight ? '#ff8888' : '#88bbff';
    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.textAlign = isRight ? 'right' : 'left';
    const nameX = isRight ? edgeX + maxW - 4 : edgeX - maxW + 4;
    ctx.fillText(f.name, nameX, topY - 3);

    // ===== 体力条（分段式） =====
    const stBgX = bgX;
    const segGap = 2;
    const totalGap = segGap * (C.STAMINA_MAX - 1);
    const segW = (maxW - totalGap) / C.STAMINA_MAX;

    for (let i = 0; i < C.STAMINA_MAX; i++) {
      const idx = isRight ? i : (C.STAMINA_MAX - 1 - i);
      const sx = stBgX + idx * (segW + segGap);

      // 背景
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(sx, staminaY, segW, staminaH);

      // 填充
      if (i < f.stamina) {
        ctx.fillStyle = f.isExhausted ? '#ff4444' : '#ffcc33';
        ctx.fillRect(sx, staminaY, segW, staminaH);
      }
    }

    // 体力耗尽闪烁
    if (f.isExhausted) {
      const flash = Math.sin(Date.now() * 0.01) * 0.3 + 0.3;
      ctx.fillStyle = `rgba(255,50,50,${flash})`;
      ctx.fillRect(stBgX, staminaY, maxW, staminaH);
    }

    // 状态标签（血条下方）
    const stateY = staminaY + staminaH + 12;
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
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      ctx.textAlign = isRight ? 'left' : 'right';
      const stateX = isRight ? edgeX + 4 : edgeX - 4;
      ctx.fillText(stateText, stateX, stateY);
    }
  }

  _drawCombatLog(ctx, cw) {
    const ch = this.canvas._logicH || this.canvas.height;
    const x = cw / 2;
    let y = 90; // 下移，不与顶部血条重叠
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
