export function dist(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function angleBetween(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function angleDiff(a, b) {
  return normalizeAngle(b - a);
}

export function lerp(a, b, t) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function randomRange(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

export function vec2Normalize(x, y) {
  const len = Math.sqrt(x * x + y * y);
  if (len < 0.001) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

export function isInArc(attackerX, attackerY, attackerFacing, targetX, targetY, targetRadius, range, arc) {
  const dx = targetX - attackerX;
  const dy = targetY - attackerY;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d - targetRadius > range) return false;
  const angle = Math.atan2(dy, dx);
  const diff = Math.abs(normalizeAngle(angle - attackerFacing));
  // 考虑目标身体的角度占位（近距离时目标占据更大视角）
  const angularRadius = d > 1 ? Math.atan2(targetRadius, d) : Math.PI;
  return diff <= arc / 2 + angularRadius;
}

export function easeOutQuad(t) {
  return t * (2 - t);
}

export function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
