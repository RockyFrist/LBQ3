// ===================== 宗门风云 · 核心逻辑 (mixin) =====================
// 混入 Game.prototype，管理宗门经营的所有游戏逻辑
// 战斗使用现有 AI vs AI 引擎，管理界面用 SectUI Canvas 渲染

import * as C from '../core/constants.js';
import { Enemy } from '../ai/enemy.js';
import { CombatSystem } from '../combat/combat-system.js';
import { Fighter } from '../combat/fighter.js';
import { getWeapon, WEAPON_LIST } from '../weapons/weapon-defs.js';
import { getArmor } from '../weapons/armor-defs.js';
import { SectUI } from './sect-ui.js';
import { saveSect, loadSect, getSaveSlots, autoSaveSect, loadAutoSave, isAutoSaveOn, setAutoSave } from './sect-save.js';
import {
  createInitialState, createDisciple, generateQuest, rollEvent,
  BUILDINGS, maxDisciples, availableArmors, trainExpMul, healMul,
  dailyIncome, expToLevel, TRAITS, TRAIT_LIST, COMMON_TRAITS,
  WEAPON_IDS, WEAPON_NAMES, ARMOR_NAMES, resetDiscipleIdCounter,
  checkStoryTrigger, ITEM_QUALITY, rollLootDrop, itemLabel,
  FAME_TIERS, getFameTier, SHOP_POOL, refreshShopItems,
  PERSONALITY_TYPES, pickTrainLine, pickGroupSpeakers,
  TRAINING_MODES, TRAINING_MODE_ORDER, LEADER_BONUSES,
} from './sect-data.js';
import { checkNewAchievements, getAchievement } from './sect-achievements.js';
import { resetDialogueMemory, pickCombatLine, pickLifeLine, isDialogueEnabled, setDialogueFlags, getDialogueFlags } from './sect-dialogues.js';

export const sectModeMethods = {

  // ===== 初始化 =====
  _setupSectMode(savedState) {
    // 尝试读取自动存档（未手动指定存档时）
    if (!savedState && isAutoSaveOn()) {
      savedState = loadAutoSave();
    }
    this.sect = savedState || createInitialState();
    this.sectUI = new SectUI();
    this.sectSubPage = 'main'; // main | disciples | buildings | quests | market | log | disciple_detail
    this.sectPopup = null;     // null | 'event' | 'discipleSelect' | 'fightResult' | 'saveSlots' | 'armorSelect'
    this.sectSaveMode = 'save';
    this.sectSelectedQuestIdx = -1;  // 当前选择的任务索引
    this.sect._selectedDisciple = null; // 弟子详情用
    this.sect._armorSelectDisciple = null;

    // 战斗观看相关
    this.sectWatchingFight = false;
    this.sectFightResult = null;
    this.sectFightShowResult = false;
    this.sectPendingQuest = null;
    this.sectPendingDisciple = null;
    this._sectSaved = null;  // 战斗期间保存的游戏状态

    // Toast通知系统
    this.sectToast = null; // { text, color, timer }

    // 事件战斗选人
    this.sect._pendingEventFight = null;  // { type, params }

    // 成就系统
    this.sectAchievementQueue = [];  // 待展示的成就ID队列
    this.sectAchievementCurrent = null; // 当前展示的成就ID

    // 训练动画系统
    this.sectTrainAnim = false;       // 是否正在播放训练动画
    this.sectTrainAnimData = null;    // { type, disciples, speakers }
    this.sectTrainAnimProgress = 0;   // 0→1 动画进度
    this.sectTrainAnimWait = false;   // 动画完成，等待点击继续

    // 战斗对话气泡系统
    this.sectSpeechBubbles = [];     // { fighter, text, timer, maxTimer, personality, color }
    this._sectSpeechCd = {};         // 每个fighter的冷却 { [team]: number }
    this._sectLowHpSpoken = {};      // 低血量台词是否已触发 { [team]: bool }

    // 剧情系统
    this.sectStoryPageIdx = 0;
    // 兼容旧存档（没有storyProgress字段）
    if (!this.sect.storyProgress) this.sect.storyProgress = [];
    if (this.sect.pendingStory === undefined) this.sect.pendingStory = null;
    if (!this.sect.inventory) this.sect.inventory = [];
    // 兼容旧存档（没有shop字段）
    if (!this.sect.shop) this.sect.shop = { items: [], refreshDay: 0 };
    // 兼容旧弟子数据（没有quality字段）
    for (const d of this.sect.disciples) {
      if (!d.weaponQuality) d.weaponQuality = 'normal';
      if (!d.armorQuality) d.armorQuality = 'normal';
      if (d.hpBonus === undefined) d.hpBonus = 0;
      if (!d.personality) d.personality = Object.keys(PERSONALITY_TYPES)[Math.floor(Math.random() * 6)];
      if (!d.trainingMode) d.trainingMode = 'normal';
    }
    // 兼容旧存档（没有achievements字段）
    if (!this.sect.achievements) this.sect.achievements = [];
    if (this.sect.leaderId === undefined) this.sect.leaderId = null;
    if (this.sect.trainedToday !== undefined) delete this.sect.trainedToday;
    if (this.sect.trainsToday !== undefined) delete this.sect.trainsToday;
    if (!this.sect.stats.totalTrains) this.sect.stats.totalTrains = 0;
    if (!this.sect.stats.totalQuests) this.sect.stats.totalQuests = 0;
    if (this.sect.stats.talentScrollsUsed === undefined) this.sect.stats.talentScrollsUsed = 0;
    if (!this.sect.stats.shopBuys) this.sect.stats.shopBuys = 0;

    // 首日生成任务
    if (this.sect.quests.length === 0) {
      this._sectRefreshQuests();
    }

    this._sectAddLog('欢迎来到'+this.sect.sectName+'！', '#ffcc44');

    // 检查是否有剧情需要触发（开局剧情）
    this._sectCheckStory();
  },

  // ===== Update =====
  _updateSect(dt) {
    const input = this.input;

    // ESC / 触屏返回 — 如果有弹窗先关弹窗
    if (input.pressed('Escape') || input.touchBack) {
      if (this.sectPopup === 'story' && this.sect.pendingStory) {
        // 剧情弹窗：ESC跳到最后一页或关闭
        if (this.sectStoryPageIdx < this.sect.pendingStory.pages.length - 1) {
          this.sectStoryPageIdx = this.sect.pendingStory.pages.length - 1;
        } else {
          this.sect.storyProgress.push(this.sect.pendingStory.id);
          this.sect.pendingStory = null;
          this.sectPopup = null;
          this.sectStoryPageIdx = 0;
          this._sectCheckStory();
        }
        return;
      }
      // 训练动画：ESC跳过动画直接完成
      if (this.sectTrainAnim) {
        const cb = this._sectTrainAnimCallback;
        this.sectTrainAnim = false;
        this.sectTrainAnimData = null;
        this.sectTrainAnimProgress = 0;
        this.sectTrainAnimWait = false;
        this._sectTrainAnimCallback = null;
        if (cb) cb.call(this);
        return;
      }
      if (this.sectPopup) {
        this.sectPopup = null;
        this.sectSelectedQuestIdx = -1;
        return;
      }
      if (this.sectSubPage === 'disciple_detail') {
        this.sectSubPage = 'disciples';
        return;
      }
      // 无弹窗在主页则退出
      if (this.sectSubPage === 'main' && this.onExit) {
        this.onExit();
        return;
      }
      this.sectSubPage = 'main';
      return;
    }

    // Toast倒计时
    if (this.sectToast) {
      this.sectToast.timer -= dt;
      if (this.sectToast.timer <= 0) this.sectToast = null;
    }

    // 成就队列：无其他弹窗时弹出
    if (!this.sectPopup && this.sectAchievementQueue.length > 0) {
      this.sectAchievementCurrent = this.sectAchievementQueue.shift();
      this.sectPopup = 'achievement';
    }

    // 战斗观看模式：直接走正常 _tick
    if (this.sectWatchingFight) {
      // 结果面板阶段
      if (this.sectFightShowResult) {
        if (input.mouseLeftDown || input.pressed('Escape') || input.touchBack) {
          this._sectEndFight();
        }
        return;
      }

      // 点击跳过按钮检查
      if (input.mouseLeftDown && this._victoryTimer < 0) {
        const action = this.sectUI.handleClick(input.mouseX, input.mouseY);
        if (action && action.type === 'skipFight') {
          // 强制结束战斗
          const fA = this.player.fighter;
          const fB = this.enemies[0]?.fighter;
          if (fA && fB) {
            if (fA.hp <= fB.hp) { fA.hp = 0; fA.alive = false; }
            else { fB.hp = 0; fB.alive = false; }
          }
        }
      }

      // 正常战斗 tick（含 hitFreeze / 慢动作 / combat.resolve / 粒子 / 浮文字）
      this._tick(dt);

      // 战斗对话气泡：检查事件触发 + 更新计时
      this._sectCheckCombatSpeechTriggers();
      this._sectUpdateSpeechBubbles(dt);

      // 45秒超时强制结束
      if (this._victoryTimer < 0 && this.gameTime > 45) {
        const fA = this.player.fighter;
        const fB = this.enemies[0]?.fighter;
        if (fA && fB) {
          if (fA.hp <= fB.hp) { fA.hp = 0; fA.alive = false; }
          else { fB.hp = 0; fB.alive = false; }
        }
      }

      // 检测战斗结束（_tick 已把 _victoryTimer 设为 0）
      if (this._victoryTimer >= 0) {
        if (!this.sectFightResult) {
          this.sectFightResult = this._sectSettleFightResult(this.player.fighter?.alive);
          // 胜利/失败台词
          if (isDialogueEnabled('combat') && this.sectFightResult) {
            const pAA = this.sectPendingDisciple?.personality || 'diligent';
            const fAA = this.player.fighter;
            // 清除冷却，确保结算台词能出
            this._sectSpeechCd = { 0: 0, 1: 0 };
            this.sectSpeechBubbles = [];
            if (this.sectFightResult.won && fAA) {
              // 胜利时强制显示（跳过alive检查）
              const line = pickCombatLine(pAA, 'combat_win', 'f0');
              if (line && line !== '……') {
                const pType = PERSONALITY_TYPES[pAA];
                this.sectSpeechBubbles.push({
                  fighter: fAA, text: line, timer: 2.5, maxTimer: 2.5,
                  color: pType?.color || '#ffcc44',
                });
              }
            } else if (!this.sectFightResult.won && fAA) {
              const line = pickCombatLine(pAA, 'combat_lose', 'f0');
              if (line && line !== '……') {
                const pType = PERSONALITY_TYPES[pAA];
                this.sectSpeechBubbles.push({
                  fighter: fAA, text: line, timer: 2.5, maxTimer: 2.5,
                  color: pType?.color || '#ffcc44',
                });
              }
            }
          }
        }
        // 女敌人胜利：先显示立绘 2.5s，非女敌人/败北：1.5s 直接结算
        const resultDelay = (this.sectFightResult?.won && this.sectFightResult?.enemyFemale) ? 2.5 : 1.5;
        if (this._victoryTimer > resultDelay) {
          this.sectFightShowResult = true;
          this.sect.pendingFightResult = this.sectFightResult;
        }
      }

      // 立绘揭示阶段：点击 / ESC 可跳过直接进入结算
      const _inPortrait = this._victoryTimer >= 0 && !this.sectFightShowResult
        && this.sectFightResult?.won && this.sectFightResult?.enemyFemale;
      if (_inPortrait && (input.mouseLeftDown || input.pressed('Escape') || input.touchBack)) {
        this.sectFightShowResult = true;
        this.sect.pendingFightResult = this.sectFightResult;
      }
      return;
    }

    // 训练动画更新
    if (this.sectTrainAnim) {
      if (this.sectTrainAnimWait) {
        // 等待点击继续
        if (input.mouseLeftDown || input.pressed('Escape') || input.touchBack) {
          const cb = this._sectTrainAnimCallback;
          this.sectTrainAnim = false;
          this.sectTrainAnimData = null;
          this.sectTrainAnimProgress = 0;
          this.sectTrainAnimWait = false;
          this._sectTrainAnimCallback = null;
          if (cb) cb.call(this);
        }
      } else {
        this.sectTrainAnimProgress += dt * 0.45;
        if (this.sectTrainAnimProgress >= 1) {
          this.sectTrainAnimProgress = 1;
          this.sectTrainAnimWait = true;
        }
      }
      return;
    }

    // 点击处理
    if (input.mouseLeftDown) {
      const mx = input.mouseX;
      const my = input.mouseY;
      const action = this.sectUI.handleClick(mx, my);
      if (action) {
        this._sectHandleAction(action);
      }
    }

    // [DEV] P 键 — 循环切换 3 套立绘测试女敌人胜利展示
    if (input.pressed('KeyP')) {
      this._devTestImgId = ((this._devTestImgId || 0) % 3) + 1;
      this.sectUI._defeatedImgAnim = 0;
      this.sectWatchingFight = true;
      this.sectFightShowResult = false;
      this.sectFightResult = {
        won: true, isSpar: false,
        discipleName: '测试弟子',
        enemyDiff: 3, enemyWeapon: 'dao',
        enemyFemale: true, enemyImgId: this._devTestImgId,
        goldGain: 200, fameGain: 10, expGain: 30, injuryGain: 0,
        levelUp: false, newTrait: null, lootDrop: null,
      };
      this._victoryTimer = 0; // 直接进入立绘阶段
      this.sect.pendingFightResult = null;
    }
  },

  // ===== 动作处理 =====
  _sectHandleAction(action) {
    switch (action.type) {
      case 'nav':
        this.sectSubPage = action.page;
        this.sectPopup = null;
        break;

      case 'action':
        this._sectDoAction(action.id, action);
        break;

      case 'selectDisciple': {
        const d = this.sect.disciples.find(d => d.id === action.id);
        if (d) {
          this.sect._selectedDisciple = d;
          this.sectSubPage = 'disciple_detail';
        }
        break;
      }

      case 'eventChoice':
        this._sectHandleEventChoice(action.choiceIndex);
        break;

      case 'selectForQuest':
        this._sectAssignDisciple(action.discipleId);
        break;

      case 'cancelSelect':
        this.sectPopup = null;
        this.sectSelectedQuestIdx = -1;
        break;

      case 'closeAchievement':
        this.sectAchievementCurrent = null;
        this.sectPopup = null;
        break;

      case 'closeFightResult':
        this.sect.pendingFightResult = null;
        this.sectPopup = null;
        this._sectCheckStory();
        break;

      case 'saveSlot':
        this._sectHandleSaveSlot(action.slot, action.mode);
        break;

      case 'cancelSave':
        // 从存档界面返回设置界面
        this.sectPopup = 'settings';
        break;

      case 'cancelSettings':
        this.sectPopup = null;
        break;

      case 'selectForTalentUp':
        this._sectDoAction('selectForTalentUp', action);
        break;

      case 'cancelTalentSelect':
        this.sectPopup = null;
        break;

      case 'selectArmor':
        this._sectChangeArmor(action.armorId);
        break;

      case 'cancelEquip':
        this.sect._armorSelectDisciple = null;
        this.sectPopup = null;
        break;

      case 'selectForEventFight': {
        const d = this.sect.disciples.find(d => d.id === action.discipleId);
        const ef = this.sect._pendingEventFight;
        if (!d || !ef) break;
        d.onQuest = true;
        d.stamina = Math.max(0, d.stamina - 20);
        const quest = { name: ef.name, icon: ef.icon, enemyDiff: ef.diff, enemyWeapon: ef.weapon || 'dao', reward: ef.reward, discipleId: d.id };
        this.sect.activeQuests.push(quest);
        this.sect._pendingEventFight = null;
        this.sectPopup = null;
        this._sectStartQuestFight(d, quest);
        break;
      }

      case 'cancelEventFight':
        this.sect._pendingEventFight = null;
        this.sectPopup = null;
        break;

      case 'cancelDismiss':
        this.sect._dismissTarget = null;
        this.sectPopup = null;
        break;

      case 'storyNext':
        this.sectStoryPageIdx++;
        break;

      case 'storyDone':
        if (this.sect.pendingStory) {
          this.sect.storyProgress.push(this.sect.pendingStory.id);
          this.sect.pendingStory = null;
        }
        this.sectPopup = null;
        this.sectStoryPageIdx = 0;
        // 关闭剧情后立刻检查是否有下一个连续剧情
        this._sectCheckStory();
        break;
    }
  },

  _sectDoAction(id, action) {
    switch (id) {
      case 'setTrainingMode': {
        const d = this.sect.disciples.find(d => d.id === action.discipleId);
        if (!d) break;
        if (d.onQuest) { this._sectShowToast('该弟子正在任务中', '#ff6644'); break; }
        d.trainingMode = action.mode;
        const mode = TRAINING_MODES[action.mode];
        this._sectShowToast(`${d.name} → ${mode.icon}${mode.name}`, '#4499ff');
        break;
      }

      case 'batchMode': {
        const mode = TRAINING_MODES[action.mode];
        if (!mode) break;
        let count = 0;
        for (const d of this.sect.disciples) {
          if (!d.onQuest) { d.trainingMode = action.mode; count++; }
        }
        this._sectShowToast(`${count}人切换至${mode.icon}${mode.name}`, '#4499ff');
        break;
      }

      case 'train':
        this._sectDoTraining();
        break;

      case 'setLeader': {
        const d = this.sect.disciples.find(d => d.id === action.discipleId);
        if (!d) break;
        if (this.sect.leaderId === d.id) {
          this.sect.leaderId = null;
          this._sectShowToast(`取消${d.name}的领头`, '#888');
        } else {
          this.sect.leaderId = d.id;
          const bonus = LEADER_BONUSES[d.personality];
          this._sectShowToast(`⭐ ${d.name}成为领头 · ${bonus?.name || ''}`, '#ffcc44');
        }
        break;
      }

      case 'spar':
        this._sectStartSpar();
        break;

      case 'nextDay':
        this._sectNextDay();
        break;

      case 'save':
        this.sectPopup = 'saveSlots';
        this.sectSaveMode = 'save';
        break;

      case 'load':
        this.sectPopup = 'saveSlots';
        this.sectSaveMode = 'load';
        break;

      case 'settings':
        this.sectPopup = 'settings';
        break;

      case 'upgrade':
        this._sectUpgradeBuilding(action.buildingId);
        break;

      case 'assignQuest':
        this._sectShowDiscipleSelect(action.questIndex);
        break;

      case 'changeArmor': {
        // 打开装备选择弹窗（护甲选项）
        const d2 = this.sect.disciples.find(d => d.id === action.discipleId);
        if (d2 && !d2.onQuest) {
          this.sect._armorSelectDisciple = d2;
          this.sect._equipSelectType = 'armor';
          this.sectPopup = 'equipSelect';
        }
        break;
      }

      case 'changeWeapon': {
        // 打开装备选择弹窗（武器选项）
        const d3 = this.sect.disciples.find(d => d.id === action.discipleId);
        if (d3 && !d3.onQuest) {
          this.sect._armorSelectDisciple = d3;
          this.sect._equipSelectType = 'weapon';
          this.sectPopup = 'equipSelect';
        }
        break;
      }

      case 'equipItem': {
        // 从弹窗选择并装备（action.itemType, action.baseId, action.quality, action.inventoryIdx）
        const d4 = this.sect._armorSelectDisciple;
        if (!d4) break;
        const isArmor = action.itemType === 'armor';

        // 如果是从背包装备（有 inventoryIdx >= 0）
        if (action.inventoryIdx >= 0) {
          const item = this.sect.inventory[action.inventoryIdx];
          if (!item) break;
          // 把旧装备（若非普通）放回背包
          const oldId = isArmor ? d4.armorId : d4.weaponId;
          const oldQ  = isArmor ? d4.armorQuality : d4.weaponQuality;
          if (oldQ !== 'normal' || (isArmor && oldId !== 'none')) {
            if (oldQ !== 'normal') {
              this.sect.inventory.push({ type: action.itemType, id: oldId, quality: oldQ });
            }
          }
          // 装备新物品
          if (isArmor) {
            d4.armorId = item.id; d4.armorQuality = item.quality;
          } else {
            d4.weaponId = item.id; d4.weaponQuality = item.quality;
          }
          this.sect.inventory.splice(action.inventoryIdx, 1);
          const name = isArmor ? ARMOR_NAMES[item.id] : WEAPON_NAMES[item.id];
          this._sectAddLog(`${d4.name} 装备 ${itemLabel(name, item.quality)}`, ITEM_QUALITY[item.quality]?.color || '#44dd88');
          this._sectShowToast(`${d4.name} → ${itemLabel(name, item.quality)}`, ITEM_QUALITY[item.quality]?.color || '#44dd88');
        } else {
          // 基础（普通）装备切换
          if (isArmor) {
            if (d4.armorQuality !== 'normal') {
              this.sect.inventory.push({ type: 'armor', id: d4.armorId, quality: d4.armorQuality });
            }
            d4.armorId = action.baseId; d4.armorQuality = 'normal';
            this._sectAddLog(`${d4.name} 换装 ${ARMOR_NAMES[action.baseId]}`, '#44dd88');
          } else {
            if (d4.weaponQuality !== 'normal') {
              this.sect.inventory.push({ type: action.itemType, id: d4.weaponId, quality: d4.weaponQuality });
            }
            d4.weaponId = action.baseId; d4.weaponQuality = 'normal';
            this._sectAddLog(`${d4.name} 换用 ${WEAPON_NAMES[action.baseId]}`, '#44dd88');
          }
          this._sectShowToast(`换装完成`, '#44dd88');
        }
        this.sectPopup = null;
        this.sect._armorSelectDisciple = null;
        break;
      }

      case 'dismiss': {
        // 打开开除确认弹窗
        const d5 = this.sect.disciples.find(d => d.id === action.discipleId);
        if (d5) {
          this.sect._dismissTarget = d5;
          this.sectPopup = 'dismissConfirm';
        }
        break;
      }

      case 'confirmDismiss': {
        const d6 = this.sect._dismissTarget;
        if (!d6) break;
        const idx = this.sect.disciples.indexOf(d6);
        if (idx >= 0) {
          this.sect.disciples.splice(idx, 1);
          // 声望影响：等级越高、忠诚越高 → 声望损失越大
          const fameLoss = Math.max(0, d6.level * 2 + (d6.loyalty > 60 ? 5 : 0) - 4);
          if (fameLoss > 0) {
            this.sect.fame = Math.max(0, this.sect.fame - fameLoss);
            this._sectAddLog(`${d6.name} 被逐出门派，声望-${fameLoss}`, '#ff6644');
          } else {
            this._sectAddLog(`${d6.name} 已离开门派`, '#888');
          }
          this._sectShowToast(`${d6.name} 离开了门派`, '#ff6644');
        }
        this.sect._dismissTarget = null;
        this.sectPopup = null;
        this.sectSubPage = 'disciples';
        break;
      }

      case 'exitSect':
        if (this.onExit) this.onExit();
        break;

      case 'buyShopItem':
        this._sectBuyShopItem(action.itemId);
        break;

      case 'selectForTalentUp': {
        // 资质秘籍：选中弟子后提升资质
        const d7 = this.sect.disciples.find(d => d.id === action.discipleId);
        if (d7) {
          d7.talent = Math.min(5, d7.talent + 1);
          this.sect.stats.talentScrollsUsed++;
          this._sectAddLog(`📜 ${d7.name} 资质突破！资质提升至${d7.talent}星`, '#ffdd00');
          this._sectShowToast(`${d7.name} 资质+1！现为${d7.talent}星`, '#ffdd00');
          this._sectCheckAchievements();
        }
        this.sectPopup = null;
        break;
      }

      case 'cancelTalentSelect':
        // 取消资质秘籍选择
        this.sectPopup = null;
        break;

      case 'toggleDialogue': {
        const flags = getDialogueFlags();
        flags[action.key] = !flags[action.key];
        setDialogueFlags(flags);
        const label = { training: '训练', combat: '战斗', life: '日常' }[action.key] || action.key;
        this._sectShowToast(`${label}对话 ${flags[action.key] ? '✅ 开启' : '❌ 关闭'}`, flags[action.key] ? '#44cc88' : '#aa4444');
        break;
      }

      case 'toggleAutoSave': {
        const nowOn = !isAutoSaveOn();
        setAutoSave(nowOn);
        this._sectShowToast(`自动存档 ${nowOn ? '✅ 开启' : '❌ 关闭'}`, nowOn ? '#44cc88' : '#aa4444');
        break;
      }
    }
  },

  // ===== 商店购买 =====
  _sectBuyShopItem(itemId) {
    const shopItem = this.sect.shop.items.find(si => si.id === itemId);
    if (!shopItem || shopItem.sold) return;
    if (this.sect.gold < shopItem.cost) {
      this._sectShowToast('銀两不足！', '#ff6644');
      return;
    }
    if (this.sect.fame < shopItem.fameReq) {
      this._sectShowToast(`需要声望${shopItem.fameReq}才能购买`, '#ff6644');
      return;
    }

    this.sect.gold -= shopItem.cost;
    shopItem.sold = true;
    this.sect.stats.shopBuys++;

    switch (shopItem.effect || shopItem.type) {
      case 'weapon':
      case 'armor': {
        // 装备类：随机分配具体武器/护甲ID，加入背包
        let itemTypeId;
        if (shopItem.type === 'weapon') {
          itemTypeId = WEAPON_IDS[Math.floor(Math.random() * WEAPON_IDS.length)];
        } else {
          const smithLv = this.sect.buildings.smith || 0;
          const armorPool = ['light', 'medium', 'heavy'].slice(0, Math.max(1, smithLv));
          itemTypeId = armorPool[Math.floor(Math.random() * armorPool.length)];
        }
        this.sect.inventory.push({ type: shopItem.type, id: itemTypeId, quality: shopItem.quality });
        const nameStr = shopItem.type === 'weapon' ? WEAPON_NAMES[itemTypeId] : ARMOR_NAMES[itemTypeId];
        this._sectAddLog(`🛍 ${shopItem.name}已购入背包：${itemLabel(nameStr, shopItem.quality)}`, ITEM_QUALITY[shopItem.quality]?.color || '#44dd88');
        this._sectShowToast(`已购入 ${itemLabel(nameStr, shopItem.quality)}`, ITEM_QUALITY[shopItem.quality]?.color || '#44dd88');
        break;
      }

      case 'healAll':
        for (const d of this.sect.disciples) d.injury = Math.max(0, d.injury - 50);
        this._sectAddLog('💊 回春丹发放，全员伤势-50', '#44dd88');
        this._sectShowToast('全员伤势大幅恢复！', '#44dd88');
        break;

      case 'hpBonus':
        // 淬体丹：给全员弹力加成记录
        for (const d of this.sect.disciples) {
          d.hpBonus = (d.hpBonus || 0) + 0.1;
        }
        this._sectAddLog('⚗ 淬体丹发放，全员气血永久+10%', '#44ffcc');
        this._sectShowToast('全员气血+10%！', '#44ffcc');
        break;

      case 'talentUp':
        // 打开资质秘籍选择弟子弹窗
        {
          const eligible = this.sect.disciples.filter(d => d.talent < 5);
          if (eligible.length === 0) {
            this._sectAddLog('所有弟子资质已顶级，秘籍浪费了', '#ff6644');
            this._sectShowToast('无可提升的弟子', '#ff6644');
            // 退款
            this.sect.gold += shopItem.cost;
            shopItem.sold = false;
          } else {
            this.sectPopup = 'talentSelect';
          }
        }
        break;

      case 'recruitElite':
        {
          if (this.sect.disciples.length >= maxDisciples(this.sect.buildings.barracks)) {
            this._sectAddLog('弟子已满编，招募令失效', '#ff6644');
            this._sectShowToast('弟子已满！', '#ff6644');
            this.sect.gold += shopItem.cost;
            shopItem.sold = false;
          } else {
            const talent = 4 + (Math.random() < 0.3 ? 1 : 0); // 4星 or 5星
            const d = createDisciple({ talent, loyalty: 70 + Math.floor(Math.random() * 20), joinDay: this.sect.day });
            this.sect.disciples.push(d);
            this._sectAddLog(`📋 ${d.name}(资质${talent}星)应招募令加入！`, '#ffdd00');
            this._sectShowToast(`${d.name} 加入门派！`, '#ffdd00');
          }
        }
        break;

      case 'traitAll':
        {
          let count = 0;
          for (const d of this.sect.disciples) {
            if (d.traits.length < 3) {
              const pool = COMMON_TRAITS.filter(t => !d.traits.includes(t.id));
              if (pool.length > 0) {
                const t = pool[Math.floor(Math.random() * pool.length)];
                d.traits.push(t.id);
                count++;
                this._sectAddLog(`📖 ${d.name}领悟「${TRAITS[t.id]?.name || t.id}」`, '#ffaa44');
              }
            }
          }
          if (count > 0) {
            this._sectShowToast(`${count}人领悟新特质！`, '#ffaa44');
          } else {
            this._sectAddLog('弟子特质已满', '#ff6644');
            this.sect.gold += shopItem.cost;
            shopItem.sold = false;
          }
        }
        break;
    }
    this._sectCheckAchievements();
  },

  // ===== 经验 =====
  _sectGainExp(d, amount) {
    if (d.level >= d.talent) return;
    d.exp += amount;
    const need = expToLevel(d.level);
    if (d.exp >= need) {
      d.exp -= need;
      d.level = Math.min(d.talent, d.level + 1);
      this._sectAddLog(`🎉 ${d.name} 升级到 Lv${d.level}！`, '#ffdd00');
      resetDialogueMemory(d.id); // 升级后清除台词记忆，避免短期重复殪奒語
    }
  },

  // ===== 建造 =====
  _sectUpgradeBuilding(buildingId) {
    const bld = BUILDINGS[buildingId];
    if (!bld) return;
    const lv = this.sect.buildings[buildingId] || 0;
    if (lv >= bld.maxLv) return;
    const cost = bld.costs[lv];
    if (this.sect.gold < cost) {
      this._sectAddLog('银两不足！', '#ff6644');
      return;
    }
    this.sect.gold -= cost;
    this.sect.buildings[buildingId] = lv + 1;
    this._sectAddLog(`${bld.icon} ${bld.name} 升级到 Lv${lv + 1}`, '#44dd88');
    this._sectCheckAchievements();
  },

  // ===== 任务 =====
  _sectRefreshQuests() {
    const towerLv = this.sect.buildings.tower || 0;
    this.sect.quests = [];
    const count = 3 + Math.min(2, Math.floor(this.sect.fame / 30)); // 3-5个任务
    for (let i = 0; i < count; i++) {
      this.sect.quests.push(generateQuest(towerLv));
    }
  },

  _sectRefreshShop() {
    if (!this.sect.shop) this.sect.shop = { items: [], refreshDay: 0 };
    this.sect.shop.items = refreshShopItems(this.sect);
    this.sect.shop.refreshDay = this.sect.day;
  },

  _sectShowDiscipleSelect(questIndex) {
    this.sectSelectedQuestIdx = questIndex;
    this.sectPopup = 'discipleSelect';
  },

  _sectAssignDisciple(discipleId) {
    const qIdx = this.sectSelectedQuestIdx;
    if (qIdx < 0 || qIdx >= this.sect.quests.length) return;
    const quest = this.sect.quests[qIdx];
    const d = this.sect.disciples.find(d => d.id === discipleId);
    if (!d || d.onQuest) return;

    // 指派
    quest.discipleId = d.id;
    d.onQuest = true;
    d.stamina = Math.max(0, d.stamina - 30);
    this.sect.activeQuests.push(quest);
    this.sect.quests.splice(qIdx, 1);
    this.sectPopup = null;
    this.sectSelectedQuestIdx = -1;

    // 直接进入战斗观看（不再headless预模拟）
    this._sectStartQuestFight(d, quest);

    // 出征台词
    if (isDialogueEnabled('life')) {
      const line = pickLifeLine(d.personality || 'diligent', 'quest_send', d.id);
      if (line && line !== '……') {
        const pType = PERSONALITY_TYPES[d.personality];
        this._sectAddLog(`💬 ${d.name}：「${line}」`, pType?.color || '#aaa');
      }
    }
  },

  // ===== 任务战斗（直接观看，使用正常战斗循环）=====
  _sectStartQuestFight(disciple, quest) {
    const d = disciple;
    const aiDiffD = Math.min(5, Math.max(3, d.level));

    this.sectWatchingFight = true;
    this.sectFightResult = null;
    this.sectFightShowResult = false;
    this.sectPendingQuest = quest;
    this.sectPendingDisciple = d;

    // 创建Fighter + Enemy
    const weaponA = getWeapon(d.weaponId);
    const armorA = getArmor(d.armorId);
    const fA = new Fighter(C.ARENA_W / 2 - 80, C.ARENA_H / 2, {
      weapon: weaponA, armor: armorA,
      color: d.color, name: d.name, team: 0,
    });
    for (const tid of d.traits) {
      const t = TRAITS[tid];
      if (t && t.aiMod.hpMul) {
        fA.maxHp = Math.floor(fA.maxHp * (1 + t.aiMod.hpMul));
        fA.hp = fA.maxHp;
      }
    }
    // 装备品质加成 HP
    const wQual = ITEM_QUALITY[d.weaponQuality || 'normal']?.hpMul || 1;
    const aQual = ITEM_QUALITY[d.armorQuality || 'normal']?.hpMul || 1;
    const qualMul = (wQual + aQual) / 2; // 武器+护甲品质平均
    if (qualMul > 1) {
      fA.maxHp = Math.floor(fA.maxHp * qualMul);
      fA.hp = fA.maxHp;
    }
    // 淬体丹 hpBonus 永久加成
    if (d.hpBonus > 0) {
      fA.maxHp = Math.floor(fA.maxHp * (1 + d.hpBonus));
      fA.hp = fA.maxHp;
    }
    fA.showNameTag = true;

    const weaponB = getWeapon(quest.enemyWeapon);
    const fB = new Fighter(C.ARENA_W / 2 + 80, C.ARENA_H / 2, {
      weapon: weaponB,
      color: '#cc4444', name: `敌(D${quest.enemyDiff})`, team: 1,
    });
    fB.facing = Math.PI;
    fB.showNameTag = true;

    const eA = new Enemy(fA.x, fA.y, aiDiffD, { weaponId: d.weaponId, armorId: d.armorId });
    eA.fighter = fA;
    const eB = new Enemy(fB.x, fB.y, Math.max(3, quest.enemyDiff), { weaponId: quest.enemyWeapon });
    eB.fighter = fB;

    this._sectSwapInFighters(fA, eA, [eB]);
    this._sectAddLog(`⚔ ${d.name} 出战${quest.name}(D${quest.enemyDiff})`, '#ffaa44');
  },

  // ===== 把宗门战斗角色注入正常游戏循环 =====
  _sectSwapInFighters(fA, eA, enemies) {
    // 保存当前游戏状态
    this._sectSaved = {
      playerFighter: this.player.fighter,
      playerAI: this.playerAI,
      enemies: this.enemies,
      allies: this.allies,
      gameTime: this.gameTime,
      victoryTimer: this._victoryTimer,
      floatingTexts: this.floatingTexts,
      screenFlashTimer: this.screenFlash ? this.screenFlash.timer : 0,
    };
    // 注入宗门战斗角色
    this.player.fighter = fA;
    this.playerAI = eA;
    this.enemies = enemies;
    this.allies = [];
    this._victoryTimer = -1;
    this.gameTime = 0;
    this.floatingTexts = [];
    this.hitFreezeTimer = 0;
    this.timeScaleTimer = 0;
    this.timeScale = 1;
    this._rebuildFighterList();
    this.combat.playerFighter = null;
    this.particles.particles = [];
    this.camera.x = C.ARENA_W / 2;
    this.camera.y = C.ARENA_H / 2;

    // 初始化战斗对话气泡
    this.sectSpeechBubbles = [];
    this._sectSpeechCd = { 0: 0, 1: 0 };
    this._sectLowHpSpoken = { 0: false, 1: false };

    // 开场台词（延迟 0.3s 后出现）
    if (isDialogueEnabled('combat')) {
      const pA = this.sectPendingDisciple?.personality || 'diligent';
      setTimeout(() => {
        this._sectAddSpeechBubble(fA, pA, 'combat_start');
      }, 300);
      setTimeout(() => {
        this._sectAddSpeechBubble(enemies[0].fighter, 'diligent', 'combat_start');
      }, 600);
    }
  },

  // ===== 战斗对话气泡 =====
  _sectAddSpeechBubble(fighter, personality, context) {
    if (!fighter || !fighter.alive) return;
    if (!isDialogueEnabled('combat')) return;
    // 冷却检查（同一 team 每 3 秒最多 1 句）
    const team = fighter.team ?? 0;
    if ((this._sectSpeechCd[team] || 0) > 0) return;
    // 最多同时显示 2 个气泡
    if (this.sectSpeechBubbles.length >= 2) return;

    const line = pickCombatLine(personality, context, `f${team}`);
    if (!line || line === '……') return;

    const pType = PERSONALITY_TYPES[personality];
    this.sectSpeechBubbles.push({
      fighter,
      text: line,
      timer: 2.5,
      maxTimer: 2.5,
      color: pType?.color || '#ffcc44',
    });
    this._sectSpeechCd[team] = 3.0; // 3秒冷却
  },

  _sectUpdateSpeechBubbles(dt) {
    // 冷却递减
    for (const k of Object.keys(this._sectSpeechCd)) {
      if (this._sectSpeechCd[k] > 0) this._sectSpeechCd[k] -= dt;
    }
    // 气泡计时
    for (let i = this.sectSpeechBubbles.length - 1; i >= 0; i--) {
      this.sectSpeechBubbles[i].timer -= dt;
      if (this.sectSpeechBubbles[i].timer <= 0) {
        this.sectSpeechBubbles.splice(i, 1);
      }
    }
  },

  _sectCheckCombatSpeechTriggers() {
    if (!isDialogueEnabled('combat')) return;
    if (!this.combat?.events) return;
    const pA = this.sectPendingDisciple?.personality || 'diligent';
    const fA = this.player.fighter;
    const fB = this.enemies[0]?.fighter;
    if (!fA || !fB) return;

    for (const evt of this.combat.events) {
      switch (evt.type) {
        case 'hit':
          // 命中方说话 (15%)
          if (Math.random() < 0.15) {
            const isOurs = evt.attacker === fA;
            this._sectAddSpeechBubble(evt.attacker, isOurs ? pA : 'diligent',
              'combat_hit');
          }
          // 被击方大伤说话 (30% if damage >= 20)
          if (evt.damage >= 20 && Math.random() < 0.30) {
            const isOurs = evt.target === fA;
            this._sectAddSpeechBubble(evt.target, isOurs ? pA : 'diligent',
              'combat_hurt');
          }
          break;
        case 'perfectDodge':
          // 完美闪避 (25%)
          if (Math.random() < 0.25) {
            const isOurs = evt.target === fA;
            this._sectAddSpeechBubble(evt.target, isOurs ? pA : 'diligent',
              'combat_dodge');
          }
          break;
        case 'execution':
          // 处决：被处决方说话
          if (Math.random() < 0.5) {
            const isOurs = evt.target === fA;
            this._sectAddSpeechBubble(evt.target, isOurs ? pA : 'diligent',
              'combat_hurt');
          }
          break;
      }
    }

    // 低血量触发（一次性）
    if (fA.alive && fA.hp / fA.maxHp < 0.3 && !this._sectLowHpSpoken[0]) {
      this._sectLowHpSpoken[0] = true;
      this._sectAddSpeechBubble(fA, pA, 'combat_lowHp');
    }
    if (fB.alive && fB.hp / fB.maxHp < 0.3 && !this._sectLowHpSpoken[1]) {
      this._sectLowHpSpoken[1] = true;
      this._sectAddSpeechBubble(fB, 'diligent', 'combat_lowHp');
    }
  },

  // ===== 战斗对话气泡绘制（屏幕空间） =====
  _sectDrawSpeechBubbles(ctx, lw, lh, narrow) {
    const FONT = '"Microsoft YaHei", sans-serif';
    for (const b of this.sectSpeechBubbles) {
      if (!b.fighter) continue;
      const lifeRatio = b.timer / b.maxTimer;
      // 淡入淡出
      let alpha;
      if (lifeRatio > 0.9) alpha = (1 - lifeRatio) / 0.1; // 淡入
      else if (lifeRatio < 0.2) alpha = lifeRatio / 0.2;   // 淡出
      else alpha = 1;

      // 将世界坐标转换为屏幕坐标
      const cam = this.camera;
      const sx = cam.viewX + (b.fighter.x + cam.offsetX) * cam.viewScale;
      const sy = cam.viewY + (b.fighter.y + cam.offsetY) * cam.viewScale;

      // 气泡位置：角色头顶上方，避开名字标签和HP条
      const bubbleY = sy - (narrow ? 72 : 88);
      const maxBW = Math.min(lw - 20, narrow ? 180 : 240);
      ctx.font = `${narrow ? 11 : 13}px ${FONT}`;
      const textW = ctx.measureText(b.text).width;
      const bw = Math.min(maxBW, textW + (narrow ? 20 : 28));
      const bh = narrow ? 26 : 32;
      const bx = Math.max(4, Math.min(lw - bw - 4, sx - bw / 2));
      const by = Math.max(50, bubbleY);

      ctx.save();
      ctx.globalAlpha = alpha;

      // 背景
      ctx.fillStyle = 'rgba(10,10,30,0.88)';
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 7);
      ctx.fill();

      // 边框
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 7);
      ctx.stroke();

      // 小三角指向角色
      const tipX = Math.max(bx + 10, Math.min(bx + bw - 10, sx));
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(tipX - 4, by + bh);
      ctx.lineTo(tipX + 4, by + bh);
      ctx.lineTo(tipX, by + bh + 6);
      ctx.closePath();
      ctx.fill();

      // 文字（超长截断）
      ctx.fillStyle = '#eee';
      ctx.font = `${narrow ? 11 : 13}px ${FONT}`;
      ctx.textAlign = 'center';
      let line = b.text;
      if (ctx.measureText(line).width > bw - (narrow ? 14 : 20)) {
        while (ctx.measureText(line + '…').width > bw - (narrow ? 14 : 20) && line.length > 0) line = line.slice(0, -1);
        line += '…';
      }
      ctx.fillText(line, bx + bw / 2, by + bh / 2 + 4);

      ctx.restore();
    }
  },

  // ===== 战斗结束：恢复正常游戏状态 =====
  _sectEndFight() {
    const saved = this._sectSaved;
    if (saved) {
      this.player.fighter = saved.playerFighter;
      this.playerAI = saved.playerAI;
      this.enemies = saved.enemies;
      this.allies = saved.allies;
      this._victoryTimer = saved.victoryTimer;
      this.gameTime = saved.gameTime;
      this.floatingTexts = saved.floatingTexts;
      this._rebuildFighterList();
      this._sectSaved = null;
    }
    this.sectUI._defeatedImgAnim = 0;
    this.sectWatchingFight = false;
    this.sectFightShowResult = false;
    this.sect.pendingFightResult = null;
    this._sectCheckStory();
  },

  // ===== 战斗结束后结算奖惩 =====
  _sectSettleFightResult(fAAlive) {
    const d = this.sectPendingDisciple;
    const quest = this.sectPendingQuest;
    if (!d || !quest) return null;

    const won = fAAlive;
    this.sect.stats.totalFights++;

    const result = {
      won,
      discipleId: d.id,
      discipleName: d.name,
      enemyDiff: quest.enemyDiff,
      enemyWeapon: quest.enemyWeapon,
      enemyFemale: quest.enemyFemale || false,
      enemyImgId: quest.enemyImgId || 1,
      goldGain: 0, fameGain: 0, expGain: 0, injuryGain: 0,
      levelUp: false, newTrait: null, lootDrop: null,
    };

    this.sect.stats.totalQuests++;
    if (won) {
      d.wins++;
      this.sect.stats.totalWins++;
      const lucky = d.traits.includes('lucky') ? 1.2 : 1.0;
      result.goldGain = Math.floor(quest.reward.gold * lucky);
      result.fameGain = Math.floor(quest.reward.fame * lucky);
      result.expGain = quest.reward.exp;
      this.sect.gold += result.goldGain;
      this.sect.fame += result.fameGain;
      this.sect.stats.totalGold += result.goldGain;
      this.sect.stats.highestFame = Math.max(this.sect.stats.highestFame, this.sect.fame);

      const oldLv = d.level;
      this._sectGainExp(d, result.expGain);
      result.levelUp = d.level > oldLv;

      // 概率获得特质
      if (d.traits.length < 3 && Math.random() < 0.12) {
        const pool = COMMON_TRAITS.filter(t => !d.traits.includes(t.id));
        if (pool.length > 0) {
          const nt = pool[Math.floor(Math.random() * pool.length)];
          d.traits.push(nt.id);
          result.newTrait = nt.id;
        }
      }

      // 战利品掉落
      const loot = rollLootDrop(quest);
      if (loot) {
        this.sect.inventory.push(loot);
        result.lootDrop = loot;
        const itemName = loot.type === 'weapon' ? WEAPON_NAMES[loot.id] : ARMOR_NAMES[loot.id];
        this._sectAddLog(`🎁 获得战利品：${itemLabel(itemName, loot.quality)}`, ITEM_QUALITY[loot.quality]?.color || '#ffd700');
      }

      d.injury = Math.min(100, d.injury + 5 + Math.floor(Math.random() * 10));
      d.loyalty = Math.min(100, d.loyalty + 3);
      this._sectAddLog(`✅ ${d.name} 完成${quest.name}！+${result.goldGain}💰 +${result.fameGain}🏆`, '#44dd88');
      // 胜利归来台词
      if (isDialogueEnabled('life')) {
        const line = pickLifeLine(d.personality || 'diligent', 'quest_return_win', d.id);
        if (line && line !== '……') this._sectAddLog(`💬 ${d.name}：「${line}」`, PERSONALITY_TYPES[d.personality]?.color || '#aaa');
      }
    } else {
      d.losses++;
      result.injuryGain = 20 + Math.floor(Math.random() * 25);
      d.injury = Math.min(100, d.injury + result.injuryGain);
      d.loyalty = Math.max(0, d.loyalty - 3);
      this._sectAddLog(`❌ ${d.name} 任务失败，受伤+${result.injuryGain}`, '#ff6644');
      // 失败归来台词
      if (isDialogueEnabled('life')) {
        const line = pickLifeLine(d.personality || 'diligent', 'quest_return_lose', d.id);
        if (line && line !== '……') this._sectAddLog(`💬 ${d.name}：「${line}」`, PERSONALITY_TYPES[d.personality]?.color || '#aaa');
      }
    }

    d.onQuest = false;
    const aqIdx = this.sect.activeQuests.findIndex(q => q.discipleId === d.id);
    if (aqIdx >= 0) this.sect.activeQuests.splice(aqIdx, 1);

    this.sectPendingQuest = null;
    this.sectPendingDisciple = null;
    this._sectCheckAchievements();
    return result;
  },

  // ===== 切磋（门内对练）=====
  _sectStartSpar() {
    const freeDisciples = this.sect.disciples.filter(d => !d.onQuest && d.injury < 50);
    if (freeDisciples.length < 2) {
      this._sectAddLog('至少需要2名可用弟子才能切磋', '#ff6644');
      return;
    }
    // 随机选2人
    const shuffled = [...freeDisciples].sort(() => Math.random() - 0.5);
    const a = shuffled[0];
    const b = shuffled[1];

    const wA = getWeapon(a.weaponId), wB = getWeapon(b.weaponId);
    const aA = getArmor(a.armorId), aB = getArmor(b.armorId);
    const fA = new Fighter(C.ARENA_W / 2 - 60, C.ARENA_H / 2, {
      weapon: wA, armor: aA, color: a.color, name: a.name, team: 0,
    });
    fA.showNameTag = true;
    const fB = new Fighter(C.ARENA_W / 2 + 60, C.ARENA_H / 2, {
      weapon: wB, armor: aB, color: b.color, name: b.name, team: 1,
    });
    fB.facing = Math.PI;
    fB.showNameTag = true;

    const eA = new Enemy(fA.x, fA.y, Math.min(5, Math.max(3, a.level)), { weaponId: a.weaponId, armorId: a.armorId });
    eA.fighter = fA;
    const eB = new Enemy(fB.x, fB.y, Math.min(5, Math.max(3, b.level)), { weaponId: b.weaponId, armorId: b.armorId });
    eB.fighter = fB;

    this.sectWatchingFight = true;
    this.sectFightShowResult = false;
    this.sectFightResult = {
      won: true, isSpar: true,
      discipleName: a.name,
      enemyDiff: 0, enemyWeapon: b.weaponId,
      sparNames: [a.name, b.name],
      goldGain: 0, fameGain: 0, expGain: 8, injuryGain: 0,
      levelUp: false, newTrait: null,
    };
    this._sectSwapInFighters(fA, eA, [eB]);

    // 双方获得少量经验
    this._sectGainExp(a, 8);
    this._sectGainExp(b, 8);
    a.stamina = Math.max(0, a.stamina - 10);
    b.stamina = Math.max(0, b.stamina - 10);
    this._sectAddLog(`⚔ ${a.name} vs ${b.name} 切磋开始！`, '#ff9944');
  },

  // ===== 训练（每天最多3次）=====
  _sectDoTraining() {
    // ===== 训练结算（体力门控）=====
    const dojoMul = trainExpMul(this.sect.buildings.dojo);
    const libLv = this.sect.buildings.library;
    const leader = this.sect.disciples.find(d => d.id === this.sect.leaderId);
    const leaderBonus = leader ? LEADER_BONUSES[leader.personality] : null;
    let trainedCount = 0;
    let totalExpGained = 0;
    let skippedCount = 0;
    const animDisciples = []; // 训练动画数据

    for (const d of this.sect.disciples) {
      if (d.onQuest) continue;

      const mode = TRAINING_MODES[d.trainingMode || 'normal'];
      if (mode.id === 'rest') {
        // 休养模式：仅恢复体力，不计为训练
        const oldSta = d.stamina;
        d.stamina = Math.min(100, d.stamina + mode.stamina);
        animDisciples.push({ disciple: d, oldStamina: oldSta, newStamina: d.stamina, expGain: 0 });
        continue;
      }

      // 体力门控：体力不足以支撑训练则跳过
      const staminaCost = -mode.stamina; // mode.stamina 是负数
      if (d.stamina < staminaCost) {
        skippedCount++;
        animDisciples.push({ disciple: d, oldStamina: d.stamina, newStamina: d.stamina, expGain: 0, skipped: true });
        continue;
      }

      const oldStamina = d.stamina;
      let staminaDelta = mode.stamina;
      let expGain = Math.floor(mode.exp * dojoMul);
      let riskChance = mode.risk;

      // 领头加成
      if (leaderBonus && mode.exp > 0) {
        if (leaderBonus.teamStaminaSave && staminaDelta < 0)
          staminaDelta += leaderBonus.teamStaminaSave;
        if (leaderBonus.teamExpMul)
          expGain = Math.floor(expGain * (1 + leaderBonus.teamExpMul));
        if (leaderBonus.teamRiskAdd)
          riskChance += leaderBonus.teamRiskAdd;
        if (leaderBonus.teamRiskMul !== undefined)
          riskChance *= leaderBonus.teamRiskMul;
        if (leaderBonus.condExpMul && leader && d.id !== leader.id && d.loyalty < leader.loyalty - 20)
          expGain = Math.floor(expGain * (1 + leaderBonus.condExpMul));
        if (leaderBonus.teamLoyalty)
          d.loyalty = Math.min(100, d.loyalty + leaderBonus.teamLoyalty);
      }

      // 领头本人：经验+50%
      if (d.id === this.sect.leaderId && expGain > 0)
        expGain = Math.floor(expGain * 1.5);

      // 应用体力变化
      d.stamina = Math.max(0, Math.min(100, d.stamina + staminaDelta));

      // 获得经验
      if (expGain > 0 && d.level < d.talent) {
        this._sectGainExp(d, expGain);
        trainedCount++;
        totalExpGained += expGain;

        // 藏经阁：概率获得特质
        if (libLv > 0 && d.traits.length < 3) {
          let traitChance = libLv * 0.08;
          if (leaderBonus?.traitChanceAdd) traitChance += leaderBonus.traitChanceAdd;
          if (Math.random() < traitChance) {
            const pool = COMMON_TRAITS.filter(t => !d.traits.includes(t.id));
            if (pool.length > 0) {
              const nt = pool[Math.floor(Math.random() * pool.length)];
              d.traits.push(nt.id);
              this._sectAddLog(`  📖 ${d.name}领悟「${nt.name}」`, '#ffaa44');
            }
          }
        }
      }

      // 记录动画数据
      const actualExpGain = (expGain > 0 && d.level <= d.talent) ? expGain : 0;
      animDisciples.push({ disciple: d, oldStamina, newStamina: d.stamina, expGain: actualExpGain });

      // 极限模式：受伤风险
      if (riskChance > 0 && Math.random() < riskChance) {
        const injAmount = 15 + Math.floor(Math.random() * 10);
        d.injury = Math.min(100, d.injury + injAmount);
        this._sectAddLog(`  🤕 ${d.name}训练受伤(+${injAmount})`, '#ff6644');
      }

      // 忠诚变化（极限模式-1）
      if (mode.loyaltyMod)
        d.loyalty = Math.max(0, Math.min(100, d.loyalty + mode.loyaltyMod));

      // 体力过低自动降档至休养
      if (d.stamina < 10 && d.trainingMode !== 'rest') {
        d.trainingMode = 'rest';
        this._sectAddLog(`  💤 ${d.name}体力不足，自动切换休养`, '#ff9944');
      }
    }

    if (trainedCount > 0) {
      this.sect.stats.totalTrains++;
      const skipNote = skippedCount > 0 ? `，${skippedCount}人体力不足` : '';
      this._sectAddLog(`📊 训练：${trainedCount}人修炼，共+${totalExpGained}exp${skipNote}`, '#4499ff');
    } else if (skippedCount > 0) {
      this._sectAddLog(`📊 全员体力不足，无法训练`, '#ff9944');
    } else {
      this._sectAddLog(`📊 训练：全员休养`, '#88aacc');
    }

    // 如果有弟子，播放训练动画
    if (animDisciples.length > 0) {
      let speakers = [];
      if (isDialogueEnabled('training')) {
        const trainees = animDisciples.map(ad => ad.disciple);
        speakers = pickGroupSpeakers(trainees, Math.min(3, trainees.length));
      }
      this.sectTrainAnimData = {
        type: animDisciples.length === 1 ? 'single' : 'batch',
        disciples: animDisciples,
        speakers,
      };
      this.sectTrainAnim = true;
      this.sectTrainAnimProgress = 0;
      this.sectTrainAnimWait = false;
      // 动画结束后不调用 _sectFinishDay，训练是独立操作
      this._sectTrainAnimCallback = null;
    }

    // 自动存档
    if (isAutoSaveOn()) {
      autoSaveSect(this.sect);
    }
  },

  // ===== 下一天 =====
  _sectNextDay() {
    this.sect.day++;
    this.sect.stats.totalDays++;

    // 被动收入
    const income = dailyIncome(this.sect.buildings.bank);
    if (income > 0) {
      this.sect.gold += income;
      this.sect.stats.totalGold += income;
    }

    // 受伤恢复 + 忠诚回升（每天自动）
    const hMul = healMul(this.sect.buildings.clinic);
    for (const d of this.sect.disciples) {
      if (d.onQuest) continue;
      if (d.injury > 0)
        d.injury = Math.max(0, d.injury - Math.floor(15 * hMul));
      if (d.loyalty < 60) d.loyalty += 1;
    }

    // 保存收入值供 _sectFinishDay 使用
    this._sectDayIncome = income;

    // 直接完成后续
    this._sectFinishDay();
  },

  // ===== 下一天（后半段：事件、任务、商店等）=====
  _sectFinishDay() {
    const income = this._sectDayIncome || 0;

    // 刷新任务
    this._sectRefreshQuests();

    // 刷新宗门商店（每天）
    this._sectRefreshShop();

    // 随机事件（60%概率）
    if (Math.random() < 0.6) {
      const evt = rollEvent(this.sect);
      let showEvent = true;
      // 处理需要弟子名的事件
      if (evt.id === 'breakthrough') {
        const candidates = this.sect.disciples.filter(d => d.level < d.talent);
        if (candidates.length > 0) {
          const d = candidates[Math.floor(Math.random() * candidates.length)];
          evt.desc = evt.desc.replace('{disciple}', d.name);
          evt._targetDiscipleId = d.id;
        } else {
          showEvent = false; // 无可突破的弟子，跳过此事件
        }
      } else if (evt.id === 'betrayal') {
        const d = this.sect.disciples.filter(d => d.loyalty < 50).sort((a, b) => a.loyalty - b.loyalty)[0];
        if (d) {
          evt.desc = evt.desc.replace('{disciple}', d.name);
          evt._targetDiscipleId = d.id;
        }
      } else if (evt.id === 'rivalry' || evt.id === 'friendship') {
        const pool = this.sect.disciples.filter(d => !d.onQuest);
        if (pool.length >= 2) {
          const shuffled = [...pool].sort(() => Math.random() - 0.5);
          evt.desc = evt.desc.replace('{discipleA}', shuffled[0].name).replace('{discipleB}', shuffled[1].name);
          evt._targetDiscipleIdA = shuffled[0].id;
          evt._targetDiscipleIdB = shuffled[1].id;
        } else {
          showEvent = false;
        }
      }
      if (showEvent) {
        this.sect.pendingEvent = evt;
        this.sectPopup = 'event';
      }
    }

    // 客栈来客（招募机会）
    const innLv = this.sect.buildings.inn;
    if (innLv > 0 && this.sect.disciples.length < maxDisciples(this.sect.buildings.barracks)) {
      if (Math.random() < 0.15 * innLv) {
        const talent = 1 + Math.floor(Math.random() * Math.min(4, 1 + Math.floor(this.sect.fame / 25)));
        const recruit = createDisciple({ talent, joinDay: this.sect.day, loyalty: 55 + Math.floor(Math.random() * 20) });
        this.sect.disciples.push(recruit);
        this._sectAddLog(`🏨 ${recruit.name}(资质${recruit.talent})慕名而来！`, '#44dd88');
      }
    }

    this._sectAddLog(`━ 第${this.sect.day}天 ━ ${income > 0 ? `收入+${income}💰` : ''}`, '#888');

    // 日常对话（新的一天，随机一名弟子说话）
    if (isDialogueEnabled('life') && this.sect.disciples.length > 0) {
      const pool = this.sect.disciples.filter(d => !d.onQuest);
      if (pool.length > 0) {
        const d = pool[Math.floor(Math.random() * pool.length)];
        const p = d.personality || 'diligent';
        // 根据弟子状态选择日常情境
        let ctx = 'dawn';
        if (d.injury > 40) ctx = 'injured_rest';
        else if (d.loyalty >= 85) ctx = 'loyal_high';
        else if (d.loyalty <= 30) ctx = 'loyal_low';
        const line = pickLifeLine(p, ctx, d.id);
        if (line && line !== '……') {
          const pType = PERSONALITY_TYPES[p];
          this._sectAddLog(`💬 ${d.name}：「${line}」`, pType?.color || '#aaa');
        }
      }
    }

    // 检查剧情触发（仅在没有事件弹窗时）
    if (!this.sectPopup) {
      this._sectCheckStory();
    }
    this._sectCheckAchievements();

    // 自动存档
    if (isAutoSaveOn()) {
      autoSaveSect(this.sect);
    }
  },

  // ===== 事件选择处理 =====
  _sectHandleEventChoice(choiceIndex) {
    const evt = this.sect.pendingEvent;
    if (!evt) return;
    const choice = evt.choices[choiceIndex];
    if (!choice) return;

    switch (choice.effect) {
      case 'none':
        break;

      case 'addDisciple': {
        if (this.sect.disciples.length >= maxDisciples(this.sect.buildings.barracks)) {
          this._sectAddLog('弟子已满编，无法收留', '#ff6644');
          break;
        }
        const p = choice.params;
        const talent = p.talentMin + Math.floor(Math.random() * (p.talentMax - p.talentMin + 1));
        const d = createDisciple({ talent, loyalty: p.loyaltyBase + Math.floor(Math.random() * 15), joinDay: this.sect.day });
        this.sect.disciples.push(d);
        this._sectAddLog(`✅ ${d.name}(资质${talent})加入门派`, '#44dd88');
        break;
      }

      case 'addProdigy': {
        const p = choice.params;
        if (this.sect.gold < p.cost) { this._sectAddLog('银两不足', '#ff6644'); break; }
        if (this.sect.disciples.length >= maxDisciples(this.sect.buildings.barracks)) { this._sectAddLog('弟子已满编', '#ff6644'); break; }
        this.sect.gold -= p.cost;
        const talent = p.talent[0] + Math.floor(Math.random() * (p.talent[1] - p.talent[0] + 1));
        const d = createDisciple({ talent, loyalty: 70 + Math.floor(Math.random() * 15), joinDay: this.sect.day });
        this.sect.disciples.push(d);
        this._sectAddLog(`🌟 天才${d.name}(资质${talent})入门！`, '#ffdd00');
        break;
      }

      case 'raidBattle': {
        const p = choice.params;
        const freeD = this.sect.disciples.filter(d => !d.onQuest && d.injury < 60);
        if (freeD.length === 0) { this._sectAddLog('无人可战！声望-10', '#ff6644'); this.sect.fame = Math.max(0, this.sect.fame - 10); break; }
        const diff = p.diff[0] + Math.floor(Math.random() * (p.diff[1] - p.diff[0] + 1));
        // 打开弟子选择弹窗
        this.sect._pendingEventFight = { name: '山贼围攻', icon: '💀', diff, weapon: 'dao', reward: { gold: 100, fame: 12, exp: 20 } };
        this.sect.pendingEvent = null;
        this.sectPopup = 'eventFightSelect';
        return;
      }

      case 'payGold': {
        if (this.sect.gold < choice.params.amount) {
          this._sectAddLog('银两不足，被迫应战！', '#ff6644');
          // 触发战斗（找同事件的战斗参数）
          const battleChoice = evt.choices.find(c => c.effect === 'raidBattle');
          if (battleChoice) {
            const p = battleChoice.params;
            const freeD = this.sect.disciples.filter(d => !d.onQuest && d.injury < 60);
            if (freeD.length === 0) { this._sectAddLog('无人可战！声望-10', '#ff6644'); this.sect.fame = Math.max(0, this.sect.fame - 10); break; }
            const diff = p.diff[0] + Math.floor(Math.random() * (p.diff[1] - p.diff[0] + 1));
            this.sect._pendingEventFight = { name: '山贼围攻', icon: '💀', diff, weapon: 'dao', reward: { gold: 100, fame: 12, exp: 20 } };
            this.sect.pendingEvent = null;
            this.sectPopup = 'eventFightSelect';
            return;
          }
          break;
        }
        this.sect.gold -= choice.params.amount;
        this._sectAddLog(`交了${choice.params.amount}银两保护费`, '#ff6644');
        break;
      }

      case 'buyElixir': {
        if (this.sect.gold < choice.params.cost) { this._sectAddLog('银两不足', '#ff6644'); break; }
        this.sect.gold -= choice.params.cost;
        // 给受伤最重的弟子回复
        const injured = [...this.sect.disciples].sort((a, b) => b.injury - a.injury);
        if (injured.length > 0 && injured[0].injury > 0) {
          injured[0].injury = Math.max(0, injured[0].injury - 50);
          this._sectAddLog(`💊 ${injured[0].name} 服用秘药，伤势大幅恢复`, '#44dd88');
        } else {
          this._sectAddLog('💊 购得秘药备用', '#44dd88');
        }
        break;
      }

      case 'buyArmor': {
        if (this.sect.gold < choice.params.cost) { this._sectAddLog('银两不足', '#ff6644'); break; }
        this.sect.gold -= choice.params.cost;
        // 随机品质（黑市商人：fine概率更高）
        const buyQuality = Math.random() < 0.4 ? 'fine' : 'normal';
        const buyArmorId = ['light', 'medium', 'heavy'][Math.min(2, this.sect.buildings.smith)];
        this.sect.inventory.push({ type: 'armor', id: buyArmorId, quality: buyQuality });
        const armorName = itemLabel(ARMOR_NAMES[buyArmorId], buyQuality);
        this._sectAddLog(`🛡 购得${armorName}，已加入背包`, ITEM_QUALITY[buyQuality].color);
        break;
      }

      case 'grantBreakthrough': {
        const d = this.sect.disciples.find(d => d.id === evt._targetDiscipleId);
        if (d) {
          const exp = choice.params?.exp || 30;
          this._sectGainExp(d, exp);
          this._sectAddLog(`💡 ${d.name} 顿悟，经验+${exp}`, '#ffdd00');
        }
        break;
      }

      case 'breakthroughTrait': {
        const d = this.sect.disciples.find(d => d.id === evt._targetDiscipleId);
        if (d) {
          if (d.traits.length < 3) {
            const pool = COMMON_TRAITS.filter(t => !d.traits.includes(t.id));
            if (pool.length > 0) {
              const nt = pool[Math.floor(Math.random() * pool.length)];
              d.traits.push(nt.id);
              this._sectAddLog(`💡 ${d.name} 参悟武学，领悟「${nt.name}」！`, '#ffaa44');
            } else {
              this._sectGainExp(d, 40);
              this._sectAddLog(`💡 ${d.name} 已无可学特质，转化为经验+40`, '#ffdd00');
            }
          } else {
            this._sectGainExp(d, 40);
            this._sectAddLog(`💡 ${d.name} 特质已满，转化为经验+40`, '#ffdd00');
          }
        }
        break;
      }

      case 'alliancePay': {
        const p = choice.params;
        if (this.sect.gold < p.cost) { this._sectAddLog('银两不足', '#ff6644'); break; }
        this.sect.gold -= p.cost;
        this.sect.fame += p.fame;
        this.sect.stats.highestFame = Math.max(this.sect.stats.highestFame, this.sect.fame);
        this._sectAddLog(`🤝 盛情款待来客，声望+${p.fame}`, '#44dd88');
        break;
      }

      case 'donationTrain': {
        let count = 0;
        for (const d of this.sect.disciples) {
          if (d.level < d.talent) {
            this._sectGainExp(d, 20);
            count++;
          }
        }
        this._sectAddLog(`📖 富商资助训练，${count}人各+20exp`, '#4499ff');
        break;
      }

      case 'punishBoth': {
        const dA = this.sect.disciples.find(d => d.id === evt._targetDiscipleIdA);
        const dB = this.sect.disciples.find(d => d.id === evt._targetDiscipleIdB);
        if (dA) dA.loyalty = Math.max(0, dA.loyalty - 5);
        if (dB) dB.loyalty = Math.max(0, dB.loyalty - 5);
        this._sectAddLog(`⚡ 各打五十大板，二人忠诚-5`, '#ff9944');
        break;
      }

      case 'sparRivalry': {
        const dA = this.sect.disciples.find(d => d.id === evt._targetDiscipleIdA);
        const dB = this.sect.disciples.find(d => d.id === evt._targetDiscipleIdB);
        if (dA) this._sectGainExp(dA, 15);
        if (dB) this._sectGainExp(dB, 15);
        this._sectAddLog(`⚔ 安排正式比武，双方各+15exp`, '#4499ff');
        break;
      }

      case 'friendBoost': {
        const dA = this.sect.disciples.find(d => d.id === evt._targetDiscipleIdA);
        const dB = this.sect.disciples.find(d => d.id === evt._targetDiscipleIdB);
        if (dA) dA.loyalty = Math.min(100, dA.loyalty + 10);
        if (dB) dB.loyalty = Math.min(100, dB.loyalty + 10);
        this._sectAddLog(`💞 嘉许互相扶持，二人忠诚+10`, '#ff88cc');
        break;
      }

      case 'studyManual': {
        const freeD = this.sect.disciples.filter(d => !d.onQuest && d.level < d.talent);
        if (freeD.length === 0) { this._sectAddLog('无人可用', '#ff6644'); break; }
        const d = freeD[Math.floor(Math.random() * freeD.length)];
        this._sectGainExp(d, 30);
        this._sectAddLog(`📕 ${d.name} 研读秘籍，经验+30`, '#ffaa44');
        break;
      }

      case 'payRepair': {
        const p = choice.params;
        if (this.sect.gold < p.cost) { this._sectAddLog('银两不足，设施受损！', '#ff6644'); this._sectApplyArsonDamage(); break; }
        this.sect.gold -= p.cost;
        this._sectAddLog(`🔥 紧急修缮完成，花费${p.cost}银`, '#ff9944');
        break;
      }

      case 'arsonDamage': {
        this._sectApplyArsonDamage();
        break;
      }

      case 'trialChallenge': {
        const freeD = this.sect.disciples.filter(d => !d.onQuest && d.injury < 60);
        if (freeD.length === 0) { this._sectAddLog('无人可派', '#ff6644'); break; }
        const d = freeD[Math.floor(Math.random() * freeD.length)];
        const luck = Math.random();
        if (luck < 0.35) {
          // 大成功：经验+武器
          this._sectGainExp(d, 50);
          const loot = { type: 'weapon', id: WEAPON_IDS[Math.floor(Math.random() * WEAPON_IDS.length)], quality: Math.random() < 0.3 ? 'rare' : 'fine' };
          this.sect.inventory.push(loot);
          const itemName = WEAPON_NAMES[loot.id];
          this._sectAddLog(`⛩ ${d.name} 秘境大成！+50exp，获得${itemLabel(itemName, loot.quality)}`, '#ffd700');
        } else if (luck < 0.65) {
          // 小成功：经验
          this._sectGainExp(d, 35);
          this._sectAddLog(`⛩ ${d.name} 秘境有所收获，+35exp`, '#4499ff');
        } else {
          // 失败：受伤
          d.injury = Math.min(100, d.injury + 25);
          this._sectGainExp(d, 10);
          this._sectAddLog(`⛩ ${d.name} 秘境历险受伤(+25)，但增长了见识+10exp`, '#ff6644');
        }
        break;
      }

      case 'herbHeal': {
        for (const d of this.sect.disciples) d.injury = Math.max(0, d.injury - 20);
        this._sectAddLog(`🌿 采集灵药，全员伤势-20`, '#44dd88');
        break;
      }

      case 'herbSell': {
        const bonus = 300; // 100*3天 一次性给
        this.sect.gold += bonus;
        this.sect.stats.totalGold += bonus;
        this._sectAddLog(`🌿 移栽药田出售，获得${bonus}银`, '#ffd700');
        break;
      }

      case 'retainDisciple': {
        if (this.sect.gold < choice.params.cost) { this._sectAddLog('银两不足', '#ff6644'); break; }
        this.sect.gold -= choice.params.cost;
        const d = this.sect.disciples.find(d => d.id === evt._targetDiscipleId);
        if (d) { d.loyalty = Math.min(100, d.loyalty + 30); this._sectAddLog(`${d.name} 被挽留，忠诚+30`, '#44dd88'); }
        break;
      }

      case 'removeDisciple': {
        const idx = this.sect.disciples.findIndex(d => d.id === evt._targetDiscipleId);
        if (idx >= 0) {
          this._sectAddLog(`${this.sect.disciples[idx].name} 离开了门派`, '#ff6644');
          this.sect.disciples.splice(idx, 1);
        }
        break;
      }

      case 'gainFame':
        this.sect.fame += choice.params.fame;
        this._sectAddLog(`🤝 结盟成功，声望+${choice.params.fame}`, '#44dd88');
        break;

      case 'cureAll':
        if (this.sect.gold < choice.params.cost) { this._sectAddLog('银两不足', '#ff6644'); break; }
        this.sect.gold -= choice.params.cost;
        for (const d of this.sect.disciples) d.injury = Math.max(0, d.injury - 30);
        this._sectAddLog('💊 全员得到治疗', '#44dd88');
        break;

      case 'plagueAll':
        for (const d of this.sect.disciples) d.stamina = Math.max(0, d.stamina - 30);
        this._sectAddLog('🤒 全员体力下降', '#ff6644');
        break;

      case 'gainGold': {
        const g = choice.params.gold;
        const amount = g[0] + Math.floor(Math.random() * (g[1] - g[0] + 1));
        this.sect.gold += amount;
        this.sect.stats.totalGold += amount;
        this._sectAddLog(`💎 获得${amount}银两捐赠`, '#ffd700');
        break;
      }

      case 'duelChallenge': {
        const p = choice.params;
        const freeD = this.sect.disciples.filter(d => !d.onQuest && d.injury < 60);
        if (freeD.length === 0) { this._sectAddLog('无人可战！声望-15', '#ff6644'); this.sect.fame = Math.max(0, this.sect.fame - 15); break; }
        const diff = p.diff[0] + Math.floor(Math.random() * (p.diff[1] - p.diff[0] + 1));
        const weapon = WEAPON_IDS[Math.floor(Math.random() * WEAPON_IDS.length)];
        // 打开弟子选择弹窗
        this.sect._pendingEventFight = { name: '江湖挑战', icon: '📜', diff, weapon, reward: { gold: 150, fame: 20, exp: 35 } };
        this.sect.pendingEvent = null;
        this.sectPopup = 'eventFightSelect';
        return;
      }

      case 'loseFame':
        this.sect.fame = Math.max(0, this.sect.fame - choice.params.fame);
        this._sectAddLog(`声望-${choice.params.fame}`, '#ff6644');
        break;

      case 'treasureHunt': {
        const freeD = this.sect.disciples.filter(d => !d.onQuest && d.injury < 60);
        if (freeD.length === 0) { this._sectAddLog('无人可派', '#ff6644'); break; }
        const explorer = freeD[Math.floor(Math.random() * freeD.length)];
        const luck = Math.random();
        if (luck < 0.4) {
          const gold = 200 + Math.floor(Math.random() * 300);
          this.sect.gold += gold;
          this.sect.stats.totalGold += gold;
          this._sectAddLog(`🗺 ${explorer.name} 寻宝成功！+${gold}💰`, '#ffd700');
        } else if (luck < 0.7) {
          this._sectGainExp(explorer, 40);
          this._sectAddLog(`🗺 ${explorer.name} 虽未寻到宝物，但修为大增 +40exp`, '#4499ff');
        } else {
          explorer.injury = Math.min(100, explorer.injury + 15);
          this._sectAddLog(`🗺 ${explorer.name} 探索受伤，铩羽而归`, '#ff6644');
        }
        break;
      }
    }

    this.sect.pendingEvent = null;
    this.sectPopup = null;

    // 事件反应台词
    if (isDialogueEnabled('life') && this.sect.disciples.length > 0) {
      const pool2 = this.sect.disciples.filter(d => !d.onQuest);
      if (pool2.length > 0) {
        const rd = pool2[Math.floor(Math.random() * pool2.length)];
        // 根据事件正面/负面选择情境
        const isGood = evt && ['wanderer','prodigy','merchant','treasure','friendship','tourneyInvite','herbGarden','secretManual'].includes(evt.id);
        const ctx2 = isGood ? 'event_good' : 'event_bad';
        const line2 = pickLifeLine(rd.personality || 'diligent', ctx2, rd.id);
        if (line2 && line2 !== '……') {
          this._sectAddLog(`💬 ${rd.name}：「${line2}」`, PERSONALITY_TYPES[rd.personality]?.color || '#aaa');
        }
      }
    }

    // 事件处理后检查剧情
    this._sectCheckStory();
  },

  // ===== 纵火损失 =====
  _sectApplyArsonDamage() {
    // 随机降低一个已升级设施的等级
    const upgraded = Object.entries(this.sect.buildings).filter(([, lv]) => lv > 0);
    if (upgraded.length > 0) {
      const [bid] = upgraded[Math.floor(Math.random() * upgraded.length)];
      this.sect.buildings[bid] = Math.max(0, this.sect.buildings[bid] - 1);
      const bld = BUILDINGS[bid];
      this._sectAddLog(`🔥 ${bld?.name || bid} 被烧毁，等级降至Lv${this.sect.buildings[bid]}`, '#ff4444');
    }
    // 全员体力下降
    for (const d of this.sect.disciples) d.stamina = Math.max(0, d.stamina - 20);
    this._sectAddLog(`🔥 门派遭纵火，全员体力-20`, '#ff6644');
  },

  // ===== 存档 =====
  _sectHandleSaveSlot(slot, mode) {
    if (mode === 'save') {
      saveSect(slot, this.sect);
      this._sectAddLog(`💾 存档成功 (槽位${slot + 1})`, '#44dd88');
    } else {
      const loaded = loadSect(slot);
      if (loaded) {
        this.sect = loaded;
        this.sect._selectedDisciple = null;
        // 兼容旧存档
        if (!this.sect.storyProgress) this.sect.storyProgress = [];
        if (this.sect.pendingStory === undefined) this.sect.pendingStory = null;
        if (!this.sect.inventory) this.sect.inventory = [];
        if (!this.sect.shop) this.sect.shop = { items: [], refreshDay: 0 };
        for (const d of this.sect.disciples) {
          if (!d.weaponQuality) d.weaponQuality = 'normal';
          if (!d.armorQuality) d.armorQuality = 'normal';
          if (d.hpBonus === undefined) d.hpBonus = 0;
          if (!d.personality) d.personality = Object.keys(PERSONALITY_TYPES)[Math.floor(Math.random() * 6)];
          if (!d.trainingMode) d.trainingMode = 'normal';
        }
        if (this.sect.leaderId === undefined) this.sect.leaderId = null;
        if (this.sect.trainedToday !== undefined) delete this.sect.trainedToday;
        this._sectAddLog(`📂 读档成功`, '#44dd88');
      }
    }
    this.sectPopup = 'settings';
  },

  // ===== 成就检查 =====
  _sectCheckAchievements() {
    const newly = checkNewAchievements(this.sect);
    for (const id of newly) {
      const ach = getAchievement(id);
      if (!ach) continue;
      this.sect.achievements.push(id);
      // 发放奖励
      if (ach.reward?.gold)  { this.sect.gold  += ach.reward.gold;  this.sect.stats.totalGold += ach.reward.gold; }
      if (ach.reward?.fame)  { this.sect.fame  += ach.reward.fame;  this.sect.stats.highestFame = Math.max(this.sect.stats.highestFame, this.sect.fame); }
      this.sectAchievementQueue.push(id);
      this._sectAddLog(`🏆 解锁成就「${ach.name}」${ach.reward?.gold ? `+${ach.reward.gold}💰` : ''}${ach.reward?.fame ? `+${ach.reward.fame}🏆` : ''}`, ach.color);
    }
  },

  // ===== 剧情检查 =====
  _sectCheckStory() {
    const story = checkStoryTrigger(this.sect);
    if (story) {
      // 深拷贝剧情节点（避免修改原始数据）
      const storyInstance = { ...story, pages: [...story.pages] };
      // 替换模板变量
      for (let i = 0; i < storyInstance.pages.length; i++) {
        storyInstance.pages[i] = storyInstance.pages[i].replace(/\{sect\}/g, this.sect.sectName);
      }
      // 动态页内容替换
      if (storyInstance.dynamicPage !== undefined) {
        const s = this.sect;
        const pi = storyInstance.dynamicPage;
        storyInstance.pages[pi] = `目前战绩 ${s.stats.totalWins}胜${s.stats.totalFights - s.stats.totalWins}负，声望${s.fame}，弟子${s.disciples.length}人。`;
      }
      this.sect.pendingStory = storyInstance;
      this.sectPopup = 'story';
      this.sectStoryPageIdx = 0;
    }
  },

  // ===== Toast通知（屏幕上方短暂提示）=====
  _sectShowToast(text, color = '#ffcc44') {
    this.sectToast = { text, color, timer: 2.0 };
  },

  // ===== 日志 =====
  _sectAddLog(text, color = '#ccc') {
    this.sect.log.unshift({ text: `[${this.sect.day}天] ${text}`, color, time: Date.now() });
    if (this.sect.log.length > 50) this.sect.log.pop();
  },

  // ===== 渲染 =====
  _renderSect() {
    const dpr = this.canvas._dpr || 1;
    const lw = this.canvas._logicW || this.canvas.width;
    const lh = this.canvas._logicH || this.canvas.height;
    const ctx = this.renderer.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const narrow = lw < 500;

    // 如果在观战模式
    if (this.sectWatchingFight) {
      this.sectUI._buttons = []; // 重置按钮列表
      this.renderer.clear(lw, lh);
      ctx.save();
      this.camera.applyWorldTransform(ctx);
      this.renderer.drawGrid();
      for (const f of this.allFighters) {
        this.renderer.drawFighter(f);
      }
      this.renderer.drawParticles(this.particles);
      this.renderer.drawFloatingTexts(this.floatingTexts);
      ctx.restore();

      // 屏幕闪光（命中/受伤）
      if (this.screenFlash && this.screenFlash.timer > 0) {
        ctx.fillStyle = this.screenFlash.color || 'rgba(255,255,255,0.3)';
        ctx.globalAlpha = Math.min(1, this.screenFlash.timer);
        ctx.fillRect(0, 0, lw, lh);
        ctx.globalAlpha = 1;
      }

      // HUD
      const fA = this.player.fighter;
      const fB = this.enemies[0]?.fighter;
      if (fA && fB) {
        this.ui.draw(fA, fB, [fB], 0);
      }

      // ===== 战斗对话气泡渲染 =====
      if (this.sectSpeechBubbles.length > 0) {
        this._sectDrawSpeechBubbles(ctx, lw, lh, narrow);
      }

      // ===== 返回按钮（Canvas内，替代HTML touchBack）=====
      if (this._victoryTimer < 0) {
        const bbW = narrow ? 52 : 60;
        const bbH = narrow ? 24 : 28;
        const bbX = 8;
        const bbY = narrow ? 30 : 36;
        const bbHovered = hit(this.input.mouseX, this.input.mouseY, bbX, bbY, bbW, bbH);
        ctx.globalAlpha = bbHovered ? 0.9 : 0.5;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(bbX, bbY, bbW, bbH);
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.strokeRect(bbX, bbY, bbW, bbH);
        ctx.fillStyle = '#ddd';
        ctx.font = `${narrow ? 10 : 12}px "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('← 跳过', bbX + bbW / 2, bbY + bbH / 2 + 4);
        ctx.globalAlpha = 1;
        // 注册为可点击区域
        this.sectUI._buttons.push({ x: bbX, y: bbY, w: bbW, h: bbH, action: { type: 'skipFight' } });
      }

      // 计时器
      ctx.textAlign = 'center';
      ctx.fillStyle = '#888';
      ctx.font = `${narrow ? 10 : 12}px "Microsoft YaHei", sans-serif`;
      if (this._victoryTimer < 0) {
        ctx.fillText(`${Math.ceil(Math.max(0, 45 - this.gameTime))}s`, lw / 2, narrow ? 16 : 20);
      }

      // 模式标签 + 战斗上下文
      ctx.fillStyle = '#ffcc44';
      ctx.font = `bold ${narrow ? 12 : 14}px "Microsoft YaHei", sans-serif`;
      let contextLabel = '🏯 宗门风云 · 战斗进行中';
      if (this.sectPendingQuest) {
        contextLabel = `🏯 ${this.sect.sectName} · ${this.sectPendingQuest.icon || ''}${this.sectPendingQuest.name}`;
      } else if (this.sectFightResult && this.sectFightResult.isSpar) {
        contextLabel = `⚔ 门派切磋`;
      }
      ctx.fillText(contextLabel, lw / 2, lh - 20);
      if (this.sectPendingDisciple) {
        ctx.fillStyle = '#aaa';
        ctx.font = `${narrow ? 10 : 11}px "Microsoft YaHei", sans-serif`;
        ctx.fillText(`出征弟子: ${this.sectPendingDisciple.name}  敌方: D${this.sectPendingQuest ? this.sectPendingQuest.enemyDiff : '?'}`, lw / 2, lh - 6);
      }

      // 阶段1：战斗进行中 → 居中大图（半透明）
      if (this._victoryTimer < 0 && this.sectPendingQuest?.enemyFemale) {
        this.sectUI.drawFightEnemyPortrait(ctx, this.sectPendingQuest, lw, lh, narrow);
      }

      // 阶段2：胜利后、结算前 → 全屏立绘揭示
      const _inPortraitRender = this._victoryTimer >= 0 && !this.sectFightShowResult
        && this.sectFightResult?.won && this.sectFightResult?.enemyFemale;
      if (_inPortraitRender) {
        this.sectUI.drawVictoryPortrait(ctx, this.sectFightResult, lw, lh, narrow, this._victoryTimer);
      }

      // 阶段3：结算面板
      if (this.sectFightShowResult && this.sect.pendingFightResult) {
        this.sectUI.drawFightResult(ctx, lw, lh, this.sect.pendingFightResult, mx, my, narrow);
      }
      return;
    }

    // 管理界面
    this.sectUI.draw(ctx, lw, lh, this.sect, this.sectSubPage, mx, my);

    // 训练动画覆盖层
    if (this.sectTrainAnim && this.sectTrainAnimData) {
      this.sectUI.drawTrainAnim(ctx, lw, lh, this.sectTrainAnimProgress, narrow, this.sectTrainAnimData, this.sectTrainAnimWait);
    }

    // 弹窗层（清空底层按钮，防止点击穿透）
    if (this.sectPopup) {
      this.sectUI._buttons = [];
    }
    if (this.sectPopup === 'story' && this.sect.pendingStory) {
      this.sectUI.drawStoryPopup(ctx, lw, lh, this.sect.pendingStory, this.sectStoryPageIdx, mx, my, narrow);
    } else if (this.sectPopup === 'event' && this.sect.pendingEvent) {
      this.sectUI.drawEventPopup(ctx, lw, lh, this.sect.pendingEvent, mx, my, narrow);
    } else if (this.sectPopup === 'discipleSelect') {
      const free = this.sect.disciples.filter(d => !d.onQuest && d.injury < 50 && d.stamina >= 30);
      this.sectUI.drawDiscipleSelect(ctx, lw, lh, free, mx, my, narrow);
    } else if (this.sectPopup === 'fightResult' && this.sect.pendingFightResult) {
      this.sectUI.drawFightResult(ctx, lw, lh, this.sect.pendingFightResult, mx, my, narrow);
    } else if (this.sectPopup === 'saveSlots') {
      const slots = getSaveSlots();
      this.sectUI.drawSaveSlots(ctx, lw, lh, slots, this.sectSaveMode, mx, my, narrow);
    } else if (this.sectPopup === 'equipSelect' && this.sect._armorSelectDisciple) {
      const availArmors = availableArmors(this.sect.buildings.smith);
      this.sectUI.drawEquipSelect(ctx, lw, lh, this.sect._armorSelectDisciple, this.sect._equipSelectType, this.sect.inventory, availArmors, mx, my, narrow);
    } else if (this.sectPopup === 'dismissConfirm' && this.sect._dismissTarget) {
      this.sectUI.drawDismissConfirm(ctx, lw, lh, this.sect._dismissTarget, mx, my, narrow);
    } else if (this.sectPopup === 'eventFightSelect') {
      const free = this.sect.disciples.filter(d => !d.onQuest && d.injury < 60);
      const ef = this.sect._pendingEventFight;
      this.sectUI.drawEventFightSelect(ctx, lw, lh, free, ef, mx, my, narrow);
    } else if (this.sectPopup === 'settings') {
      this.sectUI.drawSettings(ctx, lw, lh, mx, my, narrow);
    } else if (this.sectPopup === 'talentSelect') {
      const eligible = this.sect.disciples.filter(d => d.talent < 5);
      this.sectUI.drawTalentSelect(ctx, lw, lh, eligible, mx, my, narrow);
    } else if (this.sectPopup === 'achievement' && this.sectAchievementCurrent) {
      const ach = getAchievement(this.sectAchievementCurrent);
      if (ach) this.sectUI.drawAchievementPopup(ctx, lw, lh, ach, mx, my, narrow);
    }

    // Toast通知（屏幕上方浮动提示）
    if (this.sectToast) {
      const t = this.sectToast;
      const alpha = Math.min(1, t.timer * 2); // 最后0.5秒渐隐
      ctx.globalAlpha = alpha;
      const tw = Math.min(lw - 40, ctx.measureText(t.text).width + 40);
      const tx = (lw - tw) / 2;
      const ty = narrow ? 70 : 80;
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(tx, ty, tw, 32);
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(tx, ty, tw, 32);
      ctx.fillStyle = t.color;
      ctx.font = `bold ${narrow ? 12 : 14}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(t.text, lw / 2, ty + 20);
      ctx.globalAlpha = 1;
    }
  },
};
