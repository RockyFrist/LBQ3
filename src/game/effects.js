// ===================== 游戏效果方法 =====================
// 从 game.js 提取：浮动文字、屏幕闪光、顿帧、时间缩放
// 使用方式: Object.assign(Game.prototype, effectsMethods)

export const effectsMethods = {
  addFloatingText(x, y, text, color, size = 18, duration = 1.2, vy = -50) {
    // 自动散开：检查附近是否已有文字，有则偏移
    for (const ft of this.floatingTexts) {
      if (ft.timer > ft.maxTimer * 0.7 && Math.abs(ft.x - x) < 60 && Math.abs(ft.y - y) < 20) {
        y -= 22;
      }
    }
    this.floatingTexts.push({
      x, y, text, color,
      fontSize: size,
      timer: duration,
      maxTimer: duration,
      vy
    });
  },

  flashScreen(color, duration = 0.12) {
    this.screenFlash = { color, timer: duration, maxTimer: duration };
  },

  applyHitFreeze(duration) {
    this.hitFreezeTimer = Math.max(this.hitFreezeTimer, duration);
  },

  applyTimeScale(scale, duration) {
    // 只接受更强的减速效果
    if (this.timeScaleTimer > 0 && scale >= this.timeScale) return;
    this.timeScale = scale;
    this.timeScaleTimer = duration;
  },
};
