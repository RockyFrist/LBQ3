// ===================== 手柄+键盘输入（本地双人P2） =====================
// 读取第一个连接的手柄，每帧轮询
// 同时支持键盘操作：方向键移动，小键盘 1轻击 2闪避 3重击 4绝技 5招架
// 布局: 左摇杆移动+朝向, X轻击, Y重击, B防御, RT绝技, RB/A/LB闪避

import { vec2Normalize } from './utils.js';

const DEADZONE = 0.18;

export class GamepadPlayer {
  constructor() {
    this.fighter = null; // 由 Game 设置
    this._lastButtons = new Array(20).fill(false);
    this._buttons = new Array(20).fill(false);
    this._axes = [0, 0, 0, 0];
    this._lastFacing = 0; // 右摇杆最后有输入时的朝向
  }

  /** 每帧开始时调用，刷新手柄状态 */
  poll() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const g of gamepads) {
      if (g && g.connected) { gp = g; break; }
    }
    this._lastButtons = [...this._buttons];
    if (!gp) {
      this._buttons.fill(false);
      this._axes = [0, 0, 0, 0];
      return;
    }
    for (let i = 0; i < gp.buttons.length && i < 20; i++) {
      this._buttons[i] = gp.buttons[i].pressed;
    }
    for (let i = 0; i < gp.axes.length && i < 4; i++) {
      this._axes[i] = Math.abs(gp.axes[i]) > DEADZONE ? gp.axes[i] : 0;
    }
  }

  /** 按钮刚按下 */
  _justPressed(idx) {
    return this._buttons[idx] && !this._lastButtons[idx];
  }

  /** 按钮持续按住 */
  _held(idx) {
    return this._buttons[idx];
  }

  /**
   * 生成命令对象（与 Player.getCommands 格式一致）
   * 
   * Xbox 手柄映射:
   *   左摇杆 (axes 0,1)  → 移动 + 朝向（同方向）
   *   X  (btn 2)         → 轻攻击
   *   Y  (btn 3)         → 重攻击
   *   B  (btn 1)         → 防御
   *   RT (btn 7)         → 绝技
   *   RB (btn 5) / A(btn 0) → 闪避
   *   LB (btn 4)         → 闪避（备用）
   * 
   * 键盘映射 (P2):
   *   方向键              → 移动 + 朝向
   *   小键盘1 / End       → 轻攻击
   *   小键盘2 / ↓         → 闪避
   *   小键盘3 / PgDn      → 重攻击
   *   小键盘4 / ←         → 绝技
   *   小键盘5 / Clear     → 招架
   */
  getCommands(input) {
    const f = this.fighter;
    const cmd = {
      moveX: 0, moveY: 0,
      faceAngle: this._lastFacing,
      lightAttack: false,
      heavyAttack: false,
      blockHeld: false,
      dodge: false,
      dodgeAngle: 0,
      ultimate: false,
    };

    // ===== 手柄输入 =====
    // 左摇杆: 移动 + 朝向（移动方向即面朝方向）
    let mx = this._axes[0];
    let my = this._axes[1];

    // ===== 键盘输入（方向键移动） =====
    if (input) {
      if (input.held('ArrowUp'))    my -= 1;
      if (input.held('ArrowDown'))  my += 1;
      if (input.held('ArrowLeft'))  mx -= 1;
      if (input.held('ArrowRight')) mx += 1;
    }

    const mv = vec2Normalize(mx, my);
    cmd.moveX = mv.x;
    cmd.moveY = mv.y;

    if (Math.abs(mv.x) > 0 || Math.abs(mv.y) > 0) {
      this._lastFacing = Math.atan2(mv.y, mv.x);
    }
    cmd.faceAngle = this._lastFacing;

    // X → 轻攻击 / 小键盘1
    if (this._justPressed(2)) cmd.lightAttack = true;
    if (input && input.pressed('Numpad1')) cmd.lightAttack = true;
    // Y → 重攻击 / 小键盘3
    if (this._justPressed(3)) cmd.heavyAttack = true;
    if (input && input.pressed('Numpad3')) cmd.heavyAttack = true;
    // B → 防御 / 小键盘5
    cmd.blockHeld = this._held(1);
    if (input && input.held('Numpad5')) cmd.blockHeld = true;
    // RB / A / LB → 闪避 / 小键盘2
    const gpDodge = this._justPressed(5) || this._justPressed(0) || this._justPressed(4);
    const kbDodge = input && input.pressed('Numpad2');
    if (gpDodge || kbDodge) {
      cmd.dodge = true;
      if (Math.abs(mv.x) > 0 || Math.abs(mv.y) > 0) {
        cmd.dodgeAngle = Math.atan2(mv.y, mv.x);
      } else {
        cmd.dodgeAngle = this._lastFacing; // 无方向时朝面向闪避
      }
    }
    // RT → 绝技 / 小键盘4
    if (this._justPressed(7)) cmd.ultimate = true;
    if (input && input.pressed('Numpad4')) cmd.ultimate = true;

    return cmd;
  }
}
