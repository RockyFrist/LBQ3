// ============ 竞技场 ============
export const ARENA_W = 1200;
export const ARENA_H = 800;

// ============ 角色基础 ============
export const FIGHTER_RADIUS = 18;
export const FIGHTER_SPEED = 155; // px/s — 冷兵器战斗步伐，沉稳但不迟钝
export const MAX_HP = 100;

// ============ 体力 ============
export const STAMINA_MAX = 5;
export const STAMINA_REGEN_INTERVAL = 2.0;   // 秒/点
export const BLOCK_STAMINA_PAUSE = 2.5;      // 招架暂停恢复
export const EXHAUSTED_PAUSE = 2.0;          // 体力归零暂停
export const EXHAUSTED_RESTORE = 3;          // 处决后恢复
export const EXHAUSTED_SPEED_MULT = 0.5;

// ============ 轻击连击串 ============
// 参考只狼R1 ~650ms/下, 荣耀战魂轻击 500-600ms
export const LIGHT_ATTACKS = [
  { startup: 0.15, active: 0.14, recovery: 0.36, range: 55, arc: Math.PI * 0.28, damage: 8,  name: '前刺' },
  { startup: 0.15, active: 0.14, recovery: 0.36, range: 58, arc: Math.PI * 0.35, damage: 8,  name: '斜砍' },
  { startup: 0.22, active: 0.18, recovery: 0.70, range: 62, arc: Math.PI * 0.50, damage: 12, name: '横扫' },
];
export const LIGHT_COMBO_WINDOW = 0.45; // 连击输入窗（recovery 阶段内，略宽容些）

// ============ 重击 ============
export const HEAVY_CHARGE   = 0.70;
export const HEAVY_ACTIVE   = 0.18;
export const HEAVY_RECOVERY = 0.65;
export const HEAVY_RANGE    = 78;
export const HEAVY_ARC      = Math.PI * 0.40;
export const HEAVY_DAMAGE   = 28;

// ============ 招架 ============
export const BLOCK_RECOVERY_TIME = 0.55;
export const BLOCK_LINGER_TIME   = 0.12; // 松手后招架仍然持续的时间（grace period）
export const PRECISE_PARRY_WINDOW = 0.12;
export const SEMI_PARRY_WINDOW    = 0.55;

// 格挡结果
// 精准>半精准>非精准，操作越难奖励越高
// counterStartup: 反击出手速度
// parryStagger: 攻击方硬直时长（>= counterStartup，保证反击命中）
// parryKnockback: 格挡后攻击方被推开距离（< 反击射程65px）
// hitFreeze: 格挡瞬间双方冻结时间（只狼式识破定格）
export const PARRY_RESULTS = {
  precise:    { selfCost: 0, enemyDrain: 2, counterStartup: 0.12, parryStagger: 0.40, parryKnockback: 10, hitFreeze: 0.18 },
  semi:       { selfCost: 0, enemyDrain: 1, counterStartup: 0.22, parryStagger: 0.45, parryKnockback: 12, hitFreeze: 0.12 },
  nonPrecise: { selfCost: 2, enemyDrain: 1, counterStartup: 0.38, parryStagger: 0.50, parryKnockback: 15, hitFreeze: 0.06 },
};
// 格挡加速增益（格挡成功后下次攻击前摇压缩）
export const PARRY_BOOST = {
  precise:    { mult: 0.55, duration: 0.80 },
  semi:       { mult: 0.55, duration: 0.80 },
  nonPrecise: { mult: 0.75, duration: 0.60 },
};
export const PARRY_COUNTER_ACTIVE   = 0.12;
export const PARRY_COUNTER_RECOVERY = 0.30;

// ============ 预输入缓冲 ============
export const INPUT_BUFFER_DURATION  = 0.15; // 缓冲窗口
export const PARRY_COUNTER_RANGE    = 65;
export const PARRY_COUNTER_ARC      = Math.PI * 0.35;
export const PARRY_COUNTER_DAMAGE   = 15;
export const PARRY_CHAIN_DECAY      = 0.4; // 每轮 startup 增加比例

// ============ 轻击 vs 招架 ============
export const LIGHT_VS_BLOCK_STAMINA = 1;
export const LIGHT_BREAK_HIT        = 3;         // 第 3 下破防
export const BLOCK_BREAK_STAGGER    = 0.50;

// ============ 闪避 ============
// 参考荣耀战魂dodge ~600ms, 只狼step ~400ms
export const DODGE_COST     = 1;
export const DODGE_DURATION = 0.36;
export const DODGE_SPEED    = 370;
export const DODGE_INVULN_END = 0.18;  // 前半段无敌
export const PERFECT_DODGE_WINDOW = 0.12;

// ============ 变招 ============
export const FEINT_COST = 2;

// ============ 硬直 ============
export const HIT_STAGGER      = 0.33;
export const BLOCK_BREAK_STUN = 0.60;

// ============ 处决 ============
export const EXECUTION_DAMAGE_PCT = 0.25;
export const EXECUTION_DURATION   = 1.00; // 更有仪式感

// ============ 碰撞 / 拼刀 ============
// 拼刀参数设计目标：实现"叮叮叮"连续拼刀，推开距离小、硬直短、快速回到决策点
export const CLASH_PUSHBACK       = 18;
export const CLASH_STAGGER        = 0.25;
export const HEAVY_CLASH_PUSHBACK = 45;   // 重击拼刀推开适中，允许连续博弈
export const HEAVY_CLASH_STAGGER  = 0.40;
export const HEAVY_CLASH_STAMINA  = 1;
export const CLASH_DETECT_RANGE   = 90;  // 武器碰撞检测距离
export const CLASH_SWING_RATIO    = 0.35; // startup进度超过此比例视为挥刀中（越小拼刀窗口越大）

// ============ 冻结帧（hitstop） ============
export const CLASH_HIT_FREEZE       = 0.15;
export const HEAVY_CLASH_HIT_FREEZE = 0.20;

// ============ 攻击吸附 ============
export const ATTACK_MAGNET_RANGE = 110;
export const ATTACK_MAGNET_ANGLE = Math.PI / 5;
export const ATTACK_MAGNET_PULL  = 65;   // 有效吸附力，startup期间拉近~5px

// ============ 攻击位移（模拟攻击动作前冲） ============
// lunge: 进入active瞬间的一次性位移(px)
// drift: active期间持续前冲速度(px/s)，武器射程跟着角色走
export const LIGHT_ATTACK_LUNGE  = 12;   // 轻击小步前冲
export const LIGHT_ATTACK_DRIFT  = 80;   // 轻击active持续推进
export const HEAVY_ATTACK_LUNGE  = 25;   // 重击大步突进
export const HEAVY_ATTACK_DRIFT  = 50;   // 重击active缓慢前压
export const PARRY_COUNTER_LUNGE = 30;   // 格反突进（表演性前冲刺）
export const PARRY_COUNTER_DRIFT = 120;  // 格反高速追击

// ============ 格挡拉近 ============
// 精准/半精准格挡后，招架方向攻击方步进靠近（只狼式识破前冲）
export const PARRY_PULL_PRECISE   = 35;  // 精准格挡拉近距离（架刀前步贴身）
export const PARRY_PULL_SEMI      = 25;  // 半精准拉近
export const PARRY_PULL_NONPRECISE = 0;  // 非精准不拉近

// ============ 击退 ============
// 轻击击退小，保持近战节奏；重击击退明显
export const HIT_KNOCKBACK       = 30;
export const HEAVY_HIT_KNOCKBACK = 80;
export const KNOCKBACK_SLIDE_DURATION = 0.12; // 击退滑动时长（秒），线性减速

// ============ 屏幕震动 ============
export const SHAKE_LIGHT     = 5;
export const SHAKE_HEAVY     = 12;
export const SHAKE_CLASH     = 9;
export const SHAKE_EXECUTION = 16;
export const SHAKE_DURATION  = 0.18;

// ============ 时间缩放（慢动作博弈窗口） ============
// 格挡后：类似只狼识破，统一的戏剧性慢放
// scale越小=越慢，duration=真实时间持续多久
export const PARRY_TIME_SCALE = {
  precise:    { scale: 0.15, duration: 1.00 },
  semi:       { scale: 0.15, duration: 1.00 },
  nonPrecise: { scale: 0.30, duration: 0.50 },
};
export const CLASH_TIME_SCALE = {
  light: { scale: 0.30, duration: 0.35 },
  heavy: { scale: 0.20, duration: 0.50 },
};

// ============ AI 节奏控制 ============
export const AI_MIN_ATTACK_INTERVAL = 0.6;
export const AI_MAX_IDLE_TIME = 2.5;
