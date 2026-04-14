// ===================== 宗门风云 · 数据定义 =====================
// 弟子、设施、任务、事件、特质、商品等所有静态数据

import { randomChineseName, randomTitledName } from '../core/names.js';

// ===== 装备品质系统 =====
export const ITEM_QUALITY = {
  normal: { id: 'normal', name: '普通', color: '#888888', hpMul: 1.0,  shortName: '' },
  fine:   { id: 'fine',   name: '精良', color: '#44dd88', hpMul: 1.12, shortName: '精' },
  rare:   { id: 'rare',   name: '罕见', color: '#7799ff', hpMul: 1.25, shortName: '稀' },
};
export const QUALITY_IDS = ['normal', 'fine', 'rare'];

/** 格式化装备显示名 (e.g. "精良·刀" 或 "刀") */
export function itemLabel(weaponOrArmor, quality) {
  const q = ITEM_QUALITY[quality];
  return q && quality !== 'normal' ? `${q.name}·${weaponOrArmor}` : weaponOrArmor;
}

/** 任务胜利后，随机掉落一件装备（返回 {type,id,quality} 或 null） */
export function rollLootDrop(quest) {
  // 基础掉落率 40%，任务越难越高
  const baseChance = 0.30 + (quest.enemyDiff - 1) * 0.05;
  if (Math.random() > baseChance) return null;

  // 品质分布：60%普通 / 30%精良 / 10%罕见
  const r = Math.random();
  const quality = r < 0.10 ? 'rare' : r < 0.40 ? 'fine' : 'normal';

  // 掉落类型：50%武器 / 50%护甲（护甲必须有 smith 等级 >= 1，因此优先给武器）
  const type = Math.random() < 0.55 ? 'weapon' : 'armor';
  const id = type === 'weapon'
    ? WEAPON_IDS[Math.floor(Math.random() * WEAPON_IDS.length)]
    : ['light', 'medium', 'heavy'][Math.min(2, Math.floor(Math.random() * 3))];

  return { type, id, quality };
}

// ===== 特质定义 =====
export const TRAITS = {
  brave:     { id: 'brave',     name: '勇猛', desc: '攻击更积极', color: '#ff6644', aiMod: { heavyRate: 0.10, blockDurBase: -0.1 } },
  steady:    { id: 'steady',    name: '稳健', desc: '防守见长',   color: '#4488ff', aiMod: { blockDurBase: 0.1, dodgeChance: 0.03 } },
  stealthy:  { id: 'stealthy',  name: '鬼祟', desc: '善于偷袭',   color: '#aa44ff', aiMod: { backstabBias: 0.2 } },
  ironwall:  { id: 'ironwall',  name: '铁壁', desc: '格挡高手',   color: '#88ccff', aiMod: { reactChance: 0.05 } },
  fierce:    { id: 'fierce',    name: '暴躁', desc: '高攻低防',   color: '#ff4444', aiMod: { heavyRate: 0.15, reactChance: -0.05 } },
  calm:      { id: 'calm',      name: '沉着', desc: '反应敏捷',   color: '#44ddaa', aiMod: { thinkCDMul: 0.8, perfectDodgeChance: 0.10 } },
  genius:    { id: 'genius',    name: '天才', desc: '资质+1',     color: '#ffdd00', aiMod: {} },
  tough:     { id: 'tough',     name: '坚韧', desc: 'HP+15%',    color: '#88aa44', aiMod: { hpMul: 0.15 } },
  swift:     { id: 'swift',     name: '迅捷', desc: '移速+10%',   color: '#44ffaa', aiMod: { speedMul: 0.10 } },
  lucky:     { id: 'lucky',     name: '幸运', desc: '任务奖励+20%', color: '#ffaa44', aiMod: {} },
};
export const TRAIT_LIST = Object.values(TRAITS);
export const COMMON_TRAITS = TRAIT_LIST.filter(t => t.id !== 'genius');
export const RARE_TRAITS = [TRAITS.genius];

// ===== 武器中文名映射 =====
export const WEAPON_NAMES = {
  dao: '刀', daggers: '匕', hammer: '锤', spear: '枪', shield: '盾',
};
export const WEAPON_IDS = ['dao', 'daggers', 'hammer', 'spear', 'shield'];

// ===== 护甲中文名映射 =====
export const ARMOR_NAMES = {
  none: '无甲', light: '轻甲', medium: '中甲', heavy: '重甲', plate: '板甲',
};

// ===== 弟子颜色池 =====
const DISCIPLE_COLORS = [
  '#ff6644', '#44aaff', '#ffcc33', '#44dd88', '#ff44aa',
  '#aa88ff', '#ff8833', '#33cccc', '#cc6699', '#88cc44',
  '#dd7744', '#5599ee', '#ddaa33', '#55bb77', '#cc5588',
  '#9977dd', '#ee7722', '#44bbaa', '#bb5577', '#77aa33',
];

// ===== 设施定义 =====
export const BUILDINGS = {
  dojo:     { id: 'dojo',     name: '练武场', icon: '🏟', maxLv: 5, desc: '训练经验加成',
              costs: [200, 500, 1200, 3000, 8000], effect: lv => `经验×${(1 + lv * 0.3).toFixed(1)}` },
  smith:    { id: 'smith',    name: '铁匠铺', icon: '🔨', maxLv: 3, desc: '解锁护甲等级',
              costs: [300, 800, 2000], effect: lv => ['轻甲', '中甲', '重甲'][lv - 1] || '—' },
  library:  { id: 'library',  name: '藏经阁', icon: '📚', maxLv: 3, desc: '训练获得特质',
              costs: [500, 1500, 4000], effect: lv => `特质概率+${lv * 10}%` },
  clinic:   { id: 'clinic',   name: '药房',   icon: '💊', maxLv: 3, desc: '受伤恢复加速',
              costs: [300, 800, 2000], effect: lv => `恢复×${(1 + lv * 0.5).toFixed(1)}` },
  inn:      { id: 'inn',      name: '客栈',   icon: '🏨', maxLv: 3, desc: '增加每日来客',
              costs: [200, 600, 1500], effect: lv => `+${lv}位来客` },
  barracks: { id: 'barracks', name: '校场',   icon: '🏰', maxLv: 5, desc: '弟子容量上限',
              costs: [100, 400, 1000, 2500, 6000], effect: lv => `${[3, 5, 8, 12, 16][lv - 1] || 3}人` },
  bank:     { id: 'bank',     name: '钱庄',   icon: '💰', maxLv: 3, desc: '每日被动收入',
              costs: [500, 1500, 5000], effect: lv => `+${lv * 80}银/天` },
  tower:    { id: 'tower',    name: '望楼',   icon: '🗼', maxLv: 3, desc: '解锁高级任务',
              costs: [400, 1200, 3500], effect: lv => `${lv}级区域` },
};
export const BUILDING_LIST = Object.values(BUILDINGS);

/** 弟子容量上限 */
export function maxDisciples(barracksLv) {
  return [3, 5, 8, 12, 16][barracksLv - 1] || 3;
}

/** 可用护甲等级 */
export function availableArmors(smithLv) {
  const armors = ['none'];
  if (smithLv >= 1) armors.push('light');
  if (smithLv >= 2) armors.push('medium');
  if (smithLv >= 3) armors.push('heavy');
  return armors;
}

/** 每日被动收入 */
export function dailyIncome(bankLv) {
  return bankLv === 0 ? 0 : 50 + bankLv * 80; // Lv1=130, Lv2=210, Lv3=290
}

/** 训练经验倍率 */
export function trainExpMul(dojoLv) {
  return 1 + dojoLv * 0.3;
}

/** 受伤恢复倍率 */
export function healMul(clinicLv) {
  return 1 + clinicLv * 0.5;
}

// ===== 任务定义 =====
export const QUEST_TYPES = [
  { id: 'bandit',   name: '剿匪',     icon: '⚔', minTower: 0, enemyDiff: [1, 2], reward: { gold: [80, 150], fame: [3, 8], exp: [15, 25] },  risk: 'low',  desc: '清剿山贼，维护治安' },
  { id: 'escort',   name: '护镖',     icon: '📦', minTower: 0, enemyDiff: [2, 3], reward: { gold: [150, 300], fame: [5, 12], exp: [20, 35] }, risk: 'mid',  desc: '押送镖车，沿途遇敌' },
  { id: 'tourney',  name: '比武大会', icon: '🏆', minTower: 1, enemyDiff: [3, 4], reward: { gold: [100, 200], fame: [15, 30], exp: [30, 50] }, risk: 'mid', desc: '参加武林大会，扬名立万' },
  { id: 'explore',  name: '探秘古墓', icon: '🗝', minTower: 1, enemyDiff: [3, 5], reward: { gold: [200, 500], fame: [8, 15], exp: [25, 45] }, risk: 'high', desc: '深入古墓，寻宝探险' },
  { id: 'justice',  name: '除暴安良', icon: '⚖', minTower: 0, enemyDiff: [2, 3], reward: { gold: [60, 120], fame: [10, 20], exp: [15, 30] }, risk: 'low', desc: '惩奸除恶，百姓称颂' },
  { id: 'rival',    name: '门派挑战', icon: '🔥', minTower: 2, enemyDiff: [4, 5], reward: { gold: [200, 400], fame: [25, 50], exp: [40, 60] }, risk: 'high', desc: '挑战对手门派，胜者为王' },
  { id: 'assassin', name: '夜袭敌营', icon: '🌙', minTower: 2, enemyDiff: [3, 5], reward: { gold: [250, 450], fame: [12, 25], exp: [35, 55] }, risk: 'high', desc: '趁夜突袭，一击制胜' },
  { id: 'guard',    name: '守卫要塞', icon: '🛡', minTower: 1, enemyDiff: [2, 4], reward: { gold: [120, 250], fame: [8, 18], exp: [20, 40] }, risk: 'mid', desc: '驻守要塞，抵御来犯' },
];

/** 获取当前可用任务（基于望楼等级）*/
export function getAvailableQuests(towerLv) {
  return QUEST_TYPES.filter(q => q.minTower <= towerLv);
}

/** 生成任务实例 */
export function generateQuest(towerLv) {
  const available = getAvailableQuests(towerLv);
  const qt = available[Math.floor(Math.random() * available.length)];
  const diff = qt.enemyDiff[0] + Math.floor(Math.random() * (qt.enemyDiff[1] - qt.enemyDiff[0] + 1));
  const gold = qt.reward.gold[0] + Math.floor(Math.random() * (qt.reward.gold[1] - qt.reward.gold[0] + 1));
  const fame = qt.reward.fame[0] + Math.floor(Math.random() * (qt.reward.fame[1] - qt.reward.fame[0] + 1));
  const exp = qt.reward.exp[0] + Math.floor(Math.random() * (qt.reward.exp[1] - qt.reward.exp[0] + 1));
  const weaponId = WEAPON_IDS[Math.floor(Math.random() * WEAPON_IDS.length)];
  return {
    type: qt.id,
    name: qt.name,
    icon: qt.icon,
    desc: qt.desc,
    risk: qt.risk,
    enemyDiff: diff,
    enemyWeapon: weaponId,
    reward: { gold, fame, exp },
    enemyFemale: Math.random() < 0.3,            // 30% 概率为女敌人
    enemyImgId: Math.floor(Math.random() * 3) + 1, // 1–3 三套立绘随机
    discipleId: null, // 指派的弟子
  };
}

// ===== 随机事件定义 =====
export const EVENT_TYPES = [
  { id: 'wanderer',    name: '流浪高手',   icon: '🗡', weight: 15,
    desc: '一名落魄剑客求投门下',
    choices: [
      { label: '收留', effect: 'addDisciple', params: { loyaltyBase: 40, talentMin: 2, talentMax: 4 } },
      { label: '拒绝', effect: 'none' },
    ] },
  { id: 'raid',        name: '山贼围攻',   icon: '💀', weight: 10,
    desc: '一伙山贼盯上了宗门！',
    choices: [
      { label: '迎战', effect: 'raidBattle', params: { count: 2, diff: [1, 3] } },
      { label: '交保护费', effect: 'payGold', params: { amount: 150 } },
    ] },
  { id: 'prodigy',     name: '天降奇才',   icon: '🌟', weight: 5,
    desc: '山中发现练武奇童，资质惊人！',
    choices: [
      { label: '收为弟子(300银)', effect: 'addProdigy', params: { cost: 300, talent: [4, 5] } },
      { label: '路过', effect: 'none' },
    ] },
  { id: 'merchant',    name: '黑市商人',   icon: '🎭', weight: 12,
    desc: '神秘商人兜售稀有物品',
    choices: [
      { label: '买秘药(200银)', effect: 'buyElixir', params: { cost: 200 } },
      { label: '买护甲(300银)', effect: 'buyArmor', params: { cost: 300 } },
      { label: '不买',          effect: 'none' },
    ] },
  { id: 'breakthrough', name: '弟子顿悟',  icon: '💡', weight: 12,
    desc: '{disciple}在训练中顿悟！',
    choices: [
      { label: '太好了', effect: 'grantBreakthrough' },
    ] },
  { id: 'betrayal',    name: '弟子不满',   icon: '💢', weight: 8,
    desc: '{disciple}忠诚度过低，意图叛逃',
    choices: [
      { label: '挽留(100银)', effect: 'retainDisciple', params: { cost: 100 } },
      { label: '放走',        effect: 'removeDisciple' },
    ] },
  { id: 'alliance',    name: '门派来访',  icon: '🤝', weight: 10,
    desc: '有门派提议结为友好',
    choices: [
      { label: '结盟(+声望)', effect: 'gainFame', params: { fame: 15 } },
      { label: '婉拒', effect: 'none' },
    ] },
  { id: 'plague',      name: '瘟疫流行',  icon: '🤒', weight: 5,
    desc: '门派爆发疫病，全员受影响',
    choices: [
      { label: '全力医治(200银)', effect: 'cureAll', params: { cost: 200 } },
      { label: '自行恢复', effect: 'plagueAll' },
    ] },
  { id: 'donation',    name: '富商捐赠',  icon: '💎', weight: 10,
    desc: '一位仰慕你声望的富商前来捐赠',
    choices: [
      { label: '收下', effect: 'gainGold', params: { gold: [150, 400] } },
    ] },
  { id: 'duel_invite', name: '江湖挑战书', icon: '📜', weight: 10,
    desc: '收到一封挑战书，对方点名挑战',
    choices: [
      { label: '应战', effect: 'duelChallenge', params: { diff: [3, 5] } },
      { label: '无视(-声望)', effect: 'loseFame', params: { fame: 10 } },
    ] },
  { id: 'treasure',    name: '藏宝图线索', icon: '🗺', weight: 6,
    desc: '获得一张残破的藏宝图',
    choices: [
      { label: '派人探索', effect: 'treasureHunt' },
      { label: '忽略', effect: 'none' },
    ] },
];

/** 按权重随机选取事件 */
export function rollEvent(state) {
  // 过滤掉不适用的事件
  let pool = [...EVENT_TYPES];
  // 弟子不满需要有弟子且忠诚度低
  if (!state.disciples.some(d => d.loyalty < 50)) {
    pool = pool.filter(e => e.id !== 'betrayal');
  }
  // 弟子顿悟需要有可突破的弟子（等级未达资质上限）
  if (!state.disciples.some(d => d.level < d.talent)) {
    pool = pool.filter(e => e.id !== 'breakthrough');
  }
  const totalWeight = pool.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * totalWeight;
  for (const evt of pool) {
    r -= evt.weight;
    if (r <= 0) return { ...evt };
  }
  return { ...pool[pool.length - 1] };
}

// ===== 弟子生成 =====

let _nextDiscipleId = 1;
export function resetDiscipleIdCounter(maxId = 0) { _nextDiscipleId = maxId + 1; }

/** 生成一名新弟子 */
export function createDisciple(opts = {}) {
  const talent = opts.talent || (1 + Math.floor(Math.random() * 4)); // 1-4 默认
  const name = opts.name || randomChineseName();
  const weaponId = opts.weaponId || WEAPON_IDS[Math.floor(Math.random() * WEAPON_IDS.length)];
  const color = opts.color || DISCIPLE_COLORS[Math.floor(Math.random() * DISCIPLE_COLORS.length)];

  // 随机特质（10%概率自带一个）
  let traits = opts.traits || [];
  if (traits.length === 0 && Math.random() < 0.15) {
    const t = COMMON_TRAITS[Math.floor(Math.random() * COMMON_TRAITS.length)];
    traits = [t.id];
  }

  // 天才特质提升资质上限
  const hasTalentBoost = traits.includes('genius');
  const effectiveTalent = Math.min(5, talent + (hasTalentBoost ? 1 : 0));

  return {
    id: _nextDiscipleId++,
    name,
    talent: effectiveTalent,
    level: 1,
    exp: 0,
    loyalty: opts.loyalty ?? (60 + Math.floor(Math.random() * 30)),
    stamina: 100,
    injury: 0,
    weaponId,
    weaponQuality: 'normal',
    armorId: 'none',
    armorQuality: 'normal',
    color,
    traits,
    personality: opts.personality || randomPersonality(),
    wins: 0,
    losses: 0,
    joinDay: opts.joinDay || 1,
    onQuest: false, // 是否在执行任务
    trainingMode: 'normal', // 训练档位: rest|normal|intense|extreme
  };
}

/** 弟子升级所需经验 (每级约3-5天全力训练可升，给玩家充足成长感) */
export function expToLevel(currentLevel) {
  return [0, 100, 260, 520, 1000][currentLevel - 1] || 9999;
}

/** 宗门名称池 */
const SECT_NAMES = [
  '青云门', '太虚宫', '烈焰堂', '寒冰谷', '幽冥阁',
  '天剑派', '龙虎山', '碧水庄', '铁拳帮', '飞雪门',
  '紫霄宫', '玄武堂', '凤凰台', '苍狼寨', '白鹤观',
  '逍遥阁', '凌云宗', '武当派', '少林寺', '峨眉派',
];

export function randomSectName() {
  return SECT_NAMES[Math.floor(Math.random() * SECT_NAMES.length)];
}

// ===== 初始状态 =====
export function createInitialState() {
  resetDiscipleIdCounter(0);
  const sectName = randomSectName();
  // 初始3个弟子
  const d1 = createDisciple({ talent: 2, loyalty: 80, joinDay: 1 });
  const d2 = createDisciple({ talent: 1, loyalty: 75, joinDay: 1 });
  const d3 = createDisciple({ talent: 2, loyalty: 70, joinDay: 1 });
  return {
    version: 1,
    sectName,
    day: 1,
    phase: 'morning', // morning | noon | night
    gold: 500,
    fame: 0,
    disciples: [d1, d2, d3],
    buildings: {
      dojo: 1, smith: 0, library: 0, clinic: 0,
      inn: 0, barracks: 1, bank: 0, tower: 0,
    },
    quests: [],           // 当前可选任务（每天刷新）
    activeQuests: [],     // 进行中的任务
    inventory: [],        // 装备库存 [{type, id, quality}]
    shop: { items: [], refreshDay: 0 }, // 宗门商店 {items:[{...poolItem,sold}], refreshDay}
    log: [],              // 事件日志（最近30条）
    stats: {
      totalDays: 0,
      totalFights: 0,
      totalWins: 0,
      totalGold: 0,
      highestFame: 0,
      totalTrains: 0,
      totalQuests: 0,
      talentScrollsUsed: 0,
      shopBuys: 0,
    },
    achievements: [],  // 已解锁成就ID列表
    leaderId: null,      // 领头弟子ID
    pendingEvent: null,  // 当前待处理事件
    pendingFightResult: null, // 战斗观看结果
    storyProgress: [],  // 已触发的剧情ID列表
    pendingStory: null, // 当前待显示的剧情
  };
}

// ===== 声望阶段系统 =====
export const FAME_TIERS = [
  { fame: 0,   label: '无名小卒', color: '#888888' },
  { fame: 20,  label: '初出茅庐', color: '#44dd88' },
  { fame: 50,  label: '江湖知名', color: '#4499ff' },
  { fame: 100, label: '一方豪强', color: '#ffaa44' },
  { fame: 150, label: '威震武林', color: '#ffdd00' },
  { fame: 250, label: '武林盟主', color: '#ff88ff' },
];
export function getFameTier(fame) {
  let tier = FAME_TIERS[0];
  for (const t of FAME_TIERS) {
    if (fame >= t.fame) tier = t;
    else break;
  }
  return tier;
}

// ===== 宗门商店商品池 =====
export const SHOP_POOL = [
  { id: 'shop_fine_weapon',  name: '精良兵器',  icon: '⚔',  type: 'weapon',     quality: 'fine',   cost: 800,  fameReq: 0,   desc: '精锻武器，提升弟子战力' },
  { id: 'shop_rare_weapon',  name: '罕见宝刃',  icon: '⚔',  type: 'weapon',     quality: 'rare',   cost: 2500, fameReq: 50,  desc: '极品利器，威力惊人' },
  { id: 'shop_fine_armor',   name: '精良护甲',  icon: '🛡',  type: 'armor',      quality: 'fine',   cost: 600,  fameReq: 0,   desc: '坚固护甲，减少受伤' },
  { id: 'shop_rare_armor',   name: '罕见宝甲',  icon: '🛡',  type: 'armor',      quality: 'rare',   cost: 2000, fameReq: 80,  desc: '传世宝甲，防御无双' },
  { id: 'elixir_heal',       name: '回春丹',    icon: '💊',  type: 'consumable', effect: 'healAll', cost: 400,  fameReq: 0,   desc: '全员伤势-50点' },
  { id: 'elixir_body',       name: '淬体丹',    icon: '⚗',  type: 'consumable', effect: 'hpBonus', cost: 600,  fameReq: 20,  desc: '弟子气血永久+10%' },
  { id: 'talent_scroll',     name: '资质秘籍',  icon: '📜',  type: 'consumable', effect: 'talentUp',cost: 5000, fameReq: 60,  desc: '突破弟子资质上限+1' },
  { id: 'recruit_order',     name: '招募令',    icon: '📋',  type: 'consumable', effect: 'recruitElite', cost: 3000, fameReq: 100, desc: '立即招募资质4+弟子' },
  { id: 'martial_tome',      name: '武林秘典',  icon: '📖',  type: 'consumable', effect: 'traitAll',cost: 8000, fameReq: 150, desc: '所有弟子获得一个特质' },
];

/**
 * 每日刷新商店：按声望门槛过滤，随机选3件（不重复）
 * 装备类各选一种武器 + 一种护甲（随机品质），其余随机补够3件
 */
export function refreshShopItems(state) {
  const fame = state.fame;
  // 过滤掉未解锁的商品
  const available = SHOP_POOL.filter(p => fame >= p.fameReq);
  if (available.length === 0) return [];

  // 分组：武器/护甲/消耗品
  const weapons   = available.filter(p => p.type === 'weapon');
  const armors    = available.filter(p => p.type === 'armor');
  const consumables = available.filter(p => p.type === 'consumable');

  const picks = [];
  const used  = new Set();

  function pickRandom(pool) {
    const pool2 = pool.filter(p => !used.has(p.id));
    if (!pool2.length) return null;
    const item = pool2[Math.floor(Math.random() * pool2.length)];
    used.add(item.id);
    return { ...item, sold: false };
  }

  // 保证：1件武器类 + 1件护甲类（如果有的话）
  if (weapons.length > 0) picks.push(pickRandom(weapons));
  if (armors.length > 0)  picks.push(pickRandom(armors));

  // 剩余名额从全池中随机补
  const remaining = [...weapons, ...armors, ...consumables];
  while (picks.length < 3) {
    const item = pickRandom(remaining);
    if (!item) break;
    picks.push(item);
  }

  return picks.filter(Boolean);
}

// ===== 剧情/故事系统 =====
// 按触发条件排列的故事节点，每个只触发一次
export const STORY_NODES = [
  {
    id: 'intro',
    trigger: s => s.day === 1 && s.storyProgress.length === 0,
    title: '宗门初立',
    pages: [
      '江湖动荡，群雄逐鹿。你受恩师遗命，于乱世中重建{sect}。',
      '如今门下仅有三名弟子，经费拮据，前路漫漫。',
      '恩师临终前说：「先把弟子练好，根基牢固方可成大事。」',
      '💡 提示：点击「训练弟子」提升弟子实力，训练完成后点击「进入下一天」推进时间。',
    ],
  },
  {
    id: 'day2_buildings',
    trigger: s => s.day >= 2 && !s.storyProgress.includes('day2_buildings'),
    title: '门派建设',
    pages: [
      '经过一天苦训，弟子们已有些长进。',
      '巡视门派四周，许多设施年久失修，需要修缮和扩建。',
      '💡 现已解锁「建造设施」。升级练武场可提高训练效率，升级校场可容纳更多弟子。',
    ],
  },
  {
    id: 'day3_quests',
    trigger: s => (s.day >= 3 || Object.values(s.buildings).some(v => v > 1)) && !s.storyProgress.includes('day3_quests'),
    title: '初涉江湖',
    pages: [
      '门派小有规模，附近村庄听闻你的名号，纷纷前来求助。',
      '山贼横行、镖车遭劫，这些都是弟子历练的好机会。',
      '💡 现已解锁「派遣任务」。选择合适的弟子出战，胜利可获得银两、声望和经验。注意敌方难度，量力而行！',
    ],
  },
  {
    id: 'first_win',
    trigger: s => s.stats.totalWins === 1 && !s.storyProgress.includes('first_win'),
    title: '初露锋芒',
    pages: [
      '首战告捷！弟子凯旋归来，门派上下欢欣鼓舞。',
      '江湖中开始有人谈论{sect}的名号，虽然还不算响亮，但这是个好的开始。',
      '继续派遣弟子完成任务，积累声望。声望越高，吸引的人才越优秀。',
    ],
  },
  {
    id: 'first_loss',
    trigger: s => s.stats.totalFights - s.stats.totalWins >= 1 && s.stats.totalWins === 0 && !s.storyProgress.includes('first_loss'),
    title: '一败涂地',
    pages: [
      '弟子负伤而归，全门上下士气低落。',
      '你想起恩师的话：「败不可怕，怕的是不知道为何而败。」',
      '💡 弟子等级越高战力越强。多训练几天、升级练武场，再去挑战低难度任务。',
    ],
  },
  {
    id: 'spar_unlock',
    trigger: s => (s.day >= 4 || s.stats.totalFights > 0) && !s.storyProgress.includes('spar_unlock'),
    title: '以武会友',
    pages: [
      '弟子们训练之余，摩拳擦掌想要一较高下。',
      '你决定在门内设立擂台，让弟子切磋武艺、取长补短。',
      '💡 现已解锁「门派擂台」。切磋不会造成重伤，但能获得经验并观看精彩对战。',
    ],
  },
  {
    id: 'fame_30',
    trigger: s => s.fame >= 30 && !s.storyProgress.includes('fame_30'),
    title: '声名鹊起',
    pages: [
      '{sect}的名号在江湖中逐渐传开，隔壁武馆感受到了威胁。',
      '有人带来消息：周边门派开始注意到你们，既有善意也有敌意。',
      '未雨绸缪，升级望楼可解锁更高级的任务，升级客栈则能吸引更多人才。',
    ],
  },
  {
    id: 'fame_100',
    trigger: s => s.fame >= 100 && !s.storyProgress.includes('fame_100'),
    title: '名震一方',
    pages: [
      '{sect}声望已达百分，在本地已是一方豪强。',
      '各路英雄纷纷来访，既有切磋的，也有挑战的。',
      '江湖之路才走了一半，若要称雄武林，声望还需更上一层楼。',
    ],
  },
  {
    id: 'disciples_6',
    trigger: s => s.disciples.length >= 6 && !s.storyProgress.includes('disciples_6'),
    title: '人才济济',
    pages: [
      '门下弟子已有六人之多，{sect}日益壮大。',
      '弟子多了，管理也要跟上。留意每个弟子的忠诚度和伤势，适时关怀。',
      '忠诚低于50的弟子可能会心生不满，必要时花些银两安抚。',
    ],
  },
  {
    id: 'gold_2000',
    trigger: s => s.gold >= 2000 && !s.storyProgress.includes('gold_2000'),
    title: '家底渐厚',
    pages: [
      '门派金库已有两千银两，终于不再捉襟见肘。',
      '是时候大兴土木了——升级钱庄可获得每日被动收入，让财源滚滚而来。',
    ],
  },
  {
    id: 'day_10',
    trigger: s => s.day >= 10 && !s.storyProgress.includes('day_10'),
    title: '十日回首',
    pages: [
      '转眼间门派已立十日，回首往事，感慨万千。',
      `目前战绩 ${0}胜${0}负，声望${0}，弟子${0}人。`,  // 占位，运行时替换
      '江湖路远，但{sect}的传奇才刚刚开始。',
    ],
    dynamicPage: 1, // 标记第2页需要运行时替换
  },
  {
    id: 'day_30',
    trigger: s => s.day >= 30 && !s.storyProgress.includes('day_30'),
    title: '月余长歌',
    pages: [
      '一个月过去了，{sect}从无名小派成长至今，江湖中已有了一席之地。',
      '恩师若泉下有知，定会欣慰。但你知道，真正的武林之路，才刚刚开始……',
      '（更多剧情开发中…感谢游玩！）',
    ],
  },
];

/** 检查是否有剧情需要触发，返回第一个匹配的剧情节点或null */
export function checkStoryTrigger(state) {
  for (const node of STORY_NODES) {
    if (state.storyProgress.includes(node.id)) continue;
    try {
      if (node.trigger(state)) return node;
    } catch { /* 忽略 */ }
  }
  return null;
}

// ===== 弟子个性系统 =====
export const PERSONALITY_TYPES = {
  hotblood: { id: 'hotblood', name: '热血', icon: '🔥', color: '#ff6644', desc: '充满斗志，永不服输' },
  calm:     { id: 'calm',     name: '沉稳', icon: '🌊', color: '#5599ff', desc: '气定神闲，深藏若虚' },
  tsundere: { id: 'tsundere', name: '傲娇', icon: '✨', color: '#ff44aa', desc: '嘴硬心软，死撑到底' },
  cunning:  { id: 'cunning',  name: '腹黑', icon: '🌙', color: '#aa66ff', desc: '算计精深，胸有成竹' },
  airhead:  { id: 'airhead',  name: '天然', icon: '🌸', color: '#44ddaa', desc: '无忧无虑，天真烂漫' },
  diligent: { id: 'diligent', name: '刻苦', icon: '⚡', color: '#ffcc44', desc: '勤奋踏实，持之以恒' },
};
export const PERSONALITY_LIST = Object.values(PERSONALITY_TYPES);
export function randomPersonality() {
  const keys = Object.keys(PERSONALITY_TYPES);
  return keys[Math.floor(Math.random() * keys.length)];
}


// ===== 训练档位系统 =====
export const TRAINING_MODES = {
  rest:    { id: 'rest',    name: '休养', icon: '🌙', stamina: 50,  exp: 0,  risk: 0,    loyaltyMod: 0,  desc: '养精蓄锐，恢复体力' },
  normal:  { id: 'normal',  name: '日常', icon: '📖', stamina: 10,  exp: 12, risk: 0,    loyaltyMod: 0,  desc: '日常修炼，稳步提升' },
  intense: { id: 'intense', name: '强化', icon: '⚔',  stamina: -20, exp: 25, risk: 0,    loyaltyMod: 0,  desc: '加强训练，消耗体力' },
  extreme: { id: 'extreme', name: '极限', icon: '🔥', stamina: -45, exp: 40, risk: 0.10, loyaltyMod: -1, desc: '拼命苦练，有受伤风险' },
};
export const TRAINING_MODE_ORDER = ['rest', 'normal', 'intense', 'extreme'];

// ===== 领头弟子加成 =====
export const LEADER_BONUSES = {
  hotblood: { name: '热血鼓舞', desc: '全队经验+10%，受伤风险+5%', teamExpMul: 0.10, teamRiskAdd: 0.05 },
  calm:     { name: '沉稳统率', desc: '全队受伤风险减半',          teamRiskMul: 0.5 },
  tsundere: { name: '不甘示弱', desc: '忠诚低于领头的弟子经验+15%', condExpMul: 0.15 },
  cunning:  { name: '暗中谋划', desc: '训练获得特质概率+10%',      traitChanceAdd: 0.10 },
  airhead:  { name: '天然感染', desc: '全员忠诚每日+1',            teamLoyalty: 1 },
  diligent: { name: '以身作则', desc: '全队体力消耗-5',            teamStaminaSave: 5 },
};

// 台词库已迁移至 sect-dialogues.js，此处重导出保持向后兼容
export { pickTrainLine, pickGroupSpeakers, TRAIN_DIALOGUES } from './sect-dialogues.js';
