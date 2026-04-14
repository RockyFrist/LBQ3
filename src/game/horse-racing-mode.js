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

// ===== 武器属性速查 =====
const WEAPON_STATS = {
  dao:     { atk: 3, def: 3, spd: 3, rng: 3, name: '刀', type: '均衡' },
  daggers: { atk: 2, def: 1, spd: 5, rng: 1, name: '双匕', type: '速度' },
  hammer:  { atk: 5, def: 3, spd: 1, rng: 3, name: '锤', type: '力量' },
  spear:   { atk: 3, def: 3, spd: 3, rng: 5, name: '枪', type: '控制' },
  shield:  { atk: 2, def: 5, spd: 3, rng: 2, name: '盾', type: '防御' },
};

// ===== 武器克制关系 =====
const WEAPON_MATCHUPS = {
  dao:     { advantage: ['daggers'], disadvantage: ['spear'] },
  daggers: { advantage: ['hammer'],  disadvantage: ['dao', 'shield'] },
  hammer:  { advantage: ['shield'],  disadvantage: ['daggers', 'spear'] },
  spear:   { advantage: ['dao', 'hammer'], disadvantage: ['shield'] },
  shield:  { advantage: ['daggers', 'spear'], disadvantage: ['hammer'] },
};

function getMatchupResult(wIdA, wIdB) {
  const mu = WEAPON_MATCHUPS[wIdA];
  if (!mu) return 0;
  if (mu.advantage.includes(wIdB)) return 1;  // A克制B
  if (mu.disadvantage.includes(wIdB)) return -1; // A被B克制
  return 0;
}

function getMatchupLabel(wIdA, wIdB) {
  const r = getMatchupResult(wIdA, wIdB);
  if (r > 0) return '克制';
  if (r < 0) return '被克';
  return '均势';
}

// ===== 胜率预估 =====
function estimateWinRate(pw, aw) {
  let scoreP = pw.difficulty * 12;
  let scoreA = aw.difficulty * 12;
  scoreP += getMatchupResult(pw.weaponId, aw.weaponId) * 6;
  scoreA += getMatchupResult(aw.weaponId, pw.weaponId) * 6;
  scoreP += (pw.armor.hpBonus || 0) * 0.5;
  scoreA += (aw.armor.hpBonus || 0) * 0.5;
  scoreP = Math.max(5, scoreP);
  scoreA = Math.max(5, scoreA);
  return Math.round(scoreP / (scoreP + scoreA) * 100);
}

// ===== 赛马解说 =====
const HR_COMMENTARY = {
  matchStart: ['比武开始！', '请看！两位武者登场！'],
  playerWin: ['干得漂亮！我方获胜！', '太好了！赢得漂亮！'],
  playerLose: ['可惜！本场落败了…', '输了，但整体局势还在！'],
  upset: ['爆冷了！实力较弱的一方反而获胜！', '万万没想到！打出了翻转！'],
  sweep: ['完美的横扫！', '零封！对手毫无还手之力！'],
};

// ===== AI出战策略类型 =====
const AI_STRATEGIES = [
  { name: '强先出', sort: (team) => [...team.keys()].sort((a, b) => team[b].power - team[a].power) },
  { name: '弱先出', sort: (team) => [...team.keys()].sort((a, b) => team[a].power - team[b].power) },
  { name: '随机出', sort: (team) => { const arr = [...team.keys()]; for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; } },
  { name: '均衡出', sort: (team) => {
    const arr = [...team.keys()];
    arr.sort((a, b) => team[a].power - team[b].power);
    // 中、强、弱的顺序
    if (arr.length >= 3) return [arr[1], arr[2], arr[0]];
    return arr;
  }},
];

// ===== 创建参赛武者 =====
function createWarrior(named, difficulty, weaponId, armorId) {
  const weapon = getWeapon(weaponId || randomWeapon());
  const armor = getArmor(armorId || 'none');
  const ws = WEAPON_STATS[weapon.id] || { atk: 3, def: 3, spd: 3, rng: 3, type: '未知' };
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
    power: difficulty * 10 + (armor.hpBonus || 0),
    stats: ws,
  };
}

export class HorseRacingMode {
  constructor() {
    this.stage = 0;             // 当前关卡 (0-based)
    this.maxStages = 5;         // 5关通关
    this.wins = 0;
    this.losses = 0;
    this.phase = 'pick';        // 'pick' | 'fighting' | 'roundResult' | 'stageResult' | 'victory' | 'defeat'

    // 金币系统
    this.gold = 1000;
    this.betAmount = 100;
    this.goldHistory = [1000];

    // 当前关
    this.teamSize = 3;          // 每关3人
    this.playerTeam = [];       // 玩家的武者队伍
    this.aiTeam = [];           // AI的武者队伍
    this.playerOrder = [];      // 玩家出战顺序 (index数组)
    this.aiOrder = [];          // AI出战顺序 (index数组)
    this.aiStrategyName = '';   // AI策略名称
    this.currentMatch = 0;      // 当前第几场 (0-based)
    this.stageScore = [0, 0];   // [玩家赢, AI赢]

    // 战斗实例
    this.fighters = [];
    this.enemies = [];
    this.combat = null;
    this.gameTime = 0;
    this.fightDone = false;
    this.winner = null;

    // 每场战斗记录
    this.matchResults = [];     // { playerWarrior, aiWarrior, playerWon, winRate, upset }

    // 解说
    this.commentary = '';
    this.commentFade = 0;

    // 拖拽选择
    this._selectedSlot = -1;
    this._hoverSlot = -1;

    this._setupStage();
  }

  _setupStage() {
    this.phase = 'pick';
    this.currentMatch = 0;
    this.stageScore = [0, 0];
    this.fightDone = false;
    this.playerOrder = [];
    this.matchResults = [];
    this.commentary = '';
    this.commentFade = 0;

    // 难度递增（最低3级起步）
    const baseDiff = Math.min(5, Math.max(3, 1 + this.stage));
    const maxDiff = Math.min(5, Math.max(3, 2 + this.stage));

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

    // 护甲随机分配（后期关卡更好的护甲）
    const armorPool = this.stage <= 1 ? ['none', 'none', 'light']
      : this.stage <= 3 ? ['none', 'light', 'light', 'medium']
      : ['light', 'medium', 'medium', 'heavy'];
    for (const w of [...this.playerTeam, ...this.aiTeam]) {
      if (w.armorId === 'none' && Math.random() < 0.4 + this.stage * 0.1) {
        const aId = pick(armorPool);
        w.armorId = aId;
        w.armor = getArmor(aId);
        w.power = w.difficulty * 10 + (w.armor.hpBonus || 0);
      }
    }

    // AI出战策略：随关卡变化
    const stratIdx = this.stage % AI_STRATEGIES.length;
    const strat = AI_STRATEGIES[stratIdx];
    this.aiStrategyName = strat.name;
    this.aiOrder = strat.sort(this.aiTeam);
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
    // 赛马模式显示名字标签
    for (const f of this.fighters) f.showNameTag = true;
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
        this.winner = this.fighters[0].hp >= this.fighters[1].hp ? this.fighters[0] : this.fighters[1];
      }
      this.fightDone = true;

      // 记分
      const playerWon = this.winner && this.winner.team === 0;
      if (this.winner) {
        if (playerWon) {
          this.stageScore[0]++;
        } else {
          this.stageScore[1]++;
        }
      }

      // 记录本场结果
      const pIdx = this.playerOrder[this.currentMatch];
      const aIdx = this.aiOrder[this.currentMatch];
      const pw = this.playerTeam[pIdx];
      const aw = this.aiTeam[aIdx];
      const winRate = estimateWinRate(pw, aw);
      const upset = (playerWon && winRate < 40) || (!playerWon && winRate > 60);
      this.matchResults.push({
        playerWarrior: pw, aiWarrior: aw,
        playerWon, winRate, upset,
        winnerHpPct: this.winner ? Math.round(this.winner.hp / this.winner.maxHp * 100) : 0,
        duration: this.gameTime,
      });

      // 解说
      if (upset) {
        this.commentary = pick(HR_COMMENTARY.upset);
      } else if (playerWon) {
        this.commentary = pick(HR_COMMENTARY.playerWin);
      } else {
        this.commentary = pick(HR_COMMENTARY.playerLose);
      }
      this.commentFade = 3;

      this.phase = 'roundResult';
    }
  }

  // 进入下一场或归总
  advanceMatch() {
    this.currentMatch++;
    if (this.currentMatch >= this.teamSize) {
      // 本关结束
      const playerWon = this.stageScore[0] > this.stageScore[1];
      if (playerWon) {
        this.wins++;
        // 奖励金币：基础200 + 每场胜利100
        const bonus = 200 + this.stageScore[0] * 100;
        // 完美通关额外奖励
        const perfect = this.stageScore[1] === 0;
        const reward = perfect ? bonus * 2 : bonus;
        this.gold += reward;
        this._lastGoldChange = reward;
        this._lastPerfect = perfect;
      } else {
        this.losses++;
        this._lastGoldChange = 0;
        this._lastPerfect = false;
      }
      this.goldHistory.push(this.gold);
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

    if ((input.pressed('Escape') || input.touchBack) && this.onExit) {
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
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffcc44';
    ctx.fillText(`💰 ${hr.gold}`, 12, 24);
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
    ctx.fillText(`对手阵容（AI策略: ${hr.aiStrategyName}）`, cx, lh * 0.06);

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

    // 策略提示框
    ctx.fillStyle = 'rgba(68,136,255,0.08)';
    ctx.fillRect(cx - 220, lh * 0.54, 440, 52);
    ctx.strokeStyle = 'rgba(68,136,255,0.2)';
    ctx.strokeRect(cx - 220, lh * 0.54, 440, 52);
    ctx.fillStyle = '#4488ff';
    ctx.font = 'bold 11px "Microsoft YaHei", sans-serif';
    ctx.fillText('💡 田忌赛马策略', cx, lh * 0.56 + 10);
    ctx.fillStyle = '#aaa';
    ctx.font = '10px "Microsoft YaHei", sans-serif';
    ctx.fillText('核心：用弱马对强马，用强马对弱马 | 注意武器克制：枪克刀，匕克锤，锤克盾，盾克枪/匕', cx, lh * 0.56 + 26);
    ctx.fillText(`对手策略: ${hr.aiStrategyName} — 利用这个信息安排出战顺序！`, cx, lh * 0.56 + 40);

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

    // 对阵预测（增强版：显示胜率和克制关系）
    if (this._hrSlots.length === hr.teamSize) {
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      let previewY = lh * 0.74;
      for (let i = 0; i < hr.teamSize; i++) {
        const pIdx = this._hrSlots[i];
        const aIdx = hr.aiOrder[i];
        const pw = hr.playerTeam[pIdx];
        const aw = hr.aiTeam[aIdx];
        const winRate = estimateWinRate(pw, aw);
        const matchup = getMatchupLabel(pw.weaponId, aw.weaponId);
        // 胜率颜色编码
        const wrColor = winRate >= 60 ? '#44cc44' : winRate >= 45 ? '#cccc44' : '#ff6644';
        const muColor = matchup === '克制' ? '#44cc44' : matchup === '被克' ? '#ff6644' : '#888';
        ctx.fillStyle = '#888';
        ctx.textAlign = 'left';
        const lineX = cx - 200;
        ctx.fillText(`第${i + 1}场: ${pw.fullName}(${pw.weapon.icon}) vs ${aw.fullName}(${aw.weapon.icon})`, lineX, previewY);
        ctx.fillStyle = wrColor;
        ctx.textAlign = 'right';
        ctx.fillText(`胜率${winRate}%`, cx + 160, previewY);
        ctx.fillStyle = muColor;
        ctx.fillText(`[${matchup}]`, cx + 200, previewY);
        previewY += 18;
      }
      // 总体胜率建议
      let favorCount = 0;
      for (let i = 0; i < hr.teamSize; i++) {
        const pIdx = this._hrSlots[i];
        const aIdx = hr.aiOrder[i];
        const wr = estimateWinRate(hr.playerTeam[pIdx], hr.aiTeam[aIdx]);
        if (wr >= 50) favorCount++;
      }
      ctx.textAlign = 'center';
      if (favorCount >= 2) {
        ctx.fillStyle = '#44cc44';
        ctx.fillText('✅ 这个排阵算不错！多数场次占优', cx, previewY + 4);
      } else if (favorCount === 1) {
        ctx.fillStyle = '#cccc44';
        ctx.fillText('⚠️ 排阵一般，试试调整顺序？', cx, previewY + 4);
      } else {
        ctx.fillStyle = '#ff6644';
        ctx.fillText('❌ 这个排阵很不利！建议重新考虑', cx, previewY + 4);
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
    let ty = rect.y + 18;
    ctx.textAlign = 'center';

    // 名字
    ctx.fillStyle = '#e8e0d0';
    ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
    ctx.fillText(warrior.fullName, cx, ty);
    ty += 17;

    // 武器
    ctx.fillStyle = warrior.color || '#aaa';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${warrior.weapon.icon} ${warrior.weapon.name}`, cx, ty);
    ty += 15;

    // 难度星级
    const stars = '★'.repeat(warrior.difficulty) + '☆'.repeat(5 - warrior.difficulty);
    ctx.fillStyle = '#aaa';
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    ctx.fillText(stars, cx, ty);
    ty += 14;

    // 护甲
    ctx.fillStyle = '#777';
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${warrior.armor.icon} ${warrior.armor.name}`, cx, ty);
    ty += 14;

    // 武器属性条形图
    const ws = warrior.stats || WEAPON_STATS[warrior.weaponId];
    if (ws) {
      const barLabels = ['攻', '防', '速', '范'];
      const barValues = [ws.atk, ws.def, ws.spd, ws.rng];
      const barColors = ['#ff6644', '#4488ff', '#44cc44', '#ffcc44'];
      const barW = 24, barH = 3;
      const totalBarW = barLabels.length * (barW + 14 + 2);
      let bx = cx - totalBarW / 2;
      for (let i = 0; i < barLabels.length; i++) {
        ctx.fillStyle = '#555';
        ctx.font = '8px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(barLabels[i], bx + 11, ty + 2);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(bx + 13, ty - 2, barW, barH);
        ctx.fillStyle = barColors[i];
        ctx.fillRect(bx + 13, ty - 2, barW * (barValues[i] / 5), barH);
        bx += barW + 14 + 2;
      }
    }
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

    const won = hr.winner && hr.winner.team === 0;
    ctx.fillStyle = won ? '#44ff44' : '#ff4444';
    ctx.font = 'bold 24px "Microsoft YaHei", sans-serif';
    ctx.fillText(won ? '✅ 本场获胜！' : '❌ 本场落败', lw / 2, lh * 0.22);

    // 本场战斗详情
    const lastResult = hr.matchResults[hr.matchResults.length - 1];
    if (lastResult) {
      ctx.fillStyle = '#aaa';
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.fillText(`胜者剩余 ${lastResult.winnerHpPct}% 血量  战斗时长 ${lastResult.duration.toFixed(1)}s`, lw / 2, lh * 0.30);
      if (lastResult.upset) {
        ctx.fillStyle = '#ffcc44';
        ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
        ctx.fillText('⚡ 爆冷了！', lw / 2, lh * 0.35);
      }
    }

    // 解说
    if (hr.commentary && hr.commentFade > 0) {
      ctx.fillStyle = '#ffcc44';
      ctx.font = '14px "Microsoft YaHei", sans-serif';
      ctx.fillText(`📢 ${hr.commentary}`, lw / 2, lh * 0.40);
    }

    ctx.fillStyle = '#e8e0d0';
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.fillText(`当前比分: ${hr.stageScore[0]} - ${hr.stageScore[1]}`, lw / 2, lh * 0.50);

    ctx.fillStyle = '#888';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    const remain = hr.teamSize - hr.currentMatch - 1;
    ctx.fillText(remain > 0 ? `还有 ${remain} 场比赛` : '本关所有比赛已结束', lw / 2, lh * 0.58);

    ctx.fillStyle = '#666';
    ctx.fillText('点击继续', lw / 2, lh * 0.66);
  },

  _drawHRStageResult(ctx, lw, lh) {
    const hr = this.horseRacing;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, lw, lh);
    ctx.textAlign = 'center';

    const playerWon = hr.stageScore[0] > hr.stageScore[1];
    ctx.fillStyle = playerWon ? '#44ff44' : '#ff4444';
    ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
    ctx.fillText(playerWon ? '🏆 本关获胜！' : '💀 本关失败', lw / 2, lh * 0.18);

    ctx.fillStyle = '#e8e0d0';
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.fillText(`比分 ${hr.stageScore[0]} : ${hr.stageScore[1]}`, lw / 2, lh * 0.28);

    // 每场战绩回顾
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    let ry = lh * 0.35;
    for (let i = 0; i < hr.matchResults.length; i++) {
      const r = hr.matchResults[i];
      const icon = r.playerWon ? '✅' : '❌';
      const upsetTag = r.upset ? ' ⚡爆冷' : '';
      ctx.fillStyle = r.playerWon ? '#44cc44' : '#cc4444';
      ctx.fillText(`${icon} 第${i + 1}场: ${r.playerWarrior.fullName} vs ${r.aiWarrior.fullName} (胜率${r.winRate}%)${upsetTag}`, lw / 2, ry);
      ry += 16;
    }

    // 金币奖励
    if (playerWon && hr._lastGoldChange > 0) {
      ctx.fillStyle = '#ffcc44';
      ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
      let rewardText = `💰 获得 +${hr._lastGoldChange} 金`;
      if (hr._lastPerfect) rewardText += ' (完美通关双倍奖励！)';
      ctx.fillText(rewardText, lw / 2, ry + 10);
    }

    ctx.fillStyle = '#aaa';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillText(`总战绩 ${hr.wins}胜 ${hr.losses}负 (2负出局)  💰 ${hr.gold}`, lw / 2, lh * 0.72);

    ctx.fillStyle = '#666';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText('点击进入下一关', lw / 2, lh * 0.82);
  },

  _drawHRVictory(ctx, lw, lh) {
    const hr = this.horseRacing;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, lw, lh);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcc44';
    ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
    ctx.fillText('🐎 田忌赛马通关！', lw / 2, lh * 0.2);

    // 评级
    const perfects = hr.goldHistory.length > 1 ? hr.losses : 0;
    const grade = perfects === 0 ? 'S' : perfects === 1 ? 'A' : 'B';
    const gradeColor = grade === 'S' ? '#ffcc44' : grade === 'A' ? '#44ff44' : '#4488ff';
    ctx.fillStyle = gradeColor;
    ctx.font = 'bold 50px "Microsoft YaHei", sans-serif';
    ctx.fillText(grade, lw / 2, lh * 0.35);

    ctx.fillStyle = '#e8e0d0';
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.fillText(`最终战绩 ${hr.wins}胜 ${hr.losses}负`, lw / 2, lh * 0.45);
    ctx.fillText(`💰 最终金币: ${hr.gold}`, lw / 2, lh * 0.52);

    // 金币声势图
    if (hr.goldHistory.length > 1) {
      const gw = 200, gh = 40;
      const gx = lw / 2 - gw / 2;
      const gy = lh * 0.58;
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.strokeRect(gx, gy, gw, gh);
      const maxG = Math.max(...hr.goldHistory, 1);
      ctx.beginPath();
      ctx.strokeStyle = '#ffcc44';
      ctx.lineWidth = 2;
      for (let i = 0; i < hr.goldHistory.length; i++) {
        const px = gx + (i / (hr.goldHistory.length - 1)) * gw;
        const py = gy + gh - (hr.goldHistory[i] / maxG) * gh;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.fillStyle = '#888';
      ctx.font = '10px "Microsoft YaHei", sans-serif';
      ctx.fillText('金币走势', lw / 2, gy + gh + 14);
    }

    ctx.fillStyle = '#666';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText('点击返回菜单', lw / 2, lh * 0.82);
  },

  _drawHRDefeat(ctx, lw, lh) {
    const hr = this.horseRacing;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, lw, lh);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
    ctx.fillText('💀 两负出局', lw / 2, lh * 0.22);
    ctx.fillStyle = '#aaa';
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.fillText(`走到了第 ${hr.stage + 1} 关  ${hr.wins}胜${hr.losses}负`, lw / 2, lh * 0.35);
    ctx.fillStyle = '#ffcc44';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillText(`💰 最终金币: ${hr.gold}`, lw / 2, lh * 0.45);
    // 策略提示
    ctx.fillStyle = '#777';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillText('💡 田忌赛马的核心：用弱挡强，用强打弱，利用武器克制', lw / 2, lh * 0.55);
    ctx.fillStyle = '#666';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText('点击返回菜单', lw / 2, lh * 0.66);
  },
};
