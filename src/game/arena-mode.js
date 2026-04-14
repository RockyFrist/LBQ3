// ===================== 比武擂台 (Battle Arena) =====================
// 下注AI战斗、解说烘托气氛、单挑/混战/军团战
// 完整的押注系统、赔率计算、通关机制

import * as C from '../core/constants.js';
import { dist, angleBetween } from '../core/utils.js';
import { Fighter } from '../combat/fighter.js';
import { Enemy } from '../ai/enemy.js';
import { CombatSystem } from '../combat/combat-system.js';
import { getWeapon, WEAPON_LIST, randomWeapon } from '../weapons/weapon-defs.js';
import { getArmor, ARMOR_LIST } from '../weapons/armor-defs.js';
import { randomChineseName, randomTitledName, generateUniqueNames } from '../core/names.js';

// ===== 解说词库 =====
const COMMENTARY = {
  matchStart: [
    '两位选手走上擂台，气氛紧张！',
    '好戏开场，且看今日谁能笑到最后！',
    '擂鼓震天，英雄会！',
    '看客们屏住呼吸，大战一触即发！',
    '两虎相争，必有一伤！',
  ],
  firstBlood: [
    '首次见血！{attacker}率先发难！',
    '{attacker}抢得先机，{target}吃了一刀！',
    '好快的身手！{attacker}先声夺人！',
    '{target}大意了，被{attacker}偷袭得手！',
  ],
  parry: [
    '漂亮！{target}精妙格挡！',
    '好一个铁壁防御！{target}临危不乱！',
    '叮！兵器相交，火花四溅！',
    '{target}架住了！反击的机会来了！',
  ],
  heavyHit: [
    '重击命中！{target}被打得踉跄后退！',
    '一记重锤！{target}差点站不住脚！',
    '{attacker}使出浑身力气，一击制胜！',
    '这一下打得结实！{target}怕是受伤不轻！',
  ],
  lowHp: [
    '{fighter}已是强弩之末！',
    '{fighter}摇摇欲坠，还能撑多久？',
    '{fighter}鲜血淋漓，胜败就在须臾！',
    '形势危急！{fighter}命悬一线！',
  ],
  clash: [
    '拼刀！两人刀剑相碰！',
    '铛！兵器撞击声如雷鸣！',
    '势均力敌！两人互不相让！',
  ],
  execution: [
    '处决！{attacker}一招毙命！',
    '绝杀！{attacker}终结了{target}！',
    '{attacker}不留情面，处决成功！',
  ],
  victory: [
    '{winner}获胜！江湖又添一段传说！',
    '胜者为王！{winner}威震擂台！',
    '{winner}以精湛武艺赢得胜利！',
    '比赛结束！{winner}是今日擂台之王！',
  ],
  teamFightStart: [
    '两军对垒，杀声震天！',
    '军团大战开始！谁能笑到最后？',
    '双方列阵完毕，冲锋！',
  ],
  brawlStart: [
    '大混战开始！各路英雄捉对厮杀！',
    '乱战！拳脚交错，兵器横飞！',
    '混战模式！最后站着的才是赢家！',
  ],
  betWin: [
    '恭喜！押对了！赚得盆满钵满！',
    '好眼力！这一注赢了！',
    '神算子！看人真准！',
  ],
  betLose: [
    '遗憾！押错了，银子打了水漂！',
    '这次看走眼了，下次加油！',
    '输了赌注，但江湖路长！',
  ],
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function fillTemplate(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] || '???');
}

// ===== 赔率计算 =====
function calcOdds(fighterA, fighterB) {
  // 根据难度、武器、护甲差异计算赔率
  const scoreA = (fighterA.difficulty || 3) * 10 + (fighterA.hpMult || 1) * 5;
  const scoreB = (fighterB.difficulty || 3) * 10 + (fighterB.hpMult || 1) * 5;
  const total = scoreA + scoreB;
  const probA = scoreA / total;
  const probB = scoreB / total;
  // 庄家抽成 10%
  const margin = 0.90;
  return {
    oddsA: +(margin / probA).toFixed(2),
    oddsB: +(margin / probB).toFixed(2),
    probA: +probA.toFixed(2),
    probB: +probB.toFixed(2),
  };
}

// ===== 创建武者数据 =====
function createContestant(opts = {}) {
  const diff = opts.difficulty || (2 + Math.floor(Math.random() * 4));
  const weaponId = opts.weaponId || randomWeapon();
  const weapon = getWeapon(weaponId);
  const armorIds = ['none', 'none', 'none', 'light', 'light', 'medium', 'medium', 'heavy', 'plate'];
  const armorId = opts.armorId || armorIds[Math.floor(Math.random() * armorIds.length)];
  const named = opts.named || randomTitledName();
  return {
    name: named.name,
    title: named.title,
    fullName: named.fullName,
    difficulty: diff,
    weaponId,
    weapon,
    armorId,
    color: opts.color || weapon.color,
    hpMult: opts.hpMult || 1,
    scale: opts.scale || 1,
  };
}

// ===== 擂台模式状态 =====
export const ARENA_PHASES = ['betting', 'fighting', 'result', 'shop', 'gameover', 'victory'];

export class ArenaMode {
  constructor() {
    this.gold = 500;           // 初始金币
    this.round = 0;
    this.maxRounds = 15;       // 15轮通关
    this.phase = 'betting';    // 当前阶段
    this.matchType = 'duel';   // 'duel' | 'brawl' | 'teamfight'

    // 当前比赛
    this.contestants = [];     // 参赛选手
    this.teams = [[], []];     // 团战队伍
    this.betTarget = null;     // 下注目标
    this.betAmount = 50;       // 下注金额
    this.betType = 'win';      // 'win' | 'hp_high' | 'hp_low'
    this.odds = {};

    // 战斗实例
    this.fighters = [];        // Fighter 实例
    this.enemies = [];         // Enemy AI 实例
    this.combat = null;
    this.allFighters = [];
    this.gameTime = 0;

    // 解说
    this.commentary = [];      // 解说队列
    this.commentaryTimer = 0;
    this.currentComment = '';
    this.commentFade = 0;

    // 事件追踪
    this._firstBlood = false;
    this._lowHpWarned = new Set();
    this._lastEventTime = 0;

    // 战斗控制
    this.fightSpeed = 1;
    this.fightDone = false;
    this.winner = null;
    this.winnerTeam = -1;

    // 结果统计
    this.winnerHp = 0;
    this.roundHistory = [];

    // 通关倍率
    this.victoryGoldTarget = 5000;

    // 初始化第一轮
    this._setupRound();
  }

  _setupRound() {
    this.round++;
    this.phase = 'betting';
    this.fightDone = false;
    this.winner = null;
    this._firstBlood = false;
    this._lowHpWarned.clear();
    this.commentary = [];
    this.currentComment = '';
    this.gameTime = 0;

    // 随轮次逐渐提升难度和变化
    const baseMinDiff = Math.min(5, 1 + Math.floor(this.round / 4));
    const baseMaxDiff = Math.min(5, 2 + Math.floor(this.round / 3));

    // 决定比赛类型
    if (this.round <= 3) {
      this.matchType = 'duel';
    } else if (this.round % 5 === 0) {
      this.matchType = 'teamfight';
    } else if (this.round % 3 === 0) {
      this.matchType = 'brawl';
    } else {
      this.matchType = 'duel';
    }

    this.contestants = [];
    this.teams = [[], []];

    if (this.matchType === 'duel') {
      // 1v1 单挑
      const named = generateUniqueNames(2, true);
      const diffA = baseMinDiff + Math.floor(Math.random() * (baseMaxDiff - baseMinDiff + 1));
      const diffB = baseMinDiff + Math.floor(Math.random() * (baseMaxDiff - baseMinDiff + 1));
      this.contestants = [
        createContestant({ difficulty: diffA, named: named[0] }),
        createContestant({ difficulty: diffB, named: named[1] }),
      ];
      this.odds = calcOdds(this.contestants[0], this.contestants[1]);
    } else if (this.matchType === 'brawl') {
      // 大混战 (3~5人)
      const count = 3 + Math.floor(Math.random() * 3);
      const named = generateUniqueNames(count, true);
      for (let i = 0; i < count; i++) {
        const diff = baseMinDiff + Math.floor(Math.random() * (baseMaxDiff - baseMinDiff + 1));
        this.contestants.push(createContestant({ difficulty: diff, named: named[i] }));
      }
      // 混战赔率：基于各人综合实力
      this.odds = {};
      let totalScore = 0;
      for (const c of this.contestants) {
        const score = c.difficulty * 10 + 5;
        totalScore += score;
      }
      for (let i = 0; i < this.contestants.length; i++) {
        const score = this.contestants[i].difficulty * 10 + 5;
        const prob = score / totalScore;
        this.odds[i] = +(0.90 / prob).toFixed(2);
      }
    } else {
      // 团战 (2v2 or 3v3)
      const teamSize = this.round >= 10 ? 3 : 2;
      const named = generateUniqueNames(teamSize * 2, true);
      for (let t = 0; t < 2; t++) {
        for (let i = 0; i < teamSize; i++) {
          const diff = baseMinDiff + Math.floor(Math.random() * (baseMaxDiff - baseMinDiff + 1));
          const c = createContestant({ difficulty: diff, named: named[t * teamSize + i] });
          this.teams[t].push(c);
          this.contestants.push(c);
        }
      }
      // 团战赔率
      const scoreA = this.teams[0].reduce((a, c) => a + c.difficulty * 10, 0);
      const scoreB = this.teams[1].reduce((a, c) => a + c.difficulty * 10, 0);
      const total = scoreA + scoreB;
      this.odds = {
        oddsA: +(0.90 / (scoreA / total)).toFixed(2),
        oddsB: +(0.90 / (scoreB / total)).toFixed(2),
      };
    }

    this.betTarget = null;
    this.betAmount = Math.min(this.gold, 50);
  }

  // ===== 开始战斗 =====
  startFight(particles, camera) {
    this.phase = 'fighting';
    this.gameTime = 0;
    this.fighters = [];
    this.enemies = [];
    this.combat = new CombatSystem(particles, camera);
    this.combat.playerFighter = null; // 全部触发特效

    if (this.matchType === 'duel') {
      const [cA, cB] = this.contestants;
      const eA = new Enemy(C.ARENA_W / 2 - 80, C.ARENA_H / 2, cA.difficulty, {
        weaponId: cA.weaponId, color: cA.color, name: cA.fullName,
      });
      eA.fighter.armor = getArmor(cA.armorId);
      eA.fighter.team = 0;
      const eB = new Enemy(C.ARENA_W / 2 + 80, C.ARENA_H / 2, cB.difficulty, {
        weaponId: cB.weaponId, color: cB.color, name: cB.fullName,
      });
      eB.fighter.armor = getArmor(cB.armorId);
      eB.fighter.team = 1;
      eB.fighter.facing = Math.PI;
      this.enemies = [eA, eB];
      this.fighters = [eA.fighter, eB.fighter];
    } else if (this.matchType === 'brawl') {
      const count = this.contestants.length;
      for (let i = 0; i < count; i++) {
        const c = this.contestants[i];
        const angle = (i / count) * Math.PI * 2;
        const r = 100 + count * 15;
        const x = C.ARENA_W / 2 + Math.cos(angle) * r;
        const y = C.ARENA_H / 2 + Math.sin(angle) * r;
        const e = new Enemy(x, y, c.difficulty, {
          weaponId: c.weaponId, color: c.color, name: c.fullName,
        });
        e.fighter.armor = getArmor(c.armorId);
        e.fighter.team = i; // 每人一队（混战）
        e.fighter.facing = angle + Math.PI;
        this.enemies.push(e);
        this.fighters.push(e.fighter);
      }
    } else {
      // 团战
      for (let t = 0; t < 2; t++) {
        for (let i = 0; i < this.teams[t].length; i++) {
          const c = this.teams[t][i];
          const side = t === 0 ? -1 : 1;
          const x = C.ARENA_W / 2 + side * (60 + i * 50);
          const y = C.ARENA_H / 2 + (i - 1) * 60;
          const e = new Enemy(x, y, c.difficulty, {
            weaponId: c.weaponId, color: c.color, name: c.fullName,
          });
          e.fighter.armor = getArmor(c.armorId);
          e.fighter.team = t;
          e.fighter.facing = t === 0 ? 0 : Math.PI;
          this.enemies.push(e);
          this.fighters.push(e.fighter);
        }
      }
    }

    this.allFighters = this.fighters;
    // 擂台模式显示名字标签
    for (const f of this.fighters) f.showNameTag = true;
    this._addComment(pick(
      this.matchType === 'teamfight' ? COMMENTARY.teamFightStart :
      this.matchType === 'brawl' ? COMMENTARY.brawlStart :
      COMMENTARY.matchStart
    ));
  }

  // ===== 战斗tick =====
  tickFight(dt, particles) {
    if (this.fightDone) return;
    this.gameTime += dt;
    this.commentaryTimer -= dt;

    // AI决策 + fighter更新
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.fighter.alive) continue;
      // 找最近的敌方目标
      let target = null, minD = Infinity;
      for (const other of this.fighters) {
        if (other === e.fighter || other.team === e.fighter.team || !other.alive) continue;
        const d = dist(e.fighter, other);
        if (d < minD) { minD = d; target = other; }
      }
      if (!target) continue;
      // 临时创建一个"假玩家"代理让enemy AI决策
      const cmd = e.getCommands(dt, target);
      e.fighter.update(dt, cmd, this.gameTime);
    }

    // 角色分离
    for (let i = 0; i < this.fighters.length; i++) {
      for (let j = i + 1; j < this.fighters.length; j++) {
        const a = this.fighters[i], b = this.fighters[j];
        if (!a.alive || !b.alive) continue;
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
    }

    // 强制留在竞技场内
    for (const f of this.fighters) {
      f.x = Math.max(f.radius, Math.min(C.ARENA_W - f.radius, f.x));
      f.y = Math.max(f.radius, Math.min(C.ARENA_H - f.radius, f.y));
    }

    // 战斗解算
    this.combat.resolve(this.allFighters, this.gameTime, dt);

    // 解说事件
    for (const evt of this.combat.events) {
      this._handleCombatEvent(evt);
    }

    // 低血量提醒
    for (const f of this.fighters) {
      if (f.alive && f.hp / f.maxHp < 0.25 && !this._lowHpWarned.has(f)) {
        this._lowHpWarned.add(f);
        this._addComment(fillTemplate(pick(COMMENTARY.lowHp), { fighter: f.name }));
      }
    }

    // 检测胜负
    this._checkFightEnd();
  }

  _handleCombatEvent(evt) {
    if (this.gameTime - this._lastEventTime < 0.8) return; // 防精解说刷屏
    this._lastEventTime = this.gameTime;

    if (evt.type === 'hit' && !this._firstBlood) {
      this._firstBlood = true;
      this._addComment(fillTemplate(pick(COMMENTARY.firstBlood), {
        attacker: evt.attacker.name, target: evt.target.name,
      }));
    } else if (evt.type === 'hit' && evt.atkType === 'heavy') {
      if (Math.random() < 0.4) {
        this._addComment(fillTemplate(pick(COMMENTARY.heavyHit), {
          attacker: evt.attacker.name, target: evt.target.name,
        }));
      }
    } else if (evt.type === 'parry' && evt.level === 'precise') {
      if (Math.random() < 0.5) {
        this._addComment(fillTemplate(pick(COMMENTARY.parry), { target: evt.target.name }));
      }
    } else if (evt.type === 'lightClash' || evt.type === 'heavyClash') {
      if (Math.random() < 0.3) {
        this._addComment(pick(COMMENTARY.clash));
      }
    } else if (evt.type === 'execution') {
      this._addComment(fillTemplate(pick(COMMENTARY.execution), {
        attacker: evt.attacker.name, target: evt.target.name,
      }));
    }
  }

  _checkFightEnd() {
    const alive = this.fighters.filter(f => f.alive);
    if (alive.length <= 0) {
      this._endFight(null);
      return;
    }

    if (this.matchType === 'duel') {
      if (alive.length === 1) this._endFight(alive[0]);
      if (this.gameTime > 60) {
        // 超时：血量高者胜
        const sorted = [...this.fighters].sort((a, b) => b.hp - a.hp);
        this._endFight(sorted[0]);
      }
    } else if (this.matchType === 'brawl') {
      if (alive.length === 1) this._endFight(alive[0]);
      if (this.gameTime > 90) {
        const sorted = [...alive].sort((a, b) => b.hp - a.hp);
        this._endFight(sorted[0]);
      }
    } else {
      // 团战：一方全灭
      const team0Alive = alive.filter(f => f.team === 0).length;
      const team1Alive = alive.filter(f => f.team === 1).length;
      if (team0Alive === 0 && team1Alive === 0) {
        this._endFight(null);
      } else if (team0Alive === 0) {
        this.winnerTeam = 1;
        this._endFight(alive.find(f => f.team === 1));
      } else if (team1Alive === 0) {
        this.winnerTeam = 0;
        this._endFight(alive.find(f => f.team === 0));
      }
      if (this.gameTime > 90) {
        const hp0 = alive.filter(f => f.team === 0).reduce((a, f) => a + f.hp, 0);
        const hp1 = alive.filter(f => f.team === 1).reduce((a, f) => a + f.hp, 0);
        this.winnerTeam = hp0 >= hp1 ? 0 : 1;
        this._endFight(alive.find(f => f.team === this.winnerTeam));
      }
    }
  }

  _endFight(winnerFighter) {
    this.fightDone = true;
    this.winner = winnerFighter;
    this.winnerHp = winnerFighter ? winnerFighter.hp : 0;

    const winnerName = winnerFighter ? winnerFighter.name : '无人';
    this._addComment(fillTemplate(pick(COMMENTARY.victory), { winner: winnerName }));

    // 结算下注
    this._settleBet();
    this.phase = 'result';

    // 记录历史
    this.roundHistory.push({
      round: this.round,
      matchType: this.matchType,
      winner: winnerName,
      betWon: this._lastBetWon,
      goldChange: this._lastGoldChange,
      goldAfter: this.gold,
    });
  }

  _settleBet() {
    if (!this.betTarget && this.betTarget !== 0) {
      this._lastBetWon = false;
      this._lastGoldChange = 0;
      return;
    }

    let won = false;
    if (this.matchType === 'duel') {
      if (this.betType === 'win') {
        won = this.winner === this.fighters[this.betTarget];
      } else if (this.betType === 'hp_high') {
        won = this.winner && this.winnerHp > this.winner.maxHp * 0.5;
      } else if (this.betType === 'hp_low') {
        won = this.winner && this.winnerHp <= this.winner.maxHp * 0.3;
      }
    } else if (this.matchType === 'brawl') {
      won = this.winner === this.fighters[this.betTarget];
    } else {
      won = this.winnerTeam === this.betTarget;
    }

    if (won) {
      let multiplier;
      if (this.matchType === 'duel') {
        multiplier = this.betTarget === 0 ? this.odds.oddsA : this.odds.oddsB;
        if (this.betType === 'hp_high') multiplier *= 1.5;
        if (this.betType === 'hp_low') multiplier *= 2.5;
      } else if (this.matchType === 'brawl') {
        multiplier = this.odds[this.betTarget] || 2;
      } else {
        multiplier = this.betTarget === 0 ? this.odds.oddsA : this.odds.oddsB;
      }
      const winnings = Math.floor(this.betAmount * multiplier);
      this.gold += winnings;
      this._lastBetWon = true;
      this._lastGoldChange = winnings;
      this._addComment(pick(COMMENTARY.betWin));
    } else {
      this.gold -= this.betAmount;
      this._lastBetWon = false;
      this._lastGoldChange = -this.betAmount;
      this._addComment(pick(COMMENTARY.betLose));
    }
  }

  // ===== 下一轮 =====
  nextRound() {
    if (this.gold <= 0) {
      this.phase = 'gameover';
      return;
    }
    if (this.round >= this.maxRounds) {
      this.phase = this.gold >= this.victoryGoldTarget ? 'victory' : 'gameover';
      return;
    }
    this._setupRound();
  }

  // ===== 解说系统 =====
  _addComment(text) {
    this.commentary.push(text);
    if (this.commentary.length > 8) this.commentary.shift();
    this.currentComment = text;
    this.commentFade = 3.0; // 3秒显示
  }

  updateCommentary(dt) {
    if (this.commentFade > 0) this.commentFade -= dt;
  }

  // ===== 工具 =====
  getContestantInfo(idx) {
    const c = this.contestants[idx];
    if (!c) return null;
    const diffNames = ['新手', '普通', '熟练', '困难', '大师'];
    const armorObj = getArmor(c.armorId);
    return {
      ...c,
      diffName: diffNames[c.difficulty - 1] || `D${c.difficulty}`,
      armorName: armorObj.name,
      weaponName: c.weapon.name,
      weaponIcon: c.weapon.icon,
      armorIcon: armorObj.icon,
    };
  }
}

// ===================== Game mixin methods =====================
// Object.assign(Game.prototype, arenaModeMethods) 混入

const DIFF_NAMES = ['新手', '普通', '熟练', '困难', '大师'];
const TYPE_NAMES = { duel: '🤺 单挑', brawl: '⚔ 大混战', teamfight: '🏴 军团战' };

export const arenaModeMethods = {
  _setupArenaMode() {
    this.arena = new ArenaMode();
    this._arenaClickCd = 0;
  },

  _updateArena(dt) {
    const a = this.arena;
    const input = this.input;
    this._arenaClickCd -= dt;

    // ESC 返回菜单
    if (input.pressed('Escape') && this.onExit) {
      this.onExit();
      return;
    }

    a.updateCommentary(dt);

    if (a.phase === 'betting') {
      this._updateArenaBetting(dt);
    } else if (a.phase === 'fighting') {
      a.tickFight(dt, this.particles);
      this.particles.update(dt);
      this.camera.update(dt);
    } else if (a.phase === 'result') {
      this._updateArenaResult(dt);
    } else if (a.phase === 'gameover' || a.phase === 'victory') {
      if ((input.pressed('Space') || input.mouseLeftDown) && this._arenaClickCd <= 0) {
        if (this.onExit) this.onExit();
      }
    }
  },

  _updateArenaBetting(dt) {
    const a = this.arena;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    if (!this.input.mouseLeftDown || this._arenaClickCd > 0) return;

    const L = this._layoutArenaBetting();

    // 选择下注目标
    for (let i = 0; i < L.contestantBtns.length; i++) {
      const b = L.contestantBtns[i];
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        a.betTarget = i;
        this._arenaClickCd = 0.15;
        return;
      }
    }

    // 下注金额 +/-
    if (L.betMinus && mx >= L.betMinus.x && mx <= L.betMinus.x + L.betMinus.w &&
        my >= L.betMinus.y && my <= L.betMinus.y + L.betMinus.h) {
      a.betAmount = Math.max(10, a.betAmount - 50);
      this._arenaClickCd = 0.12;
      return;
    }
    if (L.betPlus && mx >= L.betPlus.x && mx <= L.betPlus.x + L.betPlus.w &&
        my >= L.betPlus.y && my <= L.betPlus.y + L.betPlus.h) {
      a.betAmount = Math.min(a.gold, a.betAmount + 50);
      this._arenaClickCd = 0.12;
      return;
    }

    // 下注类型切换（仅单挑）
    if (a.matchType === 'duel' && L.betTypeBtns) {
      for (const bt of L.betTypeBtns) {
        if (mx >= bt.x && mx <= bt.x + bt.w && my >= bt.y && my <= bt.y + bt.h) {
          a.betType = bt.id;
          this._arenaClickCd = 0.15;
          return;
        }
      }
    }

    // 开战按钮
    if (L.fightBtn && mx >= L.fightBtn.x && mx <= L.fightBtn.x + L.fightBtn.w &&
        my >= L.fightBtn.y && my <= L.fightBtn.y + L.fightBtn.h) {
      if (a.betTarget !== null && a.betTarget !== undefined) {
        a.startFight(this.particles, this.camera);
        this._arenaClickCd = 0.3;
      }
      return;
    }
  },

  _updateArenaResult(dt) {
    const a = this.arena;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    if (!this.input.mouseLeftDown || this._arenaClickCd > 0) return;

    const L = this._layoutArenaResult();
    if (mx >= L.nextBtn.x && mx <= L.nextBtn.x + L.nextBtn.w &&
        my >= L.nextBtn.y && my <= L.nextBtn.y + L.nextBtn.h) {
      a.nextRound();
      this._arenaClickCd = 0.3;
    }
  },

  // ===== 布局 =====
  _layoutArenaBetting() {
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const cx = cw / 2;
    const a = this.arena;

    const result = { contestantBtns: [] };

    if (a.matchType === 'duel') {
      // 两个选手卡牌
      const cardW = 200, cardH = 140;
      const gap = 60;
      result.contestantBtns = [
        { x: cx - cardW - gap / 2, y: ch * 0.22, w: cardW, h: cardH, idx: 0 },
        { x: cx + gap / 2, y: ch * 0.22, w: cardW, h: cardH, idx: 1 },
      ];
    } else if (a.matchType === 'brawl') {
      const cardW = 120, cardH = 100;
      const count = a.contestants.length;
      const totalW = count * cardW + (count - 1) * 10;
      let sx = cx - totalW / 2;
      for (let i = 0; i < count; i++) {
        result.contestantBtns.push({ x: sx + i * (cardW + 10), y: ch * 0.22, w: cardW, h: cardH, idx: i });
      }
    } else {
      // 团战：两队
      const cardW = 200, cardH = 100;
      result.contestantBtns = [
        { x: cx - cardW - 40, y: ch * 0.22, w: cardW, h: cardH, idx: 0 },
        { x: cx + 40, y: ch * 0.22, w: cardW, h: cardH, idx: 1 },
      ];
    }

    // 下注金额按钮
    const betY = ch * 0.62;
    result.betMinus = { x: cx - 120, y: betY, w: 40, h: 30 };
    result.betPlus = { x: cx + 80, y: betY, w: 40, h: 30 };

    // 下注类型（仅单挑）
    if (a.matchType === 'duel') {
      const types = [
        { id: 'win', label: '胜负' },
        { id: 'hp_high', label: '完胜(>50%HP)' },
        { id: 'hp_low', label: '险胜(<30%HP)' },
      ];
      result.betTypeBtns = types.map((t, i) => ({
        x: cx - 150 + i * 110, y: betY + 40, w: 100, h: 28, id: t.id, label: t.label,
      }));
    }

    // 开战按钮
    result.fightBtn = { x: cx - 70, y: ch * 0.82, w: 140, h: 42 };

    return result;
  },

  _layoutArenaResult() {
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const cx = cw / 2;
    return {
      nextBtn: { x: cx - 70, y: ch * 0.78, w: 140, h: 42 },
    };
  },

  // ===== 绘制 =====
  _renderArena() {
    const dpr = this.canvas._dpr || 1;
    const lw = this.canvas._logicW || this.canvas.width;
    const lh = this.canvas._logicH || this.canvas.height;
    const ctx = this.renderer.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const a = this.arena;

    if (a.phase === 'fighting') {
      // 战斗阶段：正常渲染竞技场
      this.renderer.clear(lw, lh);
      ctx.save();
      this.camera.applyWorldTransform(ctx);
      this.renderer.drawGrid();
      for (const e of a.enemies) {
        this.renderer.drawFighter(e.fighter);
      }
      this.renderer.drawParticles(this.particles);
      ctx.restore();

      // HUD：双方血条
      this._drawArenaFightHUD(ctx, lw, lh);
    } else {
      // 非战斗阶段：绘制UI
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, lw, lh);
    }

    // 顶部信息栏
    this._drawArenaTopBar(ctx, lw);

    if (a.phase === 'betting') {
      this._drawArenaBetting(ctx, lw, lh);
    } else if (a.phase === 'result') {
      this._drawArenaResult(ctx, lw, lh);
    } else if (a.phase === 'gameover') {
      this._drawArenaGameover(ctx, lw, lh);
    } else if (a.phase === 'victory') {
      this._drawArenaVictory(ctx, lw, lh);
    }

    // 解说文字（所有阶段底部）
    this._drawArenaCommentary(ctx, lw, lh);
  },

  _drawArenaTopBar(ctx, lw) {
    const a = this.arena;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, lw, 36);
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffcc44';
    ctx.fillText(`💰 ${a.gold}`, 12, 24);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8e0d0';
    ctx.fillText(`第 ${a.round}/${a.maxRounds} 轮  ${TYPE_NAMES[a.matchType] || ''}`, lw / 2, 24);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#888';
    ctx.fillText('ESC 退出', lw - 12, 24);
  },

  _drawArenaBetting(ctx, lw, lh) {
    const a = this.arena;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const L = this._layoutArenaBetting();
    const cx = lw / 2;

    // 标题
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8e0d0';
    ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
    ctx.fillText('⚔ 下注时间 ⚔', cx, lh * 0.12);

    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText('选择你看好的武者，押下赌注！', cx, lh * 0.16);

    // 绘制选手卡牌
    if (a.matchType === 'duel') {
      this._drawContestantCard(ctx, L.contestantBtns[0], a.contestants[0], 0, a.betTarget === 0, mx, my);
      // VS 标记
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
      ctx.fillText('VS', cx, lh * 0.30);
      // 赔率
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#aaa';
      ctx.fillText(`赔率 ${a.odds.oddsA}x`, L.contestantBtns[0].x + L.contestantBtns[0].w / 2, L.contestantBtns[0].y + L.contestantBtns[0].h + 16);
      ctx.fillText(`赔率 ${a.odds.oddsB}x`, L.contestantBtns[1].x + L.contestantBtns[1].w / 2, L.contestantBtns[1].y + L.contestantBtns[1].h + 16);
      this._drawContestantCard(ctx, L.contestantBtns[1], a.contestants[1], 1, a.betTarget === 1, mx, my);
    } else if (a.matchType === 'brawl') {
      for (let i = 0; i < a.contestants.length; i++) {
        this._drawContestantCard(ctx, L.contestantBtns[i], a.contestants[i], i, a.betTarget === i, mx, my);
        ctx.font = '11px "Microsoft YaHei", sans-serif';
        ctx.fillStyle = '#aaa';
        ctx.textAlign = 'center';
        ctx.fillText(`${a.odds[i]}x`, L.contestantBtns[i].x + L.contestantBtns[i].w / 2, L.contestantBtns[i].y + L.contestantBtns[i].h + 14);
      }
    } else {
      // 团战
      this._drawTeamCard(ctx, L.contestantBtns[0], a.teams[0], '左队', 0, a.betTarget === 0, mx, my);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
      ctx.fillText('VS', cx, lh * 0.28);
      this._drawTeamCard(ctx, L.contestantBtns[1], a.teams[1], '右队', 1, a.betTarget === 1, mx, my);
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#aaa';
      ctx.textAlign = 'center';
      ctx.fillText(`赔率 ${a.odds.oddsA}x`, L.contestantBtns[0].x + L.contestantBtns[0].w / 2, L.contestantBtns[0].y + L.contestantBtns[0].h + 16);
      ctx.fillText(`赔率 ${a.odds.oddsB}x`, L.contestantBtns[1].x + L.contestantBtns[1].w / 2, L.contestantBtns[1].y + L.contestantBtns[1].h + 16);
    }

    // 下注金额
    ctx.textAlign = 'center';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#e8e0d0';
    const betY = L.betMinus.y;
    ctx.fillText(`下注: ${a.betAmount} 金`, cx, betY + 20);

    // -/+ 按钮
    this._drawSmallBtn(ctx, L.betMinus, '-50', mx, my);
    this._drawSmallBtn(ctx, L.betPlus, '+50', mx, my);

    // 下注类型（单挑）
    if (L.betTypeBtns) {
      for (const bt of L.betTypeBtns) {
        const sel = a.betType === bt.id;
        ctx.fillStyle = sel ? 'rgba(255,204,68,0.25)' : 'rgba(255,255,255,0.05)';
        ctx.fillRect(bt.x, bt.y, bt.w, bt.h);
        ctx.strokeStyle = sel ? '#ffcc44' : '#555';
        ctx.strokeRect(bt.x, bt.y, bt.w, bt.h);
        ctx.fillStyle = sel ? '#ffcc44' : '#aaa';
        ctx.font = '12px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(bt.label, bt.x + bt.w / 2, bt.y + bt.h / 2 + 4);
      }
    }

    // 开战按钮
    const fb = L.fightBtn;
    const canFight = a.betTarget !== null && a.betTarget !== undefined;
    const fbHover = canFight && mx >= fb.x && mx <= fb.x + fb.w && my >= fb.y && my <= fb.y + fb.h;
    ctx.fillStyle = canFight ? (fbHover ? '#ff5544' : '#cc3322') : '#444';
    ctx.fillRect(fb.x, fb.y, fb.w, fb.h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚔ 开战！', fb.x + fb.w / 2, fb.y + fb.h / 2 + 6);
  },

  _drawContestantCard(ctx, rect, contestant, idx, selected, mx, my) {
    const hover = mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h;
    ctx.fillStyle = selected ? 'rgba(255,204,68,0.15)' : (hover ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)');
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = selected ? '#ffcc44' : (hover ? '#666' : '#333');
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    const cx = rect.x + rect.w / 2;
    let ty = rect.y + 20;
    ctx.textAlign = 'center';

    // 名字
    ctx.fillStyle = '#e8e0d0';
    ctx.font = 'bold 15px "Microsoft YaHei", sans-serif';
    ctx.fillText(contestant.fullName, cx, ty);
    ty += 22;

    // 武器 + 护甲
    const info = this.arena.getContestantInfo(idx);
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = contestant.color || '#aaa';
    ctx.fillText(`${info.weaponIcon} ${info.weaponName}  ${info.armorIcon} ${info.armorName}`, cx, ty);
    ty += 20;

    // 难度
    ctx.fillStyle = '#aaa';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    const stars = '★'.repeat(contestant.difficulty) + '☆'.repeat(5 - contestant.difficulty);
    ctx.fillText(`实力: ${stars}`, cx, ty);
    ty += 18;

    // 难度名称
    ctx.fillStyle = '#777';
    ctx.fillText(DIFF_NAMES[contestant.difficulty - 1] || `D${contestant.difficulty}`, cx, ty);
  },

  _drawTeamCard(ctx, rect, team, label, idx, selected, mx, my) {
    const hover = mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h;
    ctx.fillStyle = selected ? 'rgba(255,204,68,0.15)' : (hover ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)');
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = selected ? '#ffcc44' : '#333';
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    const cx = rect.x + rect.w / 2;
    let ty = rect.y + 18;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcc44';
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
    ctx.fillText(label, cx, ty);
    ty += 20;

    for (const c of team) {
      const weapon = getWeapon(c.weaponId);
      ctx.fillStyle = c.color || '#aaa';
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.fillText(`${c.fullName} ${weapon.icon} ${'★'.repeat(c.difficulty)}`, cx, ty);
      ty += 16;
    }
  },

  _drawSmallBtn(ctx, rect, text, mx, my) {
    const hover = mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h;
    ctx.fillStyle = hover ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = '#555';
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = '#ccc';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2 + 4);
  },

  _drawArenaFightHUD(ctx, lw, lh) {
    const a = this.arena;
    // 各选手血条
    const barH = 8;
    const barW = 140;
    const startY = 44;
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    for (let i = 0; i < a.fighters.length; i++) {
      const f = a.fighters[i];
      const bx = (i % 2 === 0) ? 10 : lw - barW - 10;
      const by = startY + Math.floor(i / 2) * 24;
      // 名字
      ctx.textAlign = i % 2 === 0 ? 'left' : 'right';
      ctx.fillStyle = f.alive ? (f.color || '#ccc') : '#555';
      ctx.fillText(f.name, i % 2 === 0 ? bx : bx + barW, by - 2);
      // 血条背景
      ctx.fillStyle = 'rgba(255,0,0,0.2)';
      ctx.fillRect(bx, by + 2, barW, barH);
      // 血条
      if (f.alive) {
        const ratio = Math.max(0, f.hp / f.maxHp);
        ctx.fillStyle = ratio > 0.5 ? '#44cc44' : (ratio > 0.25 ? '#cccc44' : '#cc4444');
        ctx.fillRect(bx, by + 2, barW * ratio, barH);
      }
    }
  },

  _drawArenaResult(ctx, lw, lh) {
    const a = this.arena;
    const cx = lw / 2;

    // 半透明遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, lw, lh);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8e0d0';
    ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
    const winnerName = a.winner ? a.winner.name : '平局';
    ctx.fillText(`🏆 ${winnerName} 获胜！`, cx, lh * 0.2);

    // 下注结果
    const betColor = a._lastBetWon ? '#44ff44' : '#ff4444';
    const betText = a._lastBetWon
      ? `✅ 押中！获得 +${a._lastGoldChange} 金`
      : `❌ 押错！失去 ${Math.abs(a._lastGoldChange)} 金`;
    ctx.fillStyle = betColor;
    ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
    ctx.fillText(betText, cx, lh * 0.32);

    // 当前金币
    ctx.fillStyle = '#ffcc44';
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.fillText(`💰 当前金币: ${a.gold}`, cx, lh * 0.42);

    // 战况回顾
    if (a.winner) {
      ctx.fillStyle = '#888';
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      const hpPct = Math.round(a.winnerHp / a.winner.maxHp * 100);
      ctx.fillText(`胜者剩余 ${hpPct}% 血量  战斗时长 ${a.gameTime.toFixed(1)}s`, cx, lh * 0.5);
    }

    // 下一轮按钮
    const L = this._layoutArenaResult();
    const nb = L.nextBtn;
    const mx = this.input.mouseX, my = this.input.mouseY;
    const hover = mx >= nb.x && mx <= nb.x + nb.w && my >= nb.y && my <= nb.y + nb.h;
    ctx.fillStyle = hover ? '#4488ff' : '#336699';
    ctx.fillRect(nb.x, nb.y, nb.w, nb.h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.fillText(a.round >= a.maxRounds ? '查看结果' : '下一轮 →', nb.x + nb.w / 2, nb.y + nb.h / 2 + 5);
  },

  _drawArenaGameover(ctx, lw, lh) {
    const a = this.arena;
    const cx = lw / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, lw, lh);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
    ctx.fillText('💀 破产！', cx, lh * 0.3);
    ctx.fillStyle = '#aaa';
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.fillText(`坚持了 ${a.round} 轮`, cx, lh * 0.42);
    ctx.fillStyle = '#666';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText('点击任意位置返回菜单', cx, lh * 0.55);
  },

  _drawArenaVictory(ctx, lw, lh) {
    const a = this.arena;
    const cx = lw / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, lw, lh);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcc44';
    ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
    ctx.fillText('🏆 擂台通关！', cx, lh * 0.25);
    ctx.fillStyle = '#e8e0d0';
    ctx.font = '18px "Microsoft YaHei", sans-serif';
    ctx.fillText(`最终金币: ${a.gold}`, cx, lh * 0.38);
    // 战绩
    const wins = a.roundHistory.filter(r => r.betWon).length;
    ctx.fillStyle = '#aaa';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${a.maxRounds}轮 押中${wins}次 胜率${Math.round(wins / a.maxRounds * 100)}%`, cx, lh * 0.48);
    ctx.fillStyle = '#666';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText('点击任意位置返回菜单', cx, lh * 0.6);
  },

  _drawArenaCommentary(ctx, lw, lh) {
    const a = this.arena;
    if (!a.currentComment || a.commentFade <= 0) return;
    const alpha = Math.min(1, a.commentFade);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, lh - 38, lw, 38);
    ctx.fillStyle = '#ffcc44';
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`📢 ${a.currentComment}`, lw / 2, lh - 14);
    ctx.restore();
  },
};
