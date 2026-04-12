// ===================== 教学模式 =====================
// 以 mixin 形式注入 Game.prototype

import * as C from '../core/constants.js';

/** 教学步骤定义（含子任务） */
export const TUTORIAL_STEPS = [
  {
    id: 'move', title: '移动', dummyMode: 'passive',
    subs: [
      { id: 'w', desc: '按 W 向上移动', hint: '按住 W 键向上移动', check(g) { return g._tutMoveW; } },
      { id: 'a', desc: '按 A 向左移动', hint: '按住 A 键向左移动', check(g) { return g._tutMoveA; } },
      { id: 's', desc: '按 S 向下移动', hint: '按住 S 键向下移动', check(g) { return g._tutMoveS; } },
      { id: 'd', desc: '按 D 向右移动', hint: '按住 D 键向右移动', check(g) { return g._tutMoveD; } },
    ],
    setup(g) { g._tutMoveW = false; g._tutMoveA = false; g._tutMoveS = false; g._tutMoveD = false; },
  },
  {
    id: 'attack', title: '攻击', dummyMode: 'passive',
    subs: [
      { id: 'combo', desc: '三连击（注意第三下自身硬直较长）', hint: '连续点击 鼠标左键 ×3 — 第三下伤害高但自身硬直更久', check(g) { return g._tutComboMax >= 3; } },
      { id: 'heavy', desc: '重击命中敌人', hint: '按 鼠标右键 蓄力并释放重击 — 靠近敌人后使用', check(g) { return g._tutHeavyHits >= 1; } },
    ],
    setup(g) { g._tutComboMax = 0; g._tutHeavyHits = 0; g._tutLightHits = 0; },
  },
  {
    id: 'defense', title: '防御', dummyMode: 'heavy',
    subs: [
      { id: 'block', desc: '格挡敌人重击 ×2', hint: '按住 Space 格挡 — 敌人即将发起重击！', check(g) { return g._tutBlockCount >= 2; } },
      { id: 'parry', desc: '精准格挡（弹反）×1', hint: '在敌人重击即将命中时按下 Space — 时机精准可弹反！', check(g) { return g._tutParryCount >= 1; } },
      { id: 'dodge', desc: '闪避 ×2', hint: '按 Shift + W/A/S/D 向指定方向闪避', check(g) { return g._tutDodgeCount >= 2; } },
    ],
    setup(g) { g._tutBlockCount = 0; g._tutParryCount = 0; g._tutDodgeCount = 0; g._tutDodging = false; },
  },
  {
    id: 'feint', title: '变招', dummyMode: 'passive',
    subs: [
      { id: 'hToL', desc: '重击蓄力中按左键变轻击', hint: '按 鼠标右键 开始重击 → 蓄力阶段按 鼠标左键 变轻击（耗2体力）', check(g) { return g._tutFeintHtoL >= 1; } },
      { id: 'lToH', desc: '轻击中按右键变重击', hint: '按 鼠标左键 开始轻击 → 出招阶段按 鼠标右键 变重击（耗2体力）', check(g) { return g._tutFeintLtoH >= 1; } },
      { id: 'toBlock', desc: '攻击中按空格转格挡', hint: '出招阶段按 Space 取消攻击并转入格挡（耗2体力）', check(g) { return g._tutFeintToBlock >= 1; } },
    ],
    setup(g) { g._tutFeintHtoL = 0; g._tutFeintLtoH = 0; g._tutFeintToBlock = 0; },
  },
  {
    id: 'staminaExec', title: '破防与处决', dummyMode: 'block',
    subs: [
      { id: 'break', desc: '连续轻击破坏敌人格挡', hint: '对格挡的敌人连续 鼠标左键 ×3 — 第3下击破防御！', check(g) { return g._tutBlockBreakSeen; } },
      { id: 'exec', desc: '攻击体力耗尽的敌人处决', hint: '敌人体力耗尽→力竭状态 → 任意攻击触发处决！', check(g) { return g._tutExecutionSeen; } },
    ],
    setup(g) { g._tutBlockBreakSeen = false; g._tutExecutionSeen = false; },
  },
  {
    id: 'secondOrder', title: '二次博弈', dummyMode: 'heavy',
    subs: [
      { id: 'parry', desc: '弹反敌人的重击', hint: '在敌人重击即将命中时按下 Space 弹反！', check(g) { return g._tutSOParry; } },
      { id: 'clash', desc: '弹反后按右键重击 → 触发碰刀', hint: '弹反成功后立刻按 鼠标右键 重击反击 — 与敌人同时出招即碰刀！', check(g) { return g._tutSOClash; } },
    ],
    setup(g) { g._tutSOParry = false; g._tutSOClash = false; },
  },
  {
    id: 'freePlay', title: '综合训练', dummyMode: 'ai',
    subs: [
      { id: 'kill', desc: '击败AI敌人', hint: '运用所有技能自由对战 — 击败敌人即可完成！', check(g) { return g._tutKillCount >= 1; } },
    ],
    setup(g) { g._tutKillCount = 0; },
  },
];

/** Mixin 方法：注入到 Game.prototype */
export const tutorialModeMethods = {
  _setupTutorial(startStep) {
    this._tutStep = startStep || 0;
    this._tutResetAllTracking();
    this._tutStepComplete = false;
    this._tutCompleteTimer = 0;
    this._tutAllDone = false;
    if (!this._tutCompleted) this._tutCompleted = new Set();
    this._tutClickCd = 0;

    TUTORIAL_STEPS[this._tutStep].setup(this);

    this._spawnTutorialDummy();
    this.ui.addLog(`--- 第${this._tutStep + 1}课: ${TUTORIAL_STEPS[this._tutStep].title} ---`);
  },

  /** 重置所有追踪变量 */
  _tutResetAllTracking() {
    this._tutMoveW = false; this._tutMoveA = false;
    this._tutMoveS = false; this._tutMoveD = false;
    this._tutLightHits = 0; this._tutComboMax = 0;
    this._tutHeavyHits = 0;
    this._tutBlockCount = 0; this._tutParryCount = 0;
    this._tutDodgeCount = 0; this._tutDodging = false;
    this._tutFeintHtoL = 0; this._tutFeintLtoH = 0; this._tutFeintToBlock = 0;
    this._tutBlockBreakSeen = false; this._tutExecutionSeen = false;
    this._tutSOParry = false; this._tutSOClash = false;
    this._tutKillCount = 0;
  },

  /** 跳转到指定教学步骤 */
  _tutJumpToStep(idx) {
    if (idx < 0 || idx >= TUTORIAL_STEPS.length) return;
    this._tutStep = idx;
    this._tutStepComplete = false;
    this._tutCompleteTimer = 0;
    this._tutAllDone = false;
    this._tutResetAllTracking();
    TUTORIAL_STEPS[idx].setup(this);
    this._spawnTutorialDummy();
    const pf = this.player.fighter;
    pf.hp = pf.maxHp;
    pf.stamina = C.STAMINA_MAX;
    pf.alive = true;
    pf.state = 'idle';
    pf.phase = 'none';
    pf.isExhausted = false;
    pf.speedMult = 1;
    this.particles.particles = [];
    this.floatingTexts = [];
    this._victoryTimer = -1;
    this.ui.addLog(`--- 第${idx + 1}课: ${TUTORIAL_STEPS[idx].title} ---`);
  },

  _spawnTutorialDummy() {
    this.enemies = [];
    const Enemy = this._TutorialEnemyClass;
    const ex = C.ARENA_W / 2 + 120;
    const ey = C.ARENA_H / 2;
    const enemy = new Enemy(ex, ey, 1);
    enemy.fighter.name = '教学木桩';
    enemy.fighter.color = '#ff8844';
    // 清除敌人攻击冷却，防止上一步残留
    enemy._tutAtkCD = 0;
    this.enemies.push(enemy);
    this._rebuildFighterList();
    // 破防步骤：降低敌人体力使破防与力竭同时发生
    const step = TUTORIAL_STEPS[this._tutStep];
    if (step && step.id === 'staminaExec') {
      enemy.fighter.stamina = 3;
    }
  },

  _updateTutorial(dt) {
    const input = this.input;

    // ESC退出
    if (input.pressed('Escape')) {
      if (this.onExit) { this.onExit(); return; }
    }

    // 左侧清单点击跳转
    this._tutClickCd = (this._tutClickCd || 0) - dt;
    if (input.mouseLeftDown && this._tutClickCd <= 0) {
      const picked = this._tutGetChecklistClick(input.mouseX, input.mouseY);
      if (picked >= 0 && picked !== this._tutStep) {
        this._tutJumpToStep(picked);
        this._tutClickCd = 0.3;
        return;
      }
    }

    // 完成动画
    if (this._tutStepComplete) {
      this._tutCompleteTimer -= dt;
      if (this._tutCompleteTimer <= 0) {
        this._tutStepComplete = false;
        this._tutCompleted.add(this._tutStep);
        this._tutStep++;
        if (this._tutStep >= TUTORIAL_STEPS.length) {
          this._tutAllDone = true;
          this.ui.addLog('🎉 教学完成！你已掌握所有基本操作！');
          return;
        }
        const step = TUTORIAL_STEPS[this._tutStep];
        step.setup(this);
        this._tutResetDummy();
        this.ui.addLog(`--- 第${this._tutStep + 1}课: ${step.title} ---`);
      }
      this._tick(dt);
      return;
    }

    // 教学已全部完成
    if (this._tutAllDone) {
      if (input.pressed('KeyR')) {
        this._tutCompleted = new Set();
        this._setupTutorial(0);
        return;
      }
      this._tick(dt);
      return;
    }

    // ---- 追踪进度 ----
    const step = TUTORIAL_STEPS[this._tutStep];
    const pf = this.player.fighter;

    // 移动检测
    if (step.id === 'move') {
      if (input.held('KeyW') || input.held('ArrowUp'))    this._tutMoveW = true;
      if (input.held('KeyA') || input.held('ArrowLeft'))  this._tutMoveA = true;
      if (input.held('KeyS') || input.held('ArrowDown'))  this._tutMoveS = true;
      if (input.held('KeyD') || input.held('ArrowRight')) this._tutMoveD = true;
    }

    // 战斗事件检测
    for (const evt of this.combat.events) {
      if (evt.type === 'hit' && evt.attacker === pf) {
        if (evt.atkType === 'light' || evt.atkType === 'counter') this._tutLightHits++;
        if (evt.atkType === 'heavy') this._tutHeavyHits++;
        this._tutComboMax = Math.max(this._tutComboMax, pf.comboStep);
      }
      // 玩家格挡敌人重击 → parry事件
      if (evt.type === 'parry' && evt.target === pf) {
        this._tutBlockCount++;
        if (evt.level === 'precise') this._tutParryCount++;
        if (step.id === 'secondOrder') this._tutSOParry = true;
      }
      // 玩家击破敌人格挡
      if (evt.type === 'blockBreak' && evt.attacker === pf) {
        this._tutBlockBreakSeen = true;
      }
      // 处决
      if (evt.type === 'execution' && evt.attacker === pf) {
        this._tutExecutionSeen = true;
      }
      // 碰刀
      if (evt.type === 'lightClash' || evt.type === 'heavyClash') {
        if (step.id === 'secondOrder') this._tutSOClash = true;
      }
    }

    // 闪避检测（每次进入dodge状态只计一次，修复多帧重复计数）
    if (pf.state === 'dodging') {
      if (!this._tutDodging) {
        this._tutDodging = true;
        this._tutDodgeCount++;
      }
    } else {
      this._tutDodging = false;
    }

    // 变招检测
    if (pf.feinted) {
      if (pf.state === 'lightAttack') this._tutFeintHtoL++;
      if (pf.state === 'heavyAttack') this._tutFeintLtoH++;
      if (pf.state === 'blocking')    this._tutFeintToBlock++;
      pf.feinted = false;
    }
    // 清除敌人的 feinted 标志（game.js 在教学模式中不清除，防止刷屏）
    for (const e of this.enemies) {
      if (e.fighter.feinted) e.fighter.feinted = false;
    }

    // 击杀检测
    if (step.id === 'freePlay') {
      const dummy = this.enemies[0]?.fighter;
      if (dummy && !dummy.alive) this._tutKillCount++;
    }

    // ---- 控制木桩行为 ----
    const mode = step.dummyMode || 'passive';
    if (this.enemies[0]) {
      const enemy = this.enemies[0];
      enemy._tutForcePassive = mode === 'passive';
      enemy._tutForceAttack = false;
      enemy._tutForceHeavy  = mode === 'heavy';
      enemy._tutForceBlock  = mode === 'block';
      if (mode === 'heavy') {
        enemy._tutAtkInterval = (step.id === 'secondOrder') ? 1.0 : 2.2;
      }
    }

    // 保持敌人体力（防止教学中被耗尽而无法攻击）
    if (step.id === 'defense' || step.id === 'secondOrder') {
      const df = this.enemies[0]?.fighter;
      if (df && df.stamina < 3) {
        df.stamina = C.STAMINA_MAX;
        df.isExhausted = false;
        df.speedMult = 1;
      }
    }

    // 保持玩家体力（变招消耗2点）
    if (step.id === 'feint') {
      if (pf.stamina < 2) {
        pf.stamina = C.STAMINA_MAX;
        pf.isExhausted = false;
        pf.speedMult = 1;
      }
    }

    // ---- 检查步骤完成：所有子任务通过 ----
    if (step.subs.every(s => s.check(this))) {
      this._tutStepComplete = true;
      this._tutCompleteTimer = 1.2;
      this.ui.addLog(`✅ ${step.title} — 完成!`);
      this.addFloatingText(pf.x, pf.y - 60, '✓ 完成!', '#44ff88', 26, 1.5, -30);
    }

    this._tick(dt);

    // 木桩死亡后自动复活（综合训练和处决教学除外）
    if (step.id !== 'freePlay' && step.id !== 'staminaExec' && this.enemies[0] && !this.enemies[0].fighter.alive) {
      this._tutResetDummy();
    }
    // 处决教学：死亡后复活以备重试
    if (step.id === 'staminaExec' && this.enemies[0]) {
      const df = this.enemies[0].fighter;
      if (!df.alive && !this._tutStepComplete) {
        this._tutResetDummy();
      }
    }

    // 玩家死亡后自动复活
    if (!pf.alive) {
      pf.hp = pf.maxHp;
      pf.stamina = C.STAMINA_MAX;
      pf.alive = true;
      pf.state = 'idle';
      pf.phase = 'none';
      pf.isExhausted = false;
      pf.speedMult = 1;
    }
  },

  _tutResetDummy() {
    if (!this.enemies[0]) {
      this._spawnTutorialDummy();
      return;
    }
    const df = this.enemies[0].fighter;
    df.hp = df.maxHp;
    df.stamina = C.STAMINA_MAX;
    df.alive = true;
    df.state = 'idle';
    df.phase = 'none';
    df.isExhausted = false;
    df.speedMult = 1;
    df.blockHitCount = 0;
    // 清除攻击冷却
    this.enemies[0]._tutAtkCD = 0;
    // 破防步骤：降低体力
    const step = TUTORIAL_STEPS[this._tutStep];
    if (step && step.id === 'staminaExec') {
      df.stamina = 3;
    }
  },

  /** 检测点击左侧清单条目 */
  _tutGetChecklistClick(mx, my) {
    const itemH = 36;
    const total = TUTORIAL_STEPS.length;
    const headerH = 28;
    const px = 10, py = 90;
    const panelW = 200;
    const listY = py + headerH;
    for (let i = 0; i < total; i++) {
      const iy = listY + i * itemH;
      if (mx >= px && mx <= px + panelW && my >= iy && my <= iy + itemH) {
        return i;
      }
    }
    return -1;
  },

  _drawTutorialOverlay() {
    const ctx = this.canvas.getContext('2d');
    const lw = this.canvas._logicW || this.canvas.width;
    const lh = this.canvas._logicH || this.canvas.height;

    // 全部完成
    if (this._tutAllDone) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, lw, lh);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 32px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#44ff88';
      ctx.fillText('🎉 教学完成!', lw / 2, lh / 2 - 30);
      ctx.font = '18px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#ccc';
      ctx.fillText('你已掌握所有基本操作', lw / 2, lh / 2 + 10);
      ctx.font = '14px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#888';
      ctx.fillText('点击左侧步骤重新练习  ·  按 R 全部重来  ·  按 ESC 返回菜单', lw / 2, lh / 2 + 45);
      ctx.textBaseline = 'alphabetic';
      return;
    }

    const step = TUTORIAL_STEPS[this._tutStep];
    if (!step) return;

    // ---- 左侧可点击步骤清单 ----
    this._drawTutorialChecklist(ctx, lw, lh);

    // ---- 顶部教学面板（含子任务） ----
    const subsCount = step.subs.length;
    const panelW = 520;
    const panelH = 48 + subsCount * 22 + 10;
    const px = (lw - panelW) / 2, py = 10;

    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath();
    ctx.roundRect(px, py, panelW, panelH, 8);
    ctx.fill();

    // 步骤标题
    ctx.textAlign = 'left';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText(`第 ${this._tutStep + 1}/${TUTORIAL_STEPS.length} 步`, px + 14, py + 18);

    ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#ffcc44';
    ctx.fillText(step.title, px + 80, py + 18);

    // 子任务列表
    let firstIncomplete = null;
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    for (let i = 0; i < subsCount; i++) {
      const sub = step.subs[i];
      const sy = py + 36 + i * 22;
      const done = sub.check(this);
      let icon, color;
      if (done) {
        icon = '✅'; color = '#44ff88';
      } else if (!firstIncomplete) {
        icon = '▶'; color = '#ffcc44';
        firstIncomplete = sub;
      } else {
        icon = '○'; color = '#888';
      }
      ctx.fillStyle = color;
      ctx.fillText(`${icon}  ${sub.desc}`, px + 16, sy);
    }

    // ---- 提示条：紧贴子任务面板下方 ----
    if (!firstIncomplete) firstIncomplete = step.subs[step.subs.length - 1];
    const hint = firstIncomplete.hint;
    const hintY = py + panelH + 6;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(px, hintY, panelW, 30, 6);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#ffcc44';
    ctx.fillText(hint, px + panelW / 2, hintY + 19);

    // 步骤完成闪烁
    if (this._tutStepComplete) {
      const alpha = Math.min(0.4, this._tutCompleteTimer * 0.5);
      ctx.fillStyle = `rgba(68,255,136,${alpha})`;
      ctx.fillRect(0, 0, lw, lh);
    }
  },

  /** 左侧可点击步骤清单 */
  _drawTutorialChecklist(ctx, lw, lh) {
    const itemH = 36;
    const total = TUTORIAL_STEPS.length;
    const headerH = 28;
    const listH = total * itemH + headerH + 12;
    const px = 10, py = 90;
    const panelW = 200;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(px, py, panelW, listH, 6);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText('📋 教学进度', px + 10, py + 18);

    for (let i = 0; i < total; i++) {
      const s = TUTORIAL_STEPS[i];
      const iy = py + headerH + i * itemH;
      const hovered = mx >= px && mx <= px + panelW && my >= iy && my <= iy + itemH;

      if (hovered) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(px + 4, iy + 2, panelW - 8, itemH - 4);
      }

      let icon, color;
      if (this._tutCompleted && this._tutCompleted.has(i)) {
        icon = '✅'; color = hovered ? '#66ffaa' : '#44ff88';
      } else if (i === this._tutStep && !this._tutAllDone) {
        icon = '▶'; color = hovered ? '#ffe066' : '#ffcc44';
      } else {
        icon = '○'; color = hovered ? '#bbb' : '#555';
      }
      ctx.font = '14px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = color;
      ctx.fillText(`${icon} ${i + 1}. ${s.title}`, px + 10, iy + 24);
    }
  },
};
