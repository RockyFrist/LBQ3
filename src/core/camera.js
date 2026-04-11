import * as C from './constants.js';

export class Camera {
  constructor() {
    // 震屏偏移（世界坐标系）
    this.offsetX = 0;
    this.offsetY = 0;
    this.shakeIntensity = 0;
    this.shakeDur = 0;
    this.shakeTimer = 0;

    // 视口：将 ARENA 映射到逻辑屏幕坐标
    this.viewScale = 1;
    this.viewX = 0;
    this.viewY = 0;
  }

  /** 根据逻辑屏幕尺寸更新视口缩放 */
  resize(logicW, logicH) {
    const sx = logicW / C.ARENA_W;
    const sy = logicH / C.ARENA_H;
    this.viewScale = Math.min(sx, sy);
    this.viewX = (logicW - C.ARENA_W * this.viewScale) / 2;
    this.viewY = (logicH - C.ARENA_H * this.viewScale) / 2;
  }

  /** 将世界坐标变换应用到 ctx（视口缩放 + 震屏偏移） */
  applyWorldTransform(ctx) {
    ctx.translate(this.viewX, this.viewY);
    ctx.scale(this.viewScale, this.viewScale);
    ctx.translate(this.offsetX, this.offsetY);
  }

  /** 屏幕逻辑坐标 → 世界坐标 */
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.viewX) / this.viewScale - this.offsetX,
      y: (sy - this.viewY) / this.viewScale - this.offsetY,
    };
  }

  shake(intensity, duration) {
    if (intensity > this.shakeIntensity) {
      this.shakeIntensity = intensity;
      this.shakeDur = duration;
      this.shakeTimer = 0;
    }
  }

  update(dt) {
    if (this.shakeDur > 0) {
      this.shakeTimer += dt;
      if (this.shakeTimer >= this.shakeDur) {
        this.shakeDur = 0;
        this.shakeIntensity = 0;
        this.offsetX = 0;
        this.offsetY = 0;
      } else {
        const t = 1 - this.shakeTimer / this.shakeDur;
        this.offsetX = (Math.random() - 0.5) * 2 * this.shakeIntensity * t;
        this.offsetY = (Math.random() - 0.5) * 2 * this.shakeIntensity * t;
      }
    }
  }
}
