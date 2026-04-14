// ===================== 移动端触屏虚拟按键系统 =====================
// 检测触屏设备后自动显示虚拟摇杆+操作按钮
// 左侧: 动态虚拟摇杆(移动+朝向)
// 右侧: 轻击/重击/招架/闪避/绝技 按钮
// 顶部: 返回按钮

/** 检测是否为触屏设备 */
export function isTouchDevice() {
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
}

/**
 * 触屏控制器
 * - 管理DOM覆盖层的虚拟摇杆和按钮
 * - 每帧同步状态到 Input 类的 touch* 属性
 */
export class TouchControls {
  constructor(input) {
    this.input = input;
    this.visible = false;
    this.backOnly = false; // 仅显示返回按钮（非玩家操作模式）

    // ===== 摇杆状态 =====
    this._joyTouchId = null;
    this._joyStartX = 0;
    this._joyStartY = 0;
    this._joyRadius = 55;
    this.moveX = 0; // -1 ~ 1
    this.moveY = 0;

    // ===== 按钮触摸ID跟踪 =====
    this._btnTouchIds = {}; // { btnId: touchIdentifier }

    // ===== 按钮状态 =====
    this._btnState = {};
    this._prevBtnState = {};
    this._btnJustDown = {};

    // ===== 返回按钮 =====
    this._backPressed = false;

    // ===== 初始化DOM =====
    this._createDOM();
    this._initButtons();
    this._bindEvents();
  }

  // ===================== DOM创建 =====================
  _createDOM() {
    // 容器
    this._container = document.createElement('div');
    this._container.id = 'touch-controls';
    this._container.className = 'touch-hidden';

    // ---- 返回按钮 ----
    this._backBtn = document.createElement('div');
    this._backBtn.id = 'touch-back-btn';
    this._backBtn.textContent = '← 返回';
    this._container.appendChild(this._backBtn);

    // ---- 摇杆区域 ----
    this._joyArea = document.createElement('div');
    this._joyArea.id = 'touch-joy-area';

    this._joyBase = document.createElement('div');
    this._joyBase.id = 'touch-joy-base';
    this._joyBase.style.display = 'none';

    this._joyThumb = document.createElement('div');
    this._joyThumb.id = 'touch-joy-thumb';
    this._joyBase.appendChild(this._joyThumb);
    this._joyArea.appendChild(this._joyBase);
    this._container.appendChild(this._joyArea);

    // ---- 操作按钮区域 ----
    this._btnArea = document.createElement('div');
    this._btnArea.id = 'touch-btn-area';

    const btnDefs = [
      { id: 'heavy', label: '重', cls: 'tb-heavy' },
      { id: 'light', label: '轻', cls: 'tb-light' },
      { id: 'block', label: '防', cls: 'tb-block' },
      { id: 'dodge', label: '闪', cls: 'tb-dodge' },
      { id: 'ultimate', label: '绝', cls: 'tb-ult' },
    ];

    this._btnEls = {};
    for (const def of btnDefs) {
      const el = document.createElement('div');
      el.className = `touch-btn ${def.cls}`;
      el.dataset.btn = def.id;
      el.textContent = def.label;
      this._btnArea.appendChild(el);
      this._btnEls[def.id] = el;
    }
    this._container.appendChild(this._btnArea);

    document.getElementById('game-container').appendChild(this._container);
  }

  _initButtons() {
    const ids = ['light', 'heavy', 'block', 'dodge', 'ultimate'];
    for (const id of ids) {
      this._btnState[id] = false;
      this._prevBtnState[id] = false;
      this._btnJustDown[id] = false;
      this._btnTouchIds[id] = null;
    }
  }

  // ===================== 事件绑定 =====================
  _bindEvents() {
    // ---- 摇杆 ----
    this._joyArea.addEventListener('touchstart', e => this._onJoyStart(e), { passive: false });
    this._joyArea.addEventListener('touchmove', e => this._onJoyMove(e), { passive: false });
    this._joyArea.addEventListener('touchend', e => this._onJoyEnd(e), { passive: false });
    this._joyArea.addEventListener('touchcancel', e => this._onJoyEnd(e), { passive: false });

    // ---- 操作按钮 ----
    // 用整个按钮区域来处理，通过 target 判断哪个按钮
    this._btnArea.addEventListener('touchstart', e => this._onBtnTouch(e, true), { passive: false });
    this._btnArea.addEventListener('touchend', e => this._onBtnTouch(e, false), { passive: false });
    this._btnArea.addEventListener('touchcancel', e => this._onBtnTouch(e, false), { passive: false });

    // ---- 返回按钮 ----
    this._backBtn.addEventListener('touchstart', e => {
      e.preventDefault();
      e.stopPropagation();
      this._backPressed = true;
    }, { passive: false });
    this._backBtn.addEventListener('click', e => {
      e.preventDefault();
      this._backPressed = true;
    });
  }

  // ===================== 摇杆处理 =====================
  _onJoyStart(e) {
    e.preventDefault();
    if (this._joyTouchId !== null) return; // 已有一个手指在操作
    const t = e.changedTouches[0];
    this._joyTouchId = t.identifier;
    this._joyStartX = t.clientX;
    this._joyStartY = t.clientY;
    this._updateJoyVisual(0, 0);
    this._joyBase.style.display = '';
    // 动态定位摇杆基座到触摸位置
    const rect = this._joyArea.getBoundingClientRect();
    this._joyBase.style.left = (t.clientX - rect.left) + 'px';
    this._joyBase.style.top = (t.clientY - rect.top) + 'px';
  }

  _onJoyMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== this._joyTouchId) continue;
      let dx = t.clientX - this._joyStartX;
      let dy = t.clientY - this._joyStartY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > this._joyRadius) {
        dx = dx / d * this._joyRadius;
        dy = dy / d * this._joyRadius;
      }
      this.moveX = dx / this._joyRadius;
      this.moveY = dy / this._joyRadius;
      this._updateJoyVisual(dx, dy);
      break;
    }
  }

  _onJoyEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== this._joyTouchId) continue;
      this._joyTouchId = null;
      this.moveX = 0;
      this.moveY = 0;
      this._joyBase.style.display = 'none';
      break;
    }
  }

  _updateJoyVisual(dx, dy) {
    // 移动拇指圆球
    this._joyThumb.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  // ===================== 按钮处理 =====================
  _onBtnTouch(e, isDown) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (isDown) {
        // 找到被触摸的按钮
        const el = document.elementFromPoint(t.clientX, t.clientY);
        const btnId = el && el.dataset && el.dataset.btn;
        if (btnId && this._btnState.hasOwnProperty(btnId)) {
          this._btnState[btnId] = true;
          this._btnTouchIds[btnId] = t.identifier;
          el.classList.add('active');
        }
      } else {
        // 释放时按 touchId 找到对应按钮
        for (const id in this._btnTouchIds) {
          if (this._btnTouchIds[id] === t.identifier) {
            this._btnState[id] = false;
            this._btnTouchIds[id] = null;
            if (this._btnEls[id]) this._btnEls[id].classList.remove('active');
          }
        }
      }
    }
  }

  // ===================== 每帧更新 =====================
  /** 每帧调用，计算 justDown 并同步到 Input */
  poll() {
    if (!this.visible) return;

    // 计算本帧刚按下的按钮
    for (const id in this._btnState) {
      this._btnJustDown[id] = this._btnState[id] && !this._prevBtnState[id];
      this._prevBtnState[id] = this._btnState[id];
    }

    // 同步到 Input
    const inp = this.input;
    inp.touchActive = this.visible && !this.backOnly;

    if (inp.touchActive) {
      // 摇杆 → 移动
      inp.touchMoveX = this.moveX;
      inp.touchMoveY = this.moveY;
      // 面朝方向（摇杆方向）
      if (Math.abs(this.moveX) > 0.15 || Math.abs(this.moveY) > 0.15) {
        inp.touchFaceAngle = Math.atan2(this.moveY, this.moveX);
        inp.touchHasFace = true;
      } else {
        inp.touchHasFace = false;
      }
      // 按钮
      inp.touchLightDown = this._btnJustDown.light || false;
      inp.touchHeavyDown = this._btnJustDown.heavy || false;
      inp.touchBlockHeld = this._btnState.block || false;
      inp.touchDodge = this._btnJustDown.dodge || false;
      inp.touchUltimate = this._btnJustDown.ultimate || false;
    }

    // 返回按钮（无论是否 backOnly 都生效）
    inp.touchBack = this._backPressed;
    this._backPressed = false;
  }

  // ===================== 显示/隐藏 =====================
  /** 显示全部触控（游戏中玩家操作模式） */
  show() {
    this.visible = true;
    this.backOnly = false;
    this._container.classList.remove('touch-hidden');
    this._joyArea.style.display = '';
    this._btnArea.style.display = '';
    this._backBtn.style.display = '';
  }

  /** 仅显示返回按钮（观战/擂台等非操作模式） */
  showBackOnly() {
    this.visible = true;
    this.backOnly = true;
    this._container.classList.remove('touch-hidden');
    this._joyArea.style.display = 'none';
    this._btnArea.style.display = 'none';
    this._backBtn.style.display = '';
  }

  /** 隐藏全部（菜单中） */
  hide() {
    this.visible = false;
    this.backOnly = false;
    this._container.classList.add('touch-hidden');
    this._resetState();
  }

  _resetState() {
    this.moveX = 0;
    this.moveY = 0;
    this._joyTouchId = null;
    this._joyBase.style.display = 'none';
    for (const id in this._btnState) {
      this._btnState[id] = false;
      this._prevBtnState[id] = false;
      this._btnJustDown[id] = false;
      this._btnTouchIds[id] = null;
    }
    this._backPressed = false;
    // 清理 Input 上的 touch 状态
    const inp = this.input;
    inp.touchActive = false;
    inp.touchMoveX = 0;
    inp.touchMoveY = 0;
    inp.touchHasFace = false;
    inp.touchLightDown = false;
    inp.touchHeavyDown = false;
    inp.touchBlockHeld = false;
    inp.touchDodge = false;
    inp.touchUltimate = false;
    inp.touchBack = false;
  }
}
