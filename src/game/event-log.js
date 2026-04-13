// ===================== 战斗事件→UI/视觉 映射 =====================
// 从 game.js 提取的事件日志模块
// 使用方式: Object.assign(Game.prototype, eventLogMethods)

import * as C from '../core/constants.js';

export const eventLogMethods = {
  /** 判断事件是否涉及玩家（非AI-vs-AI） */
  _isPlayerInvolved(evt) {
    // 斗蛐蛐/观战/联机模式 → 保留所有表现特效
    if (this.mode === 'spectate' || this.mode === 'online_host' || this.mode === 'online_guest' || this.mode === 'local2p') return true;
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
        // 音效
        if (this.audio) { heavy ? this.audio.playHeavyHit() : this.audio.playLightHit(); }
        // 炁获取: 攻击者+被击者
        if (evt.attacker.gainQi) {
          const qiGain = evt.atkType === 'parryCounter' ? C.QI_GAIN_COUNTER_HIT
            : heavy ? C.QI_GAIN_HEAVY_HIT : C.QI_GAIN_LIGHT_HIT;
          evt.attacker.gainQi(qiGain);
        }
        if (evt.target.gainQi) evt.target.gainQi(heavy ? C.QI_GAIN_TAKEN_HEAVY : C.QI_GAIN_TAKEN_LIGHT);
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
        // 音效
        if (this.audio) {
          const lvl = { precise: 2, semi: 1, nonPrecise: 0 };
          this.audio.playParry(lvl[evt.level] || 0);
        }
        // 炁获取: 格挡方
        if (evt.target.gainQi) {
          const qiGain = evt.level === 'precise' ? C.QI_GAIN_PRECISE : evt.level === 'semi' ? C.QI_GAIN_SEMI : 0;
          if (qiGain > 0) evt.target.gainQi(qiGain);
        }
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
        this.ui.addLog(`${evt.target.name} 格挡了攻击 (${evt.hitCount}/${evt.target.weapon.breakHits || C.LIGHT_BREAK_HIT})`);
        if (this.audio) this.audio.playBlock();
        if (!isTest) this.addFloatingText(evt.target.x, evt.target.y - 25, `格挡 ${evt.hitCount}/${evt.target.weapon.breakHits || C.LIGHT_BREAK_HIT}`, '#88ccff', 13, 0.5, -60);
        break;
      case 'blockBreak':
        this.ui.addLog(`${evt.target.name} 防御被破!`);
        if (this.audio) this.audio.playGuardBreak();
        if (!isTest) {
          this.addFloatingText(evt.target.x, evt.target.y - 40, '破防!', '#ffaa00', 30, 1.6, -30);
          if (playerInvolved) this.flashScreen('rgba(255,170,0,0.2)', 0.15);
        }
        break;
      case 'lightClash': {
        if (!isTest) {
          if (this.audio) this.audio.playClash(false);
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
          if (this.audio) this.audio.playClash(true);
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
        if (this.audio) this.audio.playExecution();
        // 炁获取: 处决方
        if (evt.attacker.gainQi) evt.attacker.gainQi(C.QI_GAIN_EXECUTION);
        if (!isTest) {
          this.addFloatingText(evt.target.x, evt.target.y - 45, `处决! -${evt.damage}`, '#ff0000', 34, 2.0, -25);
          if (playerInvolved) this.flashScreen('rgba(255,0,0,0.3)', 0.25);
        }
        break;
      case 'perfectDodge':
        this.ui.addLog(`${evt.target.name} 完美闪避!`);
        if (this.audio) this.audio.playPerfectDodge();
        if (!isTest) {
          this.addFloatingText(evt.target.x, evt.target.y - 35, '完美闪避!', '#ffff44', 20, 0.9, -40);
          if (playerInvolved) {
            this.flashScreen('rgba(255,255,100,0.15)', 0.1);
            this.applyTimeScale(C.PERFECT_DODGE_TIME_SCALE.scale, C.PERFECT_DODGE_TIME_SCALE.duration);
          }
        }
        break;
      case 'ultimateHit':
        // 每段连斩命中的逐段特效
        if (this.audio) this.audio.playUltimateHit();
        if (!isTest && playerInvolved) {
          if (evt.isLastHit) {
            // 末段大冲击：强冻帧 + 强震动 + 闪屏 + 慢动作
            this.applyHitFreeze(0.18);
            this.camera.shake(18, 0.35);
            this.flashScreen('rgba(255,40,20,0.35)', 0.25);
            this.applyTimeScale(0.12, 0.6);
          } else {
            // 前几段微冻帧 + 微震动
            this.applyHitFreeze(0.05);
            this.camera.shake(6, 0.1);
          }
        }
        break;
      case 'ultimate':
        this.ui.addLog(`${evt.attacker.name} 乱刀斩! 命中${evt.hitCount}人 (${evt.totalHits}段×${evt.damage})`);
        if (!isTest) {
          if (evt.hitCount > 0) {
            const totalDmg = evt.damage * evt.totalHits;
            for (const t of evt.targets) {
              this.addFloatingText(t.x, t.y - 30, `-${totalDmg}`, '#ff6644', 22, 1.0, -50);
            }
          }
        }
        break;
      case 'ultimateInterrupt':
        this.ui.addLog(`${evt.target.name} 拔刀被打断!`);
        if (!isTest) {
          this.addFloatingText(evt.target.x, evt.target.y - 40, '打断!', '#ff8844', 24, 1.0, -35);
          if (playerInvolved) this.flashScreen('rgba(255,136,68,0.2)', 0.12);
        }
        break;
      case 'ultimateClash': {
        const mx = (evt.a.x + evt.b.x) / 2;
        const my = (evt.a.y + evt.b.y) / 2;
        this.ui.addLog('绝刀相撞! 双方弹开!');
        if (this.audio) this.audio.playUltimateClash();
        if (!isTest) {
          this.addFloatingText(mx, my - 35, '绝刀相撞!', '#ff3300', 32, 1.8, -25);
          if (playerInvolved) {
            this.flashScreen('rgba(255,80,30,0.35)', 0.2);
            this.applyHitFreeze(C.ULTIMATE_CLASH_FREEZE);
            this.applyTimeScale(0.10, 1.0);
          }
        }
        break;
      }
      case 'hyperAbsorb':
        this.ui.addLog(`${evt.a.name} 霸体吸收了 ${evt.b.name} 的轻击`);
        if (!isTest) this.addFloatingText(evt.a.x, evt.a.y - 25, '霸体!', '#ff8844', 14, 0.5, -55);
        break;
      case 'feint':
        if (evt.target) {
          this.ui.addLog(`${evt.target.name} 变招! (-${C.FEINT_COST}体力)`);
          if (!isTest) {
            this.addFloatingText(evt.target.x, evt.target.y - 30, '变招!', '#ff88ff', 20, 0.8, -40);
          }
        }
        break;
      case 'ultimateStartup':
        if (evt.target && !isTest) {
          this.flashScreen('rgba(255,60,30,0.18)', 0.12);
          this.camera.shake(6, 0.15);
          evt.target.flash('#ff4422', 0.15);
          this.addFloatingText(evt.target.x, evt.target.y - 45, '⚡蓄势!', '#ff6633', 22, 0.8, -35);
        }
        break;
      case 'ultimateActivate':
        if (evt.target && !isTest) {
          this.applyHitFreeze(0.18);
          this.flashScreen('rgba(255,30,20,0.35)', 0.25);
          this.camera.shake(16, 0.3);
          this.applyTimeScale(0.15, 0.8);
          evt.target.flash('#ff3020', 0.25);
          this.addFloatingText(evt.target.x, evt.target.y - 55, '拔刀!', '#ff4422', 32, 1.5, -25);
        }
        break;
    }
  },
};
