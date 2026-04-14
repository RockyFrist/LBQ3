/**
 * sect-achievements.js — 门派成就系统
 * 20 个成就，每个达成后弹出金色提示并给予奖励
 */

export const ACHIEVEMENTS = [
  {
    id: 'first_blood',
    name: '初战告捷',
    desc: '完成首次任务战斗并获胜',
    icon: '⚔',
    color: '#ff8844',
    reward: { gold: 100 },
    check: s => (s.stats?.totalWins ?? 0) >= 1,
  },
  {
    id: 'veteran',
    name: '百战老兵',
    desc: '累计赢得 10 场战斗',
    icon: '🏆',
    color: '#ffaa44',
    reward: { gold: 300 },
    check: s => (s.stats?.totalWins ?? 0) >= 10,
  },
  {
    id: 'warlord',
    name: '武林枭雄',
    desc: '累计赢得 50 场战斗',
    icon: '👑',
    color: '#ffcc00',
    reward: { gold: 1000, fame: 15 },
    check: s => (s.stats?.totalWins ?? 0) >= 50,
  },
  {
    id: 'five_disciples',
    name: '桃李初成',
    desc: '同时拥有 5 位弟子',
    icon: '👥',
    color: '#44bbff',
    reward: { gold: 200 },
    check: s => s.disciples.length >= 5,
  },
  {
    id: 'ten_disciples',
    name: '桃李满天',
    desc: '同时拥有 10 位弟子',
    icon: '🌳',
    color: '#44ddaa',
    reward: { gold: 500, fame: 10 },
    check: s => s.disciples.length >= 10,
  },
  {
    id: 'wealthy',
    name: '小有积蓄',
    desc: '积累 5000 两银子',
    icon: '💰',
    color: '#ffdd44',
    reward: { fame: 5 },
    check: s => s.gold >= 5000,
  },
  {
    id: 'tycoon',
    name: '富甲一方',
    desc: '积累 20000 两银子',
    icon: '💎',
    color: '#ff44aa',
    reward: { fame: 20 },
    check: s => s.gold >= 20000,
  },
  {
    id: 'known',
    name: '小有名气',
    desc: '声望达到 50',
    icon: '📣',
    color: '#88aaff',
    reward: { gold: 300 },
    check: s => s.fame >= 50,
  },
  {
    id: 'legendary',
    name: '威震武林',
    desc: '声望达到 150',
    icon: '🌟',
    color: '#ffbb00',
    reward: { gold: 2000 },
    check: s => s.fame >= 150,
  },
  {
    id: 'master_disciple',
    name: '青出于蓝',
    desc: '培养出一位满级弟子',
    icon: '🥋',
    color: '#ff6644',
    reward: { gold: 800, fame: 10 },
    check: s => s.disciples.some(d => d.level >= d.talent),
  },
  {
    id: 'builder',
    name: '固本培元',
    desc: '所有建筑升至 2 级',
    icon: '🏗',
    color: '#44ddaa',
    reward: { gold: 500 },
    check: s => Object.values(s.buildings || {}).every(lv => lv >= 2),
  },
  {
    id: 'grandmaster_builder',
    name: '殿宇巍峨',
    desc: '所有建筑达到最高级',
    icon: '🏯',
    color: '#ffcc44',
    reward: { fame: 30 },
    check: s => {
      const maxLvls = { dojo: 4, barracks: 4, forge: 3, infirmary: 3, vault: 3 };
      return Object.entries(maxLvls).every(([k, max]) => (s.buildings?.[k] ?? 1) >= max);
    },
  },
  {
    id: 'trainer',
    name: '勤修苦练',
    desc: '累计训练 100 次',
    icon: '💪',
    color: '#ff8844',
    reward: { gold: 400 },
    check: s => (s.stats?.totalTrains ?? 0) >= 100,
  },
  {
    id: 'item_collector',
    name: '玲琅满目',
    desc: '库存中同时拥有 5 件装备',
    icon: '🎒',
    color: '#88aaff',
    reward: { gold: 200 },
    check: s => (s.inventory?.length ?? 0) >= 5,
  },
  {
    id: 'rare_collector',
    name: '奇珍异宝',
    desc: '获得一件稀有品质装备',
    icon: '✨',
    color: '#ff99ff',
    reward: { fame: 8 },
    check: s => s.inventory?.some(it => it.quality === 'rare' || it.quality === 'legendary'),
  },
  {
    id: 'quest_master',
    name: '行侠仗义',
    desc: '累计完成 30 个任务',
    icon: '📜',
    color: '#44bbff',
    reward: { gold: 600, fame: 10 },
    check: s => (s.stats?.totalQuests ?? 0) >= 30,
  },
  {
    id: 'talent_seeker',
    name: '伯乐识马',
    desc: '使用一次天资秘卷',
    icon: '📖',
    color: '#aa66ff',
    reward: { gold: 200 },
    check: s => (s.stats?.talentScrollsUsed ?? 0) >= 1,
  },
  {
    id: 'shop_regular',
    name: '财大气粗',
    desc: '在门派商店累计购买 20 件物品',
    icon: '🛍',
    color: '#ffdd44',
    reward: { gold: 300 },
    check: s => (s.stats?.shopBuys ?? 0) >= 20,
  },
  {
    id: 'century',
    name: '百年基业',
    desc: '门派存续 100 天',
    icon: '📅',
    color: '#88ffee',
    reward: { gold: 1500, fame: 20 },
    check: s => s.day >= 100,
  },
  {
    id: 'diverse_team',
    name: '百花争鸣',
    desc: '同时拥有六种性格的弟子各一人',
    icon: '🌈',
    color: '#ff88aa',
    reward: { fame: 12 },
    check: s => {
      const personalities = new Set(s.disciples.map(d => d.personality).filter(Boolean));
      return personalities.size >= 6;
    },
  },
];

/** 检查新达成的成就，返回新解锁的成就 ID 数组 */
export function checkNewAchievements(state) {
  const unlocked = new Set(state.achievements || []);
  const newly = [];
  for (const ach of ACHIEVEMENTS) {
    if (unlocked.has(ach.id)) continue;
    try {
      if (ach.check(state)) newly.push(ach.id);
    } catch (_) { /* 忽略异常 */ }
  }
  return newly;
}

/** 根据 id 查找成就定义 */
export function getAchievement(id) {
  return ACHIEVEMENTS.find(a => a.id === id) || null;
}
