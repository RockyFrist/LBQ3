import * as C from '../core/constants.js';
import { stateEffectsMethods } from './state-effects.js';

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

    // 大锤开山跳跃：角色上移+放大表示空中
    const jumpH = f._ultJumpHeight || 0;
    if (jumpH > 0) {
      ctx.translate(0, -jumpH);
      const jumpScale = 1 + jumpH * 0.008;
      ctx.scale(jumpScale, jumpScale);
    }

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

    // ==== 护甲渲染 ====
    this._drawArmor(ctx, f, r, bodyColor);

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

  /** 角色脚下HP弧环 — 血量指示环 */
  _drawStaminaRing(ctx, f) {
    const hpRatio = Math.max(0, f.hp / f.maxHp);
    if (f.maxHp <= 0) return;

    const ringR = f.radius + 4;       // 环半径（紧贴身体外侧）
    const startAngle = Math.PI * 0.5;  // 从正下方开始
    const totalArc = Math.PI * 1.4;    // 总弧长（不满圆，留缺口朝上）

    ctx.save();
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    // 暗色底环（满弧）
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.arc(0, 0, ringR, startAngle - totalArc / 2, startAngle + totalArc / 2);
    ctx.stroke();

    // HP填充弧
    if (hpRatio > 0) {
      const hpArc = totalArc * hpRatio;
      const hpColor = hpRatio > 0.5 ? 'rgba(80,220,80,' : hpRatio > 0.25 ? 'rgba(220,180,30,' : 'rgba(220,50,50,';
      // 低血量脉冲
      if (hpRatio <= 0.25) {
        const pulse = Math.sin(Date.now() * 0.008) * 0.15 + 0.75;
        ctx.strokeStyle = hpColor + pulse + ')';
      } else {
        ctx.strokeStyle = hpColor + '0.85)';
      }
      ctx.beginPath();
      ctx.arc(0, 0, ringR, startAngle - totalArc / 2, startAngle - totalArc / 2 + hpArc);
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
    const wid = f.weapon ? f.weapon.id : 'dao';
    ctx.save();

    // 武器角度偏移
    let weaponOffset = 0;
    if (f.phase === 'startup' && f.attackData &&
        (f.state === 'lightAttack' || f.state === 'heavyAttack' || f.state === 'parryCounter')) {
      const progress = Math.min(1, f.phaseTimer / f.attackData.startup);
      weaponOffset = -Math.PI * 0.3 * (1 - progress * progress);
    }
    if (f.parryDeflect > 0) {
      const t = Math.min(1, f.parryDeflect / 0.35);
      const ease = t * (2 - t);
      weaponOffset = Math.PI * 0.55 * ease;
    }
    ctx.rotate(f.facing + weaponOffset);

    if (wid === 'daggers') {
      this._drawDaggers(ctx, r);
    } else if (wid === 'hammer') {
      this._drawHammer(ctx, r);
    } else if (wid === 'spear') {
      this._drawSpear(ctx, r);
    } else if (wid === 'shield') {
      this._drawSwordShield(ctx, r, f);
    } else {
      this._drawDaoSword(ctx, r);
    }

    ctx.restore();
  }

  /** 刀（默认单手刀剑） */
  _drawDaoSword(ctx, r) {
    const len = r * 2.0;
    // 握柄
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(r * 0.3, 0);
    ctx.lineTo(r * 0.55, 0);
    ctx.stroke();
    // 护手
    ctx.strokeStyle = '#aa8844';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(r * 0.55, -6);
    ctx.lineTo(r * 0.55, 6);
    ctx.stroke();
    // 剑身
    const bs = r * 0.55;
    const bg = ctx.createLinearGradient(bs, 0, len, 0);
    bg.addColorStop(0, '#ccc');
    bg.addColorStop(0.4, '#eee');
    bg.addColorStop(0.8, '#ddd');
    bg.addColorStop(1, '#fff');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(bs, -2.5);
    ctx.lineTo(len - 4, -1.8);
    ctx.lineTo(len, 0);
    ctx.lineTo(len - 4, 1.8);
    ctx.lineTo(bs, 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(bs + 2, 0);
    ctx.lineTo(len - 6, 0);
    ctx.stroke();
  }

  /** 匕首（双短刃） */
  _drawDaggers(ctx, r) {
    const len = r * 1.3;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(0, side * 3);
      // 柄
      ctx.strokeStyle = '#6B4914';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(r * 0.3, 0);
      ctx.lineTo(r * 0.45, 0);
      ctx.stroke();
      // 短刃
      const bs = r * 0.45;
      ctx.fillStyle = '#bbb';
      ctx.beginPath();
      ctx.moveTo(bs, -1.5);
      ctx.lineTo(len, 0);
      ctx.lineTo(bs, 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  /** 大锤 */
  _drawHammer(ctx, r) {
    const len = r * 1.8;
    // 长柄
    ctx.strokeStyle = '#7B5B14';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(r * 0.2, 0);
    ctx.lineTo(len - 8, 0);
    ctx.stroke();
    // 锤头
    const hw = 12, hh = 16;
    const hx = len - 8;
    ctx.fillStyle = '#888';
    ctx.fillRect(hx - 2, -hh / 2, hw, hh);
    const hg = ctx.createLinearGradient(hx, -hh / 2, hx, hh / 2);
    hg.addColorStop(0, '#aaa');
    hg.addColorStop(0.5, '#777');
    hg.addColorStop(1, '#666');
    ctx.fillStyle = hg;
    ctx.fillRect(hx, -hh / 2 + 1, hw - 2, hh - 2);
  }

  /** 长枪 */
  _drawSpear(ctx, r) {
    const len = r * 2.8;
    // 枪杆
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(r * 0.1, 0);
    ctx.lineTo(len - 10, 0);
    ctx.stroke();
    // 枪头
    const tip = len;
    const bs = len - 10;
    ctx.fillStyle = '#ccc';
    ctx.beginPath();
    ctx.moveTo(bs, -3);
    ctx.lineTo(tip, 0);
    ctx.lineTo(bs, 3);
    ctx.closePath();
    ctx.fill();
    // 红缨
    ctx.strokeStyle = '#cc3333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bs, -4);
    ctx.lineTo(bs - 5, -6);
    ctx.moveTo(bs, 0);
    ctx.lineTo(bs - 5, -2);
    ctx.moveTo(bs, 4);
    ctx.lineTo(bs - 5, 2);
    ctx.stroke();
  }

  /** 剑盾（短剑+圆盾） */
  _drawSwordShield(ctx, r, f) {
    // 短剑
    const len = r * 1.5;
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(r * 0.35, 0);
    ctx.lineTo(r * 0.50, 0);
    ctx.stroke();
    const bs = r * 0.50;
    ctx.fillStyle = '#ccc';
    ctx.beginPath();
    ctx.moveTo(bs, -2);
    ctx.lineTo(len, 0);
    ctx.lineTo(bs, 2);
    ctx.closePath();
    ctx.fill();
    // 盾牌（反向旋转回世界坐标系内画圆弧盾）
    const shieldR = r * 0.7;
    const shieldDist = r * 0.5;
    ctx.fillStyle = f.state === 'blocking' ? 'rgba(100,160,255,0.6)' : 'rgba(90,80,60,0.5)';
    ctx.beginPath();
    ctx.arc(shieldDist, 0, shieldR, -Math.PI * 0.4, Math.PI * 0.4);
    ctx.lineTo(shieldDist, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(shieldDist, 0, shieldR, -Math.PI * 0.4, Math.PI * 0.4);
    ctx.stroke();
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

  /** 护甲渲染 — 在身体圆上叠绘护甲层 */
  _drawArmor(ctx, f, r, bodyColor) {
    const armor = f.armor;
    if (!armor || armor.renderLayer === 'none') return;

    const t = armor.thickness || 2;
    const ac = armor.armorColor || '#666';

    ctx.save();
    if (armor.renderLayer === 'light') {
      // 布甲: 半透明外环 + 交叉纹理
      ctx.strokeStyle = ac;
      ctx.lineWidth = t;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
      ctx.stroke();
      // 交叉布纹
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.15;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
        ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
        ctx.stroke();
      }
    } else if (armor.renderLayer === 'medium') {
      // 皮甲: 较宽的半弧甲片（胸前+肩部）
      ctx.strokeStyle = ac;
      ctx.lineWidth = t;
      ctx.globalAlpha = 0.45;
      // 胸甲弧
      ctx.beginPath();
      ctx.arc(0, 0, r - 1, -Math.PI * 0.7, Math.PI * 0.7);
      ctx.stroke();
      // 肩部片
      ctx.fillStyle = ac;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(0, -r * 0.5, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, r * 0.5, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    } else if (armor.renderLayer === 'heavy') {
      // 铁甲: 厚实外环 + 金属纹 + 铆钉
      ctx.strokeStyle = ac;
      ctx.lineWidth = t;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
      ctx.stroke();
      // 金属光泽条
      ctx.strokeStyle = 'rgba(200,200,220,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r - 3, -Math.PI * 0.3, Math.PI * 0.3);
      ctx.stroke();
      // 铆钉
      ctx.fillStyle = 'rgba(180,180,200,0.5)';
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
        ctx.beginPath();
        ctx.arc(Math.cos(a) * (r - 2), Math.sin(a) * (r - 2), 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (armor.renderLayer === 'plate') {
      // 板甲: 最厚层 + 分段甲片 + 金属反光
      ctx.strokeStyle = ac;
      ctx.lineWidth = t + 1;
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      // 分段甲片
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(100,110,130,0.5)';
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.stroke();
      }
      // 反光带
      ctx.strokeStyle = 'rgba(220,220,240,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r - 2, -Math.PI * 0.4, Math.PI * 0.1);
      ctx.stroke();
      // 大铆钉
      ctx.fillStyle = 'rgba(160,165,180,0.6)';
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
        ctx.beginPath();
        ctx.arc(Math.cos(a) * (r - 1), Math.sin(a) * (r - 1), 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
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

// 混入状态特效渲染方法
Object.assign(Renderer.prototype, stateEffectsMethods);
