export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justDown = new Set();
    this.justUp = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseLeft = false;
    this.mouseRight = false;
    this.mouseLeftDown = false;
    this.mouseRightDown = false;
    this.mouseLeftUp = false;
    this.mouseRightUp = false;

    // ===== 触屏状态（由 TouchControls 每帧写入） =====
    this.touchActive = false;   // 触控面板是否激活
    this.touchMoveX = 0;        // 摇杆 X (-1~1)
    this.touchMoveY = 0;        // 摇杆 Y (-1~1)
    this.touchFaceAngle = 0;    // 摇杆朝向角度
    this.touchHasFace = false;  // 摇杆有有效方向
    this.touchLightDown = false;
    this.touchHeavyDown = false;
    this.touchBlockHeld = false;
    this.touchDodge = false;
    this.touchUltimate = false;
    this.touchBack = false;

    window.addEventListener('keydown', e => {
      if (!this.keys.has(e.code)) this.justDown.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      this.justUp.add(e.code);
    });
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      // 使用逻辑坐标（CSS像素），与 DPI 缩放后的绘图坐标系一致
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', e => {
      e.preventDefault();
      if (e.button === 0) { this.mouseLeft = true; this.mouseLeftDown = true; }
      if (e.button === 2) { this.mouseRight = true; this.mouseRightDown = true; }
    });
    canvas.addEventListener('mouseup', e => {
      if (e.button === 0) { this.mouseLeft = false; this.mouseLeftUp = true; }
      if (e.button === 2) { this.mouseRight = false; this.mouseRightUp = true; }
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // ===== 触屏 → 鼠标模拟（菜单点击用） =====
    this._touchMouseId = null;
    canvas.addEventListener('touchstart', e => {
      // 触控面板激活时不模拟鼠标（由 TouchControls 处理）
      if (this.touchActive) { e.preventDefault(); return; }
      e.preventDefault();
      const t = e.changedTouches[0];
      this._touchMouseId = t.identifier;
      const r = canvas.getBoundingClientRect();
      this.mouseX = t.clientX - r.left;
      this.mouseY = t.clientY - r.top;
      this.mouseLeft = true;
      this.mouseLeftDown = true;
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      if (this.touchActive) { e.preventDefault(); return; }
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this._touchMouseId) {
          const r = canvas.getBoundingClientRect();
          this.mouseX = t.clientX - r.left;
          this.mouseY = t.clientY - r.top;
          break;
        }
      }
    }, { passive: false });
    canvas.addEventListener('touchend', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._touchMouseId) {
          this._touchMouseId = null;
          this.mouseLeft = false;
          this.mouseLeftUp = true;
          break;
        }
      }
    }, { passive: false });
  }

  held(code) { return this.keys.has(code); }
  pressed(code) { return this.justDown.has(code); }
  released(code) { return this.justUp.has(code); }

  endFrame() {
    this.justDown.clear();
    this.justUp.clear();
    this.mouseLeftDown = false;
    this.mouseRightDown = false;
    this.mouseLeftUp = false;
    this.mouseRightUp = false;
  }
}
