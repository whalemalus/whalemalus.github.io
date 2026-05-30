---
layout: post
title: "Agent 生态全景：从工具接入到知识涌现的三层架构"
date: 2026-05-30
categories: 技术教程
tags: ["AI Agent", "知识管理", "架构设计"]
excerpt: "16 个 Agent 知识节点碰撞出三层架构：知识层（Wiki+Memory）、工具层（Skills+MCP）、执行层（Flywheel+Guard）。静默失败与上下文投毒的同构性、Skills vs MCP 路线之争、代码知识图谱双轨爆发——Agent 基础设施正在重组。"
image: "https://whalemalus.com/file/cover-agent-ecosystem-key"
header:
  teaser: "https://whalemalus.com/file/cover-agent-ecosystem-key"
  overlay_image: "https://whalemalus.com/file/cover-agent-ecosystem-key"
original_url: "https://whalemalus.com/articles/agent-ecosystem-three-layer-architecture"
---

# Agent 生态全景：从工具接入到知识涌现的三层架构

## 楔子

2026 年 5 月的最后一周，GitHub trending 上出现了一个诡异的现象：两个代码知识图谱项目（CodeGraph 和 Understand-Anything）合计增长 40K+ stars。与此同时，一个叫 AgentMemory 的 Agent 持久记忆项目以周增 4,444 stars 的速度狂飙。这不是巧合——AI Agent 的基础设施正在经历一场静默的重组。

## 引言

过去一个月，我的 LLM Wiki 知识库中积累了 16 个关于 Agent 的知识节点。从 PageWise 的 102 轮飞轮迭代，到 MCP vs Skills 的路线之争，从 Wuphf 的多 Agent 协作，到 A-MEM 的记忆演化理论——这些看似独立的知识点，在一次"发芽检测"中碰撞出了令人意外的连接。

这篇文章是这次知识碰撞的产物。不是教程，不是评测，而是一张 Agent 生态的全景地图——带着意外发现、矛盾张力和开放问题。

## 全景地图

Agent 基础设施可以抽象为三个同心圆层：

```
┌─────────────────────────────────────────┐
│           知识层 (Knowledge)             │
│  ┌───────────┐       ┌───────────┐      │
│  │  LLM Wiki │       │ Agent     │      │
│  │  (显式知识)│       │ Memory    │      │
│  │           │       │ (隐式知识)│      │
│  └─────┬─────┘       └─────┬─────┘      │
│        └────────┬──────────┘             │
│                 ▼                        │
│        ┌──────────────┐                  │
│        │  工具层       │                  │
│        │ Agent Skills │                  │
│        │  MCP / CLI   │                  │
│        └──────┬───────┘                  │
│               ▼                          │
│  ┌──────────────────────────┐            │
│  │       执行层              │            │
│  │ Flywheel + Guard Agent   │            │
│  │  迭代引擎 + 外部监督     │            │
│  └──────────────────────────┘            │
└─────────────────────────────────────────┘
```

**内层（执行层）**：Agent 如何工作、如何迭代、如何被监督。PageWise 的 102 轮飞轮迭代、Guard Agent 的独立监督、Silent Failure 的防御——这些是 Agent 运转的引擎。

**中层（工具层）**：Agent 用什么工具、如何接入。Agent Skills 的爆发（anthropics/skills 137K stars）、MCP vs Skills 的路线之争、CodeGraph 和 Understand-Anything 的代码知识图谱——这些是 Agent 能力的接口。

**外层（知识层）**：Agent 的知识如何积累、演化、涌现。LLM Wiki、AgentMemory、Wuphf、Funes、WeKnora、Graphiti、A-MEM——这些是 Agent 的大脑。

**关键洞察：这三个层缺一不可。** 只有执行层而没有知识层，Agent 每次从零开始；只有知识层而没有工具层，Agent 无法高效接入能力；只有工具层而没有执行层，Agent 无法持续改进。

## 核心概念

### 1. 静默失败与上下文投毒的同构性

这是我在知识碰撞中最意外的发现。

**Silent Failure**（静默失败）的定义是：Agent 执行了任务，返回"成功"，但实际上没有完成预期工作。比如 Claude Code 返回成功但没有写入文件，飞轮引擎认为完成，继续下一个任务。

**Context Poisoning**（上下文投毒）的定义是：幻觉或错误进入上下文后被反复引用，一旦投毒，很难恢复。

两者有深层同构：**静默失败是执行层面的 Context Poisoning**。当 Claude Code 返回"成功"但实际没有写入文件时，这个错误的"成功"信号进入了飞轮引擎的上下文，被当作事实引用，导致后续任务基于错误前提继续。

Guard Agent 的角色本质上是一个 **context sanitizer**——清除执行层面的错误信号。它检测 TODO 是否变化、文件是否实际修改、CI 是否绿灯，本质上是在做上下文清洗。

### 2. Agent 基础设施的"三角形"需求

从 16 个节点中可以提炼出 Agent 基础设施的三个核心支柱：

- **知识持久化**：AgentMemory（隐式知识）+ LLM Wiki（显式知识）= 让 Agent 不从零开始
- **能力模块化**：Agent Skills + MCP + CLI = 让 Agent 高效接入工具
- **迭代监督**：Flywheel + Guard Agent = 让 Agent 持续改进

**三个支柱形成正向飞轮**：知识积累 → 能力提升 → 迭代加速 → 发现新问题 → 知识再积累。

### 3. Skills vs MCP 的路线之争

2026 年 5 月，Quandri Engineering 发表了 MCP vs Skills 的实测数据：

| 维度 | MCP | Skills |
|------|-----|--------|
| Context 占用 | 始终 10.5%（77 个工具） | 仅使用时占用 |
| 加载时机 | 连接时全部加载 | 按需加载 |
| 运维可靠性 | 初始化失败、重复认证 | CLI 原生，零额外依赖 |
| 可调试性 | 锁定在 server 返回格式 | 标准 CLI 输出 |

但 Claude Code 随后推出了 Tool Search with Deferred Loading，MCP 的 context 占用问题大幅缓解（降低 85%+）。

**张力所在**：Skills 的 context 优势是否会被 MCP 的进化消解？还是两者会走向融合？

我的判断：两者不是零和博弈。最佳实践是混合策略——日常工具用 CLI，可重复工作流用 Skills，无 CLI 的 SaaS 用 MCP，生产数据库用 MCP（安全护栏不可替代）。

### 4. 代码知识图谱的双轨爆发

CodeGraph（28.7K stars）和 Understand-Anything（37.4K stars）在同一周内爆发，但方向截然不同：

- **CodeGraph**：Agent-first，预索引代码实体及其关系，Agent 查询图谱而非盲目搜索，减少 token 和 tool calls
- **Understand-Anything**：Human-first，交互式代码知识图谱，支持自然语言问答和可视化探索

两者不是竞争关系，而是同一趋势的两个面向：**代码知识图谱基础设施化**。AI 编程工具链正在从"单文件补全"进化到"全局代码理解"。

与 AgentMemory（Agent 持久记忆）结合，可以形成完整的 Agent 外部记忆系统：
- CodeGraph 解决"理解代码结构"（空间维度）
- AgentMemory 解决"记住项目知识"（时间维度）
- 两者结合 = Agent 的完整外部记忆

## 实战指南

### 在 Hermes Agent 中验证三角形架构

我们的 Hermes Agent 天然验证了这个三层架构：

**执行层**：飞轮迭代引擎 + Guard Agent 监督
```bash
# 飞轮迭代：从 TODO 取任务 → 委托 Claude Code → 验证 → 提交
# Guard Agent：独立检查 TODO 变化、文件修改、CI 状态
```

**工具层**：Skills Pattern 实现
```bash
~/.hermes/skills/           # Skills 目录
skill_view(name='xxx')      # 按需加载，不占用初始 context
terminal()                  # CLI-first 策略
```

**知识层**：LLM Wiki + Memory
```bash
~/wiki/                     # Git-native 知识库
memory(action='add')        # 跨会话记忆持久化
```

**关键验证**：Hermes Agent 的架构天然验证了 Skills Pattern 优于 MCP——`skill_view()` 按需加载，不占用初始 context，CLI-first 策略零额外依赖。

### 跟踪 AGENTS.md 标准化进程

AGENTS.md 的兴起标志着 Agent 已经成为代码的真实消费者：

| 模式 | 说明 | 案例 |
|------|------|------|
| **防御型** | 限制 agent 行为，保护项目 | SQLite（"不接受 agentic code"） |
| **赋能型** | 教导 agent 正确工作 | Funes（AGENTS.md 为入口） |

建议：
1. 监控 SQLite、Funes 等项目的 AGENTS.md 演化
2. 评估 Hermes 的 SCHEMA.md 是否需要升级为更完整的 AGENTS.md
3. 研究 Funes 的 protocol.md 模式

## 踩坑记录

### 坑 1：知识"只增不改"的根本性缺口

A-MEM 提出"记忆不是静态累积的，而是动态演化的"——新记忆可以触发对已有记忆的更新。但 LLM Wiki 的所有实现（包括我们的）都停留在"只增不改"模式。

**问题**：当新来源 ingest 时，已有页面不会被重新审视。知识库变成了一堆积累的笔记，而非演化的知识网络。

**Wuphf 的尝试**：`/lint` 检测矛盾和陈旧，但不自动修正。这比没有好，但仍然不够。

**缺失的设计**：一个"重访"机制——新内容 ingest 时，自动检查相关页面是否需要更新。Graphiti 的时序有效性窗口提供了一个思路：给每个事实一个 validity window，新数据进入时自动失效旧事实。

### 坑 2：AgentMemory 的增速暴露了需求错配

AgentMemory（18K+ stars，周增 4,444）的增长速度远超 LLM Wiki 的任何实现。这说明：

**"Agent 如何记住东西"的需求比"人类如何策展知识"更迫切。**

开发者更愿意为 Agent 的记忆付费（时间、精力），而不是为自己的知识管理付费。Wuphf 的 Notebook → Wiki Promotion 模式试图弥合这个差距：先让 Agent 自由记录（AgentMemory 风格），再筛选提升到 Wiki。

### 坑 3：MCP 的 Context 吞噬是真实的

Quandri 实测：4 个 MCP server、77 个工具 = ~21,077 tokens = Claude 200K 的 10.5%。Linear 单独就有 42 个工具定义 = ~12,807 tokens。

隐喻："10 本菜单铺满桌面，没地方放食物了。"

虽然 Claude Code 的 Deferred Loading 缓解了这个问题，但性能、调试、架构层面的论点仍然成立。MCP 仍然有效：无 CLI 的 SaaS、非开发者用户、实时双向通信、生产数据库安全护栏。

## 总结

16 个知识节点的碰撞揭示了 Agent 生态的三层架构：知识层（Wiki + Memory）、工具层（Skills + MCP）、执行层（Flywheel + Guard）。三个层缺一不可，形成正向飞轮。

最意外的发现是静默失败与上下文投毒的同构性——执行层面的错误信号本质上是一种上下文投毒，Guard Agent 是 context sanitizer。

最尖锐的矛盾是知识"只增不改"——LLM Wiki 的所有实现都停留在追加模式，缺少 A-MEM 的记忆演化能力。这是根本性的设计缺口。

最迫切的行动是深入 CodeGraph + AgentMemory 的集成场景——两者结合可能形成完整的 Agent 外部记忆系统，这是 Agent 基础设施的下一个前沿。

**开放问题**：Skills vs MCP 的终局是什么？知识涌现的自动化程度能到哪里？代码知识图谱会标准化吗？

这些问题没有答案，但值得继续探索。知识不是被检索出来的，而是被碰撞出来的。