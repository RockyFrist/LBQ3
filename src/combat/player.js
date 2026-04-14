import { Fighter } from './fighter.js';
import { vec2Normalize } from '../core/utils.js';
import { WEAPON_DAO, getWeapon } from '../weapons/weapon-defs.js';
import { getArmor } from '../weapons/armor-defs.js';

export class Player {
  constructor(x, y, { scale = 1, hpMult = 1, weaponId = 'dao', armorId = 'none' } = {}) {
    const weapon = getWeapon(weaponId);
    const armor = getArmor(armorId);
    this.fighter = new Fighter(x, y, { color: weapon.color || '#4499ff', team: 0, name: '玩家', scale, hpMult, weapon, armor });
    this.isLocal2P = false; // 本地双人模式时 P1 不使用方向键（留给P2）
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
      ultimate: false,
    };

    // 移动
    let mx = 0, my = 0;
    if (input.held('KeyW'))    my -= 1;
    if (input.held('KeyS'))    my += 1;
    if (input.held('KeyA'))    mx -= 1;
    if (input.held('KeyD'))    mx += 1;
    // 非本地双人模式时，方向键也可移动（本地双人时方向键留给P2）
    if (!this.isLocal2P) {
      if (input.held('ArrowUp'))    my -= 1;
      if (input.held('ArrowDown'))  my += 1;
      if (input.held('ArrowLeft'))  mx -= 1;
      if (input.held('ArrowRight')) mx += 1;
    }
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
    if (input.mouseLeftDown || input.pressed('KeyJ')) cmd.lightAttack = true;
    if (input.mouseRightDown || input.pressed('KeyK')) cmd.heavyAttack = true;

    // 防御
    cmd.blockHeld = input.held('Space');

    // 绝技
    if (input.pressed('KeyF') || input.pressed('KeyL')) cmd.ultimate = true;

    // ===== 触屏虚拟按键覆盖 =====
    if (input.touchActive) {
      // 摇杆: 覆盖移动 + 朝向
      const tmx = input.touchMoveX;
      const tmy = input.touchMoveY;
      if (Math.abs(tmx) > 0.15 || Math.abs(tmy) > 0.15) {
        cmd.moveX = tmx;
        cmd.moveY = tmy;
        if (input.touchHasFace) {
          cmd.faceAngle = input.touchFaceAngle;
        }
      }
      // 按钮
      if (input.touchLightDown)  cmd.lightAttack = true;
      if (input.touchHeavyDown)  cmd.heavyAttack = true;
      if (input.touchBlockHeld)  cmd.blockHeld = true;
      if (input.touchDodge) {
        cmd.dodge = true;
        // 闪避方向: 有摇杆输入则朝摇杆方向，否则朝当前面朝方向
        cmd.dodgeAngle = input.touchHasFace ? input.touchFaceAngle : cmd.faceAngle;
      }
      if (input.touchUltimate)   cmd.ultimate = true;
    }

    return cmd;
  }
}
