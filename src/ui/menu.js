// ===================== 开始菜单（多页设计） =====================
import { WEAPON_LIST, WEAPONS, getWeapon } from '../weapons/weapon-defs.js';
import { ARMOR_LIST, getArmor } from '../weapons/armor-defs.js';
const GAME_VERSION = 'v0.12.4';

export class Menu {
  constructor(canvas, input) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;

    this.page = 'main'; // 'main' | 'pvai' | 'spectate' | 'test' | 'wusheng' | 'jianghu' | 'training' | 'entertainment' | 'chainKill' | 'local2p'
    this.pvaiDiff = 5;
    this.nnWeightsLoaded = false;
    this.nnLoadError = null;
    this.diffA = 5;
    this.diffB = 5;
    this.testRounds = 50;
    this.result = null;

    // 武器选择
    this.weaponA = 'dao';  // 玩家/左方武器
    this.weaponB = 'dao';  // 敌人/右方武器

    // 护甲选择
    this.armorA = 'none';  // 玩家/左方护甲
    this.armorB = 'none';  // 敌人/右方护甲

    this._hoverBtn = null;
    this._clickCooldown = 0;

    // 训练状态（由 main.js 注入 BrowserTrainer）
    this.trainer = null; // BrowserTrainer 实例
    this._onTrainDone = null; // 训练完成回调

    // 帮助面板引用
    this.helpOverlay = document.getElementById('help-overlay');
  }

  update(dt) {
    this._clickCooldown -= dt;
    if (this._clickCooldown > 0) return;

    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    this._hoverBtn = null;

    if (!this.input.mouseLeftDown) return;

    switch (this.page) {
      case 'main': this._updateMain(mx, my); break;
      case 'pvai': this._updatePvai(mx, my); break;
      case 'spectate': this._updateSpectate(mx, my); break;
      case 'test': this._updateTest(mx, my); break;
      case 'wusheng': this._updateWusheng(mx, my); break;
      case 'jianghu': this._updateJianghu(mx, my); break;
      case 'training': this._updateTraining(mx, my); break;
      case 'entertainment': this._updateEntertainment(mx, my); break;
      case 'chainKill': this._updateChainKill(mx, my); break;
      case 'local2p': this._updateLocal2P(mx, my); break;
    }
  }

  _hit(mx, my, x, y, w, h) {
    return mx >= x && mx <= x + w && my >= y && my <= y + h;
  }

  _updateMain(mx, my) {
    const L = this._layoutMain();
    for (const btn of L.buttons) {
      if (this._hit(mx, my, btn.x, btn.y, btn.w, btn.h)) {
        if (btn.id === 'online' && this._onOpenOnline) {
          this._onOpenOnline();
        } else if (btn.id === 'tutorial') {
          // 教学模式直接开始
          this.result = { mode: 'tutorial' };
          this._clickCooldown = 0.3;
        } else {
          this.page = btn.id;
        }
        this._clickCooldown = 0.2;
        return;
      }
    }
    // 自动测试按钮（左下角）
    if (this._hit(mx, my, L.testBtn.x, L.testBtn.y, L.testBtn.w, L.testBtn.h)) {
      this.page = 'test';
      this._clickCooldown = 0.2;
      return;
    }
    // 新手引导按钮
    if (this._hit(mx, my, L.helpBtn.x, L.helpBtn.y, L.helpBtn.w, L.helpBtn.h)) {
      if (this.helpOverlay) {
        this.helpOverlay.classList.toggle('hidden');
      }
      this._clickCooldown = 0.3;
    }
  }

  _updatePvai(mx, my) {
    const L = this._layoutSub('pvai');
    // 难度选择 (1-5)
    for (let i = 0; i < 5; i++) {
      const bx = L.diffX + i * 42;
      if (this._hit(mx, my, bx, L.diffY, 36, 30)) {
        this.pvaiDiff = i + 1;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 神级难度按钮
    {
      const bx = L.diffX + 5 * 42 + 8;
      if (this._hit(mx, my, bx, L.diffY, 36, 30)) {
        this.pvaiDiff = 99;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 玩家武器选择
    for (let i = 0; i < WEAPON_LIST.length; i++) {
      const bx = L.weaponAx + i * 52;
      if (this._hit(mx, my, bx, L.weaponAy, 46, 38)) {
        this.weaponA = WEAPON_LIST[i].id;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 玩家护甲选择
    for (let i = 0; i < ARMOR_LIST.length; i++) {
      const bx = L.armorAx + i * 52;
      if (this._hit(mx, my, bx, L.armorAy, 46, 38)) {
        this.armorA = ARMOR_LIST[i].id;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 开始按钮
    if (this._hit(mx, my, L.startBtn.x, L.startBtn.y, L.startBtn.w, L.startBtn.h)) {
      this.result = { mode: 'pvai', diffA: 1, diffB: this.pvaiDiff, weaponA: this.weaponA, weaponB: 'dao', armorA: this.armorA, armorB: 'none', rounds: 0, simOnly: false };
      this._clickCooldown = 0.3;
      return;
    }
    // 返回
    if (this._hit(mx, my, L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h)) {
      this.page = 'main';
      this._clickCooldown = 0.2;
    }
  }

  _updateSpectate(mx, my) {
    const L = this._layoutSub('spectate');
    // 难度 A
    for (let i = 0; i < 5; i++) {
      const bx = L.diffAx + i * 42;
      if (this._hit(mx, my, bx, L.diffAy, 36, 30)) {
        this.diffA = i + 1;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 神级难度 A
    {
      const bx = L.diffAx + 5 * 42 + 8;
      if (this._hit(mx, my, bx, L.diffAy, 36, 30)) {
        this.diffA = 99;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 难度 B
    for (let i = 0; i < 5; i++) {
      const bx = L.diffBx + i * 42;
      if (this._hit(mx, my, bx, L.diffBy, 36, 30)) {
        this.diffB = i + 1;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 神级难度 B
    {
      const bx = L.diffBx + 5 * 42 + 8;
      if (this._hit(mx, my, bx, L.diffBy, 36, 30)) {
        this.diffB = 99;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 武器 A
    for (let i = 0; i < WEAPON_LIST.length; i++) {
      const bx = L.weaponAx + i * 52;
      if (this._hit(mx, my, bx, L.weaponAy, 46, 38)) {
        this.weaponA = WEAPON_LIST[i].id;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 护甲 A
    for (let i = 0; i < ARMOR_LIST.length; i++) {
      const bx = L.armorAx + i * 52;
      if (this._hit(mx, my, bx, L.armorAy, 46, 38)) {
        this.armorA = ARMOR_LIST[i].id;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 武器 B
    for (let i = 0; i < WEAPON_LIST.length; i++) {
      const bx = L.weaponBx + i * 52;
      if (this._hit(mx, my, bx, L.weaponBy, 46, 38)) {
        this.weaponB = WEAPON_LIST[i].id;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 护甲 B
    for (let i = 0; i < ARMOR_LIST.length; i++) {
      const bx = L.armorBx + i * 52;
      if (this._hit(mx, my, bx, L.armorBy, 46, 38)) {
        this.armorB = ARMOR_LIST[i].id;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 开始
    if (this._hit(mx, my, L.startBtn.x, L.startBtn.y, L.startBtn.w, L.startBtn.h)) {
      this.result = { mode: 'spectate', diffA: this.diffA, diffB: this.diffB, weaponA: this.weaponA, weaponB: this.weaponB, armorA: this.armorA, armorB: this.armorB, rounds: 0, simOnly: false };
      this._clickCooldown = 0.3;
      return;
    }
    // 返回
    if (this._hit(mx, my, L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h)) {
      this.page = 'main';
      this._clickCooldown = 0.2;
    }
  }

  _updateTest(mx, my) {
    const L = this._layoutSub('test');
    // 难度 A
    for (let i = 0; i < 5; i++) {
      const bx = L.diffAx + i * 42;
      if (this._hit(mx, my, bx, L.diffAy, 36, 30)) {
        this.diffA = i + 1;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 难度 B
    for (let i = 0; i < 5; i++) {
      const bx = L.diffBx + i * 42;
      if (this._hit(mx, my, bx, L.diffBy, 36, 30)) {
        this.diffB = i + 1;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 武器 A
    for (let i = 0; i < WEAPON_LIST.length; i++) {
      const bx = L.weaponAx + i * 52;
      if (this._hit(mx, my, bx, L.weaponAy, 46, 38)) {
        this.weaponA = WEAPON_LIST[i].id;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 护甲 A
    for (let i = 0; i < ARMOR_LIST.length; i++) {
      const bx = L.armorAx + i * 52;
      if (this._hit(mx, my, bx, L.armorAy, 46, 38)) {
        this.armorA = ARMOR_LIST[i].id;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 武器 B
    for (let i = 0; i < WEAPON_LIST.length; i++) {
      const bx = L.weaponBx + i * 52;
      if (this._hit(mx, my, bx, L.weaponBy, 46, 38)) {
        this.weaponB = WEAPON_LIST[i].id;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 护甲 B
    for (let i = 0; i < ARMOR_LIST.length; i++) {
      const bx = L.armorBx + i * 52;
      if (this._hit(mx, my, bx, L.armorBy, 46, 38)) {
        this.armorB = ARMOR_LIST[i].id;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 轮数 ±
    if (this._hit(mx, my, L.roundsMinus.x, L.roundsMinus.y, L.roundsMinus.w, L.roundsMinus.h)) {
      this.testRounds = Math.max(5, this.testRounds - (this.testRounds > 50 ? 50 : 5));
      this._clickCooldown = 0.12;
      return;
    }
    if (this._hit(mx, my, L.roundsPlus.x, L.roundsPlus.y, L.roundsPlus.w, L.roundsPlus.h)) {
      this.testRounds = Math.min(500, this.testRounds + (this.testRounds >= 50 ? 50 : 5));
      this._clickCooldown = 0.12;
      return;
    }
    // 视觉测试
    if (this._hit(mx, my, L.visualBtn.x, L.visualBtn.y, L.visualBtn.w, L.visualBtn.h)) {
      this.result = { mode: 'test', diffA: this.diffA, diffB: this.diffB, rounds: this.testRounds, simOnly: false, weaponA: this.weaponA, weaponB: this.weaponB, armorA: this.armorA, armorB: this.armorB };
      this._clickCooldown = 0.3;
      return;
    }
    // 纯数据测试
    if (this._hit(mx, my, L.dataBtn.x, L.dataBtn.y, L.dataBtn.w, L.dataBtn.h)) {
      this.result = { mode: 'test', diffA: this.diffA, diffB: this.diffB, rounds: this.testRounds, simOnly: true, weaponA: this.weaponA, weaponB: this.weaponB, armorA: this.armorA, armorB: this.armorB };
      this._clickCooldown = 0.3;
      return;
    }
    // 返回
    if (this._hit(mx, my, L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h)) {
      this.page = 'main';
      this._clickCooldown = 0.2;
    }
  }

  // ===================== 绘制 =====================
  draw() {
    this._drawBg();
    switch (this.page) {
      case 'main': this._drawMain(); break;
      case 'pvai': this._drawPvai(); break;
      case 'spectate': this._drawSpectate(); break;
      case 'test': this._drawTest(); break;
      case 'wusheng': this._drawWusheng(); break;
      case 'jianghu': this._drawJianghu(); break;
      case 'training': this._drawTraining(); break;
      case 'entertainment': this._drawEntertainment(); break;
      case 'chainKill': this._drawChainKill(); break;
      case 'local2p': this._drawLocal2P(); break;
    }
  }

  _drawBg() {
    const ctx = this.ctx;
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 1;
    for (let x = 0; x < cw; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke();
    }
    for (let y = 0; y < ch; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke();
    }
  }

  // ---- 主页 ----
  _drawMain() {
    const ctx = this.ctx;
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const L = this._layoutMain();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8e0d0';
    ctx.font = 'bold 36px "Microsoft YaHei", sans-serif';
    ctx.fillText('⚔ 冷兵器战斗系统', cw / 2, ch * 0.15);
    ctx.fillStyle = '#555';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillText('Combat System Demo', cw / 2, ch * 0.15 + 32);

    for (const btn of L.buttons) {
      const hovered = this._hit(mx, my, btn.x, btn.y, btn.w, btn.h);
      this._drawButton(ctx, btn, hovered);
    }

    ctx.fillStyle = '#444';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('选择模式开始 · 按 ESC 可随时返回菜单', cw / 2, ch - 24);

    // 版本号（左下角）
    ctx.fillStyle = '#444';
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(GAME_VERSION, 12, ch - 52);

    // 自动测试按钮（左下角）
    this._drawActionBtn(ctx, L.testBtn, '📊 自动测试', '#44ff88', mx, my);

    // 新手引导按钮（右下角）
    this._drawActionBtn(ctx, L.helpBtn, '📖 操作帮助', '#888', mx, my);
  }

  _layoutMain() {
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const cx = cw / 2;
    const btnW = 340;
    const btnH = 58;
    const gap = 14;
    const startY = ch * 0.22;

    return {
      buttons: [
        { id: 'tutorial', label: '📖 教学模式', desc: '分步教学所有操作与博弈技巧', accent: '#44ff88',
          x: cx - btnW / 2, y: startY, w: btnW, h: btnH },
        { id: 'pvai', label: '⚔ 对战模式', desc: '玩家 vs AI，键鼠操作', accent: '#4499ff',
          x: cx - btnW / 2, y: startY + btnH + gap, w: btnW, h: btnH },
        { id: 'online', label: '🌐 联机对战', desc: '局域网双人对战', accent: '#44ffaa',
          x: cx - btnW / 2, y: startY + (btnH + gap) * 2, w: btnW, h: btnH },
        { id: 'entertainment', label: '🎮 娱乐模式', desc: '江湖行 · 武圣挑战 · 连战 · 自由训练', accent: '#ff00ff',
          x: cx - btnW / 2, y: startY + (btnH + gap) * 3, w: btnW, h: btnH },
        { id: 'spectate', label: '🦗 斗蛐蛐', desc: '选择双方AI难度，观看互斗', accent: '#ffaa33',
          x: cx - btnW / 2, y: startY + (btnH + gap) * 4, w: btnW, h: btnH },
      ],
      helpBtn: { x: cw - 110, y: ch - 44, w: 96, h: 32 },
      testBtn: { x: 12, y: ch - 44, w: 106, h: 32 },
    };
  }

  // ---- 对战模式页 ----
  _drawPvai() {
    const ctx = this.ctx;
    const cw = this.canvas._logicW || this.canvas.width;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const L = this._layoutSub('pvai');

    this._drawSubHeader(ctx, cw, '⚔ 对战模式', '选择武器和敌人AI难度');
    this._drawDiffSelector(ctx, L.diffX, L.diffY, '敌人难度', this.pvaiDiff, '#ff4444', mx, my, true);
    this._drawWeaponSelector(ctx, L.weaponAx, L.weaponAy, '你的武器', this.weaponA, mx, my);
    this._drawArmorSelector(ctx, L.armorAx, L.armorAy, '你的护甲', this.armorA, mx, my);
    this._drawActionBtn(ctx, L.startBtn, '开始对战', '#4499ff', mx, my);
    this._drawActionBtn(ctx, L.backBtn, '← 返回', '#666', mx, my);

    ctx.fillStyle = '#444';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('J轻击 K重击 L绝技 · 游戏中可按 1-5 切换难度 · 6 拼刀训练 · 7 格挡训练 · H 帮助', cw / 2, (this.canvas._logicH || this.canvas.height) - 24);
  }

  // ---- 斗蛐蛐页 ----
  _drawSpectate() {
    const ctx = this.ctx;
    const cw = this.canvas._logicW || this.canvas.width;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const L = this._layoutSub('spectate');

    this._drawSubHeader(ctx, cw, '🦗 斗蛐蛐', '选择双方武器和AI难度，观看对决');
    this._drawDiffSelector(ctx, L.diffAx, L.diffAy, '左方难度', this.diffA, '#4499ff', mx, my, true);
    this._drawWeaponSelector(ctx, L.weaponAx, L.weaponAy, '左方武器', this.weaponA, mx, my);
    this._drawArmorSelector(ctx, L.armorAx, L.armorAy, '左方护甲', this.armorA, mx, my);
    this._drawDiffSelector(ctx, L.diffBx, L.diffBy, '右方难度', this.diffB, '#ff4444', mx, my, true);
    this._drawWeaponSelector(ctx, L.weaponBx, L.weaponBy, '右方武器', this.weaponB, mx, my);
    this._drawArmorSelector(ctx, L.armorBx, L.armorBy, '右方护甲', this.armorB, mx, my);
    this._drawActionBtn(ctx, L.startBtn, '开始观战', '#ffaa33', mx, my);
    this._drawActionBtn(ctx, L.backBtn, '← 返回', '#666', mx, my);
  }

  // ---- 测试页 ----
  _drawTest() {
    const ctx = this.ctx;
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const L = this._layoutSub('test');

    this._drawSubHeader(ctx, cw, '📊 自动测试', '配置参数后选择测试方式');
    this._drawDiffSelector(ctx, L.diffAx, L.diffAy, '左方难度', this.diffA, '#4499ff', mx, my);
    this._drawWeaponSelector(ctx, L.weaponAx, L.weaponAy, '左方武器', this.weaponA, mx, my);
    this._drawArmorSelector(ctx, L.armorAx, L.armorAy, '左方护甲', this.armorA, mx, my);
    this._drawDiffSelector(ctx, L.diffBx, L.diffBy, '右方难度', this.diffB, '#ff4444', mx, my);
    this._drawWeaponSelector(ctx, L.weaponBx, L.weaponBy, '右方武器', this.weaponB, mx, my);
    this._drawArmorSelector(ctx, L.armorBx, L.armorBy, '右方护甲', this.armorB, mx, my);

    // 轮数控制
    const ry = L.roundsY;
    ctx.fillStyle = '#888';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('测试轮数', cw / 2, ry - 6);

    // 减号
    this._drawSmallBtn(ctx, L.roundsMinus, '−', mx, my);
    // 数字
    ctx.fillStyle = '#ffcc33';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.testRounds, cw / 2, ry + 22);
    // 加号
    this._drawSmallBtn(ctx, L.roundsPlus, '+', mx, my);

    // 两个启动按钮
    this._drawActionBtn(ctx, L.visualBtn, '📊 视觉测试 (×8)', '#44ff88', mx, my);
    this._drawActionBtn(ctx, L.dataBtn, '⚡ 纯数据测试', '#ff88ff', mx, my);
    this._drawActionBtn(ctx, L.backBtn, '← 返回', '#666', mx, my);
  }

  // ---- 子页布局 ----
  _layoutSub(page) {
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const cx = cw / 2;
    const selectorW = 5 * 42;
    const btnW = 280;
    const btnH = 44;

    if (page === 'pvai') {
      const diffX = cx - selectorW / 2;
      const diffY = ch * 0.25;
      const weaponW = WEAPON_LIST.length * 52;
      const weaponAx = cx - weaponW / 2;
      const weaponAy = diffY + 65;
      const armorW = ARMOR_LIST.length * 52;
      const armorAx = cx - armorW / 2;
      const armorAy = weaponAy + 55;
      return {
        diffX, diffY,
        weaponAx, weaponAy,
        armorAx, armorAy,
        startBtn: { x: cx - btnW / 2, y: armorAy + 70, w: btnW, h: btnH },
        backBtn:  { x: cx - 60, y: armorAy + 130, w: 120, h: 34 },
      };
    }

    if (page === 'spectate') {
      const diffGap = 50;
      const diffAx = cx - selectorW - diffGap / 2;
      const diffBx = cx + diffGap / 2;
      const diffY = ch * 0.22;
      const weaponW = WEAPON_LIST.length * 52;
      const weaponAx = cx - weaponW - 10;
      const weaponBx = cx + 10;
      const weaponY = diffY + 60;
      const armorW = ARMOR_LIST.length * 52;
      const armorAx = cx - armorW - 10;
      const armorBx = cx + 10;
      const armorY = weaponY + 55;
      return {
        diffAx, diffAy: diffY,
        diffBx, diffBy: diffY,
        weaponAx, weaponAy: weaponY,
        weaponBx, weaponBy: weaponY,
        armorAx, armorAy: armorY,
        armorBx, armorBy: armorY,
        startBtn: { x: cx - btnW / 2, y: armorY + 80, w: btnW, h: btnH },
        backBtn:  { x: cx - 60, y: armorY + 140, w: 120, h: 34 },
      };
    }

    // test
    const diffGap = 50;
    const diffAx = cx - selectorW - diffGap / 2;
    const diffBx = cx + diffGap / 2;
    const diffY = ch * 0.18;
    const weaponW = WEAPON_LIST.length * 52;
    const weaponAx = cx - weaponW - 10;
    const weaponBx = cx + 10;
    const weaponY = diffY + 60;
    const armorW = ARMOR_LIST.length * 52;
    const armorAx = cx - armorW - 10;
    const armorBx = cx + 10;
    const armorY = weaponY + 55;
    const roundsY = armorY + 55;
    const startBtnY = roundsY + 52;
    return {
      diffAx, diffAy: diffY,
      diffBx, diffBy: diffY,
      weaponAx, weaponAy: weaponY,
      weaponBx, weaponBy: weaponY,
      armorAx, armorAy: armorY,
      armorBx, armorBy: armorY,
      roundsY,
      weaponAx, weaponAy: weaponY,
      weaponBx, weaponBy: weaponY,
      roundsY,
      roundsMinus: { x: cx - 80, y: roundsY + 4, w: 32, h: 28 },
      roundsPlus:  { x: cx + 48, y: roundsY + 4, w: 32, h: 28 },
      visualBtn: { x: cx - btnW / 2, y: startBtnY, w: btnW, h: btnH },
      dataBtn:   { x: cx - btnW / 2, y: startBtnY + btnH + 12, w: btnW, h: btnH },
      backBtn:   { x: cx - 60, y: startBtnY + (btnH + 12) * 2 + 8, w: 120, h: 34 },
    };
  }

  // ===================== 公共绘制工具 =====================
  _drawSubHeader(ctx, cw, title, subtitle) {
    const ch = this.canvas._logicH || this.canvas.height;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8e0d0';
    ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
    ctx.fillText(title, cw / 2, ch * 0.14);
    ctx.fillStyle = '#666';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText(subtitle, cw / 2, ch * 0.14 + 28);
  }

  _drawButton(ctx, btn, hovered) {
    ctx.fillStyle = hovered ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    ctx.strokeStyle = hovered ? btn.accent : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = hovered ? 2 : 1;
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

    ctx.fillStyle = hovered ? '#fff' : '#ccc';
    ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 - 4);

    ctx.fillStyle = '#666';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillText(btn.desc, btn.x + btn.w / 2, btn.y + btn.h / 2 + 16);
  }

  _drawActionBtn(ctx, rect, label, color, mx, my) {
    const hovered = this._hit(mx, my, rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = hovered ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = hovered ? color : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = hovered ? 2 : 1;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    ctx.fillStyle = hovered ? '#fff' : '#bbb';
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 5);
  }

  _drawSmallBtn(ctx, rect, label, mx, my) {
    const hovered = this._hit(mx, my, rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = hovered ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = '#ccc';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 6);
  }

  _drawDiffSelector(ctx, x, y, label, value, accentColor, mx, my, showGodTier) {
    const names = ['新手', '普通', '熟练', '困难', '大师'];
    const colors = ['#66cc66', '#cccc66', '#ff9933', '#ff5555', '#ff2222'];

    ctx.fillStyle = accentColor;
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    const totalW = showGodTier ? 5 * 42 + 8 + 36 : 5 * 42;
    ctx.fillText(label, x + totalW / 2 - 3, y - 10);

    for (let i = 0; i < 5; i++) {
      const bx = x + i * 42;
      const selected = i + 1 === value;
      const hovered = mx >= bx && mx <= bx + 36 && my >= y && my <= y + 30;

      ctx.fillStyle = selected ? colors[i] : hovered ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(bx, y, 36, 30);
      ctx.strokeStyle = selected ? '#fff' : hovered ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(bx, y, 36, 30);

      ctx.fillStyle = selected ? '#000' : '#888';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(i + 1, bx + 18, y + 20);
    }

    // 神级难度按钮
    if (showGodTier) {
      const bx = x + 5 * 42 + 8;
      const selected = value === 99;
      const hovered = mx >= bx && mx <= bx + 36 && my >= y && my <= y + 30;
      ctx.fillStyle = selected ? '#ff00ff' : hovered ? 'rgba(255,0,255,0.15)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(bx, y, 36, 30);
      ctx.strokeStyle = selected ? '#fff' : hovered ? 'rgba(255,0,255,0.5)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(bx, y, 36, 30);
      ctx.fillStyle = selected ? '#fff' : '#cc66cc';
      ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('神', bx + 18, y + 21);
    }

    const nameIdx = value === 99 ? -1 : value - 1;
    if (nameIdx >= 0) {
      ctx.fillStyle = colors[nameIdx];
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(names[nameIdx], x + totalW / 2 - 3, y + 46);
    } else {
      ctx.fillStyle = '#ff00ff';
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('神级', x + totalW / 2 - 3, y + 46);
    }
  }

  _drawWeaponSelector(ctx, x, y, label, selectedId, mx, my) {
    ctx.fillStyle = '#aaa';
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    const totalW = WEAPON_LIST.length * 52;
    ctx.fillText(label, x + totalW / 2 - 3, y - 10);

    let hoveredWeapon = null;
    let hoveredBx = 0;

    for (let i = 0; i < WEAPON_LIST.length; i++) {
      const w = WEAPON_LIST[i];
      const bx = x + i * 52;
      const selected = w.id === selectedId;
      const hovered = mx >= bx && mx <= bx + 46 && my >= y && my <= y + 38;
      if (hovered) { hoveredWeapon = w; hoveredBx = bx; }

      ctx.fillStyle = selected ? w.color : hovered ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(bx, y, 46, 38);
      ctx.strokeStyle = selected ? '#fff' : hovered ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(bx, y, 46, 38);

      ctx.fillStyle = selected ? '#fff' : '#999';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(w.icon, bx + 23, y + 18);

      ctx.fillStyle = selected ? '#fff' : '#777';
      ctx.font = '10px "Microsoft YaHei", sans-serif';
      ctx.fillText(w.name, bx + 23, y + 33);
    }

    if (hoveredWeapon) {
      this._drawWeaponTooltip(ctx, hoveredBx, y, hoveredWeapon);
    }
  }

  _drawArmorSelector(ctx, x, y, label, selectedId, mx, my) {
    ctx.fillStyle = '#888';
    ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    const totalW = ARMOR_LIST.length * 52;
    ctx.fillText(label, x + totalW / 2 - 3, y - 10);

    let hoveredArmor = null;
    let hoveredBx = 0;

    for (let i = 0; i < ARMOR_LIST.length; i++) {
      const a = ARMOR_LIST[i];
      const bx = x + i * 52;
      const selected = a.id === selectedId;
      const hovered = mx >= bx && mx <= bx + 46 && my >= y && my <= y + 38;
      if (hovered) { hoveredArmor = a; hoveredBx = bx; }

      ctx.fillStyle = selected ? (a.armorColor || '#556') : hovered ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(bx, y, 46, 38);
      ctx.strokeStyle = selected ? '#fff' : hovered ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(bx, y, 46, 38);

      ctx.fillStyle = selected ? '#fff' : '#999';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(a.icon, bx + 23, y + 18);

      ctx.fillStyle = selected ? '#fff' : '#777';
      ctx.font = '10px "Microsoft YaHei", sans-serif';
      ctx.fillText(a.name, bx + 23, y + 33);
    }

    if (hoveredArmor) {
      this._drawArmorTooltip(ctx, hoveredBx, y, hoveredArmor);
    }
  }

  // 武器悬浮详情面板
  _drawWeaponTooltip(ctx, bx, by, weapon) {
    const info = WEAPON_INFO[weapon.id];
    if (!info) return;
    const cw = this.canvas._logicW || this.canvas.width;
    const tw = 230, th = 68;
    let tx = bx + 23 - tw / 2;
    if (tx < 4) tx = 4;
    if (tx + tw > cw - 4) tx = cw - tw - 4;
    const ty = by - th - 6;

    // 背景 + 边框
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(tx - 1, ty - 1, tw + 2, th + 2);
    ctx.fillStyle = '#111122';
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = weapon.color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tx, ty, tw, th);

    // 标题: 名称 + 类型
    ctx.textAlign = 'left';
    ctx.fillStyle = weapon.color;
    ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${weapon.icon} ${weapon.name} — ${info.type}`, tx + 8, ty + 16);

    // 属性条
    const stats = [
      { label: '速', val: info.spd, color: '#44ff88' },
      { label: '攻', val: info.dmg, color: '#ff4444' },
      { label: '距', val: info.rng, color: '#4499ff' },
      { label: '防', val: info.def, color: '#ffcc44' },
    ];
    const barFullW = 24, barH = 5;
    let sx = tx + 8;
    const sy = ty + 30;
    for (const st of stats) {
      ctx.fillStyle = '#777';
      ctx.font = '10px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(st.label, sx, sy);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(sx + 14, sy - 6, barFullW, barH);
      ctx.fillStyle = st.color;
      ctx.fillRect(sx + 14, sy - 6, barFullW * st.val / 5, barH);
      sx += 54;
    }

    // 特性
    ctx.fillStyle = '#aaa';
    ctx.font = '10px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(info.traits.join(' · '), tx + 8, ty + 48);

    // 绝技
    ctx.fillStyle = '#cc88ff';
    ctx.font = '10px "Microsoft YaHei", sans-serif';
    ctx.fillText('绝技: ' + info.ult, tx + 8, ty + 62);
  }

  // 护甲悬浮详情面板
  _drawArmorTooltip(ctx, bx, by, armor) {
    const cw = this.canvas._logicW || this.canvas.width;
    if (armor.id === 'none') {
      const tw = 170, th = 36;
      let tx = bx + 23 - tw / 2;
      if (tx < 4) tx = 4;
      if (tx + tw > cw - 4) tx = cw - tw - 4;
      const ty = by - th - 6;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(tx - 1, ty - 1, tw + 2, th + 2);
      ctx.fillStyle = '#111122';
      ctx.fillRect(tx, ty, tw, th);
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.strokeRect(tx, ty, tw, th);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ccc';
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.fillText('👤 无甲 — 轻装上阵', tx + 8, ty + 15);
      ctx.fillStyle = '#888';
      ctx.font = '10px "Microsoft YaHei", sans-serif';
      ctx.fillText('无防护加成，全速灵活', tx + 8, ty + 29);
      return;
    }
    const tw = 220, th = 50;
    let tx = bx + 23 - tw / 2;
    if (tx < 4) tx = 4;
    if (tx + tw > cw - 4) tx = cw - tw - 4;
    const ty = by - th - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(tx - 1, ty - 1, tw + 2, th + 2);
    ctx.fillStyle = '#111122';
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = armor.armorColor || '#888';
    ctx.lineWidth = 1;
    ctx.strokeRect(tx, ty, tw, th);
    ctx.textAlign = 'left';
    ctx.fillStyle = armor.armorColor || '#ccc';
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${armor.icon} ${armor.name} — ${armor.desc}`, tx + 8, ty + 16);
    ctx.fillStyle = '#aaa';
    ctx.font = '10px "Microsoft YaHei", sans-serif';
    let line = `HP+${armor.hpBonus}  速度${Math.round(armor.speedMult * 100)}%  减伤${Math.round(armor.damageReductionPct * 100)}%`;
    if (armor.staggerResist > 0) line += `  硬直-${armor.staggerResist.toFixed(2)}s`;
    ctx.fillText(line, tx + 8, ty + 32);
    let specials = [];
    if (armor.blockCostReduction > 0) specials.push(`格挡消耗-${armor.blockCostReduction}`);
    if (armor.executionResist) specials.push('抗处决');
    if (armor.heavyDamageResist > 0) specials.push(`重击减伤${Math.round(armor.heavyDamageResist * 100)}%`);
    if (specials.length > 0) {
      ctx.fillStyle = '#cc8844';
      ctx.font = '10px "Microsoft YaHei", sans-serif';
      ctx.fillText(specials.join(' · '), tx + 8, ty + 44);
    }
  }

  // ---- 自由训练页 ----
  _updateTraining(mx, my) {
    const L = this._layoutTraining();
    // 难度选择
    for (let i = 0; i < 5; i++) {
      const bx = L.diffX + i * 42;
      if (this._hit(mx, my, bx, L.diffY, 36, 30)) {
        this.pvaiDiff = i + 1;
        this._clickCooldown = 0.12;
        return;
      }
    }
    if (this._hit(mx, my, L.startBtn.x, L.startBtn.y, L.startBtn.w, L.startBtn.h)) {
      this.result = { mode: 'training', diffA: 1, diffB: this.pvaiDiff, rounds: 0, simOnly: false };
      this._clickCooldown = 0.3;
      return;
    }
    if (this._hit(mx, my, L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h)) {
      this.page = 'entertainment';
      this._clickCooldown = 0.2;
    }
  }

  _drawTraining() {
    const ctx = this.ctx;
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const L = this._layoutTraining();

    this._drawSubHeader(ctx, cw, '🎯 自由训练', '场地自由移动 · 按E召唤敌人');
    this._drawDiffSelector(ctx, L.diffX, L.diffY, '敌人难度', this.pvaiDiff, '#ff4444', mx, my);

    // 说明
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaa';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillText('进入后无敌人，按 E 召唤敌人，R 重置，1-5 切换难度', cw / 2, L.diffY + 70);

    this._drawActionBtn(ctx, L.startBtn, '⚔ 进入训练场', '#66ccff', mx, my);
    this._drawActionBtn(ctx, L.backBtn, '← 返回', '#666', mx, my);
  }

  _layoutTraining() {
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const cx = cw / 2;
    const selectorW = 5 * 42;
    const btnW = 280;
    const btnH = 44;
    const diffX = cx - selectorW / 2;
    const diffY = ch * 0.38;
    return {
      diffX, diffY,
      startBtn: { x: cx - btnW / 2, y: diffY + 120, w: btnW, h: btnH },
      backBtn:  { x: cx - 60, y: diffY + 180, w: 120, h: 34 },
    };
  }

  // ---- 江湖行页 ----
  _updateJianghu(mx, my) {
    const L = this._layoutJianghu();
    // 武器选择
    for (let i = 0; i < WEAPON_LIST.length; i++) {
      const bx = L.weaponAx + i * 52;
      if (this._hit(mx, my, bx, L.weaponAy, 46, 38)) {
        this.weaponA = WEAPON_LIST[i].id;
        this._clickCooldown = 0.12;
        return;
      }
    }
    if (this._hit(mx, my, L.startBtn.x, L.startBtn.y, L.startBtn.w, L.startBtn.h)) {
      this.result = { mode: 'jianghu', weaponA: this.weaponA };
      this._clickCooldown = 0.3;
      return;
    }
    if (this._hit(mx, my, L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h)) {
      this.page = 'entertainment';
      this._clickCooldown = 0.2;
    }
  }

  _drawJianghu() {
    const ctx = this.ctx;
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const L = this._layoutJianghu();

    this._drawSubHeader(ctx, cw, '🏔 江湖行', '十关爬塔 · 3条命 · 闯荡江湖');

    // 武器选择
    this._drawWeaponSelector(ctx, L.weaponAx, L.weaponAy, '你的武器', this.weaponA, mx, my);

    // 描述
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaa';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillText('从山贼到武林盟主，敌人体型、血量、智能逐步升级', cw / 2, ch * 0.40);
    ctx.fillText('每关战胜后恢复40%HP，挑战到底!', cw / 2, ch * 0.45);

    // 关卡预览
    ctx.fillStyle = '#666';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillText('关卡: 山贼 → 镖师 → 恶霸 → 剑客 → 力士 → 捕快 → 武僧 → 长老 → 剑仙 → 盟主', cw / 2, ch * 0.52);

    this._drawActionBtn(ctx, L.startBtn, '⚔ 踏入江湖', '#ffcc44', mx, my);
    this._drawActionBtn(ctx, L.backBtn, '← 返回', '#666', mx, my);
  }

  _layoutJianghu() {
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const cx = cw / 2;
    const btnW = 280;
    const btnH = 48;
    const weaponW = WEAPON_LIST.length * 52;
    const weaponAx = cx - weaponW / 2;
    const weaponAy = ch * 0.26;
    return {
      weaponAx, weaponAy,
      startBtn: { x: cx - btnW / 2, y: ch * 0.58, w: btnW, h: btnH },
      backBtn: { x: cx - 60, y: ch * 0.58 + btnH + 20, w: 120, h: 34 },
    };
  }

  // ---- 武圣挑战页 ----
  _updateWusheng(mx, my) {
    const L = this._layoutWusheng();
    const t = this.trainer;
    const isTraining = t && t.running;

    // ---- 训练中的按钮 ----
    if (isTraining) {
      // 暂停/继续
      if (this._hit(mx, my, L.pauseBtn.x, L.pauseBtn.y, L.pauseBtn.w, L.pauseBtn.h)) {
        t.togglePause();
        this._clickCooldown = 0.2;
        return;
      }
      // 停止训练
      if (this._hit(mx, my, L.stopBtn.x, L.stopBtn.y, L.stopBtn.w, L.stopBtn.h)) {
        t.stop();
        this._clickCooldown = 0.3;
        return;
      }
      return; // 训练中不允许其他操作
    }

    // ---- 非训练状态按钮 ----
    // 开始挑战
    if (this.nnWeightsLoaded && this._hit(mx, my, L.startBtn.x, L.startBtn.y, L.startBtn.w, L.startBtn.h)) {
      this.result = { mode: 'wusheng', diffA: 1, diffB: 0, rounds: 0, simOnly: false };
      this._clickCooldown = 0.3;
      return;
    }
    // 观战模式: 武圣 vs D5
    if (this.nnWeightsLoaded && this._hit(mx, my, L.spectateBtn.x, L.spectateBtn.y, L.spectateBtn.w, L.spectateBtn.h)) {
      this.result = { mode: 'wusheng_spectate', diffA: 0, diffB: 5, rounds: 0, simOnly: false };
      this._clickCooldown = 0.3;
      return;
    }
    // 开始训练
    if (this._hit(mx, my, L.trainBtn.x, L.trainBtn.y, L.trainBtn.w, L.trainBtn.h)) {
      if (this._onTrainStart) this._onTrainStart();
      this._clickCooldown = 0.3;
      return;
    }
    // 下载权重
    if (this.nnWeightsLoaded && this._hit(mx, my, L.downloadBtn.x, L.downloadBtn.y, L.downloadBtn.w, L.downloadBtn.h)) {
      if (this._onDownloadWeights) this._onDownloadWeights();
      this._clickCooldown = 0.3;
      return;
    }
    // 上传权重
    if (this._hit(mx, my, L.uploadBtn.x, L.uploadBtn.y, L.uploadBtn.w, L.uploadBtn.h)) {
      if (this._onUploadWeights) this._onUploadWeights();
      this._clickCooldown = 0.3;
      return;
    }
    // 返回（从武圣页返回到娱乐模式）
    if (this._hit(mx, my, L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h)) {
      this.page = 'entertainment';
      this._clickCooldown = 0.2;
    }
  }

  _drawWusheng() {
    const ctx = this.ctx;
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const L = this._layoutWusheng();
    const t = this.trainer;
    const isTraining = t && t.running;

    this._drawSubHeader(ctx, cw, '🏆 挑战武圣', '对战神经网络训练的终极AI');

    // 状态提示
    const infoY = ch * 0.28;
    ctx.textAlign = 'center';

    if (isTraining) {
      // ---- 训练进行中 UI ----
      // 进度条
      const barW = 320, barH = 18;
      const barX = cw / 2 - barW / 2;
      const barY = infoY;
      ctx.fillStyle = '#222';
      ctx.fillRect(barX, barY, barW, barH);
      const pct = t.progress;
      const grad = ctx.createLinearGradient(barX, 0, barX + barW * pct, 0);
      grad.addColorStop(0, '#ff00ff');
      grad.addColorStop(1, '#ff66ff');
      ctx.fillStyle = grad;
      ctx.fillRect(barX, barY, barW * pct, barH);
      ctx.strokeStyle = '#555';
      ctx.strokeRect(barX, barY, barW, barH);

      // 进度文字
      ctx.fillStyle = '#fff';
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.fillText(
        `第 ${t.currentGen}/${t.generations} 代  局 ${t.currentEp}/${t.episodes}  D${t.currDiff}  胜率${(t.winRate * 100).toFixed(0)}%${t.paused ? '  ⏸ 已暂停' : ''}`,
        cw / 2, barY + barH + 18
      );

      // 日志区
      const logY = barY + barH + 36;
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(barX, logY, barW, 120);
      ctx.strokeStyle = '#333';
      ctx.strokeRect(barX, logY, barW, 120);
      ctx.textAlign = 'left';
      ctx.font = '11px Consolas, monospace';
      const visibleLog = t.log.slice(-8);
      for (let i = 0; i < visibleLog.length; i++) {
        ctx.fillStyle = visibleLog[i].includes('★') ? '#ffcc00' :
                        visibleLog[i].includes('完成') ? '#44ff88' : '#aaa';
        ctx.fillText(visibleLog[i], barX + 6, logY + 15 + i * 14);
      }
      ctx.textAlign = 'center';

      // 按钮
      this._drawActionBtn(ctx, L.pauseBtn, t.paused ? '▶ 继续' : '⏸ 暂停', '#ffaa33', mx, my);
      this._drawActionBtn(ctx, L.stopBtn, '⏹ 停止训练', '#ff4444', mx, my);

    } else {
      // ---- 非训练状态 UI ----
      if (this.nnLoadError && !this.nnWeightsLoaded) {
        ctx.fillStyle = '#ff6666';
        ctx.font = '13px "Microsoft YaHei", sans-serif';
        ctx.fillText('⚠ 未找到预训练权重 — 可在下方直接训练', cw / 2, infoY);
      } else if (this.nnWeightsLoaded) {
        ctx.fillStyle = '#ff00ff';
        ctx.font = '13px "Microsoft YaHei", sans-serif';
        ctx.fillText('✓ 武圣权重已加载', cw / 2, infoY);
      } else {
        ctx.fillStyle = '#aaa';
        ctx.font = '13px "Microsoft YaHei", sans-serif';
        ctx.fillText('正在加载武圣权重...', cw / 2, infoY);
      }

      // 评估结果（训练完成后显示）
      if (t && !t.running && Object.keys(t.evalRates).length > 0) {
        ctx.font = '12px "Microsoft YaHei", sans-serif';
        let rateStr = '';
        for (let d = 1; d <= 5; d++) {
          if (t.evalRates[d] !== undefined) {
            rateStr += `D${d}:${(t.evalRates[d] * 100).toFixed(0)}%  `;
          }
        }
        ctx.fillStyle = '#888';
        ctx.fillText('评估: ' + rateStr.trim(), cw / 2, infoY + 18);
      }

      // 挑战/观战按钮
      if (this.nnWeightsLoaded) {
        this._drawActionBtn(ctx, L.startBtn, '⚔ 挑战武圣', '#ff00ff', mx, my);
        this._drawActionBtn(ctx, L.spectateBtn, '🦗 武圣 vs D5 大师', '#ffaa33', mx, my);
      }

      // 训练按钮
      this._drawActionBtn(ctx, L.trainBtn, '🧠 开始训练 (50代)', '#9944ff', mx, my);

      // 下载按钮
      if (this.nnWeightsLoaded) {
        this._drawActionBtn(ctx, L.downloadBtn, '💾 下载权重', '#448899', mx, my);
      }

      // 上传按钮
      this._drawActionBtn(ctx, L.uploadBtn, '📂 上传权重', '#668844', mx, my);

      this._drawActionBtn(ctx, L.backBtn, '← 返回', '#666', mx, my);

      // 底部说明
      ctx.fillStyle = '#444';
      ctx.font = '11px "Microsoft YaHei", sans-serif';
      ctx.fillText('训练约需 1~3 分钟 · 课程学习 D1→D5 · 训练完自动可用 · 下载可保存/上传可导入', cw / 2, ch - 20);
    }
  }

  _layoutWusheng() {
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const cx = cw / 2;
    const btnW = 260;
    const btnH = 38;
    const smBtnW = 200;
    const smBtnH = 32;

    const t = this.trainer;
    const isTraining = t && t.running;

    if (isTraining) {
      // 训练中布局: 暂停 + 停止
      const ctrlY = ch * 0.72;
      return {
        pauseBtn: { x: cx - btnW / 2, y: ctrlY, w: btnW, h: btnH },
        stopBtn:  { x: cx - btnW / 2, y: ctrlY + btnH + 10, w: btnW, h: btnH },
        // 占位（不显示但需要存在以防 _hit 调用）
        startBtn: { x: -999, y: -999, w: 0, h: 0 },
        spectateBtn: { x: -999, y: -999, w: 0, h: 0 },
        trainBtn: { x: -999, y: -999, w: 0, h: 0 },
        downloadBtn: { x: -999, y: -999, w: 0, h: 0 },
        uploadBtn: { x: -999, y: -999, w: 0, h: 0 },
        backBtn: { x: -999, y: -999, w: 0, h: 0 },
      };
    }

    // 非训练布局
    const row1Y = ch * 0.34;
    const gap = btnH + 10;
    return {
      startBtn:    { x: cx - btnW / 2, y: row1Y, w: btnW, h: btnH },
      spectateBtn: { x: cx - btnW / 2, y: row1Y + gap, w: btnW, h: btnH },
      trainBtn:    { x: cx - btnW / 2, y: row1Y + gap * 2 + 8, w: btnW, h: btnH },
      downloadBtn: { x: cx - smBtnW / 2 - smBtnW / 2 - 6, y: row1Y + gap * 3 + 8, w: smBtnW, h: smBtnH },
      uploadBtn:   { x: cx + 6, y: row1Y + gap * 3 + 8, w: smBtnW, h: smBtnH },
      backBtn:     { x: cx - 60, y: row1Y + gap * 3 + 8 + smBtnH + 14, w: 120, h: 30 },
      // 占位
      pauseBtn: { x: -999, y: -999, w: 0, h: 0 },
      stopBtn:  { x: -999, y: -999, w: 0, h: 0 },
    };
  }

  // ---- 娱乐模式页（入口） ----
  _updateEntertainment(mx, my) {
    const L = this._layoutEntertainment();
    for (const card of L.cards) {
      if (this._hit(mx, my, card.x, card.y, card.w, card.h)) {
        if (card.page) {
          this.page = card.page;
          this._clickCooldown = 0.2;
        } else if (card.result) {
          this.result = { ...card.result };
          this._clickCooldown = 0.3;
        }
        return;
      }
    }
    if (this._hit(mx, my, L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h)) {
      this.page = 'main';
      this._clickCooldown = 0.2;
    }
  }

  _drawEntertainment() {
    const ctx = this.ctx;
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const L = this._layoutEntertainment();

    this._drawSubHeader(ctx, cw, '🎮 娱乐模式', '选择你的挑战方式');

    // 绘制分类标题
    for (const cat of L.catHeaders) {
      ctx.textAlign = 'left';
      ctx.fillStyle = cat.color;
      ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
      ctx.fillText(cat.name, L.gridX, cat.y + 13);
      const textW = ctx.measureText(cat.name).width;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(L.gridX + textW + 10, cat.y + 9);
      ctx.lineTo(L.gridX + L.gridW, cat.y + 9);
      ctx.stroke();
    }

    // 绘制模式卡片
    for (const card of L.cards) {
      this._drawModeCard(ctx, card, mx, my);
    }

    this._drawActionBtn(ctx, L.backBtn, '← 返回', '#666', mx, my);
  }

  _drawModeCard(ctx, card, mx, my) {
    const hovered = this._hit(mx, my, card.x, card.y, card.w, card.h);

    // 背景
    ctx.fillStyle = hovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.025)';
    ctx.fillRect(card.x, card.y, card.w, card.h);

    // 左侧强调条
    if (!hovered) ctx.globalAlpha = 0.4;
    ctx.fillStyle = card.accent;
    ctx.fillRect(card.x, card.y, 3, card.h);
    ctx.globalAlpha = 1.0;

    // 边框
    ctx.strokeStyle = hovered ? card.accent : 'rgba(255,255,255,0.07)';
    ctx.lineWidth = hovered ? 1.5 : 1;
    ctx.strokeRect(card.x, card.y, card.w, card.h);

    // 图标 + 名称
    ctx.textAlign = 'left';
    ctx.fillStyle = hovered ? '#fff' : '#ddd';
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
    ctx.fillText(card.icon + ' ' + card.name, card.x + 12, card.y + 20);

    // 描述
    ctx.fillStyle = hovered ? '#aaa' : '#555';
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    ctx.fillText(card.desc, card.x + 12, card.y + 37);
  }

  _layoutEntertainment() {
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const cx = cw / 2;
    const cardW = 220, cardH = 48, cardGap = 8, colGap = 12;
    const catGap = 8, catHeaderH = 22;
    const gridW = cardW * 2 + colGap;
    const gridX = cx - gridW / 2;

    let y = ch * 0.20;
    const cards = [];
    const catHeaders = [];

    const categories = [
      { name: '⚔ 单人挑战', color: '#ff6644' },
      { name: '🎲 休闲娱乐', color: '#ffaa44' },
      { name: '🔧 练习', color: '#66ccff' },
    ];

    const modes = [
      [
        { icon: '🏔', name: '江湖行', desc: '十关爬塔 · 3条命 · 闯荡江湖', accent: '#ffcc44', page: 'jianghu' },
        { icon: '⚔', name: '连战模式', desc: '击杀变大 · 无尽挑战', accent: '#ff6633', page: 'chainKill' },
        { icon: '🏆', name: '挑战武圣', desc: '神经网络终极AI', accent: '#ff00ff', page: 'wusheng' },
      ],
      [
        { icon: '🎮', name: '本地双人', desc: '键鼠 vs 手柄 · 同屏对战', accent: '#44dd88', page: 'local2p' },
        { icon: '🎲', name: '比武擂台', desc: 'AI对战 · 下注竞猜', accent: '#ff9944', result: { mode: 'arena' } },
        { icon: '🐎', name: '田忌赛马', desc: '策略排兵 · 以弱胜强', accent: '#88cc44', result: { mode: 'horseracing' } },
      ],
      [
        { icon: '🎯', name: '自由训练', desc: '无限制沙盒 · 按E召唤敌人 · 自由练习', accent: '#66ccff', page: 'training' },
      ],
    ];

    for (let c = 0; c < modes.length; c++) {
      catHeaders.push({ y, name: categories[c].name, color: categories[c].color });
      y += catHeaderH;
      const modeList = modes[c];
      for (let i = 0; i < modeList.length; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const singleItem = modeList.length === 1;
        cards.push({
          ...modeList[i],
          x: singleItem ? gridX : gridX + col * (cardW + colGap),
          y: y + row * (cardH + cardGap),
          w: singleItem ? gridW : cardW,
          h: cardH,
        });
      }
      const rows = Math.ceil(modeList.length / 2);
      y += rows * (cardH + cardGap) + catGap;
    }

    return {
      cards,
      catHeaders,
      gridX,
      gridW,
      backBtn: { x: cx - 60, y: y + 4, w: 120, h: 34 },
    };
  }

  // ---- 本地双人页 ----
  _updateLocal2P(mx, my) {
    const L = this._layoutLocal2P();
    // P1 武器选择
    for (let i = 0; i < WEAPON_LIST.length; i++) {
      const bx = L.weaponAx + i * 52;
      if (this._hit(mx, my, bx, L.weaponAy, 46, 38)) {
        this.weaponA = WEAPON_LIST[i].id;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // P2 武器选择
    for (let i = 0; i < WEAPON_LIST.length; i++) {
      const bx = L.weaponBx + i * 52;
      if (this._hit(mx, my, bx, L.weaponBy, 46, 38)) {
        this.weaponB = WEAPON_LIST[i].id;
        this._clickCooldown = 0.12;
        return;
      }
    }
    if (this._hit(mx, my, L.startBtn.x, L.startBtn.y, L.startBtn.w, L.startBtn.h)) {
      this.result = { mode: 'local2p', weaponA: this.weaponA, weaponB: this.weaponB };
      this._clickCooldown = 0.3;
      return;
    }
    if (this._hit(mx, my, L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h)) {
      this.page = 'entertainment';
      this._clickCooldown = 0.2;
    }
  }

  _drawLocal2P() {
    const ctx = this.ctx;
    const cw = this.canvas._logicW || this.canvas.width;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const L = this._layoutLocal2P();

    this._drawSubHeader(ctx, cw, '🎮 本地双人', 'P1 键盘+鼠标  vs  P2 手柄/键盘');
    this._drawWeaponSelector(ctx, L.weaponAx, L.weaponAy, 'P1 武器', this.weaponA, mx, my);
    this._drawWeaponSelector(ctx, L.weaponBx, L.weaponBy, 'P2 武器', this.weaponB, mx, my);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaa';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText('P1: WASD移动 · 鼠标瞄准 · 左键/J轻击 · 右键/K重击 · 空格招架 · Shift闪避 · F/L绝技', cw / 2, L.weaponBy + 56);
    ctx.fillText('P2: 方向键/左摇杆移动 · 小键盘1/X轻击 · 小键盘3/Y重击 · 小键盘5/B招架 · 小键盘2/RB闪避 · 小键盘4/RT绝技', cw / 2, L.weaponBy + 76);

    this._drawActionBtn(ctx, L.startBtn, '⚔ 开始对战', '#44dd88', mx, my);
    this._drawActionBtn(ctx, L.backBtn, '← 返回', '#666', mx, my);
  }

  _layoutLocal2P() {
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const cx = cw / 2;
    const btnW = 280;
    const btnH = 44;
    const weaponW = WEAPON_LIST.length * 52;
    const weaponAx = cx - weaponW - 10;
    const weaponBx = cx + 10;
    const weaponY = ch * 0.30;
    return {
      weaponAx, weaponAy: weaponY,
      weaponBx, weaponBy: weaponY,
      startBtn: { x: cx - btnW / 2, y: weaponY + 130, w: btnW, h: btnH },
      backBtn:  { x: cx - 60, y: weaponY + 190, w: 120, h: 34 },
    };
  }

  // ---- 连战模式页 ----
  _updateChainKill(mx, my) {
    const L = this._layoutChainKill();
    // 难度选择
    for (let i = 0; i < 5; i++) {
      const bx = L.diffX + i * 42;
      if (this._hit(mx, my, bx, L.diffY, 36, 30)) {
        this.pvaiDiff = i + 1;
        this._clickCooldown = 0.12;
        return;
      }
    }
    if (this._hit(mx, my, L.startBtn.x, L.startBtn.y, L.startBtn.w, L.startBtn.h)) {
      this.result = { mode: 'chainKill', diffA: 1, diffB: this.pvaiDiff, weaponA: this.weaponA, rounds: 0, simOnly: false };
      this._clickCooldown = 0.3;
      return;
    }
    if (this._hit(mx, my, L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h)) {
      this.page = 'entertainment';
      this._clickCooldown = 0.2;
    }
  }

  _drawChainKill() {
    const ctx = this.ctx;
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const L = this._layoutChainKill();

    this._drawSubHeader(ctx, cw, '⚔ 连战模式', '击杀敌人 → 体型变大 → 继续挑战');
    this._drawDiffSelector(ctx, L.diffX, L.diffY, '起始难度', this.pvaiDiff, '#ff4444', mx, my);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaa';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillText('每击杀1个敌人，你的体型增大一圈', cw / 2, L.diffY + 62);
    ctx.fillText('看看你能连斩多少人!', cw / 2, L.diffY + 82);

    this._drawActionBtn(ctx, L.startBtn, '⚔ 开始连战', '#ff6633', mx, my);
    this._drawActionBtn(ctx, L.backBtn, '← 返回', '#666', mx, my);
  }

  _layoutChainKill() {
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const cx = cw / 2;
    const selectorW = 5 * 42;
    const btnW = 280;
    const btnH = 44;
    const diffX = cx - selectorW / 2;
    const diffY = ch * 0.38;
    return {
      diffX, diffY,
      startBtn: { x: cx - btnW / 2, y: diffY + 130, w: btnW, h: btnH },
      backBtn:  { x: cx - 60, y: diffY + 190, w: 120, h: 34 },
    };
  }
}
