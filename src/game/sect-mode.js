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
import { saveSect, loadSect, getSaveSlots } from './sect-save.js';
import {
  createInitialState, createDisciple, generateQuest, rollEvent,
  BUILDINGS, maxDisciples, availableArmors, trainExpMul, healMul,
  dailyIncome, expToLevel, TRAITS, TRAIT_LIST, COMMON_TRAITS,
  WEAPON_IDS, WEAPON_NAMES, ARMOR_NAMES, resetDiscipleIdCounter,
  checkStoryTrigger, ITEM_QUALITY, rollLootDrop, itemLabel,
  FAME_TIERS, getFameTier, SHOP_POOL, refreshShopItems,
  PERSONALITY_TYPES, pickTrainLine, pickGroupSpeakers,
} from './sect-data.js';
import { checkNewAchievements, getAchievement } from './sect-achievements.js';
import { resetDialogueMemory } from './sect-dialogues.js';

export const sectModeMethods = {

  // ===== 初始化 =====
  _setupSectMode(savedState) {
    this.sect = savedState || createInitialState();
    this.sectUI = new SectUI();
    this.sectSubPage = 'main'; // main | disciples | buildings | quests | market | log | disciple_detail
    this.sectPopup = null;     // null | 'event' | 'discipleSelect' | 'fightResult' | 'saveSlots' | 'armorSelect'
    this.sectSaveMode = 'save';
    this.sectTrainAnim = 0;    // 训练进度动画 0-1，>0 时播放
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

    // 训练动画数据
    this.sectTrainAnimData = null;   // { type, disciplines, speakers }
    this.sectTrainAnimWait = false;  // 等待点击继续

    // 成就系统
    this.sectAchievementQueue = [];  // 待展示的成就ID队列
    this.sectAchievementCurrent = null; // 当前展示的成就ID

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
    }
    // 兼容旧存档（没有achievements字段）
    if (!this.sect.achievements) this.sect.achievements = [];
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

    // 训练动画：新状态机
    if (this.sectTrainAnim > 0) {
      // 进度推进 (2秒完成 0→0.95)
      if (!this.sectTrainAnimWait) {
        this.sectTrainAnim = Math.min(0.95, this.sectTrainAnim + dt * 0.48);
        if (this.sectTrainAnim >= 0.95) this.sectTrainAnimWait = true;
      }
      // 检测：点击、空格、Enter 确认执行训练
      if (this.sectTrainAnimWait &&
          (input.mouseLeftDown || input.pressed('Space') || input.pressed('Enter') || input.pressed('KeyZ'))) {
        const ad = this.sectTrainAnimData;
        if (ad?.type === 'group') {
          this._sectDoTrainAll();
        } else if (ad?.type === 'single' && ad.disciples[0]) {
          this._sectTrainDisciple(ad.disciples[0].disciple);
        }
        this.sectTrainAnim = 0;
        this.sectTrainAnimWait = false;
        this.sectTrainAnimData = null;
      }
      return;
    }

    // Toast倒计时
    if (this.sectToast) {
      this.sectToast.timer -= dt;
      if (this.sectToast.timer <= 0) this.sectToast = null;
    }

    // 成就队列：无其他弹窗时弹出
    if (!this.sectPopup && !this.sectTrainAnim && this.sectAchievementQueue.length > 0) {
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

      // 正常战斗 tick（含 hitFreeze / 慢动作 / combat.resolve / 粒子 / 浮文字）
      this._tick(dt);

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
      case 'train': {
        // 全体训练——先构建动画数据，动画结束后才真正执行
        const trainable = this.sect.disciples.filter(d => !d.onQuest && d.injury <= 50 && d.stamina >= 15);
        if (trainable.length === 0) {
          this._sectShowToast('无可训练的弟子！', '#ff6644');
          break;
        }
        const mul = trainExpMul(this.sect.buildings.dojo);
        const expPrev = Math.floor(15 * mul);
        this.sectTrainAnimData = {
          type: 'group',
          disciples: trainable.map(d => ({
            disciple: d,
            oldStamina: d.stamina,
            newStamina: Math.max(0, d.stamina - 15),
            expGain: expPrev,
          })),
          speakers: pickGroupSpeakers(trainable, Math.min(4, trainable.length)),
        };
        this.sectTrainAnimWait = false;
        this.sectTrainAnim = 0.01; // 开始动画
        break;
      }

      case 'trainOne': {
        const d = this.sect.disciples.find(d => d.id === action.discipleId);
        if (!d) break;
        if (d.onQuest || d.stamina < 20) {
          this._sectShowToast(d.stamina < 20 ? '体力不足！' : '该弟子正在任务中', '#ff6644');
          break;
        }
        if (d.level >= d.talent) {
          this._sectShowToast(`${d.name}已达资质上限`, '#ff6644');
          break;
        }
        const mul2 = trainExpMul(this.sect.buildings.dojo);
        const expGain2 = Math.floor(22 * mul2);
        this.sectTrainAnimData = {
          type: 'single',
          disciples: [{ disciple: d, oldStamina: d.stamina, newStamina: d.stamina - 20, expGain: expGain2 }],
          speakers: [{ disciple: d, line: pickTrainLine(d, 'intense'), showAt: 0.3 },
                     { disciple: d, line: pickTrainLine(d, 'normal'),   showAt: 0.65 }],
        };
        this.sectTrainAnimWait = false;
        this.sectTrainAnim = 0.01;
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

  // ===== 训练 =====
  _sectDoTrainAll() {
    // 每天限全体训练一次
    if ((this.sect.trainedToday || 0) >= 1) {
      this._sectShowToast('今日已完成全体训练，明日再练！', '#ff9944');
      this._sectAddLog('全体训练今日已进行过一次，明天再练。', '#ff9944');
      return;
    }
    const mul = trainExpMul(this.sect.buildings.dojo);
    const libLv = this.sect.buildings.library;
    const expGain = Math.floor(15 * mul); // 全体训练经验
    let trained = 0;
    let skipped = 0;
    const details = [];
    for (const d of this.sect.disciples) {
      if (d.onQuest) { skipped++; continue; }
      if (d.injury > 50) { skipped++; details.push(`${d.name}(伤重休养)`); continue; }
      if (d.stamina < 15) { skipped++; details.push(`${d.name}(体力不足)`); continue; }
      const oldLv = d.level;
      this._sectGainExp(d, expGain);
      d.stamina = Math.max(0, d.stamina - 15);
      d.loyalty = Math.min(100, d.loyalty + 1);
      trained++;
      let info = `${d.name} +${expGain}exp`;
      if (d.level > oldLv) info += ` 🎉升Lv${d.level}`;
      // 藏经阁：概率获得特质
      if (libLv > 0 && d.traits.length < 3 && Math.random() < libLv * 0.08) {
        const pool = COMMON_TRAITS.filter(t => !d.traits.includes(t.id));
        if (pool.length > 0) {
          const newTrait = pool[Math.floor(Math.random() * pool.length)];
          d.traits.push(newTrait.id);
          info += ` 💡领悟${newTrait.name}`;
        }
      }
      details.push(info);
    }
    if (trained > 0) {
      this.sect.stats.totalTrains++;
      this.sect.trainedToday = (this.sect.trainedToday || 0) + 1;
      this._sectAddLog(`🗡 训练完成(${trained}人参与, -15体力, +${expGain}exp)`, '#4499ff');
      for (const info of details) {
        this._sectAddLog(`  · ${info}`, '#88aadd');
      }
      this._sectShowToast(`训练完成！${trained}人+${expGain}exp`, '#4499ff');
      this._sectCheckAchievements();
    } else {
      this._sectAddLog('训练失败：无可训练弟子', '#ff6644');
      this._sectShowToast('无可训练的弟子！', '#ff6644');
    }
  },

  _sectTrainDisciple(d) {
    if (d.level >= d.talent) {
      this._sectAddLog(`${d.name} 已达资质上限`, '#ff6644');
      this._sectShowToast(`${d.name}已满级`, '#ff6644');
      return;
    }
    if (d.stamina < 20) {
      this._sectAddLog(`${d.name} 体力不足(${d.stamina}/20)`, '#ff6644');
      this._sectShowToast('体力不足！', '#ff6644');
      return;
    }
    const mul = trainExpMul(this.sect.buildings.dojo);
    const expGain = Math.floor(22 * mul); // 个人专训经验
    const oldLv = d.level;
    this._sectGainExp(d, expGain);
    d.stamina -= 20;
    d.loyalty = Math.min(100, d.loyalty + 2);
    let msg = `${d.name} 个人训练 +${expGain}exp -20体力`;
    if (d.level > oldLv) msg += ` 🎉升Lv${d.level}！`;
    this._sectAddLog(msg, '#4499ff');
    this._sectShowToast(`+${expGain}exp${d.level > oldLv ? ' 升级！' : ''}`, '#4499ff');
  },

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
    } else {
      d.losses++;
      result.injuryGain = 20 + Math.floor(Math.random() * 25);
      d.injury = Math.min(100, d.injury + result.injuryGain);
      d.loyalty = Math.max(0, d.loyalty - 3);
      this._sectAddLog(`❌ ${d.name} 任务失败，受伤+${result.injuryGain}`, '#ff6644');
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

    // 每天重置训练次数
    this.sect.trainedToday = 0;

    // 恢复弟子状态
    const hMul = healMul(this.sect.buildings.clinic);
    for (const d of this.sect.disciples) {
      // 体力恢复（+40/天，稍提上以支持全体+个人双训练）
      d.stamina = Math.min(100, d.stamina + 40);
      // 受伤恢复
      if (d.injury > 0) {
        d.injury = Math.max(0, d.injury - Math.floor(15 * hMul));
      }
      // 忠诚缓慢回升
      if (d.loyalty < 60) d.loyalty += 1;
    }

    // 刷新任务
    this._sectRefreshQuests();

    // 刷新宗门商店（每天）
    this._sectRefreshShop();

    // 随机事件（60%概率）
    if (Math.random() < 0.6) {
      const evt = rollEvent(this.sect);
      // 处理需要弟子名的事件
      if (evt.id === 'breakthrough') {
        const candidates = this.sect.disciples.filter(d => d.level < d.talent);
        if (candidates.length > 0) {
          const d = candidates[Math.floor(Math.random() * candidates.length)];
          evt.desc = evt.desc.replace('{disciple}', d.name);
          evt._targetDiscipleId = d.id;
        } else {
          // 没有可突破的弟子，换事件
          this.sect.pendingEvent = null;
          this._sectAddLog(`第${this.sect.day}天开始`, '#888');
          return;
        }
      } else if (evt.id === 'betrayal') {
        const d = this.sect.disciples.filter(d => d.loyalty < 50).sort((a, b) => a.loyalty - b.loyalty)[0];
        if (d) {
          evt.desc = evt.desc.replace('{disciple}', d.name);
          evt._targetDiscipleId = d.id;
        }
      }
      this.sect.pendingEvent = evt;
      this.sectPopup = 'event';
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

    // 检查剧情触发（仅在没有事件弹窗时）
    if (!this.sectPopup) {
      this._sectCheckStory();
    }
    this._sectCheckAchievements();
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
        // 选最强弟子
        const best = freeD.sort((a, b) => b.level - a.level)[0];
        const diff = p.diff[0] + Math.floor(Math.random() * (p.diff[1] - p.diff[0] + 1));
        const quest = { name: '山贼围攻', icon: '💀', enemyDiff: diff, enemyWeapon: 'dao', reward: { gold: 100, fame: 12, exp: 20 }, discipleId: best.id };
        best.onQuest = true;
        best.stamina = Math.max(0, best.stamina - 20);
        this.sect.activeQuests.push(quest);
        // 关闭事件弹窗后进入战斗
        this.sect.pendingEvent = null;
        this.sectPopup = null;
        this._sectStartQuestFight(best, quest);
        return; // 直接return，跳过底部的popup=null
      }

      case 'payGold': {
        if (this.sect.gold < choice.params.amount) { this._sectAddLog('银两不足，被迫应战！', '#ff6644'); break; }
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
          this._sectGainExp(d, 30);
          this._sectAddLog(`💡 ${d.name} 顿悟，经验+30`, '#ffdd00');
        }
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
        const best = freeD.sort((a, b) => b.level - a.level)[0];
        const diff = p.diff[0] + Math.floor(Math.random() * (p.diff[1] - p.diff[0] + 1));
        const weapon = WEAPON_IDS[Math.floor(Math.random() * WEAPON_IDS.length)];
        const quest = { name: '江湖挑战', icon: '📜', enemyDiff: diff, enemyWeapon: weapon, reward: { gold: 150, fame: 20, exp: 35 }, discipleId: best.id };
        best.onQuest = true;
        best.stamina = Math.max(0, best.stamina - 20);
        this.sect.activeQuests.push(quest);
        this.sect.pendingEvent = null;
        this.sectPopup = null;
        this._sectStartQuestFight(best, quest);
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
    // 事件处理后检查剧情
    this._sectCheckStory();
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
        }
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

    // 弹窗层
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
    } else if (this.sectPopup === 'settings') {
      this.sectUI.drawSettings(ctx, lw, lh, mx, my, narrow);
    } else if (this.sectPopup === 'talentSelect') {
      const eligible = this.sect.disciples.filter(d => d.talent < 5);
      this.sectUI.drawTalentSelect(ctx, lw, lh, eligible, mx, my, narrow);
    } else if (this.sectPopup === 'achievement' && this.sectAchievementCurrent) {
      const ach = getAchievement(this.sectAchievementCurrent);
      if (ach) this.sectUI.drawAchievementPopup(ctx, lw, lh, ach, mx, my, narrow);
    }

    // 训练动画
    if (this.sectTrainAnim > 0) {
      this.sectUI.drawTrainAnim(ctx, lw, lh, this.sectTrainAnim, narrow, this.sectTrainAnimData, this.sectTrainAnimWait);
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
