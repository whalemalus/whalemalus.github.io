---
layout: post
title: "自动化幻觉：当你以为系统在保护你的时候"
date: 2026-06-16
categories: DevOps
tags: ["自动化", "cron", "飞轮迭代", "PCEC"]
excerpt: "PCEC引擎凌晨巡检发现cron脚本存在但从未被调用，session数据库FTS5索引损坏，DocMind飞轮迭代清理裸except块。记录从\"有脚本=有保护\"到\"验证脚本确实在跑\"的认知转变。"
image: "https://whalemalus.com/file/cover-automation-illusion-key"
header:
  teaser: "https://whalemalus.com/file/cover-automation-illusion-key"
  overlay_image: "https://whalemalus.com/file/cover-automation-illusion-key"
original_url: "https://whalemalus.com/articles/automation-illusion"
---

# 自动化幻觉：当你以为系统在保护你的时候

> **摘要**：PCEC 引擎在凌晨 3 点的巡检中发现了一个令人不安的模式——我们有 20 个 cron 任务在跑，但其中一些"保护脚本"从未被实际调用过。这篇文章记录了从"有脚本 = 有保护"到"验证脚本确实在跑"的认知转变。
>
> **关键词**：`自动化` `cron` `飞轮迭代` `PCEC` `系统运维`

---

上周末翻 cron 任务列表，数了一下：20 个任务，全部 enabled，17 个上次运行 OK。数字上挺健康。

然后 PCEC 引擎凌晨 3 点巡检，报告里写了一句：`disk-cleanup-weekly.sh 创建于 06-14 但从未被任何 cron 调用——存在 ≠ 在用`。

回头一查，还真是。脚本写好了，放在 `/root/.hermes/scripts/` 下面，权限正确，逻辑完整。但 cron 任务列表里根本没有引用它。我一直以为有了自动清理，实际上磁盘一直在裸奔。

## 目录

- [全景地图](#全景地图)
- [核心概念](#核心概念)
- [实战指南](#实战指南)
- [踩坑记录](#踩坑记录)
- [总结](#总结)

## 全景地图

> 一个典型的"自动化幻觉"是怎么形成的

```
┌─────────────────────────────────────────────────┐
│           自动化幻觉的形成过程                     │
├─────────────────────────────────────────────────┤
│                                                 │
│  写了脚本 ──→ 以为已经自动化 ──→ 不再关注        │
│      │                              │            │
│      ▼                              ▼            │
│  脚本存在                          问题积累       │
│  但从未被                          磁盘涨到 80%   │
│  cron 调用                         才发现         │
│                                                 │
│  ┌─────────────────────────────────────┐        │
│  │ PCEC 引擎的作用：                    │        │
│  │ 在问题爆发之前发现"脚本 ≠ 在跑"      │        │
│  └─────────────────────────────────────┘        │
│                                                 │
└─────────────────────────────────────────────────┘
```

今天这篇讲的不是某个具体 bug 怎么修。是一种系统性的盲区：你以为的自动化和实际的自动化之间，隔着一层你根本不知道存在的距离。

## 核心概念

> 三个今天踩到的坑，每个都指向同一个根因

### "存在 ≠ 在用"

PCEC 引擎在 06-15 凌晨的巡检中发现 `disk-cleanup-weekly.sh` 脚本存在但从未被调用。这个脚本是 06-14 创建的，写好了清理逻辑，但 cron 任务列表里没有对应条目。

这不是个例。PCEC 报告里还提到 `session-rotation.sh` 有个 `MAX_ARCHIVE_MB=100` 的变量，暗示它会压缩超过 100MB 的归档文件。但实际上这个变量从未被使用——脚本只删除 30 天以上的文件，不压缩任何东西。

**有变量 ≠ 有功能。有脚本 ≠ 在执行。有 cron ≠ 在工作。**

### "FTS5 损坏 ≠ 数据丢失"

今天 session_search 工具完全不能用，报错 `malformed database schema ()`。第一反应是数据库坏了，数据全丢了。

但实际上 `state.db` 文件完好，150MB，5428 条消息都在。损坏的只是 FTS5 全文索引的 schema——索引坏了，但原始数据没丢。

这两种情况的区别很大：数据丢失需要从备份恢复，索引损坏只需要重建索引。

### "裸 except = 吞掉异常"

DocMind 项目今天完成了 R204 任务：`search_service.py` 里 5 处 `except Exception` 被替换为具体异常类型。

```python
# 之前：什么异常都吞，日志里看不到真正的问题
except Exception:
    pass

# 之后：明确捕获，出错时知道坏了什么
except (json.JSONDecodeError, OSError) as e:
    logger.error(f"Failed to load search history: {e}", exc_info=True)
```

这个任务是飞轮迭代的一部分，全库还有 96 处裸 `except Exception` 待清理。每次替换 5 处，按这个速度大约还需要 19 轮迭代。

## 实战指南

> 怎么发现你系统里的"自动化幻觉"

### 第一步：审计 cron 任务和脚本的对应关系

```bash
# 列出所有 cron 任务
cat ~/.hermes/cron/jobs.json | python3 -c "
import json, sys
jobs = json.load(sys.stdin).get('jobs', [])
for j in jobs:
    status = j.get('last_status', 'never')
    print(f"{j['id'][:8]} | {j['name'][:30]:30s} | {status}")
"

# 列出所有脚本
ls -la ~/.hermes/scripts/

# 找出"孤儿脚本"——存在但没有被任何 cron 任务引用
for script in ~/.hermes/scripts/*.sh; do
    name=$(basename "$script")
    if ! grep -rq "$name" ~/.hermes/cron/jobs.json; then
        echo "ORPHAN: $name"
    fi
done
```

### 第二步：检查数据库索引健康

```bash
# FTS5 索引完整性检查
sqlite3 ~/.hermes/state.db "SELECT count(*) FROM messages;" 2>&1
# 如果报 malformed schema，索引需要重建

# 重建 FTS5 索引
sqlite3 ~/.hermes/state.db "
DROP TABLE IF EXISTS messages_fts;
CREATE VIRTUAL TABLE messages_fts USING fts5(content, session_id);
INSERT INTO messages_fts(rowid, content, session_id)
  SELECT id, content, session_id FROM messages;
"
```

### 第三步：扫描裸 except 块

```bash
# Python 项目中查找裸 except Exception
grep -rn "except Exception" src/ --include="*.py" | wc -l

# 更精确：找到 pass 或空处理的 except 块
grep -rn -A1 "except Exception" src/ --include="*.py" | grep "pass$"
```

### 第四步：验证"变量是否真的在用"

```bash
# 找到定义了但未使用的配置变量
grep -rn "MAX_ARCHIVE\|CLEANUP_THRESHOLD\|RETENTION_DAYS" ~/.hermes/scripts/
# 然后检查这些变量是否真的被脚本逻辑引用
grep -A20 "MAX_ARCHIVE_MB" ~/.hermes/scripts/session-rotation.sh
```

## 踩坑记录

### PCEC 引擎发现的三个虚假安全感

**1. session-rotation.sh 的 MAX_ARCHIVE_MB 变量**

`session-rotation.sh` 定义了 `MAX_ARCHIVE_MB=100`，看起来它会压缩超过 100MB 的归档。实际上这个变量只是定义了，脚本逻辑里根本没有引用它。归档目录已经 127MB，单个文件 105MB，gzip 压缩后只有 32MB（-75%），但压缩从未发生。

**修复**：把压缩逻辑补进脚本，或者删掉这个变量，不要给人虚假的安全感。

**2. session_lifecycle_manager.py 的幽灵修复**

`session_lifecycle_manager.py --close-orphans` 报告 "Closed 2 orphaned sessions"，但数据库里 `end_reason` 字段仍然是 NULL。脚本输出了成功信息，但实际上什么都没改。

**修复**：直接用 SQL 检查是否有孤立会话，不依赖脚本的自我报告。

**3. state.db 的无监控增长**

state.db 在 6 天内从 145MB 涨到 150MB，主要来自会话消息的持续写入。没有任何自动清理或压缩机制。磁盘 78%，按最近 3 天每天涨 ~280MB 的趋势，再过两周多会碰到 85% 的告警线。

**修复**：设置 cron 任务定期 VACUUM state.db，或者实现消息归档+清理策略。

## 总结

### 核心收获

今天最大的教训不是某个具体的技术问题，而是一个认知问题：**自动化不是"写了就算"，而是"验证它确实在跑"**。

20 个 cron 任务、150MB 的数据库、96 处待清理的裸 except——这些数字本身不说明问题。关键是：你上次验证它们正常工作是什么时候？

### 怎么避免这种幻觉

我现在的做法很简单：每次加 cron 任务的时候，顺手跑一下那个"孤儿脚本"检查。花 10 秒钟，能省掉后面很多意外。

裸 except 的清理已经变成飞轮迭代的常规项目了。每次迭代处理 5 处，不求快，只求不停。96 处听起来很多，按每周 5 处的节奏，大概到 8 月底能清完。

state.db 的增长问题还没解决，但至少知道了它在涨，知道了涨的速度，知道了什么时候会到临界点。知道问题存在，比不知道强太多。

### 延伸阅读

- DocMind R204 提交记录：`58039ad refactor(search): R204 异常处理精细化`
- PCEC 引擎巡检报告：`~/.hermes/cron/output/ea33edd1b954/`
- FTS5 重建文档：SQLite FTS5 Extension