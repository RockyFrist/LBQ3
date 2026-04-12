// ===================== 联机状态同步 =====================
// Fighter 快照序列化、事件序列化

// 需要同步的 fighter 字段（渲染 + HUD 所需）
const SNAP_KEYS = [
  'x', 'y', 'facing', 'vx', 'vy',
  'state', 'phase', 'stateTimer', 'phaseTimer', 'staggerDuration',
  'hp', 'maxHp', 'stamina',
  'alive', 'isExhausted', 'speedMult',
  'attackType', 'comboStep',
  'scale', 'radius',
  'color', 'name', 'team',
  'dodgeAngle',
  'blockHitCount',
  'flashTimer', 'flashColor', 'damageFlash',
  'parryDeflect',
  'feinted', 'perfectDodged',
  'blockSuppressed', 'parryActionDelay',
  'knockbackTimer', 'knockbackDuration', 'knockbackVx', 'knockbackVy',
  'staminaRegenTimer',
];

/** 序列化单个 Fighter 的渲染状态 */
export function snapshotFighter(f) {
  const snap = {};
  for (const k of SNAP_KEYS) snap[k] = f[k];
  // 嵌套对象
  snap.parryBoost = { mult: f.parryBoost.mult, timer: f.parryBoost.timer };
  snap.attackData = f.attackData ? {
    range: f.attackData.range, arc: f.attackData.arc,
    damage: f.attackData.damage, type: f.attackData.type,
    startup: f.attackData.startup, active: f.attackData.active,
    recovery: f.attackData.recovery,
  } : null;
  // 残影（闪避时的拖尾）
  snap.afterimages = f.afterimages.map(ai => ({ x: ai.x, y: ai.y, timer: ai.timer }));
  return snap;
}

/** 将快照数据应用到 Fighter 对象上（仅设置属性，不触发逻辑） */
export function applyFighterSnapshot(f, snap) {
  for (const k of SNAP_KEYS) {
    if (snap[k] !== undefined) f[k] = snap[k];
  }
  if (snap.parryBoost) {
    f.parryBoost.mult = snap.parryBoost.mult;
    f.parryBoost.timer = snap.parryBoost.timer;
  }
  f.attackData = snap.attackData;
  if (snap.afterimages) f.afterimages = snap.afterimages;
}

// 事件中的 fighter 引用字段（需要转成索引）
const FIGHTER_REF_KEYS = new Set(['attacker', 'target', 'a', 'b', 'executor', 'victim']);

/** 序列化战斗事件（fighter 引用 → 索引） */
export function serializeEvent(evt, fighters) {
  const out = {};
  for (const [k, v] of Object.entries(evt)) {
    if (FIGHTER_REF_KEYS.has(k) && v && typeof v === 'object') {
      out[k] = fighters.indexOf(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** 反序列化战斗事件（索引 → fighter 引用） */
export function deserializeEvent(evt, fighters) {
  const out = {};
  for (const [k, v] of Object.entries(evt)) {
    if (FIGHTER_REF_KEYS.has(k) && typeof v === 'number') {
      out[k] = fighters[v] || null;
    } else {
      out[k] = v;
    }
  }
  return out;
}
