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
  // === 增强解说词库 ===
  combo: [
    '{attacker}连续攻击！气势如虹！',
    '{attacker}连击不断！对手毫无还手之力！',
    '恐怖的连击！{attacker}打出了节奏！',
    '{attacker}如疾风骤雨般进攻！',
    '一波接一波！{attacker}攻势凌厉！',
  ],
  comeback: [
    '{fighter}绝地反击！逆转了局势！',
    '不可思议！{fighter}触底反弹了！',
    '逆风翻盘！{fighter}上演绝地求生！',
    '{fighter}越战越勇，开始反攻了！',
    '奇迹发生了！{fighter}从死亡边缘杀了回来！',
  ],
  domination: [
    '{attacker}完全压制了{target}！',
    '一边倒的局面！{target}毫无招架之力！',
    '{attacker}如入无人之境！',
    '碾压！{target}自始至终没有机会！',
  ],
  dodge: [
    '好险！{fighter}千钧一发闪过去了！',
    '身法了得！{fighter}轻松闪避！',
    '{fighter}鬼魅般的步法，滴水不沾！',
    '闪！{fighter}反应极快！',
  ],
  counter: [
    '漂亮的反击！{attacker}后发先至！',
    '{attacker}抓住破绽，致命反击！',
    '以守为攻！{attacker}完美反击！',
    '精准反击！{attacker}化被动为主动！',
  ],
  stalemate: [
    '双方旗鼓相当，难分高下！',
    '激烈的拉锯战！谁先撑不住？',
    '棋逢对手，将遇良才！',
    '互不相让！这场比赛精彩绝伦！',
  ],
  milestone: [
    '恭喜！金币突破{amount}大关！',
    '财源广进！已达成{amount}金里程碑！',
    '赌神降临！{amount}金不在话下！',
  ],
  allIn: [
    '豪赌！全部身家压上了！',
    '梭哈！一把定乾坤！',
    '孤注一掷！成败在此一举！',
  ],
  streakWin: [
    '连续{count}次押中！判断力惊人！',
    '{count}连赢！简直是赌神再世！',
    '眼光独到！已经连赢{count}场！',
  ],
  weaponClash: [
    '{weaponA}对{weaponB}！这可有看头了！',
    '经典对决！{weaponA}vs{weaponB}！',
    '{weaponA}与{weaponB}的宿命对决！',
  ],
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function fillTemplate(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] || '???');
}

// ===== 武器属性速查（卡牌展示+赔率计算）=====
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

// ===== 护甲评分 =====
const ARMOR_SCORE = { none: 0, light: 2, medium: 5, heavy: 8, plate: 12 };

// ===== 获取武器克制提示 =====
function getMatchupHint(weaponIdA, weaponIdB) {
  const mu = WEAPON_MATCHUPS[weaponIdA];
  if (!mu) return '未知';
  if (mu.advantage.includes(weaponIdB)) return '克制';
  if (mu.disadvantage.includes(weaponIdB)) return '被克';
  return '均势';
}

// ===== 赔率计算 =====
function calcOdds(fighterA, fighterB) {
  // 综合考虑难度、武器、护甲和克制关系
  let scoreA = (fighterA.difficulty || 3) * 12;
  let scoreB = (fighterB.difficulty || 3) * 12;
  // 护甲加成
  scoreA += ARMOR_SCORE[fighterA.armorId] || 0;
  scoreB += ARMOR_SCORE[fighterB.armorId] || 0;
  // 武器克制加成
  const muA = WEAPON_MATCHUPS[fighterA.weaponId];
  const muB = WEAPON_MATCHUPS[fighterB.weaponId];
  if (muA && muA.advantage.includes(fighterB.weaponId)) scoreA += 5;
  if (muA && muA.disadvantage.includes(fighterB.weaponId)) scoreA -= 3;
  if (muB && muB.advantage.includes(fighterA.weaponId)) scoreB += 5;
  if (muB && muB.disadvantage.includes(fighterA.weaponId)) scoreB -= 3;
  scoreA = Math.max(5, scoreA);
  scoreB = Math.max(5, scoreB);
  const total = scoreA + scoreB;
  const probA = scoreA / total;
  const probB = scoreB / total;
  const margin = 0.90;
  return {
    oddsA: +(margin / probA).toFixed(2),
    oddsB: +(margin / probB).toFixed(2),
    probA: +probA.toFixed(2),
    probB: +probB.toFixed(2),
    matchup: getMatchupHint(fighterA.weaponId, fighterB.weaponId),
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

    // 连胜/连败追踪
    this.streak = 0;            // 正=连赢, 负=连输
    this.maxStreak = 0;         // 历史最高连赢
    this.peakGold = 500;        // 历史最高金币
    this.totalBetWins = 0;
    this.totalBetLosses = 0;

    // 里程碑系统
    this.milestones = [1000, 2000, 3000, 5000];
    this.milestonesReached = [];
    this.lastMilestoneMsg = '';

    // 评级系统目标
    this.ratings = [
      { grade: 'S', gold: 8000, label: '赌圣', color: '#ffcc44' },
      { grade: 'A', gold: 5000, label: '赌侠', color: '#44ff44' },
      { grade: 'B', gold: 3000, label: '赌徒', color: '#4488ff' },
      { grade: 'C', gold: 1000, label: '赌棍', color: '#aaaaaa' },
      { grade: 'D', gold: 0,    label: '赌狗', color: '#ff4444' },
    ];

    // 战斗统计追踪
    this._comboCount = {};       // 每个fighter的连击计数
    this._lastAttacker = null;   // 上次攻击者
    this._hitCount = {};         // 每个fighter的命中次数
    this._stalemateCalled = false;

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

    // 随轮次逐渐提升难度和变化（最低3级起步）
    const baseMinDiff = Math.min(5, Math.max(3, 1 + Math.floor(this.round / 4)));
    const baseMaxDiff = Math.min(5, Math.max(3, 2 + Math.floor(this.round / 3)));

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
    // 重置战斗统计
    this._comboCount = {};
    this._hitCount = {};
    this._lastAttacker = null;
    this._stalemateCalled = false;
    // 武器对决解说
    if (this.matchType === 'duel') {
      const wA = this.contestants[0].weapon;
      const wB = this.contestants[1].weapon;
      if (wA.id !== wB.id) {
        this._addComment(fillTemplate(pick(COMMENTARY.weaponClash), {
          weaponA: wA.name, weaponB: wB.name,
        }));
      }
    }
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

    // 胶着解说 (双方血量接近且时间过半)
    if (this.gameTime > 15 && !this._stalemateCalled && this.matchType === 'duel') {
      const [f1, f2] = this.fighters;
      if (f1.alive && f2.alive) {
        const ratio1 = f1.hp / f1.maxHp;
        const ratio2 = f2.hp / f2.maxHp;
        if (Math.abs(ratio1 - ratio2) < 0.15 && ratio1 > 0.3 && ratio2 > 0.3) {
          this._stalemateCalled = true;
          this._addComment(pick(COMMENTARY.stalemate));
        }
      }
    }

    // 检测胜负
    this._checkFightEnd();
  }

  _handleCombatEvent(evt) {
    // 更新命中统计
    if (evt.type === 'hit') {
      const atkName = evt.attacker.name;
      this._hitCount[atkName] = (this._hitCount[atkName] || 0) + 1;
      // 连击追踪
      if (this._lastAttacker === atkName) {
        this._comboCount[atkName] = (this._comboCount[atkName] || 1) + 1;
      } else {
        if (this._lastAttacker) this._comboCount[this._lastAttacker] = 0;
        this._comboCount[atkName] = 1;
      }
      this._lastAttacker = atkName;
    }

    if (this.gameTime - this._lastEventTime < 0.5) return;
    this._lastEventTime = this.gameTime;

    if (evt.type === 'hit') {
      if (!this._firstBlood) {
        this._firstBlood = true;
        this._addComment(fillTemplate(pick(COMMENTARY.firstBlood), {
          attacker: evt.attacker.name, target: evt.target.name,
        }));
        return;
      }
      // 连击解说 (3连击以上)
      const combo = this._comboCount[evt.attacker.name] || 0;
      if (combo >= 3 && Math.random() < 0.6) {
        this._addComment(fillTemplate(pick(COMMENTARY.combo), {
          attacker: evt.attacker.name, count: String(combo),
        }));
        return;
      }
      // 逆转解说（低血量方反击）
      if (evt.attacker.hp / evt.attacker.maxHp < 0.3 && evt.target.hp / evt.target.maxHp > 0.5) {
        if (Math.random() < 0.5) {
          this._addComment(fillTemplate(pick(COMMENTARY.comeback), { fighter: evt.attacker.name }));
          return;
        }
      }
      // 碾压解说
      if (evt.attacker.hp / evt.attacker.maxHp > 0.7 && evt.target.hp / evt.target.maxHp < 0.3) {
        if (Math.random() < 0.4) {
          this._addComment(fillTemplate(pick(COMMENTARY.domination), {
            attacker: evt.attacker.name, target: evt.target.name,
          }));
          return;
        }
      }
      // 重击解说
      if (evt.atkType === 'heavy' && Math.random() < 0.5) {
        this._addComment(fillTemplate(pick(COMMENTARY.heavyHit), {
          attacker: evt.attacker.name, target: evt.target.name,
        }));
      }
    } else if (evt.type === 'parry') {
      if (evt.level === 'precise') {
        if (Math.random() < 0.5) {
          this._addComment(fillTemplate(pick(COMMENTARY.counter), { attacker: evt.target.name }));
        } else {
          this._addComment(fillTemplate(pick(COMMENTARY.parry), { target: evt.target.name }));
        }
      }
    } else if (evt.type === 'lightClash' || evt.type === 'heavyClash') {
      if (Math.random() < 0.35) {
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
      // 连胜加成
      const streakBonus = this.streak > 0 ? 1 + this.streak * 0.05 : 1;
      const winnings = Math.floor(this.betAmount * multiplier * streakBonus);
      this.gold += winnings;
      this._lastBetWon = true;
      this._lastGoldChange = winnings;
      this._lastStreakBonus = streakBonus > 1 ? Math.floor((streakBonus - 1) * 100) : 0;
      // 更新连胜
      this.streak = Math.max(0, this.streak) + 1;
      this.maxStreak = Math.max(this.maxStreak, this.streak);
      this.totalBetWins++;
      this._addComment(pick(COMMENTARY.betWin));
      // 连胜解说
      if (this.streak >= 3) {
        this._addComment(fillTemplate(pick(COMMENTARY.streakWin), { count: String(this.streak) }));
      }
    } else {
      this.gold -= this.betAmount;
      this._lastBetWon = false;
      this._lastGoldChange = -this.betAmount;
      this._lastStreakBonus = 0;
      // 更新连败
      this.streak = Math.min(0, this.streak) - 1;
      this.totalBetLosses++;
      this._addComment(pick(COMMENTARY.betLose));
      // 破产保护：前8轮不会彻底破产，给最低50金
      if (this.gold <= 0 && this.round < 8) {
        this.gold = 50;
        this._addComment('好在庄家大发慈悲，赠你了点本钱继续！');
      }
    }
    // 记录峰值金币
    this.peakGold = Math.max(this.peakGold, this.gold);
    // 检查里程碑
    for (const m of this.milestones) {
      if (this.gold >= m && !this.milestonesReached.includes(m)) {
        this.milestonesReached.push(m);
        this.lastMilestoneMsg = fillTemplate(pick(COMMENTARY.milestone), { amount: String(m) });
        this._addComment(this.lastMilestoneMsg);
      }
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

  // ===== 获取评级 =====
  getRating() {
    for (const r of this.ratings) {
      if (this.gold >= r.gold) return r;
    }
    return this.ratings[this.ratings.length - 1];
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

    // ESC / 触屏返回 返回菜单
    if ((input.pressed('Escape') || input.touchBack) && this.onExit) {
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

    // 下注金额预设按钮
    if (L.betAmountBtns) {
      for (const btn of L.betAmountBtns) {
        if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
          a.betAmount = Math.min(a.gold, Math.max(10, btn.value));
          this._arenaClickCd = 0.12;
          return;
        }
      }
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

    // 下注金额预设按钮
    const betY = ch * 0.58;
    const betAmounts = [
      { label: '10', value: 10 },
      { label: '50', value: 50 },
      { label: '100', value: 100 },
      { label: '1/4', value: Math.max(10, Math.floor(a.gold / 4)) },
      { label: '半数', value: Math.max(10, Math.floor(a.gold / 2)) },
      { label: '全押', value: a.gold },
    ];
    const btnW = 52, btnH = 28, btnGap = 6;
    const totalBetW = betAmounts.length * btnW + (betAmounts.length - 1) * btnGap;
    const betSx = cx - totalBetW / 2;
    result.betAmountBtns = betAmounts.map((b, i) => ({
      x: betSx + i * (btnW + btnGap), y: betY, w: btnW, h: btnH,
      label: b.label, value: b.value,
    }));

    // 下注类型（仅单挑）
    if (a.matchType === 'duel') {
      const types = [
        { id: 'win', label: '胜负' },
        { id: 'hp_high', label: '完胜(>50%HP) 1.5x' },
        { id: 'hp_low', label: '险胜(<30%HP) 2.5x' },
      ];
      result.betTypeBtns = types.map((t, i) => ({
        x: cx - 180 + i * 130, y: betY + 38, w: 120, h: 28, id: t.id, label: t.label,
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
    ctx.fillRect(0, 0, lw, 50);
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffcc44';
    ctx.fillText(`💰 ${a.gold}`, 12, 18);
    // 连胜/连败显示
    if (a.streak > 0) {
      ctx.fillStyle = '#44ff44';
      ctx.fillText(`🔥${a.streak}连赢`, 100, 18);
    } else if (a.streak < 0) {
      ctx.fillStyle = '#ff6644';
      ctx.fillText(`❄️${Math.abs(a.streak)}连输`, 100, 18);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8e0d0';
    ctx.fillText(`第 ${a.round}/${a.maxRounds} 轮  ${TYPE_NAMES[a.matchType] || ''}`, lw / 2, 18);
    // 金币目标进度条
    const progW = lw * 0.5;
    const progH = 6;
    const progX = lw / 2 - progW / 2;
    const progY = 28;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(progX, progY, progW, progH);
    const ratio = Math.min(1, a.gold / a.victoryGoldTarget);
    const progColor = ratio >= 1 ? '#ffcc44' : ratio >= 0.6 ? '#44cc44' : ratio >= 0.3 ? '#4488ff' : '#888';
    ctx.fillStyle = progColor;
    ctx.fillRect(progX, progY, progW * ratio, progH);
    // 里程碑标记
    ctx.fillStyle = '#666';
    ctx.font = '9px "Microsoft YaHei", sans-serif';
    for (const m of a.milestones) {
      const mx = progX + (m / a.victoryGoldTarget) * progW;
      ctx.fillRect(mx - 0.5, progY - 1, 1, progH + 2);
    }
    ctx.textAlign = 'center';
    ctx.font = '10px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText(`目标: ${a.victoryGoldTarget}金`, lw / 2, progY + progH + 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#888';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillText('ESC 退出', lw - 12, 18);
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

    // 战绩提示
    if (a.streak > 0) {
      ctx.fillStyle = '#44ff44';
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.fillText(`🔥 当前${a.streak}连赢，下注加成 +${a.streak * 5}%`, cx, lh * 0.19);
    }

    // 绘制选手卡牌
    if (a.matchType === 'duel') {
      this._drawContestantCard(ctx, L.contestantBtns[0], a.contestants[0], 0, a.betTarget === 0, mx, my);
      // VS 标记
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
      ctx.fillText('VS', cx, lh * 0.30);
      // 赔率 + 克制关系
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#aaa';
      ctx.fillText(`赔率 ${a.odds.oddsA}x`, L.contestantBtns[0].x + L.contestantBtns[0].w / 2, L.contestantBtns[0].y + L.contestantBtns[0].h + 16);
      ctx.fillText(`赔率 ${a.odds.oddsB}x`, L.contestantBtns[1].x + L.contestantBtns[1].w / 2, L.contestantBtns[1].y + L.contestantBtns[1].h + 16);
      // 武器克制提示
      const matchup = a.odds.matchup;
      if (matchup && matchup !== '均势') {
        const wA = a.contestants[0].weapon.name;
        const wB = a.contestants[1].weapon.name;
        const hintColor = matchup === '克制' ? '#44cc44' : '#ff6644';
        ctx.fillStyle = hintColor;
        ctx.font = '11px "Microsoft YaHei", sans-serif';
        ctx.fillText(matchup === '克制' ? `${wA}克制${wB}` : `${wA}被${wB}克制`, cx, L.contestantBtns[0].y + L.contestantBtns[0].h + 30);
      }
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

    // 下注金额预设按钮
    ctx.textAlign = 'center';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#e8e0d0';
    const betY = L.betAmountBtns ? L.betAmountBtns[0].y : 0;
    ctx.fillText(`下注: ${a.betAmount} 金`, cx, betY - 8);

    // 金额按钮
    if (L.betAmountBtns) {
      for (const btn of L.betAmountBtns) {
        const sel = a.betAmount === btn.value;
        const hover = mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h;
        ctx.fillStyle = sel ? 'rgba(255,204,68,0.3)' : (hover ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)');
        ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
        ctx.strokeStyle = sel ? '#ffcc44' : '#555';
        ctx.lineWidth = sel ? 2 : 1;
        ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
        ctx.fillStyle = sel ? '#ffcc44' : '#ccc';
        ctx.font = '12px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        const dispLabel = btn.label === '全押' ? `全押` : (btn.label === '半数' ? `半数` : btn.label);
        ctx.fillText(dispLabel, btn.x + btn.w / 2, btn.y + btn.h / 2 + 4);
      }
    }

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
    const isAllIn = a.betAmount >= a.gold && a.gold > 0;
    ctx.fillText(isAllIn ? '🎲 梭哈！' : '⚔ 开战！', fb.x + fb.w / 2, fb.y + fb.h / 2 + 6);
  },

  _drawContestantCard(ctx, rect, contestant, idx, selected, mx, my) {
    const hover = mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h;
    ctx.fillStyle = selected ? 'rgba(255,204,68,0.15)' : (hover ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)');
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = selected ? '#ffcc44' : (hover ? '#666' : '#333');
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    const cx = rect.x + rect.w / 2;
    let ty = rect.y + 18;
    ctx.textAlign = 'center';

    // 名字
    ctx.fillStyle = '#e8e0d0';
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
    ctx.fillText(contestant.fullName, cx, ty);
    ty += 20;

    // 武器 + 护甲
    const info = this.arena.getContestantInfo(idx);
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = contestant.color || '#aaa';
    ctx.fillText(`${info.weaponIcon} ${info.weaponName}  ${info.armorIcon} ${info.armorName}`, cx, ty);
    ty += 18;

    // 难度星级
    ctx.fillStyle = '#aaa';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    const stars = '★'.repeat(contestant.difficulty) + '☆'.repeat(5 - contestant.difficulty);
    ctx.fillText(`实力: ${stars}`, cx, ty);
    ty += 16;

    // 武器属性雷达图（小型条形图）
    const ws = WEAPON_STATS[contestant.weaponId];
    if (ws) {
      const barLabels = ['攻', '防', '速', '范'];
      const barValues = [ws.atk, ws.def, ws.spd, ws.rng];
      const barColors = ['#ff6644', '#4488ff', '#44cc44', '#ffcc44'];
      const barW = 32, barH = 4, barGap = 2;
      const totalBarW = barLabels.length * (barW + 18 + barGap);
      let bx = cx - totalBarW / 2;
      for (let i = 0; i < barLabels.length; i++) {
        ctx.fillStyle = '#666';
        ctx.font = '9px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(barLabels[i], bx + 14, ty + 3);
        // 背景
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(bx + 16, ty - 2, barW, barH);
        // 填充
        ctx.fillStyle = barColors[i];
        ctx.fillRect(bx + 16, ty - 2, barW * (barValues[i] / 5), barH);
        bx += barW + 18 + barGap;
      }
      ty += 12;
      // 武器类型标签
      ctx.textAlign = 'center';
      ctx.fillStyle = '#777';
      ctx.font = '10px "Microsoft YaHei", sans-serif';
      ctx.fillText(`[${ws.type}型] ${DIFF_NAMES[contestant.difficulty - 1] || ''}`, cx, ty);
    }
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
    ctx.fillText(`🏆 ${winnerName} 获胜！`, cx, lh * 0.15);

    // 下注结果
    const betColor = a._lastBetWon ? '#44ff44' : '#ff4444';
    const betText = a._lastBetWon
      ? `✅ 押中！获得 +${a._lastGoldChange} 金`
      : `❌ 押错！失去 ${Math.abs(a._lastGoldChange)} 金`;
    ctx.fillStyle = betColor;
    ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
    ctx.fillText(betText, cx, lh * 0.25);

    // 连胜加成提示
    if (a._lastBetWon && a._lastStreakBonus > 0) {
      ctx.fillStyle = '#ffcc44';
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.fillText(`🔥 连胜加成 +${a._lastStreakBonus}%`, cx, lh * 0.30);
    }

    // 当前金币 + 连胜状态
    ctx.fillStyle = '#ffcc44';
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    let statusText = `💰 当前金币: ${a.gold}`;
    if (a.streak > 1) statusText += `  🔥${a.streak}连赢`;
    else if (a.streak < -1) statusText += `  ❄️${Math.abs(a.streak)}连输`;
    ctx.fillText(statusText, cx, lh * 0.38);

    // 战况回顾
    if (a.winner) {
      ctx.fillStyle = '#888';
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      const hpPct = Math.round(a.winnerHp / a.winner.maxHp * 100);
      ctx.fillText(`胜者剩余 ${hpPct}% 血量  战斗时长 ${a.gameTime.toFixed(1)}s`, cx, lh * 0.46);
    }

    // 综合战绩
    ctx.fillStyle = '#666';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillText(`押中 ${a.totalBetWins} 次 / 押错 ${a.totalBetLosses} 次  最高连赢 ${a.maxStreak}  峰值金币 ${a.peakGold}`, cx, lh * 0.53);

    // 里程碑进度
    const nextMilestone = a.milestones.find(m => !a.milestonesReached.includes(m));
    if (nextMilestone) {
      ctx.fillStyle = '#555';
      ctx.font = '11px "Microsoft YaHei", sans-serif';
      ctx.fillText(`下一里程碑: ${nextMilestone}金 (还差${Math.max(0, nextMilestone - a.gold)})`, cx, lh * 0.58);
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
    ctx.fillText('💀 破产！', cx, lh * 0.22);
    ctx.fillStyle = '#aaa';
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.fillText(`坚持了 ${a.round} 轮`, cx, lh * 0.34);

    // 详细统计
    const rating = a.getRating();
    ctx.fillStyle = rating.color;
    ctx.font = 'bold 24px "Microsoft YaHei", sans-serif';
    ctx.fillText(`评级: ${rating.grade} - ${rating.label}`, cx, lh * 0.44);

    ctx.fillStyle = '#888';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText(`押中 ${a.totalBetWins}次  最高连赢 ${a.maxStreak}  峰值金币 ${a.peakGold}`, cx, lh * 0.52);

    ctx.fillStyle = '#666';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText('点击任意位置返回菜单', cx, lh * 0.64);
  },

  _drawArenaVictory(ctx, lw, lh) {
    const a = this.arena;
    const cx = lw / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, lw, lh);
    ctx.textAlign = 'center';

    // 评级
    const rating = a.getRating();
    ctx.fillStyle = rating.color;
    ctx.font = 'bold 36px "Microsoft YaHei", sans-serif';
    ctx.fillText(`🏆 擂台通关！`, cx, lh * 0.18);

    // 评级大字
    ctx.font = 'bold 60px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = rating.color;
    ctx.fillText(rating.grade, cx, lh * 0.32);
    ctx.font = '18px "Microsoft YaHei", sans-serif';
    ctx.fillText(`称号: ${rating.label}`, cx, lh * 0.38);

    // 详细战绩
    ctx.fillStyle = '#e8e0d0';
    ctx.font = '15px "Microsoft YaHei", sans-serif';
    ctx.fillText(`最终金币: ${a.gold}`, cx, lh * 0.46);

    const wins = a.totalBetWins;
    const losses = a.totalBetLosses;
    const winRate = wins + losses > 0 ? Math.round(wins / (wins + losses) * 100) : 0;
    ctx.fillStyle = '#aaa';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${a.maxRounds}轮 押中${wins}次 胜率${winRate}%`, cx, lh * 0.52);
    ctx.fillText(`最高连赢: ${a.maxStreak}  峰值金币: ${a.peakGold}`, cx, lh * 0.57);

    // 里程碑成就
    if (a.milestonesReached.length > 0) {
      ctx.fillStyle = '#ffcc44';
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.fillText(`已达成里程碑: ${a.milestonesReached.join(' > ')}`, cx, lh * 0.63);
    }

    ctx.fillStyle = '#666';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText('点击任意位置返回菜单', cx, lh * 0.72);
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
