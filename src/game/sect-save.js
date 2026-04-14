// ===================== 宗门风云 · 存档系统 =====================
// localStorage 存取 + 导出/导入 JSON

import { resetDiscipleIdCounter } from './sect-data.js';

const SAVE_KEY_PREFIX = 'lbq3_sect_';
const MAX_SLOTS = 3;

/** 保存到指定槽位 (0-2) */
export function saveSect(slot, state) {
  if (slot < 0 || slot >= MAX_SLOTS) return false;
  try {
    const data = JSON.stringify(state);
    localStorage.setItem(SAVE_KEY_PREFIX + slot, data);
    return true;
  } catch (e) {
    console.error('宗门存档失败:', e);
    return false;
  }
}

/** 从指定槽位读取 */
export function loadSect(slot) {
  if (slot < 0 || slot >= MAX_SLOTS) return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY_PREFIX + slot);
    if (!raw) return null;
    const state = JSON.parse(raw);
    // 恢复弟子ID计数器
    const maxId = state.disciples.reduce((m, d) => Math.max(m, d.id || 0), 0);
    resetDiscipleIdCounter(maxId);
    return state;
  } catch (e) {
    console.error('宗门读档失败:', e);
    return null;
  }
}

/** 删除指定槽位 */
export function deleteSect(slot) {
  if (slot < 0 || slot >= MAX_SLOTS) return;
  localStorage.removeItem(SAVE_KEY_PREFIX + slot);
}

/** 获取所有槽位摘要（不完整加载） */
export function getSaveSlots() {
  const slots = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    try {
      const raw = localStorage.getItem(SAVE_KEY_PREFIX + i);
      if (raw) {
        const d = JSON.parse(raw);
        slots.push({
          slot: i,
          exists: true,
          sectName: d.sectName || '未知',
          day: d.day || 1,
          gold: d.gold || 0,
          fame: d.fame || 0,
          disciples: d.disciples ? d.disciples.length : 0,
        });
      } else {
        slots.push({ slot: i, exists: false });
      }
    } catch {
      slots.push({ slot: i, exists: false });
    }
  }
  return slots;
}

/** 导出存档为 JSON 字符串 */
export function exportSave(state) {
  return JSON.stringify(state, null, 2);
}

/** 从 JSON 字符串导入存档 */
export function importSave(jsonStr) {
  try {
    const state = JSON.parse(jsonStr);
    if (!state.sectName || !state.disciples) {
      throw new Error('无效的存档格式');
    }
    const maxId = state.disciples.reduce((m, d) => Math.max(m, d.id || 0), 0);
    resetDiscipleIdCounter(maxId);
    return state;
  } catch (e) {
    console.error('导入存档失败:', e);
    return null;
  }
}
