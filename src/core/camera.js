export class Camera {
  constructor() {
    this.offsetX = 0;
    this.offsetY = 0;
    this.shakeIntensity = 0;
    this.shakeDur = 0;
    this.shakeTimer = 0;
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
