class Particle {
  constructor(x, y, vx, vy, life, color, size) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life;
    this.color = color; this.size = size;
    this.alive = true;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.96;
    this.vy *= 0.96;
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }
}

export class ParticleSystem {
  constructor() { this.particles = []; }

  update(dt) {
    for (const p of this.particles) p.update(dt);
    this.particles = this.particles.filter(p => p.alive);
  }

  _emit(x, y, count, angle, spread, speed, life, color, size) {
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.4 + Math.random() * 0.6);
      const l = life * (0.5 + Math.random() * 0.5);
      const sz = size * (0.5 + Math.random() * 0.5);
      this.particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s, l, color, sz));
    }
  }

  sparks(x, y, angle, count = 12) {
    this._emit(x, y, count, angle, Math.PI * 0.8, 300, 0.4, '#ffcc33', 4);
    this._emit(x, y, Math.floor(count * 0.6), angle, Math.PI * 0.5, 180, 0.3, '#fff', 2.5);
  }

  blood(x, y, angle, count = 8) {
    this._emit(x, y, count, angle, Math.PI * 0.5, 220, 0.4, '#e33', 4);
    this._emit(x, y, Math.floor(count / 3), angle, Math.PI * 0.3, 140, 0.5, '#900', 3);
  }

  clash(x, y, count = 18) {
    this._emit(x, y, count, 0, Math.PI * 2, 280, 0.35, '#ffdd55', 4);
    this._emit(x, y, Math.floor(count * 0.5), 0, Math.PI * 2, 160, 0.4, '#fff', 3);
    this._emit(x, y, Math.floor(count * 0.3), 0, Math.PI * 2, 100, 0.5, '#ff8800', 2.5);
  }

  blockSpark(x, y, angle, count = 8) {
    this._emit(x, y, count, angle + Math.PI, Math.PI * 0.6, 220, 0.3, '#88ccff', 3);
    this._emit(x, y, Math.floor(count / 2), angle + Math.PI, Math.PI * 0.4, 140, 0.25, '#ccddff', 2);
  }

  execution(x, y, count = 30) {
    this._emit(x, y, count, 0, Math.PI * 2, 250, 0.6, '#ff2222', 5);
    this._emit(x, y, Math.floor(count * 0.5), 0, Math.PI * 2, 150, 0.7, '#ffaa00', 4);
    this._emit(x, y, Math.floor(count * 0.3), 0, Math.PI * 2, 80, 0.8, '#fff', 3);
  }

  /** 拔刀绝技刀光粒子（前方扇形连斩） */
  ultimateSlash(x, y, facing, range, arc, isLastHit) {
    const count = isLastHit ? 20 : 8;
    const speed = isLastHit ? 300 : 200;
    // 前方扇形刀光
    this._emit(x, y, count, facing, arc, speed, 0.35, '#aaddff', isLastHit ? 5 : 3);
    this._emit(x, y, Math.floor(count * 0.5), facing, arc * 0.6, speed * 0.7, 0.4, '#ffffff', isLastHit ? 4 : 2.5);
    if (isLastHit) {
      // 末段大爆发
      this._emit(x, y, 12, facing, arc, 350, 0.5, '#6699ff', 4);
    }
  }

  /** 满炁粒子（角色身上的炁气流） */
  qiAura(x, y, radius) {
    const a = Math.random() * Math.PI * 2;
    const r = radius + Math.random() * 8;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    // 向内旋转的粒子
    const inward = a + Math.PI + (Math.random() - 0.5) * 1.5;
    const s = 30 + Math.random() * 40;
    const color = Math.random() < 0.4 ? '#aaccff' : '#ddeeff';
    this.particles.push(new Particle(px, py, Math.cos(inward) * s, Math.sin(inward) * s - 20, 0.4 + Math.random() * 0.3, color, 2));
  }

  draw(ctx) {
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.3 + 0.7 * alpha), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
