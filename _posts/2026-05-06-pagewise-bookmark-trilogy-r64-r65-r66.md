---
layout: post
title: "一日三迭代：PageWise 书签知识体系从预览到关联的完整落地"
date: 2026-05-06
categories: DevOps
tags: []
excerpt: "2026-05-05，飞轮迭代引擎完成了 R64、R65、R66 三轮迭代，将书签系统从能看到升级到能搜索再到能关联。本文记录这次密集交付的过程与技术细节。"
image: "https://whalemalus.com/file/cover-pagewise-bookmark-trilogy-key"
header:
  teaser: "https://whalemalus.com/file/cover-pagewise-bookmark-trilogy-key"
  overlay_image: "https://whalemalus.com/file/cover-pagewise-bookmark-trilogy-key"
original_url: "https://whalemalus.com/articles/pagewise-bookmark-trilogy-r64-r65-r66"
---

# 一日三迭代：PageWise 书签知识体系从预览到关联的完整落地

> 2026-05-05，飞轮迭代引擎完成了 R64、R65、R66 三轮迭代，将书签系统从「能看到」升级到「能搜索」再到「能关联」。本文记录这次密集交付的过程与技术细节。

## 背景

智阅 PageWise 是一个纯前端的 Chrome 浏览器扩展，帮助用户在浏览技术网页时即时向 AI 提问，并将回答整理成结构化知识库。在 v2.0 发布后，书签系统成为下一个重点方向。

我们采用「飞轮迭代」方法论，通过自动化引擎驱动 Claude Code 持续交付。每个迭代遵循五阶段流程：需求分析 → 设计 → 实现 → 验证 → 回顾。Guard Agent 负责质量把关，0-100 量化评分，≥90 分才允许通过。

5 月 5 日，引擎连续完成了三轮迭代，覆盖了书签功能的三个核心层面。

## R64: 书签内容预览 BookmarkContentPreview

**模块**: `lib/bookmark-preview.js` — 231 行  
**测试**: 31 用例全绿  
**Guard 评分**: 92.15 / 100 ✅

这是书签系统的「展示层」。用户在侧边栏看到书签时，需要快速了解这个链接是什么。BookmarkContentPreview 提供三种预览模式：

| 方法 | 用途 |
|------|------|
| `extractUrlInfo(url)` | 从 URL 提取域名、路径、协议、favicon 等结构化信息 |
| `generateTextPreview(bookmark, opts)` | 纯文本预览：标题 + 域名 + 文件夹 + 标签 + 状态 |
| `generateHtmlPreview(bookmark, opts)` | HTML 卡片预览，含 XSS 转义保护 |
| `generateSnapshotPreview(bookmark, snapshot, opts)` | 从页面快照生成内容摘要 |

这是一个纯数据模块，无状态、无 I/O，单次预览生成性能 < 5ms。

**一个有趣的发现**：实现过程中，Claude Code 发现了 `_truncate` 函数的一个 Infinity 边界 bug —— `Number.isFinite(Infinity)` 返回 `false`，导致截断逻辑在极端情况下失效。最终用 `Number.MAX_SAFE_INTEGER` 替代，既安全又语义清晰。

## R65: 语义搜索 BookmarkSemanticSearch

**模块**: `lib/bookmark-semantic-search.js` — 552 行  
**测试**: 35 用例全绿  
**Guard 评分**: 93.45 / 100 ✅

有了预览，下一步是「找得到」。用户收藏了上百个书签后，靠文件夹浏览效率太低。BookmarkSemanticSearch 引入了基于 TF-IDF 的语义搜索引擎：

```
查询 → TF-IDF 向量化 → 余弦相似度计算 → 排序 → 结果
```

核心 API 设计：

- **`buildIndex(bookmarks[])`** — 全量构建 TF-IDF 词汇表和文档向量，1000 条书签 < 5 秒
- **`semanticSearch(query, opts?)`** — 纯语义搜索，< 200ms
- **`hybridSearch(query, opts?)`** — 混合搜索（关键词 + 语义），默认权重 0.6:0.4
- **`findSimilar(bookmarkId, limit?)`** — 以文搜文，余弦相似度排序

为了让搜索结果更精准，我们为书签的不同字段设置了权重：

| 字段 | 权重 | 理由 |
|------|------|------|
| title | 3.0 | 标题最能表达书签内容 |
| tags | 2.0 | 标签是用户主动标注的语义 |
| contentPreview | 1.5 | 内容预览提供上下文 |
| folderPath | 1.0 | 文件夹暗示分类 |
| url | 0.5 | URL 有辅助信息但噪声大 |

搜索引擎复用了 `EmbeddingEngine` 的 TF-IDF 核心算法，纯 ES Module 零外部依赖。

## R66: 知识关联 BookmarkKnowledgeCorrelation

**模块**: `lib/bookmark-knowledge-link.js` — 643 行  
**测试**: 30 用例全绿  
**Guard 评分**: 93.0 / 100 ✅

前两步解决了「展示」和「搜索」，R66 要解决的是「关联」—— 把书签和知识库条目连接起来，形成知识图谱的边。

关联是多维度的：

```
总关联度 = URL 匹配 (0.4) + 标题 TF-IDF 语义相似 (0.3) + 标签 Jaccard 重叠 (0.3)
```

URL 匹配采用分层策略：

| 匹配级别 | 分值 | 示例 |
|----------|------|------|
| 精确匹配 | 1.0 | 同一完整 URL |
| 路径包含 | 0.7 | 同域名 + 路径前缀匹配 |
| 同域名 | 0.3 | 同域名不同路径 |

核心 API 支持双向查询：

- **`getRelatedEntries(bookmarkId)`** — 给定书签，找关联的知识条目
- **`getRelatedBookmarks(entryId)`** — 给定知识条目，找关联的书签
- **`getCorrelationStrength(bookmarkId, entryId)`** — 查看具体关联强度分项
- **`suggestCorrelations()`** — 推荐尚未建立但高相似度的书签-条目对

## 三轮迭代的飞轮数据

| 指标 | R64 | R65 | R66 | 总计 |
|------|-----|-----|-----|------|
| 新增代码行 | 231 | 552 | 643 | **1,426** |
| 新增测试 | 31 | 35 | 30 | **96** |
| Guard 评分 | 92.15 | 93.45 | 93.0 | 均分 **92.87** |
| 测试总数 | 2,711 | 2,746 | 2,759 | +79 |
| 所有测试通过 | ✅ | ✅ | ✅ | ✅ |

迭代前测试 2,680，迭代后 2,759，净增 79 个测试用例，0 个新引入的失败。

## 技术观察

### 飞轮效应明显

到了 R66，Claude Code 对项目上下文的理解已经非常深入。它知道如何复用 `EmbeddingEngine` 的 TF-IDF 算法，知道测试文件的命名规范，知道 `EmbeddingEngine` 的实例化方式。前几轮迭代建立的代码模式，后续迭代自动复用。

### Guard 评分的一致性

三轮评分均在 92-93 分区间，说明代码质量和测试覆盖在自动化流程中是稳定的。Guard Agent 的量化审查不是走过场——它会检查 CSS/JS 类名匹配、函数签名一致性、XSS 注入风险等实际问题。

### 从预览到搜索到关联的架构层次

```
BookmarkContentPreview (展示层)
    ↓ 提供内容预览文本
BookmarkSemanticSearch (检索层)  
    ↓ 建立搜索索引
BookmarkKnowledgeCorrelation (关联层)
    ↓ 构建知识图谱
```

三层解耦，每层独立可测，上层依赖下层但下层不感知上层。

## 下一步

书签知识体系的三层基础已就绪。接下来的迭代将聚焦于：

- 书签管理 UI 集成（将三层模块接入侧边栏）
- 用户交互优化（搜索建议、关联推荐的前端展示）
- 性能基准测试（1000+ 书签场景下的端到端延迟）

---

*本文由 Hermes Agent 自动生成，基于 PageWise 飞轮迭代引擎的 R64-R66 迭代报告。*
