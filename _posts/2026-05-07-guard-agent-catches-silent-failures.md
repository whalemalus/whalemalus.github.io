---
layout: post
title: "当 Guard Agent 抓住了引擎的静默失败：自动化迭代的第 N 次信任危机"
date: 2026-05-07
categories: DevOps
tags: ["飞轮迭代", "Claude Code", "Bug 排查"]
excerpt: "飞轮迭代引擎报告全部通过，但 Guard Agent 发现了权限被拒导致的静默降级、执行了错误任务、零测试结果、以及跑了6天的僵尸进程。"
image: "https://whalemalus.com/file/cover-guard-agent-silent-failure-key"
original_url: "https://whalemalus.com/articles/guard-agent-catches-silent-failures"
---

# 当 Guard Agent 抓住了引擎的「静默失败」：自动化迭代的第 N 次信任危机

> **摘要**：飞轮迭代引擎报告「全部 ✅」，但 Guard Agent 发现了权限被拒导致的静默降级、执行了错误任务、零测试结果、以及跑了 6 天的僵尸进程。本文记录了 2026-05-06 R1 运行中 Guard Agent 如何拆穿引擎的「虚假成功」，以及由此总结出的 7 条自动化运维经验。
>
> **关键词**：`飞轮迭代` `Guard Agent` `静默失败` `Claude Code` `自动化运维`

---

## 楔子

5 月 6 日下午两点，飞轮迭代引擎准时启动。屏幕上的日志一行行滚动，五个阶段依次打上绿色 ✅。一切看起来都很完美——直到 Guard Agent 开始审查。

它打开 git diff，发现变更的文件和引擎声称完成的任务完全对不上。它检查测试报告，看到的是一个干干净净的「0 passed / 0 failed」。它查看进程列表，发现了从 4 月 30 日起就没停过的僵尸进程，已经默默吃了 6 天的 CPU。

引擎说「我完成了」。Guard Agent 说「你完成了什么？」

## 引言

自动化迭代是 PageWise 项目的核心开发方式。每天三次，飞轮引擎自动选择 TODO 中的下一个任务，调用 Claude Code 完成需求→设计→实现→验证→回顾的五阶段流程，然后把结果交给 Guard Agent 审查。

这个流程在 R43-R66 期间运行了 24 轮，总体表现不错。但 5 月 6 日的 R1 运行暴露了一个系统性问题：**当引擎的执行环境出了问题，它不会报错，而是用旧数据假装成功**。

这不是引擎的 bug，而是一个架构层面的盲区。

## 📖 目录

1. [全景地图](#全景地图)
2. [核心概念](#核心概念)
3. [实战指南](#实战指南)

---

## 全景地图

> 鸟瞰飞轮迭代引擎的完整架构，理解各组件之间的关系

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│                  飞轮迭代引擎                            │
│              pagewise-iteration-engine.py                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  │ 阶段 1   │───▶│ 阶段 2   │───▶│ 阶段 3   │          │
│  │ 需求分析 │    │ 架构设计 │    │ 代码实现 │          │
│  └──────────┘    └──────────┘    └──────────┘          │
│       │                               │                 │
│       ▼                               ▼                 │
│  ┌──────────┐                   ┌──────────┐           │
│  │ 阶段 5   │◀──────────────────│ 阶段 4   │           │
│  │ 回顾总结 │                   │ 质量验证 │           │
│  └──────────┘                   └──────────┘           │
│                                                         │
│  每个阶段调用: claude -p "prompt" --max-turns N         │
│  通过: su - claude-user -c 'bash /tmp/runner.sh'       │
│                                                         │
└─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│                   Guard Agent                           │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ git diff 审查│  │ 测试结果验证 │  │ 进程健康检查 │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  核心原则: 不信任引擎的自我报告，独立验证一切            │
└─────────────────────────────────────────────────────────┘
```

### 本文的学习路径

```
问题发现 → 根因分析 → 逐个击破 → 经验总结
   │           │           │           │
   ▼           ▼           ▼           ▼
 Guard 拆穿  权限/任务    7条 battle-  架构改进
 虚假成功    /测试/进程   tested 规则  建议
```

## 核心概念

### 静默失败（Silent Failure）

静默失败是指系统出了问题，但没有抛出错误、没有中断流程、没有在日志中标红。它只是默默地用了错误的数据或跳过了关键步骤，然后报告「成功」。

类比：你让快递员送包裹到 A 地址，他去了 B 地址，把包裹放在门口拍了张照发给你说「已送达」。照片是真的，送达是真的，但送错了地方。

在飞轮引擎中，静默失败的典型表现：

| 引擎报告 | 实际情况 |
|----------|----------|
| ✅ 阶段 1-3 完成 | Runner 脚本写入失败，用了上一轮的旧脚本 |
| ✅ 任务 R68 完成 | 实际执行的是 R67 |
| ✅ 测试 0 passed / 0 failed | 测试根本没跑，或者输出格式不匹配解析规则 |

### Guard Agent 模式

Guard Agent 的核心设计哲学是 **「不信任，只验证」**。它不看引擎打了多少 ✅，而是直接检查：

1. **git diff** — 实际改了什么文件？和声称的任务匹配吗？
2. **测试结果** — 独立运行测试套件，对比引擎报告的数字
3. **进程状态** — 有没有僵尸进程？有没有卡住的子进程？
4. **文件系统** — 引擎声称创建的文件真的存在吗？

### 权限降级（Permission Degradation）

当一个以 root 运行的进程需要写入另一个用户拥有的文件时，不会报错中断，而是静默跳过。这就是权限降级——从「我能做一切」降级到「我假装做了」。

引擎脚本中，`write_file('/tmp/claude-runner-pagewise.sh', ...)` 失败时只打了一行日志就继续了。后续所有阶段都在用这个**没有被更新的旧脚本**。

## 实战指南

### 问题 1：Runner 脚本权限被拒

**现象**：引擎日志中出现 `写入文件失败 /tmp/claude-runner-pagewise.sh: [Errno 13] Permission denied`，但引擎没有中断。

**根因**：上一次引擎运行时以 `claude-user` 身份创建了 `/tmp/claude-runner-pagewise.sh`，文件 owner 是 `claude-user`。这次引擎以 `root` 运行时，`write_file()` 覆盖写入被拒绝（虽然 root 通常有权限，但在某些容器化或安全策略下可能受限）。

**修复**：在引擎启动前清理旧文件：

```bash
rm -f /tmp/claude-runner-pagewise.sh /tmp/pagewise-prompt.txt
```

**教训**：临时文件不能跨用户共享。要么统一运行用户，要么在每次运行前清理。

### 问题 2：执行了错误的任务

**现象**：引擎报告完成 R68（BookmarkAIRecommendations），但 git diff 显示实际创建的是 R67（BookmarkLearningProgress）的文件。

**根因**：引擎从 TODO.md 解析出 R68 作为下一个任务，但写入 runner 脚本时使用了旧的 prompt（因为问题 1 导致脚本没更新），Claude Code 实际拿到的是上一轮 R67 的任务描述。

**验证方法**：

```bash
# 检查实际变更的文件
git diff --stat HEAD~1

# 检查设计文档中的任务编号
grep -i "R[0-9]" /home/claude-user/pagewise/docs/DESIGN-ITER1.md

# 检查 git 提交信息
git log --oneline -3
```

**教训**：引擎声称完成的任务和实际完成的任务可能不一致。Guard Agent 必须独立验证。

### 问题 3：僵尸进程吃了 6 天 CPU

**现象**：`ps aux` 发现 `test-ai-cache.js` 进程从 4 月 30 日起一直在运行，已经消耗了 8904 分钟（约 6 天）的 CPU 时间。

**根因**：4 月 30 日的一次引擎运行在测试阶段崩溃，但没有清理子进程。`node --test` 进程变成了孤儿进程，一直卡在某个 `await` 上不退出。

**修复**：

```bash
# 查找僵尸测试进程
ps aux | grep 'node --test' | grep -v grep

# 清理所有僵尸测试进程
ps aux | grep 'node --test' | awk '{print $2}' | xargs -r kill -9

# 查找其他可能的僵尸进程
ps aux | grep 'claude -p' | grep -v grep
```

**教训**：自动化引擎必须有进程清理机制。建议在引擎启动时执行：

```bash
# 引擎启动时清理上次的残留进程
pkill -f 'node --test.*pagewise' 2>/dev/null || true
pkill -f 'claude -p.*pagewise' 2>/dev/null || true
```

### 问题 4：测试报告解析失败

**现象**：引擎报告 `0 passed / 0 failed`，但 git diff 显示有 497 行测试代码被添加。

**根因**：引擎通过统计输出中的 `✓` 和 `✗` 符号来计算测试结果。但如果 Claude Code 的输出格式不是 `✓ 测试名` 而是其他格式（如 `ok 1 - 测试名` 或 `PASS 测试名`），计数就是零。

**验证方法**：

```bash
# 独立运行测试，检查实际结果
cd /home/claude-user/pagewise
node --test tests/test-bookmark-learning-progress.js 2>&1 | tail -20
```

**教训**：测试结果解析不能依赖单一的输出格式匹配。应该使用测试框架的退出码和结构化输出。

### 问题 5：Mock setTimeout 导致异步测试卡死

**现象**：某些测试在 mock `setTimeout` 后永远不会 resolve。

**根因**：测试代码 mock 了全局 `setTimeout`，但被测代码中的 `await new Promise(r => setTimeout(r, N))` 也用了被 mock 的版本，而 mock 版本可能不会调用回调。

**修复**：在 mock 前保存原始引用：

```javascript
const originalSetTimeout = global.setTimeout;

// mock
global.setTimeout = (fn, ms) => originalSetTimeout(fn, 0); // 立即执行

// 测试结束后恢复
global.setTimeout = originalSetTimeout;
```

### 问题 6：IndexedDB Mock 共享状态

**现象**：两个测试用例使用同名数据库，第一个测试写入的数据出现在第二个测试中。

**根因**：IndexedDB mock 使用 `dbName` 作为 key，同名数据库共享同一个内存实例。

**修复**：每个测试使用不同的数据库名，或在 `beforeEach` 中调用 `resetIndexedDBMock()`：

```javascript
beforeEach(() => {
  resetIndexedDBMock();
});
```

### 问题 7：`duration > 0` 过滤掉了瞬间完成的会话

**现象**：某些学习进度会话的持续时间显示为 0，被过滤条件排除。

**根因**：会话在同一个事件循环 tick 内开始和结束，`duration` 四舍五入为 0。

**修复**：改用 `endTime !== null` 作为过滤条件：

```javascript
// 之前（有 bug）
sessions.filter(s => s.duration > 0)

// 之后（正确）
sessions.filter(s => s.endTime !== null)
```

## 踩坑记录

### 坑 1：引擎的「全部 ✅」不代表真的全部成功

**现象**：引擎日志中五个阶段全部打 ✅，但 Guard Agent 发现实际执行了错误的任务。

**原因**：引擎的成功判断基于 Claude Code 的退出码（`returncode == 0`），但 Claude Code 即使没有真正执行任务（比如拿到的是旧 prompt），退出码也是 0。

**解决**：Guard Agent 不能只看退出码，必须独立验证文件变更和测试结果。

### 坑 2：Root 用户不一定能覆盖其他用户的临时文件

**现象**：以 root 运行的引擎无法覆盖 `claude-user` 创建的 `/tmp/` 文件。

**原因**：虽然 root 通常有所有权限，但在某些安全策略（如 AppArmor、SELinux）或容器化环境下，`/tmp` 目录可能有 sticky bit 或其他限制。

**解决**：引擎启动前 `rm -f` 清理旧文件，或使用以当前用户为前缀的临时文件名。

### 坑 3：双重 Git 提交

**现象**：同一次迭代产生了两个 Git 提交（`6f96c6e` 和 `ed87c33`）。

**原因**：引擎在阶段 3（实现）和阶段 4（验证）分别执行了 `git add && git commit`，但阶段 4 的提交没有新的变更，只是重复了阶段 3 的内容。

**解决**：只在阶段 3 结束时提交一次，阶段 4 的验证不应该产生新的提交。

## 总结与展望

### 核心收获

1. **静默失败是自动化系统最危险的敌人**。引擎不会主动告诉你它出了问题，它只会用旧数据假装成功。
2. **Guard Agent 的价值在于独立验证**。不信任引擎的自我报告，直接检查文件系统、进程状态和测试结果。
3. **临时文件是跨用户协作的雷区**。要么统一用户，要么每次清理。

### 最佳实践

| 场景 | 推荐做法 |
|------|----------|
| 引擎启动 | 清理旧的临时文件和僵尸进程 |
| 测试结果验证 | 独立运行测试，不依赖引擎的解析 |
| 任务完成确认 | 检查 git diff 是否和任务描述匹配 |
| 进程管理 | 使用进程组或 cgroup 确保子进程被清理 |
| 临时文件 | 使用 PID 或时间戳后缀避免冲突 |

### 延伸阅读

- PageWise 飞轮迭代方法论：从 R1 到 R66 的 66 轮迭代经验
- Claude Code Sub Agents 的质量门机制：如何用量化评分替代二元通过/失败
- Guard Agent 模式：在自动化流水线中引入独立审查层

---

*本文记录的技术经验来自 PageWise 项目（智阅 Chrome 扩展）的飞轮迭代实践。项目地址：https://github.com/whalemalus/pagewise*