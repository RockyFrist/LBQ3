// ===================== 江湖行模式逻辑 =====================
// 从 game.js 提取的江湖行模块
// 使用方式: Object.assign(Game.prototype, jianghuModeMethods)

import * as C from '../core/constants.js';
import { JIANGHU_STAGES, JIANGHU_MAX_LIVES, JIANGHU_HEAL_RATIO } from './jianghu-stages.js';

export const jianghuModeMethods = {
  _updateJianghu(dt) {
    const input = this.input;

    if (this.jianghuPhase === 'story') {
      this.jianghuStoryTimer += dt;
      // 点击或空格跳过剧情
      if (this.jianghuStoryTimer > 0.5 &&
          (input.pressed('Space') || input.mouseLeftDown)) {
        this._startJianghuFight();
      }
      return;
    }

    if (this.jianghuPhase === 'fight') {
      this._tick(dt);
      // 检测胜负
      const pf = this.player.fighter;
      const enemyAlive = this.enemies.some(e => e.fighter.alive);
      if (!pf.alive) {
        // 玩家被击败
        this.jianghuLives--;
        if (this.jianghuLives <= 0) {
          this.jianghuPhase = 'defeat';
        } else {
          // 还有剩余生命，重试当前关
          this.jianghuPhase = 'story';
          this.jianghuStoryTimer = 0;
          this.ui.addLog(`剩余生命: ${this.jianghuLives}`);
        }
        this.jianghuFadeTimer = 0;
      } else if (!enemyAlive && this._victoryTimer < 0) {
        this._victoryTimer = 0;
        // 短暂胜利展示后推进
        this.jianghuFadeTimer = 0;
        this.jianghuPhase = 'victory';
        this.ui.addLog(`${JIANGHU_STAGES[this.jianghuStage].enemy.name} 被击败!`);
      }
      return;
    }

    if (this.jianghuPhase === 'victory') {
      this.jianghuFadeTimer += dt;
      if (this.jianghuFadeTimer > 1.0 &&
          (input.pressed('Space') || input.mouseLeftDown)) {
        this.jianghuStage++;
        if (this.jianghuStage >= JIANGHU_STAGES.length) {
          this.jianghuPhase = 'complete';
          this.jianghuFadeTimer = 0;
        } else {
          // 回复部分HP进入下一关
          const pf = this.player.fighter;
          const heal = Math.round(pf.maxHp * JIANGHU_HEAL_RATIO);
          pf.hp = Math.min(pf.maxHp, pf.hp + heal);
          this.jianghuPhase = 'story';
          this.jianghuStoryTimer = 0;
        }
      }
      return;
    }

    if (this.jianghuPhase === 'defeat' || this.jianghuPhase === 'complete') {
      this.jianghuFadeTimer += dt;
      if (this.jianghuFadeTimer > 1.0 &&
          (input.pressed('Space') || input.mouseLeftDown || input.pressed('Escape') || input.touchBack)) {
        if (this.onExit) this.onExit();
      }
      return;
    }
  },

  _startJianghuFight() {
    this.jianghuPhase = 'fight';
    this._victoryTimer = -1;

    // 重置玩家位置（保留HP）
    const pf = this.player.fighter;
    const prevHp = pf.hp;
    const prevMaxHp = pf.maxHp;
    pf.x = C.ARENA_W / 2;
    pf.y = C.ARENA_H / 2;
    pf.vx = 0;
    pf.vy = 0;
    pf.facing = 0;
    pf.state = 'idle';
    pf.stateTimer = 0;
    pf.phase = 'none';
    pf.stamina = C.STAMINA_MAX;
    pf.isExhausted = false;
    pf.speedMult = 1;
    pf.blockSuppressed = false;
    pf.parryActionDelay = 0;
    pf.knockbackTimer = 0;
    pf.inputBuffer = null;
    pf.alive = true;
    // 首关或重试时回满HP
    if (this.jianghuStage === 0 || prevHp <= 0) {
      pf.hp = prevMaxHp;
    } else {
      pf.hp = prevHp;
    }

    this.enemies = [];
    this.particles.particles = [];
    this._rebuildFighterList();
    this._spawnJianghuEnemy();
    this.gameTime = 0;
    this.floatingTexts = [];
  },

  _drawJianghuOverlay() {
    const ctx = this.canvas.getContext('2d');
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const stage = JIANGHU_STAGES[this.jianghuStage];

    if (this.jianghuPhase === 'story' && stage) {
      // 全屏暗幕 + 剧情文字
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(0, 0, cw, ch);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffcc44';
      ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
      ctx.fillText(`第${stage.id}关 · ${stage.name}`, cw / 2, ch * 0.28);

      ctx.fillStyle = '#ccc';
      ctx.font = '16px "Microsoft YaHei", sans-serif';
      // 自动换行
      this._drawWrappedText(ctx, stage.story, cw / 2, ch * 0.42, cw * 0.7, 26);

      // 敌人信息
      ctx.fillStyle = stage.enemy.color;
      ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
      ctx.fillText(`对手: ${stage.enemy.name}`, cw / 2, ch * 0.62);

      const scaleText = stage.enemy.scale !== 1 ? ` · 体型×${stage.enemy.scale}` : '';
      const hpText = stage.enemy.hpMult !== 1 ? ` · 血量×${stage.enemy.hpMult}` : '';
      ctx.fillStyle = '#888';
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.fillText(`难度 ${stage.enemy.difficulty}${scaleText}${hpText}`, cw / 2, ch * 0.67);

      // 生命
      ctx.fillStyle = '#ff4444';
      ctx.font = '16px "Microsoft YaHei", sans-serif';
      ctx.fillText('❤'.repeat(this.jianghuLives) + '♡'.repeat(JIANGHU_MAX_LIVES - this.jianghuLives), cw / 2, ch * 0.75);

      // 提示
      const alpha = 0.4 + 0.3 * Math.sin(this.jianghuStoryTimer * 3);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.font = '14px "Microsoft YaHei", sans-serif';
      ctx.fillText('点击或按空格开始战斗', cw / 2, ch * 0.88);
    }

    if (this.jianghuPhase === 'victory' && stage) {
      const alpha = Math.min(1, this.jianghuFadeTimer / 0.5);
      ctx.fillStyle = `rgba(0,0,0,${0.6 * alpha})`;
      ctx.fillRect(0, 0, cw, ch);

      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,204,68,${alpha})`;
      ctx.font = 'bold 32px "Microsoft YaHei", sans-serif';
      ctx.fillText('胜!', cw / 2, ch * 0.35);

      ctx.fillStyle = `rgba(200,200,200,${alpha})`;
      ctx.font = '16px "Microsoft YaHei", sans-serif';
      ctx.fillText(`${stage.enemy.name} 已被击败`, cw / 2, ch * 0.45);

      if (this.jianghuStage < JIANGHU_STAGES.length - 1) {
        ctx.fillStyle = `rgba(136,255,136,${alpha})`;
        ctx.font = '14px "Microsoft YaHei", sans-serif';
        ctx.fillText(`回复 ${Math.round(JIANGHU_HEAL_RATIO * 100)}% HP · 进入下一关`, cw / 2, ch * 0.55);
      }

      if (this.jianghuFadeTimer > 1.0) {
        const pa = 0.4 + 0.3 * Math.sin(this.jianghuFadeTimer * 3);
        ctx.fillStyle = `rgba(255,255,255,${pa})`;
        ctx.font = '14px "Microsoft YaHei", sans-serif';
        ctx.fillText('点击或按空格继续', cw / 2, ch * 0.70);
      }
    }

    if (this.jianghuPhase === 'defeat') {
      const alpha = Math.min(1, this.jianghuFadeTimer / 0.5);
      ctx.fillStyle = `rgba(0,0,0,${0.8 * alpha})`;
      ctx.fillRect(0, 0, cw, ch);

      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,68,68,${alpha})`;
      ctx.font = 'bold 32px "Microsoft YaHei", sans-serif';
      ctx.fillText('江湖路断', cw / 2, ch * 0.35);

      ctx.fillStyle = `rgba(200,200,200,${alpha})`;
      ctx.font = '16px "Microsoft YaHei", sans-serif';
      ctx.fillText(`止步第${this.jianghuStage + 1}关 · ${stage ? stage.name : ''}`, cw / 2, ch * 0.45);

      if (this.jianghuFadeTimer > 1.0) {
        const pa = 0.4 + 0.3 * Math.sin(this.jianghuFadeTimer * 3);
        ctx.fillStyle = `rgba(255,255,255,${pa})`;
        ctx.font = '14px "Microsoft YaHei", sans-serif';
        ctx.fillText('点击或按ESC返回菜单', cw / 2, ch * 0.60);
      }
    }

    if (this.jianghuPhase === 'complete') {
      const alpha = Math.min(1, this.jianghuFadeTimer / 0.5);
      ctx.fillStyle = `rgba(0,0,0,${0.85 * alpha})`;
      ctx.fillRect(0, 0, cw, ch);

      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,215,0,${alpha})`;
      ctx.font = 'bold 36px "Microsoft YaHei", sans-serif';
      ctx.fillText('🏆 江湖行 · 通关!', cw / 2, ch * 0.30);

      ctx.fillStyle = `rgba(255,204,100,${alpha})`;
      ctx.font = '18px "Microsoft YaHei", sans-serif';
      ctx.fillText('你历经十关磨难，终成一代宗师。', cw / 2, ch * 0.42);
      ctx.fillText(`剩余生命: ${'❤'.repeat(this.jianghuLives)}`, cw / 2, ch * 0.52);

      if (this.jianghuFadeTimer > 1.0) {
        const pa = 0.4 + 0.3 * Math.sin(this.jianghuFadeTimer * 3);
        ctx.fillStyle = `rgba(255,255,255,${pa})`;
        ctx.font = '14px "Microsoft YaHei", sans-serif';
        ctx.fillText('点击或按ESC返回菜单', cw / 2, ch * 0.68);
      }
    }
  },

  /** 自动换行绘制文字 */
  _drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    const chars = text.split('');
    let line = '';
    let curY = y;
    for (const ch of chars) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line.length > 0) {
        ctx.fillText(line, x, curY);
        line = ch;
        curY += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, curY);
  },
};
