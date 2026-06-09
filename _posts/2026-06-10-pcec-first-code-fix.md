---
layout: post
title: "自进化系统的质变：PCEC 从分析报告到代码修复的 24 小时"
date: 2026-06-10
categories: DevOps
tags: ["PCEC", "AI Agent", "SQLite", "自进化系统", "飞轮迭代"]
excerpt: "一个 AI Agent 的自进化系统运行了 29 轮才发现自己一直在写文档而非修代码。本文记录了 PCEC 在一天之内完成的跨越。"
image: "https://whalemalus.com/file/cover-pcec-first-code-fix-key"
header:
  teaser: "https://whalemalus.com/file/cover-pcec-first-code-fix-key"
  overlay_image: "https://whalemalus.com/file/cover-pcec-first-code-fix-key"
original_url: "https://whalemalus.com/articles/pcec-first-code-fix"
---

# 自进化系统的质变：PCEC 从「分析报告」到「代码修复」的 24 小时

> **摘要**：一个 AI Agent 的自进化系统（PCEC），运行了 29 轮才发现自己一直在「写文档」而非「修代码」。本文记录了 PCEC 在一天之内完成的跨越：从反复分析同一个 bug，到第一次直接修改源代码并跑通测试。
>
> **关键词**：`PCEC` `自进化系统` `AI Agent` `SQLite FTS` `CJK 搜索`

---

## 楔子

2026-06-09 凌晨，Hermes Agent 的 PCEC 引擎按时启动。这是它的第 22 轮认知扩展。

它扫描了系统状态，发现负载 2.06（正常值 < 1），定位到一个 systemd 服务（pagewise-iteration）在空转。停掉它，负载降到 0.07。

然后它做了同样的事情：写了一份报告，更新了一个文档，标记了问题为「已记录」。

接下来的 15 个小时里，PCEC 又跑了 7 轮。每一轮都在重新发现同一个问题：SQLite FTS 的 trigram 分词器不支持中文搜索。每一轮都产出了一篇分析文档。但 trigram 表依然占着 85MB 空间，中文搜索依然返回 0 条结果。

直到第 18:00 那一轮，它终于做了一件不一样的事——直接改了代码。

---

## 引言

PCEC（Periodic Cognitive Expansion Cycle）是 Hermes Agent 的自进化引擎，每 3 小时运行一次。它的设计目标是「认知扩展」：发现系统问题、识别反模式、产出改进。

听起来不错。但今天暴露了一个根本缺陷：PCEC 把「认知」和「产出」搞混了。写文档是认知，改代码才是产出。

这篇文章记录了 PCEC 在 2026-06-09 这一天的经历。不是为了展示一个完美的系统，而是记录一个正在学会「真正解决问题」的系统。

---

## 目录

- [全景地图](#全景地图)
- [核心概念](#核心概念)
- [实战指南](#实战指南)
- [踩坑记录](#踩坑记录)
- [总结](#总结)

---

## 全景地图

> 鸟瞰 PCEC 的一天，理解每一轮做了什么

### 时间线

```
00:00  停掉空转服务，负载 2.06 → 0.07
03:00  合并两个健康检查脚本
06:00  发现 trigram 问题，更新文档
09:00  回填 trigram 数据（5% → 72%）
12:00  删除 trigram 表，发现它自动重建
15:00  识别「幻影重建」反模式
18:00  ★ 第一次代码级修复（hermes_state.py）
21:00  创建跨轮次持久化机制（pcec-state.json）
```

### 问题流转图

```
发现 trigram 不支持 CJK
        │
        ▼
  更新文档（06:00）──→ 回填数据（09:00）──→ 删除表（12:00）
        │                    │                    │
        ▼                    ▼                    ▼
  文档说"别删表"        数据量增加         表自动重建了
        │                    │                    │
        └────────────────────┴────────────────────┘
                             │
                             ▼
                   识别反模式（15:00）
                             │
                             ▼
                   改代码（18:00）★
                             │
                             ▼
                   CJK 搜索恢复 ✅
```

---

## 核心概念

### PCEC 是什么

PCEC 是 Hermes Agent 的自进化引擎。借鉴了认知科学中的「间隔重复」概念：每隔 3 小时强制执行一次「认知扩展」，通过「思维爆炸四问」推动系统发现问题和改进。

四问是：

1. 推翻默认逻辑——当前有哪些假设可以被挑战？
2. 剔除冗余流程——有哪些步骤可以简化或删除？
3. 补齐短板漏洞——有哪些明显的缺陷需要修复？
4. 适配高并发场景——如果负载翻倍，系统会崩吗？

### trigram 分词器的问题

SQLite FTS5 支持多种分词器。Hermes Agent 用了 `trigram` 分词器来索引会话消息。问题是：trigram 分词器只对 ASCII/Latin 字符有效，对中文（CJK）字符完全无效。

验证方法：

```sql
-- trigram 分词器：中文搜索返回 0
SELECT COUNT(*) FROM messages_fts_trigram WHERE messages_fts_trigram MATCH '系统';
-- 结果：0

-- unicode61 分词器：同样的查询返回 59 条
SELECT COUNT(*) FROM messages_fts WHERE messages_fts MATCH '系统';
-- 结果：59
```

这就是为什么 PCEC 每一轮都在「分析问题」但问题始终没解决——它在修文档，不是在修代码。

### 跨轮次记忆缺失

PCEC 每轮运行时是独立的。第 22 轮不知道第 21 轮做了什么，第 23 轮不知道第 22 轮发现了什么。

这意味着每一轮都要花 3-5 个 tool call 来「了解系统状态」——重新搜索 session、重新检查健康、重新读取之前写过的文档。

今天 8 轮 PCEC 中，至少 4 轮在 trigram 问题上重复劳动。这是最大的效率浪费。

---

## 实战指南

### 第一步：停掉空转服务

凌晨 00:00 的 PCEC 发现系统负载 2.06，定位到 `pagewise-iteration.service`。

```bash
# 检查负载
uptime
# 22:07:04 up 23 days, load average: 2.06, 2.08, 1.90

# 定位高负载进程
systemctl list-units --type=service --state=running | grep pagewise
# pagewise-iteration.service loaded active running

# 停掉并禁用
systemctl stop pagewise-iteration.service
systemctl disable pagewise-iteration.service

# 验证
uptime
# load average: 0.07, 0.56, 1.21
```

效果：负载从 2.06 降到 0.07，降幅 97%。

### 第二步：识别 trigram 问题

06:00 的 PCEC 发现 SQLite FTS 的 trigram 分词器不支持 CJK 字符。验证方法见上面的 SQL 查询。

关键数据：
- trigram 表占 85MB，占 state.db 总大小的 61%
- 中文搜索返回 0 条结果
- unicode61 分词器可以正常处理中文

### 第三步：修复代码

18:00 的 PCEC 终于动手改代码。修改了 `hermes_state.py`，在搜索路由中添加了 CJK 字符检测和 fallback 逻辑：

```python
# 当 trigram 搜索返回 0 结果且查询包含 CJK 字符时，
# 自动 fallback 到 LIKE 查询
def search_messages(self, query: str) -> list:
    # 先尝试 FTS 搜索
    results = self._fts_search(query)
    
    # 如果 FTS 返回 0 且包含 CJK 字符，fallback 到 LIKE
    if not results and self._contains_cjk(query):
        results = self._like_search(query)
    
    return results

def _contains_cjk(self, text: str) -> bool:
    """检测文本是否包含 CJK 字符"""
    for char in text:
        if '\u4e00' <= char <= '\u9fff':
            return True
    return False
```

测试结果：262 个测试全部通过。

### 第四步：建立跨轮次记忆

21:00 的 PCEC 创建了 `pcec-state.json` 文件，用于在轮次之间持久化状态：

```json
{
  "last_run_utc": "2026-06-09T21:00:00Z",
  "cumulative_evolutions": 29,
  "active_blockers": [
    {
      "id": "BLOCKER-001",
      "issue": "trigram FTS table 85MB, zero CJK value",
      "status": "BLOCKED - needs upstream code change"
    }
  ],
  "completed_today": [
    {"time": "00:00", "output": "stopped pagewise service, load 2.06→0.07"},
    {"time": "18:00", "output": "CJK trigram→LIKE fallback in hermes_state.py"}
  ],
  "anti_patterns_detected": [
    "phantom_regeneration: DROP TABLE has no lasting effect",
    "documentation_illusion: patching docs ≠ fixing code",
    "cross_cycle_amnesia: each run starts from scratch"
  ]
}
```

未来每轮 PCEC 启动时，先读取这个文件，跳过已知 blocker，直接进入新发现或产出阶段。预计节省 30% token。

---

## 踩坑记录

### 坑 1：「分析报告」≠「解决问题」

06:00 到 15:00 的 PCEC 产出全部是「分析问题 + 更新文档」。文档写得很好，分析很到位，但 trigram 表还是 85MB，CJK 搜索还是返回 0。

教训：产出必须是「状态变更」而非「认知变更」。文档是辅助，不是主产出。

### 坑 2：幻影重建

12:00 的 PCEC 删除了 trigram 表（`DROP TABLE messages_fts_trigram`），想一了百了。结果下一轮发现表又回来了。

原因是 `hermes_state.py` 的迁移代码里有 `CREATE TABLE IF NOT EXISTS`，只要迁移逻辑跑一次，表就会重建。

教训：`DROP TABLE` 在有迁移代码的系统里不是永久操作。

### 坑 3：跨轮次重复劳动

今天 8 轮 PCEC 中，至少 4 轮在 trigram 问题上重复劳动。每一轮都从零开始侦察，消耗 3-5 个 tool call 重新发现已知问题。

根因：PCEC 没有跨轮次记忆。每轮都是独立的「新」session。

教训：自进化系统需要持久化状态。单次运行的「智能」不等于持续运行的「智慧」。

### 坑 4：磁盘压力持续未解决

磁盘使用率 80%（12GB free/62GB）自 06-06 以来未改善。PCEC 每轮都在报告这个问题，但没有一轮去执行 `docker system prune -a`。

教训：反复报告同一个问题 = 没有进展。发现问题后应该设定阈值，达到阈值就自动执行清理。

---

## 总结

### 核心收获

PCEC 在这一天里完成了从「分析系统」到「修复系统」的跨越。这不是设计出来的，而是被逼出来的——反复分析同一个问题却始终不解决，本身就是一种反模式。

三个关键改变：
1. **直接改代码**：当问题根因明确指向代码缺陷时，应立即修代码，而非反复修数据/文档
2. **跨轮次记忆**：pcec-state.json 让 PCEC 不再每轮从零开始
3. **产出定义**：产出必须是「状态变更」（代码改了、数据修了、服务停了），而非「认知变更」（文档更新了、分析写好了）

### 最佳实践

- 自进化系统需要持久化状态，单次运行的「智能」不等于持续运行的「智慧」
- 问题解决的标准是「状态变更」，不是「认知变更」
- 当同一问题被报告超过 3 次时，应该触发自动修复而非再次报告

### 延伸阅读

- Hermes Agent 的 PCEC 设计理念：借鉴认知科学的「间隔重复」
- SQLite FTS5 文档：trigram vs unicode61 分词器的选择
- 系统自进化的三个层次：分析 → 文档 → 代码