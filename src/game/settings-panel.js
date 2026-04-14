// ===================== 设置面板逻辑 =====================
// 从 game.js 提取的设置面板模块
// 使用方式: Object.assign(Game.prototype, settingsPanelMethods)

export const settingsPanelMethods = {
  _getSettingsBtnRect() {
    const lw = this.canvas._logicW || this.canvas.width;
    return { x: lw - 44, y: 6, w: 36, h: 36 };
  },

  _drawSettingsBtn() {
    const ctx = this.canvas.getContext('2d');
    const r = this._getSettingsBtnRect();
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    const hovered = mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;

    ctx.fillStyle = hovered ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = hovered ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = hovered ? '#fff' : '#999';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚙', r.x + r.w / 2, r.y + r.h / 2 + 6);
  },

  _getSettingsLayout() {
    const lw = this.canvas._logicW || this.canvas.width;
    const lh = this.canvas._logicH || this.canvas.height;
    const panelW = 320;
    const panelH = 300;
    const px = (lw - panelW) / 2;
    const py = (lh - panelH) / 2;
    const sliderW = 200;
    const sliderH = 20;
    const sliderX = px + (panelW - sliderW) / 2;
    const zoomSliderY = py + 80;
    const volumeSliderY = py + 145;
    const soundToggleY = py + 185;
    return {
      px, py, panelW, panelH,
      sliderX, sliderW, sliderH,
      zoomSliderY,
      volumeSliderY,
      soundToggleY,
      soundToggleBtn: { x: px + panelW / 2 - 60, y: soundToggleY, w: 120, h: 28 },
      resetBtn: { x: px + panelW / 2 - 50, y: py + 230, w: 100, h: 32 },
      closeBtn: { x: px + panelW / 2 - 50, y: py + panelH - 40, w: 100, h: 30 },
    };
  },

  _updateSettings(dt) {
    this._settingsClickCd -= dt;
    const input = this.input;
    const L = this._getSettingsLayout();
    const mx = input.mouseX;
    const my = input.mouseY;

    // Escape / 触屏返回 关闭
    if (input.pressed('Escape') || input.touchBack) {
      this.settingsOpen = false;
      return;
    }

    if (!input.mouseLeftDown) return;
    if (this._settingsClickCd > 0) return;

    // 缩放滑块拖拽
    if (mx >= L.sliderX && mx <= L.sliderX + L.sliderW &&
        my >= L.zoomSliderY - 5 && my <= L.zoomSliderY + L.sliderH + 5) {
      const t = (mx - L.sliderX) / L.sliderW;
      this.camera.zoomExtra = this.camera.zoomMin + t * (this.camera.zoomMax - this.camera.zoomMin);
      return;
    }

    // 音量滑块拖拽
    if (this.audio && mx >= L.sliderX && mx <= L.sliderX + L.sliderW &&
        my >= L.volumeSliderY - 5 && my <= L.volumeSliderY + L.sliderH + 5) {
      const t = (mx - L.sliderX) / L.sliderW;
      this.audio.volume = t;
      return;
    }

    // 音效开关
    const sb = L.soundToggleBtn;
    if (this.audio && mx >= sb.x && mx <= sb.x + sb.w && my >= sb.y && my <= sb.y + sb.h) {
      this.audio.enabled = !this.audio.enabled;
      this._settingsClickCd = 0.2;
      return;
    }

    // 恢复默认
    const rb = L.resetBtn;
    if (mx >= rb.x && mx <= rb.x + rb.w && my >= rb.y && my <= rb.y + rb.h) {
      this.camera.zoomExtra = this.camera.zoomExtraDefault;
      if (this.audio) { this.audio.volume = 0.5; this.audio.enabled = true; }
      this._settingsClickCd = 0.2;
      return;
    }

    // 关闭按钮
    const cb = L.closeBtn;
    if (mx >= cb.x && mx <= cb.x + cb.w && my >= cb.y && my <= cb.y + cb.h) {
      this.settingsOpen = false;
      this._settingsClickCd = 0.3;
      return;
    }

    // 点击面板外关闭
    if (mx < L.px || mx > L.px + L.panelW || my < L.py || my > L.py + L.panelH) {
      this.settingsOpen = false;
      this._settingsClickCd = 0.3;
    }
  },

  _drawSettings() {
    const ctx = this.canvas.getContext('2d');
    const lw = this.canvas._logicW || this.canvas.width;
    const lh = this.canvas._logicH || this.canvas.height;
    const L = this._getSettingsLayout();
    const mx = this.input.mouseX;
    const my = this.input.mouseY;

    // 暗化背景
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, lw, lh);

    // 面板
    ctx.fillStyle = 'rgba(20,22,40,0.95)';
    ctx.fillRect(L.px, L.py, L.panelW, L.panelH);
    ctx.strokeStyle = 'rgba(100,150,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(L.px, L.py, L.panelW, L.panelH);

    // 标题
    ctx.fillStyle = '#e8e0d0';
    ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚙ 设置', L.px + L.panelW / 2, L.py + 30);

    // 缩放标签
    ctx.fillStyle = '#aaa';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    const zoomPct = Math.round(this.camera.zoomExtra * 100);
    ctx.fillText(`视角缩放: ${zoomPct}%`, L.px + L.panelW / 2, L.zoomSliderY - 8);

    // 缩放滑块
    const sliderBg = L.sliderX;
    ctx.fillStyle = '#333';
    ctx.fillRect(sliderBg, L.zoomSliderY, L.sliderW, L.sliderH);
    const t = (this.camera.zoomExtra - this.camera.zoomMin) / (this.camera.zoomMax - this.camera.zoomMin);
    ctx.fillStyle = '#4499ff';
    ctx.fillRect(sliderBg, L.zoomSliderY, L.sliderW * t, L.sliderH);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.strokeRect(sliderBg, L.zoomSliderY, L.sliderW, L.sliderH);
    // 滑块把手
    const handleX = sliderBg + L.sliderW * t;
    ctx.fillStyle = '#fff';
    ctx.fillRect(handleX - 3, L.zoomSliderY - 2, 6, L.sliderH + 4);

    // ===== 音量滑块 =====
    if (this.audio) {
      const volPct = Math.round(this.audio.volume * 100);
      ctx.fillStyle = '#aaa';
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.fillText(`音效音量: ${volPct}%`, L.px + L.panelW / 2, L.volumeSliderY - 8);
      ctx.fillStyle = '#333';
      ctx.fillRect(L.sliderX, L.volumeSliderY, L.sliderW, L.sliderH);
      const vt = this.audio.volume;
      ctx.fillStyle = this.audio.enabled ? '#44cc88' : '#666';
      ctx.fillRect(L.sliderX, L.volumeSliderY, L.sliderW * vt, L.sliderH);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.strokeRect(L.sliderX, L.volumeSliderY, L.sliderW, L.sliderH);
      const vHandleX = L.sliderX + L.sliderW * vt;
      ctx.fillStyle = '#fff';
      ctx.fillRect(vHandleX - 3, L.volumeSliderY - 2, 6, L.sliderH + 4);

      // 音效开关
      const sb = L.soundToggleBtn;
      const sbHover = mx >= sb.x && mx <= sb.x + sb.w && my >= sb.y && my <= sb.y + sb.h;
      ctx.fillStyle = sbHover ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(sb.x, sb.y, sb.w, sb.h);
      ctx.strokeStyle = this.audio.enabled ? '#44cc88' : '#ff5555';
      ctx.strokeRect(sb.x, sb.y, sb.w, sb.h);
      ctx.fillStyle = sbHover ? '#fff' : '#aaa';
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.fillText(this.audio.enabled ? '🔊 音效开启' : '🔇 音效关闭', sb.x + sb.w / 2, sb.y + sb.h / 2 + 5);
    }

    // 恢复默认按钮
    const rb = L.resetBtn;
    const rbHover = mx >= rb.x && mx <= rb.x + rb.w && my >= rb.y && my <= rb.y + rb.h;
    ctx.fillStyle = rbHover ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(rb.x, rb.y, rb.w, rb.h);
    ctx.strokeStyle = rbHover ? '#ffcc33' : 'rgba(255,255,255,0.2)';
    ctx.strokeRect(rb.x, rb.y, rb.w, rb.h);
    ctx.fillStyle = rbHover ? '#fff' : '#aaa';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText('恢复默认', rb.x + rb.w / 2, rb.y + rb.h / 2 + 5);

    // 关闭按钮
    const cb = L.closeBtn;
    const cbHover = mx >= cb.x && mx <= cb.x + cb.w && my >= cb.y && my <= cb.y + cb.h;
    ctx.fillStyle = cbHover ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(cb.x, cb.y, cb.w, cb.h);
    ctx.strokeStyle = cbHover ? '#4499ff' : 'rgba(255,255,255,0.2)';
    ctx.strokeRect(cb.x, cb.y, cb.w, cb.h);
    ctx.fillStyle = cbHover ? '#fff' : '#aaa';
    ctx.fillText('关闭', cb.x + cb.w / 2, cb.y + cb.h / 2 + 5);
  },
};
