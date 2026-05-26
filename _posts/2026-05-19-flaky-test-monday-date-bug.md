---
layout: post
title: "周一早上的定时炸弹：一个隐藏了 102 轮迭代的日期 Bug"
date: 2026-05-19
categories: DevOps
tags: ["飞轮迭代", "Chrome Extension", "Claude Code"]
excerpt: "PageWise 的 getWeeklyStats 测试在周一突然全红，根因是测试代码用 Date.now() - N天 构造时间戳，但生产代码以周一 00:00:00 作为一周起点。"
image: "https://whalemalus.com/file/cover-flaky-test-monday-key"
header:
  teaser: "https://whalemalus.com/file/cover-flaky-test-monday-key"
  overlay_image: "https://whalemalus.com/file/cover-flaky-test-monday-key"
original_url: "https://whalemalus.com/articles/flaky-test-monday-date-bug"
---

# 周一早上的定时炸弹：一个隐藏了 102 轮迭代的日期 Bug

> **摘要**：PageWise 的 `getWeeklyStats` 测试在周一突然全红，根因是测试代码用 `Date.now() - N天` 构造时间戳，但生产代码以周一 00:00:00 作为一周起点。当 `now - 1天` 落到周日时，数据被归入上周，断言自然失败。本文还原整个排查和修复过程。
>
> **关键词**：`飞轮迭代` `Flaky Test` `日期处理` `Chrome Extension` `自动化测试`

---

## 楔子

周一早上九点，飞轮迭代引擎准时启动。按照惯例，它会扫描 TODO 清单、跑一遍测试、找到下一个任务开始迭代。但今天不一样——5,887 个测试里有 1 个挂了。

不是新写的代码出了问题。是那行存在了几个月、跑了上百次的测试，突然在今天这个特定的周一，安静地失败了。

## 引言

Flaky Test（不稳定测试）是自动化测试体系里最隐蔽的敌人。它不像编译错误那样大声宣告自己的存在，而是安静地在某个特定条件下才露出真面目。更可怕的是，当你的飞轮迭代引擎已经完成了 102 轮迭代、所有 TODO 都打上了勾，这种"偶发"失败很容易被当成噪音忽略掉。

这次的故事，就是关于一个在周一才会爆炸的日期炸弹，以及飞轮引擎如何在"无事可做"的状态下，依然找到了值得修复的问题。

## 📖 目录

1. [全景地图](#全景地图)
2. [核心概念](#核心概念)
3. [实战指南](#实战指南)
4. [踩坑记录](#踩坑记录)
5. [总结与展望](#总结与展望)

---

## 全景地图

> 鸟瞰飞轮迭代引擎如何在"空闲"状态下发现并修复问题

### 飞轮迭代的五阶段生命周期

```
┌─────────────────────────────────────────────────────┐
│                  飞轮迭代引擎                         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐       │
│  │ 需求分析  │──→│ 架构设计  │──→│ 代码实现  │       │
│  │ (Phase 1)│   │ (Phase 2)│   │ (Phase 3)│       │
│  └──────────┘   └──────────┘   └──────────┘       │
│                                      │              │
│                                      ▼              │
│                  ┌──────────┐   ┌──────────┐       │
│                  │ 回顾总结  │←──│ 测试验证  │       │
│                  │ (Phase 5)│   │ (Phase 4)│       │
│                  └──────────┘   └──────────┘       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 本次迭代的触发链路

```
TODO.md 全部完成（61/61）
    │
    ▼
飞轮引擎找不到 - [ ] 任务
    │
    ▼
转而运行全量测试套件（5,887 个测试）
    │
    ▼
发现 1 个失败：getWeeklyStats
    │
    ▼
将"修复不稳定测试"作为本轮迭代目标
    │
    ▼
五阶段生命周期启动
```

### 本文的学习路径

问题定位 → 根因分析 → 修复方案 → 验证结果 → 经验提炼

---

## 核心概念

### Flaky Test 是什么

Flaky Test 指的是：**同样的代码、同样的测试，有时通过有时失败**。它不是逻辑错误，而是对环境、时间、顺序等外部因素的隐式依赖。

类比：一把钥匙能开锁，但只在刮风的时候能开——因为锁芯有个松动的弹簧，风一吹就归位了。问题不在钥匙，也不在锁的设计，而在那个被忽略的物理细节。

### 日期边界的陷阱

JavaScript 的 `Date` 对象看似简单，但日期计算充满了边界情况：

- **时区**：`new Date()` 返回本地时间，UTC 时间可能差一天
- **周的起点**：不同文化对"一周从哪天开始"有不同定义（周一 vs 周日）
- **夏令时**：某些日子只有 23 小时或 25 小时
- **相对日期**：`now - 1天` 在周一减去 1 天 = 周日，但"本周"的定义可能不包含周日

### weekStart 算法

生产代码中的 `getWeeklyStats()` 使用以下逻辑计算本周起始点：

```javascript
// 以周一 00:00:00 作为本周起点
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sunday, 1=Monday, ...
  const diff = day === 0 ? 6 : day - 1; // 周日回退6天，其他回退 day-1 天
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
```

这个算法保证了：无论今天是周几，`weekStart` 始终指向本周一的 00:00:00。

---

## 实战指南

### 第一步：发现问题

飞轮迭代引擎运行全量测试：

```bash
node --test tests/test-*.js
```

输出显示 5,886 通过，1 失败：

```
✗ 应汇总本周的会话数据 (tests/test-review-session.js:327)
  AssertionError: expected 1 >= 2
```

关键信息：
- 失败文件：`tests/test-review-session.js`
- 失败行号：327
- 断言内容：期望 `totalSessions >= 2`，实际只有 1

### 第二步：定位根因

查看失败的测试代码：

```javascript
// 测试代码（有问题的版本）
const now = Date.now();
const dayMs = 24 * 60 * 60 * 1000;

// 创建 3 个会话，分别在今天、昨天、前天
createSession({ timestamp: now });
createSession({ timestamp: now - dayMs });      // 周一 - 1天 = 周日
createSession({ timestamp: now - dayMs * 2 });  // 周一 - 2天 = 周六

const stats = getWeeklyStats();
assert(stats.totalSessions >= 2);  // 期望至少 2 个在本周
```

问题在于：测试假设 `now - 1天` 和 `now - 2天` 都在"本周"内。但当 `now` 是周一时：

| 时间戳 | 对应日期 | 是否在本周（周一为起点） |
|--------|----------|------------------------|
| `now` | 周一 | ✅ 是 |
| `now - 1天` | 周日 | ❌ 否（属于上周） |
| `now - 2天` | 周六 | ❌ 否（属于上周） |

只有 1 个会话在本周，`totalSessions = 1`，断言 `>= 2` 失败。

### 第三步：修复

核心思路：**让测试使用和生产代码相同的 weekStart 算法**，而不是用相对偏移。

```javascript
// 修复后的测试代码
const now = Date.now();
const dayMs = 24 * 60 * 60 * 1000;

// 计算本周起始点（与生产代码一致）
const weekStart = getWeekStart(now);

// 将会话锚定到 weekStart 的相对位置
createSession({ timestamp: weekStart });              // 周一
createSession({ timestamp: weekStart + dayMs });       // 周二
createSession({ timestamp: weekStart + dayMs * 2 });   // 周三

const stats = getWeeklyStats();
assert.strictEqual(stats.totalSessions, 3);  // 精确断言
```

两个关键改动：

1. **时间锚点从 `now` 改为 `weekStart`**：无论今天是周几，`weekStart + 0/1/2天` 始终在本周内
2. **断言从 `>= 2` 改为 `=== 3`**：精确断言比模糊断言更能暴露问题

### 第四步：验证

```bash
node --test tests/test-*.js
# 5,887 pass / 0 fail
```

全量回归通过，提交：

```bash
git commit -m "fix: flaky getWeeklyStats test - day-of-week dependency (飞轮迭代 R1)"
git push origin master
```

Commit: `9f716fe`

---

## 踩坑记录

### 坑 1：`now - N天` 不等于"N 天前的同一时刻"

**现象**：测试在周二到周日都通过，唯独周一失败。

**原因**：`Date.now() - N * dayMs` 做的是毫秒级减法，不考虑日历边界。在周一减去 1 天的毫秒数，得到的是周日同一时刻的时间戳——这在"以周一为起点"的周统计中属于上周。

**教训**：涉及"本周"、"本月"等日历概念时，永远先计算边界（weekStart、monthStart），再用边界做偏移，而不是用 `now` 做偏移。

### 坑 2：模糊断言掩盖了问题

**现象**：测试写的是 `>= 2` 而不是 `=== 3`，所以当只有 1 个会话在本周时才失败。如果有 2 个会话在本周，测试会通过，但逻辑上可能仍然不对。

**教训**：当你确切知道期望值时，用精确断言（`===`、`==`）。模糊断言（`>=`、`<=`）只在确实存在合理范围时才使用。

### 坑 3：飞轮引擎的测试解析器有 Bug

**现象**：引擎脚本的 `run_tests()` 函数用 `output.count("✓")` 统计通过数，但 `node --test` 输出的是 TAP 格式（`# pass` / `# fail`），导致引擎始终报告 0/0。

**影响**：飞轮引擎无法正确感知测试状态，可能把失败的测试误判为通过。

**状态**：已记录为已知缺陷，待修复。

---

## 总结与展望

### 核心收获

1. **日期测试必须考虑周一效应**：任何以"周"为单位的统计，测试数据的构造都必须基于 `weekStart` 而非 `now`
2. **飞轮引擎的"空闲"状态也有价值**：即使没有新的 TODO 任务，全量测试套件本身就是待维护资产
3. **精确断言优于模糊断言**：`=== 3` 比 `>= 2` 更能暴露边界问题

### 最佳实践

- **日期测试三原则**：
  1. 用 `weekStart`/`monthStart` 做锚点，不用 `now`
  2. 测试数据覆盖所有星期几（至少跑一次周一的场景）
  3. 断言精确值，不断言范围

- **Flaky Test 处理流程**：
  1. 复现：确认在什么条件下失败
  2. 定位：找到对环境的隐式依赖
  3. 修复：消除隐式依赖，使测试确定性通过
  4. 验证：全量回归，确保不引入新问题

### 延伸阅读

- PageWise 飞轮迭代引擎的完整架构：从 R1 到 R102 的 102 轮迭代实践
- Chrome Extension 的自动化测试方案：node:test + E2E 的混合策略
- 飞轮引擎已知缺陷的修复计划：测试解析器、Phase 2 稳定性、Claude Code CLI 认证
