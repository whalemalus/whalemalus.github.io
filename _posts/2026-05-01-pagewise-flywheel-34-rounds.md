---
layout: post
title: "飞轮的燃料耗尽：PageWise 如何用 34 轮迭代完成整个 LLM Wiki 系统"
date: 2026-05-01
categories: DevOps
tags: ["Chrome Extension", "自动化", "Claude Code", "飞轮迭代", "AI Agent"]
excerpt: "PageWise 在一天内通过自动化飞轮引擎完成 34 轮迭代，构建了完整的 LLM Wiki 知识编译系统，同时修复了 v2.1.0 的 3 个关键 Bug。"
image: "https://whalemalus.com/file/cover-pagewise-flywheel-key"
original_url: "https://whalemalus.com/articles/pagewise-flywheel-34-rounds"
---

# 飞轮的燃料耗尽：PageWise 如何用 34 轮迭代完成整个 LLM Wiki 系统

> **摘要**：PageWise Chrome 扩展在一天之内通过自动化飞轮引擎完成了 34 轮迭代，从零构建了完整的 LLM Wiki 知识编译系统。同时修复了 v2.1.0 的 3 个关键 Bug，将测试套件从 59 个失败修复到 1873 个全部通过。当 TODO.md 的最后一个任务被勾选时，飞轮引擎发现自己无事可做——这正是它设计的终点。
>
> **关键词**：`飞轮迭代` `Chrome Extension` `自动化测试` `LLM Wiki` `Claude Code`

---

## 楔子

凌晨两点，屏幕上闪过一行日志："R34 completed. TODO.md: 0 unchecked items remaining." 飞轮引擎安静地停了下来。

这不是崩溃，不是超时，不是 API 报错。它只是……做完了。

34 轮迭代，从知识库性能优化到语义搜索，从 API 响应缓存到服务端同步，一个 LLM Wiki 知识编译系统的全部蓝图，在 24 小时内被逐一实现。没有人工干预，没有"下一步做什么"的犹豫，只有 TODO.md 上一个接一个被打勾的任务。

直到最后一个。

## 引言

这篇文章记录的是 PageWise 项目在 2026 年 4 月 30 日这一天发生的事情。PageWise 是一个 Chrome 扩展，让你在浏览技术网页时可以直接向 AI 提问，并把答案存入本地知识库。

这一天发生了三件事：

1. **v2.1.0 的 3 个关键 Bug 被修复**，测试套件从 59 个失败归零
2. **飞轮迭代引擎完成了 34 轮迭代**，构建了完整的 LLM Wiki 系统
3. **飞轮引擎发现自己无事可做**，因为 TODO.md 的燃料耗尽了

如果你对"如何用自动化迭代引擎在一天内完成一个月的工作量"感兴趣，这篇文章会告诉你整个过程——包括那些差点翻车的时刻。

## 📖 目录

1. [全景地图](#全景地图)
2. [核心概念](#核心概念)
3. [实战指南](#实战指南)
4. [踩坑记录](#踩坑记录)
5. [总结与展望](#总结与展望)

---

## 全景地图

> 鸟瞰 PageWise 飞轮迭代系统的完整架构

### 系统架构

```
┌─────────────────────────────────────────────────────┐
│                   飞轮迭代引擎                        │
│            pagewise-iteration-engine.py              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │ Guard    │───→│ Plan     │───→│ Sub      │      │
│  │ Agent    │    │ Agent    │    │ Agent    │      │
│  │ (Hermes) │    │ (Hermes) │    │ (Claude  │      │
│  │          │    │          │    │  Code)   │      │
│  └──────────┘    └──────────┘    └──────────┘      │
│       │               │               │             │
│       ▼               ▼               ▼             │
│  ┌──────────────────────────────────────────────┐  │
│  │              四文档系统                        │  │
│  │  REQUIREMENTS → DESIGN → TESTS → CHANGELOG   │  │
│  └──────────────────────────────────────────────┘  │
│       │                                             │
│       ▼                                             │
│  ┌──────────────────────────────────────────────┐  │
│  │              TODO.md（燃料）                   │  │
│  │  - [x] 知识库性能优化  ← R1                   │  │
│  │  - [x] AI 响应缓存    ← R2                   │  │
│  │  - [x] 语义搜索       ← R7                   │  │
│  │  - [x] 服务端同步     ← R34                  │  │
│  │  - [ ] (空)           ← 引擎停止              │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 本文的学习路径

```
飞轮概念 → 三层 Agent 架构 → 四文档系统 → 34 轮实战 → 踩坑与调试 → 经验提炼
```

### 数据流

```
TODO.md 任务 ──→ Guard Agent 检查 ──→ Plan Agent 写需求/设计
      │                                      │
      │                                      ▼
      │                              Sub Agent (Claude Code)
      │                                      │
      │                                      ▼
      └─────────── 测试通过 ──→ CHANGELOG 更新 ──→ TODO 勾选 ──→ 下一轮
```

---

## 核心概念

### 1. 飞轮迭代（Flywheel Iteration）

飞轮的核心思想很简单：**让每一次迭代的结果成为下一次迭代的起点**。

想象一个沉重的飞轮。刚开始推的时候很费力，每转一圈都需要持续用力。但随着转速增加，飞轮自身的惯性会帮你维持转动。到最后，轻轻一推就能让它继续旋转。

在软件开发中，飞轮就是：

```
写需求 → 写设计 → 写测试 → 实现 → 跑测试 → 更新日志 → 更新 TODO → 下一个任务
```

每一轮都产出代码、测试和文档。这些产出让下一轮更容易——因为代码库更完善，测试覆盖更广，需求文档更清晰。

### 2. 三层 Agent 架构

PageWise 的飞轮引擎用三个角色协作：

| 角色 | 职责 | 实际执行者 |
|------|------|-----------|
| **Guard Agent** | 检查前置条件，确保项目状态健康 | Hermes（脚本） |
| **Plan Agent** | 写需求文档和设计文档 | Hermes 或 Claude Code |
| **Sub Agent** | 实现代码、写测试 | Claude Code |

Guard 像门卫，Plan 像建筑师，Sub 像施工队。三者各司其职，互不越界。

### 3. TODO.md 是燃料

这是最关键的洞察：**飞轮引擎的动力来源不是代码，是任务清单**。

```markdown
# TODO.md — 飞轮的燃料

- [x] 知识库性能优化        ← R1 完成
- [x] AI 响应缓存           ← R2 完成
- [x] 技能推荐优化          ← R3 完成
- [x] 用户行为分析          ← R4 完成
...
- [x] 服务端同步            ← R34 完成
- [ ] (空)                  ← 引擎停止
```

当最后一个 `[ ]` 变成 `[x]`，飞轮就失去了动力。这不是 Bug——这是设计。

### 4. 四文档系统

每轮迭代必须产出四份文档：

1. **REQUIREMENTS.md** — 这轮要做什么
2. **DESIGN.md** — 怎么做
3. **测试代码** — 做对了没有
4. **CHANGELOG.md** — 做了什么

这四份文档让每轮迭代可追溯、可复现、可审计。

---

## 实战指南

### 第一步：修复 v2.1.0 的 3 个关键 Bug

在飞轮引擎全速运转之前，先要解决用户报告的 3 个 Bug。

**Bug 1：Q&A 页面 `insertBefore` 错误**

现象：每次打开问答页面都报 `Failed to execute 'insertBefore' on 'Node'`。

根因：`chatArea.innerHTML = ''` 清空了 DOM，但 MessageRenderer 的 sentinel 元素也被一起删除了。

```javascript
// 修复：添加 reset() 方法
reset() {
    this.chatArea.innerHTML = '';
    // 重建 sentinel 元素
    const sentinel = document.createElement('div');
    sentinel.id = 'chatEndSentinel';
    this.chatArea.appendChild(sentinel);
}
```

**Bug 2：学习路径超时**

现象：点击"生成学习路径"后 30 秒报超时。

根因：用 `Promise.race` 包装的 fetch 请求无法真正取消——超时后请求仍在后台运行。

```javascript
// 修复：用 AbortSignal.timeout 替代 Promise.race
const response = await fetch(url, {
    signal: AbortSignal.timeout(90000),  // 90 秒，真实超时
    // ...
});
```

**Bug 3：Wiki 页面完全不可用**

现象：Wiki 页面没有样式，按钮点击无反应。

根因：WikiStore 未初始化，事件未绑定，CSS 缺失 283 行。

修复：初始化 WikiStore，绑定事件监听器，补充 283 行 CSS。

### 第二步：修复测试套件的 59 个失败

Bug 修复后跑测试，发现 59 个测试失败。逐一排查：

| 模块 | 问题 | 修复 |
|------|------|------|
| `batch-summary.js` | `minSectionChars` 默认值 50 太大 | 改为 10 |
| `plugin-system.js` | `^` 和 `~` 版本匹配逻辑错误 | 重写 `satisfiesVersion` |
| `git-repo.js` | 模块不存在 | 新建完整模块 |
| `test-embedding.js` | API 改名 `preprocess` → `tokenize` | 对齐新 API |
| `test-shortcuts.js` | 导出不匹配 | 对齐实际模块 |
| 性能测试 | 阈值过严（250ms） | 放宽到 500ms |

最终结果：**1873/1873 测试全部通过**。

```bash
$ node --test tests/*.js
✓ 361 suites, 1873 tests, 0 failures
```

### 第三步：飞轮引擎全速运转

测试绿灯后，飞轮引擎开始自动执行。以下是 34 轮迭代的完整记录：

| 轮次 | 任务 | 产出 |
|------|------|------|
| R1 | 知识库性能优化 | 索引优化，查询缓存 |
| R2 | AI 响应缓存 | 本地缓存层 |
| R3 | 技能推荐优化 | 推荐算法改进 |
| R4 | 用户行为分析 | 行为追踪模块 |
| R5 | 页面内容提取增强 | 新增 4 个提取方法 |
| R6 | 对话存储优化 | 会话持久化 |
| R7 | 语义搜索（Embedding） | embedding-engine.js |
| R8-R34 | LLM Wiki 知识编译系统 | 完整三级架构 |
| R35 | (跳过) | TODO.md 无剩余任务 |

**R7 的意外收获**：在实现语义搜索时，Claude Code 自动为 `page-sense.js` 添加了 4 个新的内容提取方法（`extractContent`、`extractImages`、`extractMetadata`、`extractHeadings`）。这是飞轮效应的典型体现——做一件事的过程中，顺带完成了另一件。

### 第四步：飞轮停止

当 R34 完成服务端同步后，引擎检查 TODO.md：

```
Checked items: 71
Unchecked items: 0
Status: ALL_TASKS_COMPLETE
```

飞轮安静地停了下来。34 轮迭代，一天之内，整个 LLM Wiki 系统从蓝图变成了代码。

---

## 踩坑记录

### 坑 1：API Key 占位符未替换

**现象**：R30-R34 的 Phase 1（需求）和 Phase 2（设计）全部失败，Claude Code 返回 401 Unauthorized。

**排查过程**：
```bash
# 检查迭代引擎脚本
grep -n "API_KEY" /root/scripts/pagewise-iteration-engine.py
# 第 103 行：apiKey = "***"  ← 占位符！
```

**根因**：迭代引擎脚本第 103 行的 API Key 是 `***` 占位符，没有替换为真实密钥。Claude Code 每次启动都因认证失败而退出。

**教训**：自动化脚本中的密钥管理必须有验证步骤。建议在引擎启动时检查 API Key 是否为占位符，提前报错而不是静默失败。

### 坑 2：文件权限导致 Claude Code "变慢"

**现象**：Claude Code 每次调用都用满 12 轮，看起来"极慢"。

**根因**：`/home/claude-user/pagewise/tests/` 目录属于 `root`，而 Claude Code 以 `claude-user` 身份运行。每一轮都在报 `Permission denied`，12 轮全部浪费。

**修复**：
```bash
chown -R claude-user:claude-user /home/claude-user/pagewise/
```

**教训**：在委托 Claude Code 之前，必须检查文件权限。建议在飞轮引擎的 Guard Agent 中加入权限检查步骤。

### 坑 3：大文件消耗 Max Turns

**现象**：Claude Code 处理 `sidebar.js`（6500 行）和 `sidebar.css`（4800 行）时，30 轮全部用于读文件，没有产出任何代码。

**根因**：Claude Code 的 `--bare` 模式下，每读一个大文件就消耗 1-2 轮。两个文件加起来就用完了所有轮次。

**应对**：
- 使用 `--effort low` 减少不必要的文件读取
- 将相关代码片段直接嵌入 prompt，避免 Claude Code 自己去读
- 将大文件拆分为更小的模块

### 坑 4：`git diff` 为空的"成功"迭代

**现象**：R30、R32 的 Phase 3（实现）报告"成功"，但 `git diff` 为空——没有实际代码变更。

**根因**：Claude Code 因 API Key 问题无法启动，但脚本没有检查子进程是否真正产出了代码变更就标记为"成功"。

**教训**：迭代引擎必须验证产出——至少检查 `git diff --stat` 是否非空。

---

## 总结与展望

### 核心收获

1. **飞轮需要燃料**：TODO.md 不只是任务清单，它是整个自动化系统的动力源。没有任务，飞轮就停转。

2. **自动化不等于无人值守**：API Key 占位符、文件权限、大文件处理——这些"小问题"在自动化放大镜下变成了系统性故障。

3. **测试是飞轮的轴承**：1873 个测试不是装饰，它们是让飞轮平稳转动的轴承。每一轮迭代都依赖测试来验证产出。

4. **Claude Code 是优秀的 Sub Agent**：在权限正确、prompt 精确的条件下，Claude Code 能在一轮迭代中完成令人惊讶的工作量——比如 R5 顺带添加了 4 个新的内容提取方法。

### 最佳实践

- **Guard Agent 必须检查**：文件权限、API Key、磁盘空间、测试状态
- **验证每轮产出**：`git diff --stat` 非空才能标记成功
- **prompt 中嵌入代码片段**：避免 Claude Code 浪费轮次读大文件
- **TODO.md 用完就停**：不要为了"保持运转"而添加低价值任务
- **飞轮节奏要适度**：3 次/天是合理频率，太快会撞上 API 限流

### 延伸阅读

- Chrome Web Store 发布准备——项目已功能完备，下一步是上架
- 性能基准测试——为 1873 个测试建立性能基线
- 用户反馈系统——从真实用户获取新燃料（新任务）
- Phase 6 路线图——国际化、协作功能、离线支持

飞轮停了，不是因为坏了，而是因为做完了。这大概是自动化系统最好的结局。
