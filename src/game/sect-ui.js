// ===================== 宗门风云 · Canvas UI 渲染 =====================
// 所有管理界面的绘制逻辑（纯Canvas，竖屏优先）

import {
  BUILDINGS, BUILDING_LIST, WEAPON_NAMES, ARMOR_NAMES, TRAITS,
  QUEST_TYPES, maxDisciples, availableArmors, expToLevel,
  ITEM_QUALITY, itemLabel, WEAPON_IDS,
  FAME_TIERS, getFameTier, SHOP_POOL,
  PERSONALITY_TYPES, LEADER_BONUSES,
  isBuildingUnlocked,
} from './sect-data.js';
import { getDialogueFlags } from './sect-dialogues.js';
import { isAutoSaveOn } from './sect-save.js';

// ===== 颜色常量 =====
const COL_BG       = '#0a0a14';
const COL_PANEL    = 'rgba(255,255,255,0.04)';
const COL_PANEL_HI = 'rgba(255,255,255,0.09)';
const COL_BORDER   = 'rgba(255,255,255,0.08)';
const COL_ACCENT   = '#ffcc44';
const COL_GOLD     = '#ffd700';
const COL_FAME     = '#ff6699';
const COL_HP_OK    = '#44dd88';
const COL_HP_HURT  = '#ff6644';
const COL_TEXT     = '#ccc';
const COL_DIM      = '#666';
const COL_BTN      = '#4499ff';
const COL_DANGER   = '#ff4444';
const COL_SUCCESS  = '#44dd88';
const FONT = '"Microsoft YaHei", sans-serif';

// ===== 工具函数 =====
function hit(mx, my, x, y, w, h) {
  return mx >= x && mx <= x + w && my >= y && my <= y + h;
}

function drawBtn(ctx, rect, label, color, mx, my, opts = {}) {
  const hovered = hit(mx, my, rect.x, rect.y, rect.w, rect.h);
  const disabled = opts.disabled;
  ctx.fillStyle = disabled ? 'rgba(255,255,255,0.01)' : hovered ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = disabled ? 'rgba(255,255,255,0.05)' : hovered ? color : 'rgba(255,255,255,0.12)';
  ctx.lineWidth = hovered && !disabled ? 1.5 : 1;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = disabled ? '#444' : hovered ? '#fff' : '#bbb';
  ctx.font = `bold ${opts.fontSize || 13}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + (opts.fontSize ? opts.fontSize * 0.2 : 4));
  return hovered && !disabled;
}

function drawBar(ctx, x, y, w, h, ratio, color, bgColor = 'rgba(255,255,255,0.06)') {
  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, ratio)), h);
}

function wrapText(ctx, text, maxW) {
  const words = text.split('');
  let line = '';
  const lines = [];
  for (const ch of words) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ===== 星级显示 =====
function starsText(talent) {
  return '★'.repeat(talent) + '☆'.repeat(Math.max(0, 5 - talent));
}

// ===== 阶段中文 =====
const PHASE_NAMES = { morning: '晨', noon: '午', night: '夜' };

// ===== 主绘制类 =====
export class SectUI {
  constructor() {
    this._buttons = []; // 当前帧可点击区域
    this._scrollY = 0;
    this._imgCache = new Map(); // 图片缓存（path → HTMLImageElement）
    this._defeatedImgAnim = 0;  // 战败立绘动画时间戳（0=未启动）
    // 预加载女敌人立绘（3套 × 正常/战败 = 6张）
    for (let i = 1; i <= 3; i++) {
      this._getImg(`${import.meta.env.BASE_URL}assets/enemies/f_${i}_normal.png`);
      this._getImg(`${import.meta.env.BASE_URL}assets/enemies/f_${i}_defeated.png`);
    }
  }

  /** 获取/缓存图片（懒加载，首次请求时异步加载） */
  _getImg(path) {
    if (!this._imgCache.has(path)) {
      const img = new Image();
      img.src = path;
      this._imgCache.set(path, img);
    }
    return this._imgCache.get(path);
  }

  /** 收集按钮点击，返回 action 或 null（倒序遍历，后绘制的弹窗优先） */
  handleClick(mx, my) {
    for (let i = this._buttons.length - 1; i >= 0; i--) {
      const btn = this._buttons[i];
      if (hit(mx, my, btn.x, btn.y, btn.w, btn.h)) {
        if (btn.disabled) continue;
        return btn.action;
      }
    }
    return null;
  }

  /** 主绘制入口 */
  draw(ctx, cw, ch, state, subPage, mx, my) {
    this._buttons = [];
    const isNarrow = cw < 500;
    const pad = isNarrow ? 10 : 16;
    const topH = isNarrow ? 60 : 70;

    // 背景
    ctx.fillStyle = COL_BG;
    ctx.fillRect(0, 0, cw, ch);

    // 顶栏
    this._drawTopBar(ctx, cw, topH, state, mx, my, isNarrow);

    // 主内容区
    const contentY = topH + 4;
    const contentH = ch - contentY - (isNarrow ? 72 : 80);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, contentY, cw, contentH);
    ctx.clip();

    switch (subPage) {
      case 'main':
        this._drawDashboard(ctx, pad, contentY + 4, cw - pad * 2, contentH - 8, state, mx, my, isNarrow);
        break;
      case 'buildings':
        this._drawBuildingsPanel(ctx, pad, contentY + 4, cw - pad * 2, contentH - 8, state, mx, my, isNarrow);
        break;
      case 'inventory': case 'market':
        this._drawInventoryPanel(ctx, pad, contentY + 4, cw - pad * 2, contentH - 8, state, mx, my, isNarrow);
        break;
      case 'shop':
        this._drawShopPanel(ctx, pad, contentY + 4, cw - pad * 2, contentH - 8, state, mx, my, isNarrow);
        break;
      case 'disciple_detail':
        this._drawDiscipleDetail(ctx, pad, contentY + 4, cw - pad * 2, contentH - 8, state, mx, my, isNarrow);
        break;
    }

    ctx.restore();

    // 底部操作栏
    this._drawBottomBar(ctx, cw, ch, state, subPage, mx, my, isNarrow);
  }

  // ===== 顶栏 =====
  _drawTopBar(ctx, cw, h, state, mx, my, narrow) {
    ctx.fillStyle = 'rgba(20,15,30,0.95)';
    ctx.fillRect(0, 0, cw, h);
    ctx.strokeStyle = COL_BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(cw, h); ctx.stroke();

    const fs = narrow ? 14 : 18;
    ctx.textAlign = 'left';
    ctx.fillStyle = COL_ACCENT;
    ctx.font = `bold ${fs}px ${FONT}`;
    ctx.fillText(`🏯 ${state.sectName}`, 10, narrow ? 20 : 26);

    ctx.fillStyle = COL_DIM;
    ctx.font = `${narrow ? 10 : 12}px ${FONT}`;
    ctx.fillText(`第${state.day}天 · ${PHASE_NAMES[state.phase] || '晨'}`, 10, narrow ? 36 : 44);

    // 声望阶段标签
    const fameTier = getFameTier(state.fame);
    ctx.fillStyle = fameTier.color;
    ctx.font = `${narrow ? 9 : 11}px ${FONT}`;
    ctx.fillText(`[${fameTier.label}]`, 10, narrow ? 50 : 60);

    // 资源
    ctx.textAlign = 'right';
    ctx.font = `bold ${narrow ? 11 : 13}px ${FONT}`;
    const rx = cw - (narrow ? 34 : 40); // 留出设置按钮空间
    ctx.fillStyle = COL_GOLD;
    ctx.fillText(`💰 ${state.gold}`, rx, narrow ? 18 : 22);
    ctx.fillStyle = COL_FAME;
    ctx.fillText(`🏆 ${state.fame}`, rx, narrow ? 34 : 40);
    ctx.fillStyle = COL_TEXT;
    ctx.fillText(`👥 ${state.disciples.length}/${maxDisciples(state.buildings.barracks)}`, rx, narrow ? 50 : 58);

    // ⚙ 设置按钮（右上角）
    const gearSize = narrow ? 28 : 32;
    const gearX = cw - gearSize - (narrow ? 4 : 6);
    const gearY = (h - gearSize) / 2;
    const gearHovered = hit(mx, my, gearX, gearY, gearSize, gearSize);
    ctx.fillStyle = gearHovered ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(gearX, gearY, gearSize, gearSize);
    ctx.strokeStyle = gearHovered ? COL_ACCENT : COL_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(gearX, gearY, gearSize, gearSize);
    ctx.textAlign = 'center';
    ctx.font = `${narrow ? 16 : 18}px ${FONT}`;
    ctx.fillStyle = '#ccc';
    ctx.fillText('⚙', gearX + gearSize / 2, gearY + gearSize / 2 + 6);
    this._buttons.push({ x: gearX, y: gearY, w: gearSize, h: gearSize, action: { type: 'action', id: 'settings' } });
  }

  // ===== 底部操作栏 =====
  _drawBottomBar(ctx, cw, ch, state, subPage, mx, my, narrow) {
    const barH = narrow ? 52 : 60;
    const barY = ch - barH;
    ctx.fillStyle = 'rgba(20,15,30,0.95)';
    ctx.fillRect(0, barY, cw, barH);
    ctx.strokeStyle = COL_BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, barY); ctx.lineTo(cw, barY); ctx.stroke();

    if (subPage !== 'main') {
      // 子页面：返回按钮
      const btnH = barH - 14;
      const rect = { x: 10, y: barY + 7, w: cw - 20, h: btnH };
      drawBtn(ctx, rect, '← 返回总览', COL_ACCENT, mx, my, { fontSize: narrow ? 13 : 15 });
      this._buttons.push({ ...rect, action: { type: 'nav', page: 'main' } });
      return;
    }

    // 仪表盘底栏：[图标按钮] + [🌙 下一天]
    const gap = narrow ? 4 : 6;
    const btnH = barH - 14;
    const endDayW = narrow ? 90 : 110;

    const iconBtns = [];
    if (state.day >= 2) iconBtns.push({ label: '🏗', page: 'buildings' });
    if (state.day >= 2) iconBtns.push({ label: '🛒', page: 'shop' });
    iconBtns.push({ label: '📦', page: 'inventory' });
    if (state.day >= 4 || state.stats.totalFights > 0) {
      iconBtns.push({ label: '⚔', action: { type: 'action', id: 'spar' } });
    }

    const iconTotalW = cw - 20 - endDayW - gap;
    const iconBtnW = iconBtns.length > 0 ? (iconTotalW - (iconBtns.length - 1) * gap) / iconBtns.length : 0;

    for (let i = 0; i < iconBtns.length; i++) {
      const ic = iconBtns[i];
      const bx = 10 + i * (iconBtnW + gap);
      const rect = { x: bx, y: barY + 7, w: iconBtnW, h: btnH };
      drawBtn(ctx, rect, ic.label, '#888', mx, my, { fontSize: narrow ? 16 : 18 });
      const action = ic.page ? { type: 'nav', page: ic.page } : ic.action;
      this._buttons.push({ ...rect, action });
    }

    // "下一天" 按钮
    const endX = cw - 10 - endDayW;
    const endRect = { x: endX, y: barY + 7, w: endDayW, h: btnH };
    drawBtn(ctx, endRect, '🌙 下一天', COL_ACCENT, mx, my, { fontSize: narrow ? 12 : 14 });
    this._buttons.push({ ...endRect, action: { type: 'action', id: 'nextDay' } });
  }

  // ===== 仪表盘（单屏总览：弟子 + 任务 + 日志）=====
  _drawDashboard(ctx, x, y, w, h, state, mx, my, narrow) {
    let cy = y;
    const smallFs = narrow ? 10 : 11;

    // ── 大弟子 ──
    const leader = state.disciples.find(d => d.id === state.leaderId);
    if (leader) {
      const lH = narrow ? 28 : 34;
      ctx.fillStyle = COL_PANEL;
      ctx.fillRect(x, cy, w, lH);
      ctx.textAlign = 'left';
      ctx.fillStyle = COL_ACCENT;
      ctx.font = `bold ${narrow ? 11 : 13}px ${FONT}`;
      const pInfo = PERSONALITY_TYPES[leader.personality];
      const bonus = LEADER_BONUSES[leader.personality];
      ctx.fillText(`⭐ ${leader.name} ${pInfo?.icon || ''} ${bonus?.desc || '经验+50%'}`, x + 8, cy + (narrow ? 18 : 22));
      if (state.disciples.length > 1) {
        const bW = narrow ? 40 : 48;
        const bRect = { x: x + w - bW - 4, y: cy + 3, w: bW, h: lH - 6 };
        drawBtn(ctx, bRect, '切换', '#888', mx, my, { fontSize: narrow ? 9 : 10 });
        this._buttons.push({ ...bRect, action: { type: 'action', id: 'cycleLeader' } });
      }
      cy += lH + 4;
    }

    // ── 弟子列表 ──
    ctx.textAlign = 'left';
    ctx.fillStyle = COL_DIM;
    ctx.font = `bold ${smallFs}px ${FONT}`;
    ctx.fillText(`👥 弟子 (${state.disciples.length}/${maxDisciples(state.buildings.barracks)})`, x, cy + 10);
    cy += 16;

    const cardH = narrow ? 36 : 42;
    const cardGap = 3;
    for (const d of state.disciples) {
      const hovered = hit(mx, my, x, cy, w, cardH);
      ctx.fillStyle = hovered ? COL_PANEL_HI : COL_PANEL;
      ctx.fillRect(x, cy, w, cardH);
      // 颜色条
      ctx.fillStyle = d.color || '#888';
      ctx.fillRect(x, cy, 3, cardH);

      const isLeader = state.leaderId === d.id;
      ctx.textAlign = 'left';
      ctx.fillStyle = COL_TEXT;
      ctx.font = `bold ${narrow ? 11 : 12}px ${FONT}`;
      ctx.fillText(`${isLeader ? '⭐' : ''}${d.name} Lv${d.level}`, x + 8, cy + (narrow ? 14 : 16));

      ctx.fillStyle = COL_DIM;
      ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
      const weaponName = WEAPON_NAMES[d.weaponId] || '?';
      ctx.fillText(`${starsText(d.talent)} ${weaponName}`, x + 8, cy + (narrow ? 26 : 30));

      // 状态
      let status, statusColor;
      if (d.onQuest) { status = '📜出征'; statusColor = '#ffaa44'; }
      else if (d.injury > 50) { status = '🤕重伤'; statusColor = '#ff4444'; }
      else if (d.injury > 20) { status = '🩹受伤'; statusColor = '#ff8844'; }
      else { status = '✅待命'; statusColor = '#44dd88'; }
      ctx.textAlign = 'right';
      ctx.fillStyle = statusColor;
      ctx.font = `${narrow ? 10 : 11}px ${FONT}`;
      ctx.fillText(status, x + w - 8, cy + (narrow ? 14 : 16));

      // 经验条
      const barW = narrow ? 50 : 70;
      const expNeed = expToLevel(d.level);
      drawBar(ctx, x + w - barW - 8, cy + (narrow ? 22 : 26), barW, 4, d.exp / expNeed, '#4499ff');
      ctx.fillStyle = '#666';
      ctx.font = `${narrow ? 8 : 9}px ${FONT}`;
      ctx.fillText(`${Math.floor(d.exp / expNeed * 100)}%`, x + w - 8, cy + (narrow ? 30 : 34));

      this._buttons.push({ x, y: cy, w, h: cardH, action: { type: 'selectDisciple', id: d.id } });
      cy += cardH + cardGap;
    }
    cy += 6;

    // ── 今日任务 ──
    ctx.textAlign = 'left';
    ctx.fillStyle = COL_DIM;
    ctx.font = `bold ${smallFs}px ${FONT}`;
    const quests = state.quests || [];
    ctx.fillText(`📜 今日任务 (${quests.length})`, x, cy + 10);
    cy += 16;

    if (quests.length === 0) {
      ctx.fillStyle = '#555';
      ctx.font = `${smallFs}px ${FONT}`;
      ctx.fillText('暂无可用任务', x + 8, cy + 12);
      cy += 20;
    } else {
      const qH = narrow ? 32 : 36;
      for (let i = 0; i < quests.length; i++) {
        const q = quests[i];
        ctx.fillStyle = COL_PANEL;
        ctx.fillRect(x, cy, w, qH);
        const riskColor = q.risk === 'high' || q.risk === 'extreme' ? '#ff6644' : q.risk === 'mid' ? '#ffaa44' : '#44dd88';
        ctx.fillStyle = riskColor;
        ctx.fillRect(x + w - 4, cy, 4, qH);

        ctx.textAlign = 'left';
        ctx.fillStyle = COL_TEXT;
        ctx.font = `${narrow ? 11 : 12}px ${FONT}`;
        ctx.fillText(`${q.icon} ${q.name}`, x + 8, cy + (narrow ? 13 : 15));
        ctx.fillStyle = COL_DIM;
        ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
        ctx.fillText(`D${q.enemyDiff} · ${q.reward.gold}💰 ${q.reward.fame}🏆`, x + 8, cy + (narrow ? 25 : 29));

        const dbW = narrow ? 48 : 54;
        const dbRect = { x: x + w - dbW - 10, y: cy + 3, w: dbW, h: qH - 6 };
        const hasFree = state.disciples.some(d => !d.onQuest && d.injury < 50 && d.stamina >= 20);
        drawBtn(ctx, dbRect, '派遣', COL_BTN, mx, my, { fontSize: narrow ? 10 : 11, disabled: !hasFree });
        if (hasFree) {
          this._buttons.push({ ...dbRect, action: { type: 'action', id: 'assignQuest', questIndex: i } });
        }
        cy += qH + 2;
      }
    }
    cy += 6;

    // ── 最近日志 ──
    if (state.log.length > 0) {
      ctx.textAlign = 'left';
      ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
      const recent = state.log.slice(0, 4);
      for (const entry of recent) {
        ctx.fillStyle = entry.color || '#555';
        ctx.fillText(entry.text, x, cy + 10);
        cy += narrow ? 14 : 16;
      }
    }
  }

  // ===== 弟子列表面板 =====
  _drawDisciplesPanel(ctx, x, y, w, h, state, mx, my, narrow) {
    let cy = y;
    ctx.textAlign = 'left';
    ctx.fillStyle = COL_ACCENT;
    ctx.font = `bold ${narrow ? 14 : 16}px ${FONT}`;
    ctx.fillText(`👥 弟子 (${state.disciples.length}/${maxDisciples(state.buildings.barracks)})`, x, cy + 14);
    cy += 24;

    if (state.disciples.length === 0) {
      ctx.fillStyle = COL_DIM;
      ctx.font = `${narrow ? 12 : 14}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('暂无弟子', x + w / 2, cy + 40);
      return;
    }

    const cardH = narrow ? 62 : 72;
    const gap = narrow ? 5 : 6;
    for (let i = 0; i < state.disciples.length; i++) {
      const d = state.disciples[i];
      const cardY = cy + i * (cardH + gap);
      if (cardY + cardH > y + h + 50) break; // 超出可视区跳过

      // 状态颜色
      const needsAttention = !d.onQuest && (d.injury > 50 || d.loyalty < 40);
      const hovered = hit(mx, my, x, cardY, w, cardH);
      ctx.fillStyle = hovered ? COL_PANEL_HI : COL_PANEL;
      ctx.fillRect(x, cardY, w, cardH);
      ctx.strokeStyle = d.onQuest ? '#ffaa44' : needsAttention ? COL_DANGER : hovered ? COL_ACCENT : COL_BORDER;
      ctx.lineWidth = needsAttention || d.onQuest ? 1.5 : 1;
      ctx.strokeRect(x, cardY, w, cardH);

      // 颜色条
      ctx.fillStyle = d.color || '#888';
      ctx.fillRect(x, cardY, 4, cardH);

      // 名字 + 状态徽章
      ctx.textAlign = 'left';
      ctx.fillStyle = '#eee';
      ctx.font = `bold ${narrow ? 12 : 14}px ${FONT}`;
      ctx.fillText(`${d.name}`, x + 10, cardY + (narrow ? 16 : 18));

      // 状态徽章（名字右侧）
      const nameW = ctx.measureText(d.name).width;
      const badgeX = x + 10 + nameW + 6;
      let badgeText = '', badgeColor = COL_SUCCESS;
      if (d.onQuest)           { badgeText = '出征'; badgeColor = '#ffaa44'; }
      else if (d.injury > 70)  { badgeText = '重伤'; badgeColor = COL_DANGER; }
      else if (d.injury > 30)  { badgeText = '受伤'; badgeColor = '#ff8844'; }
      else if (d.stamina < 20) { badgeText = '疲惫'; badgeColor = '#aaa'; }
      else if (d.loyalty < 40) { badgeText = '不满'; badgeColor = '#cc44cc'; }
      else if (d.level >= d.talent) { badgeText = '大成'; badgeColor = '#ffdd33'; }
      if (badgeText) {
        ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
        ctx.fillStyle = badgeColor;
        ctx.fillText(badgeText, badgeX, cardY + (narrow ? 16 : 18));
      }

      ctx.fillStyle = COL_DIM;
      ctx.font = `${narrow ? 10 : 11}px ${FONT}`;
      ctx.fillText(`Lv${d.level} · ${WEAPON_NAMES[d.weaponId] || '?'} · ${ARMOR_NAMES[d.armorId] || '无甲'}`, x + 10, cardY + (narrow ? 30 : 34));

      // 特质 + 战绩
      let traitX = x + 10;
      ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
      for (const tid of d.traits) {
        const t = TRAITS[tid];
        if (!t) continue;
        ctx.fillStyle = t.color;
        ctx.fillText(t.name, traitX, cardY + (narrow ? 44 : 50));
        traitX += ctx.measureText(t.name).width + 5;
      }
      ctx.fillStyle = COL_DIM;
      ctx.fillText(`${d.wins}胜${d.losses}负`, traitX, cardY + (narrow ? 44 : 50));

      // 右侧 — 资质星 + 条带标签
      const rx = x + w - 8;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#dd8';
      ctx.font = `${narrow ? 10 : 11}px ${FONT}`;
      ctx.fillText(starsText(d.talent), rx, cardY + (narrow ? 16 : 18));

      const barW = narrow ? 52 : 68;
      const barLabelX = rx - barW - 3;
      const expNeed = expToLevel(d.level);
      const hpRatio = (100 - d.injury) / 100;

      ctx.textAlign = 'right'; ctx.fillStyle = COL_DIM; ctx.font = `${narrow ? 8 : 9}px ${FONT}`;
      ctx.fillText('经验', barLabelX, cardY + (narrow ? 24 : 27));
      drawBar(ctx, rx - barW, cardY + (narrow ? 20 : 22), barW, 4, d.exp / expNeed, '#4499ff');

      ctx.fillText('血量', barLabelX, cardY + (narrow ? 34 : 37));
      drawBar(ctx, rx - barW, cardY + (narrow ? 30 : 32), barW, 4, hpRatio, hpRatio > 0.5 ? COL_HP_OK : COL_HP_HURT);

      ctx.fillText('体力', barLabelX, cardY + (narrow ? 44 : 47));
      drawBar(ctx, rx - barW, cardY + (narrow ? 40 : 42), barW, 4, d.stamina / 100, d.stamina > 40 ? '#ffcc44' : '#aa6622');

      ctx.fillText('忠诚', barLabelX, cardY + (narrow ? 54 : 58));
      drawBar(ctx, rx - barW, cardY + (narrow ? 50 : 53), barW, 4, d.loyalty / 100, d.loyalty > 50 ? '#8888ff' : COL_DANGER);

      this._buttons.push({ x, y: cardY, w, h: cardH, action: { type: 'selectDisciple', id: d.id } });
    }
  }

  // ===== 弟子详情面板 =====
  _drawDiscipleDetail(ctx, x, y, w, h, state, mx, my, narrow) {
    const d = state._selectedDisciple;
    if (!d) return;

    let cy = y;
    const fs = narrow ? 12 : 14;

    // 返回按钮
    const backRect = { x, y: cy, w: 60, h: 24 };
    drawBtn(ctx, backRect, '← 返回', COL_DIM, mx, my, { fontSize: 11 });
    this._buttons.push({ ...backRect, action: { type: 'nav', page: 'main' } });
    cy += 32;

    // 头部
    ctx.fillStyle = COL_PANEL;
    ctx.fillRect(x, cy, w, narrow ? 60 : 70);
    ctx.fillStyle = d.color || '#888';
    ctx.fillRect(x, cy, 5, narrow ? 60 : 70);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${narrow ? 16 : 20}px ${FONT}`;
    ctx.fillText(d.name, x + 14, cy + (narrow ? 22 : 28));
    ctx.fillStyle = '#dd8';
    ctx.font = `${fs}px ${FONT}`;
    // 武器名带品质颜色
    const wQCol = ITEM_QUALITY[d.weaponQuality || 'normal']?.color || '#ddd';
    const aQCol = ITEM_QUALITY[d.armorQuality || 'normal']?.color || '#ddd';
    const wLabel = itemLabel(WEAPON_NAMES[d.weaponId] || '?', d.weaponQuality || 'normal');
    const aLabel = itemLabel(ARMOR_NAMES[d.armorId] || '无甲', d.armorQuality || 'normal');
    ctx.fillText(`${starsText(d.talent)} · Lv${d.level}`, x + 14, cy + (narrow ? 42 : 52));
    // 个性标签
    const _pDet = PERSONALITY_TYPES[d.personality];
    if (_pDet) {
      const _sw = ctx.measureText(`${starsText(d.talent)} · Lv${d.level}`).width;
      ctx.fillStyle = _pDet.color;
      ctx.font = `bold ${narrow ? 10 : 12}px ${FONT}`;
      ctx.fillText(`  ${_pDet.icon}${_pDet.name}`, x + 14 + _sw, cy + (narrow ? 42 : 52));
    }
    ctx.fillStyle = wQCol;
    ctx.fillText(`⚔ ${wLabel}`, x + 14, cy + (narrow ? 54 : 64));
    ctx.fillStyle = aQCol;
    ctx.fillText(`🛡 ${aLabel}`, x + (narrow ? 90 : 120), cy + (narrow ? 54 : 64));
    ctx.fillStyle = COL_DIM;
    ctx.fillText(`${d.wins}胜${d.losses}负 · 入门第${state.day - d.joinDay + 1}天`, x + 14, cy + (narrow ? 66 : 78));
    cy += (narrow ? 74 : 88);

    // 状态条
    const barW2 = w - 80;
    const barH2 = narrow ? 8 : 10;
    const barGap = narrow ? 20 : 24;
    const labels = [
      { label: '经验', val: d.exp, max: expToLevel(d.level), color: '#4499ff' },
      { label: '血量', val: 100 - d.injury, max: 100, color: (100 - d.injury) > 50 ? COL_HP_OK : COL_HP_HURT },
      { label: '体力', val: d.stamina, max: 100, color: '#ffcc44' },
      { label: '忠诚', val: d.loyalty, max: 100, color: d.loyalty > 50 ? '#8888ff' : COL_DANGER },
    ];
    for (const bar of labels) {
      ctx.textAlign = 'left';
      ctx.fillStyle = COL_TEXT;
      ctx.font = `${narrow ? 10 : 12}px ${FONT}`;
      ctx.fillText(`${bar.label} ${bar.val}/${bar.max}`, x, cy + barH2);
      drawBar(ctx, x + 68, cy, barW2, barH2, bar.val / bar.max, bar.color);
      cy += barGap;
    }

    // 特质
    ctx.textAlign = 'left';
    ctx.fillStyle = COL_DIM;
    ctx.font = `bold ${narrow ? 11 : 12}px ${FONT}`;
    ctx.fillText('特质:', x, cy + 12);
    let tx = x + 40;
    for (const tid of d.traits) {
      const t = TRAITS[tid];
      if (!t) continue;
      ctx.fillStyle = t.color;
      ctx.font = `${narrow ? 11 : 12}px ${FONT}`;
      ctx.fillText(`${t.name}(${t.desc})`, tx, cy + 12);
      tx += ctx.measureText(`${t.name}(${t.desc})`).width + 10;
    }
    if (d.traits.length === 0) {
      ctx.fillStyle = COL_DIM;
      ctx.fillText('无', tx, cy + 12);
    }
    cy += 28;

    // 领头弟子按钮
    const isLeader = state.leaderId === d.id;
    const leaderH = narrow ? 28 : 32;
    const leaderRect = { x, y: cy, w, h: leaderH };
    const leaderLabel = isLeader ? '⭐ 当前大弟子' : '⭐ 设为大弟子';
    const leaderColor = isLeader ? '#ffcc44' : '#777';
    drawBtn(ctx, leaderRect, leaderLabel, leaderColor, mx, my, { fontSize: narrow ? 11 : 12 });
    if (!d.onQuest) this._buttons.push({ ...leaderRect, action: { type: 'action', id: 'setLeader', discipleId: d.id } });
    if (isLeader) {
      const bonus = LEADER_BONUSES[d.personality];
      if (bonus) {
        cy += leaderH + 2;
        ctx.fillStyle = '#aa88ff';
        ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
        ctx.fillText(`领头效果: ${bonus.name} — ${bonus.desc}`, x, cy + 10);
        cy += 14;
      }
    }
    cy += leaderH + 8;

    // 操作按钮（换装）
    const btnH = narrow ? 34 : 38;
    const btnGap = 6;
    const btnW2 = (w - btnGap) / 2;
    const equipOps = [
      { label: '⚔ 换武器', action: { type: 'action', id: 'changeWeapon', discipleId: d.id }, color: '#44aaff',
        disabled: d.onQuest },
      { label: '🛡 换护甲', action: { type: 'action', id: 'changeArmor', discipleId: d.id }, color: '#44dd88',
        disabled: d.onQuest },
    ];
    for (let i = 0; i < equipOps.length; i++) {
      const bx = x + i * (btnW2 + btnGap);
      const rect = { x: bx, y: cy, w: btnW2, h: btnH };
      drawBtn(ctx, rect, equipOps[i].label, equipOps[i].color, mx, my, { disabled: equipOps[i].disabled, fontSize: narrow ? 11 : 12 });
      if (!equipOps[i].disabled) this._buttons.push({ ...rect, action: equipOps[i].action });
    }
    cy += btnH + 16;

    // 开除按钮（独立一行，较小字体，需二次确认）
    const dismissW = narrow ? 70 : 80;
    const dismissH = narrow ? 26 : 30;
    const dismissRect = { x: x + w - dismissW, y: cy, w: dismissW, h: dismissH };
    drawBtn(ctx, dismissRect, '开除', COL_DANGER, mx, my, { fontSize: narrow ? 10 : 11 });
    this._buttons.push({ ...dismissRect, action: { type: 'action', id: 'dismiss', discipleId: d.id } });
  }

  // ===== 建造面板 =====
  _drawBuildingsPanel(ctx, x, y, w, h, state, mx, my, narrow) {
    let cy = y;
    ctx.textAlign = 'left';
    ctx.fillStyle = COL_ACCENT;
    ctx.font = `bold ${narrow ? 14 : 16}px ${FONT}`;
    ctx.fillText('🏗 设施建设', x, cy + 14);
    cy += 26;

    const cardH = narrow ? 58 : 68;
    const gap = narrow ? 5 : 6;

    for (const bld of BUILDING_LIST) {
      // 渐进解锁：未解锁的建筑不显示
      if (!isBuildingUnlocked(bld.id, state)) continue;

      const lv = state.buildings[bld.id] || 0;
      const maxed = lv >= bld.maxLv;
      const cost = maxed ? 0 : bld.costs[lv];
      const canAfford = state.gold >= cost;
      const cardY = cy;
      if (cardY + cardH > y + h + 50) break;

      ctx.fillStyle = COL_PANEL;
      ctx.fillRect(x, cardY, w, cardH);
      ctx.strokeStyle = COL_BORDER;
      ctx.strokeRect(x, cardY, w, cardH);

      // 图标 + 名称
      ctx.textAlign = 'left';
      ctx.fillStyle = '#eee';
      ctx.font = `bold ${narrow ? 12 : 14}px ${FONT}`;
      ctx.fillText(`${bld.icon} ${bld.name}`, x + 8, cardY + (narrow ? 16 : 20));

      ctx.fillStyle = COL_DIM;
      ctx.font = `${narrow ? 9 : 11}px ${FONT}`;
      ctx.fillText(`Lv${lv}/${bld.maxLv} · ${bld.desc}`, x + 8, cardY + (narrow ? 30 : 36));

      // 效果文字：当前 → 升级后
      if (lv > 0) {
        ctx.fillStyle = COL_SUCCESS;
        ctx.fillText(`当前: ${bld.effect(lv)}`, x + 8, cardY + (narrow ? 42 : 50));
      }
      if (!maxed) {
        ctx.fillStyle = '#88aaff';
        const nextStr = bld.effect(lv + 1);
        ctx.fillText(`${lv > 0 ? '→ ' : ''}升级: ${nextStr}`, x + 8, cardY + (narrow ? 50 : 60) + (lv > 0 ? 0 : -8));
      }

      // 升级按钮
      if (!maxed) {
        const btnW2 = narrow ? 66 : 80;
        const btnH2 = narrow ? 22 : 26;
        const rect = { x: x + w - btnW2 - 6, y: cardY + (cardH - btnH2) / 2, w: btnW2, h: btnH2 };
        const label = `升级 ${cost}💰`;
        const disabled = !canAfford;
        drawBtn(ctx, rect, label, COL_BTN, mx, my, { disabled, fontSize: narrow ? 10 : 11 });
        if (!disabled) this._buttons.push({ ...rect, action: { type: 'action', id: 'upgrade', buildingId: bld.id } });
      } else {
        ctx.textAlign = 'right';
        ctx.fillStyle = COL_SUCCESS;
        ctx.font = `bold ${narrow ? 10 : 11}px ${FONT}`;
        ctx.fillText('已满级', x + w - 10, cardY + cardH / 2 + 4);
      }

      cy += cardH + gap;
    }
  }

  // ===== 任务面板 =====
  _drawQuestsPanel(ctx, x, y, w, h, state, mx, my, narrow) {
    let cy = y;
    ctx.textAlign = 'left';
    ctx.fillStyle = COL_ACCENT;
    ctx.font = `bold ${narrow ? 14 : 16}px ${FONT}`;
    ctx.fillText('📜 任务', x, cy + 14);
    cy += 26;

    // 进行中的任务
    if (state.activeQuests.length > 0) {
      ctx.fillStyle = '#ffaa44';
      ctx.font = `bold ${narrow ? 11 : 12}px ${FONT}`;
      ctx.fillText('进行中', x, cy + 10);
      cy += 18;

      for (const aq of state.activeQuests) {
        const cardH2 = narrow ? 36 : 42;
        ctx.fillStyle = 'rgba(255,170,68,0.06)';
        ctx.fillRect(x, cy, w, cardH2);
        ctx.strokeStyle = 'rgba(255,170,68,0.15)';
        ctx.strokeRect(x, cy, w, cardH2);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffcc44';
        ctx.font = `${narrow ? 11 : 13}px ${FONT}`;
        const disc = state.disciples.find(d => d.id === aq.discipleId);
        ctx.fillText(`${aq.icon} ${aq.name} — ${disc ? disc.name : '?'}`, x + 8, cy + (narrow ? 14 : 16));
        ctx.fillStyle = COL_DIM;
        ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
        ctx.fillText(`敌方D${aq.enemyDiff} · 奖励: ${aq.reward.gold}💰 ${aq.reward.fame}🏆 ${aq.reward.exp}exp`, x + 8, cy + (narrow ? 28 : 34));

        cy += cardH2 + 4;
      }
      cy += 8;
    }

    // 可接任务
    ctx.fillStyle = COL_DIM;
    ctx.font = `bold ${narrow ? 11 : 12}px ${FONT}`;
    ctx.fillText('可接任务', x, cy + 10);
    cy += 18;

    if (state.quests.length === 0) {
      ctx.fillStyle = COL_DIM;
      ctx.font = `${narrow ? 11 : 12}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('今日无可用任务', x + w / 2, cy + 20);
      return;
    }

    const cardH = narrow ? 50 : 58;
    const gap = 5;
    for (let i = 0; i < state.quests.length; i++) {
      const q = state.quests[i];
      const cardY = cy;
      if (cardY + cardH > y + h + 50) break;

      const hovered = hit(mx, my, x, cardY, w, cardH);
      ctx.fillStyle = hovered ? COL_PANEL_HI : COL_PANEL;
      ctx.fillRect(x, cardY, w, cardH);
      ctx.strokeStyle = hovered ? COL_ACCENT : COL_BORDER;
      ctx.strokeRect(x, cardY, w, cardH);

      // 风险色条
      const riskColors = { low: COL_SUCCESS, mid: '#ffaa44', high: COL_DANGER };
      ctx.fillStyle = riskColors[q.risk] || COL_DIM;
      ctx.fillRect(x, cardY, 3, cardH);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#eee';
      ctx.font = `bold ${narrow ? 11 : 13}px ${FONT}`;
      ctx.fillText(`${q.icon} ${q.name}`, x + 8, cardY + (narrow ? 14 : 16));

      ctx.fillStyle = COL_DIM;
      ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
      ctx.fillText(`${q.desc} · 敌方D${q.enemyDiff}(${WEAPON_NAMES[q.enemyWeapon]})`, x + 8, cardY + (narrow ? 28 : 32));

      // 奖励 + 推荐弟子标注
      ctx.fillStyle = COL_GOLD;
      ctx.fillText(`奖励: ${q.reward.gold}💰 ${q.reward.fame}🏆 ${q.reward.exp}exp`, x + 8, cardY + (narrow ? 42 : 48));

      // 右侧难度颜色指示
      const riskLabel = q.risk === 'low' ? '容易' : q.risk === 'mid' ? '中等' : '危险';
      ctx.textAlign = 'right';
      ctx.fillStyle = riskColors[q.risk] || COL_DIM;
      ctx.font = `bold ${narrow ? 10 : 11}px ${FONT}`;
      ctx.fillText(riskLabel, x + w - 8, cardY + (narrow ? 14 : 16));

      // 推荐弟子名（取等级最接近的可用弟子）
      const freeDisciples = state.disciples.filter(d => !d.onQuest && d.injury < 50 && d.stamina >= 30);
      const bestMatch = freeDisciples.sort((a, b) => Math.abs(a.level - q.enemyDiff) - Math.abs(b.level - q.enemyDiff))[0];
      if (bestMatch) {
        const lvDiff = bestMatch.level - q.enemyDiff;
        const recColor = lvDiff >= 2 ? COL_SUCCESS : lvDiff >= 0 ? '#ffcc44' : COL_DANGER;
        ctx.fillStyle = recColor;
        ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
        ctx.fillText(`推荐: ${bestMatch.name}(Lv${bestMatch.level})`, x + w - 8, cardY + (narrow ? 28 : 32));
      }

      // 派遣按钮
      const btnW2 = narrow ? 50 : 60;
      const btnH2 = narrow ? 22 : 26;
      const rect = { x: x + w - btnW2 - 6, y: cardY + (cardH - btnH2) / 2, w: btnW2, h: btnH2 };
      const disabled = freeDisciples.length === 0;
      drawBtn(ctx, rect, '派遣', COL_BTN, mx, my, { disabled, fontSize: narrow ? 10 : 11 });
      if (!disabled) this._buttons.push({ ...rect, action: { type: 'action', id: 'assignQuest', questIndex: i } });

      cy += cardH + gap;
    }
  }

  // ===== 背包面板（装备库存） =====
  _drawInventoryPanel(ctx, x, y, w, h, state, mx, my, narrow) {
    let cy = y;
    ctx.textAlign = 'left';
    ctx.fillStyle = COL_ACCENT;
    ctx.font = `bold ${narrow ? 14 : 16}px ${FONT}`;
    const invCount = (state.inventory || []).length;
    ctx.fillText(`🎒 背包 (${invCount}件)`, x, cy + 14);
    cy += 26;

    if (invCount === 0) {
      ctx.fillStyle = COL_DIM;
      ctx.font = `${narrow ? 11 : 13}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('背包空空如也', x + w / 2, cy + 30);
      ctx.font = `${narrow ? 9 : 11}px ${FONT}`;
      ctx.fillText('完成任务有概率获得武器/护甲战利品', x + w / 2, cy + 52);
      ctx.fillText('随机事件·黑市商人可购买精良护甲', x + w / 2, cy + 70);
      return;
    }

    // 品质图例
    ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
    ctx.textAlign = 'left';
    let legendX = x;
    for (const q of Object.values(ITEM_QUALITY)) {
      ctx.fillStyle = q.color;
      ctx.fillText(`■ ${q.name}`, legendX, cy + 10);
      legendX += narrow ? 50 : 60;
    }
    cy += 20;

    // 装备列表
    const cardH = narrow ? 38 : 44;
    const gap = 4;
    for (let idx = 0; idx < state.inventory.length; idx++) {
      const item = state.inventory[idx];
      if (cy + cardH > y + h + 40) break;

      const qInfo = ITEM_QUALITY[item.quality] || ITEM_QUALITY.normal;
      const typeName = item.type === 'weapon' ? WEAPON_NAMES[item.id] : ARMOR_NAMES[item.id];
      const label = itemLabel(typeName, item.quality);
      const typeIcon = item.type === 'weapon' ? '⚔' : '🛡';

      const hovered = hit(mx, my, x, cy, w, cardH);
      ctx.fillStyle = hovered ? COL_PANEL_HI : COL_PANEL;
      ctx.fillRect(x, cy, w, cardH);
      // 品质颜色左条
      ctx.fillStyle = qInfo.color;
      ctx.fillRect(x, cy, 3, cardH);
      ctx.strokeStyle = hovered ? qInfo.color : COL_BORDER;
      ctx.lineWidth = hovered ? 1.5 : 1;
      ctx.strokeRect(x, cy, w, cardH);

      ctx.textAlign = 'left';
      ctx.fillStyle = qInfo.color;
      ctx.font = `bold ${narrow ? 12 : 14}px ${FONT}`;
      ctx.fillText(`${typeIcon} ${label}`, x + 10, cy + (narrow ? 15 : 18));

      // HP加成说明
      if (item.quality !== 'normal') {
        ctx.fillStyle = COL_DIM;
        ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
        const bonus = Math.round((qInfo.hpMul - 1) * 100);
        ctx.fillText(`HP+${bonus}%（宗门战斗有效）`, x + 10, cy + (narrow ? 28 : 34));
      } else {
        ctx.fillStyle = COL_DIM;
        ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
        ctx.fillText(item.type === 'weapon' ? '普通武器' : '普通护甲', x + 10, cy + (narrow ? 28 : 34));
      }

      // 装备提示（右侧）
      ctx.textAlign = 'right';
      ctx.fillStyle = COL_DIM;
      ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
      ctx.fillText('在弟子详情中装备', x + w - 8, cy + (narrow ? 22 : 26));

      cy += cardH + gap;
    }
  }

  // ===== 宗门商店面板 =====
  _drawShopPanel(ctx, x, y, w, h, state, mx, my, narrow) {
    let cy = y;
    ctx.textAlign = 'left';
    ctx.fillStyle = COL_ACCENT;
    ctx.font = `bold ${narrow ? 14 : 16}px ${FONT}`;
    ctx.fillText('🛒 宗门商店', x, cy + 14);

    // 刷新日期提示
    const shopDay = state.shop?.refreshDay || 0;
    ctx.fillStyle = COL_DIM;
    ctx.font = `${narrow ? 9 : 11}px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`第${shopDay}天刷新`, x + w, cy + 14);
    ctx.textAlign = 'left';
    cy += 26;

    // 声望档位说明
    const fameTier = getFameTier(state.fame);
    ctx.fillStyle = fameTier.color;
    ctx.font = `${narrow ? 10 : 12}px ${FONT}`;
    ctx.fillText(`声望 ${state.fame} [${fameTier.label}] · 更多声望解锁高级商品`, x, cy + 12);
    cy += 22;

    const items = state.shop?.items || [];
    if (items.length === 0) {
      ctx.fillStyle = COL_DIM;
      ctx.font = `${narrow ? 11 : 13}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('今日无货，明日再来', x + w / 2, cy + 30);
      ctx.font = `${narrow ? 9 : 11}px ${FONT}`;
      ctx.fillText('（进入下一天后刷新商店）', x + w / 2, cy + 52);
      return;
    }

    const cardH = narrow ? 70 : 82;
    const gap = narrow ? 6 : 8;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (cy + cardH > y + h + 10) break;

      const canAfford = state.gold >= item.cost;
      const fameOk = state.fame >= item.fameReq;
      const buyable = canAfford && fameOk && !item.sold;
      const disabled = !buyable;
      const qColor = ITEM_QUALITY[item.quality]?.color || '#fff';

      const hovered = !disabled && hit(mx, my, x, cy, w, cardH);
      ctx.fillStyle = item.sold ? 'rgba(255,255,255,0.01)' : hovered ? COL_PANEL_HI : COL_PANEL;
      ctx.fillRect(x, cy, w, cardH);
      // 品质/类型颜色条
      ctx.fillStyle = item.sold ? '#333' : (item.type === 'weapon' || item.type === 'armor') ? qColor : '#ffaa44';
      ctx.fillRect(x, cy, 4, cardH);
      ctx.strokeStyle = item.sold ? 'rgba(255,255,255,0.03)' : hovered ? qColor : COL_BORDER;
      ctx.lineWidth = hovered ? 1.5 : 1;
      ctx.strokeRect(x, cy, w, cardH);

      // 图标 + 名称
      ctx.textAlign = 'left';
      ctx.fillStyle = item.sold ? COL_DIM : (item.type === 'weapon' || item.type === 'armor') ? qColor : '#ffdd88';
      ctx.font = `bold ${narrow ? 13 : 15}px ${FONT}`;
      ctx.fillText(`${item.icon} ${item.name}`, x + 10, cy + (narrow ? 18 : 22));

      // 已售出标记
      if (item.sold) {
        ctx.fillStyle = '#555';
        ctx.font = `bold ${narrow ? 12 : 14}px ${FONT}`;
        ctx.textAlign = 'right';
        ctx.fillText('已售出', x + w - 10, cy + cardH / 2 + 4);
        cy += cardH + gap;
        continue;
      }

      // 效果描述
      ctx.fillStyle = COL_TEXT;
      ctx.font = `${narrow ? 9 : 11}px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(item.desc, x + 10, cy + (narrow ? 32 : 38));

      // 声望要求标签
      if (item.fameReq > 0) {
        const fameLabel = `需声望≥${item.fameReq}`;
        ctx.fillStyle = fameOk ? '#44dd88' : '#ff6644';
        ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
        ctx.fillText(fameLabel, x + 10, cy + (narrow ? 46 : 54));
      }

      // 价格
      ctx.textAlign = 'left';
      ctx.fillStyle = canAfford ? COL_GOLD : '#ff6644';
      ctx.font = `bold ${narrow ? 11 : 13}px ${FONT}`;
      ctx.fillText(`💰 ${item.cost}`, x + 10, cy + (narrow ? 60 : 70));

      // 购买按钮
      const btnW = narrow ? 60 : 72;
      const btnH = narrow ? 26 : 30;
      const rect = { x: x + w - btnW - 8, y: cy + (cardH - btnH) / 2, w: btnW, h: btnH };
      drawBtn(ctx, rect, '购买', COL_BTN, mx, my, { disabled, fontSize: narrow ? 11 : 13 });
      if (!disabled) {
        this._buttons.push({ ...rect, action: { type: 'action', id: 'buyShopItem', itemId: item.id } });
      }

      cy += cardH + gap;
    }

    // 底部提示
    ctx.fillStyle = COL_DIM;
    ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('每天进入下一天后自动刷新商品', x + w / 2, cy + 14);
  }

  // ===== 日志面板 =====
  _drawLogPanel(ctx, x, y, w, h, state, mx, my, narrow) {
    let cy = y;
    ctx.textAlign = 'left';
    ctx.fillStyle = COL_ACCENT;
    ctx.font = `bold ${narrow ? 14 : 16}px ${FONT}`;
    ctx.fillText('📋 事件日志', x, cy + 14);
    cy += 26;

    // 返回主菜单按钮
    const exitRect = { x: x + w - 90, y: y, w: 90, h: 24 };
    drawBtn(ctx, exitRect, '🚪 退出游戏', COL_DANGER, mx, my, { fontSize: 10 });
    this._buttons.push({ ...exitRect, action: { type: 'action', id: 'exitSect' } });

    if (state.log.length === 0) {
      ctx.fillStyle = COL_DIM;
      ctx.font = `${narrow ? 11 : 12}px ${FONT}`;
      ctx.fillText('暂无记录', x, cy + 20);
      return;
    }

    const lineH = narrow ? 18 : 22;
    ctx.font = `${narrow ? 10 : 12}px ${FONT}`;
    for (let i = 0; i < state.log.length && cy + lineH < y + h; i++) {
      const entry = state.log[i];
      ctx.fillStyle = entry.color || COL_TEXT;
      ctx.fillText(entry.text, x, cy + lineH * 0.7);
      cy += lineH;
    }
  }

  // ===== 事件弹窗 =====
  drawEventPopup(ctx, cw, ch, evt, mx, my, narrow) {
    this._buttons = this._buttons || [];
    // 遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, cw, ch);

    const pw = Math.min(cw - 40, narrow ? 300 : 400);
    const ph = narrow ? 200 : 240;
    const px = (cw - pw) / 2;
    const py = (ch - ph) / 2;

    // 面板
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = COL_ACCENT;
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);

    // 图标 + 标题
    ctx.textAlign = 'center';
    ctx.fillStyle = COL_ACCENT;
    ctx.font = `bold ${narrow ? 18 : 22}px ${FONT}`;
    ctx.fillText(`${evt.icon || '📌'} ${evt.name}`, cw / 2, py + (narrow ? 32 : 40));

    // 描述
    ctx.fillStyle = COL_TEXT;
    ctx.font = `${narrow ? 12 : 14}px ${FONT}`;
    const lines = wrapText(ctx, evt.desc, pw - 30);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], cw / 2, py + (narrow ? 56 : 70) + i * (narrow ? 16 : 20));
    }

    // 选择按钮
    const btnH = narrow ? 32 : 38;
    const btnGap = 8;
    const totalW = evt.choices.length * 120 + (evt.choices.length - 1) * btnGap;
    let bx = (cw - totalW) / 2;
    const by = py + ph - btnH - (narrow ? 16 : 24);

    for (let i = 0; i < evt.choices.length; i++) {
      const c = evt.choices[i];
      const rect = { x: bx, y: by, w: 120, h: btnH };
      drawBtn(ctx, rect, c.label, COL_ACCENT, mx, my, { fontSize: narrow ? 12 : 14 });
      this._buttons.push({ ...rect, action: { type: 'eventChoice', choiceIndex: i } });
      bx += 120 + btnGap;
    }
  }

  // ===== 弟子选择弹窗（用于派遣任务） =====
  drawDiscipleSelect(ctx, cw, ch, disciples, mx, my, narrow) {
    this._buttons = this._buttons || [];
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, cw, ch);

    const pw = Math.min(cw - 30, narrow ? 280 : 360);
    const listH = Math.min(disciples.length * 40 + 80, ch - 100);
    const px = (cw - pw) / 2;
    const py = (ch - listH) / 2;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(px, py, pw, listH);
    ctx.strokeStyle = COL_BTN;
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, listH);

    ctx.textAlign = 'center';
    ctx.fillStyle = COL_BTN;
    ctx.font = `bold ${narrow ? 14 : 16}px ${FONT}`;
    ctx.fillText('选择弟子出征', cw / 2, py + (narrow ? 22 : 28));

    let cy = py + 36;
    for (const d of disciples) {
      const rowH = 34;
      const hovered = hit(mx, my, px + 10, cy, pw - 20, rowH);
      ctx.fillStyle = hovered ? COL_PANEL_HI : COL_PANEL;
      ctx.fillRect(px + 10, cy, pw - 20, rowH);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#eee';
      ctx.font = `${narrow ? 11 : 13}px ${FONT}`;
      ctx.fillText(`${d.name} Lv${d.level} ${WEAPON_NAMES[d.weaponId]}`, px + 18, cy + 14);
      ctx.fillStyle = COL_DIM;
      ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
      ctx.fillText(`${starsText(d.talent)} 体${d.stamina}%`, px + 18, cy + 28);

      this._buttons.push({ x: px + 10, y: cy, w: pw - 20, h: rowH, action: { type: 'selectForQuest', discipleId: d.id } });
      cy += rowH + 4;
    }

    // 取消按钮
    const cancelRect = { x: px + pw / 2 - 50, y: cy + 8, w: 100, h: 28 };
    drawBtn(ctx, cancelRect, '取消', COL_DIM, mx, my, { fontSize: 12 });
    this._buttons.push({ ...cancelRect, action: { type: 'cancelSelect' } });
  }

  // ===== 事件战斗弟子选择弹窗 =====
  drawEventFightSelect(ctx, cw, ch, disciples, eventFight, mx, my, narrow) {
    this._buttons = this._buttons || [];
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, cw, ch);

    const pw = Math.min(cw - 30, narrow ? 280 : 360);
    const listH = Math.min(disciples.length * 40 + 110, ch - 100);
    const px = (cw - pw) / 2;
    const py = (ch - listH) / 2;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(px, py, pw, listH);
    ctx.strokeStyle = '#ff6644';
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, listH);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff6644';
    ctx.font = `bold ${narrow ? 14 : 16}px ${FONT}`;
    const title = eventFight ? `${eventFight.icon || '⚔'} ${eventFight.name} · 选择应战弟子` : '选择应战弟子';
    ctx.fillText(title, cw / 2, py + (narrow ? 22 : 28));

    if (eventFight) {
      ctx.fillStyle = COL_DIM;
      ctx.font = `${narrow ? 10 : 12}px ${FONT}`;
      ctx.fillText(`敌方难度 D${eventFight.diff}`, cw / 2, py + (narrow ? 38 : 46));
    }

    let cy = py + (narrow ? 46 : 56);
    for (const d of disciples) {
      const rowH = 34;
      const hovered = hit(mx, my, px + 10, cy, pw - 20, rowH);
      ctx.fillStyle = hovered ? COL_PANEL_HI : COL_PANEL;
      ctx.fillRect(px + 10, cy, pw - 20, rowH);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#eee';
      ctx.font = `${narrow ? 11 : 13}px ${FONT}`;
      ctx.fillText(`${d.name} Lv${d.level} ${WEAPON_NAMES[d.weaponId]}`, px + 18, cy + 14);
      ctx.fillStyle = COL_DIM;
      ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
      ctx.fillText(`${starsText(d.talent)} 体${d.stamina}%`, px + 18, cy + 28);

      this._buttons.push({ x: px + 10, y: cy, w: pw - 20, h: rowH, action: { type: 'selectForEventFight', discipleId: d.id } });
      cy += rowH + 4;
    }

    if (disciples.length === 0) {
      ctx.fillStyle = COL_DIM;
      ctx.textAlign = 'center';
      ctx.font = `${narrow ? 12 : 14}px ${FONT}`;
      ctx.fillText('无可用弟子', cw / 2, cy + 20);
      cy += 40;
    }

    const cancelRect = { x: px + pw / 2 - 50, y: cy + 8, w: 100, h: 28 };
    drawBtn(ctx, cancelRect, '放弃', COL_DIM, mx, my, { fontSize: 12 });
    this._buttons.push({ ...cancelRect, action: { type: 'cancelEventFight' } });
  }

  // ===== 战斗中：女敌人正常立绘（居中大图，半透明叠加底部） =====
  drawFightEnemyPortrait(ctx, quest, cw, ch, narrow) {
    if (!quest?.enemyFemale) return;
    const imgW = narrow ? 110 : 150;
    const imgH = narrow ? 147 : 200;
    const x = (cw - imgW) / 2;
    const y = ch - imgH - 44;
    const imgKey = `${import.meta.env.BASE_URL}assets/enemies/f_${quest.enemyImgId}_normal.png`;
    const img = this._getImg(imgKey);

    ctx.save();
    ctx.globalAlpha = 0.78;
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, x, y, imgW, imgH);
    } else {
      ctx.fillStyle = '#331122';
      ctx.fillRect(x, y, imgW, imgH);
    }
    // 底部渐变遮罩（融入场景）
    const grad = ctx.createLinearGradient(0, y + imgH * 0.65, 0, y + imgH);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y + imgH * 0.65, imgW, imgH * 0.35);
    // 底部信息
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffaacc';
    ctx.font = `bold ${narrow ? 11 : 13}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`D${quest.enemyDiff} · ${WEAPON_NAMES[quest.enemyWeapon] || ''}`, x + imgW / 2, y + imgH + 14);
    ctx.restore();
  }

  // ===== 胜利立绘揭示（全屏，2.5s 后进结算，可点击跳过） =====
  drawVictoryPortrait(ctx, result, cw, ch, narrow, elapsed) {
    const fadeIn = Math.min(1, elapsed / 0.45);
    const ease = 1 - Math.pow(1 - fadeIn, 3);

    // 深色遮罩
    ctx.fillStyle = `rgba(5,2,12,${0.92 * ease})`;
    ctx.fillRect(0, 0, cw, ch);

    // 立绘尺寸 — 按高度撑满
    const maxH = ch - (narrow ? 80 : 100);
    const imgH = Math.min(maxH, narrow ? 280 : 380);
    const imgW = Math.round(imgH * 0.75); // 3:4 比例
    const imgX = (cw - imgW) / 2;
    const imgY = (ch - imgH) / 2 - (narrow ? 10 : 16);

    const scale = 0.88 + 0.12 * ease;
    const cx2 = imgX + imgW / 2;
    const cy2 = imgY + imgH / 2;

    const imgKey = `${import.meta.env.BASE_URL}assets/enemies/f_${result.enemyImgId}_defeated.png`;
    const img = this._getImg(imgKey);

    ctx.save();
    ctx.globalAlpha = ease;
    ctx.translate(cx2, cy2);
    ctx.scale(scale, scale);
    ctx.translate(-cx2, -cy2);
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, imgX, imgY, imgW, imgH);
    } else {
      ctx.fillStyle = '#331122';
      ctx.fillRect(imgX, imgY, imgW, imgH);
    }
    ctx.restore();

    // 「战败」大字
    ctx.save();
    ctx.globalAlpha = ease;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff88aa';
    ctx.font = `bold ${narrow ? 28 : 38}px ${FONT}`;
    ctx.fillText('战败', cw / 2, imgY + imgH + (narrow ? 28 : 36));
    ctx.restore();

    // 点击跳过提示（1s 后出现，闪烁）
    if (elapsed > 1.0) {
      const blink = 0.5 + 0.5 * Math.sin(elapsed * 4);
      ctx.save();
      ctx.globalAlpha = Math.min(1, (elapsed - 1.0) / 0.3) * blink * 0.7;
      ctx.fillStyle = '#aaa';
      ctx.font = `${narrow ? 11 : 13}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('点击继续', cw / 2, ch - (narrow ? 18 : 22));
      ctx.restore();
    }
  }

  // ===== 战斗结果弹窗 =====
  drawFightResult(ctx, cw, ch, result, mx, my, narrow) {
    this._buttons = this._buttons || [];
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, cw, ch);

    const pw = Math.min(cw - 40, narrow ? 300 : 400);
    const hasLoot = result.lootDrop;
    const ph = narrow ? (hasLoot ? 250 : 220) : (hasLoot ? 290 : 260);
    const px = (cw - pw) / 2;
    const py = (ch - ph) / 2;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(px, py, pw, ph);
    const winColor = result.won ? COL_SUCCESS : COL_DANGER;
    ctx.strokeStyle = winColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);

    ctx.textAlign = 'center';
    ctx.fillStyle = winColor;
    ctx.font = `bold ${narrow ? 20 : 26}px ${FONT}`;
    if (result.isSpar) {
      ctx.fillText('⚔ 切磋结束', cw / 2, py + (narrow ? 36 : 44));
    } else {
      ctx.fillText(result.won ? '⚔ 胜利！' : '💀 败北...', cw / 2, py + (narrow ? 36 : 44));
    }

    ctx.fillStyle = COL_TEXT;
    ctx.font = `${narrow ? 12 : 14}px ${FONT}`;
    if (result.isSpar) {
      ctx.fillText(`${result.sparNames[0]} vs ${result.sparNames[1]}`, cw / 2, py + (narrow ? 60 : 74));
      ctx.fillStyle = COL_GOLD;
      ctx.fillText(`双方各获得 ${result.expGain}exp`, cw / 2, py + (narrow ? 82 : 100));
    } else {
      ctx.fillText(`${result.discipleName} vs D${result.enemyDiff}(${WEAPON_NAMES[result.enemyWeapon] || '?'})`, cw / 2, py + (narrow ? 60 : 74));

      if (result.won) {
        ctx.fillStyle = COL_GOLD;
        ctx.fillText(`获得: ${result.goldGain}💰 ${result.fameGain}🏆 ${result.expGain}exp`, cw / 2, py + (narrow ? 82 : 100));
      } else {
        ctx.fillStyle = COL_DANGER;
        ctx.fillText(`弟子受伤 +${result.injuryGain}`, cw / 2, py + (narrow ? 82 : 100));
      }
    }

    let infoY = py + (narrow ? 102 : 122);
    if (result.levelUp) {
      ctx.fillStyle = '#ffdd00';
      ctx.font = `bold ${narrow ? 14 : 16}px ${FONT}`;
      ctx.fillText('🎉 升级了！', cw / 2, infoY);
      infoY += narrow ? 20 : 24;
    }

    if (result.newTrait) {
      const t = TRAITS[result.newTrait];
      if (t) {
        ctx.fillStyle = t.color;
        ctx.font = `${narrow ? 12 : 13}px ${FONT}`;
        ctx.fillText(`领悟特质: ${t.name}(${t.desc})`, cw / 2, infoY);
        infoY += narrow ? 18 : 22;
      }
    }

    // 战利品展示
    if (hasLoot) {
      const loot = result.lootDrop;
      const qInfo = ITEM_QUALITY[loot.quality] || ITEM_QUALITY.normal;
      const typeName = loot.type === 'weapon' ? WEAPON_NAMES[loot.id] : ARMOR_NAMES[loot.id];
      const lootLabel = itemLabel(typeName, loot.quality);
      const lootIcon = loot.type === 'weapon' ? '⚔' : '🛡';

      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(px + 20, infoY + 4, pw - 40, narrow ? 30 : 36);
      ctx.strokeStyle = qInfo.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 20, infoY + 4, pw - 40, narrow ? 30 : 36);

      ctx.fillStyle = qInfo.color;
      ctx.font = `bold ${narrow ? 13 : 15}px ${FONT}`;
      ctx.fillText(`🎁 战利品: ${lootIcon} ${lootLabel}`, cw / 2, infoY + (narrow ? 22 : 26));
      infoY += narrow ? 38 : 44;
    }

    // 确定按钮
    const btnY = py + ph - (narrow ? 44 : 52);
    const okRect = { x: cw / 2 - 45, y: btnY, w: 90, h: 32 };
    drawBtn(ctx, okRect, '确定', COL_BTN, mx, my, { fontSize: 13 });
    this._buttons.push({ ...okRect, action: { type: 'closeFightResult' } });
  }

  drawEquipSelect(ctx, cw, ch, disciple, equipType, inventory, availArmors, mx, my, narrow) {
    this._buttons = this._buttons || [];
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, cw, ch);

    const isArmor = equipType === 'armor';
    const invItems = (inventory || []).filter(i => i.type === equipType);

    // 基础可用选项（普通品质，无限）
    const baseOptions = isArmor
      ? availArmors.map(id => ({ type: 'armor', id, quality: 'normal', isBase: true }))
      : ['dao', 'daggers', 'hammer', 'spear', 'shield'].map(id => ({ type: 'weapon', id, quality: 'normal', isBase: true }));

    const allOptions = [...baseOptions, ...invItems.map((item, i) => ({ ...item, isBase: false, inventoryIdx: (inventory || []).indexOf(item) }))];
    const listH = Math.min(allOptions.length * 40 + 100, ch - 80);
    const pw = Math.min(cw - 30, narrow ? 290 : 370);
    const px = (cw - pw) / 2;
    const py = (ch - listH) / 2;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(px, py, pw, listH);
    ctx.strokeStyle = isArmor ? '#44dd88' : '#4488ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, listH);

    ctx.textAlign = 'center';
    ctx.fillStyle = COL_ACCENT;
    ctx.font = `bold ${narrow ? 14 : 16}px ${FONT}`;
    ctx.fillText(isArmor ? `🛡 选择护甲 — ${disciple.name}` : `⚔ 选择武器 — ${disciple.name}`, cw / 2, py + (narrow ? 22 : 28));

    let cy = py + 38;
    for (const opt of allOptions) {
      const rowH = 34;
      const qInfo = ITEM_QUALITY[opt.quality] || ITEM_QUALITY.normal;
      const name = opt.type === 'weapon' ? WEAPON_NAMES[opt.id] : ARMOR_NAMES[opt.id];
      const label = itemLabel(name, opt.quality);
      const typeIcon = opt.type === 'weapon' ? '⚔' : '🛡';

      // 当前装备高亮
      const isCurrent = isArmor
        ? (disciple.armorId === opt.id && (disciple.armorQuality || 'normal') === opt.quality)
        : (disciple.weaponId === opt.id && (disciple.weaponQuality || 'normal') === opt.quality);

      const hovered = hit(mx, my, px + 8, cy, pw - 16, rowH);
      ctx.fillStyle = isCurrent ? 'rgba(255,204,68,0.12)' : hovered ? COL_PANEL_HI : COL_PANEL;
      ctx.fillRect(px + 8, cy, pw - 16, rowH);
      ctx.strokeStyle = isCurrent ? COL_ACCENT : hovered ? qInfo.color : COL_BORDER;
      ctx.lineWidth = isCurrent ? 1.5 : 1;
      ctx.strokeRect(px + 8, cy, pw - 16, rowH);

      ctx.textAlign = 'left';
      ctx.fillStyle = qInfo.color;
      ctx.font = `${narrow ? 12 : 13}px ${FONT}`;
      ctx.fillText(`${typeIcon} ${label}${isCurrent ? ' ✓' : ''}`, px + 16, cy + 15);

      if (!opt.isBase) {
        const bonus = Math.round((qInfo.hpMul - 1) * 100);
        ctx.fillStyle = COL_DIM;
        ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
        ctx.fillText(`背包 · HP+${bonus}%`, px + 16, cy + 27);
      } else {
        ctx.fillStyle = COL_DIM;
        ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
        ctx.fillText('基础装备（无限使用）', px + 16, cy + 27);
      }

      if (!isCurrent) {
        const action = opt.isBase
          ? { type: 'action', id: 'equipItem', itemType: equipType, baseId: opt.id, quality: 'normal', inventoryIdx: -1 }
          : { type: 'action', id: 'equipItem', itemType: equipType, baseId: opt.id, quality: opt.quality, inventoryIdx: opt.inventoryIdx };
        this._buttons.push({ x: px + 8, y: cy, w: pw - 16, h: rowH, action });
      }
      cy += rowH + 4;
    }

    // 取消按钮
    const cancelRect = { x: cw / 2 - 45, y: cy + 6, w: 90, h: 28 };
    drawBtn(ctx, cancelRect, '取消', COL_DIM, mx, my, { fontSize: 12 });
    this._buttons.push({ ...cancelRect, action: { type: 'cancelEquip' } });
  }

  // ===== 开除确认弹窗 =====
  drawDismissConfirm(ctx, cw, ch, disciple, mx, my, narrow) {
    this._buttons = this._buttons || [];
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, cw, ch);

    const pw = Math.min(cw - 40, narrow ? 290 : 380);
    const ph = narrow ? 230 : 270;
    const px = (cw - pw) / 2;
    const py = (ch - ph) / 2;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = COL_DANGER;
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);

    // 标题
    ctx.textAlign = 'center';
    ctx.fillStyle = COL_DANGER;
    ctx.font = `bold ${narrow ? 16 : 20}px ${FONT}`;
    ctx.fillText('⚠ 逐出门派', cw / 2, py + (narrow ? 30 : 38));

    // 弟子信息
    ctx.fillStyle = disciple.color || '#888';
    ctx.fillRect(px + 20, py + (narrow ? 44 : 54), pw - 40, 2);
    ctx.fillStyle = '#eee';
    ctx.font = `bold ${narrow ? 14 : 16}px ${FONT}`;
    ctx.fillText(disciple.name, cw / 2, py + (narrow ? 64 : 78));
    ctx.fillStyle = COL_DIM;
    ctx.font = `${narrow ? 11 : 12}px ${FONT}`;
    ctx.fillText(`Lv${disciple.level} · ${starsText(disciple.talent)} · ${disciple.wins}胜${disciple.losses}负`, cw / 2, py + (narrow ? 80 : 96));

    // 弟子台词（根据忠诚度）
    let dialogue = '';
    if (disciple.loyalty >= 70) {
      dialogue = '"师傅，弟子究竟犯了何罪…弟子愿改过自新！"';
    } else if (disciple.loyalty >= 40) {
      dialogue = '"好吧。弟子明白了，就此别过。"';
    } else {
      dialogue = '"哼！迟早有今日，后悔去吧！"';
    }
    ctx.fillStyle = '#aaa';
    ctx.font = `italic ${narrow ? 11 : 12}px ${FONT}`;
    const dlines = wrapText(ctx, dialogue, pw - 30);
    for (let i = 0; i < dlines.length; i++) {
      ctx.fillText(dlines[i], cw / 2, py + (narrow ? 98 : 116) + i * (narrow ? 16 : 18));
    }

    // 声望影响提示
    const fameLoss = Math.max(0, disciple.level * 2 + (disciple.loyalty > 60 ? 5 : 0) - 4);
    if (fameLoss > 0) {
      ctx.fillStyle = '#ff8844';
      ctx.font = `${narrow ? 11 : 12}px ${FONT}`;
      ctx.fillText(`声望 -${fameLoss}`, cw / 2, py + (narrow ? 138 : 160));
    }

    // 按钮
    const btnW3 = narrow ? 90 : 110;
    const btnH3 = narrow ? 32 : 36;
    const btnY3 = py + ph - btnH3 - (narrow ? 16 : 20);
    const gap3 = 16;
    const totalW3 = btnW3 * 2 + gap3;
    const startX3 = (cw - totalW3) / 2;

    const cancelRect3 = { x: startX3, y: btnY3, w: btnW3, h: btnH3 };
    drawBtn(ctx, cancelRect3, '取消', COL_DIM, mx, my, { fontSize: narrow ? 12 : 13 });
    this._buttons.push({ ...cancelRect3, action: { type: 'cancelDismiss' } });

    const confirmRect3 = { x: startX3 + btnW3 + gap3, y: btnY3, w: btnW3, h: btnH3 };
    drawBtn(ctx, confirmRect3, '确认开除', COL_DANGER, mx, my, { fontSize: narrow ? 12 : 13 });
    this._buttons.push({ ...confirmRect3, action: { type: 'action', id: 'confirmDismiss' } });
  }

  // ===== 标题画面（新游戏/继续/读档/返回）=====
  drawTitleScreen(ctx, cw, ch, mx, my, narrow, hasAutoSave, hasManualSave) {
    this._buttons = this._buttons || [];

    // 背景
    ctx.fillStyle = '#080818';
    ctx.fillRect(0, 0, cw, ch);

    // 装饰线条
    ctx.strokeStyle = 'rgba(255,204,68,0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const yy = ch * 0.15 + i * (ch * 0.14);
      ctx.beginPath();
      ctx.moveTo(cw * 0.1, yy);
      ctx.lineTo(cw * 0.9, yy);
      ctx.stroke();
    }

    // 标题
    const titleY = narrow ? ch * 0.18 : ch * 0.22;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcc44';
    ctx.font = `bold ${narrow ? 28 : 36}px ${FONT}`;
    ctx.fillText('宗门风云', cw / 2, titleY);

    // 副标题
    ctx.fillStyle = '#887744';
    ctx.font = `${narrow ? 12 : 14}px ${FONT}`;
    ctx.fillText('门派养成 · 弟子培养 · 江湖争锋', cw / 2, titleY + (narrow ? 24 : 30));

    // 按钮区域
    const btnW = narrow ? 180 : 220;
    const btnH = narrow ? 40 : 48;
    const gap = narrow ? 10 : 14;
    let by = titleY + (narrow ? 60 : 80);
    const bx = (cw - btnW) / 2;

    const buttons = [];

    // 继续游戏（仅在有自动存档时显示）
    if (hasAutoSave) {
      buttons.push({ label: '▶ 继续游戏', id: 'continueGame', color: '#ffcc44', fontSize: narrow ? 15 : 17 });
    }

    buttons.push({ label: '✦ 新的游戏', id: 'newGame', color: '#44aaff', fontSize: narrow ? 14 : 16 });

    // 读取存档（仅在有手动存档时显示）
    if (hasManualSave) {
      buttons.push({ label: '📂 读取存档', id: 'loadGame', color: '#88aacc', fontSize: narrow ? 14 : 16 });
    }

    buttons.push({ label: '← 返回', id: 'backToMenu', color: '#666', fontSize: narrow ? 13 : 14 });

    for (const btn of buttons) {
      const rect = { x: bx, y: by, w: btnW, h: btnH };
      const hovered = hit(mx, my, bx, by, btnW, btnH);

      // 按钮背景
      ctx.fillStyle = hovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
      ctx.fillRect(bx, by, btnW, btnH);
      ctx.strokeStyle = hovered ? btn.color : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = hovered ? 2 : 1;
      ctx.strokeRect(bx, by, btnW, btnH);

      // 文字
      ctx.fillStyle = hovered ? '#fff' : btn.color;
      ctx.font = `bold ${btn.fontSize}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(btn.label, bx + btnW / 2, by + btnH / 2 + (narrow ? 5 : 6));

      this._buttons.push({ ...rect, action: { type: 'action', id: btn.id } });
      by += btnH + gap;
    }

    // 底部版本信息
    ctx.fillStyle = '#444';
    ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('ESC 返回主菜单', cw / 2, ch - 20);
  }

  // ===== 设置弹窗（含存/读档、退出） =====
  drawSettings(ctx, cw, ch, mx, my, narrow) {
    this._buttons = this._buttons || [];
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, cw, ch);

    const pw = Math.min(cw - 40, narrow ? 260 : 300);
    const ph = narrow ? 400 : 460;
    const px = (cw - pw) / 2;
    const py = (ch - ph) / 2;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = COL_ACCENT;
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);

    ctx.textAlign = 'center';
    ctx.fillStyle = COL_ACCENT;
    ctx.font = `bold ${narrow ? 16 : 18}px ${FONT}`;
    ctx.fillText('⚙ 设置', cw / 2, py + (narrow ? 28 : 34));

    const btnW4 = pw - 40;
    const btnH4 = narrow ? 36 : 42;
    const gap4 = narrow ? 8 : 10;
    let by4 = py + (narrow ? 48 : 56);

    const settingsActions = [
      { label: '💾 存档', action: { type: 'action', id: 'save' }, color: '#4488ff' },
      { label: '📂 读档', action: { type: 'action', id: 'load' }, color: '#44aaff' },
      { label: '🚪 返回主菜单', action: { type: 'action', id: 'exitSect' }, color: COL_DANGER },
    ];

    for (const sa of settingsActions) {
      const rect4 = { x: px + 20, y: by4, w: btnW4, h: btnH4 };
      drawBtn(ctx, rect4, sa.label, sa.color, mx, my, { fontSize: narrow ? 13 : 14 });
      this._buttons.push({ ...rect4, action: sa.action });
      by4 += btnH4 + gap4;
    }

    // ===== 对话开关区域 =====
    by4 += narrow ? 4 : 8;
    ctx.fillStyle = COL_DIM;
    ctx.font = `${narrow ? 11 : 12}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('💬 对话气泡', cw / 2, by4 + 4);
    by4 += narrow ? 14 : 18;

    const flags = getDialogueFlags();
    const toggleW = Math.floor((btnW4 - gap4 * 2) / 3);
    const toggleH = narrow ? 28 : 32;
    const toggleItems = [
      { key: 'training', label: '训练', on: flags.training },
      { key: 'combat',   label: '战斗', on: flags.combat },
      { key: 'life',     label: '日常', on: flags.life },
    ];
    for (let i = 0; i < toggleItems.length; i++) {
      const ti = toggleItems[i];
      const tx = px + 20 + i * (toggleW + gap4);
      const rect = { x: tx, y: by4, w: toggleW, h: toggleH };
      const hovered = hit(mx, my, tx, by4, toggleW, toggleH);
      ctx.fillStyle = hovered ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(tx, by4, toggleW, toggleH);
      ctx.strokeStyle = ti.on ? '#44cc88' : '#aa4444';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tx, by4, toggleW, toggleH);
      ctx.fillStyle = hovered ? '#fff' : (ti.on ? '#ccc' : '#777');
      ctx.font = `${narrow ? 11 : 12}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${ti.on ? '✅' : '❌'} ${ti.label}`, tx + toggleW / 2, by4 + toggleH / 2 + 4);
      this._buttons.push({ ...rect, action: { type: 'action', id: 'toggleDialogue', key: ti.key } });
    }
    by4 += toggleH + gap4;

    // ===== 自动存档开关 =====
    const autoOn = isAutoSaveOn();
    const autoRect = { x: px + 20, y: by4, w: btnW4, h: toggleH };
    const autoHovered = hit(mx, my, autoRect.x, autoRect.y, autoRect.w, autoRect.h);
    ctx.fillStyle = autoHovered ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(autoRect.x, by4, btnW4, toggleH);
    ctx.strokeStyle = autoOn ? '#44cc88' : '#aa4444';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(autoRect.x, by4, btnW4, toggleH);
    ctx.fillStyle = autoHovered ? '#fff' : (autoOn ? '#ccc' : '#777');
    ctx.font = `${narrow ? 11 : 12}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${autoOn ? '✅' : '❌'} 自动存档（每天结束自动保存）`, px + pw / 2, by4 + toggleH / 2 + 4);
    this._buttons.push({ ...autoRect, action: { type: 'action', id: 'toggleAutoSave' } });
    by4 += toggleH + gap4;

    // 关闭
    const closeRect = { x: cw / 2 - 40, y: by4 + 4, w: 80, h: 26 };
    drawBtn(ctx, closeRect, '关闭', COL_DIM, mx, my, { fontSize: 12 });
    this._buttons.push({ ...closeRect, action: { type: 'cancelSettings' } });
  }

  // ===== 资质秘籍弟子选择弹窗 =====
  drawTalentSelect(ctx, cw, ch, disciples, mx, my, narrow) {
    this._buttons = this._buttons || [];
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, cw, ch);

    const pw = Math.min(cw - 40, narrow ? 290 : 380);
    const listH = Math.min(disciples.length * 46 + 100, ch - 80);
    const px = (cw - pw) / 2;
    const py = (ch - listH) / 2;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(px, py, pw, listH);
    ctx.strokeStyle = '#ffdd00';
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, listH);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffdd00';
    ctx.font = `bold ${narrow ? 15 : 18}px ${FONT}`;
    ctx.fillText('📜 选择突破弟子', cw / 2, py + (narrow ? 28 : 34));

    ctx.fillStyle = COL_DIM;
    ctx.font = `${narrow ? 10 : 11}px ${FONT}`;
    ctx.fillText('将提升该弟子资质上限+1（最高5星）', cw / 2, py + (narrow ? 44 : 54));

    let iy = py + (narrow ? 56 : 68);
    const rowH = narrow ? 42 : 48;

    if (disciples.length === 0) {
      ctx.fillStyle = COL_DIM;
      ctx.font = `${narrow ? 12 : 14}px ${FONT}`;
      ctx.fillText('无可突破弟子', cw / 2, iy + 24);
    }

    for (const d of disciples) {
      if (iy + rowH > py + listH - 50) break;
      const hovered = hit(mx, my, px + 12, iy, pw - 24, rowH);
      ctx.fillStyle = hovered ? COL_PANEL_HI : COL_PANEL;
      ctx.fillRect(px + 12, iy, pw - 24, rowH);
      ctx.strokeStyle = hovered ? '#ffdd00' : COL_BORDER;
      ctx.lineWidth = hovered ? 1.5 : 1;
      ctx.strokeRect(px + 12, iy, pw - 24, rowH);

      ctx.fillStyle = d.color || '#888';
      ctx.fillRect(px + 12, iy, 4, rowH);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#eee';
      ctx.font = `bold ${narrow ? 12 : 14}px ${FONT}`;
      ctx.fillText(d.name, px + 22, iy + (narrow ? 16 : 18));
      ctx.fillStyle = COL_DIM;
      ctx.font = `${narrow ? 10 : 11}px ${FONT}`;
      ctx.fillText(`Lv${d.level} · 资质 ${starsText(d.talent)} → ${d.talent + 1}星`, px + 22, iy + (narrow ? 30 : 34));

      this._buttons.push({ x: px + 12, y: iy, w: pw - 24, h: rowH,
        action: { type: 'selectForTalentUp', discipleId: d.id } });
      iy += rowH + 5;
    }

    // 取消按钮
    const cancelY = py + listH - (narrow ? 38 : 44);
    const cancelRect = { x: cw / 2 - 50, y: cancelY, w: 100, h: narrow ? 28 : 32 };
    drawBtn(ctx, cancelRect, '取消', COL_DIM, mx, my, { fontSize: narrow ? 12 : 13 });
    this._buttons.push({ ...cancelRect, action: { type: 'cancelTalentSelect' } });
  }

  // ===== 日终总结弹窗 =====
  drawDaySummary(ctx, cw, ch, summary, mx, my, narrow) {
    this._buttons = this._buttons || [];
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, cw, ch);

    const pw = Math.min(cw - 30, narrow ? 300 : 400);
    const ph = Math.min(ch - 60, narrow ? 350 : 420);
    const px = (cw - pw) / 2;
    const py = (ch - ph) / 2;

    ctx.fillStyle = 'rgba(15,12,25,0.96)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#ffcc44';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px, py, pw, ph);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcc44';
    ctx.font = `bold ${narrow ? 15 : 18}px ${FONT}`;
    ctx.fillText('🌙 日终总结', cw / 2, py + (narrow ? 24 : 30));

    let cy = py + (narrow ? 36 : 44);
    const fs = narrow ? 11 : 13;
    const lineH = narrow ? 16 : 19;
    ctx.textAlign = 'left';

    if (summary.income > 0) {
      ctx.fillStyle = '#ffd700';
      ctx.font = `${fs}px ${FONT}`;
      ctx.fillText(`💰 被动收入 +${summary.income}`, px + 12, cy);
      cy += lineH;
    }

    if (summary.trained && summary.trained.length > 0) {
      ctx.fillStyle = '#4499ff';
      ctx.font = `bold ${fs}px ${FONT}`;
      ctx.fillText('📖 训练进展', px + 12, cy);
      cy += lineH;
      ctx.font = `${narrow ? 10 : 11}px ${FONT}`;
      for (const t of summary.trained) {
        if (cy > py + ph - 60) break;
        if (t.maxed) {
          ctx.fillStyle = '#666';
          ctx.fillText(`  ${t.name} Lv${t.level} (已满级)`, px + 12, cy);
        } else {
          ctx.fillStyle = t.levelUp ? '#ffdd00' : '#aaa';
          const lvStr = t.levelUp ? `↑Lv${t.level}!` : `${t.expPct}%`;
          ctx.fillText(`  ${t.name} +${t.exp}exp ${lvStr}${t.newTrait ? ` 📖${t.newTrait}` : ''}`, px + 12, cy);
        }
        cy += lineH - 2;
      }
    }

    if (summary.rested && summary.rested.length > 0) {
      ctx.fillStyle = '#88aacc';
      ctx.font = `bold ${fs}px ${FONT}`;
      ctx.fillText('💤 休养', px + 12, cy);
      cy += lineH;
      ctx.font = `${narrow ? 10 : 11}px ${FONT}`;
      for (const r of summary.rested) {
        if (cy > py + ph - 60) break;
        ctx.fillStyle = '#888';
        ctx.fillText(`  ${r.name} 体力${r.from}→${r.to}`, px + 12, cy);
        cy += lineH - 2;
      }
    }

    if (summary.healed && summary.healed.length > 0) {
      ctx.fillStyle = '#44dd88';
      ctx.font = `bold ${fs}px ${FONT}`;
      ctx.fillText('💊 伤势恢复', px + 12, cy);
      cy += lineH;
      ctx.font = `${narrow ? 10 : 11}px ${FONT}`;
      for (const h of summary.healed) {
        if (cy > py + ph - 60) break;
        ctx.fillStyle = '#888';
        ctx.fillText(`  ${h.name} 伤势${h.from}→${h.to}`, px + 12, cy);
        cy += lineH - 2;
      }
    }

    if (summary.newDisciple) {
      ctx.fillStyle = '#44dd88';
      ctx.font = `${fs}px ${FONT}`;
      ctx.fillText(`🏨 ${summary.newDisciple.name}(资质${summary.newDisciple.talent})慕名而来！`, px + 12, cy);
      cy += lineH;
    }

    const bw = narrow ? 120 : 150;
    const bh = narrow ? 30 : 36;
    const btnRect = { x: cw / 2 - bw / 2, y: py + ph - bh - 10, w: bw, h: bh };
    drawBtn(ctx, btnRect, '继续 →', '#ffcc44', mx, my, { fontSize: narrow ? 13 : 15 });
    this._buttons.push({ ...btnRect, action: { type: 'action', id: 'dismissDaySummary' } });
  }

  // ===== 成就弹窗 =====
  drawAchievementPopup(ctx, cw, ch, ach, mx, my, narrow) {
    this._buttons = this._buttons || [];
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, cw, ch);

    const pw = Math.min(cw - 40, narrow ? 280 : 360);
    const ph = narrow ? 200 : 230;
    const px = (cw - pw) / 2;
    const py = (ch - ph) / 2;

    // 背景
    ctx.fillStyle = '#12101e';
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 12); ctx.fill();
    // 金色边框（双层光晕）
    ctx.shadowColor = ach.color;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = ach.color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 12); ctx.stroke();
    ctx.shadowBlur = 0;

    // 顶部 "成就解锁！"
    ctx.textAlign = 'center';
    ctx.fillStyle = ach.color;
    ctx.font = `bold ${narrow ? 11 : 13}px ${FONT}`;
    ctx.fillText('🏆 成就解锁！', cw / 2, py + (narrow ? 26 : 30));

    // 大图标
    ctx.font = `${narrow ? 36 : 44}px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(ach.icon, cw / 2, py + (narrow ? 72 : 86));

    // 成就名
    ctx.font = `bold ${narrow ? 18 : 22}px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(ach.name, cw / 2, py + (narrow ? 100 : 118));

    // 描述
    ctx.font = `${narrow ? 11 : 13}px ${FONT}`;
    ctx.fillStyle = '#aaa';
    ctx.fillText(ach.desc, cw / 2, py + (narrow ? 118 : 140));

    // 奖励
    const rewardParts = [];
    if (ach.reward?.gold) rewardParts.push(`+${ach.reward.gold}💰银两`);
    if (ach.reward?.fame) rewardParts.push(`+${ach.reward.fame}🏆声望`);
    if (rewardParts.length > 0) {
      ctx.font = `bold ${narrow ? 12 : 14}px ${FONT}`;
      ctx.fillStyle = '#ffdd44';
      ctx.fillText(`奖励：${rewardParts.join(' ')}`, cw / 2, py + (narrow ? 138 : 163));
    }

    // 确认按钮
    const bw = narrow ? 100 : 120;
    const bh = narrow ? 28 : 34;
    const btnRect = { x: cw / 2 - bw / 2, y: py + ph - (narrow ? 42 : 50), w: bw, h: bh };
    drawBtn(ctx, btnRect, '太棒了！', ach.color, mx, my, { fontSize: narrow ? 13 : 15 });
    this._buttons.push({ ...btnRect, action: { type: 'closeAchievement' } });
  }

  // ===== 存档选择弹窗 =====
  drawSaveSlots(ctx, cw, ch, slots, mode, mx, my, narrow) {
    this._buttons = this._buttons || [];
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, cw, ch);

    const pw = Math.min(cw - 30, narrow ? 280 : 360);
    const ph = narrow ? 260 : 300;
    const px = (cw - pw) / 2;
    const py = (ch - ph) / 2;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = COL_ACCENT;
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);

    const title = mode === 'save' ? '💾 保存存档' : '📂 读取存档';
    ctx.textAlign = 'center';
    ctx.fillStyle = COL_ACCENT;
    ctx.font = `bold ${narrow ? 16 : 18}px ${FONT}`;
    ctx.fillText(title, cw / 2, py + (narrow ? 28 : 34));

    let cy = py + (narrow ? 44 : 54);
    for (const slot of slots) {
      const rowH = narrow ? 48 : 56;
      const hovered = hit(mx, my, px + 10, cy, pw - 20, rowH);

      ctx.fillStyle = hovered ? COL_PANEL_HI : COL_PANEL;
      ctx.fillRect(px + 10, cy, pw - 20, rowH);
      ctx.strokeStyle = hovered ? COL_ACCENT : COL_BORDER;
      ctx.strokeRect(px + 10, cy, pw - 20, rowH);

      ctx.textAlign = 'left';
      if (slot.exists) {
        ctx.fillStyle = '#eee';
        ctx.font = `bold ${narrow ? 12 : 14}px ${FONT}`;
        ctx.fillText(`${slot.sectName}`, px + 18, cy + (narrow ? 16 : 20));
        ctx.fillStyle = COL_DIM;
        ctx.font = `${narrow ? 10 : 11}px ${FONT}`;
        ctx.fillText(`第${slot.day}天 · ${slot.disciples}名弟子 · ${slot.gold}💰 ${slot.fame}🏆`, px + 18, cy + (narrow ? 32 : 40));
      } else {
        ctx.fillStyle = COL_DIM;
        ctx.font = `${narrow ? 12 : 14}px ${FONT}`;
        ctx.fillText(`槽位 ${slot.slot + 1} — 空`, px + 18, cy + rowH / 2 + 4);
      }

      const canClick = mode === 'save' || slot.exists;
      if (canClick) {
        this._buttons.push({ x: px + 10, y: cy, w: pw - 20, h: rowH, action: { type: 'saveSlot', slot: slot.slot, mode } });
      }

      cy += rowH + 6;
    }

    // 取消
    const cancelRect = { x: cw / 2 - 50, y: cy + 8, w: 100, h: 28 };
    drawBtn(ctx, cancelRect, '取消', COL_DIM, mx, my, { fontSize: 12 });
    this._buttons.push({ ...cancelRect, action: { type: 'cancelSave' } });
  }

  // ===== 训练动画（完整版：弟子入场 → 体力条动画 → 台词气泡 → 点击继续）=====
  drawTrainAnim(ctx, cw, ch, progress, narrow, animData, waitForClick) {
    if (!animData) return;
    const fs = narrow ? 11 : 13;
    const now = Date.now();

    // 半透明遮罩
    const overlayAlpha = Math.min(0.88, progress * 3);
    ctx.fillStyle = `rgba(4,4,18,${overlayAlpha})`;
    ctx.fillRect(0, 0, cw, ch);

    // 标题
    const titleAlpha = Math.min(1, progress * 5);
    ctx.globalAlpha = titleAlpha;
    ctx.textAlign = 'center';
    const isSingle = animData.type === 'single';
    const singleName = isSingle ? animData.disciples[0]?.disciple?.name || '' : '';
    const titleText  = isSingle ? `⚔ ${singleName} 专项修炼` : '⚔ 全体训练';
    ctx.fillStyle = '#4499ff';
    ctx.font = `bold ${narrow ? 18 : 24}px ${FONT}`;
    ctx.fillText(titleText, cw / 2, narrow ? 44 : 54);
    ctx.globalAlpha = 1;

    const disciples = animData.disciples || [];
    const count = disciples.length;

    // 弟子布局（环绕中心）
    const cx = cw / 2;
    const cy = ch * (isSingle ? 0.42 : 0.44);
    const radius = Math.min(cw * 0.36, ch * 0.26, isSingle ? 0 : 120);
    const dotR   = narrow ? (isSingle ? 30 : 20) : (isSingle ? 36 : 24);

    for (let i = 0; i < count; i++) {
      const { disciple: d, oldStamina, newStamina, expGain } = disciples[i];

      // 弟子位置（单人居中，多人散开）
      let dx, dy;
      if (count === 1) {
        dx = cx; dy = cy;
      } else {
        const spreadAngle = Math.PI * 1.5;
        const startA = -Math.PI / 2 - spreadAngle / 2;
        const step   = count > 1 ? spreadAngle / (count - 1) : 0;
        const a = startA + i * step;
        dx = cx + Math.cos(a) * radius;
        dy = cy + Math.sin(a) * radius * 0.55;
      }

      // 入场动画（向上弹入）
      const appearT = Math.max(0, Math.min(1, progress * 5 - i * 0.35));
      const bounceOff = appearT < 1 ? Math.sin(appearT * Math.PI) * 18 : 0;
      const ay = dy - bounceOff;
      ctx.globalAlpha = appearT;

      // 脉冲光环（训练中）
      if (progress > 0.25 && progress < 0.9) {
        const pulseT = ((now * 0.003 + i * 1.3) % 1);
        const pulseR = dotR + 4 + pulseT * 12;
        const pulseAlpha = (1 - pulseT) * 0.4;
        ctx.globalAlpha = appearT * pulseAlpha;
        ctx.strokeStyle = d.color || '#4499ff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(dx, ay, pulseR, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = appearT;
      }

      // 阴影
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(dx, ay + dotR + 4, dotR * 0.9, dotR * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // 弟子圆形
      ctx.fillStyle = d.color || '#4499ff';
      ctx.beginPath(); ctx.arc(dx, ay, dotR, 0, Math.PI * 2); ctx.fill();

      // 武器图标（居中小字）
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = `${narrow ? 13 : 16}px ${FONT}`;
      const weaponEmojis = { dao: '⚔', daggers: '🗡', hammer: '🔨', spear: '🏹', shield: '🛡' };
      ctx.fillText(weaponEmojis[d.weaponId] || '⚔', dx, ay + (narrow ? 5 : 6));

      // 名称
      ctx.fillStyle = '#eee';
      ctx.font = `bold ${fs}px ${FONT}`;
      ctx.fillText(d.name, dx, ay + dotR + (narrow ? 14 : 16));

      // 个性标签
      const pType = PERSONALITY_TYPES[d.personality];
      if (pType) {
        ctx.fillStyle = pType.color;
        ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
        ctx.fillText(`${pType.icon}${pType.name}`, dx, ay + dotR + (narrow ? 25 : 28));
      }

      // 体力条（动画：从 oldStamina 到 newStamina）
      const drainProgress = Math.max(0, Math.min(1, (progress - 0.35) / 0.45));
      const currentSta = oldStamina - (oldStamina - newStamina) * drainProgress;
      const barW = narrow ? 48 : 58;
      const barH = narrow ? 5 : 6;
      const barX = dx - barW / 2;
      const barY = ay + dotR + (narrow ? 33 : 38);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = currentSta > 40 ? '#ffcc44' : '#ff8844';
      ctx.fillRect(barX, barY, barW * (currentSta / 100), barH);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);

      // 体力耗费数字（动画后出现）
      if (drainProgress > 0.5) {
        const costAlpha = Math.min(1, (drainProgress - 0.5) * 4);
        ctx.globalAlpha = appearT * costAlpha;
        ctx.fillStyle = '#ff8844';
        ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
        ctx.fillText(`-${oldStamina - newStamina}体`, dx + barW / 2 + (narrow ? 6 : 8), barY + (narrow ? 4 : 5));
        // 经验数字
        ctx.fillStyle = '#4499ff';
        ctx.fillText(`+${expGain}exp`, dx - barW / 2 - (narrow ? 2 : 4), barY + (narrow ? 4 : 5));
        ctx.globalAlpha = appearT;
      }

      ctx.globalAlpha = 1;
    }

    // ===== 台词气泡 =====
    const speakers = animData.speakers || [];
    for (const sp of speakers) {
      if (progress < sp.showAt) continue;
      const bubbleAlpha = Math.min(1, (progress - sp.showAt) / 0.12);
      if (bubbleAlpha <= 0) continue;

      // 找到该弟子位置
      const didx = disciples.findIndex(item => item.disciple.id === sp.disciple.id);
      let bx = cx, by = cy;
      if (didx >= 0) {
        const dd = disciples[didx];
        const { disciple: d2 } = dd;
        if (count === 1) { bx = cx; by = cy; }
        else {
          const spreadAngle = Math.PI * 1.5;
          const startA = -Math.PI / 2 - spreadAngle / 2;
          const step   = count > 1 ? spreadAngle / (count - 1) : 0;
          const a = startA + didx * step;
          bx = cx + Math.cos(a) * radius;
          by = cy + Math.sin(a) * radius * 0.55;
        }
      }
      const bubbleY = by - dotR - (narrow ? 56 : 68);
      const maxBW = Math.min(cw - 40, narrow ? 200 : 260);
      ctx.font = `${narrow ? 11 : 13}px ${FONT}`;
      const textW = ctx.measureText(sp.line).width;
      const bw = Math.min(maxBW, textW + (narrow ? 24 : 32));
      const bh = narrow ? 28 : 34;
      const bubX = Math.max(8, Math.min(cw - bw - 8, bx - bw / 2));
      const bubY = Math.max(60, bubbleY);

      ctx.globalAlpha = bubbleAlpha;
      // 背景
      ctx.fillStyle = 'rgba(20,20,40,0.92)';
      ctx.beginPath();
      const br = 8;
      ctx.roundRect(bubX, bubY, bw, bh, br);
      ctx.fill();
      // 边框（个性颜色）
      const pCol = PERSONALITY_TYPES[sp.disciple.personality]?.color || '#4499ff';
      ctx.strokeStyle = pCol;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(bubX, bubY, bw, bh, br); ctx.stroke();
      // 小三角指向弟子
      const tipX = Math.max(bubX + 14, Math.min(bubX + bw - 14, bx));
      ctx.fillStyle = pCol;
      ctx.beginPath();
      ctx.moveTo(tipX - 5, bubY + bh);
      ctx.lineTo(tipX + 5, bubY + bh);
      ctx.lineTo(tipX, bubY + bh + 7);
      ctx.closePath(); ctx.fill();
      // 文字（超长则截断+省略号）
      ctx.fillStyle = '#eee';
      ctx.font = `${narrow ? 11 : 13}px ${FONT}`;
      ctx.textAlign = 'center';
      let line = sp.line;
      if (ctx.measureText(line).width > bw - (narrow ? 16 : 24)) {
        while (ctx.measureText(line + '…').width > bw - (narrow ? 16 : 24) && line.length > 0) line = line.slice(0, -1);
        line += '…';
      }
      ctx.fillText(line, bubX + bw / 2, bubY + bh / 2 + 5);
      ctx.globalAlpha = 1;
    }

    // ===== 训练阶段标签 =====
    if (!waitForClick) {
      const phaseLabel = progress < 0.3 ? '\u26A1 热身中…' : progress < 0.65 ? '\uD83D\uDD25 修炼中…' : progress < 0.88 ? '\uD83D\uDCA5 全力冲刺！' : '\u2728 训练完成！';
      const phaseAlpha = Math.min(1, progress * 6);
      ctx.globalAlpha = phaseAlpha;
      ctx.textAlign = 'center';
      ctx.fillStyle = progress < 0.3 ? '#88aaff' : progress < 0.65 ? '#ffcc44' : progress < 0.88 ? '#ff6644' : '#44dd88';
      ctx.font = `bold ${narrow ? 13 : 16}px ${FONT}`;
      ctx.fillText(phaseLabel, cw / 2, narrow ? 74 : 88);
      ctx.globalAlpha = 1;
    }

    // 进度条（底部简洁）
    if (!waitForClick) {
      const barTW = Math.min(cw - 60, 220);
      const barTX = (cw - barTW) / 2;
      const barTY = ch - (narrow ? 52 : 60);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(barTX, barTY, barTW, narrow ? 4 : 5);
      ctx.fillStyle = '#4499ff';
      ctx.fillRect(barTX, barTY, barTW * Math.min(1, progress / 0.95), narrow ? 4 : 5);
    }

    // 点击继续提示（闪烁）
    if (waitForClick) {
      const flash = 0.5 + 0.5 * Math.sin(now * 0.0045);
      ctx.globalAlpha = flash;
      ctx.textAlign = 'center';
      ctx.fillStyle = COL_ACCENT;
      ctx.font = `bold ${narrow ? 13 : 15}px ${FONT}`;
      ctx.fillText('「 点击任意处继续 」', cw / 2, ch - (narrow ? 36 : 44));
      // 训练结果预览
      ctx.globalAlpha = flash * 0.7;
      ctx.fillStyle = '#88aaff';
      ctx.font = `${narrow ? 10 : 11}px ${FONT}`;
      const totalExp = disciples.reduce((s, dd) => s + (dd.expGain || 0), 0);
      const preview = isSingle
        ? `${disciples[0]?.disciple?.name || ''} 专修 +${disciples[0]?.expGain || 0}exp -20体`
        : `${disciples.length}人训练完成 · 合计+${totalExp}exp`;
      ctx.fillText(preview, cw / 2, ch - (narrow ? 20 : 26));
      ctx.globalAlpha = 1;
    }
  }

  // ===== 剧情弹窗 =====
  drawStoryPopup(ctx, cw, ch, story, pageIdx, mx, my, narrow) {
    this._buttons = this._buttons || [];
    // 遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, cw, ch);

    const pw = Math.min(cw - 30, narrow ? 320 : 420);
    const textFs = narrow ? 12 : 14;
    const lineH = narrow ? 20 : 24;

    // 先测量当前页文本高度
    ctx.font = `${textFs}px ${FONT}`;
    const pageText = story.pages[pageIdx] || '';
    const lines = wrapText(ctx, pageText, pw - 40);
    const textH = lines.length * lineH;
    const ph = Math.max(narrow ? 170 : 200, textH + (narrow ? 110 : 130));
    const px = (cw - pw) / 2;
    const py = (ch - ph) / 2;

    // 面板背景
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#aa8844';
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);
    // 顶部装饰线
    ctx.fillStyle = '#aa8844';
    ctx.fillRect(px + 20, py + 1, pw - 40, 2);

    // 标题
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffdd88';
    ctx.font = `bold ${narrow ? 16 : 20}px ${FONT}`;
    ctx.fillText(`📖 ${story.title}`, cw / 2, py + (narrow ? 30 : 36));

    // 页码
    ctx.fillStyle = '#666';
    ctx.font = `${narrow ? 9 : 10}px ${FONT}`;
    ctx.fillText(`${pageIdx + 1} / ${story.pages.length}`, cw / 2, py + (narrow ? 44 : 52));

    // 正文
    ctx.fillStyle = '#ddd';
    ctx.font = `${textFs}px ${FONT}`;
    let ty = py + (narrow ? 58 : 68);
    for (const line of lines) {
      ctx.fillText(line, cw / 2, ty);
      ty += lineH;
    }

    // 按钮
    const btnY = py + ph - (narrow ? 38 : 44);
    const isLast = pageIdx >= story.pages.length - 1;

    if (isLast) {
      const finRect = { x: cw / 2 - 50, y: btnY, w: 100, h: 30 };
      drawBtn(ctx, finRect, '继续', '#aa8844', mx, my, { fontSize: narrow ? 13 : 14 });
      this._buttons.push({ ...finRect, action: { type: 'storyDone' } });
    } else {
      const nextRect = { x: cw / 2 - 50, y: btnY, w: 100, h: 30 };
      drawBtn(ctx, nextRect, '下一页 →', '#aa8844', mx, my, { fontSize: narrow ? 12 : 13 });
      this._buttons.push({ ...nextRect, action: { type: 'storyNext' } });
    }
  }
}
