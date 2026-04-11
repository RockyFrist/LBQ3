// ===================== 开始菜单（多页设计） =====================
export class Menu {
  constructor(canvas, input) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;

    this.page = 'main'; // 'main' | 'pvai' | 'spectate' | 'test' | 'wusheng' | 'jianghu'
    this.pvaiDiff = 3;
    this.nnWeightsLoaded = false;
    this.nnLoadError = null;
    this.diffA = 5;
    this.diffB = 5;
    this.testRounds = 50;
    this.result = null;

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
    }
  }

  _hit(mx, my, x, y, w, h) {
    return mx >= x && mx <= x + w && my >= y && my <= y + h;
  }

  _updateMain(mx, my) {
    const L = this._layoutMain();
    for (const btn of L.buttons) {
      if (this._hit(mx, my, btn.x, btn.y, btn.w, btn.h)) {
        this.page = btn.id;
        this._clickCooldown = 0.2;
        return;
      }
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
    // 难度选择
    for (let i = 0; i < 5; i++) {
      const bx = L.diffX + i * 42;
      if (this._hit(mx, my, bx, L.diffY, 36, 30)) {
        this.pvaiDiff = i + 1;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 开始按钮
    if (this._hit(mx, my, L.startBtn.x, L.startBtn.y, L.startBtn.w, L.startBtn.h)) {
      this.result = { mode: 'pvai', diffA: 1, diffB: this.pvaiDiff, rounds: 0, simOnly: false };
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
    // 难度 B
    for (let i = 0; i < 5; i++) {
      const bx = L.diffBx + i * 42;
      if (this._hit(mx, my, bx, L.diffBy, 36, 30)) {
        this.diffB = i + 1;
        this._clickCooldown = 0.12;
        return;
      }
    }
    // 开始
    if (this._hit(mx, my, L.startBtn.x, L.startBtn.y, L.startBtn.w, L.startBtn.h)) {
      this.result = { mode: 'spectate', diffA: this.diffA, diffB: this.diffB, rounds: 0, simOnly: false };
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
      this.result = { mode: 'test', diffA: this.diffA, diffB: this.diffB, rounds: this.testRounds, simOnly: false };
      this._clickCooldown = 0.3;
      return;
    }
    // 纯数据测试
    if (this._hit(mx, my, L.dataBtn.x, L.dataBtn.y, L.dataBtn.w, L.dataBtn.h)) {
      this.result = { mode: 'test', diffA: this.diffA, diffB: this.diffB, rounds: this.testRounds, simOnly: true };
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
    }
  }

  _drawBg() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
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
    const cw = this.canvas.width;
    const ch = this.canvas.height;
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

    // 新手引导按钮（右下角）
    this._drawActionBtn(ctx, L.helpBtn, '📖 操作帮助', '#888', mx, my);
  }

  _layoutMain() {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const cx = cw / 2;
    const btnW = 340;
    const btnH = 64;
    const gap = 18;
    const startY = ch * 0.22;

    return {
      buttons: [
        { id: 'jianghu', label: '🏔 江湖行', desc: '十关爬塔，3条命，闯荡江湖', accent: '#ffcc44',
          x: cx - btnW / 2, y: startY, w: btnW, h: btnH },
        { id: 'pvai', label: '⚔ 对战模式', desc: '玩家 vs AI，键鼠操作', accent: '#4499ff',
          x: cx - btnW / 2, y: startY + btnH + gap, w: btnW, h: btnH },
        { id: 'spectate', label: '🦗 斗蛐蛐', desc: '选择双方AI难度，观看互斗', accent: '#ffaa33',
          x: cx - btnW / 2, y: startY + (btnH + gap) * 2, w: btnW, h: btnH },
        { id: 'test', label: '📊 自动测试', desc: '批量对战数据统计与分析', accent: '#44ff88',
          x: cx - btnW / 2, y: startY + (btnH + gap) * 3, w: btnW, h: btnH },
        { id: 'wusheng', label: '🏆 挑战武圣', desc: '对战神经网络训练的终极AI', accent: '#ff00ff',
          x: cx - btnW / 2, y: startY + (btnH + gap) * 4, w: btnW, h: btnH },
      ],
      helpBtn: { x: cw - 110, y: ch - 44, w: 96, h: 32 },
    };
  }

  // ---- 对战模式页 ----
  _drawPvai() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const L = this._layoutSub('pvai');

    this._drawSubHeader(ctx, cw, '⚔ 对战模式', '选择敌人AI难度');
    this._drawDiffSelector(ctx, L.diffX, L.diffY, '敌人难度', this.pvaiDiff, '#ff4444', mx, my);
    this._drawActionBtn(ctx, L.startBtn, '开始对战', '#4499ff', mx, my);
    this._drawActionBtn(ctx, L.backBtn, '← 返回', '#666', mx, my);

    ctx.fillStyle = '#444';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('游戏中可按 1-5 切换难度 · 6 拼刀训练 · 7 格挡训练 · H 帮助', cw / 2, this.canvas.height - 24);
  }

  // ---- 斗蛐蛐页 ----
  _drawSpectate() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const L = this._layoutSub('spectate');

    this._drawSubHeader(ctx, cw, '🦗 斗蛐蛐', '选择双方AI难度，观看对决');
    this._drawDiffSelector(ctx, L.diffAx, L.diffAy, '左方 (蓝)', this.diffA, '#4499ff', mx, my);
    this._drawDiffSelector(ctx, L.diffBx, L.diffBy, '右方 (红)', this.diffB, '#ff4444', mx, my);
    this._drawActionBtn(ctx, L.startBtn, '开始观战', '#ffaa33', mx, my);
    this._drawActionBtn(ctx, L.backBtn, '← 返回', '#666', mx, my);
  }

  // ---- 测试页 ----
  _drawTest() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const L = this._layoutSub('test');

    this._drawSubHeader(ctx, cw, '📊 自动测试', '配置参数后选择测试方式');
    this._drawDiffSelector(ctx, L.diffAx, L.diffAy, '左方 (蓝)', this.diffA, '#4499ff', mx, my);
    this._drawDiffSelector(ctx, L.diffBx, L.diffBy, '右方 (红)', this.diffB, '#ff4444', mx, my);

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
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const cx = cw / 2;
    const selectorW = 5 * 42;
    const btnW = 280;
    const btnH = 44;

    if (page === 'pvai') {
      const diffX = cx - selectorW / 2;
      const diffY = ch * 0.38;
      return {
        diffX, diffY,
        startBtn: { x: cx - btnW / 2, y: diffY + 90, w: btnW, h: btnH },
        backBtn:  { x: cx - 60, y: diffY + 150, w: 120, h: 34 },
      };
    }

    if (page === 'spectate') {
      const diffGap = 50;
      const diffAx = cx - selectorW - diffGap / 2;
      const diffBx = cx + diffGap / 2;
      const diffY = ch * 0.34;
      return {
        diffAx, diffAy: diffY,
        diffBx, diffBy: diffY,
        startBtn: { x: cx - btnW / 2, y: diffY + 100, w: btnW, h: btnH },
        backBtn:  { x: cx - 60, y: diffY + 160, w: 120, h: 34 },
      };
    }

    // test
    const diffGap = 50;
    const diffAx = cx - selectorW - diffGap / 2;
    const diffBx = cx + diffGap / 2;
    const diffY = ch * 0.26;
    const roundsY = diffY + 90;
    const startBtnY = roundsY + 52;
    return {
      diffAx, diffAy: diffY,
      diffBx, diffBy: diffY,
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
    const ch = this.canvas.height;
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

  _drawDiffSelector(ctx, x, y, label, value, accentColor, mx, my) {
    const names = ['新手', '普通', '熟练', '困难', '大师'];
    const colors = ['#66cc66', '#cccc66', '#ff9933', '#ff5555', '#ff2222'];

    ctx.fillStyle = accentColor;
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + 5 * 42 / 2 - 3, y - 10);

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

    ctx.fillStyle = colors[value - 1];
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(names[value - 1], x + 5 * 42 / 2 - 3, y + 46);
  }

  // ---- 江湖行页 ----
  _updateJianghu(mx, my) {
    const L = this._layoutJianghu();
    if (this._hit(mx, my, L.startBtn.x, L.startBtn.y, L.startBtn.w, L.startBtn.h)) {
      this.result = { mode: 'jianghu' };
      this._clickCooldown = 0.3;
      return;
    }
    if (this._hit(mx, my, L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h)) {
      this.page = 'main';
      this._clickCooldown = 0.2;
    }
  }

  _drawJianghu() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const L = this._layoutJianghu();

    this._drawSubHeader(ctx, cw, '🏔 江湖行', '十关爬塔 · 3条命 · 闯荡江湖');

    // 描述
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaa';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillText('从山贼到武林盟主，敌人体型、血量、智能逐步升级', cw / 2, ch * 0.32);
    ctx.fillText('每关战胜后恢复40%HP，挑战到底!', cw / 2, ch * 0.37);

    // 关卡预览
    ctx.fillStyle = '#666';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillText('关卡: 山贼 → 镖师 → 恶霸 → 剑客 → 力士 → 捕快 → 武僧 → 长老 → 剑仙 → 盟主', cw / 2, ch * 0.44);

    this._drawActionBtn(ctx, L.startBtn, '⚔ 踏入江湖', '#ffcc44', mx, my);
    this._drawActionBtn(ctx, L.backBtn, '← 返回', '#666', mx, my);
  }

  _layoutJianghu() {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const cx = cw / 2;
    const btnW = 280;
    const btnH = 48;
    return {
      startBtn: { x: cx - btnW / 2, y: ch * 0.54, w: btnW, h: btnH },
      backBtn: { x: cx - 60, y: ch * 0.54 + btnH + 20, w: 120, h: 34 },
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
    // 返回
    if (this._hit(mx, my, L.backBtn.x, L.backBtn.y, L.backBtn.w, L.backBtn.h)) {
      this.page = 'main';
      this._clickCooldown = 0.2;
    }
  }

  _drawWusheng() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
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
    const cw = this.canvas.width;
    const ch = this.canvas.height;
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
}
