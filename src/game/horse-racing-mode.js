// ===================== 田忌赛马 (Tian Ji Horse Racing) =====================
// 策略对战：玩家分配出战顺序，与AI队伍进行 Best-of-N 对决
// 核心是知己知彼、田忌赛马式策略

import * as C from '../core/constants.js';
import { dist, angleBetween } from '../core/utils.js';
import { Enemy } from '../ai/enemy.js';
import { CombatSystem } from '../combat/combat-system.js';
import { getWeapon, WEAPON_LIST, randomWeapon } from '../weapons/weapon-defs.js';
import { getArmor, ARMOR_LIST } from '../weapons/armor-defs.js';
import { generateUniqueNames } from '../core/names.js';

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const DIFF_NAMES = ['新手', '普通', '熟练', '困难', '大师'];

// ===== 创建参赛武者 =====
function createWarrior(named, difficulty, weaponId, armorId) {
  const weapon = getWeapon(weaponId || randomWeapon());
  const armor = getArmor(armorId || 'none');
  return {
    name: named.name,
    title: named.title,
    fullName: named.fullName,
    difficulty,
    weaponId: weapon.id,
    weapon,
    armorId: armor.id,
    armor,
    color: weapon.color,
    power: difficulty * 10 + (armor.hpBonus || 0), // 展示用综合"战力"
  };
}

export class HorseRacingMode {
  constructor() {
    this.stage = 0;             // 当前关卡 (0-based)
    this.maxStages = 5;         // 5关通关
    this.wins = 0;
    this.losses = 0;
    this.phase = 'pick';        // 'pick' | 'fighting' | 'roundResult' | 'stageResult' | 'victory' | 'defeat'

    // 当前关
    this.teamSize = 3;          // 每关3人
    this.playerTeam = [];       // 玩家的武者队伍
    this.aiTeam = [];           // AI的武者队伍
    this.playerOrder = [];      // 玩家出战顺序 (index数组)
    this.aiOrder = [];          // AI出战顺序 (index数组)
    this.currentMatch = 0;      // 当前第几场 (0-based)
    this.stageScore = [0, 0];   // [玩家赢, AI赢]

    // 战斗实例
    this.fighters = [];
    this.enemies = [];
    this.combat = null;
    this.gameTime = 0;
    this.fightDone = false;
    this.winner = null;

    // 拖拽选择
    this._selectedSlot = -1;    // 当前选中的玩家武者索引
    this._hoverSlot = -1;

    this._setupStage();
  }

  _setupStage() {
    this.phase = 'pick';
    this.currentMatch = 0;
    this.stageScore = [0, 0];
    this.fightDone = false;
    this.playerOrder = [];

    // 难度递增
    const baseDiff = Math.min(5, 1 + this.stage);
    const maxDiff = Math.min(5, 2 + this.stage);

    const names = generateUniqueNames(this.teamSize * 2, true);

    // 生成两队
    this.playerTeam = [];
    this.aiTeam = [];
    const weapons = [];
    for (let i = 0; i < this.teamSize * 2; i++) {
      weapons.push(randomWeapon());
    }

    for (let i = 0; i < this.teamSize; i++) {
      const diff = baseDiff + Math.floor(Math.random() * (maxDiff - baseDiff + 1));
      this.playerTeam.push(createWarrior(names[i], diff, weapons[i]));
    }
    for (let i = 0; i < this.teamSize; i++) {
      const diff = baseDiff + Math.floor(Math.random() * (maxDiff - baseDiff + 1));
      this.aiTeam.push(createWarrior(names[this.teamSize + i], diff, weapons[this.teamSize + i]));
    }

    // AI出战顺序：按战力从高到低（经典策略）
    this.aiOrder = this.aiTeam.map((_, i) => i)
      .sort((a, b) => this.aiTeam[b].power - this.aiTeam[a].power);
  }

  // 玩家选择出战顺序
  setPlayerOrder(order) {
    this.playerOrder = order.slice();
  }

  // 开始当前场次战斗
  startMatch(particles, camera) {
    if (this.currentMatch >= this.teamSize) return;
    this.phase = 'fighting';
    this.fightDone = false;
    this.gameTime = 0;
    this.winner = null;

    const pIdx = this.playerOrder[this.currentMatch];
    const aIdx = this.aiOrder[this.currentMatch];
    const pw = this.playerTeam[pIdx];
    const aw = this.aiTeam[aIdx];

    this.combat = new CombatSystem(particles, camera);
    this.combat.playerFighter = null;

    const eA = new Enemy(C.ARENA_W / 2 - 80, C.ARENA_H / 2, pw.difficulty, {
      weaponId: pw.weaponId, color: '#4488ff', name: pw.fullName,
    });
    eA.fighter.armor = getArmor(pw.armorId);
    eA.fighter.team = 0;

    const eB = new Enemy(C.ARENA_W / 2 + 80, C.ARENA_H / 2, aw.difficulty, {
      weaponId: aw.weaponId, color: '#ff4444', name: aw.fullName,
    });
    eB.fighter.armor = getArmor(aw.armorId);
    eB.fighter.team = 1;
    eB.fighter.facing = Math.PI;

    this.enemies = [eA, eB];
    this.fighters = [eA.fighter, eB.fighter];
  }

  tickFight(dt) {
    if (this.fightDone) return;
    this.gameTime += dt;

    for (const e of this.enemies) {
      if (!e.fighter.alive) continue;
      const opponent = this.fighters.find(f => f !== e.fighter && f.alive);
      if (!opponent) continue;
      const cmd = e.getCommands(dt, opponent);
      e.fighter.update(dt, cmd, this.gameTime);
    }

    // 分离
    const [a, b] = this.fighters;
    if (a.alive && b.alive) {
      const d = dist(a, b);
      const minSep = a.radius + b.radius + C.FIGHTER_SEPARATION_GAP;
      if (d < minSep && d > 0) {
        const ang = angleBetween(a, b);
        const push = (minSep - d) / 2;
        a.x -= Math.cos(ang) * push;
        a.y -= Math.sin(ang) * push;
        b.x += Math.cos(ang) * push;
        b.y += Math.sin(ang) * push;
      }
    }

    // 边界
    for (const f of this.fighters) {
      f.x = Math.max(f.radius, Math.min(C.ARENA_W - f.radius, f.x));
      f.y = Math.max(f.radius, Math.min(C.ARENA_H - f.radius, f.y));
    }

    this.combat.resolve(this.fighters, this.gameTime, dt);

    // 检查胜负
    const alive = this.fighters.filter(f => f.alive);
    if (alive.length <= 1 || this.gameTime > 60) {
      if (alive.length === 1) {
        this.winner = alive[0];
      } else if (alive.length === 2) {
        // 超时：血量高者胜
        this.winner = this.fighters[0].hp >= this.fighters[1].hp ? this.fighters[0] : this.fighters[1];
      }
      this.fightDone = true;

      // 记分
      if (this.winner) {
        if (this.winner.team === 0) {
          this.stageScore[0]++;
        } else {
          this.stageScore[1]++;
        }
      }
      this.phase = 'roundResult';
    }
  }

  // 进入下一场或归总
  advanceMatch() {
    this.currentMatch++;
    if (this.currentMatch >= this.teamSize) {
      // 本关结束
      if (this.stageScore[0] > this.stageScore[1]) {
        this.wins++;
      } else {
        this.losses++;
      }
      if (this.losses >= 2) {
        this.phase = 'defeat';
      } else if (this.stage >= this.maxStages - 1) {
        this.phase = 'victory';
      } else {
        this.phase = 'stageResult';
      }
    } else {
      this.phase = 'fighting';
    }
  }

  // 下一关
  nextStage() {
    this.stage++;
    this._setupStage();
  }

  getMatchupInfo(matchIdx) {
    if (matchIdx >= this.teamSize) return null;
    const pIdx = this.playerOrder[matchIdx];
    const aIdx = this.aiOrder[matchIdx];
    return {
      player: this.playerTeam[pIdx],
      ai: this.aiTeam[aIdx],
    };
  }
}

// ===================== Game mixin methods =====================
export const horseRacingModeMethods = {
  _setupHorseRacing() {
    this.horseRacing = new HorseRacingMode();
    this._hrClickCd = 0;
    this._hrDragIdx = -1;       // 拖拽中的武者索引
    this._hrSlots = [];         // 玩家出战槽位
    this._hrReady = false;      // 排阵完成
  },

  _updateHorseRacing(dt) {
    const hr = this.horseRacing;
    const input = this.input;
    this._hrClickCd -= dt;

    if (input.pressed('Escape') && this.onExit) {
      this.onExit();
      return;
    }

    if (hr.phase === 'pick') {
      this._updateHRPick(dt);
    } else if (hr.phase === 'fighting') {
      if (!hr.fightDone) {
        // 开始当前场次
        if (!hr.combat) {
          hr.startMatch(this.particles, this.camera);
        }
        hr.tickFight(dt);
        this.particles.update(dt);
        this.camera.update(dt);
      }
    } else if (hr.phase === 'roundResult') {
      if ((input.pressed('Space') || input.mouseLeftDown) && this._hrClickCd <= 0) {
        hr.advanceMatch();
        this._hrClickCd = 0.3;
        if (hr.phase === 'fighting') {
          hr.startMatch(this.particles, this.camera);
        }
      }
    } else if (hr.phase === 'stageResult') {
      if ((input.pressed('Space') || input.mouseLeftDown) && this._hrClickCd <= 0) {
        hr.nextStage();
        this._hrSlots = [];
        this._hrReady = false;
        this._hrClickCd = 0.3;
      }
    } else if (hr.phase === 'victory' || hr.phase === 'defeat') {
      if ((input.pressed('Space') || input.mouseLeftDown) && this._hrClickCd <= 0) {
        if (this.onExit) this.onExit();
      }
    }
  },

  _updateHRPick(dt) {
    const hr = this.horseRacing;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    if (!this.input.mouseLeftDown || this._hrClickCd > 0) return;

    const L = this._layoutHRPick();

    // 点击玩家武者卡牌加入出战顺序
    for (let i = 0; i < hr.playerTeam.length; i++) {
      const b = L.playerCards[i];
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        // 如果已在排阵中则移除，否则添加
        const pos = this._hrSlots.indexOf(i);
        if (pos >= 0) {
          this._hrSlots.splice(pos, 1);
        } else if (this._hrSlots.length < hr.teamSize) {
          this._hrSlots.push(i);
        }
        this._hrReady = this._hrSlots.length === hr.teamSize;
        this._hrClickCd = 0.15;
        return;
      }
    }

    // 确认出战按钮
    if (this._hrReady && L.confirmBtn) {
      const b = L.confirmBtn;
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        hr.setPlayerOrder(this._hrSlots);
        hr.startMatch(this.particles, this.camera);
        this._hrClickCd = 0.3;
        return;
      }
    }
  },

  _layoutHRPick() {
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const cx = cw / 2;
    const hr = this.horseRacing;
    const cardW = 150, cardH = 120;
    const gap = 16;

    // 玩家队伍卡牌
    const playerCards = [];
    const totalPW = hr.teamSize * cardW + (hr.teamSize - 1) * gap;
    const psx = cx - totalPW / 2;
    for (let i = 0; i < hr.teamSize; i++) {
      playerCards.push({ x: psx + i * (cardW + gap), y: ch * 0.35, w: cardW, h: cardH });
    }

    // AI队伍卡牌
    const aiCards = [];
    const totalAW = hr.teamSize * cardW + (hr.teamSize - 1) * gap;
    const asx = cx - totalAW / 2;
    for (let i = 0; i < hr.teamSize; i++) {
      aiCards.push({ x: asx + i * (cardW + gap), y: ch * 0.08, w: cardW, h: cardH });
    }

    const confirmBtn = this._hrReady ? { x: cx - 70, y: ch * 0.82, w: 140, h: 42 } : null;

    return { playerCards, aiCards, confirmBtn };
  },

  _renderHorseRacing() {
    const dpr = this.canvas._dpr || 1;
    const lw = this.canvas._logicW || this.canvas.width;
    const lh = this.canvas._logicH || this.canvas.height;
    const ctx = this.renderer.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hr = this.horseRacing;

    if (hr.phase === 'fighting') {
      // 战斗渲染
      this.renderer.clear(lw, lh);
      ctx.save();
      this.camera.applyWorldTransform(ctx);
      this.renderer.drawGrid();
      for (const e of hr.enemies) {
        this.renderer.drawFighter(e.fighter);
      }
      this.renderer.drawParticles(this.particles);
      ctx.restore();

      // 顶部对阵信息
      this._drawHRFightHUD(ctx, lw, lh);
    } else {
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, lw, lh);
    }

    // 顶部栏
    this._drawHRTopBar(ctx, lw);

    if (hr.phase === 'pick') {
      this._drawHRPick(ctx, lw, lh);
    } else if (hr.phase === 'roundResult') {
      this._drawHRRoundResult(ctx, lw, lh);
    } else if (hr.phase === 'stageResult') {
      this._drawHRStageResult(ctx, lw, lh);
    } else if (hr.phase === 'victory') {
      this._drawHRVictory(ctx, lw, lh);
    } else if (hr.phase === 'defeat') {
      this._drawHRDefeat(ctx, lw, lh);
    }
  },

  _drawHRTopBar(ctx, lw) {
    const hr = this.horseRacing;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, lw, 36);
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8e0d0';
    ctx.fillText(`🐎 田忌赛马 · 第 ${hr.stage + 1}/${hr.maxStages} 关 · 胜${hr.wins} 负${hr.losses}`, lw / 2, 24);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#888';
    ctx.fillText('ESC 退出', lw - 12, 24);
  },

  _drawHRPick(ctx, lw, lh) {
    const hr = this.horseRacing;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const L = this._layoutHRPick();
    const cx = lw / 2;

    // AI队伍标题
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff6644';
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.fillText('对手阵容（出战顺序从左到右）', cx, lh * 0.06);

    // AI卡牌
    for (let i = 0; i < hr.teamSize; i++) {
      const aIdx = hr.aiOrder[i];
      this._drawHRCard(ctx, L.aiCards[i], hr.aiTeam[aIdx], '#ff4444', -1, false, mx, my);
      // 出战序号
      ctx.fillStyle = '#ff6644';
      ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`第${i + 1}场`, L.aiCards[i].x + L.aiCards[i].w / 2, L.aiCards[i].y - 6);
    }

    // 玩家队伍标题
    ctx.fillStyle = '#4488ff';
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.fillText('你的阵容（点击选择出战顺序）', cx, lh * 0.32);

    // 玩家卡牌
    for (let i = 0; i < hr.teamSize; i++) {
      const slotIdx = this._hrSlots.indexOf(i);
      this._drawHRCard(ctx, L.playerCards[i], hr.playerTeam[i], '#4488ff', slotIdx, true, mx, my);
    }

    // 出战顺序预览
    if (this._hrSlots.length > 0) {
      ctx.fillStyle = '#aaa';
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      const orderStr = this._hrSlots.map((idx, i) => `${i + 1}.${hr.playerTeam[idx].fullName}`).join('  →  ');
      ctx.fillText(`出战顺序: ${orderStr}`, cx, lh * 0.70);
    }

    // 对阵预测
    if (this._hrSlots.length === hr.teamSize) {
      ctx.fillStyle = '#666';
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      let previewY = lh * 0.74;
      for (let i = 0; i < hr.teamSize; i++) {
        const pIdx = this._hrSlots[i];
        const aIdx = hr.aiOrder[i];
        const pw = hr.playerTeam[pIdx];
        const aw = hr.aiTeam[aIdx];
        ctx.fillText(`第${i + 1}场: ${pw.fullName}(${pw.weapon.icon}★${pw.difficulty}) vs ${aw.fullName}(${aw.weapon.icon}★${aw.difficulty})`, cx, previewY);
        previewY += 16;
      }
    }

    // 确认按钮
    if (L.confirmBtn) {
      const b = L.confirmBtn;
      const hover = mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;
      ctx.fillStyle = hover ? '#44dd88' : '#228855';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('开始对决！', b.x + b.w / 2, b.y + b.h / 2 + 5);
    }
  },

  _drawHRCard(ctx, rect, warrior, borderColor, slotIdx, isPlayer, mx, my) {
    const hover = mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h;
    const selected = slotIdx >= 0;
    ctx.fillStyle = selected ? 'rgba(68,136,255,0.15)' : (hover ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)');
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = selected ? '#ffcc44' : borderColor;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    // 选中序号
    if (selected) {
      ctx.fillStyle = '#ffcc44';
      ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${slotIdx + 1}`, rect.x + rect.w - 8, rect.y + 22);
    }

    const cx = rect.x + rect.w / 2;
    let ty = rect.y + 22;
    ctx.textAlign = 'center';

    // 名字
    ctx.fillStyle = '#e8e0d0';
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
    ctx.fillText(warrior.fullName, cx, ty);
    ty += 20;

    // 武器
    ctx.fillStyle = warrior.color || '#aaa';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${warrior.weapon.icon} ${warrior.weapon.name}`, cx, ty);
    ty += 18;

    // 难度星级
    const stars = '★'.repeat(warrior.difficulty) + '☆'.repeat(5 - warrior.difficulty);
    ctx.fillStyle = '#aaa';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillText(stars, cx, ty);
    ty += 16;

    // 护甲
    ctx.fillStyle = '#777';
    ctx.fillText(`${warrior.armor.icon} ${warrior.armor.name}`, cx, ty);
  },

  _drawHRFightHUD(ctx, lw, lh) {
    const hr = this.horseRacing;
    // 对阵信息
    const pIdx = hr.playerOrder[hr.currentMatch];
    const aIdx = hr.aiOrder[hr.currentMatch];
    const pw = hr.playerTeam[pIdx];
    const aw = hr.aiTeam[aIdx];

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 36, lw, 28);
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8e0d0';
    ctx.fillText(`第${hr.currentMatch + 1}场 · ${pw.fullName} vs ${aw.fullName} · 比分 ${hr.stageScore[0]}-${hr.stageScore[1]}`, lw / 2, 54);

    // 血条
    const barW = 160, barH = 8;
    for (let i = 0; i < 2; i++) {
      const f = hr.fighters[i];
      if (!f) continue;
      const bx = i === 0 ? 10 : lw - barW - 10;
      const by = 68;
      ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.fillStyle = f.alive ? (f.color || '#ccc') : '#555';
      ctx.font = '11px "Microsoft YaHei", sans-serif';
      ctx.fillText(f.name, i === 0 ? bx : bx + barW, by - 2);
      ctx.fillStyle = 'rgba(255,0,0,0.2)';
      ctx.fillRect(bx, by + 2, barW, barH);
      if (f.alive) {
        const ratio = Math.max(0, f.hp / f.maxHp);
        ctx.fillStyle = ratio > 0.5 ? '#44cc44' : (ratio > 0.25 ? '#cccc44' : '#cc4444');
        ctx.fillRect(bx, by + 2, barW * ratio, barH);
      }
    }
  },

  _drawHRRoundResult(ctx, lw, lh) {
    const hr = this.horseRacing;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, lw, lh);
    ctx.textAlign = 'center';

    const pIdx = hr.playerOrder[hr.currentMatch];
    const aIdx = hr.aiOrder[hr.currentMatch];

    const won = hr.winner && hr.winner.team === 0;
    ctx.fillStyle = won ? '#44ff44' : '#ff4444';
    ctx.font = 'bold 24px "Microsoft YaHei", sans-serif';
    ctx.fillText(won ? '✅ 本场获胜！' : '❌ 本场落败', lw / 2, lh * 0.3);

    ctx.fillStyle = '#e8e0d0';
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.fillText(`当前比分: ${hr.stageScore[0]} - ${hr.stageScore[1]}`, lw / 2, lh * 0.42);

    ctx.fillStyle = '#888';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    const remain = hr.teamSize - hr.currentMatch - 1;
    ctx.fillText(remain > 0 ? `还有 ${remain} 场比赛` : '本关所有比赛已结束', lw / 2, lh * 0.52);

    ctx.fillStyle = '#666';
    ctx.fillText('点击继续', lw / 2, lh * 0.62);
  },

  _drawHRStageResult(ctx, lw, lh) {
    const hr = this.horseRacing;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, lw, lh);
    ctx.textAlign = 'center';

    const playerWon = hr.stageScore[0] > hr.stageScore[1];
    ctx.fillStyle = playerWon ? '#44ff44' : '#ff4444';
    ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
    ctx.fillText(playerWon ? '🏆 本关获胜！' : '💀 本关失败', lw / 2, lh * 0.25);

    ctx.fillStyle = '#e8e0d0';
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.fillText(`比分 ${hr.stageScore[0]} : ${hr.stageScore[1]}`, lw / 2, lh * 0.38);

    ctx.fillStyle = '#aaa';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillText(`总战绩 ${hr.wins}胜 ${hr.losses}负 (2负出局)`, lw / 2, lh * 0.48);

    ctx.fillStyle = '#666';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText('点击进入下一关', lw / 2, lh * 0.6);
  },

  _drawHRVictory(ctx, lw, lh) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, lw, lh);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcc44';
    ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
    ctx.fillText('🐎 田忌赛马通关！', lw / 2, lh * 0.3);
    ctx.fillStyle = '#e8e0d0';
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.fillText(`最终战绩 ${this.horseRacing.wins}胜 ${this.horseRacing.losses}负`, lw / 2, lh * 0.45);
    ctx.fillStyle = '#666';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText('点击返回菜单', lw / 2, lh * 0.58);
  },

  _drawHRDefeat(ctx, lw, lh) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, lw, lh);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
    ctx.fillText('💀 两负出局', lw / 2, lh * 0.3);
    ctx.fillStyle = '#aaa';
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.fillText(`走到了第 ${this.horseRacing.stage + 1} 关`, lw / 2, lh * 0.43);
    ctx.fillStyle = '#666';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText('点击返回菜单', lw / 2, lh * 0.55);
  },
};
