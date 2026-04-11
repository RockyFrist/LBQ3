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

    // 缩放控制（用户可调）
    this.zoomExtra = 1.5;        // 默认拉近 25%
    this.zoomExtraDefault = 1.25;
    this.zoomMin = 0.8;
    this.zoomMax = 2.0;

    // 跟踪目标（世界坐标）
    this._targetX = C.ARENA_W / 2;
    this._targetY = C.ARENA_H / 2;
    this._currentX = C.ARENA_W / 2;
    this._currentY = C.ARENA_H / 2;
    this._lerpSpeed = 4.0; // 镜头跟随平滑度

    // 存储逻辑屏幕尺寸
    this._logicW = 800;
    this._logicH = 600;
  }

  /** 根据逻辑屏幕尺寸更新视口缩放 */
  resize(logicW, logicH) {
    this._logicW = logicW;
    this._logicH = logicH;
    this._recalcViewport();
  }

  _recalcViewport() {
    const logicW = this._logicW;
    const logicH = this._logicH;
    const sx = logicW / C.ARENA_W;
    const sy = logicH / C.ARENA_H;
    this.viewScale = Math.min(sx, sy) * this.zoomExtra;

    // 视口中心对准跟踪点
    this.viewX = logicW / 2 - this._currentX * this.viewScale;
    this.viewY = logicH / 2 - this._currentY * this.viewScale;

    // 限制：不超出竞技场边界
    const arenaScreenW = C.ARENA_W * this.viewScale;
    const arenaScreenH = C.ARENA_H * this.viewScale;
    if (arenaScreenW <= logicW) {
      this.viewX = (logicW - arenaScreenW) / 2;
    } else {
      this.viewX = Math.min(0, Math.max(logicW - arenaScreenW, this.viewX));
    }
    if (arenaScreenH <= logicH) {
      this.viewY = (logicH - arenaScreenH) / 2;
    } else {
      this.viewY = Math.min(0, Math.max(logicH - arenaScreenH, this.viewY));
    }
  }

  /** 设置镜头跟踪目标（世界坐标） */
  setTarget(x, y) {
    this._targetX = x;
    this._targetY = y;
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
    // 平滑跟踪
    const t = 1 - Math.exp(-this._lerpSpeed * dt);
    this._currentX += (this._targetX - this._currentX) * t;
    this._currentY += (this._targetY - this._currentY) * t;
    this._recalcViewport();

    // 震屏
    if (this.shakeDur > 0) {
      this.shakeTimer += dt;
      if (this.shakeTimer >= this.shakeDur) {
        this.shakeDur = 0;
        this.shakeIntensity = 0;
        this.offsetX = 0;
        this.offsetY = 0;
      } else {
        const t2 = 1 - this.shakeTimer / this.shakeDur;
        this.offsetX = (Math.random() - 0.5) * 2 * this.shakeIntensity * t2;
        this.offsetY = (Math.random() - 0.5) * 2 * this.shakeIntensity * t2;
      }
    }
  }
}
