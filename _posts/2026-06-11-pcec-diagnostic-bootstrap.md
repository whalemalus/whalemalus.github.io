---
layout: post
title: "PCEC 诊断引导脚本：把 5 次工具调用压成 1 次"
date: 2026-06-11
categories: DevOps
tags: ["PCEC", "自动化", "飞轮迭代", "Claude Code"]
excerpt: "PCEC 每小时执行一次系统诊断，原本需要 3-5 个独立工具调用、消耗 20-30K tokens。通过一个整合脚本，所有诊断合并为单次执行，每周期节省约 25K tokens。"
image: "https://whalemalus.com/file/cover-pcec-bootstrap-key"
header:
  teaser: "https://whalemalus.com/file/cover-pcec-bootstrap-key"
  overlay_image: "https://whalemalus.com/file/cover-pcec-bootstrap-key"
original_url: "https://whalemalus.com/articles/pcec-diagnostic-bootstrap"
---

# PCEC 诊断引导脚本：把 5 次工具调用压成 1 次

> **摘要**：PCEC（周期认知扩展引擎）每小时执行一次系统诊断，原本需要 3-5 个独立工具调用、消耗 20-30K tokens。通过一个整合脚本，所有诊断合并为单次执行，每周期节省约 25K tokens，每天节省约 200K tokens。
>
> **关键词**：`PCEC` `token优化` `诊断脚本` `自动化` `效率杠杆`

---

## 楔子

下午三点，PCEC 引擎准时触发。它先调用 `ecosystem-health-quickcheck` 跑系统资源检查，再调 `session_search` 搜索最近会话，接着 `cron list` 看任务状态，然后 `wiki-link grep` 查技能引用完整性，最后还要检查 GitHub Issues。五个工具调用，每个都要加载上下文、解析输出、推理决策。等这一切跑完，25K tokens 已经烧掉了，而引擎还没开始做任何"进化"工作。

这让我想到一个问题：如果诊断本身就能吃掉 30% 的 token 预算，那进化引擎的效率天花板是不是被诊断开销卡住了？

## 引言

PCEC 是 Hermes Agent 的自进化核心。每小时强制执行一次"认知扩展"，通过思维爆炸四问（推翻默认逻辑、剔除冗余流程、补齐短板漏洞、适配高并发场景）产出技能、范式或效率杠杆。

但诊断环节的开销一直是个隐性瓶颈。每次 PCEC 周期花在"了解系统状态"上的时间和 tokens，比花在"做进化决策"上的还多。本文记录了如何通过一个 bash 脚本解决这个问题。

## 目录

- [全景地图](#全景地图)
- [核心概念](#核心概念)
- [实战指南](#实战指南)
- [踩坑记录](#踩坑记录)
- [总结](#总结)

## 全景地图

> 鸟瞰 PCEC 引擎的诊断流程，理解优化前后的差异

### 优化前的调用链

```
PCEC 触发 (每小时)
  │
  ├─① ecosystem-health-quickcheck    → 系统资源（磁盘/内存/负载）
  ├─② session_search                 → 最近会话主题和问题
  ├─③ terminal: cron list            → Cron 任务健康状态
  ├─④ terminal: wiki-link grep       → 技能引用完整性
  └─⑤ terminal: gh issue check       → GitHub Issues 状态
  
  总计：5 个 tool call, ~25K tokens 诊断开销
  剩余 tokens 用于实际进化决策
```

### 优化后的调用链

```
PCEC 触发 (每小时)
  │
  └─① pcec-diagnostic-bootstrap.sh   → 8 个模块一次输出
  
  总计：1 个 tool call, ~3K tokens 诊断开销
  节省 ~22K tokens 用于实际进化决策
```

### 脚本覆盖的 8 个诊断模块

```
┌─────────────────────────────────────────┐
│         pcec-diagnostic-bootstrap.sh    │
├─────────────────────────────────────────┤
│  1. 系统资源  (磁盘/内存/负载/Swap)     │
│  2. State DB  (大小/WAL/孤儿会话)       │
│  3. Cron 任务  (总数/OK/Error)          │
│  4. PCEC 状态  (累计进化/上次运行)      │
│  5. 技能健康  (活跃数/归档数)           │
│  6. Issues    (Blockers/Wiki-link)      │
│  7. 最近周期  (最近 3 次 PCEC 产出)     │
│  8. 服务清单  (Expected vs Actual)      │
└─────────────────────────────────────────┘
```

## 核心概念

### 诊断开销的三个来源

每个 tool call 的 token 消耗不只是输出内容，还包括：

1. **上下文加载** — 技能文档、系统提示、历史对话都要塞进 context window
2. **输出解析** — LLM 需要理解每个工具的返回格式
3. **推理决策** — 基于输出做判断，决定下一步操作

一次 `ecosystem-health-quickcheck` 调用，输出可能只有 200 字，但算上上下文和推理，实际消耗 5-8K tokens。五个调用加起来，25K tokens 就这么没了。

### 整合脚本的设计思路

核心思路很简单：把五个独立的检查合并成一个 bash 脚本，一次性输出所有结果。LLM 只需要读一次输出，做一次推理。

脚本本身不复杂 — 就是把原来分散在各处的检查命令拼到一起，加上格式化的输出。但效果立竿见影：诊断开销从 25K 降到 3K，节省了 88%。

### Token 经济学

按每天 8 个 PCEC 周期计算：

| 指标 | 优化前 | 优化后 | 节省 |
|------|--------|--------|------|
| 每周期诊断 tokens | ~25K | ~3K | ~22K |
| 每天诊断 tokens | ~200K | ~24K | ~176K |
| 每月诊断 tokens | ~6M | ~720K | ~5.28M |

这些省下来的 tokens 可以用来做更多实际的进化工作 — 分析问题、创建技能、修复 bug。

## 实战指南

### 脚本实现

脚本放在 `/root/scripts/pcec-diagnostic-bootstrap.sh`，核心结构：

```bash
#!/bin/bash
# PCEC Diagnostic Bootstrap - 8 modules in 1 tool call
# Replaces 3-5 separate diagnostic calls with a single script

echo "=== PCEC Diagnostic Bootstrap ==="
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M UTC')"
echo ""

# Module 1: System Resources
echo "## 1. System Resources"
disk_pct=$(df / | awk 'NR==2{print $5}' | tr -d '%')
mem_avail=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
load_1m=$(awk '{print $1}' /proc/loadavg)
swap_used=$(free -m | awk '/Swap/{print $3}')
echo "Disk: ${disk_pct}% | Memory: ${mem_avail}MB | Load: ${load_1m} | Swap: ${swap_used}MB"

# Module 2: State DB
echo "## 2. State DB"
state_db_size=$(du -m /root/.hermes/state.db 2>/dev/null | awk '{print $1}')
echo "Size: ${state_db_size}MB"

# Module 3: Cron Jobs
echo "## 3. Cron Jobs"
python3 -c "
import json
with open('/root/.hermes/cron/jobs.json') as f:
    data = json.load(f)
jobs = data.get('jobs', data) if isinstance(data, dict) else data
ok = sum(1 for j in jobs if j.get('last_status') == 'ok')
err = sum(1 for j in jobs if j.get('last_status') == 'error')
print(f'Total: {len(jobs)}, OK: {ok}, Error: {err}')
for j in jobs:
    if j.get('last_status') == 'error':
        print(f'  ERROR: {j["name"]}')
" 2>/dev/null

# Modules 4-8: Similar pattern...
```

### 集成到 PCEC 引擎

修改 `pcec-engine` 技能的"轻量级扫描"步骤：

**优化前**（5 个 tool call）：
```
第一步：运行健康仪表盘
第二步：针对性检查 session、cron、wiki-link、issues
```

**优化后**（1 个 tool call）：
```
第一步：运行 PCEC 诊断引导脚本
  bash /root/scripts/pcec-diagnostic-bootstrap.sh
第二步：仅对 ⚠️/🔴 项做深入调查
```

### 验证脚本效果

```bash
# 运行脚本，检查输出
bash /root/scripts/pcec-diagnostic-bootstrap.sh

# 预期输出：8 个模块的状态摘要
# 如果有异常项会标记 ⚠️ 或 🔴
```

## 踩坑记录

### 坑 1：expected-services.json 格式不一致

脚本读取 `expected-services.json` 时，`intentionally_removed` 字段有的条目是 string，有的是 dict。Python 的 `set()` 操作遇到 dict 直接报 `TypeError: unhashable type: 'dict'`。

**现象**：脚本运行到 Module 8 时崩溃，报 `TypeError`。

**原因**：手动编辑 JSON 时格式不一致，有的条目写成 `{"name": "xxx", "reason": "yyy"}`，有的写成 `"xxx"`。

**修复**：在脚本中加了类型检查，dict 类型取 `name` 字段，string 类型直接用：

```python
for item in intentionally_removed:
    name = item.get('name', item) if isinstance(item, dict) else item
    removed_names.add(name)
```

### 坑 2：bash 算术运算符兼容性

脚本中用 `((issues++))` 做计数器递增，在某些 shell 环境下会报语法错误。

**现象**：脚本在 cron 环境中运行失败，但手动执行正常。

**原因**：cron 环境用的是 `/bin/sh` 而不是 `/bin/bash`，`((...))` 是 bash 特有语法。

**修复**：改用 POSIX 兼容的写法：

```bash
# 修复前
((issues++))

# 修复后
issues=$((issues + 1))
```

### 坑 3：Battle-tested 记录遗漏

在更新 pcec-engine 技能时，发现 06:01、12:01、15:00、18:00 四个周期的发现没有记录到 battle-tested 表中。这意味着这些经验可能会在下次遇到类似问题时被遗忘。

**教训**：PCEC 引擎的产出不仅要写入 state 文件，还要同步更新到对应的技能文档中。

## 总结

### 核心收获

1. **诊断开销是隐性瓶颈** — 不算不知道，一算吓一跳。5 个 tool call 的诊断开销占了 PCEC 每周期 token 预算的 30%。
2. **整合脚本是最简单的优化** — 不需要改架构，不需要新框架，一个 bash 脚本就能解决问题。
3. **Token 节省有复利效应** — 每天 176K tokens 的节省，一个月就是 5M+ tokens。

### 最佳实践

- **先量再优化** — 不要凭感觉判断开销，用数据说话。先算清楚每个环节消耗多少 tokens，再决定优化哪里。
- **脚本优于多次调用** — 如果一个检查流程需要 3+ 个 tool call，考虑合并成一个脚本。
- **POSIX 兼容性** — 脚本可能在不同环境中运行（手动、cron、subagent），用 POSIX 兼容的语法避免环境差异。
- **格式化输出** — 脚本输出要结构化、可解析，LLM 读起来效率更高。

### 延伸阅读

- PCEC 引擎完整文档：`pcec-engine` 技能
- 生态系统健康检查：`ecosystem-health-quickcheck` 技能
- 飞轮迭代方法论：`flywheel-iteration` 技能

---

*本文内容基于 2026-06-10 PCEC 周期进化引擎 21:00 UTC 的实际产出整理。*