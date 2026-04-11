// ===================== 战斗事件→UI/视觉 映射 =====================
// 从 game.js 提取的事件日志模块
// 使用方式: Object.assign(Game.prototype, eventLogMethods)

import * as C from '../core/constants.js';

export const eventLogMethods = {
  /** 判断事件是否涉及玩家（非AI-vs-AI） */
  _isPlayerInvolved(evt) {
    // 斗蛐蛐/观战模式 → 保留所有表现特效
    if (this.mode === 'spectate') return true;
    const pf = this.player && this.player.fighter;
    if (!pf || !pf.alive) return true;
    if (evt.attacker === pf || evt.target === pf) return true;
    if (evt.a === pf || evt.b === pf) return true;
    return false;
  },

  _logEvent(evt) {
    const isTest = this.mode === 'test';
    const playerInvolved = this._isPlayerInvolved(evt);
    switch (evt.type) {
      case 'hit': {
        const heavy = evt.atkType === 'heavy';
        this.ui.addLog(`${evt.attacker.name} ${heavy ? '重击' : '轻击'}命中 ${evt.target.name} (-${evt.damage}HP)`);
        if (!isTest) {
          if (heavy) {
            this.addFloatingText(evt.target.x, evt.target.y - 40, `重击! -${evt.damage}`, '#ff6633', 24, 1.2, -40);
            if (playerInvolved) {
              this.flashScreen('rgba(255,50,30,0.25)', 0.15);
              this.applyHitFreeze(C.HEAVY_HIT_FREEZE);
            }
          } else {
            this.addFloatingText(evt.target.x, evt.target.y - 25, `-${evt.damage}`, '#ff4444', 15, 0.5, -65);
          }
        }
        break;
      }
      case 'parry': {
        const labels = { precise: '精准格挡!', semi: '半精准格挡', nonPrecise: '格挡' };
        const colors = { precise: '#ffff00', semi: '#88ccff', nonPrecise: '#ff8844' };
        const sizes = { precise: 28, semi: 18, nonPrecise: 14 };
        const durs = { precise: 1.5, semi: 0.9, nonPrecise: 0.6 };
        const vys = { precise: -30, semi: -45, nonPrecise: -55 };
        this.ui.addLog(`${evt.target.name} ${labels[evt.level]} → ${evt.attacker.name}`);
        if (!isTest) {
          this.addFloatingText(evt.target.x, evt.target.y - 40, labels[evt.level], colors[evt.level], sizes[evt.level], durs[evt.level], vys[evt.level]);
          if (playerInvolved) {
            const freezes = { precise: C.PARRY_RESULTS.precise.hitFreeze, semi: C.PARRY_RESULTS.semi.hitFreeze, nonPrecise: C.PARRY_RESULTS.nonPrecise.hitFreeze };
            this.applyHitFreeze(freezes[evt.level]);
            const ts = C.PARRY_TIME_SCALE[evt.level];
            this.applyTimeScale(ts.scale, ts.duration);
            if (evt.level === 'precise') {
              this.flashScreen('rgba(255,255,100,0.25)', 0.18);
            } else if (evt.level === 'semi') {
              this.flashScreen('rgba(100,180,255,0.15)', 0.12);
            }
          }
        }
        break;
      }
      case 'blocked':
        this.ui.addLog(`${evt.target.name} 格挡了攻击 (${evt.hitCount}/${C.LIGHT_BREAK_HIT})`);
        if (!isTest) this.addFloatingText(evt.target.x, evt.target.y - 25, `格挡 ${evt.hitCount}/${C.LIGHT_BREAK_HIT}`, '#88ccff', 13, 0.5, -60);
        break;
      case 'blockBreak':
        this.ui.addLog(`${evt.target.name} 防御被破!`);
        if (!isTest) {
          this.addFloatingText(evt.target.x, evt.target.y - 40, '破防!', '#ffaa00', 30, 1.6, -30);
          if (playerInvolved) this.flashScreen('rgba(255,170,0,0.2)', 0.15);
        }
        break;
      case 'lightClash': {
        if (!isTest) {
          const mx = (evt.a.x + evt.b.x) / 2;
          const my = (evt.a.y + evt.b.y) / 2;
          this.ui.addLog('拼刀!');
          this.addFloatingText(mx, my - 30, '拼刀!', '#ffdd55', 22, 0.8, -35);
          if (playerInvolved) {
            this.flashScreen('rgba(255,255,255,0.15)', 0.1);
            this.applyHitFreeze(C.CLASH_HIT_FREEZE);
            this.applyTimeScale(C.CLASH_TIME_SCALE.light.scale, C.CLASH_TIME_SCALE.light.duration);
          }
        }
        break;
      }
      case 'heavyClash': {
        if (!isTest) {
          const mx = (evt.a.x + evt.b.x) / 2;
          const my = (evt.a.y + evt.b.y) / 2;
          this.ui.addLog('弹刀! 双方体力-1');
          this.addFloatingText(mx, my - 30, '弹刀!', '#ff8844', 28, 1.3, -30);
          if (playerInvolved) {
            this.flashScreen('rgba(255,200,100,0.2)', 0.15);
            this.applyHitFreeze(C.HEAVY_CLASH_HIT_FREEZE);
            this.applyTimeScale(C.CLASH_TIME_SCALE.heavy.scale, C.CLASH_TIME_SCALE.heavy.duration);
          }
        }
        break;
      }
      case 'execution':
        this.ui.addLog(`${evt.attacker.name} 处决了 ${evt.target.name}! (-${evt.damage}HP)`);
        if (!isTest) {
          this.addFloatingText(evt.target.x, evt.target.y - 45, `处决! -${evt.damage}`, '#ff0000', 34, 2.0, -25);
          if (playerInvolved) this.flashScreen('rgba(255,0,0,0.3)', 0.25);
        }
        break;
      case 'perfectDodge':
        this.ui.addLog(`${evt.target.name} 完美闪避!`);
        if (!isTest) {
          this.addFloatingText(evt.target.x, evt.target.y - 35, '完美闪避!', '#ffff44', 20, 0.9, -40);
          if (playerInvolved) {
            this.flashScreen('rgba(255,255,100,0.15)', 0.1);
            this.applyTimeScale(C.PERFECT_DODGE_TIME_SCALE.scale, C.PERFECT_DODGE_TIME_SCALE.duration);
          }
        }
        break;
      case 'hyperAbsorb':
        this.ui.addLog(`${evt.a.name} 霸体吸收了 ${evt.b.name} 的轻击`);
        if (!isTest) this.addFloatingText(evt.a.x, evt.a.y - 25, '霸体!', '#ff8844', 14, 0.5, -55);
        break;
    }
  },
};
