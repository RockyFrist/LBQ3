// ===================== 测试模式 =====================
// 从 game.js 提取的自动测试模块
// 使用方式: Object.assign(Game.prototype, testModeMethods)

import * as C from '../core/constants.js';
import { Player } from '../combat/player.js';
import { Enemy } from '../ai/enemy.js';

export const testModeMethods = {
  _startTestRound() {
    this.testRound++;
    this.reset();
    this.testRoundStats = {
      duration: 0,
      hitsA: { light: 0, heavy: 0 }, hitsB: { light: 0, heavy: 0 },
      damageA: 0, damageB: 0,
      parryA: { precise: 0, semi: 0, nonPrecise: 0 },
      parryB: { precise: 0, semi: 0, nonPrecise: 0 },
      clashLight: 0, clashHeavy: 0,
      blockBreakA: 0, blockBreakB: 0,
      executionA: 0, executionB: 0,
      feintA: 0, feintB: 0,
    };
  },

  _recordTestEvent(evt) {
    const s = this.testRoundStats;
    const pf = this.player.fighter;
    s.duration = this.gameTime;

    switch (evt.type) {
      case 'hit': {
        const isA = evt.attacker === pf;
        const side = isA ? s.hitsA : s.hitsB;
        if (evt.atkType === 'heavy') side.heavy++;
        else side.light++;
        if (isA) s.damageA += evt.damage;
        else s.damageB += evt.damage;
        break;
      }
      case 'parry': {
        const isA = evt.target === pf;
        const side = isA ? s.parryA : s.parryB;
        side[evt.level]++;
        break;
      }
      case 'lightClash': s.clashLight++; break;
      case 'heavyClash': s.clashHeavy++; break;
      case 'blockBreak': {
        if (evt.target === pf) s.blockBreakA++;
        else s.blockBreakB++;
        break;
      }
      case 'execution': {
        if (evt.attacker === pf) s.executionA++;
        else s.executionB++;
        break;
      }
    }
  },

  _endTestRound(winner) {
    if (this.testRoundStats) {
      this.testRoundStats.winner = winner;
      this.testRoundStats.hpA = Math.max(0, this.player.fighter.hp);
      this.testRoundStats.hpB = this.enemies[0] ? Math.max(0, this.enemies[0].fighter.hp) : 0;
      this.testStats.push(this.testRoundStats);
    }
    if (this.testRound >= this.testRounds) {
      this.testDone = true;
      return;
    }
    this.gameTime = 0;
    this._startTestRound();
  },

  _runAllTestsSync() {
    const SIM_DT = 1 / 60;
    const MAX_TICKS = 60 * 60;

    for (let round = 0; round < this.testRounds; round++) {
      this.testRound = round + 1;
      this.gameTime = 0;

      this.player = new Player(C.ARENA_W / 2, C.ARENA_H / 2);
      const diffA = this.testDiffA;
      this.playerAI = new Enemy(C.ARENA_W / 2, C.ARENA_H / 2, diffA);
      this.playerAI.fighter = this.player.fighter;
      this.playerAI.fighter.name = `AI-${diffA}(蓝)`;
      this.playerAI.fighter.color = '#4499ff';
      this.difficulty = this.testDiffB;
      this.enemies = [];

      const ex = C.ARENA_W / 2 + 150;
      const ey = C.ARENA_H / 2;
      const enemy = new Enemy(ex, ey, this.testDiffB);
      enemy.fighter.name = `AI-${this.testDiffB}(红)`;
      this.enemies = [enemy];
      this.allFighters = [this.player.fighter, enemy.fighter];

      this.testRoundStats = {
        duration: 0,
        hitsA: { light: 0, heavy: 0 }, hitsB: { light: 0, heavy: 0 },
        damageA: 0, damageB: 0,
        parryA: { precise: 0, semi: 0, nonPrecise: 0 },
        parryB: { precise: 0, semi: 0, nonPrecise: 0 },
        clashLight: 0, clashHeavy: 0,
        blockBreakA: 0, blockBreakB: 0,
        executionA: 0, executionB: 0,
        feintA: 0, feintB: 0,
      };

      let done = false;
      for (let t = 0; t < MAX_TICKS && !done; t++) {
        this.gameTime += SIM_DT;
        let dt = SIM_DT;

        if (this.hitFreezeTimer > 0) {
          this.hitFreezeTimer -= dt;
          continue;
        }

        if (this.timeScaleTimer > 0) {
          this.timeScaleTimer -= dt;
          dt *= this.timeScale;
          if (this.timeScaleTimer <= 0) this.timeScale = 1;
        }

        const pf = this.player.fighter;
        const ef = enemy.fighter;
        let pCmd;
        if (pf.alive) {
          const target = ef.alive ? ef : null;
          if (target) {
            pCmd = this.playerAI.getCommands(dt, target);
          } else {
            pCmd = { moveX: 0, moveY: 0, faceAngle: 0, lightAttack: false, heavyAttack: false, blockHeld: false, dodge: false, dodgeAngle: 0 };
          }
        } else {
          pCmd = { moveX: 0, moveY: 0, faceAngle: 0, lightAttack: false, heavyAttack: false, blockHeld: false, dodge: false, dodgeAngle: 0 };
        }

        if (pf.perfectDodged && pf.perfectDodged !== 'refunded' && pf.state === 'idle') pf.perfectDodged = false;
        if (pf.perfectDodged === 'refunded' && pf.state === 'idle') pf.perfectDodged = false;

        pf.update(dt, pCmd, this.gameTime);

        if (ef.alive) {
          const eCmd = enemy.getCommands(dt, pf);
          ef.update(dt, eCmd, this.gameTime);
        }

        this._separateFighters();
        this.combat.resolve(this.allFighters, this.gameTime, dt);

        for (const evt of this.combat.events) {
          this._recordTestEvent(evt);
        }

        const aAlive = pf.alive;
        const bAlive = ef.alive;
        const timeout = this.gameTime > 60;
        if (!aAlive || !bAlive || timeout) {
          const winner = timeout ? 'draw' : (aAlive ? 'A' : bAlive ? 'B' : 'draw');
          this.testRoundStats.winner = winner;
          this.testRoundStats.duration = this.gameTime;
          this.testRoundStats.hpA = Math.max(0, pf.hp);
          this.testRoundStats.hpB = Math.max(0, ef.hp);
          this.testStats.push(this.testRoundStats);
          done = true;
        }
      }
    }

    this.testDone = true;
  },

  _drawTestResults() {
    const ctx = this.canvas.getContext('2d');
    const cw = this.canvas._logicW || this.canvas.width;
    const ch = this.canvas._logicH || this.canvas.height;
    const stats = this.testStats;
    if (!stats.length) return;

    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(0, 0, cw, ch);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcc33';
    ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
    ctx.fillText(`📊 自动测试结果`, cw / 2, 38);
    ctx.fillStyle = '#888';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillText(`AI-${this.testDiffA} vs AI-${this.testDiffB} · ${stats.length}轮`, cw / 2, 60);

    const winsA = stats.filter(s => s.winner === 'A').length;
    const winsB = stats.filter(s => s.winner === 'B').length;
    const draws = stats.filter(s => s.winner === 'draw').length;
    const avgDur = stats.reduce((a, s) => a + s.duration, 0) / stats.length;

    const totalHitsALight = stats.reduce((a, s) => a + s.hitsA.light, 0);
    const totalHitsAHeavy = stats.reduce((a, s) => a + s.hitsA.heavy, 0);
    const totalHitsBLight = stats.reduce((a, s) => a + s.hitsB.light, 0);
    const totalHitsBHeavy = stats.reduce((a, s) => a + s.hitsB.heavy, 0);
    const totalDmgA = stats.reduce((a, s) => a + s.damageA, 0);
    const totalDmgB = stats.reduce((a, s) => a + s.damageB, 0);
    const totalParryA = stats.reduce((a, s) => a + s.parryA.precise + s.parryA.semi + s.parryA.nonPrecise, 0);
    const totalParryB = stats.reduce((a, s) => a + s.parryB.precise + s.parryB.semi + s.parryB.nonPrecise, 0);
    const preciseA = stats.reduce((a, s) => a + s.parryA.precise, 0);
    const preciseB = stats.reduce((a, s) => a + s.parryB.precise, 0);
    const totalClashL = stats.reduce((a, s) => a + s.clashLight, 0);
    const totalClashH = stats.reduce((a, s) => a + s.clashHeavy, 0);
    const totalExeA = stats.reduce((a, s) => a + s.executionA, 0);
    const totalExeB = stats.reduce((a, s) => a + s.executionB, 0);
    const totalBrkA = stats.reduce((a, s) => a + s.blockBreakA, 0);
    const totalBrkB = stats.reduce((a, s) => a + s.blockBreakB, 0);
    const avgHpA = stats.filter(s => s.winner === 'A').reduce((a, s) => a + s.hpA, 0) / (winsA || 1);
    const avgHpB = stats.filter(s => s.winner === 'B').reduce((a, s) => a + s.hpB, 0) / (winsB || 1);

    const barY = 82;
    const barW = cw * 0.6;
    const barH = 28;
    const barX = (cw - barW) / 2;
    const ratioA = winsA / stats.length;

    ctx.fillStyle = '#335588';
    ctx.fillRect(barX, barY, barW * ratioA, barH);
    ctx.fillStyle = '#883333';
    ctx.fillRect(barX + barW * ratioA, barY, barW * (1 - ratioA), barH);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`蓝方 ${winsA}胜 (${(ratioA * 100).toFixed(0)}%)`, barX, barY - 4);
    ctx.textAlign = 'right';
    ctx.fillText(`红方 ${winsB}胜 (${((1 - ratioA - draws / stats.length) * 100).toFixed(0)}%)`, barX + barW, barY - 4);
    if (draws) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#888';
      ctx.fillText(`平 ${draws}`, cw / 2, barY + 19);
    }

    const rows = [
      ['指标', `蓝方 AI-${this.testDiffA}`, `红方 AI-${this.testDiffB}`, '合计/平均'],
      ['平均时长', '', '', `${avgDur.toFixed(1)}秒`],
      ['胜利', `${winsA}`, `${winsB}`, `${draws}平`],
      ['胜方残血', `${avgHpA.toFixed(0)}HP`, `${avgHpB.toFixed(0)}HP`, ''],
      ['轻击命中', `${totalHitsALight}`, `${totalHitsBLight}`, `${totalHitsALight + totalHitsBLight}`],
      ['重击命中', `${totalHitsAHeavy}`, `${totalHitsBHeavy}`, `${totalHitsAHeavy + totalHitsBHeavy}`],
      ['总伤害', `${totalDmgA}`, `${totalDmgB}`, `${totalDmgA + totalDmgB}`],
      ['格挡次数', `${totalParryA}`, `${totalParryB}`, `${totalParryA + totalParryB}`],
      ['精准格挡', `${preciseA}`, `${preciseB}`, `${preciseA + preciseB}`],
      ['拼刀(轻)', '', '', `${totalClashL}`],
      ['弹刀(重)', '', '', `${totalClashH}`],
      ['破防', `${totalBrkA}次被破`, `${totalBrkB}次被破`, ''],
      ['处决', `${totalExeA}次`, `${totalExeB}次`, ''],
    ];

    const tableY = barY + barH + 35;
    const colW = [cw * 0.18, cw * 0.22, cw * 0.22, cw * 0.18];
    const startX = (cw - colW.reduce((a, b) => a + b, 0)) / 2;
    const rowH = 24;

    for (let r = 0; r < rows.length; r++) {
      const y = tableY + r * rowH;
      const isHeader = r === 0;
      ctx.font = isHeader ? 'bold 13px "Microsoft YaHei", sans-serif' : '13px "Microsoft YaHei", sans-serif';

      if (r > 0 && r % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(startX, y - 14, colW.reduce((a, b) => a + b, 0), rowH);
      }

      let cx = startX;
      for (let c = 0; c < 4; c++) {
        ctx.textAlign = c === 0 ? 'left' : 'center';
        if (isHeader) {
          ctx.fillStyle = '#ffcc33';
        } else if (c === 1) {
          ctx.fillStyle = '#6699cc';
        } else if (c === 2) {
          ctx.fillStyle = '#cc6666';
        } else {
          ctx.fillStyle = '#aaa';
        }
        const tx = c === 0 ? cx + 4 : cx + colW[c] / 2;
        ctx.fillText(rows[r][c], tx, y);
        cx += colW[c];
      }
    }

    ctx.fillStyle = '#666';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('点击或按 ESC / Space 返回菜单', cw / 2, ch - 20);
  },
};
