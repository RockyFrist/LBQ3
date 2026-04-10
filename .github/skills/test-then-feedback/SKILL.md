---
name: test-then-feedback
description: "Run headless combat tests and analyze results for balance feedback. Use when: tuning combat parameters, checking win rates, evaluating AI difficulty balance, diagnosing fight pacing issues, verifying parameter changes."
argument-hint: "Describe what to test (e.g. 'AI5 vs AI5 200 rounds' or 'check if heavy attack damage is too high')"
---

# 测试然后反馈

运行无头战斗测试，分析数据，给出平衡性调整建议。

## 适用场景

- 修改了 `src/constants.js` 中的战斗参数后，验证平衡性变化
- 比较不同 AI 难度之间的胜率分布
- 诊断战斗节奏问题（平局率过高、战斗过快/过慢等）
- 调整后回归测试，确认改动效果

## 流程

### 第 1 步：确定测试配置

根据用户目标选择参数：

| 参数 | 默认 | 说明 |
|------|------|------|
| `--rounds` | 100 | 轮数，平衡测试建议 200+ |
| `--diffA` | 5 | 蓝方 AI 难度 1-5 |
| `--diffB` | 5 | 红方 AI 难度 1-5 |
| `--json` | 否 | 输出 JSON 格式 |
| `--detail` | 否 | 输出每轮明细 |

同难度镜像测试（如 5v5）用于检测先手/后手偏差；跨难度测试（如 3v5）用于验证难度梯度。

### 第 2 步：执行测试

在终端运行：

```bash
node test-runner.js --rounds 200 --diffA 5 --diffB 5 --json
```

如需可读报告加 `--detail`，去掉 `--json`。

### 第 3 步：提取关键指标

从 JSON 输出中读取以下核心指标：

| 指标 | 健康范围 | 警告信号 |
|------|---------|---------|
| **同难度胜率差** | < 5% | > 10% 存在先后手偏差 |
| **平局率** | < 5% | > 10% AI 过于保守或超时多 |
| **平均战斗时长** | 8-25秒 | < 5秒 伤害过高；> 35秒 偏慢 |
| **格挡率** | 20%-50% | > 60% 防守过强；< 15% 格挡无用 |
| **精准格挡占比** | 15%-40% | > 50% 窗口过宽；< 5% 窗口过小 |
| **重击命中占比** | 15%-35% | > 50% 重击性价比过高；< 5% 重击无用 |
| **处决次数** | 每局平均 > 0.05 | 0 处决 → 体力系统过宽松 |
| **破防次数** | 有发生即可 | 0 → 轻击打防御路线无效 |
| **胜方残血** | 30-70 HP | > 85 → 一边倒；< 20 → 均势但极端 |

### 第 4 步：诊断与建议

根据指标偏离生成建议，按优先级排列：

#### 4a. 胜率不平衡（同难度）

- 蓝方偏高 → 检查是否先创建的角色有位置优势，或 AI 初始决策差异
- 红方偏高 → 检查 Enemy 类构造顺序是否影响首帧行为

#### 4b. 平局率偏高

- 检查 `MAX_IDLE_TIME`（当前 2.5s）是否需要缩短
- 检查 AI `approachDist` 是否过大导致不接敌
- 考虑降低 `STAMINA_MAX` 使体力更紧张

#### 4c. 战斗时间异常

- **太快**：降低伤害值（`LIGHT_CHAIN` damage / `HEAVY_DAMAGE`），或增加 HP
- **太慢**：提高 AI `attackRate`/`heavyRate`，缩短 `thinkCD`，或降低格挡窗口

#### 4d. 格挡/格挡率异常

- **格挡率过高**：缩小 `PARRY_WINDOW_*` 时长，或减少 AI `blockDurBase`
- **精准格挡过多**：缩小 `PARRY_WINDOW_PRECISE`（当前 0.18s）
- **格挡率过低**：增大格挡窗口，或增加 AI `reactChance`

#### 4e. 重击/轻击失衡

- **重击占比过高**：降低 `HEAVY_DAMAGE`(25)，增加蓄力时间(`HEAVY_CHARGE` 0.70s)
- **重击无人用**：提高 AI `heavyRate`，或增加重击伤害
- **轻击伤害不足**：提高连击第 3 下伤害，或缩短后摇

#### 4f. 处决/破防缺失

- **无处决**：降低 `STAMINA_MAX`(5) 或增加体力消耗
- **无破防**：降低破防所需轻击数（当前 3），或增加 AI 连续攻防压力

### 第 5 步：输出反馈报告

报告格式：

```
## 测试结果摘要
- 配置：AI-{diffA} vs AI-{diffB}，{rounds} 轮
- 胜率：蓝 XX% / 红 XX% / 平局 XX%
- 平均时长：XXs

## 关键指标
（列出偏离健康范围的指标及实际值）

## 诊断
（列出问题原因分析）

## 建议修改
（列出具体参数调整建议，标注文件和变量名）

## 验证计划
（建议修改后再次运行的测试命令）
```

### 第 6 步（可选）：应用修改并回归

如果用户确认要修改参数：
1. 编辑 `src/constants.js` 中的对应值
2. 重新运行相同测试命令
3. 对比修改前后数据
4. 确认指标进入健康范围

## 关键参数速查

### 文件：`src/constants.js`

| 变量 | 当前值 | 影响 |
|------|--------|------|
| `HP` | 100 | 战斗总时长 |
| `STAMINA_MAX` | 5 | 体力紧张度/处决频率 |
| `STAMINA_REGEN_INTERVAL` | 2.5s | 体力恢复节奏 |
| `HEAVY_DAMAGE` | 25 | 重击收益 |
| `LIGHT_CHAIN[2].damage` | 12 | 连击终结伤害 |
| `PARRY_WINDOW_PRECISE` | 0.18s | 精准格挡难度 |
| `PARRY_WINDOW_SEMI` | 0.55s | 半精准格挡宽容度 |
| `BLOCK_BREAK_THRESHOLD` | 3 | 破防所需轻击数 |
| `EXECUTION_DAMAGE_RATIO` | 0.35 | 处决伤害比例 |

### 文件：`src/enemy.js`

| 参数 | 影响 |
|------|------|
| `reactChance` | AI 反应概率 |
| `thinkCD` | AI 决策速度 |
| `attackRate` / `heavyRate` | 攻击频率与重击倾向 |
| `blockDurBase` | 防御持续时长 |
| `feintChance` | 变招率 |
| `punishRate` | 惩罚后摇概率 |
