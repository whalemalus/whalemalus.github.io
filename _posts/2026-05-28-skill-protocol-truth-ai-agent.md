---
layout: post
title: "Skill 的协议真相：当 AI Agent 学会「照着手册干活」"
date: 2026-05-28
categories: 默认分类
tags: ["AI Agent", "Skill", "OpenAI协议", "Prompt Engineering"]
excerpt: "Skills不是什么高深的协议扩展，它就是一份写给LLM的使用手册，让LLM通过已有的工具自己照着做。但恰恰是这种简单，藏着AI Agent架构的深层智慧。"
image: "https://whalemalus.com/file/cover-skill-protocol-key"
header:
  teaser: "https://whalemalus.com/file/cover-skill-protocol-key"
  overlay_image: "https://whalemalus.com/file/cover-skill-protocol-key"
original_url: "https://whalemalus.com/articles/skill-protocol-truth-ai-agent"
---

# Skill 的协议真相：当 AI Agent 学会「照着手册干活」

> **摘要**：本文基于腾讯云开发者社区张敏的文章进行解读与扩展，结合 Hermes Agent 的工程实践，回答一个问题：Skills 到底是什么？
> 
> **关键词**：`Skill` `OpenAI Protocol` `Tool Calling` `System Prompt` `Progressive Loading`

---

## 引言

Skills 不是协议层概念。OpenAI 兼容协议里没有 "Skill" 这个字段。它是应用层的抽象，最终被 AI IDE（如 Cursor）"编译"成三种协议原语的组合：

- System/Developer Message — 把 Skill 的指令文本注入到 system prompt
- Tools Definition — 注册 Shell、Read 等工具为 tools 数组
- Multi-turn Tool Calling Loop — LLM 自主发起 tool_calls，宿主执行后把结果喂回

简单说：Skill = 动态注入的 system prompt 片段 + 预定义的 tool schema + 多轮 tool calling 循环。

## 目录

- [楔子](#楔子)
- [全景地图](#全景地图)
- [核心概念](#核心概念)
- [实战指南](#实战指南)
- [总结](#总结)

## 楔子

假设你对 Cursor 说：「帮我读一下这篇公众号文章」，附上一个 `mp.weixin.qq.com` 链接。接下来发生了什么？从 HTTP 报文级别拆解一下。

### 第 0 步：启动时的静默扫描

你还没开口，Cursor 就已经扫了 `.cursor/skills/` 目录，收集所有 Skill 的 `name` + `description`（来自 YAML frontmatter），把它们作为静态上下文塞进 system prompt。

```xml
<available_skills>
  <agent_skill fullPath="/path/to/mp-read/SKILL.md">
    Extract plain text from Tencent MP articles using a headless Chrome...
  </agent_skill>
</available_skills>
```

注意：此时 SKILL.md 的正文并没有被读取。这叫「Progressive Loading」——先放名字和描述，不浪费 token。

### 第 1 步：用户发问，触发 Skill

用户说了一句话。Cursor 构造出第一次 API 请求：

```json
{
  "model": "claude-4.6-opus",
  "messages": [
    {
      "role": "system",
      "content": "You are an AI coding assistant...\
\
<available_skills>...</available_skills>\
\
When a skill is relevant, read and follow it IMMEDIATELY..."
    },
    {
      "role": "user",
      "content": "帮我读一下这篇公众号文章：https://mp.weixin.qq.com/s/xxx"
    }
  ],
  "tools": [
    { "type": "function", "function": { "name": "Shell", ... } },
    { "type": "function", "function": { "name": "Read", ... } }
  ]
}
```

`tools` 数组是 Cursor 预定义的，不是 Skill 定义的。Skill 本身不声明工具——它只是告诉 LLM「你可以用 Read 来读文件，用 Shell 来执行命令」。

### 第 2 步：LLM 决定先读手册

LLM 看到用户提到了 `mp.weixin.qq.com`，匹配到 system prompt 中 mp-read skill 的描述，于是按照指令「先读 Skill 文件」：

```json
{
  "tool_calls": [
    {
      "id": "call_abc123",
      "type": "function",
      "function": {
        "name": "Read",
        "arguments": "{"path": "/path/to/mp-read/SKILL.md"}"
      }
    }
  ]
}
```

这就是 Skill 的「加载」——本质上就是 LLM 自己发了一次 Read tool call。没有特殊协议。

### 第 3-6 步：照着手册干活

LLM 读完 SKILL.md，有了完整的「技能说明书」。接下来按手册的指示操作：

- 前置检查 — 并行发起 `Shell("which mp-read")` 和 `Read("cookie.txt")`（OpenAI 协议支持并行 tool_calls）
- 执行核心命令 — `Shell("mp-read cookie.txt 'URL'", block_until_ms=120000)`
- 返回结果 — Shell 的 stdout 通过 `role: "tool"` 消息回传，LLM 整理后以 `role: "assistant"` 呈现给用户

整个过程 4 轮 HTTP 请求，7 次 tool_calls，完事。

## 全景地图

```
Cursor (客户端)                          LLM (服务端)
    │                                        │
    │  ┌── 启动时扫描 skill 目录 ──┐          │
    │  │  提取 name + description  │          │
    │  └──────────┬───────────────┘          │
    │             │                          │
    │  Round 1    │  POST /chat/completions  │
    │  system: "...skills摘要..."            │
    │  user: "帮我读这篇文章"                 │
    │  tools: [Shell, Read]                  │
    │  ─────────────────────────────────────>│
    │             │                          │
    │             │  assistant.tool_calls:    │
    │             │  Read(SKILL.md)           │
    │  <─────────────────────────────────────│
    │             │                          │
    │  ┌── 执行 Read ──┐                     │
    │  └───────┬───────┘                     │
    │          │                             │
    │  Round 2 │  tool: (SKILL.md 完整内容)   │
    │  ─────────────────────────────────────>│
    │          │    ← LLM 现在「学会」了      │
    │          │  assistant.tool_calls:       │
    │          │  Shell("which mp-read")      │
    │          │  Read(cookie.txt)  [并行]    │
    │  <─────────────────────────────────────│
    │          │                             │
    │  Round 3 │  tool: "/usr/local/bin/..."  │
    │          │  tool: "skey=xxx..."         │
    │  ─────────────────────────────────────>│
    │          │  assistant.tool_calls:       │
    │          │  Shell("mp-read ...")        │
    │  <─────────────────────────────────────│
    │          │                             │
    │  Round 4 │  tool: (文章全文)            │
    │  ─────────────────────────────────────>│
    │          │                             │
    │          │  assistant.content:          │
    │          │  "这篇文章的内容如下..."       │
    │  <─────────────────────────────────────│
    ▼                                        ▼
```

## 核心概念

作为 Hermes Agent Skill 体系的构建者，我觉得这个设计模式有不少值得展开聊的地方。

### 协议映射表

| Skill 概念 | 协议映射 |
|-----------|---------|
| Skill 发现（scan directories） | 纯客户端行为，不涉及协议 |
| Skill 摘要（name + description） | 注入到 `messages[0].role = "system"` 的文本中 |
| Skill 加载（读取 SKILL.md） | LLM 发起 `tool_calls: [Read(SKILL.md)]`，结果通过 `role: "tool"` 回传 |
| Skill 指令执行 | LLM 按读到的 SKILL.md 内容，自主发起后续 `tool_calls` |
| Progressive Loading | 先在 system prompt 放摘要（省 token），LLM 需要时再 Read 全文 |
| `scripts/` 目录 | LLM 通过 Shell tool call 执行脚本 |
| `references/` 目录 | LLM 通过 Read tool call 按需读取参考文档 |

### 1. 协议零侵入

Skills 完全复用了 OpenAI 协议已有的 tool calling 机制，不需要协议扩展。好处很直接：

- 兼容 OpenAI 协议的模型都能用，模型端不用改
- 支持 tool calling 的客户端都能实现——Cursor、Windsurf、Hermes Agent，实现方式差不多
- 新 Skill 加进来不会破坏已有的协议交互

这种思路在分布式系统里叫 end-to-end principle——智能放在端点（应用层），协议层保持简单。

### 2. Progressive Loading 省钱

不做 Progressive Loading，把所有 SKILL.md 全文塞进 system prompt 会怎样？拿 Hermes Agent 来算：

- 平均每个 SKILL.md 约 3000-5000 tokens
- 50+ 个 skills = 150K-250K tokens 的 system prompt
- 每次对话都得为这些 tokens 买单，哪怕 90% 的 skills 跟当前任务没关系

Progressive Loading 把成本压到 O(1)——system prompt 只放摘要（每个约 100 tokens），LLM 按需 Read 完整手册。算是信息检索里「延迟加载」思路在 prompt engineering 里的一个实用案例。

### 3. SKILL.md 写得好不好，决定了 Skill 好不好

这个很容易被忽略。既然 Skill 的效果完全取决于 SKILL.md 的文本质量：

- 写得好的 SKILL.md → LLM 精准执行，一次做对
- 写得差的 SKILL.md → LLM 反复试错，浪费 token 和时间

在 Hermes Agent 里，我摸索出来的一套 SKILL.md 结构是：触发条件（when to use）+ 具体步骤（numbered steps）+ 踩坑记录（pitfalls）+ 验证方法（verification）。其中「踩坑记录」最管用——它把人的失败经验变成 LLM 的预防性知识。

说白了就是把人的隐性知识（tacit knowledge）显性化，写成 LLM 能执行的指令。

### 4. 多轮 Tool Calling 能做的事比你想的多

文章里展示的是个简单场景（读公众号文章）。复杂场景下，多轮 tool calling 能做更多：

- 条件分支：LLM 读完 SKILL.md，根据实际情况选不同执行路径
- 错误恢复：某个 tool call 挂了，LLM 去翻 SKILL.md 的 pitfalls 章节找替代方案
- 链式调用：一个 Skill 的输出作为另一个 Skill 的输入

所以我更愿意把 Skills 理解成「Agent 的程序记忆」——不是脚本，是 LLM 在运行时可以查询、解释、灵活执行的知识库。

### 5. 为 AI 写使用手册，正在成为一种新工种

传统技术写作是给人看的，Skill 编写是给 LLM 看的。两者的写法差异不小：

| 维度 | 人类文档 | Skill 文档 (SKILL.md) |
|------|---------|----------------------|
| 读者 | 人类开发者 | LLM |
| 容错性 | 人类可以脑补上下文 | LLM 会严格按字面执行 |
| 结构 | 自由叙事 | 必须结构化（YAML frontmatter + Markdown） |
| 关键信息 | 概念解释优先 | 具体命令和参数优先 |
| 踩坑记录 | 可选 | **必须**（LLM 不会从失败中自动学习） |

这个话题值得单独展开，这里先不细说了。

## 实战指南

如果你在构建自己的 AI Agent 或 Skill 体系，以下是从 Hermes Agent 工程实践里总结的一些经验：

- Skill 不是代码，是 prompt——花时间打磨 SKILL.md 的措辞，收益比写复杂的工具代码高
- 踩坑记录最有价值——每个 pitfall 都是一次失败教训，写进 SKILL.md 就能防止 LLM 重蹈覆辙
- Progressive Loading 必须做——否则 context window 会被无用的 Skill 描述淹没
- 验证步骤不能省——在 SKILL.md 末尾写明「怎么确认做对了」，让 LLM 自己检查结果
- Skill 是迭代出来的——第一版 SKILL.md 肯定不完美，根据 LLM 的执行反馈持续改进

## 总结

### 核心收获

Skills 的协议真相其实很朴素：就是一份写给 LLM 的使用手册，让 LLM 通过已有的工具自己照着做。没有新协议，没有魔法，只有 system prompt + tool calling 的组合。

### 最佳实践

这种设计把智能放在端点，把复杂性放在文本中，让协议保持简单——和互联网的 end-to-end design principle 是同一个思路。

### 延伸阅读

当 LLM 学会「照着手册干活」，它就不再只是聊天机器人，而是一个可以被编程、可以积累经验的 Agent。编写这些手册的人——Skill 作者——会是这个生态里越来越重要的角色。