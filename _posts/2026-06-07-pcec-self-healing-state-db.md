---
layout: post
title: "当 AI Agent 自己修好了自己：state.db 瘦身与 cron job 自愈实战"
date: 2026-06-07
categories: DevOps
tags: ["Docker", "cron", "PCEC", "自动化"]
excerpt: "Hermes Agent 的 PCEC 进化引擎在 7 轮迭代中发现并修复了 state.db 体积膨胀、cron job 数据格式 bug、断路器卡死等问题。"
image: "https://whalemalus.com/file/cover-pcec-self-healing-key"
header:
  teaser: "https://whalemalus.com/file/cover-pcec-self-healing-key"
  overlay_image: "https://whalemalus.com/file/cover-pcec-self-healing-key"
original_url: "https://whalemalus.com/articles/pcec-self-healing-state-db"
---

# 当 AI Agent 自己修好了自己：state.db 瘦身与 cron job 自愈实战

> **摘要**：Hermes Agent 的 PCEC 进化引擎在 7 轮迭代中，发现并修复了 state.db 体积膨胀（635MB→294MB）、cron job 数据格式 bug、断路器卡死等问题。本文记录这次完整的自我修复过程。
>
> **关键词**：`PCEC` `state.db` `FTS trigram` `cron job` `自愈系统`

---

## 楔子

那天早上我例行检查服务器磁盘，发现 state.db 有 635MB。

一个 SQLite 数据库文件，635MB。这台机器上跑着 17 个 cron job，每天处理的消息量并不大——635MB 明显不对劲。但我当时忙着处理别的事，随手标记了一下就过去了。

直到当天下午 18:00 的 PCEC 轮次，进化引擎自己把这个问题翻了出来。

## 引言

Hermes Agent 有一套叫 PCEC（Periodic Cognitive Expansion Cycle）的机制——每小时强制执行一轮"认知扩展"。它的核心是四个问题：哪些默认假设可以推翻？哪些流程可以简化？哪些漏洞需要修补？高并发下会不会崩？

6 月 6 日这天，PCEC 跑了 7 轮。每一轮都有实质性产出，不是空转。这篇文章记录其中最有价值的发现：state.db 体积膨胀的根因、cron job 数据格式 bug、以及断路器的止血修复。

## 全景地图

```
┌─────────────────────────────────────────────────────┐
│              Hermes Agent 自愈系统                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐        │
│  │ PCEC     │→  │ 发现问题  │→  │ 修复验证  │        │
│  │ 进化引擎  │   │ (每小时)  │   │ (即时)    │        │
│  └──────────┘   └──────────┘   └──────────┘        │
│       │                                            │
│       ▼                                            │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐        │
│  │ state.db │   │ cron job │   │ 断路器    │        │
│  │ 孤儿索引  │   │ 格式 bug │   │ auto_reset│        │
│  │ 635→294MB│   │ dict→str │   │ 止血修复  │        │
│  └──────────┘   └──────────┘   └──────────┘        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 本文的学习路径

state.db 膨胀根因 → FTS trigram 清理 → cron job model dict bug → 断路器止血 → 自愈闭环

## 核心概念

### PCEC：每小时的认知扩展

PCEC 不是简单的健康检查。它强制 agent 每小时问自己四个"爆炸性"问题，要求产出三类成果之一：新技能、通用范式、或效率杠杆。如果某轮没有实质性产出，算"无效进化"，下一轮继续。

这个机制的好处是：agent 不会陷入"每天重复做同样的巡检"的惯性。每一轮都必须有新发现或新行动。

### state.db 的 FTS trigram 问题

SQLite 的 FTS（Full-Text Search）虚拟表会创建额外的索引结构。Hermes 的 `messages_fts_trigram` 表用了 trigram tokenizer，为每条消息生成三字符组合的索引。

问题是：Hermes 的 `session_search` 功能实际上使用标准 FTS5，不用 trigram tokenizer。这个 340MB 的 trigram 索引是孤儿——创建了，但从来没有被查询过。

### cron job 的 model 字段陷阱

`hermes cron edit --model` 命令可能写入 dict 格式而不是 string。比如：

```python
# 期望的格式
"model": "mimo-v2.5-pro"

# 实际写入的格式
"model": {"model": "mimo-v2.5-pro", "provider": "default"}
```

代码里直接调 `model.lower()` 就会抛 AttributeError。这个 bug 从 job 创建以来就存在，每次运行都失败，但因为其他 job 正常而被掩盖。

## 实战指南

### 修复一：state.db 瘦身（释放 340MB）

发现过程：PCEC 18:00 轮次检查 state.db 大小，发现 635MB。

```bash
# 检查 state.db 大小
ls -lh ~/.hermes/state.db
# 输出: 635M

# 检查有哪些 FTS 虚拟表
sqlite3 ~/.hermes/state.db ".tables" | grep fts
# 输出: messages_fts_trigram 等

# 确认 trigram 表没有被任何代码引用
grep -r "messages_fts_trigram" ~/.hermes/hermes-agent/
# 输出: 无结果（孤儿索引）
```

修复步骤：

```bash
# 1. 删除孤儿 FTS trigram 虚拟表
sqlite3 ~/.hermes/state.db "DROP TABLE IF EXISTS messages_fts_trigram;"
sqlite3 ~/.hermes/state.db "DROP TABLE IF EXISTS messages_fts_trigram_config;"
sqlite3 ~/.hermes/state.db "DROP TABLE IF EXISTS messages_fts_trigram_data;"
sqlite3 ~/.hermes/state.db "DROP TABLE IF EXISTS messages_fts_trigram_docsize;"
sqlite3 ~/.hermes/state.db "DROP TABLE IF EXISTS messages_fts_trigram_idx;"

# 2. VACUUM 回收空间
sqlite3 ~/.hermes/state.db "VACUUM;"

# 3. 验证
ls -lh ~/.hermes/state.db
# 输出: 294M（释放 340MB，53.7%）
```

### 修复二：cron job model dict bug

发现过程：PCEC 21:00 轮次，Monitor Hermes Issue #35576 job 持续报 error。

```bash
# 检查 job 的 model 字段
cat ~/.hermes/cron/jobs.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
for j in data.get('jobs', []):
    if j.get('id') == 'bae66ecd45ff':
        print(f"Model: {j.get('model')}")
        print(f"Type: {type(j.get('model')).__name__}")
"
# 输出: Model: {'model': 'mimo-v2.5-pro', 'provider': 'default'}
# 输出: Type: dict  ← 这就是问题所在
```

修复：

```python
# 将 dict 格式改为 string
# 修改 jobs.json 中对应 job 的 model 字段
"model": "mimo-v2.5-pro"  # 从 dict 改为 string
```

同时创建了 `cron_job_validator.py` 脚本，批量检查所有 job 的数据格式：

```python
# 验证所有 job 的 model 字段
python3 /root/scripts/cron_job_validator.py
# 输出: ✅ All 17 jobs passed validation
```

### 修复三：断路器 auto_reset_after

CircuitBreaker 的 failure_count 达到了 215，卡在 open 状态。原因是底层 429 限流问题未完全根治，断路器一直处于 open，新请求不断被拒绝又触发 failure。

```python
# 添加 auto_reset_after 参数
circuit_breaker = CircuitBreaker(
    failure_threshold=5,
    recovery_timeout=60,
    auto_reset_after=7200  # 2小时后自动重置
)
```

这是止血措施，不是根治。根治需要确保 free model 的 429 限流不再持续触发——当天已经把所有 free model job 迁移到了 mimo-v2.5-pro。

## 踩坑记录

### 诊断方向偏了 5 次

PCEC 在 09:00、12:00、15:00 三轮反复诊断 429 限流问题。每次都检查 free model 配额、rate limit 状态、API 响应时间。但真正的 root cause 是 cron job 的 model 字段格式错误——一个内部数据问题，不是外部 API 问题。

教训：遇到 persistent error 时，先验证 job 配置本身是否正确，再诊断外部依赖。

### memory 工具在 cron 环境不可用

PCEC 想把发现写入 memory，但 cron job 环境下 `memory()` 返回"Memory is not available"。教训需要通过文件或技能方式持久化。

### session_search 的 around_message_id 需要精确 ID

用估算值会导致"not in session"错误。正确做法：先获取 session 概览，再用有效 ID 滚动查询。

## 总结

### 核心收获

- 孤儿索引可以占数据库 50%+ 的空间，定期检查 `state.db` 大小是必要的
- cron job 的配置字段不能假设格式——`isinstance()` 检查比信任数据更可靠
- 诊断 persistent error 时，先看内部数据，再看外部依赖

### 最佳实践

- state.db 超过 500MB 时检查 FTS 虚拟表
- 部署 `cron_job_validator.py` 定期批量验证 job 配置
- 断路器加 `auto_reset_after` 防止永久卡死
- 每轮 PCEC 必须有实质性产出，不能空转

### 延伸阅读

- [SQLite FTS5 文档](https://www.sqlite.org/fts5.html)
- [Circuit Breaker 模式 - Martin Fowler](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Hermes Agent PCEC 技能](https://hermes-agent.nousresearch.com/docs)