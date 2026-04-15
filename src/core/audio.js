// ===================== 程序化音效系统 =====================
// Web Audio API 程序化生成，无需加载音频文件

export class AudioManager {
  constructor() {
    this._ctx = null;
    this._masterGain = null;
    this._enabled = true;
    this._volume = 0.5;
  }

  /** 懒初始化 AudioContext（必须在用户交互后调用） */
  _ensureCtx() {
    if (this._ctx) return this._ctx;
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._masterGain = this._ctx.createGain();
      this._masterGain.gain.value = this._volume;
      this._masterGain.connect(this._ctx.destination);
    } catch (e) {
      console.warn('AudioContext 不可用:', e);
      this._enabled = false;
    }
    return this._ctx;
  }

  /** 恢复挂起的 AudioContext（iOS / autoplay policy）
   *  必须在用户手势回调中调用 — 同时负责首次创建 Context
   */
  resume() {
    const ctx = this._ensureCtx(); // 首次调用时在用户手势内创建
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
  }

  get enabled() { return this._enabled; }
  set enabled(v) { this._enabled = !!v; }

  get volume() { return this._volume; }
  set volume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this._masterGain) this._masterGain.gain.value = this._volume;
  }

  // ---- 辅助节点创建 ----

  _noise(duration) {
    const ctx = this._ctx;
    const len = Math.ceil(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  _osc(type, freq, duration) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    return osc;
  }

  _play(chain, duration) {
    // chain = [node, ...] → last connect to masterGain
    const last = chain[chain.length - 1];
    last.connect(this._masterGain);
    const src = chain[0];
    src.start();
    src.stop(this._ctx.currentTime + duration);
  }

  _gain(v) {
    const g = this._ctx.createGain();
    g.gain.value = v;
    return g;
  }

  _filter(type, freq) {
    const f = this._ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    return f;
  }

  _env(gainNode, attack, sustain, release, peak = 1) {
    const t = this._ctx.currentTime;
    const g = gainNode.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(peak, t + attack);
    g.setValueAtTime(peak, t + attack + sustain);
    g.linearRampToValueAtTime(0, t + attack + sustain + release);
  }

  _chain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) {
      nodes[i].connect(nodes[i + 1]);
    }
    nodes[nodes.length - 1].connect(this._masterGain);
    return nodes[0];
  }

  // ---- 音效 ----

  /** 轻攻击命中 */
  playLightHit() {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    const dur = 0.10;
    const noise = this._noise(dur);
    const filter = this._filter('bandpass', 2200);
    const gain = this._gain(0.4);
    this._env(gain, 0.005, 0.03, 0.065);
    this._chain(noise, filter, gain);
    noise.start();
    noise.stop(ctx.currentTime + dur);
  }

  /** 重攻击命中 */
  playHeavyHit() {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    // 低频冲击
    const osc = this._osc('sine', 80, 0.25);
    const gain1 = this._gain(0.6);
    this._env(gain1, 0.01, 0.06, 0.18);
    this._chain(osc, gain1);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    // 高频噪声
    const noise = this._noise(0.12);
    const filter = this._filter('bandpass', 1500);
    const gain2 = this._gain(0.3);
    this._env(gain2, 0.005, 0.04, 0.075);
    this._chain(noise, filter, gain2);
    noise.start();
    noise.stop(ctx.currentTime + 0.12);
  }

  /** 弹反/格挡 — level: 0=普通 1=半 2=精准 */
  playParry(level = 0) {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    const freqs = [1200, 2800, 4500];
    const vols = [0.25, 0.4, 0.55];
    const dur = [0.08, 0.12, 0.18][level] || 0.08;
    const osc = this._osc('triangle', freqs[level] || 1200, dur);
    const gain = this._gain(vols[level] || 0.25);
    this._env(gain, 0.003, dur * 0.3, dur * 0.6);
    this._chain(osc, gain);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  /** 武器交锋/clash */
  playClash(isHeavy = false) {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    const dur = isHeavy ? 0.22 : 0.14;
    const noise = this._noise(dur);
    const filter = this._filter('bandpass', isHeavy ? 800 : 3000);
    filter.Q.value = 2;
    const gain = this._gain(isHeavy ? 0.55 : 0.40);
    this._env(gain, 0.003, dur * 0.3, dur * 0.6);
    this._chain(noise, filter, gain);
    noise.start();
    noise.stop(ctx.currentTime + dur);
  }

  /** 闪避 — 风声 */
  playDodge() {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    const dur = 0.18;
    const noise = this._noise(dur);
    const filter = this._filter('highpass', 3000);
    const gain = this._gain(0.15);
    this._env(gain, 0.01, 0.05, 0.12);
    this._chain(noise, filter, gain);
    noise.start();
    noise.stop(ctx.currentTime + dur);
  }

  /** 完美闪避 — 风声+亮音 */
  playPerfectDodge() {
    if (!this._enabled) return;
    this.playDodge();
    const ctx = this._ensureCtx(); if (!ctx) return;
    const dur = 0.20;
    const osc = this._osc('sine', 1200, dur);
    const gain = this._gain(0.25);
    this._env(gain, 0.01, 0.06, 0.13);
    this._chain(osc, gain);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  /** 绝技蓄力 */
  playUltimateStartup() {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    const dur = 0.50;
    const osc = this._osc('sawtooth', 150, dur);
    osc.frequency.linearRampToValueAtTime(500, ctx.currentTime + dur);
    const filter = this._filter('lowpass', 1200);
    const gain = this._gain(0.35);
    this._env(gain, 0.05, 0.30, 0.15);
    this._chain(osc, filter, gain);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  /** 绝技命中 */
  playUltimateHit() {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    const dur = 0.15;
    const osc = this._osc('square', 180, dur);
    const gain1 = this._gain(0.5);
    this._env(gain1, 0.005, 0.05, 0.095);
    this._chain(osc, gain1);
    osc.start();
    osc.stop(ctx.currentTime + dur);
    // 高频
    const noise = this._noise(0.1);
    const filter = this._filter('bandpass', 2500);
    const gain2 = this._gain(0.3);
    this._env(gain2, 0.003, 0.03, 0.067);
    this._chain(noise, filter, gain2);
    noise.start();
    noise.stop(ctx.currentTime + 0.1);
  }

  /** 绝技交锋/clash */
  playUltimateClash() {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    const dur = 0.35;
    const noise = this._noise(dur);
    const filter = this._filter('bandpass', 600);
    filter.Q.value = 3;
    const gain = this._gain(0.6);
    this._env(gain, 0.01, 0.15, 0.19);
    this._chain(noise, filter, gain);
    noise.start();
    noise.stop(ctx.currentTime + dur);
    // 双音
    const osc = this._osc('sawtooth', 200, dur);
    const gain2 = this._gain(0.35);
    this._env(gain2, 0.01, 0.10, 0.24);
    this._chain(osc, gain2);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  /** 处决 */
  playExecution() {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    // 低频冲击波
    const osc = this._osc('sine', 60, 0.4);
    const gain = this._gain(0.6);
    this._env(gain, 0.01, 0.15, 0.24);
    this._chain(osc, gain);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    // 金属声
    const osc2 = this._osc('triangle', 400, 0.3);
    osc2.frequency.linearRampToValueAtTime(120, ctx.currentTime + 0.3);
    const gain2 = this._gain(0.4);
    this._env(gain2, 0.005, 0.10, 0.19);
    this._chain(osc2, gain2);
    osc2.start();
    osc2.stop(ctx.currentTime + 0.3);
  }

  /** 破防 */
  playGuardBreak() {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    const dur = 0.20;
    const osc = this._osc('square', 300, dur);
    osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + dur);
    const gain = this._gain(0.45);
    this._env(gain, 0.005, 0.06, 0.135);
    this._chain(osc, gain);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  /** 死亡 */
  playDeath() {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    const dur = 0.5;
    const osc = this._osc('sine', 200, dur);
    osc.frequency.linearRampToValueAtTime(50, ctx.currentTime + dur);
    const gain = this._gain(0.5);
    this._env(gain, 0.01, 0.20, 0.29);
    this._chain(osc, gain);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  /** 格挡 (普通) */
  playBlock() {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    const dur = 0.08;
    const noise = this._noise(dur);
    const filter = this._filter('bandpass', 800);
    const gain = this._gain(0.2);
    this._env(gain, 0.003, 0.03, 0.047);
    this._chain(noise, filter, gain);
    noise.start();
    noise.stop(ctx.currentTime + dur);
  }

  /** 攻击挥空 */
  playSwing() {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    const dur = 0.10;
    const noise = this._noise(dur);
    const filter = this._filter('highpass', 4000);
    const gain = this._gain(0.08);
    this._env(gain, 0.01, 0.03, 0.06);
    this._chain(noise, filter, gain);
    noise.start();
    noise.stop(ctx.currentTime + dur);
  }

  /** 菜单悬浮 */
  playMenuHover() {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    const dur = 0.05;
    const osc = this._osc('sine', 600, dur);
    const gain = this._gain(0.08);
    this._env(gain, 0.003, 0.02, 0.027);
    this._chain(osc, gain);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  /** 菜单点击 */
  playMenuClick() {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    const dur = 0.08;
    const osc = this._osc('sine', 900, dur);
    const gain = this._gain(0.15);
    this._env(gain, 0.003, 0.03, 0.047);
    this._chain(osc, gain);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  /** 武器选择 */
  playWeaponSelect() {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    const dur = 0.15;
    const osc = this._osc('triangle', 400, dur);
    osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + dur);
    const gain = this._gain(0.20);
    this._env(gain, 0.005, 0.06, 0.085);
    this._chain(osc, gain);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  /** 锤地震 */
  playGroundSlam() {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    const dur = 0.45;
    const osc = this._osc('sine', 40, dur);
    const gain = this._gain(0.7);
    this._env(gain, 0.01, 0.15, 0.29);
    this._chain(osc, gain);
    osc.start();
    osc.stop(ctx.currentTime + dur);
    // 碎裂声
    const noise = this._noise(0.25);
    const filter = this._filter('lowpass', 600);
    const gain2 = this._gain(0.4);
    this._env(gain2, 0.01, 0.08, 0.16);
    this._chain(noise, filter, gain2);
    noise.start();
    noise.stop(ctx.currentTime + 0.25);
  }

  /** 影步闪现 */
  playShadowStep() {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    const dur = 0.15;
    const noise = this._noise(dur);
    const filter = this._filter('highpass', 5000);
    const gain = this._gain(0.2);
    this._env(gain, 0.003, 0.05, 0.097);
    this._chain(noise, filter, gain);
    noise.start();
    noise.stop(ctx.currentTime + dur);
  }

  /** 旋风技能 */
  playWhirlwind() {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    const dur = 0.30;
    const noise = this._noise(dur);
    const filter = this._filter('bandpass', 2000);
    filter.Q.value = 1;
    const gain = this._gain(0.3);
    this._env(gain, 0.02, 0.15, 0.13);
    this._chain(noise, filter, gain);
    noise.start();
    noise.stop(ctx.currentTime + dur);
  }

  /** 盾反 */
  playShieldReflect() {
    if (!this._enabled) return;
    const ctx = this._ensureCtx(); if (!ctx) return;
    const dur = 0.18;
    const osc = this._osc('triangle', 2000, dur);
    osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + dur);
    const gain = this._gain(0.35);
    this._env(gain, 0.003, 0.06, 0.117);
    this._chain(osc, gain);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }
}
