---
layout: post
title: "OpenClaw 飞书频道调优：让 AI 的思考过程不再黑盒"
date: 2026-05-04
categories: 技术教程
tags: ["OpenClaw", "飞书", "AI 网关"]
excerpt: "通过 OpenClaw 接入飞书后看不到 AI 的思考过程？排查发现是 4 个配置项缺失。本文记录完整的排查过程和配置方法。"
image: "https://whalemalus.com/file/cover-openclaw-streaming-key"
original_url: "https://whalemalus.com/articles/openclaw-feishu-streaming-config"
---

> **摘要**：通过 OpenClaw 接入飞书后，AI 回复既慢又看不到思考过程。排查发现是 4 个配置项缺失——`blockStreaming`、`thinkingDefault`、`reasoningDefault`、`verboseDefault`。本文记录完整的排查过程和配置方法。
>
> **关键词**：`OpenClaw` `飞书` `流式输出` `AI 网关` `配置调优`

---

## 楔子

周五凌晨四点，盯着飞书对话框里那个转圈的加载动画，我第 N 次产生了砸键盘的冲动。

OpenClaw 明明已经配好了，模型用的 MiMo v2.5 Pro，streaming 也开了，可每次问个问题，飞书那边就像断了网一样——十几秒没反应，然后"啪"一下把整段回复甩出来。更让人抓狂的是，你看不到 AI 在"想什么"，也看不到它调了哪些工具，就像一个黑盒子里在干活，你只能干等。

那天晚上我决定把这个问题彻底搞清楚。

## 引言

OpenClaw 是一个开源的 AI 助手网关，支持接入飞书、Telegram、Discord 等多个渠道。它的一大卖点是"流式输出"——AI 边写边发，用户不用干等。

但"流式输出"这个词在 OpenClaw 里其实有好几层含义。`streaming` 是一层，`blockStreaming` 是另一层，还有 `reasoningDefault` 和 `verboseDefault` 控制的是完全不同的东西。如果你只开了 `streaming`，大概率会跟我一样——以为配好了，其实什么都没生效。

本文记录我排查这个问题的完整过程，包括 4 个关键配置项的含义、配置方法，以及一个让我卡了很久的 schema 校验坑。

## 📖 目录

1. [全景地图](#全景地图)
2. [核心概念](#核心概念)
3. [实战指南](#实战指南)
4. [踩坑记录](#踩坑记录)
5. [总结与展望](#总结与展望)

---

## 全景地图

> 鸟瞰 OpenClaw 飞书频道的完整消息流转架构

```
┌─────────────────────────────────────────────────────────┐
│                    OpenClaw 架构                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐  │
│  │  飞书     │◄──►│ OpenClaw │◄──►│  AI 模型 (MiMo)  │  │
│  │  客户端   │    │  网关    │    │  via API 代理     │  │
│  └──────────┘    └──────────┘    └──────────────────┘  │
│       ▲               │                    │            │
│       │               ▼                    │            │
│       │     ┌──────────────────┐           │            │
│       │     │   配置文件        │           │            │
│       │     │ openclaw.json    │           │            │
│       │     ├──────────────────┤           │            │
│       │     │ channels.feishu  │           │            │
│       │     │  - streaming     │           │            │
│       │     │  - blockStreaming│           │            │
│       │     ├──────────────────┤           │            │
│       │     │ agents.defaults  │           │            │
│       │     │  - thinkingDefault│          │            │
│       │     │  - reasoningDefault│         │            │
│       │     │  - verboseDefault │          │            │
│       │     └──────────────────┘           │            │
│       │                                    │            │
│       └──── 消息输出模式取决于配置 ─────────┘            │
│                                                         │
│  消息输出的 4 种模式：                                    │
│  1. 整段回复（默认，最慢）                                │
│  2. 流式卡片预览（streaming）                             │
│  3. 分块发送（blockStreaming）                            │
│  4. 思考过程 + 工具调用（reasoning + verbose）            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 本文的学习路径

```
理解 4 种输出模式 → 区分 streaming vs blockStreaming → 配置 thinking/reasoning/verbose → 踩坑避让
```

## 核心概念

### streaming vs blockStreaming：两码事

这是我踩的第一个坑。看到飞书频道配置里有 `streaming: true`，我以为流式输出已经开了。

实际上这两个是完全不同的东西：

| 配置项 | 含义 | 效果 |
|--------|------|------|
| `streaming` | 飞书卡片的交互式流式预览 | AI 写的时候，卡片内容实时更新（类似打字效果） |
| `blockStreaming` | 分块消息发送 | AI 写完一个段落就立刻发出去，不用等整篇写完 |

打个比方：`streaming` 是让你看到厨师在切菜（实时预览），`blockStreaming` 是厨师切好一盘菜就先端上来一盘（分批上菜）。两个可以同时开，也可以只开一个。

**关键区别**：`streaming` 依赖飞书的卡片消息能力，需要客户端支持；`blockStreaming` 是服务端行为，把长消息拆成多条短消息发出去。

### thinkingDefault：控制 AI 的思考深度

这个配置项控制的是发送给 AI 模型的"思考努力程度"。值越高，AI 花在推理上的计算越多。

| 值 | 含义 |
|----|------|
| `off` | 不启用思考（默认） |
| `minimal` | 最少思考 |
| `low` | 轻度思考 |
| `medium` | 中等思考 |
| `high` | 深度思考 |
| `adaptive` | 自适应（根据问题复杂度自动调整） |

注意：这个配置依赖模型本身是否支持"思考"能力。MiMo v2.5 Pro 支持，但不是所有模型都支持。

### reasoningDefault：让思考过程可见

即使模型在"思考"，默认情况下用户是看不到思考过程的。`reasoningDefault` 控制的是是否把思考内容作为独立消息发出来。

| 值 | 效果 |
|----|------|
| `off` | 不显示思考过程（默认） |
| `on` | 思考过程作为独立消息发出，前缀 `Reasoning:` |
| `stream` | 思考过程实时流式输出 |

### verboseDefault：显示工具调用

当 AI 使用工具（搜索、执行代码、读文件等）时，默认情况下用户看不到这些操作。`verboseDefault` 控制的是工具调用的可见性。

| 值 | 效果 |
|----|------|
| `off` | 不显示工具调用（默认） |
| `on` | 工具调用作为独立消息发出（emoji + 工具名 + 参数） |
| `full` | 除了调用信息，还显示工具的输出结果 |

## 实战指南

### 步骤 1：确认当前配置

```bash
# 查看当前 OpenClaw 配置
cat ~/.openclaw/openclaw.json | python3 -m json.tool
```

重点关注两个部分：
- `channels.feishu` — 飞书频道配置
- `agents.defaults` — Agent 默认行为

### 步骤 2：启用 blockStreaming

在 `channels.feishu` 下添加 `blockStreaming`：

```json
{
  "channels": {
    "feishu": {
      "appId": "cli_xxxxxxxxxxxx",
      "streaming": true,
      "blockStreaming": true
    }
  }
}
```

或者用命令行：

```bash
openclaw config set channels.feishu.blockStreaming true
```

### 步骤 3：启用思考过程显示

```bash
# 设置思考深度为自适应
openclaw config set agents.defaults.thinkingDefault adaptive

# 启用思考过程显示
openclaw config set agents.defaults.reasoningDefault on
```

或者直接编辑配置文件：

```json
{
  "agents": {
    "defaults": {
      "model": "openai/mimo-v2.5-pro",
      "thinkingDefault": "adaptive",
      "reasoningDefault": "on",
      "verboseDefault": "on"
    }
  }
}
```

### 步骤 4：启用工具调用显示

```bash
openclaw config set agents.defaults.verboseDefault on
```

如果想看工具的完整输出（包括返回结果），用 `full`：

```bash
openclaw config set agents.defaults.verboseDefault full
```

### 步骤 5：重启网关使配置生效

```bash
# 如果是 systemd 服务
sudo systemctl restart openclaw

# 如果是 Docker
docker restart openclaw-app
```

### 验证效果

配好之后，在飞书里问 AI 一个问题，你应该能看到：

1. **思考过程**（如果 `reasoningDefault: on`）：
   ```
   Reasoning: 用户问的是一个关于 Docker 网络的问题，
   我需要先解释 bridge 网络的工作原理，然后给出配置示例...
   ```

2. **工具调用**（如果 `verboseDefault: on`）：
   ```
   🔍 web_search "Docker bridge network configuration"
   ```

3. **流式输出**（如果 `blockStreaming: true`）：回复会分段到达，不用等整篇写完。

## 踩坑记录

### 坑 1：streaming 开了但没有流式效果

**现象**：`streaming: true` 已经设置了，但飞书里还是整段回复。

**原因**：`streaming` 控制的是飞书卡片的交互式预览，需要客户端支持。如果 AI 模型的响应时间很短（几秒内完成），你可能根本感觉不到流式效果。

**解决**：同时开启 `blockStreaming: true`，这个是服务端行为，不依赖客户端。

### 坑 2：blockStreaming 设置报 schema 校验错误

**现象**：
```
channels.feishu: invalid config: must NOT have additional properties
```

**原因**：某些版本的 OpenClaw 的飞书频道配置 schema 不支持 `blockStreaming` 字段。配置文件直接编辑可以绕过校验，但 `openclaw config set` 命令会校验 schema。

**解决**：
- 方案 A：直接编辑 `~/.openclaw/openclaw.json`，手动添加字段
- 方案 B：检查 OpenClaw 版本，升级到支持该字段的版本
- 方案 C：将 `blockStreaming` 设置在 `agents.defaults` 级别而不是频道级别

### 坑 3：thinking/reasoning 配置了但看不到效果

**现象**：`reasoningDefault: on` 已设置，但飞书里没有看到 Reasoning 消息。

**原因**：`reasoningDefault` 依赖两件事：
1. 模型本身支持"思考"输出
2. `thinkingDefault` 不能是 `off`

**解决**：确保 `thinkingDefault` 设置为非 `off` 的值（如 `adaptive`），并且模型支持思考能力。

### 坑 4：verbose 消息太多，刷屏

**现象**：开了 `verboseDefault: full` 后，每个工具调用都发一条消息，对话被刷屏。

**解决**：日常使用建议用 `on`（只显示调用信息），调试时再临时切到 `full`。

## 总结与展望

### 核心收获

- OpenClaw 的"流式输出"有两层含义：`streaming`（卡片预览）和 `blockStreaming`（分块发送），两者独立控制
- 想看到 AI 的思考过程，需要同时配置 `thinkingDefault` 和 `reasoningDefault`
- 想看到工具调用，配置 `verboseDefault`
- 飞书频道的 schema 校验可能比文档描述的更严格，遇到校验错误时直接编辑配置文件

### 最佳实践

| 场景 | 推荐配置 |
|------|----------|
| 日常使用 | `blockStreaming: true`, `reasoningDefault: on`, `verboseDefault: on` |
| 调试问题 | 加上 `verboseDefault: full` |
| 深度推理 | 加上 `thinkingDefault: high` |
| 省流量/安静模式 | 全部 off，只保留 `streaming: true` |

### 延伸阅读

- [OpenClaw 官方文档 - 飞书频道配置](https://docs.openclaw.ai/channels/feishu.md)
- [OpenClaw 官方文档 - 流式输出概念](https://docs.openclaw.ai/concepts/streaming.md)
- [OpenClaw 官方文档 - 思考模式](https://docs.openclaw.ai/tools/thinking.md)
