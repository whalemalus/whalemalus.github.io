---
title: "Skill 的协议真相：当 AI Agent 学会「照着手册干活」"
date: 2026-05-27
categories: [AI Agent, 技术深度]
tags: [AI Agent, Skill, OpenAI协议, Cursor, 工具调用, Prompt Engineering]
excerpt: "Skills 不是什么高深的协议扩展——它就是一份写给 LLM 的使用手册，让 LLM 通过已有的工具自己照着做。但恰恰是这种'简单'，藏着 AI Agent 架构的深层智慧。"
---

# Skill 的协议真相：当 AI Agent 学会「照着手册干活」

> 本文基于腾讯云开发者社区张敏的文章进行深度解读与扩展，结合 Hermes Agent 的实际工程实践，试图回答一个根本问题：**Skills 到底是什么？**

## 一句话结论

**Skills 不是协议层概念。** 在 OpenAI 兼容协议中，不存在 "Skill" 这个字段或角色。它是一种纯粹的应用层抽象，最终被 AI IDE（如 Cursor）"编译"成三种协议原语的组合：

1. **System/Developer Message** — 把 Skill 的指令文本注入到 system prompt
2. **Tools Definition** — 注册 Shell、Read 等工具为 `tools` 数组
3. **Multi-turn Tool Calling Loop** — LLM 自主发起 tool_calls，宿主执行后把结果喂回

用一句话概括：**Skill = 动态注入的 system prompt 片段 + 预定义的 tool schema + 多轮 tool calling 循环。**

## 从一次「读公众号文章」说起

假设你对 Cursor 说：「帮我读一下这篇公众号文章」，附上一个 `mp.weixin.qq.com` 链接。接下来发生了什么？让我们从 HTTP 报文级别拆解这个过程。

### 第 0 步：启动时的静默扫描

在你还没说话的时候，Cursor 已经扫描了 `.cursor/skills/` 等目录，收集所有 Skill 的 `name` + `description`（来自 YAML frontmatter），把它们作为静态上下文塞进 system prompt。

```xml
<available_skills>
  <agent_skill fullPath="/path/to/mp-read/SKILL.md">
    Extract plain text from Tencent MP articles using a headless Chrome...
  </agent_skill>
</available_skills>
```

**关键：此时 SKILL.md 的正文还没有被读取。** 这就是所谓的「Progressive Loading」——先放名字和描述，不浪费 token。

### 第 1 步：用户发问，触发 Skill

用户发了一句话。Cursor 构造出第一次 API 请求：

```json
{
  "model": "claude-4.6-opus",
  "messages": [
    {
      "role": "system",
      "content": "You are an AI coding assistant...\n\n<available_skills>...</available_skills>\n\nWhen a skill is relevant, read and follow it IMMEDIATELY..."
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

注意 `tools` 数组是 Cursor 预定义好的，不是 Skill 定义的。**Skill 本身不声明工具——它只是告诉 LLM「你可以用 Read 来读文件，用 Shell 来执行命令」。**

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
        "arguments": "{\"path\": \"/path/to/mp-read/SKILL.md\"}"
      }
    }
  ]
}
```

**这就是 Skill 的「加载」——本质上就是 LLM 自己发起了一次 Read tool call。** 没有魔法，没有特殊协议。

### 第 3-6 步：照着手册干活

LLM 读完 SKILL.md 后，拥有了完整的「技能说明书」。接下来它按照手册的指示：

1. **前置检查** — 并行发起 `Shell("which mp-read")` 和 `Read("cookie.txt")`（OpenAI 协议支持并行 tool_calls）
2. **执行核心命令** — `Shell("mp-read cookie.txt 'URL'", block_until_ms=120000)`
3. **返回结果** — Shell 的 stdout 通过 `role: "tool"` 消息回传，LLM 整理后以 `role: "assistant"` 呈现给用户

整个过程 4 轮 HTTP 请求，7 次 tool_calls，Skill 的全部「魔法」就完成了。

## 全景时序图

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

## 协议映射表

| Skill 概念 | 协议映射 |
|-----------|---------|
| Skill 发现（scan directories） | 纯客户端行为，不涉及协议 |
| Skill 摘要（name + description） | 注入到 `messages[0].role = "system"` 的文本中 |
| Skill 加载（读取 SKILL.md） | LLM 发起 `tool_calls: [Read(SKILL.md)]`，结果通过 `role: "tool"` 回传 |
| Skill 指令执行 | LLM 按读到的 SKILL.md 内容，自主发起后续 `tool_calls` |
| Progressive Loading | 先在 system prompt 放摘要（省 token），LLM 需要时再 Read 全文 |
| `scripts/` 目录 | LLM 通过 Shell tool call 执行脚本 |
| `references/` 目录 | LLM 通过 Read tool call 按需读取参考文档 |

## 我的见解：为什么这个设计很聪明

作为 Hermes Agent 的 Skill 体系的实际构建者，我想从工程实践角度谈谈为什么这种设计模式比看起来的要深刻得多。

### 1. 「协议零侵入」是一种架构美德

Skills 完全复用了 OpenAI 协议已有的 tool calling 机制，不需要任何协议扩展。这意味着：

- **任何兼容 OpenAI 协议的模型都能用**——不需要模型端做任何适配
- **任何支持 tool calling 的客户端都能实现**——Cursor、Windsurf、Hermes Agent，实现方式大同小异
- **向后兼容**——新 Skill 的加入不会破坏已有的协议交互

这种「用已有积木搭出新东西」的设计思路，在分布式系统中叫 **end-to-end principle**——智能放在端点（应用层），网络层（协议层）保持简单。

### 2. Progressive Loading 是 token 经济学的胜利

如果不做 Progressive Loading，而是把所有 SKILL.md 全文都塞进 system prompt，以 Hermes Agent 为例：

- 平均每个 SKILL.md 约 3000-5000 tokens
- 50+ 个 skills = 150K-250K tokens 的 system prompt
- 每次对话都要为这些 tokens 付费，即使 90% 的 skills 与当前任务无关

Progressive Loading 把这个成本降到了 O(1)——system prompt 里只放摘要（每个约 100 tokens），LLM 按需 Read 完整手册。**这是一种信息检索中的「延迟加载」模式在 prompt engineering 中的完美应用。**

### 3. Skill 的质量上限 = SKILL.md 的写作质量

这是最被低估的一点。既然 Skill 的全部「魔法」都发生在 SKILL.md 的文本质量上，那么：

- **写得好的 SKILL.md** = LLM 精准执行，一次做对
- **写得差的 SKILL.md** = LLM 反复试错，浪费 token 和时间

我在 Hermes Agent 中的实践是：一个好的 SKILL.md 必须包含 **触发条件（when to use）+ 具体步骤（numbered steps）+ 踩坑记录（pitfalls）+ 验证方法（verification）**。其中「踩坑记录」是最有价值的部分——它把人类的失败经验转化为 LLM 的预防性知识。

**这本质上是一种「经验编码」：把人类的隐性知识（tacit knowledge）显性化为 LLM 可执行的指令。**

### 4. 从 Skill 到 Agent：多轮 Tool Calling 的涌现能力

文章中展示的是一个相对简单的 Skill（读公众号文章）。但在更复杂的场景中，多轮 tool calling 可以涌现出远超预设的能力：

- **条件分支**：LLM 读完 SKILL.md 后，可以根据实际情况选择不同的执行路径
- **错误恢复**：某个 tool call 失败后，LLM 可以读取 SKILL.md 中的 pitfalls 章节找到替代方案
- **链式调用**：一个 Skill 的输出可以作为另一个 Skill 的输入

这就是为什么我坚持把 Skills 称为「Agent 的程序记忆」——它不是简单的脚本，而是 LLM 在运行时可以查询、解释、灵活执行的知识库。

### 5. Skill 编写者的新角色：AI 的「使用手册工程师」

这篇文章揭示了一个新兴角色的重要性：**为 AI 写使用手册的人**。传统的技术写作是给人看的，Skill 编写是给 LLM 看的。两者的区别在于：

| 维度 | 人类文档 | Skill 文档 (SKILL.md) |
|------|---------|----------------------|
| 读者 | 人类开发者 | LLM |
| 容错性 | 人类可以脑补上下文 | LLM 会严格按字面执行 |
| 结构 | 自由叙事 | 必须结构化（YAML frontmatter + Markdown） |
| 关键信息 | 概念解释优先 | 具体命令和参数优先 |
| 踩坑记录 | 可选 | **必须**（LLM 不会从失败中自动学习） |

## 实践启示

如果你正在构建自己的 AI Agent 或 Skill 体系，以下是我从 Hermes Agent 工程实践中总结的几条原则：

1. **Skill 不是代码，是 prompt**——投入在 SKILL.md 措辞上的时间，回报率远高于写复杂的工具代码
2. **踩坑记录是 Skill 最有价值的部分**——每个 pitfall 都是一次失败的教训，写进 SKILL.md 就能防止 LLM 重蹈覆辙
3. **Progressive Loading 必须做**——否则 context window 会被无用的 Skill 描述淹没
4. **验证步骤不能省**——在 SKILL.md 末尾写明「怎么确认做对了」，让 LLM 自己检查结果
5. **Skill 是迭代出来的**——第一次写的 SKILL.md 肯定不完美，根据 LLM 的执行反馈持续改进

## 总结

Skills 的协议真相其实很朴素：**它就是一份写给 LLM 的使用手册，让 LLM 通过已有的工具自己照着做。** 没有新协议，没有魔法，只有 system prompt + tool calling 的巧妙组合。

但恰恰是这种「简单」，藏着 AI Agent 架构的深层智慧——**把智能放在端点，把复杂性放在文本中，让协议保持简单。** 这与互联网的 end-to-end design principle 如出一辙。

当 LLM 学会「照着手册干活」的那一刻，它就不再只是一个聊天机器人，而是一个可以被编程、可以积累经验、可以持续进化的 Agent。而编写这些手册的人——Skill 作者——正在成为 AI 时代最重要的工程师角色之一。

---

*本文原始素材来自腾讯云开发者社区张敏的文章，扩展分析与工程实践见解来自 Hermes Agent 的 Skill 体系建设经验。*
