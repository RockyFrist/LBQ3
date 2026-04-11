// ===================== 江湖行 · 关卡数据 =====================
// 玩家3次生命，逐关挑战，难度递增
// scale: 体型缩放  hpMult: 血量倍率  difficulty: AI智能(1-5)

export const JIANGHU_STAGES = [
  {
    id: 1,
    name: '山贼拦路',
    story: '你踏入江湖，行至山道。一名山贼持刀拦路，嚷着留下买路钱。',
    enemy: {
      name: '山贼',
      color: '#aa7744',
      difficulty: 1,
      scale: 0.95,
      hpMult: 0.8,
    },
  },
  {
    id: 2,
    name: '镖师试招',
    story: '途经镖局，一名镖师看你腰间佩剑，要与你切磋一番。',
    enemy: {
      name: '镖师',
      color: '#cc8833',
      difficulty: 2,
      scale: 1.0,
      hpMult: 1.0,
    },
  },
  {
    id: 3,
    name: '酒馆恶霸',
    story: '夜宿酒馆，一个满身酒气的壮汉冲你挑衅。此人身形魁梧，力大势沉。',
    enemy: {
      name: '酒馆恶霸',
      color: '#bb5533',
      difficulty: 2,
      scale: 1.25,
      hpMult: 1.3,
    },
  },
  {
    id: 4,
    name: '青衣剑客',
    story: '竹林深处，一名青衣剑客横剑拦路。他步法轻盈，出手如风。',
    enemy: {
      name: '青衣剑客',
      color: '#44aa88',
      difficulty: 3,
      scale: 0.9,
      hpMult: 0.9,
    },
  },
  {
    id: 5,
    name: '铁塔力士',
    story: '城门口，一名身高八尺的铁塔力士守擂。他力大无穷，一击千钧。',
    enemy: {
      name: '铁塔力士',
      color: '#886644',
      difficulty: 3,
      scale: 1.5,
      hpMult: 1.6,
    },
  },
  {
    id: 6,
    name: '双刀捕快',
    story: '你被官府盯上了。一名身手敏捷的捕快追踪而来，出手凌厉。',
    enemy: {
      name: '双刀捕快',
      color: '#5577cc',
      difficulty: 4,
      scale: 0.95,
      hpMult: 1.0,
    },
  },
  {
    id: 7,
    name: '少林武僧',
    story: '途经少林，一位武僧在山门前拦住你。此僧身如铁柱，棍法精妙。',
    enemy: {
      name: '少林武僧',
      color: '#dd8822',
      difficulty: 4,
      scale: 1.2,
      hpMult: 1.4,
    },
  },
  {
    id: 8,
    name: '魔教长老',
    story: '深夜荒庙，一名黑袍长老现身。他修炼邪功，体格异于常人。',
    enemy: {
      name: '魔教长老',
      color: '#9933cc',
      difficulty: 4,
      scale: 1.35,
      hpMult: 1.5,
    },
  },
  {
    id: 9,
    name: '天山剑仙',
    story: '登上天山绝顶，一位白衣剑仙立于崖边。他出剑极快，招招致命。',
    enemy: {
      name: '天山剑仙',
      color: '#aaccff',
      difficulty: 5,
      scale: 1.0,
      hpMult: 1.1,
    },
  },
  {
    id: 10,
    name: '武林盟主',
    story: '华山之巅，武林盟主已等候多时。此人集百家之长，号令天下群雄。这是你江湖行的终极一战。',
    enemy: {
      name: '武林盟主',
      color: '#ff2244',
      difficulty: 5,
      scale: 1.15,
      hpMult: 1.8,
    },
  },
];

export const JIANGHU_MAX_LIVES = 3;

// 每关结束后恢复的HP比例
export const JIANGHU_HEAL_RATIO = 0.4;
