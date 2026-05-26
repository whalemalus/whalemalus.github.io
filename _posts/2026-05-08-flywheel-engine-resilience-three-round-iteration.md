---
layout: post
title: "飞轮引擎的韧性：一次连续三轮迭代的实战复盘"
date: 2026-05-08
categories: DevOps
tags: ["飞轮迭代", "PageWise", "Claude Code", "AI Agent"]
excerpt: "一天之内三轮迭代，两次引擎超时，Guard Agent 手动接管——飞轮引擎的韧性实战记录。"
image: "https://whalemalus.com/file/cover-flywheel-resilience-key"
original_url: "https://whalemalus.com/articles/flywheel-engine-resilience-three-round-iteration"
---

# 飞轮引擎的韧性：一次连续三轮迭代的实战复盘

> **摘要**：在一天之内，PageWise 的飞轮迭代引擎连续跑完三轮迭代——R70 暗色主题（93.6 分）、R71 快捷键系统（94.0 分）、R72 E2E 测试（超时后恢复）。本文记录了引擎超时的排查过程、Guard Agent 手动接管的恢复策略，以及从这些实战中提炼出的工程经验。
>
> **关键词**：`飞轮迭代` `自动化引擎` `超时恢复` `AI Agent`

---

## 楔子

凌晨两点，引擎日志里跳出一行红色的 `subprocess.TimeoutExpired`。三轮迭代中的最后一轮在 Phase 4 卡住了——Guard Agent 调用 Claude Code 做质量审查时，600 秒的超时限制被撞了个正着。

代码已经提交，测试已经通过，但验证报告还没写。如果在传统 CI/CD 流水线里，这意味着整条流水线失败，需要人工介入重跑。但飞轮引擎的架构设计里，有一个叫做「Guard Agent 手动接管」的安全网。

## 引言

PageWise 是一个 Chrome 浏览器扩展，帮助用户在浏览技术网页时即时向 AI 提问。它的开发采用了「飞轮迭代」方法论——一套自动化的迭代引擎，把需求分析、设计、编码、验证、回顾五个阶段串成一个闭环。

5 月 7 日这一天，引擎连续执行了三轮迭代，产出了两个完整功能模块和一套 E2E 测试。过程中遇到了两次引擎超时，但都被自动恢复机制化解。这个过程值得记录下来，作为 AI Agent 自动化开发的一个实战样本。

---

## 📖 目录

1. [全景地图](#1-全景地图)
2. [三轮迭代实录](#2-三轮迭代实录)
3. [引擎超时与恢复机制](#3-引擎超时与恢复机制)
4. [踩坑记录](#4-踩坑记录)
5. [总结与展望](#5-总结与展望)

---

## 1. 全景地图

飞轮引擎的执行架构分为三层：

```
┌─────────────────────────────────────────────┐
│              Plan Agent (Hermes)             │
│  需求分析 → 设计 → 任务拆解 → Prompt 编写    │
└──────────────────┬──────────────────────────┘
                   │ 委派任务
                   ▼
┌─────────────────────────────────────────────┐
│           Sub Agent (Claude Code)            │
│  编码 → 测试 → 文档更新 → Git Commit         │
└──────────────────┬──────────────────────────┘
                   │ 交付结果
                   ▼
┌─────────────────────────────────────────────┐
│              Guard Agent (Hermes)            │
│  测试运行 → 代码审查 → 0-100 评分 → 决策     │
└─────────────────────────────────────────────┘
```

每轮迭代按五个 Phase 推进：

```
Phase 1 (需求) → Phase 2 (设计) → Phase 3 (编码) → Phase 4 (验证) → Phase 5 (回顾)
     ~100s           ~70s           ~280s           ~120s            ~60s
```

**关键设计**：Phase 3 是唯一真正需要 Claude Code 的阶段。Phase 1/2/4/5 都可以由 Guard Agent 或 Plan Agent 直接完成。这个设计在超时恢复时发挥了关键作用。

## 2. 三轮迭代实录

### R70: 暗色主题 BookmarkDarkTheme

**任务**：为书签图谱系统添加暗色主题支持。

**新增模块** `lib/bookmark-dark-theme.js`（273 行）：
- 三模式切换：`light` / `dark` / `system`
- `getTheme()` 解析 system 模式，通过 `matchMedia` 检测系统偏好
- `getColors()` / `getGraphColors()` / `getPanelColors()` 分层色板
- `getGroupColors()` 15 色分组方案（明暗各一）
- `getCSSVariables()` 18 个 CSS 变量
- 纯 ES Module，不依赖 DOM 或 Chrome API

**测试**：43 个用例，全部通过。

**Guard 评分**：93.6/100

```
功能完整性  30%  95  →  28.5
代码质量    25%  93  →  23.25
测试覆盖    25%  92  →  23.0
文档同步    10%  95  →  9.5
安全合规    10%  95  →  9.5
───────────────────────────
总计               93.75
```

**引擎问题**：Phase 5 超时（600s），但所有关键工作在 Phase 3 已完成。

### R71: 快捷键 BookmarkKeyboardShortcuts

**任务**：为书签系统添加可自定义的快捷键管理。

**新增模块** `lib/bookmark-keyboard-shortcuts.js`（385 行）：
- 5 个默认快捷键：搜索 (Ctrl+F)、放大 (=)、缩小 (-)、重置 (0)、刷新 (F5)
- `on(action, cb)` / `off(action, cb)` / `dispatch(action)` 回调驱动架构
- `getBindings()` / `setBinding()` / `resetBindings()` 自定义绑定（chrome.storage.sync 持久化）
- `detectConflict()` 快捷键冲突检测
- `formatBinding()` / `getShortcutsSummary()` 格式化显示

**测试**：48 个用例，全部通过。

**Guard 评分**：94.0/100

```
功能完整性  30%  95  →  28.5
代码质量    25%  92  →  23.0
测试覆盖    25%  95  →  23.75
文档同步    10%  95  →  9.5
安全合规    10%  92  →  9.2
───────────────────────────
总计               94.0
```

**引擎问题**：Phase 4 超时（Guard Agent 调用 Claude Code 做审查时 600s 限制被撞）。Guard Agent 手动接管，直接读代码 + 评分。

### R72: BookmarkGraph V2.0 E2E 测试

**任务**：为 9 个 V2.0 模块编写端到端集成测试。

**引擎状态**：Phase 3 超时（540s），Claude Code 只创建了一个 0 字节的空文件。

**Guard Agent 恢复**：
1. 验证 REQUIREMENTS 文档——发现 3 个模块名不匹配
2. 用 `grep` 提取所有 9 个模块的 API 签名（Pre-Reading Pattern）
3. 直接编写 E2E 测试文件（Escape Hatch 策略）
4. 运行测试、修复失败、提交

**关键发现**：Claude Code 在 REQUIREMENTS 文档中写的模块名与实际文件名不一致。例如 `bookmark-content-preview.js` 实际是 `bookmark-preview.js`。如果不做恢复而直接重跑引擎，这些错误会再次出现。

## 3. 引擎超时与恢复机制

### 超时分布

| 轮次 | 超时阶段 | 超时原因 | 耗时 |
|------|----------|----------|------|
| R70 | Phase 5 | `run_tests()` 在回顾阶段阻塞 | 600s+ |
| R71 | Phase 4 | Guard Agent 调用 Claude Code 审查 | 520s+ |
| R72 | Phase 3 | Claude Code 实现阶段卡住 | 540s |

### 恢复策略

飞轮引擎的恢复策略基于一个核心观察：**Phase 3 是唯一真正需要 Claude Code 的阶段**。

**Phase 5 超时（R70）**：影响最小。Phase 3 已经自动更新了 TODO.md、CHANGELOG.md、IMPLEMENTATION.md。Guard Agent 只需要独立运行测试、写 VERIFICATION.md。

**Phase 4 超时（R71）**：影响中等。Guard Agent 跳过 Claude Code 调用，直接读代码 + git diff + 评分。这个经验直接推动了一个架构改进：**Phase 4 应该是 Hermes 侧操作，不需要调用 Claude Code**。

**Phase 3 超时（R72）**：影响最大。但 Guard Agent 通过 Escape Hatch 机制——当 Claude Code 不可用时，Guard Agent 直接写代码——成功恢复。关键步骤是先验证 REQUIREMENTS 文档的准确性（发现 3 个模块名错误），再用 Pre-Reading Pattern 收集 API 签名。

### 引擎改进方向

从这三轮迭代中提炼出三个改进点：

1. **Phase 4 去除 Claude Code 调用**：Guard Agent 完全有能力独立完成验证（运行测试、读 diff、评分、写报告），节省 100-300 秒
2. **Phase 3 超时阈值调整**：当前 540s 对 Complex 任务不够，建议区分 Simple/Medium/Complex 设置不同阈值
3. **空文件检测**：引擎超时后应检查是否有 0 字节的产物文件，这类「幽灵文件」需要被清理

## 4. 踩坑记录

### 坑 1：模块名不匹配

Claude Code 在 REQUIREMENTS 文档中写的模块名与实际文件名不一致。

```
文档写的：bookmark-content-preview.js
实际文件：bookmark-preview.js
```

**原因**：Claude Code 根据功能描述推断文件名，没有实际检查 `ls lib/*.js`。

**解决**：Guard Agent 在恢复时先用 `ls lib/*.js` 验证模块名，发现 3 个不匹配并修正。

### 坑 2：旧版文档未被覆盖

Phase 1/2 生成的 REQUIREMENTS-ITER2.md 和 DESIGN-ITER2.md 来自之前的迭代，没有被新内容覆盖。

**原因**：Claude Code 的 `write_file` 可能在某些情况下没有正确覆盖旧文件（可能是权限或路径问题）。

**解决**：Guard Agent 检查文件时间戳，发现是旧版后手动更新。

### 坑 3：Phase 3 的 `--effort low` 意外好用

R70 使用了 `--bare --effort low` 参数调用 Claude Code，本以为会降低质量，结果 Phase 3 不仅完成了代码，还自动更新了所有文档（之前一直认为 `--effort low` 会跳过文档更新）。

**可能原因**：Simple 任务（1 个文件）让 Claude Code 有剩余的 turn 来处理文档；prompt 明确列出了 8 个要求包括文档更新。

## 5. 总结与展望

### 核心收获

1. **Guard Agent 是安全网**：当引擎超时时，Guard Agent 的手动接管能力是整个系统可靠性的基石。Escape Hatch 机制（Guard Agent 直接写代码）在 Claude Code 不可用时挽救了整轮迭代。

2. **Phase 3 是瓶颈**：只有编码阶段真正需要 Claude Code。其他四个阶段都可以由 Hermes Agent 独立完成。这意味着引擎的超时风险集中在 Phase 3，优化应聚焦于此。

3. **文档验证不可省略**：Claude Code 生成的 REQUIREMENTS 文档可能包含错误的模块名。Guard Agent 在恢复时做的模块名验证，避免了「带着错误需求重跑引擎」的恶性循环。

### 最佳实践

- **超时后不要盲目重跑引擎**：先检查哪些产物已经完成，只补做缺失的部分
- **Guard Agent 应主动接管**：Phase 4 超时时，Guard Agent 直接读代码评分，比等引擎重跑更快更可靠
- **Pre-Reading Pattern 收集 API 签名**：Guard Agent 直接写代码时，先用 `grep` 收集所有相关模块的 API 签名，确保测试覆盖完整

### 下一步

- R72 的 E2E 测试已恢复并提交
- 引擎脚本将更新：Phase 4 去除 Claude Code 调用、Phase 3 超时阈值区分任务复杂度
- 继续推进 R73（书签-知识库联动）

---

*本文记录了 PageWise 项目在 2026 年 5 月 7 日的三轮飞轮迭代实战。文中所有服务器路径和配置信息已做脱敏处理。*
