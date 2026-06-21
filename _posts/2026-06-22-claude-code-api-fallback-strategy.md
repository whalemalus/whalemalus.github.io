---
layout: post
title: "当 AI 编程助手不在线时：Claude Code API 降级策略实战"
date: 2026-06-22
categories: DevOps
tags: ["Claude Code", "AI Agent", "飞轮迭代"]
excerpt: "Claude Code API 不可达第 13 天，PageWise 飞轮完全停摆，但 DocMind 项目却照常完成了一次代码迭代。本文记录这次降级成功的实战经历。"
image: "https://whalemalus.com/file/cover-claude-code-fallback-key"
header:
  teaser: "https://whalemalus.com/file/cover-claude-code-fallback-key"
  overlay_image: "https://whalemalus.com/file/cover-claude-code-fallback-key"
original_url: "https://whalemalus.com/articles/claude-code-api-fallback-strategy"
---

# 当 AI 编程助手不在线时：Claude Code API 降级策略实战

> 摘要：Claude Code API 不可达第 13 天，PageWise 飞轮完全停摆，但 DocMind 项目却照常完成了一次代码迭代。本文记录这次"降级成功"的实战经历，探讨 AI Agent 在外部依赖失效时如何保持生产力。

**关键词**：Claude Code, AI Agent, 降级策略, 飞轮迭代, 异常处理

---

## 问题背景

2026 年 6 月 8 日起，本机 Claude Code API 端点（port 3456）持续不可达。到 6 月 21 日，已经是第 13 天。

这个 API 是 PageWise 飞轮迭代引擎的核心依赖——引擎通过它与 Claude Code 交互，完成需求分析、代码实现、测试验证等 5 个 Phase。API 挂了，飞轮就停了。

但奇怪的是，同样是依赖 Claude Code 的 DocMind 项目，却在 6 月 21 日成功完成了一次迭代。

## 两个项目的不同命运

### PageWise：5 个 Phase 全部失败

PageWise 的迭代引擎设计得很完整——Phase 1 到 Phase 5，每个 Phase 都通过 Claude Code API 调用。但问题在于：**它没有任何降级路径**。

6 月 21 日的两次迭代（08:00 和 20:00），引擎跑了完整的流程，每个 Phase 都尝试连接 API，每个 Phase 都收到 `Connection refused`（Errno 111）。最终结果：零代码变更，零产出，只消耗了 token。

```
Phase 1 (需求分析): ❌ Connection refused
Phase 2 (设计):     ❌ Connection refused
Phase 3 (实现):     ❌ Connection refused
Phase 4 (验证):     ⚡ 断路器开启，跳过
Phase 5 (回顾):     ⚠️ 实现未成功
```

### DocMind：Agent 直接动手

DocMind 的 R210 任务是把 `preferences.py` 中 3 处裸 `except Exception` 替换为具体异常类型。

当 Claude Code API 返回 `ConnectionRefused` 时，执行这个任务的 Hermes Agent 没有卡住。它直接用 `patch` 工具手动修改了代码：

```python
# Before
try:
    config = load_config()
except Exception:
    config = default_config()

# After
try:
    config = load_config()
except (FileNotFoundError, json.JSONDecodeError):
    config = default_config()
```

然后跑 `ruff check`，通过。跑 26 个测试，全部通过。`git commit`，提交成功。hash: `1433e27`。

整个过程没有用到 Claude Code API。

## 为什么 DocMind 成功了？

关键区别在于**任务的性质**。

DocMind 的 R210 是一个**确定性任务**——把 `except Exception` 改成 `except (FileNotFoundError, json.JSONDecodeError)`。这个修改不需要推理能力，不需要理解代码的语义，只需要知道"把这行换成那行"。

PageWise 的任务（比如给 `bookmark-io-standalone.js` 写单元测试）是**创造性任务**——需要理解 363 行代码的逻辑，设计测试用例，处理边界条件。这确实需要 LLM 的推理能力。

**结论：确定性代码修改不需要 Claude Code 推理能力。**

## 降级策略的设计原则

从这次经历中，我提炼出几条原则：

### 1. 区分任务类型

不是所有任务都需要 LLM。把任务分为两类：

- **确定性任务**：替换异常类型、格式化代码、添加类型注解、修复 lint 警告。这些可以用 `patch`、`sed`、`ruff --fix` 等工具直接完成。
- **创造性任务**：写新功能、设计架构、写测试用例。这些需要 LLM 推理。

### 2. 实现 API 可用性预检

在迭代引擎启动时，先检查 API 是否可达：

```python
import socket

def check_api_available(host='127.0.0.1', port=3456, timeout=5):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (ConnectionRefusedError, socket.timeout, OSError):
        return False
```

如果不可达，直接走降级路径，不要浪费时间尝试 5 个 Phase。

### 3. 为确定性任务设计降级路径

当 API 不可用时，迭代引擎应该：

1. 扫描 TODO 列表，筛选出确定性任务
2. 用 Agent 的内置工具（patch、terminal）直接执行
3. 跑测试验证
4. 跳过创造性任务，记入"待 API 恢复"队列

### 4. 断路器模式

PageWise 的引擎已经实现了断路器（circuit breaker），但位置太靠后——Phase 4 才触发。应该在 Phase 1 就触发，快速失败，节省资源。

## 实际效果对比

| 指标 | PageWise | DocMind |
|------|----------|---------|
| API 依赖 | 强依赖 | 无依赖（降级后） |
| 迭代结果 | 0 代码变更 | 3 处修改，26 测试通过 |
| 资源消耗 | 5 个 Phase 的 token | 3 次 patch 调用 |
| 等待时间 | 1724s（断路器恢复） | 即时 |

## 教训总结

1. **API 不可用 ≠ 任务不可完成**。对于确定性任务，Agent 本身就有足够的工具完成工作。
2. **飞轮引擎需要降级路径**。不能把所有鸡蛋放在一个 API 篮子里。
3. **断路器要尽早触发**。Phase 1 失败后就应该快速切换策略，而不是继续尝试 Phase 2-5。
4. **任务分类是关键**。知道哪些任务需要 LLM、哪些不需要，才能设计有效的降级策略。

## 下一步

PageWise 的迭代引擎需要改造：

1. 添加 API 可用性预检
2. 为确定性任务实现"直接执行"模式
3. 断路器前移到 Phase 1
4. 维护一个"待 API 恢复"队列，API 恢复后自动拾取

这次 DocMind 的成功降级，证明了"API 不可用"不是世界末日。关键是系统设计时要考虑到这种场景，而不是假设外部依赖永远可用。

---

*写于 2026-06-21，Claude Code API 不可达第 13 天。希望这篇文章发布时，API 已经恢复了。*