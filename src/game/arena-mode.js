// ===================== 武林大会 (Wulin Tournament) =====================
// 16人单淘汰锦标赛 + 下注系统 + 解说 + 胜利表演
// 角色从无名开始，赢了获称号，最终冠军=武林盟主
// 含特殊轮次：败者复活混战

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
  // ===== 武林大会专用解说 =====
  tournamentOpen: [
    '武林大会正式开幕！十六路豪杰齐聚！',
    '各路英雄豪杰，今日一决雌雄！',
    '锣鼓喧天，第{edition}届武林大会开始！',
  ],
  advance: [
    '{fighter}成功晋级！',
    '{fighter}一路高歌，杀入下一轮！',
    '恭喜{fighter}晋级{round}！',
  ],
  titleEarned: [
    '民间传出绰号——{fullName}！',
    '江湖人送外号「{title}」——{name}！',
    '经此一役，{name}有了新绰号：「{title}」！',
  ],
  seedIntro: [
    '种子选手{fighter}登场！此人不可小觑！',
    '注意！{fighter}是本届夺冠热门！',
    '{fighter}来了！以往战绩有目共睹！',
  ],
  finalIntro: [
    '万众瞩目！决赛即将开始！',
    '巅峰对决！武林盟主之位花落谁家？',
    '这是本届武林大会的最终一战！',
  ],
  champion: [
    '新一代武林盟主诞生——{winner}！',
    '{winner}登顶武林之巅！天下第一！',
    '恭贺{winner}荣膺武林盟主！',
  ],
  elimination: [
    '{fighter}遗憾出局！',
    '{fighter}止步于此，来年再战！',
    '可惜！{fighter}被淘汰了！',
  ],
  revivalIntro: [
    '败者复活赛！被淘汰的选手还有一次机会！',
    '复活之战开始！谁能绝地逢生？',
    '最后的机会！淘汰选手争夺一个复活名额！',
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
  let scoreA = (fighterA.difficulty || 3) * 12;
  let scoreB = (fighterB.difficulty || 3) * 12;
  scoreA += ARMOR_SCORE[fighterA.armorId] || 0;
  scoreB += ARMOR_SCORE[fighterB.armorId] || 0;
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

// ===== 混战赔率计算 =====
function calcBrawlOdds(contestants) {
  const odds = {};
  let totalScore = 0;
  for (const c of contestants) {
    const score = (c.difficulty || 3) * 10 + 5 + (ARMOR_SCORE[c.armorId] || 0);
    totalScore += score;
  }
  for (let i = 0; i < contestants.length; i++) {
    const score = (contestants[i].difficulty || 3) * 10 + 5 + (ARMOR_SCORE[contestants[i].armorId] || 0);
    const prob = score / totalScore;
    odds[i] = +(0.90 / prob).toFixed(2);
  }
  return odds;
}

// ===== 创建武者数据 =====
function createContestant(opts = {}) {
  const diff = opts.difficulty || (2 + Math.floor(Math.random() * 4));
  const weaponId = opts.weaponId || randomWeapon();
  const weapon = getWeapon(weaponId);
  const armorIds = ['none', 'none', 'none', 'light', 'light', 'medium', 'medium', 'heavy'];
  const armorId = opts.armorId || armorIds[Math.floor(Math.random() * armorIds.length)];
  const name = opts.name || randomChineseName('random');
  return {
    name: name,
    title: opts.title || '',
    fullName: opts.title ? `「${opts.title}」${name}` : name,
    displayName: opts.title ? `「${opts.title}」${name}` : name,
    difficulty: diff,
    weaponId,
    weapon,
    armorId,
    color: opts.color || weapon.color,
    hpMult: opts.hpMult || 1,
    scale: opts.scale || 1,
    // 武林大会战绩
    wins: opts.wins || 0,
    losses: 0,
    eliminated: false,
    isSeed: opts.isSeed || false,
    isChampion: opts.isChampion || false,
    titleEarned: !!opts.title,
    bracketSlot: -1,
  };
}

// ===== 赋予称号 =====
const TITLES = [
  '铁拳', '飞刀', '独臂', '快剑', '毒蛇', '疯狗', '笑面虎', '鬼见愁', '活阎王',
  '小旋风', '大力', '神行', '铁壁', '铜头', '金刚', '罗汉', '太极', '八卦', '无影',
  '夺命', '追魂', '断魂', '摧心', '碎骨', '穿心', '裂地', '开山', '移山', '填海',
  '血手', '冷面', '银枪', '金刀', '玉面', '白衣', '黑风', '赤焰', '青衫', '紫电',
];

function grantTitle(contestant) {
  if (contestant.titleEarned) return;
  const title = TITLES[Math.floor(Math.random() * TITLES.length)];
  contestant.title = title;
  contestant.titleEarned = true;
  contestant.fullName = `「${title}」${contestant.name}`;
  contestant.displayName = contestant.fullName;
}

// ===== 赛程结构定义 =====
const ROUND_NAMES = ['', '第一轮', '第二轮', '败者复活赛', '半决赛', '决赛'];
const ROUND_LABELS = ['', '十六强', '八强', '复活赛', '四强', '冠军战'];

// ===== 武林大会模式状态 =====
export const ARENA_PHASES = [
  'opening',     // 开幕式（展示16人名单）
  'bracket',     // 显示对阵表
  'betting',     // 下注
  'fighting',    // 战斗中
  'celebration', // 胜利表演（2.5s）
  'result',      // 结果展示
  'roundSummary',// 本轮总结 + 晋级名单
  'gameover',    // 破产
  'champion',    // 冠军诞生
];

export class ArenaMode {
  constructor() {
    // === 金币与下注 ===
    this.gold = 500;
    this.betTarget = null;
    this.betAmount = 50;
    this.betType = 'win';
    this.odds = {};

    // === 统计 ===
    this.streak = 0;
    this.maxStreak = 0;
    this.peakGold = 500;
    this.totalBetWins = 0;
    this.totalBetLosses = 0;
    this.milestones = [1000, 2000, 3000, 5000, 8000];
    this.milestonesReached = [];
    this.ratings = [
      { grade: 'S', gold: 8000, label: '赌圣', color: '#ffcc44' },
      { grade: 'A', gold: 5000, label: '赌侠', color: '#44ff44' },
      { grade: 'B', gold: 3000, label: '赌徒', color: '#4488ff' },
      { grade: 'C', gold: 1000, label: '赌棍', color: '#aaaaaa' },
      { grade: 'D', gold: 0,    label: '赌狗', color: '#ff4444' },
    ];

    // === 赛事结构 ===
    this.edition = 1 + Math.floor(Math.random() * 99);
    this.phase = 'opening';
    this.pool = [];
    this.bracket = [];
    this.eliminated = [];
    this.tournamentRound = 1;
    this.matchIndex = 0;
    this.matchesInRound = 0;
    this.matchType = 'duel';
    this.totalMatches = 0;

    // === 当前比赛 ===
    this.contestants = [];
    this.fighters = [];
    this.enemies = [];
    this.combat = null;
    this.allFighters = [];
    this.gameTime = 0;

    // === 战斗控制 ===
    this.fightDone = false;
    this.winner = null;
    this.winnerTeam = -1;
    this.winnerHp = 0;
    this.fightSpeed = 1;

    // === celebration阶段 ===
    this.celebrationTimer = 0;
    this.celebrationDuration = 2.5;
    this.celebrationFinalDuration = 4;

    // === 解说 ===
    this.commentary = [];
    this.commentaryTimer = 0;
    this.currentComment = '';
    this.commentFade = 0;

    // === 事件追踪 ===
    this._firstBlood = false;
    this._lowHpWarned = new Set();
    this._lastEventTime = 0;
    this._comboCount = {};
    this._lastAttacker = null;
    this._hitCount = {};
    this._stalemateCalled = false;

    // === 结果 ===
    this.roundHistory = [];
    this._lastBetWon = false;
    this._lastGoldChange = 0;
    this._lastStreakBonus = 0;

    // === 开幕定时器 ===
    this._openingTimer = 0;

    // === 初始化赛事 ===
    this._initTournament();
  }

  // ===================== 初始化16人锦标赛 =====================
  _initTournament() {
    this.pool = [];
    this.eliminated = [];
    this.bracket = [];
    this.tournamentRound = 1;
    this.matchIndex = 0;
    this.totalMatches = 0;

    // 生成16个不重复的名字
    const uniqueNames = new Set();
    const names = [];
    let attempts = 0;
    while (names.length < 16 && attempts < 200) {
      attempts++;
      const name = randomChineseName('random');
      if (!uniqueNames.has(name)) {
        uniqueNames.add(name);
        names.push(name);
      }
    }

    // 基础难度：3~5随机分配
    for (let i = 0; i < 16; i++) {
      const diff = 3 + Math.floor(Math.random() * 3);
      const c = createContestant({
        name: names[i],
        difficulty: diff,
      });
      c.bracketSlot = i;
      this.pool.push(c);
    }

    // 指定2个种子选手（带称号），上下半区各一个
    const seedIndices = [0, Math.floor(Math.random() * 7) + 8];
    for (const idx of seedIndices) {
      const c = this.pool[idx];
      c.isSeed = true;
      c.difficulty = 5;
      grantTitle(c);
    }

    // 其中一个是"上届冠军"
    const champIdx = seedIndices[Math.floor(Math.random() * 2)];
    this.pool[champIdx].isChampion = true;

    // 生成第一轮对阵
    this._generateRoundBracket();
    this.phase = 'opening';
    this._openingTimer = 0;
  }

  // ===== 生成当前轮对阵 =====
  _generateRoundBracket() {
    this.bracket = [];
    this.matchIndex = 0;
    const alive = this.pool.filter(c => !c.eliminated);

    if (this.tournamentRound === 1) {
      // 第一轮：按bracketSlot顺序配对（0v1, 2v3, ...）
      for (let i = 0; i < alive.length; i += 2) {
        if (i + 1 < alive.length) {
          this.bracket.push({ a: alive[i], b: alive[i + 1], winner: null });
        }
      }
      this.matchesInRound = this.bracket.length;
      this.matchType = 'duel';
    } else if (this.tournamentRound === 2) {
      // 第二轮：上一轮赢家配对
      const winners = alive.filter(c => c.wins >= 1);
      for (let i = 0; i < winners.length; i += 2) {
        if (i + 1 < winners.length) {
          this.bracket.push({ a: winners[i], b: winners[i + 1], winner: null });
        }
      }
      this.matchesInRound = this.bracket.length;
      this.matchType = 'duel';
    } else if (this.tournamentRound === 3) {
      // 败者复活赛：最近4个淘汰者混战
      const revivalPool = this.eliminated.slice(-4);
      if (revivalPool.length >= 3) {
        this.bracket.push({ contestants: revivalPool, winner: null });
        this.matchesInRound = 1;
        this.matchType = 'brawl';
      } else {
        this.tournamentRound = 4;
        this._generateRoundBracket();
        return;
      }
    } else if (this.tournamentRound === 4) {
      // 半决赛
      const semiFighters = alive.filter(c => !c.eliminated);
      if (semiFighters.length >= 4) {
        for (let i = 0; i < 4; i += 2) {
          this.bracket.push({ a: semiFighters[i], b: semiFighters[i + 1], winner: null });
        }
      } else if (semiFighters.length === 3) {
        this.bracket.push({ contestants: semiFighters, winner: null, eliminateCount: 1 });
        this.matchType = 'brawl';
        this.matchesInRound = 1;
        return;
      } else if (semiFighters.length === 2) {
        this.tournamentRound = 5;
        this._generateRoundBracket();
        return;
      }
      this.matchesInRound = this.bracket.length;
      this.matchType = 'duel';
    } else if (this.tournamentRound === 5) {
      // 决赛
      const finalists = alive.filter(c => !c.eliminated);
      if (finalists.length >= 2) {
        this.bracket.push({ a: finalists[0], b: finalists[1], winner: null });
        this.matchesInRound = 1;
        this.matchType = 'duel';
      }
    }
  }

  // ===== 获取当前场次数据 =====
  getCurrentMatch() {
    if (this.matchIndex < this.bracket.length) {
      return this.bracket[this.matchIndex];
    }
    return null;
  }

  // ===== 准备当前场次 =====
  setupCurrentMatch() {
    const match = this.getCurrentMatch();
    if (!match) return;

    this.phase = 'betting';
    this.fightDone = false;
    this.winner = null;
    this._firstBlood = false;
    this._lowHpWarned.clear();
    this.gameTime = 0;
    this.celebrationTimer = 0;
    this._comboCount = {};
    this._hitCount = {};
    this._lastAttacker = null;
    this._stalemateCalled = false;
    this.betTarget = null;
    this.betType = 'win';

    if (match.contestants) {
      this.matchType = 'brawl';
      this.contestants = match.contestants;
      this.odds = calcBrawlOdds(this.contestants);
    } else {
      this.matchType = 'duel';
      this.contestants = [match.a, match.b];
      this.odds = calcOdds(match.a, match.b);
    }

    this.betAmount = Math.min(this.gold, 50);

    // 解说：种子选手/上届冠军介绍
    for (const c of this.contestants) {
      if (c.isChampion) {
        this._addComment(fillTemplate(pick(COMMENTARY.seedIntro), { fighter: c.displayName }));
      } else if (c.isSeed && c.wins === 0) {
        this._addComment(fillTemplate(pick(COMMENTARY.seedIntro), { fighter: c.displayName }));
      }
    }
    if (this.tournamentRound === 5) {
      this._addComment(pick(COMMENTARY.finalIntro));
    }
    if (this.tournamentRound === 3) {
      this._addComment(pick(COMMENTARY.revivalIntro));
    }
  }

  // ===== 开始战斗 =====
  startFight(particles, camera) {
    this.phase = 'fighting';
    this.gameTime = 0;
    this.fighters = [];
    this.enemies = [];
    this.combat = new CombatSystem(particles, camera);
    this.combat.playerFighter = null;

    if (this.matchType === 'duel') {
      const [cA, cB] = this.contestants;
      const eA = new Enemy(C.ARENA_W / 2 - 80, C.ARENA_H / 2, cA.difficulty, {
        weaponId: cA.weaponId, color: cA.color, name: cA.displayName,
      });
      eA.fighter.armor = getArmor(cA.armorId);
      eA.fighter.team = 0;
      const eB = new Enemy(C.ARENA_W / 2 + 80, C.ARENA_H / 2, cB.difficulty, {
        weaponId: cB.weaponId, color: cB.color, name: cB.displayName,
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
          weaponId: c.weaponId, color: c.color, name: c.displayName,
        });
        e.fighter.armor = getArmor(c.armorId);
        e.fighter.team = i;
        e.fighter.facing = angle + Math.PI;
        this.enemies.push(e);
        this.fighters.push(e.fighter);
      }
    }

    this.allFighters = this.fighters;
    for (const f of this.fighters) f.showNameTag = true;

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
      this.matchType === 'brawl' ? COMMENTARY.brawlStart : COMMENTARY.matchStart
    ));
  }

  // ===== 战斗tick =====
  tickFight(dt, particles) {
    if (this.fightDone) return;
    this.gameTime += dt;
    this.commentaryTimer -= dt;

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.fighter.alive) continue;
      let target = null, minD = Infinity;
      for (const other of this.fighters) {
        if (other === e.fighter || other.team === e.fighter.team || !other.alive) continue;
        const d = dist(e.fighter, other);
        if (d < minD) { minD = d; target = other; }
      }
      if (!target) continue;
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

    for (const f of this.fighters) {
      f.x = Math.max(f.radius, Math.min(C.ARENA_W - f.radius, f.x));
      f.y = Math.max(f.radius, Math.min(C.ARENA_H - f.radius, f.y));
    }

    this.combat.resolve(this.allFighters, this.gameTime, dt);

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

    // 胶着解说
    if (this.gameTime > 15 && !this._stalemateCalled && this.matchType === 'duel') {
      const [f1, f2] = this.fighters;
      if (f1.alive && f2.alive) {
        const r1 = f1.hp / f1.maxHp, r2 = f2.hp / f2.maxHp;
        if (Math.abs(r1 - r2) < 0.15 && r1 > 0.3 && r2 > 0.3) {
          this._stalemateCalled = true;
          this._addComment(pick(COMMENTARY.stalemate));
        }
      }
    }

    this._checkFightEnd();
  }

  // ===== celebration阶段tick（胜利表演）=====
  tickCelebration(dt) {
    this.celebrationTimer += dt;
    const noop = { moveX: 0, moveY: 0, faceAngle: 0, lightAttack: false, heavyAttack: false, blockHeld: false, dodge: false, dodgeAngle: 0 };
    const walking = this.celebrationTimer > 0.3 && this.celebrationTimer < 2.0;

    // 胜者散步表演
    for (const e of this.enemies) {
      if (!e.fighter.alive) continue;
      let nearestDead = null, minD = Infinity;
      for (const other of this.fighters) {
        if (other === e.fighter || other.alive) continue;
        const d = dist(e.fighter, other);
        if (d < minD) { minD = d; nearestDead = other; }
      }
      if (nearestDead) {
        const ang = Math.atan2(e.fighter.y - nearestDead.y, e.fighter.x - nearestDead.x);
        e.fighter.update(dt, {
          ...noop,
          faceAngle: ang,
          moveX: walking ? Math.cos(ang) * 0.4 : 0,
          moveY: walking ? Math.sin(ang) * 0.4 : 0,
        }, this.gameTime + this.celebrationTimer);
      } else {
        e.fighter.update(dt, noop, this.gameTime + this.celebrationTimer);
      }
      e.fighter.x = Math.max(e.fighter.radius, Math.min(C.ARENA_W - e.fighter.radius, e.fighter.x));
      e.fighter.y = Math.max(e.fighter.radius, Math.min(C.ARENA_H - e.fighter.radius, e.fighter.y));
    }

    const dur = this.tournamentRound === 5 ? this.celebrationFinalDuration : this.celebrationDuration;
    if (this.celebrationTimer >= dur) {
      this._finishMatch();
    }
  }

  _handleCombatEvent(evt) {
    if (evt.type === 'hit') {
      const atkName = evt.attacker.name;
      this._hitCount[atkName] = (this._hitCount[atkName] || 0) + 1;
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
      const combo = this._comboCount[evt.attacker.name] || 0;
      if (combo >= 3 && Math.random() < 0.6) {
        this._addComment(fillTemplate(pick(COMMENTARY.combo), {
          attacker: evt.attacker.name, count: String(combo),
        }));
        return;
      }
      if (evt.attacker.hp / evt.attacker.maxHp < 0.3 && evt.target.hp / evt.target.maxHp > 0.5) {
        if (Math.random() < 0.5) {
          this._addComment(fillTemplate(pick(COMMENTARY.comeback), { fighter: evt.attacker.name }));
          return;
        }
      }
      if (evt.attacker.hp / evt.attacker.maxHp > 0.7 && evt.target.hp / evt.target.maxHp < 0.3) {
        if (Math.random() < 0.4) {
          this._addComment(fillTemplate(pick(COMMENTARY.domination), {
            attacker: evt.attacker.name, target: evt.target.name,
          }));
          return;
        }
      }
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
      this._onFightDecided(null);
      return;
    }

    if (this.matchType === 'duel') {
      if (alive.length === 1) this._onFightDecided(alive[0]);
      if (this.gameTime > 60) {
        const sorted = [...this.fighters].sort((a, b) => b.hp - a.hp);
        this._onFightDecided(sorted[0]);
      }
    } else if (this.matchType === 'brawl') {
      if (alive.length === 1) this._onFightDecided(alive[0]);
      if (this.gameTime > 90) {
        const sorted = [...alive].sort((a, b) => b.hp - a.hp);
        this._onFightDecided(sorted[0]);
      }
    }
  }

  // ===== 战斗决出→进入celebration =====
  _onFightDecided(winnerFighter) {
    if (this.fightDone) return;  // 防止重复调用
    this.fightDone = true;
    this.winner = winnerFighter;
    this.winnerHp = winnerFighter ? winnerFighter.hp : 0;

    const winnerName = winnerFighter ? winnerFighter.name : '无人';
    this._addComment(fillTemplate(pick(COMMENTARY.victory), { winner: winnerName }));

    // 进入celebration阶段（不立刻结算）
    this.phase = 'celebration';
    this.celebrationTimer = 0;
  }

  // ===== celebration结束→结算 =====
  _finishMatch() {
    this._settleBet();
    this.phase = 'result';

    const match = this.getCurrentMatch();
    if (match) {
      if (this.matchType === 'duel') {
        const winnerContestant = this.winner ?
          this.contestants.find(c => c.displayName === this.winner.name) : null;
        const loserContestant = winnerContestant ?
          this.contestants.find(c => c !== winnerContestant) : null;

        if (winnerContestant) {
          winnerContestant.wins++;
          match.winner = winnerContestant;
          // 2胜获得称号
          if (winnerContestant.wins >= 2 && !winnerContestant.titleEarned) {
            grantTitle(winnerContestant);
            this._addComment(fillTemplate(pick(COMMENTARY.titleEarned), {
              fullName: winnerContestant.fullName,
              title: winnerContestant.title,
              name: winnerContestant.name,
            }));
          }
          this._addComment(fillTemplate(pick(COMMENTARY.advance), {
            fighter: winnerContestant.displayName,
            round: ROUND_LABELS[this.tournamentRound] || '',
          }));
        }
        if (loserContestant) {
          loserContestant.losses++;
          if (this.tournamentRound !== 3) {
            loserContestant.eliminated = true;
            this.eliminated.push(loserContestant);
            this._addComment(fillTemplate(pick(COMMENTARY.elimination), {
              fighter: loserContestant.displayName,
            }));
          }
        }
      } else if (this.matchType === 'brawl') {
        const winnerContestant = this.winner ?
          this.contestants.find(c => c.displayName === this.winner.name) : null;
        if (winnerContestant) {
          winnerContestant.wins++;
          match.winner = winnerContestant;
          if (winnerContestant.wins >= 2 && !winnerContestant.titleEarned) {
            grantTitle(winnerContestant);
            this._addComment(fillTemplate(pick(COMMENTARY.titleEarned), {
              fullName: winnerContestant.fullName,
              title: winnerContestant.title,
              name: winnerContestant.name,
            }));
          }
          // 复活赛：胜者取消淘汰
          if (this.tournamentRound === 3) {
            winnerContestant.eliminated = false;
            const idx = this.eliminated.indexOf(winnerContestant);
            if (idx >= 0) this.eliminated.splice(idx, 1);
          }
        }
        for (const c of this.contestants) {
          if (c !== winnerContestant) {
            c.eliminated = true;
            if (!this.eliminated.includes(c)) this.eliminated.push(c);
          }
        }
      }
    }

    this.totalMatches++;

    this.roundHistory.push({
      round: this.tournamentRound,
      matchIndex: this.matchIndex,
      matchType: this.matchType,
      winner: this.winner ? this.winner.name : '无',
      betWon: this._lastBetWon,
      goldChange: this._lastGoldChange,
      goldAfter: this.gold,
    });
  }

  _settleBet() {
    if (this.betTarget === null || this.betTarget === undefined) {
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
    }

    if (won) {
      let multiplier;
      if (this.matchType === 'duel') {
        multiplier = this.betTarget === 0 ? this.odds.oddsA : this.odds.oddsB;
        if (this.betType === 'hp_high') multiplier *= 1.5;
        if (this.betType === 'hp_low') multiplier *= 2.5;
      } else {
        multiplier = this.odds[this.betTarget] || 2;
      }
      const streakBonus = this.streak > 0 ? 1 + this.streak * 0.05 : 1;
      const winnings = Math.floor(this.betAmount * multiplier * streakBonus);
      this.gold += winnings;
      this._lastBetWon = true;
      this._lastGoldChange = winnings;
      this._lastStreakBonus = streakBonus > 1 ? Math.floor((streakBonus - 1) * 100) : 0;
      this.streak = Math.max(0, this.streak) + 1;
      this.maxStreak = Math.max(this.maxStreak, this.streak);
      this.totalBetWins++;
      this._addComment(pick(COMMENTARY.betWin));
      if (this.streak >= 3) {
        this._addComment(fillTemplate(pick(COMMENTARY.streakWin), { count: String(this.streak) }));
      }
    } else {
      this.gold -= this.betAmount;
      this._lastBetWon = false;
      this._lastGoldChange = -this.betAmount;
      this._lastStreakBonus = 0;
      this.streak = Math.min(0, this.streak) - 1;
      this.totalBetLosses++;
      this._addComment(pick(COMMENTARY.betLose));
      if (this.gold <= 0 && this.totalMatches < 8) {
        this.gold = 50;
        this._addComment('好在庄家大发慈悲，赠你了点本钱继续！');
      }
    }
    this.peakGold = Math.max(this.peakGold, this.gold);
    for (const m of this.milestones) {
      if (this.gold >= m && !this.milestonesReached.includes(m)) {
        this.milestonesReached.push(m);
        this._addComment(fillTemplate(pick(COMMENTARY.milestone), { amount: String(m) }));
      }
    }
  }

  // ===== 进入下一场 =====
  nextMatch() {
    if (this.gold <= 0) {
      this.phase = 'gameover';
      return;
    }
    this.matchIndex++;
    if (this.matchIndex >= this.bracket.length) {
      this.phase = 'roundSummary';
    } else {
      this.setupCurrentMatch();
    }
  }

  // ===== 进入下一轮 =====
  nextTournamentRound() {
    if (this.gold <= 0) {
      this.phase = 'gameover';
      return;
    }
    this.tournamentRound++;
    if (this.tournamentRound > 5) {
      this.phase = 'champion';
      return;
    }
    const alive = this.pool.filter(c => !c.eliminated);
    if (alive.length === 1) {
      this._crowningChampion(alive[0]);
      return;
    }
    if (alive.length === 0) {
      this.phase = 'gameover';
      return;
    }
    this._generateRoundBracket();
    if (this.bracket.length === 0) {
      if (alive.length === 1) {
        this._crowningChampion(alive[0]);
      } else {
        this.phase = 'gameover';
      }
      return;
    }
    this.setupCurrentMatch();
  }

  _crowningChampion(contestant) {
    this.phase = 'champion';
    this.winner = { name: contestant.displayName };
    contestant.fullName = `武林盟主 · ${contestant.displayName}`;
    this._addComment(fillTemplate(pick(COMMENTARY.champion), { winner: contestant.displayName }));
  }

  getTournamentProgress() {
    const alive = this.pool.filter(c => !c.eliminated);
    const total = this.pool.length;
    return {
      alive: alive.length,
      total,
      roundName: ROUND_NAMES[this.tournamentRound] || '',
      roundLabel: ROUND_LABELS[this.tournamentRound] || '',
      matchProgress: `${this.matchIndex + 1}/${this.matchesInRound || this.bracket.length}`,
      totalMatches: this.totalMatches,
    };
  }

  getRating() {
    for (const r of this.ratings) {
      if (this.gold >= r.gold) return r;
    }
    return this.ratings[this.ratings.length - 1];
  }

  _addComment(text) {
    this.commentary.push(text);
    if (this.commentary.length > 8) this.commentary.shift();
    this.currentComment = text;
    this.commentFade = 3.0;
  }

  updateCommentary(dt) {
    if (this.commentFade > 0) this.commentFade -= dt;
  }

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
const DIFF_NAMES = ['新手', '普通', '熟练', '困难', '大师'];
const TYPE_NAMES = { duel: '🤺 单挑', brawl: '⚔ 混战' };

export const arenaModeMethods = {
  _setupArenaMode() {
    this.arena = new ArenaMode();
    this._arenaClickCd = 0;
  },

  _updateArena(dt) {
    const a = this.arena;
    const input = this.input;
    this._arenaClickCd -= dt;

    if ((input.pressed('Escape') || input.touchBack) && this.onExit) {
      this.onExit();
      return;
    }

    a.updateCommentary(dt);

    if (a.phase === 'opening') {
      this._updateArenaOpening(dt);
    } else if (a.phase === 'bracket') {
      this._updateArenaBracket(dt);
    } else if (a.phase === 'betting') {
      this._updateArenaBetting(dt);
    } else if (a.phase === 'fighting') {
      a.tickFight(dt, this.particles);
      this.particles.update(dt);
      this.camera.update(dt);
    } else if (a.phase === 'celebration') {
      a.tickCelebration(dt);
      this.particles.update(dt);
      this.camera.update(dt);
    } else if (a.phase === 'result') {
      this._updateArenaResult(dt);
    } else if (a.phase === 'roundSummary') {
      this._updateArenaRoundSummary(dt);
    } else if (a.phase === 'gameover' || a.phase === 'champion') {
      if ((input.pressed('Space') || input.mouseLeftDown) && this._arenaClickCd <= 0) {
        if (this.onExit) this.onExit();
      }
    }
  },

  _updateArenaOpening(dt) {
    const a = this.arena;
    a._openingTimer += dt;
    if ((this.input.mouseLeftDown || this.input.pressed('Space')) && this._arenaClickCd <= 0 && a._openingTimer > 0.5) {
      a.phase = 'bracket';
      this._arenaClickCd = 0.3;
    }
  },

  _updateArenaBracket(dt) {
    if ((this.input.mouseLeftDown || this.input.pressed('Space')) && this._arenaClickCd <= 0) {
      this.arena.setupCurrentMatch();
      this._arenaClickCd = 0.3;
    }
  },

  _updateArenaBetting(dt) {
    const a = this.arena;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    if (!this.input.mouseLeftDown || this._arenaClickCd > 0) return;

    const L = this._layoutArenaBetting();

    for (let i = 0; i < L.contestantBtns.length; i++) {
      const b = L.contestantBtns[i];
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        a.betTarget = i;
        this._arenaClickCd = 0.15;
        return;
      }
    }

    if (L.betAmountBtns) {
      for (const btn of L.betAmountBtns) {
        if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
          a.betAmount = Math.min(a.gold, Math.max(10, btn.value));
          this._arenaClickCd = 0.12;
          return;
        }
      }
    }

    if (a.matchType === 'duel' && L.betTypeBtns) {
      for (const bt of L.betTypeBtns) {
        if (mx >= bt.x && mx <= bt.x + bt.w && my >= bt.y && my <= bt.y + bt.h) {
          a.betType = bt.id;
          this._arenaClickCd = 0.15;
          return;
        }
      }
    }

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
    if (!this.input.mouseLeftDown || this._arenaClickCd > 0) return;
    const L = this._layoutArenaResult();
    const mx = this.input.mouseX, my = this.input.mouseY;
    if (mx >= L.nextBtn.x && mx <= L.nextBtn.x + L.nextBtn.w &&
        my >= L.nextBtn.y && my <= L.nextBtn.y + L.nextBtn.h) {
      if (a.tournamentRound === 5 && a.matchIndex >= a.bracket.length - 1) {
        const alive = a.pool.filter(c => !c.eliminated);
        if (alive.length === 1) {
          a._crowningChampion(alive[0]);
        } else {
          a.phase = 'champion';
        }
      } else {
        a.nextMatch();
      }
      this._arenaClickCd = 0.3;
    }
  },

  _updateArenaRoundSummary(dt) {
    if (!this.input.mouseLeftDown || this._arenaClickCd > 0) return;
    const L = this._layoutArenaRoundSummary();
    const mx = this.input.mouseX, my = this.input.mouseY;
    if (mx >= L.nextBtn.x && mx <= L.nextBtn.x + L.nextBtn.w &&
        my >= L.nextBtn.y && my <= L.nextBtn.y + L.nextBtn.h) {
      this.arena.nextTournamentRound();
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
      const cardW = 200, cardH = 160;
      const gap = 60;
      result.contestantBtns = [
        { x: cx - cardW - gap / 2, y: ch * 0.22, w: cardW, h: cardH, idx: 0 },
        { x: cx + gap / 2, y: ch * 0.22, w: cardW, h: cardH, idx: 1 },
      ];
    } else if (a.matchType === 'brawl') {
      const cardW = 120, cardH = 120;
      const count = a.contestants.length;
      const totalW = count * cardW + (count - 1) * 10;
      let sx = cx - totalW / 2;
      for (let i = 0; i < count; i++) {
        result.contestantBtns.push({ x: sx + i * (cardW + 10), y: ch * 0.22, w: cardW, h: cardH, idx: i });
      }
    }

    const betY = ch * 0.62;
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

    result.fightBtn = { x: cx - 70, y: ch * 0.86, w: 140, h: 42 };
    return result;
  },

  _layoutArenaResult() {
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    return { nextBtn: { x: cw / 2 - 70, y: ch * 0.78, w: 140, h: 42 } };
  },

  _layoutArenaRoundSummary() {
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    return { nextBtn: { x: cw / 2 - 70, y: ch * 0.82, w: 140, h: 42 } };
  },

  // ===== 绘制总入口 =====
  _renderArena() {
    const dpr = this.canvas._dpr || 1;
    const lw = this.canvas._logicW || this.canvas.width;
    const lh = this.canvas._logicH || this.canvas.height;
    const ctx = this.renderer.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const a = this.arena;

    if (a.phase === 'fighting' || a.phase === 'celebration') {
      this.renderer.clear(lw, lh);
      ctx.save();
      this.camera.applyWorldTransform(ctx);
      this.renderer.drawGrid();
      for (const e of a.enemies) {
        this.renderer.drawFighter(e.fighter);
      }
      this.renderer.drawParticles(this.particles);
      ctx.restore();

      this._drawArenaFightHUD(ctx, lw, lh);

      // celebration阶段渐暗遮罩+胜者名字
      if (a.phase === 'celebration') {
        const t = a.celebrationTimer;
        const dur = a.tournamentRound === 5 ? a.celebrationFinalDuration : a.celebrationDuration;
        const fadeAlpha = Math.min(0.5, Math.max(0, (t - dur * 0.6) / (dur * 0.4) * 0.5));
        if (fadeAlpha > 0) {
          ctx.fillStyle = `rgba(0,0,0,${fadeAlpha})`;
          ctx.fillRect(0, 0, lw, lh);
        }
        if (t > 0.5 && a.winner) {
          const nameAlpha = Math.min(1, (t - 0.5) / 0.5);
          ctx.save();
          ctx.globalAlpha = nameAlpha;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ffcc44';
          ctx.font = `bold ${a.tournamentRound === 5 ? 32 : 24}px "Microsoft YaHei", sans-serif`;
          ctx.fillText(`🏆 ${a.winner.name} 获胜！`, lw / 2, lh * 0.2);
          if (a.tournamentRound === 5) {
            ctx.fillStyle = '#ff6644';
            ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
            ctx.fillText('新一代武林盟主诞生！', lw / 2, lh * 0.28);
          }
          ctx.restore();
        }
      }
    } else {
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, lw, lh);
    }

    this._drawArenaTopBar(ctx, lw);

    if (a.phase === 'opening') {
      this._drawArenaOpening(ctx, lw, lh);
    } else if (a.phase === 'bracket') {
      this._drawArenaBracket(ctx, lw, lh);
    } else if (a.phase === 'betting') {
      this._drawArenaBetting(ctx, lw, lh);
    } else if (a.phase === 'result') {
      this._drawArenaResult(ctx, lw, lh);
    } else if (a.phase === 'roundSummary') {
      this._drawArenaRoundSummary(ctx, lw, lh);
    } else if (a.phase === 'gameover') {
      this._drawArenaGameover(ctx, lw, lh);
    } else if (a.phase === 'champion') {
      this._drawArenaChampion(ctx, lw, lh);
    }

    this._drawArenaCommentary(ctx, lw, lh);
  },

  // ===== 顶部栏 =====
  _drawArenaTopBar(ctx, lw) {
    const a = this.arena;
    const prog = a.getTournamentProgress();

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, lw, 50);

    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffcc44';
    ctx.fillText(`💰 ${a.gold}`, 12, 18);

    if (a.streak > 0) {
      ctx.fillStyle = '#44ff44';
      ctx.fillText(`🔥${a.streak}连赢`, 100, 18);
    } else if (a.streak < 0) {
      ctx.fillStyle = '#ff6644';
      ctx.fillText(`❄️${Math.abs(a.streak)}连输`, 100, 18);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8e0d0';
    ctx.fillText(`第${a.edition}届武林大会 · ${prog.roundName} ${prog.matchProgress}`, lw / 2, 18);

    ctx.fillStyle = '#888';
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    ctx.fillText(`存活 ${prog.alive}/${prog.total} 人`, lw / 2, 34);

    // 晋级进度条
    const stages = ['16强', '8强', '4强', '决赛', '盟主'];
    const stageW = 50;
    const stageGap = 4;
    const totalStageW = stages.length * stageW + (stages.length - 1) * stageGap;
    const stageX = lw / 2 - totalStageW / 2;
    const stageY = 42;
    for (let i = 0; i < stages.length; i++) {
      const x = stageX + i * (stageW + stageGap);
      const active = i < a.tournamentRound;
      const current = i === a.tournamentRound - 1;
      ctx.fillStyle = current ? 'rgba(255,204,68,0.3)' : active ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)';
      ctx.fillRect(x, stageY, stageW, 6);
      if (current) {
        ctx.fillStyle = '#ffcc44';
        ctx.fillRect(x, stageY, stageW, 6);
      }
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = '#888';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillText('ESC 退出', lw - 12, 18);
  },

  // ===== 开幕式 =====
  _drawArenaOpening(ctx, lw, lh) {
    const a = this.arena;
    const cx = lw / 2;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcc44';
    ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
    ctx.fillText(`⚔ 第${a.edition}届武林大会 ⚔`, cx, lh * 0.1);

    ctx.fillStyle = '#888';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillText('十六路豪杰齐聚，一决雌雄', cx, lh * 0.15);

    // 16人名单（4列4行）
    const cols = 4, rows = 4;
    const cardW = 115, cardH = 52;
    const gapX = 10, gapY = 6;
    const gridW = cols * cardW + (cols - 1) * gapX;
    const startX = cx - gridW / 2;
    const startY = lh * 0.2;

    for (let i = 0; i < a.pool.length; i++) {
      const c = a.pool[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);

      ctx.fillStyle = c.isSeed ? 'rgba(255,204,68,0.08)' : 'rgba(255,255,255,0.03)';
      ctx.fillRect(x, y, cardW, cardH);
      ctx.strokeStyle = c.isSeed ? '#ffcc44' : '#333';
      ctx.lineWidth = c.isSeed ? 1.5 : 1;
      ctx.strokeRect(x, y, cardW, cardH);

      ctx.fillStyle = '#555';
      ctx.font = '10px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`#${i + 1}`, x + 4, y + 14);

      ctx.fillStyle = c.isSeed ? '#ffcc44' : '#ccc';
      ctx.font = `${c.isSeed ? 'bold ' : ''}12px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(c.displayName, x + cardW / 2, y + 16);

      ctx.fillStyle = c.color || '#888';
      ctx.font = '11px "Microsoft YaHei", sans-serif';
      ctx.fillText(`${c.weapon.icon} ${c.weapon.name}`, x + cardW / 2, y + 32);

      const stars = '★'.repeat(c.difficulty) + '☆'.repeat(5 - c.difficulty);
      ctx.fillStyle = '#666';
      ctx.font = '9px "Microsoft YaHei", sans-serif';
      ctx.fillText(stars, x + cardW / 2, y + 44);

      if (c.isChampion) {
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 9px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('👑卫冕', x + cardW - 4, y + 44);
      } else if (c.isSeed) {
        ctx.fillStyle = '#ffcc44';
        ctx.font = 'bold 9px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('⭐种子', x + cardW - 4, y + 44);
      }
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#666';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    const blink = Math.sin(Date.now() * 0.005) > 0;
    if (blink) ctx.fillText('点击开始比赛', cx, lh * 0.88);
  },

  // ===== 对阵表 =====
  _drawArenaBracket(ctx, lw, lh) {
    const a = this.arena;
    const cx = lw / 2;
    const prog = a.getTournamentProgress();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8e0d0';
    ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${prog.roundName} · 对阵表`, cx, lh * 0.1);

    const bracket = a.bracket;
    const matchH = 38;
    const matchGap = 8;
    const matchW = 300;
    const startY = lh * 0.16;

    for (let i = 0; i < bracket.length; i++) {
      const m = bracket[i];
      const y = startY + i * (matchH + matchGap);
      const x = cx - matchW / 2;
      const isCurrent = i === a.matchIndex;
      const isDone = m.winner !== null;

      ctx.fillStyle = isCurrent ? 'rgba(255,204,68,0.1)' : 'rgba(255,255,255,0.03)';
      ctx.fillRect(x, y, matchW, matchH);
      ctx.strokeStyle = isCurrent ? '#ffcc44' : '#333';
      ctx.lineWidth = isCurrent ? 2 : 1;
      ctx.strokeRect(x, y, matchW, matchH);

      if (m.contestants) {
        ctx.fillStyle = '#aaa';
        ctx.font = '12px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        const nameList = m.contestants.map(c => c.displayName).join(' vs ');
        ctx.fillText(nameList, cx, y + matchH / 2 + 4);
      } else {
        const nameA = m.a.displayName;
        const nameB = m.b.displayName;
        ctx.font = '13px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillStyle = isDone && m.winner === m.a ? '#44ff44' : (isDone && m.winner === m.b ? '#555' : '#ccc');
        ctx.fillText(nameA, cx - 20, y + matchH / 2 + 4);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
        ctx.fillText('VS', cx, y + matchH / 2 + 4);
        ctx.font = '13px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = isDone && m.winner === m.b ? '#44ff44' : (isDone && m.winner === m.a ? '#555' : '#ccc');
        ctx.fillText(nameB, cx + 20, y + matchH / 2 + 4);
      }

      if (isCurrent) {
        ctx.fillStyle = '#ffcc44';
        ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('▶', x - 18, y + matchH / 2 + 4);
      }
      if (isDone) {
        ctx.fillStyle = '#44ff44';
        ctx.font = '12px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('✓', x + matchW + 16, y + matchH / 2 + 4);
      }
    }

    const blink = Math.sin(Date.now() * 0.005) > 0;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#666';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    if (blink) ctx.fillText('点击开始下注', cx, lh * 0.88);
  },

  // ===== 下注界面 =====
  _drawArenaBetting(ctx, lw, lh) {
    const a = this.arena;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const L = this._layoutArenaBetting();
    const cx = lw / 2;
    const prog = a.getTournamentProgress();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8e0d0';
    ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
    ctx.fillText(`⚔ ${prog.roundName} · 第${a.matchIndex + 1}场 ⚔`, cx, lh * 0.1);

    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText('选择你看好的武者，押下赌注！', cx, lh * 0.14);

    if (a.streak > 0) {
      ctx.fillStyle = '#44ff44';
      ctx.font = '11px "Microsoft YaHei", sans-serif';
      ctx.fillText(`🔥 当前${a.streak}连赢，下注加成 +${a.streak * 5}%`, cx, lh * 0.17);
    }

    // 选手卡牌
    if (a.matchType === 'duel') {
      this._drawContestantCard(ctx, L.contestantBtns[0], a.contestants[0], 0, a.betTarget === 0, mx, my);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
      ctx.fillText('VS', cx, lh * 0.32);
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#aaa';
      ctx.fillText(`赔率 ${a.odds.oddsA}x`, L.contestantBtns[0].x + L.contestantBtns[0].w / 2, L.contestantBtns[0].y + L.contestantBtns[0].h + 16);
      ctx.fillText(`赔率 ${a.odds.oddsB}x`, L.contestantBtns[1].x + L.contestantBtns[1].w / 2, L.contestantBtns[1].y + L.contestantBtns[1].h + 16);
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
    }

    // 下注金额
    ctx.textAlign = 'center';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#e8e0d0';
    const betY = L.betAmountBtns ? L.betAmountBtns[0].y : 0;
    ctx.fillText(`下注: ${a.betAmount} 金`, cx, betY - 8);

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
        ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 4);
      }
    }

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

  // ===== 选手卡牌 =====
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

    ctx.fillStyle = contestant.isSeed ? '#ffcc44' : '#e8e0d0';
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
    ctx.fillText(contestant.displayName, cx, ty);
    ty += 18;

    if (contestant.wins > 0) {
      ctx.fillStyle = '#44ff44';
      ctx.font = '11px "Microsoft YaHei", sans-serif';
      ctx.fillText(`本届 ${contestant.wins} 胜`, cx, ty);
      ty += 14;
    } else {
      ty += 14;
    }

    const info = this.arena.getContestantInfo(idx);
    if (info) {
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = contestant.color || '#aaa';
      ctx.fillText(`${info.weaponIcon} ${info.weaponName}  ${info.armorIcon} ${info.armorName}`, cx, ty);
      ty += 16;
    }

    ctx.fillStyle = '#aaa';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    const stars = '★'.repeat(contestant.difficulty) + '☆'.repeat(5 - contestant.difficulty);
    ctx.fillText(`实力: ${stars}`, cx, ty);
    ty += 14;

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
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(bx + 16, ty - 2, barW, barH);
        ctx.fillStyle = barColors[i];
        ctx.fillRect(bx + 16, ty - 2, barW * (barValues[i] / 5), barH);
        bx += barW + 18 + barGap;
      }
      ty += 10;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#777';
      ctx.font = '10px "Microsoft YaHei", sans-serif';
      ctx.fillText(`[${ws.type}型] ${DIFF_NAMES[contestant.difficulty - 1] || ''}`, cx, ty);
    }

    if (contestant.isChampion) {
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('👑卫冕冠军', rect.x + rect.w - 4, rect.y + 14);
    } else if (contestant.isSeed) {
      ctx.fillStyle = '#ffcc44';
      ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('⭐种子', rect.x + rect.w - 4, rect.y + 14);
    }
  },

  // ===== 战斗HUD =====
  _drawArenaFightHUD(ctx, lw, lh) {
    const a = this.arena;
    const barH = 8;
    const barW = 140;
    const startY = 52;
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    for (let i = 0; i < a.fighters.length; i++) {
      const f = a.fighters[i];
      const bx = (i % 2 === 0) ? 10 : lw - barW - 10;
      const by = startY + Math.floor(i / 2) * 24;
      ctx.textAlign = i % 2 === 0 ? 'left' : 'right';
      ctx.fillStyle = f.alive ? (f.color || '#ccc') : '#555';
      ctx.fillText(f.name, i % 2 === 0 ? bx : bx + barW, by - 2);
      ctx.fillStyle = 'rgba(255,0,0,0.2)';
      ctx.fillRect(bx, by + 2, barW, barH);
      if (f.alive) {
        const ratio = Math.max(0, f.hp / f.maxHp);
        ctx.fillStyle = ratio > 0.5 ? '#44cc44' : (ratio > 0.25 ? '#cccc44' : '#cc4444');
        ctx.fillRect(bx, by + 2, barW * ratio, barH);
      }
    }
  },

  // ===== 结果面板 =====
  _drawArenaResult(ctx, lw, lh) {
    const a = this.arena;
    const cx = lw / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, lw, lh);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8e0d0';
    ctx.font = 'bold 24px "Microsoft YaHei", sans-serif';
    const winnerName = a.winner ? a.winner.name : '平局';
    ctx.fillText(`🏆 ${winnerName} 获胜！`, cx, lh * 0.15);

    const betColor = a._lastBetWon ? '#44ff44' : '#ff4444';
    const betText = a._lastBetWon
      ? `✅ 押中！获得 +${a._lastGoldChange} 金`
      : `❌ 押错！失去 ${Math.abs(a._lastGoldChange)} 金`;
    ctx.fillStyle = betColor;
    ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
    ctx.fillText(betText, cx, lh * 0.25);

    if (a._lastBetWon && a._lastStreakBonus > 0) {
      ctx.fillStyle = '#ffcc44';
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.fillText(`🔥 连胜加成 +${a._lastStreakBonus}%`, cx, lh * 0.30);
    }

    ctx.fillStyle = '#ffcc44';
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.fillText(`💰 当前金币: ${a.gold}`, cx, lh * 0.38);

    if (a.winner) {
      ctx.fillStyle = '#888';
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      const hpPct = Math.round(a.winnerHp / a.winner.maxHp * 100);
      ctx.fillText(`胜者剩余 ${hpPct}% 血量  战斗时长 ${a.gameTime.toFixed(1)}s`, cx, lh * 0.46);
    }

    // 称号获得提示
    const match = a.getCurrentMatch();
    if (match && match.winner && match.winner.wins === 2 && match.winner.titleEarned) {
      ctx.fillStyle = '#ff88ff';
      ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
      ctx.fillText(`🌟 ${match.winner.name} 获得江湖绰号：「${match.winner.title}」`, cx, lh * 0.54);
    }

    ctx.fillStyle = '#666';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillText(`押中 ${a.totalBetWins} 次 / 押错 ${a.totalBetLosses} 次  最高连赢 ${a.maxStreak}`, cx, lh * 0.62);

    // 下一场按钮
    const L = this._layoutArenaResult();
    const nb = L.nextBtn;
    const mx = this.input.mouseX, my = this.input.mouseY;
    const hover = mx >= nb.x && mx <= nb.x + nb.w && my >= nb.y && my <= nb.y + nb.h;
    ctx.fillStyle = hover ? '#4488ff' : '#336699';
    ctx.fillRect(nb.x, nb.y, nb.w, nb.h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    const isLast = a.matchIndex >= a.bracket.length - 1;
    ctx.fillText(isLast ? '查看晋级' : '下一场 →', nb.x + nb.w / 2, nb.y + nb.h / 2 + 5);
  },

  // ===== 轮次总结 =====
  _drawArenaRoundSummary(ctx, lw, lh) {
    const a = this.arena;
    const cx = lw / 2;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcc44';
    ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${ROUND_NAMES[a.tournamentRound] || ''} 结束`, cx, lh * 0.1);

    const alive = a.pool.filter(c => !c.eliminated);
    ctx.fillStyle = '#e8e0d0';
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.fillText(`晋级选手 (${alive.length}人)`, cx, lh * 0.18);

    const cols = alive.length > 4 ? 2 : 1;
    const itemH = 28;
    const colW = 200;
    const startX = cx - (cols * colW) / 2;
    const startY = lh * 0.22;

    for (let i = 0; i < alive.length; i++) {
      const c = alive[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * colW;
      const y = startY + row * itemH;

      ctx.textAlign = 'left';
      ctx.fillStyle = c.titleEarned ? '#ffcc44' : '#ccc';
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.fillText(`${c.weapon.icon} ${c.displayName}`, x + 10, y + 18);

      ctx.fillStyle = '#44ff44';
      ctx.font = '11px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${c.wins}胜`, x + colW - 10, y + 18);
    }

    const dead = a.pool.filter(c => c.eliminated);
    const deadY = startY + Math.ceil(alive.length / cols) * itemH + 30;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#666';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText(`已淘汰: ${dead.map(c => c.name).join('、')}`, cx, deadY);

    const nextRound = a.tournamentRound + 1;
    if (nextRound <= 5) {
      ctx.fillStyle = '#ff8844';
      ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
      ctx.fillText(`接下来: ${ROUND_NAMES[nextRound]}`, cx, deadY + 30);
    }

    const L = this._layoutArenaRoundSummary();
    const nb = L.nextBtn;
    const mx = this.input.mouseX, my = this.input.mouseY;
    const hover = mx >= nb.x && mx <= nb.x + nb.w && my >= nb.y && my <= nb.y + nb.h;
    ctx.fillStyle = hover ? '#4488ff' : '#336699';
    ctx.fillRect(nb.x, nb.y, nb.w, nb.h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('继续 →', nb.x + nb.w / 2, nb.y + nb.h / 2 + 5);
  },

  // ===== 破产 =====
  _drawArenaGameover(ctx, lw, lh) {
    const a = this.arena;
    const cx = lw / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, lw, lh);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
    ctx.fillText('💀 银两耗尽！', cx, lh * 0.22);

    ctx.fillStyle = '#aaa';
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.fillText(`坚持了 ${a.totalMatches} 场比赛`, cx, lh * 0.34);

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

  // ===== 冠军诞生 =====
  _drawArenaChampion(ctx, lw, lh) {
    const a = this.arena;
    const cx = lw / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, lw, lh);

    ctx.textAlign = 'center';
    const pulse = 0.8 + 0.2 * Math.sin(Date.now() * 0.006);
    ctx.fillStyle = `rgba(255,204,68,${pulse})`;
    ctx.font = 'bold 36px "Microsoft YaHei", sans-serif';
    ctx.fillText('🏆 武林大会 · 落幕 🏆', cx, lh * 0.14);

    const winnerName = a.winner ? a.winner.name : '???';
    ctx.fillStyle = '#ffcc44';
    ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
    ctx.fillText(`武林盟主`, cx, lh * 0.26);
    ctx.font = 'bold 32px "Microsoft YaHei", sans-serif';
    ctx.fillText(winnerName, cx, lh * 0.34);

    const rating = a.getRating();
    ctx.fillStyle = rating.color;
    ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
    ctx.fillText(`评级: ${rating.grade} - ${rating.label}`, cx, lh * 0.44);

    ctx.fillStyle = '#e8e0d0';
    ctx.font = '15px "Microsoft YaHei", sans-serif';
    ctx.fillText(`最终金币: ${a.gold}`, cx, lh * 0.52);

    const wins = a.totalBetWins;
    const losses = a.totalBetLosses;
    const winRate = wins + losses > 0 ? Math.round(wins / (wins + losses) * 100) : 0;
    ctx.fillStyle = '#aaa';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${a.totalMatches}场 押中${wins}次 胜率${winRate}%`, cx, lh * 0.58);
    ctx.fillText(`最高连赢: ${a.maxStreak}  峰值金币: ${a.peakGold}`, cx, lh * 0.63);

    if (a.milestonesReached.length > 0) {
      ctx.fillStyle = '#ffcc44';
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.fillText(`已达成里程碑: ${a.milestonesReached.join(' > ')}`, cx, lh * 0.69);
    }

    ctx.fillStyle = '#666';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText('点击任意位置返回菜单', cx, lh * 0.78);
  },

  // ===== 解说文字 =====
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
