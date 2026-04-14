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
  // 弟子顿悟需要有弟子
  if (state.disciples.length === 0) {
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
  };
}

/** 弟子升级所需经验 (心流节奏：每级约2-3天自然升一级) */
export function expToLevel(currentLevel) {
  return [0, 60, 150, 300, 600][currentLevel - 1] || 999;
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

// ===== 训练台词库 (共1020条) =====
export const TRAIN_DIALOGUES = {

  // ——— 热血型 (171条) ———
  hotblood: [
    "再来！身上还有力气！","这点训练算什么，根本不够！","今天的汗水是明天胜利的种子！",
    "嘿！使出全力！","浑身是劲，停不下来！","血脉喷张，这才叫练武！",
    "加速！更快！再快一点！","什么叫累？只要有一口气就练！","对！就是这感觉，燃起来了！",
    "全力出击！不推到极限不算数！","今天要把这招练一千遍！","哈——！爆发！",
    "脑子里只有一件事：变强！","热血沸腾！今天一定要超越自己！","没有最强，只有更强！",
    "越打越有劲儿，停下来才难受！","嘿呀！把力气全释放出来！","汗水算什么，只要能变强！",
    "今天要把这姿势练到本能反应！","战斗欲望满满，快让我出去战斗！",
    "一鼓作气，不能停！","燃！就是这个字！","想到能变强，就感觉充满力量！",
    "什么叫疲劳？我不认识这词！","哈哈哈！累并快乐着！","拼了！豁出去练！",
    "全身的细胞都在沸腾！","每次突破极限，感觉整个人都变了！","要赢！一定要赢！",
    "力量、速度、耐力，全面提升！","感觉自己要飞起来了！","今天目标：把昨天的自己打倒！",
    "嗬！这一招终于顺了！","肌肉的酸胀感，这才是进步的证明！","不达目标不收手！",
    "我要成为这里最强的！","再撑一下，就再撑一下！","力量速度精准，三者合一！",
    "今天要破自己的纪录！","全力以赴，没有保留！","热血沸腾的感觉，太爽了！",
    "这种燃烧的感觉就是我最爱的！","今天的对手只有自己！","绝不服输！哪怕是对自己！",
    "每一拳都要打出灵魂！","身体在极限，但意志不倒！","每滴汗水都是勋章！",
    "今天要把这套拳法打穿！","气贯长虹！向前冲！","全力冲刺！不看终点！",
    "嘿哈！这才是练武的滋味！","练武就要练到浑然忘我！","汗流浃背，感觉太好了！",
    "我不需要休息，只需要更强！","别废话，练就是了！",
    "什么痛苦都是暂时的，实力是永久的！","今天的苦是明天胜利的铺垫！",
    "继续！不许停！","进攻！再进攻！一直进攻！","这股子气劲，谁也别想压住！",
    "脸红脖子粗，这才是卖力训练！","今天能多练一招，明天就少受一刀！",
    "浑身的能量，全给我喷出来！","什么手脚酸，那是进步的感觉！",
    "今天状态特别好！","风雨无阻，雷打不动，天天练！","再来一遍！再来一万遍！",
    "我就是为战斗而生的！","嗬！这套剑法今天一定要融会贯通！",
    "加油！冲！冲！冲！","来啊！谁来跟我较量一下！","挡不住我的步伐！",
    "技艺是磨出来的，不是天生的！","再痛也没关系，能变强就值得！",
    "今天一定要比昨天厉害！","越难越有意思！越难越要练！",
    "不就是极限嘛！专门用来突破的！","铁打的意志，钢铸的筋骨！",
    "今天的疲倦，明天变成力量！","身上还有余力，不能停！",
    "越练越觉得还不够！","我会成为最强的那个！不管要多久！",
    "嗬！发现了新的感觉！","不管结果如何，先全力以赴！",
    "昨天的伤痛，今天变成了动力！","这种感觉，真的太爽了！",
    "给我时间，我一定变得无敌！","哈！踢腿终于踢高了！",
    "每一滴汗水都在为胜利铺路！","再来！！！","就算全身酸透，也不许停！",
    "冲！冲！冲！","疼？很好，说明在长进！","打！不停地打！",
    "哪个对手挡得住我的势头？！","我要让所有人都刮目相看！",
    "嗬！今天突破了新高度！","热情一旦点燃，就停不下来！",
    "今天不练够，明天别起床！","嘿——嗬——哈——！",
    "力量来自内心的渴望！","不熟悉就继续练！练到熟！",
    "胸中的火焰，烧不尽！","我只认输给比我强的人，现在还没有！",
    "有种，就跟我一起练到天亮！","使劲！别藏着掖着！",
    "疲惫是弱者的借口，强者没有这个词！","一往无前，直上云霄！",
    "来，谁最后一个累趴？！","每次挥拳，都比上次用力一分！",
    "无论如何，今天就要掌握这一招！","努力不够的话，再加把劲！",
    "用全部的热情投入训练！","今天把这套步伐走到闭眼都顺！",
    "嗯哈！身体越来越灵活了！","师父说得没错，炼体的苦才是成长的甜！",
    "不怕苦，就怕练得不够！","嘿！感觉越来越难以置信了！",
    "冲啊！今天就要破记录！","铁血意志！不认输！",
    "今天的训练量，是昨天的两倍！","哦哦哦！居然做到了！",
    "越战越勇！这才是我的风格！","力量！给我更多力量！",
    "好久没这种感觉了，爽！","喝！发力！","来，谁来挑战我！",
    "收不住的冲劲，拦不住的热情！","每天都在进步，每天都在变强！",
    "哈！不疯魔不成活！","嗯！这招频率终于对了！",
    "没什么能阻止我前进的脚步！","今天要感动自己！",
    "再加十组！","最强！我要成为最强！","就算骨头断了也要继续练的那种！",
    "一天不练手生，一周不练全废！","今天用掉多少体力就是多少成长！",
    "爆！我要爆发！","武道这条路，我走定了！",
    "哼哼！到底差哪了，反复练！","再来一遍好了，感觉还没到位！",
    "嘿！那个招式刚才用对了！","腿，腿！高一点！高一点！",
    "心跳加速，热血沸腾，这就是练武！","哈哈！今天进步幅度比昨天大！",
    "打到全身颤抖为止！","喘着气也要把最后一招打完！",
    "嗯！气息连上了！","今天的苦，下次实战就少挨打！",
    "拼命……再拼命一点……！"],

  // ——— 沉稳型 (171条) ———
  calm: [
    "呼……一吸一呼之间，气随心走。","外练筋骨皮，内练精气神。","练武之道，急不得。",
    "静心，才能快剑。","身法需从根基练起，急不来。","气沉丹田，稳住心神。",
    "慢即是快，厚积而薄发。","今天悟到了一点新东西。","凡事欲速则不达。",
    "把每个动作做扎实，比练一百遍草率的强。","力从地起，劲达指梢。",
    "习武如流水，柔中带刚。","无论结果如何，先把今天的功课做完。",
    "呼吸是第一步，呼吸乱了，一切都乱了。","静如止水，动如雷霆。",
    "每次训练，都是在与自己对话。","不争一时之快，积年累月方见真章。",
    "剑气于内，身形于外，二者合一。","武道无止境，步步为营。",
    "今日之练，他日之用。","沉住气，练下去。",
    "心若静，则万法皆清。","练武不只练身，更练心。",
    "今天把每一个细节都想清楚了。","刀剑无情，练武须有情。",
    "速度与力量，皆从沉稳中来。","基础不牢，高处不胜寒。",
    "千锤百炼，才能炉火纯青。","练一遍有心得，比练十遍无所得强。",
    "水滴石穿，非一日之功。","呼……出招，收势，保持节奏。",
    "武功到了一定境界，靠的不是力气，是悟性。","悟道非一时，但每日的积累不可少。",
    "步步稳健，不急于求成。","今天有什么不懂的，慢慢想。",
    "练武也是修身，修身也是练武。","笑看风云，心中有数。",
    "把每一步都走得踏实，自然到达高处。","沉默地练，默默地进步。",
    "凝神聚力，方能一举中的。","今天有个动作还不够圆融，再想想。",
    "练武之人，心境最重要。","一呼一吸，皆有法度。",
    "扎马步，练内息，一步一步来。","修身如磨剑，磨久自然利。",
    "刚中带柔，柔中藏刚。","不慌不忙，自有分寸。",
    "内外兼修，才算真功夫。","每次呼吸之间，感受力量在流动。",
    "疾风知劲草，乱世方成大器。","有时候停下来想，比一味苦练更有用。",
    "今天的训练质量，胜过昨天。","外表平静，内心如火。",
    "悟到了一点：出招时机，比出招速度更重要。","以静制动，以慢打快。",
    "功夫在诗外，也在日常的每一次用心练习里。","练武无捷径，只有扎实。",
    "凡事不强求，顺势而为。","今天把气息调顺了，感觉一切都对了。",
    "力量并非来自肌肉，而是来自意志。","有所取舍，方能精进。",
    "韬光养晦，厚积薄发。","慢慢说慢慢想，反正不急。",
    "今天有进步，虽然看起来不明显，但我知道。","每次呼吸，都是对武道的一次理解。",
    "不轻浮，不懈怠，稳步向前。","心如明镜，动作自然干净。",
    "以柔克刚，这才是高境界。","把每一次挥剑都当作最后一次，用心感受。",
    "放松，反而更有力量。","今日种因，他日结果，自然而然。",
    "天下武功，唯快不破？不，唯心不乱。","松而不懈，紧而不僵。",
    "今天悟到了：步法决定一切。","武道如棋，需要全局观。",
    "每个呼吸都是修炼，每个脚步都是积累。","急于求成是大忌。",
    "整理思绪，把今天的练习梳理一遍。","沉得住气的人，才能走得更远。",
    "无论对手多强，先把自己做好。","练武者须先练气，气定才能神闲。",
    "对自己诚实，今天哪里做得不够好。","武功不是靠蛮力，是靠悟性和积累。",
    "慢下来，感受每一个动作的细节。","今天把呼吸练顺了，感觉身体更整了。",
    "步伐稳，出招才稳。","把今天的心得记在心里。",
    "细水长流，绵绵不绝。","磨剑不用急，磨好了自然锋利。",
    "训练的目的是让身体记住，而不只是大脑记住。","今日之练习，点滴皆是财富。",
    "不需要喧嚣，静静地进步就好。","凝聚内力，一气呵成。",
    "每次训练都是一次对自我的审视。","行云流水，不强求，不执念。",
    "悟到了：力量的来源是稳定，不是爆发。","沉静是最好的武器。",
    "把基础练扎实，其他的自然水到渠成。","年复一年，日复一日，终将有所成。",
    "出招不在快慢，在于恰当的时机。","今天把这个难点想清楚了，进步了。",
    "挥出去的剑，要有去有回，完整流畅。","练武是修行，修行是一生的事。",
    "气定神闲，自然无往不利。","让身体记住正确的感觉，比死记招式更重要。",
    "今天进步了一点点，明天再进步一点点。","沉默地坚持，是最有力的回答。",
    "外部的嘈杂不重要，内心的平静才是真正的力量。","用心去理解每一招的原理。",
    "修身是长途旅行，不用担心速度，只要方向对。"],

  // ——— 傲娇型 (171条) ———
  tsundere: [
    "哼，今天只是随便练练而已。","别误会，我才没有认真呢……才怪！",
    "这点程度，本来就是小菜一碟。","才没有努力！……好吧，稍微努力了一下。",
    "哼！你不用担心我，我自己会处理的。","别看了！我只是热身而已！",
    "我只是碰巧来练习的，不是因为想进步什么的！","哼，这种程度我早就掌握了……大概。",
    "才不是因为想变强……咳，好吧，算是吧。","别想太多！我只是不甘心输而已！",
    "嗯哼，这招嘛……早就会了好吧。","站什么站，继续练！又没叫你看！",
    "这招有点难？绝对不是，我只是在思考。","哼，今天就算是陪你们练好了。",
    "不要以为我累了！我……只是呼吸急促了一点。","这套都练会了吧？呵，当然，本来就简单。",
    "哼，才不是被你激励到了。","真麻烦……不过既然练了，就练好吧。",
    "谁说我喜欢练武了？就是路过而已。","哼，好不容易才……才练会的。",
    "别夸我！……可以再夸一次吗？","这招我早就掌握了，现在只是温习。",
    "说什么都好，反正我不是最差的那个！","哼！凭什么你比我进步快？！再练！",
    "练这个说难也不难……说容易也不怎么容易。","哼，我只是不想拖累大家而已。",
    "今天状态不好，所以发挥得差，不代表平时也这样！","我不需要鼓励！……谢谢。",
    "才不是因为输了才要拼命练，是因为想赢。","哼，你能做到的，我当然也能做到。",
    "这种程度的训练……也就那样吧，不算什么。","谁说我在气喘！这是深呼吸！",
    "别来打扰我，我在专心练着呢。","嗯，达到要求了……才刚刚达到而已。",
    "哼，今天就算是达到目标了，下次目标再高一点好了。","我……不饿！练下去！",
    "不用担心，掌门，我知道轻重缓急。","这么简单的一招，再来一遍！再来！",
    "哼，不是吧……这样还没到位？真讨厌。","我就知道练这个会很累，但还是来了。",
    "哼，谁说我做不到来着？给我记住，我什么都能做到！","再难的事也难不倒我，哼！",
    "这招……我懂了，但我不告诉你怎么做到的。","哼，要练就认真练，别三心二意。",
    "才没有！我从来不会喊苦的！……才没有在喊苦。","稍微努力了一点点……就只是一点点。",
    "我一直都在认真的！就算表面上看起来没在认真！","哼，这种训练量，我有点看不上。",
    "嗯好吧……这招还挺难的，我得多练几遍。","才不是在表现给谁看，就是想练熟而已。",
    "哼，今天的练习……还可以吧，就这样。","不要过来！我自己练！",
    "哼哼，这一招终于对了，但我不高兴。","这点挑战就想打倒我？哼，太天真了。",
    "我不是在努力！……只是……在很认真地随便练一下。","哼，你今天比昨天差，认真点！",
    "再看一遍动作，然后自己研究，不需要帮助。","比你厉害的感觉……哼，就这样。",
    "才不是因为受到刺激才拼命练的，就是凑巧。","哼，这套路其实……其实还蛮有意思的啦。",
    "我是不会说难的。就算内心这么觉得。","这个动作难是难，但难得过我的意志吗？哼！",
    "哼，总算找到感觉了，迟了点，但找到了。","再来一遍……不是因为没练好，只是想多练。",
    "这个姿势要保持多久？……哼，无所谓。","练！无论如何先练着！",
    "哼，今天的汗水可以了，该结束了。","随便啦，反正我练得比你好。",
    "哼，师父说什么就做什么，才不是因为怕他。","凭什么他练起来比我好看？！我再练一遍！",
    "才不会承认我其实很享受训练……绝对不会……嗯。","哼，你们继续练，我比你们都快练完了。",
    "这招不好看……我帮我自己改一下，好了，这样更好！","哼，输了一次不代表什么，下次不会了。",
    "不需要鼓励！但如果你要说的话，我听着。","哼，汗水这种东西，流了就流了，无所谓的。",
    "才没有在拼命呢！这只是正常水平的发挥！","再练一遍就够了……好，再一遍……再，一遍。",
    "哼，总要有个人练得最好对吧，那就是我了。","嗯哼，难不倒我！虽然有点难。",
    "才不是练给别人看的……哼，自己练自己的。","这招掌握了！哼，说什么来着，说我做不到？",
    "哼，这种程度的训练根本不算什么，本小姐/公子可以轻松应付。","才，才练出汗来了……哼，这正常。",
    "不能输！绝对不能输！哼！","哼，谁说我放弃了？就算躺下来也只是躺一秒！",
    "不是吧，这才几招就累了？……我也一样啦。哼。","这招要练多少遍才算好……哼，我练到自己满意为止！",
    "才没有看你是怎么练的……就是不小心瞄了一眼。","哼，好，今天就到这里，明天继续超越你！",
    "越来越好了……哼，当然，本来就该这样。","才不是第一次练对呢……是第一次练出感觉来了！",
    "哼！练武就练武，干嘛要说那么多。","我的极限在哪里？哼，还没到呢！", 
    "哼，疲倦了？疲倦是什么？没听过。","认真了，所以才这么汗……只是认真。",
    "你可以输，我不可以。哼！",
    "……好，就这个感觉，不说了，练！",
    "哼，不是我不会，是还没放开练。"],

  // ——— 腹黑型 (171条) ———
  cunning: [
    "每一滴汗水，都是将来胜利的筹码。","呵，体力消耗是暂时的，实力积累是永久的。",
    "……在观察自己的破绽。","了解自己的弱点，比了解对手的弱点更重要。",
    "嗯，把这一招再细化一下，以后用得上。","用力，但不要让人看出你在用力。",
    "慢慢的，不急。积累终会爆发。","把每一次训练当成战场上的预演。",
    "了解自己，才能了解对手。","呵，感情用事是最大的漏洞。",
    "力量和智慧同等重要，两者缺一不可。","把身体练成工具，然后把工具磨利。",
    "表面看起来不努力的人，往往最努力。","嗯，这个动作还有优化空间。",
    "不用说话，用结果说话就好。","把这一套流程熟悉到本能，就是最好的武器。",
    "每一次训练，都是对自己潜力的一次开发。","嗯，分析一下今天哪里做得好，哪里要改。",
    "把技巧练到无懈可击，才是真正的实力。","呵，所谓极限，不过是还没有找到方法突破罢了。",
    "积累，然后在关键时刻爆发，这才是策略。","一直在练，一直在想，两者同步进行。",
    "了解对手的弱点，从了解自己的弱点开始。","把每个动作练到不需要思考就能做出来。",
    "嗯，把某些动作组合起来，效果更好。","看起来简单，做起来不简单。",
    "感知一下整体节奏，找到最优化的出招时机。","呵，急于求胜的人容易露出破绽。",
    "稳定比爆发更有价值。","今天发现了一个以前没注意的细节。",
    "嗯，这招如果加上步法变化，会让对手更难判断。","身体的记忆是最可靠的，要让每个动作都变成本能。",
    "把对手可能的应对方式一一想过，然后找反制。","呵，韬光养晦，时机已到则一鸣惊人。",
    "把今天的练习结果整理一遍，留在心里。","嗯，把目标分解成小步骤，一步一步完成。",
    "看起来随意，但每个动作都有目的。","呵，这招的关键不在力量，在时机。",
    "把每一次失误都记在心里，作为以后的教训。","嗯，今天把这个难点解决了，离完美更近一步。",
    "技巧加上谋略，才是真正的强者。","嗯，保持住这个状态，不要有太大波动。",
    "修炼内功，掌控场面。","呵，知道自己要什么的人，走得最快。",
    "把武功当成语言，对敌时一字一句都要有深意。","今天把技术精度提高了一分，很好。",
    "嗯，即使是训练，也要考虑效率。","预判，是比速度更高级的能力。",
    "把力量用在刀刃上，不要浪费每一滴精力。","呵，越是枯燥的训练，越磨出真实力。",
    "嗯，把破绽都填补掉，一个都不留。","细节决定成败，把细节练到极致。",
    "呵，总有人以为我没在努力。这很好。","把每次训练视为一场需要复盘的战役。",
    "嗯，今天把某个旧习惯改了，长期看是好事。","功夫从不辜负钻研，深下去就有收获。",
    "呵，把内心的焦虑化为动力，继续练。","今天分析了一个对手可能用的招式，学会了反制。",
    "把对立面的思路也研究一遍，更加全面。","嗯，掌控好了自己的节奏，感觉不错。",
    "呵，把明显的威胁隐藏起来，让人捉摸不透。","不是所有的进步都看得见，很多是在内部悄悄发生的。",
    "嗯，这招用在某个特定格局里，效果会翻倍。","让自己无懈可击，是最好的进攻。",
    "呵，把今天的弱点全部记下来，慢慢改良。","稳扎稳打，步步为营。",
    "嗯，研究了一下重心变化，有新发现。","细水长流，从不中断。",
    "呵，真正的强者不需要表现，只需要结果。","把今天所有的动作拆解分析，找到最优解。",
    "嗯，这招的核心是……思路有了，继续练。","把多余的动作减掉，才是精进。",
    "呵，深层次的东西，慢慢研究。","控制力很重要，不能只想着暴力解决。",
    "嗯，今天把这个难点搞通了，心情不错。","呵，能做到胸有成竹然后出手，那就无败之地了。",
    "把目标拆解，逐一攻克，才是高效。","嗯，今天的状态比昨天好，继续保持。",
    "不要被情绪影响，冷静才能精准。","呵，把一切都烂熟于心，然后忘掉，让身体去记。",
    "今天这部分练深了一点，收获不少。","嗯，把刚才那个破绽修复了，很好。",
    "呵，力量只是基础，运用才是艺术。","把能力积累到深处，关键时刻一击必中。",
    "嗯，把不同招式之间的衔接练顺了。","呵，太明显了，对手一眼就能看出来，还要改。",
    "了解自己每一条优势和劣势，才能趋利避害。","嗯，把这几个细节都打磨好了，满意。",
    "呵，有价值的东西都需要时间打磨。","把今天的领悟消化，内化成自己的东西。",
    "嗯，已经把这条路大致规划好了，继续走。"],

  // ——— 天然型 (171条) ———
  airhead: [
    "咦？今天的空气好像有点甜？","呀！差点又踩到自己的脚了。","练武的时候肚子好容易饿哦……",
    "这一招叫什么名字来着？……啊，想起来了！","嗯嗯嗯！这个动作好像比昨天好一点点！",
    "咦，汗水怎么流到眼睛里了，好咸！","我今天有没有进步呢？感觉有哦！",
    "啊！刚才那一下踢到石头了……哎，没关系啦。","为什么要练武？啊，好像是为了变强！",
    "咦，这招的名字好难记，叫……叫什么来着？","练到这里，感觉身体轻飘飘的，好神奇！",
    "呀！刚才那一招做到了！耶！","今天的云好好看，练武的时候多看两眼好了。",
    "嗯！这个姿势，感觉……感觉有点像在飞！","哇！出汗了出汗了！说明进步了对吗？",
    "呀，忘了刚才数到几了，那就从一开始吧！","咦，练武原来这么有趣的啊？",
    "嗯……这一步迈出去感觉怪怪的，再试一遍！","哇哇哇！这一下力量好大！吓到我自己了！",
    "啊，我能不能坐下来练……站太久腿酸。","嗯！掌门今天有没有看到我练的！","今天天气好，练武心情好！",
    "咦？这个动作需要这么转吗？脖子好酸……","练着练着，突然想到了一件好玩的事。",
    "哈欠……啊！不是困，只是打个哈欠！","啊！这招练了好多遍终于有感觉了！",
    "咦，原来这个招式是这个意思啊，突然懂了！","练武好累，但是不练也没事干~",
    "嗯嗯嗯，把这一套走完再休息一下好了。","哇！腿踢出去好高！",
    "这个训练嘛……有点意思，也有点，呃，无趣？","啊，刚才那招如果踢人的话，对方一定很痛吧。",
    "咦？练多久了？感觉脑子有点转不过来了。","嗯！感觉今天比昨天厉害了！哈哈！",
    "原来汗水这么多的啊……我要喝水！","哎，这一招总是差那么一点点，怎么回事啊。",
    "嗯！练好了今天给自己买好吃的！","哇，身体在发热，好像暖炉一样嘛！",
    "咦？这段动作我刚才好像做对了？！","哎，忘记昨天是从哪里练到哪里了，那重新来好了。",
    "今天练武，明天更帅/漂亮！哈哈！","嗯……这个出拳方向，是左还是右来着？",
    "哇，练这么久了，感觉整个人都不一样了！","咦，现在几个时辰了？感觉练了很久？",
    "哎，这么简单为什么我总是做不对啊……再来一次！","嗯！我觉得我今天特别厉害！",
    "哇，刚才那招好像很帅/好看！","咦？手感好像不对，再调整一下好了。",
    "我在想……练武是不是可以帮我吃更多饭？","呀！差点分神，快集中，集中！",
    "嗯嗯！把这个动作走一遍，然后……再来一遍！","哇，呼吸乱了，调整一下，呼——吸——呼——吸。",
    "咦，这个姿势的名字这么长，记不住啊。","哈哈！感觉自己越来越厉害了！",
    "今天练武发现了一个有意思的东西……啊，忘了，算了。","嗯，练完有好吃的等我，再撑一撑！",
    "咦！刚才踢高了！超厉害的吧！","前辈说基础很重要，那就认真练基础好了。",
    "哎，汗水流多了，需要补充能量，训练可真辛苦。","嗯嗯！这次比上次明显好多了！",
    "哇，把所有练武的人都练一个圈的话，然后……啊，没啥意思。","咦，这套路走完以后做什么？再走一遍！",
    "哈欠，不是困……好吧就算稍微困一点点，练完再睡！","嗯！我也不知道有没有进步，但感觉有！",
    "咦，昨天没有练完的那段，今天练完了！耶！","哇，力量好像大了一点点，是真的吗？",
    "练武的时候想吃饭，吃饭的时候想练武，好烦啊。","嗯嗯！这招已经懂了，换下一招！",
    "哎，这个旋转也太难了，头晕……稳住！","哇！我踢出去的那下，风声嗖嗖的！超酷！",
    "咦，练着练着想到了一件事……好了，无所谓了，练！","嗯！感觉身体比以前灵活了一点点！",
    "哎，不小心错了，没关系，重来！没什么大不了的！","嗯嗯嗯！就这个感觉，对了！",
    "哇，我今天很厉害的样子！","咦，这么练下去，我会不会变得超强？好期待啊！",
    "嗯，虽然今天有点累，但感觉还是来练比不来强。","哈哈，练武其实挺有意思的，今天心情好！",
    "啊！真没想到这个动作这么有用！","嗯，就这样啦，继续！",
    "咦，那边是什么？啊，没事，继续练！","哇，日子过得好快，一天就这样过去了，练武进步没？好像有！"],

  // ——— 刻苦型 (171条) ———
  diligent: [
    "再跑一圈，就再一圈。","昨天做不到，不代表今天做不到。","一分耕耘，一分收获。",
    "把每个细节都做到位，才是真正的进步。","今天就把这个难点攻克。","坚持下去，一定会有所收获。",
    "专注，不分心，把今天的训练做好。","每一次重复，都在积累。","不放弃，就不会失败。",
    "把昨天没完成的任务今天补上。","认真对待每一个动作，哪怕再简单。",
    "慢慢来，扎扎实实，一步一个脚印。","把基础打牢，再求提高。",
    "今天的任务：把这套练熟。","只要还能动，就继续练。",
    "今天比昨天又多练了一遍，很好。","没有什么是练不会的，只有练得不够多。",
    "重复是通往熟练的唯一道路。","今天有一点做得更好了，要保持。",
    "哪里不对就改哪里，不对劲就重来。","今天的目标达成了，再加一个小目标。",
    "把每一次训练都认真对待，这是基本的态度。","不管有没有人看，都认真练。",
    "今天有进步，哪怕只有一点。","把这个动作的细节搞清楚，再继续下一个。",
    "认真地练，踏实地积累。","不怕枯燥，枯燥里有宝贝。",
    "把身体锻炼成习惯，而不是任务。","再复习一遍，不嫌多。",
    "把今天的弱点找出来，明天重点练。","诚实面对自己的不足，然后弥补。",
    "脚踏实地，不求一步登天。","把每个基本功都做扎实，才是真本事。",
    "今天的训练质量比昨天好，满意。","做到一半，才发现另一半也很重要，都练好。",
    "把一个动作彻底练会，再学下一个。","努力了就算了吗？不，努力是起点。",
    "认真练，不偷懒，就这样。","今天感觉做到了，明天复习一下不走样。",
    "今天把这段走完，明天整理思路。","一个动作，分解到每一个细节，逐一检查。",
    "坚持，坚持，再坚持。","每次练习，都是对自己的负责。",
    "不求一次完美，但求每次都有改进。","今天的训练做完了，打算明天再多练半个时辰。",
    "把这个姿势的所有细节都搞清楚了再走。","知道哪里不够，就加力练那里。",
    "今天把这一关过了，松了口气。","明天还不知道要练什么，但今天先把今天的做好。",
    "把出剑速度提高了一点，继续。","找到了一个以前没注意的细节，改进中。",
    "认认真真，踏踏实实，一天不落。","今天又发现了一个需要改进的地方，好事。",
    "没有什么是练一遍就能会的，继续练。","今天的目标是把昨天的不足都补上。",
    "把姿势做得更标准一点，一点就够。","不浮躁，一件事一件事来。",
    "一遍不够，再来一遍。再不够，再来。","每天多进步一点点，一年后就是质变。",
    "把每一份付出都用在刀刃上，不浪费。","今天的汗水，都是实实在在的付出。",
    "专心做好一件事，这件事就是训练。","把这套动作走顺了，再提速。",
    "要知道自己哪里做得不够好，才能进步。","今天新掌握了一个要点，记好了。",
    "努力的方向要对，方向对了事半功倍。","今天有了新的感悟，把它融入练习里。",
    "踏实是根本，急躁是大忌。","把训练当作对自己的承诺，每天兑现。",
    "今天比昨天多坚持了一会儿，值得。","把最难的部分先解决，然后其他的就简单了。",
    "把枯燥的训练做出一点乐趣，才能坚持。","今天练完感觉整个人都踏实了。",
    "把今天练到的，内化成自己的东西。","铁杵磨成针，功在不舍。",
    "今天把这个要点搞清楚了，明天可以继续推进。","认真和坚持，是最简单也最强的方法。",
    "今天的训练，不急，慢慢来，做好做完。","把进步分成小块，一块一块达成。",
    "只要学得进，哪里都是课堂。","今天发现了一个小技巧，很实用。",
    "不在于练多久，在于练的质量。","今天把以前模糊的地方弄清楚了，舒坦。",
    "练习要有针对性，知道自己在练什么。","今天按计划完成了练习，很充实。",
    "把每一项练习都认真完成，一个不漏。","今天把自己push得更远了一点，明天继续。",
    "没有什么秘诀，就是重复，重复，再重复。","把每个练习的目的都搞明白，然后有的放矢。",
    "今天的练习结果，让明天的自己受益。","把基本功练到极致，那就是武学的顶峰。",
    "一行行，一步步，不急，稳着来。","今天全部做完了，告诉自己：做得不错。",
    "不满足于将就，要做就做好。","今天的苦，是明天实力的一部分。",
    "把每一个短板都找出来，逐一补强。","今天进步了，很踏实，明天接着进步。",
    "不放弃，不退缩，好好练。","把目标记在心里，每天努力一点点。",
    "再多走一遍，把这套流程彻底熟悉。","今天的训练完整，态度认真，满意。",
    "坚持就是最硬的功夫。","每一天的积累，都在打造更好的自己。"],
};

// 特殊台词：升级时 (每个性格各5条)
export const LEVELUP_DIALOGUES = {
  hotblood: ["突破了！冲啊！感觉无敌！","嗬！境界提升！！！","哈哈！我变更强了！谁来挑战！","YAAA！升级啦！今天太爽了！","嗯哼！这才是进步的感觉！"],
  calm:     ["水到渠成，功夫不负有心人。","嗯，积累到了，自然就突破了。","还不错，按部就班，有了成果。","感受到了，境界明朗了一些。","不慌不忙，走到这一步了。"],
  tsundere: ["哼……这，这不是理所当然的吗。","才，才升级了，别大惊小怪的！","哼！就说我能做到嘛，果然。","升级了……哼，跟本来预计的一样。","哼，这点程度，迟早的事。"],
  cunning:  ["嗯，在预期之内。","呵，积累够了，自然贯通。","计划推进顺利，继续。","嗯，进度正常，记住这个状态。","呵，技术精进，意料之中。"],
  airhead:  ["哇！我升级了吗！好厉害！","咦！刚才突然感觉不一样了！","耶！升级啦！好开心！","哇哇哇！我变强了吗！","嗯嗯嗯！感觉有什么东西好像通了！"],
  diligent: ["没有白练，进步了。","扎扎实实，终于到达这一步。","今天的坚持，换来了这个结果，值得。","好，下个目标继续努力。","踏踏实实，升级了，继续。"],
};

/**
 * 为弟子随机选取一条训练台词
 * @param {Object} disciple - 弟子对象
 * @param {'normal'|'levelup'|'intense'} context - 台词情境
 */
export function pickTrainLine(disciple, context = 'normal') {
  const personality = disciple.personality || 'diligent';
  if (context === 'levelup') {
    const pool = LEVELUP_DIALOGUES[personality] || LEVELUP_DIALOGUES.diligent;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const pool = TRAIN_DIALOGUES[personality] || TRAIN_DIALOGUES.diligent;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 从可训练弟子中随机挑出 count 名发言者，带台词和出现时间
 */
export function pickGroupSpeakers(disciples, count = 3) {
  if (!disciples.length) return [];
  const shuffled = [...disciples].sort(() => Math.random() - 0.5);
  const n = Math.min(count, shuffled.length);
  return shuffled.slice(0, n).map((d, i) => ({
    disciple: d,
    line: pickTrainLine(d, 'normal'),
    showAt: 0.45 + i * 0.18, // 依次出现
  }));
}
