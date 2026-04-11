import { Fighter } from './fighter.js';
import { vec2Normalize } from '../core/utils.js';

export class Player {
  constructor(x, y, { scale = 1, hpMult = 1 } = {}) {
    this.fighter = new Fighter(x, y, { color: '#4499ff', team: 0, name: '玩家', scale, hpMult });
  }

  getCommands(input) {
    const f = this.fighter;
    // 使用世界坐标的鼠标位置（如果可用）
    const wmx = input._worldMouseX != null ? input._worldMouseX : input.mouseX;
    const wmy = input._worldMouseY != null ? input._worldMouseY : input.mouseY;
    const cmd = {
      moveX: 0, moveY: 0,
      faceAngle: Math.atan2(wmy - f.y, wmx - f.x),
      lightAttack: false,
      heavyAttack: false,
      blockHeld: false,
      dodge: false,
      dodgeAngle: 0,
    };

    // 移动
    let mx = 0, my = 0;
    if (input.held('KeyW') || input.held('ArrowUp'))    my -= 1;
    if (input.held('KeyS') || input.held('ArrowDown'))  my += 1;
    if (input.held('KeyA') || input.held('ArrowLeft'))  mx -= 1;
    if (input.held('KeyD') || input.held('ArrowRight')) mx += 1;
    const mv = vec2Normalize(mx, my);
    cmd.moveX = mv.x;
    cmd.moveY = mv.y;

    // 闪避 (Shift + 方向)
    if (input.pressed('ShiftLeft') || input.pressed('ShiftRight')) {
      if (mx !== 0 || my !== 0) {
        cmd.dodge = true;
        cmd.dodgeAngle = Math.atan2(mv.y, mv.x);
      }
    }

    // 攻击：按下瞬间触发（配合预输入缓冲系统，不会丢输入）
    if (input.mouseLeftDown) cmd.lightAttack = true;
    if (input.mouseRightDown) cmd.heavyAttack = true;

    // 防御
    cmd.blockHeld = input.held('Space');

    return cmd;
  }
}
