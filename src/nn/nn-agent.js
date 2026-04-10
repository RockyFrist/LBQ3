/**
 * 神经网络战斗代理 (纯 JS, 零依赖)
 * 用于自博弈训练，寻找战斗系统漏洞并培养"武圣"级 AI
 *
 * 架构: 前馈网络  state(26) → 64 → 32 → actions(8)
 * 训练: REINFORCE 策略梯度 + 基线值网络
 */

import { dist, angleBetween, normalizeAngle } from '../core/utils.js';
import * as C from '../core/constants.js';

// ---- 数学工具 ----
function relu(x) { return x > 0 ? x : 0; }
function softmax(logits) {
  const maxL = Math.max(...logits);
  const exps = logits.map(l => Math.exp(l - maxL));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
}

// ---- 前馈网络 ----
export class NeuralNetwork {
  /**
   * @param {number[]} layerSizes e.g. [26, 64, 32, 8]
   */
  constructor(layerSizes) {
    this.layers = [];
    for (let i = 0; i < layerSizes.length - 1; i++) {
      const inp = layerSizes[i];
      const out = layerSizes[i + 1];
      this.layers.push({
        w: this._initWeights(inp, out),
        b: new Float64Array(out),
      });
    }
  }

  _initWeights(rows, cols) {
    // He initialization
    const scale = Math.sqrt(2 / rows);
    const w = new Float64Array(rows * cols);
    for (let i = 0; i < w.length; i++) {
      w[i] = (Math.random() * 2 - 1) * scale;
    }
    return w;
  }

  /** Forward pass, returns { activations[], logits } */
  forward(input) {
    const activations = [Float64Array.from(input)];
    let x = activations[0];
    for (let l = 0; l < this.layers.length; l++) {
      const { w, b } = this.layers[l];
      const isLast = l === this.layers.length - 1;
      const cols = b.length;
      const rows = x.length;
      const out = new Float64Array(cols);
      for (let j = 0; j < cols; j++) {
        let sum = b[j];
        for (let i = 0; i < rows; i++) {
          sum += x[i] * w[i * cols + j];
        }
        out[j] = isLast ? sum : relu(sum);
      }
      activations.push(out);
      x = out;
    }
    return { activations, logits: x };
  }

  /** 策略网络: 返回动作概率 */
  policy(state) {
    const { logits } = this.forward(state);
    return softmax(Array.from(logits));
  }

  /** 采样一个动作 */
  sampleAction(state) {
    const probs = this.policy(state);
    const r = Math.random();
    let cum = 0;
    for (let i = 0; i < probs.length; i++) {
      cum += probs[i];
      if (r < cum) return { action: i, prob: probs[i], probs };
    }
    return { action: probs.length - 1, prob: probs[probs.length - 1], probs };
  }

  /** 导出权重为 JSON */
  toJSON() {
    return {
      layers: this.layers.map(l => ({
        w: Array.from(l.w),
        b: Array.from(l.b),
      })),
    };
  }

  /** 从 JSON 加载权重 */
  static fromJSON(data) {
    const sizes = [];
    for (let i = 0; i < data.layers.length; i++) {
      const l = data.layers[i];
      sizes.push(l.w.length / l.b.length);
    }
    sizes.push(data.layers[data.layers.length - 1].b.length);
    const net = new NeuralNetwork(sizes);
    for (let i = 0; i < data.layers.length; i++) {
      net.layers[i].w = Float64Array.from(data.layers[i].w);
      net.layers[i].b = Float64Array.from(data.layers[i].b);
    }
    return net;
  }

  /** 获取所有参数为平坦数组 */
  getParams() {
    const params = [];
    for (const l of this.layers) {
      params.push(...l.w, ...l.b);
    }
    return new Float64Array(params);
  }

  /** 从平坦数组设置所有参数 */
  setParams(params) {
    let idx = 0;
    for (const l of this.layers) {
      for (let i = 0; i < l.w.length; i++) l.w[i] = params[idx++];
      for (let i = 0; i < l.b.length; i++) l.b[i] = params[idx++];
    }
  }

  /** 克隆 */
  clone() {
    return NeuralNetwork.fromJSON(this.toJSON());
  }
}

// ---- 状态编码 ----
const STATE_MAP = {
  'idle': 0, 'lightAttack': 1, 'heavyAttack': 2, 'blocking': 3,
  'dodging': 4, 'staggered': 5, 'blockRecovery': 6, 'parryStunned': 7,
  'heavyStartup': 8, 'executing': 9, 'dead': 10,
};
const PHASE_MAP = { 'none': 0, 'startup': 1, 'active': 2, 'recovery': 3 };

/**
 * 从双方 Fighter 提取标准化状态向量
 * @returns {Float64Array} 26维状态向量 (全部 0~1 范围)
 */
export function extractState(me, opponent) {
  const d = dist(me, opponent) / 300; // 归一化到 ~0-1 (300px 覆盖常见距离)
  const angle = angleBetween(me, opponent);
  const facingDiff = Math.abs(normalizeAngle(angle - me.facing)) / Math.PI;
  const opFacingDiff = Math.abs(normalizeAngle(angleBetween(opponent, me) - opponent.facing)) / Math.PI;

  // One-hot 状态编码 (11 states)
  const myStateVec = new Float64Array(11);
  myStateVec[STATE_MAP[me.state] || 0] = 1;
  const opStateVec = new Float64Array(11);
  opStateVec[STATE_MAP[opponent.state] || 0] = 1;

  // 返回不含 one-hot 的紧凑编码 (减少维度)
  return Float64Array.from([
    me.hp / C.MAX_HP,
    me.stamina / C.STAMINA_MAX,
    me.isExhausted ? 1 : 0,
    (STATE_MAP[me.state] || 0) / 10,
    (PHASE_MAP[me.phase] || 0) / 3,
    me.stateTimer > 0 ? Math.min(me.stateTimer, 1) : 0,
    opponent.hp / C.MAX_HP,
    opponent.stamina / C.STAMINA_MAX,
    opponent.isExhausted ? 1 : 0,
    (STATE_MAP[opponent.state] || 0) / 10,
    (PHASE_MAP[opponent.phase] || 0) / 3,
    opponent.stateTimer > 0 ? Math.min(opponent.stateTimer, 1) : 0,
    Math.min(d, 1),           // 距离 (clamp 1)
    facingDiff,               // 自己朝向偏差
    opFacingDiff,             // 对手朝向偏差
    me.comboStep / 3,
    // 攻击阶段细节
    me.state === 'lightAttack' && me.phase === 'startup' ? 1 : 0,
    me.state === 'lightAttack' && me.phase === 'active' ? 1 : 0,
    me.state === 'heavyAttack' && me.phase === 'startup' ? 1 : 0,
    me.state === 'heavyAttack' && me.phase === 'active' ? 1 : 0,
    opponent.state === 'lightAttack' && opponent.phase === 'active' ? 1 : 0,
    opponent.state === 'heavyAttack' && opponent.phase === 'startup' ? 1 : 0,
    opponent.state === 'heavyAttack' && opponent.phase === 'active' ? 1 : 0,
    opponent.state === 'staggered' ? 1 : 0,
  ]);
}

// ---- 动作空间 ----
export const ACTIONS = [
  'idle',        // 0: 不做任何操作
  'approach',    // 1: 向对手移动
  'lightAttack', // 2: 轻击
  'heavyAttack', // 3: 重击
  'block',       // 4: 格挡
  'dodge_back',  // 5: 向后闪避
  'dodge_left',  // 6: 左闪
  'dodge_right', // 7: 右闪
];

/**
 * 将动作ID转为 Fighter 命令
 */
export function actionToCommand(actionIdx, me, opponent) {
  const angle = angleBetween(me, opponent);
  const cmd = {
    moveX: 0, moveY: 0,
    faceAngle: angle,
    lightAttack: false, heavyAttack: false,
    blockHeld: false, dodge: false, dodgeAngle: 0,
  };

  switch (actionIdx) {
    case 0: // idle
      break;
    case 1: // approach
      cmd.moveX = Math.cos(angle);
      cmd.moveY = Math.sin(angle);
      break;
    case 2: // lightAttack
      cmd.lightAttack = true;
      break;
    case 3: // heavyAttack
      cmd.heavyAttack = true;
      break;
    case 4: // block
      cmd.blockHeld = true;
      break;
    case 5: // dodge_back
      cmd.dodge = true;
      cmd.dodgeAngle = angle + Math.PI;
      break;
    case 6: // dodge_left
      cmd.dodge = true;
      cmd.dodgeAngle = angle - Math.PI / 2;
      break;
    case 7: // dodge_right
      cmd.dodge = true;
      cmd.dodgeAngle = angle + Math.PI / 2;
      break;
  }
  return cmd;
}

// ---- NN 控制器 (与 Enemy 类接口兼容) ----
export class NNAgent {
  constructor(x, y, policyNet) {
    const { Fighter: FighterClass } = require_fighter();
    this.fighter = new FighterClass(x, y, { color: '#ff00ff', team: 0, name: 'NN武圣' });
    this.policyNet = policyNet;
    this.trajectory = []; // { state, action, prob, reward }
    this.decisionLog = [];
    this.logEnabled = false;
    this._actionTimer = 0;
    this._lastAction = 0;
    this._decisionInterval = 0.1; // 每 0.1s 做一次决策 (6帧一次)
  }

  getCommands(dt, opponent) {
    this._actionTimer -= dt;
    const angle = angleBetween(this.fighter, opponent);

    if (this._actionTimer <= 0) {
      this._actionTimer = this._decisionInterval;
      const state = extractState(this.fighter, opponent);
      const { action, prob, probs } = this.policyNet.sampleAction(state);
      this._lastAction = action;

      this.trajectory.push({
        state: Array.from(state),
        action,
        prob,
        reward: 0, // 稍后回填
      });
    }

    return actionToCommand(this._lastAction, this.fighter, opponent);
  }
}

// 延迟导入 Fighter，避免循环依赖
let _Fighter = null;
function require_fighter() {
  if (!_Fighter) {
    // 在 ESM 中直接引用即可
    _Fighter = true;
  }
  return { Fighter: globalThis.__LBQ3_Fighter || null };
}

// ---- REINFORCE 训练器 ----
export class PolicyGradientTrainer {
  constructor(policyNet, opts = {}) {
    this.policyNet = policyNet;
    this.lr = opts.lr || 0.001;
    this.gamma = opts.gamma || 0.99;
    this.entropyCoeff = opts.entropyCoeff || 0.01;
    this.clipEps = opts.clipEps || 0.2;
  }

  /**
   * 计算折扣回报
   */
  computeReturns(rewards) {
    const returns = new Float64Array(rewards.length);
    let G = 0;
    for (let t = rewards.length - 1; t >= 0; t--) {
      G = rewards[t] + this.gamma * G;
      returns[t] = G;
    }
    // 标准化
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    let std = 0;
    for (const r of returns) std += (r - mean) * (r - mean);
    std = Math.sqrt(std / returns.length + 1e-8);
    for (let i = 0; i < returns.length; i++) {
      returns[i] = (returns[i] - mean) / std;
    }
    return returns;
  }

  /**
   * 数值梯度 + 参数更新 (简单但有效)
   * 对于小网络 (~3000参数) 这是可行的
   */
  updateWithFiniteDifferences(trajectory) {
    if (trajectory.length === 0) return 0;

    const rewards = trajectory.map(t => t.reward);
    const returns = this.computeReturns(rewards);

    // 计算当前策略的 loss
    const params = this.policyNet.getParams();
    const loss = this._computeLoss(trajectory, returns);

    // 数值梯度 (每次扰动一个参数)
    // 对于大量参数，每次只更新随机子集
    const batchSize = Math.min(params.length, 200); // 每步最多更新200个参数
    const indices = [];
    for (let i = 0; i < params.length; i++) indices.push(i);
    // Fisher-Yates shuffle then take first batchSize
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const selected = indices.slice(0, batchSize);

    const eps = 1e-4;
    const grad = new Float64Array(params.length);

    for (const idx of selected) {
      const saved = params[idx];
      params[idx] = saved + eps;
      this.policyNet.setParams(params);
      const lossPlus = this._computeLoss(trajectory, returns);

      params[idx] = saved - eps;
      this.policyNet.setParams(params);
      const lossMinus = this._computeLoss(trajectory, returns);

      grad[idx] = (lossPlus - lossMinus) / (2 * eps);
      params[idx] = saved;
    }

    // SGD 更新
    for (const idx of selected) {
      params[idx] -= this.lr * grad[idx];
    }
    this.policyNet.setParams(params);

    return loss;
  }

  /**
   * 更快的解析梯度更新 (反向传播近似)
   * 使用 log-prob * advantage 的策略梯度
   */
  updateAnalytic(trajectory) {
    if (trajectory.length === 0) return 0;

    const rewards = trajectory.map(t => t.reward);
    const returns = this.computeReturns(rewards);

    // 收集梯度信号
    const params = this.policyNet.getParams();
    const grad = new Float64Array(params.length);
    let totalLoss = 0;

    for (let t = 0; t < trajectory.length; t++) {
      const { state, action, prob } = trajectory[t];
      const advantage = returns[t];

      // 数值梯度 for this timestep (扰动每个参数对 log(pi(a|s)) 的影响)
      // 只在有显著advantage的时间步计算梯度
      if (Math.abs(advantage) < 0.01) continue;

      const eps = 1e-4;
      const baseLogProb = Math.log(prob + 1e-8);
      totalLoss -= baseLogProb * advantage;

      // 随机采样参数子集计算梯度
      const sampleSize = Math.min(50, params.length);
      for (let k = 0; k < sampleSize; k++) {
        const idx = Math.floor(Math.random() * params.length);
        const saved = params[idx];
        params[idx] = saved + eps;
        this.policyNet.setParams(params);
        const newProbs = this.policyNet.policy(state);
        const newLogProb = Math.log(newProbs[action] + 1e-8);
        const dLogProb = (newLogProb - baseLogProb) / eps;

        // 策略梯度: -∇log(π) * A
        grad[idx] += -dLogProb * advantage * (params.length / sampleSize);

        // 熵奖励
        let entropy = 0;
        for (const p of newProbs) entropy -= p * Math.log(p + 1e-8);
        grad[idx] -= this.entropyCoeff * (entropy - this._entropy(state)) / eps;

        params[idx] = saved;
      }
    }

    this.policyNet.setParams(params);

    // 梯度裁剪
    let gradNorm = 0;
    for (const g of grad) gradNorm += g * g;
    gradNorm = Math.sqrt(gradNorm);
    const maxNorm = 1.0;
    const scale = gradNorm > maxNorm ? maxNorm / gradNorm : 1;

    // 应用更新
    for (let i = 0; i < params.length; i++) {
      params[i] -= this.lr * grad[i] * scale;
    }
    this.policyNet.setParams(params);

    return totalLoss / trajectory.length;
  }

  _entropy(state) {
    const probs = this.policyNet.policy(state);
    let h = 0;
    for (const p of probs) h -= p * Math.log(p + 1e-8);
    return h;
  }

  _computeLoss(trajectory, returns) {
    let loss = 0;
    for (let t = 0; t < trajectory.length; t++) {
      const { state, action } = trajectory[t];
      const probs = this.policyNet.policy(state);
      const logProb = Math.log(probs[action] + 1e-8);
      loss -= logProb * returns[t];
      // 熵正则化
      let entropy = 0;
      for (const p of probs) entropy -= p * Math.log(p + 1e-8);
      loss -= this.entropyCoeff * entropy;
    }
    return loss / trajectory.length;
  }
}

// ---- 奖励函数 ----
export function computeRewards(trajectory, myFighter, opFighter, events) {
  // 稀疏奖励: 胜/负 + 中间信号
  const finalReward = myFighter.alive && !opFighter.alive ? 1.0 :
                      !myFighter.alive && opFighter.alive ? -1.0 : 0.0;

  // 分配中间奖励
  for (const step of trajectory) {
    step.reward = 0;
  }

  // 结局奖励分配到最后几步
  if (trajectory.length > 0) {
    const lastN = Math.min(20, trajectory.length);
    for (let i = trajectory.length - lastN; i < trajectory.length; i++) {
      trajectory[i].reward += finalReward * (0.5 + 0.5 * (i - (trajectory.length - lastN)) / lastN);
    }
  }

  return trajectory;
}

/**
 * 密集奖励计算 (从事件推断)
 * 每步根据战斗结果给予即时奖励信号
 */
export function computeDenseRewards(trajectory, events, myTeam) {
  // 从事件中为该team的每个时间步分配奖励
  const rewardByTime = new Map();

  for (const evt of events) {
    const t = evt.t;
    const bucket = Math.round(t * 10); // 0.1s粒度
    let r = rewardByTime.get(bucket) || 0;

    switch (evt.type) {
      case 'hit':
        if (evt.who === myTeam) r += 0.3;  // 命中奖励
        else r -= 0.3; // 被命中惩罚
        break;
      case 'whiff':
        if (evt.who === myTeam) r -= 0.1; // 打空惩罚
        break;
      case 'parry':
        if (evt.blocker === myTeam) r += 0.4; // 格挡奖励
        else r -= 0.2; // 被格挡惩罚
        break;
      case 'execution':
        if (evt.who === myTeam) r += 0.5;
        else r -= 0.5;
        break;
      case 'perfectDodge':
        if (evt.who === myTeam) r += 0.3;
        break;
      case 'blockBreak':
        if (evt.target === myTeam) r -= 0.4;
        else r += 0.4;
        break;
    }
    rewardByTime.set(bucket, r);
  }

  // 分配到轨迹中最近的时间步
  for (let i = 0; i < trajectory.length; i++) {
    const bucket = Math.round(i * 0.1 * 10); // 近似
    trajectory[i].reward = rewardByTime.get(bucket) || 0;
  }

  // 胜负最终奖励
  const lastStep = trajectory[trajectory.length - 1];
  if (lastStep) {
    // 由外部设置
  }

  return trajectory;
}
