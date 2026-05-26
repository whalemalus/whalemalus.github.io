---
layout: post
title: "PageWise 书签系统再进化：学习进度、AI 推荐与统计仪表盘"
date: 2026-05-07
categories: DevOps
tags: ["PageWise", "Chrome Extension", "飞轮迭代", "AI Agent"]
excerpt: "一天三次飞轮迭代，从学习追踪到智能推荐再到数据洞察，书签知识体系闭环成型。R67 学习进度追踪、R68 AI 智能推荐、R69 统计仪表盘，共 2709 行代码、82 个测试。"
image: "https://whalemalus.com/file/cover-bookmark-trilogy-r67-key"
original_url: "https://whalemalus.com/articles/pagewise-bookmark-knowledge-trilogy-r67-r68-r69"
---

# PageWise 书签系统再进化：学习进度、AI 推荐与统计仪表盘

> 一天三次飞轮迭代，从学习追踪到智能推荐再到数据洞察，书签知识体系闭环成型。

## 背景

在前几轮迭代中，我们已经完成了书签知识图谱（BookmarkGraph）、语义搜索（R65）、知识关联（R66）和内容预览（R64）。这些模块解决了「书签怎么组织」和「怎么找到相关知识」的问题。

但用户真正关心的还有：**我学到哪了？接下来该学什么？我的知识结构健康吗？**

2026-05-06 的三轮迭代（R67-R69）正是为了回答这三个问题。

## R67: BookmarkLearningProgress -- 学习进度追踪

**核心思路**：把书签的阅读状态（unread / reading / read）与知识条目关联起来，形成可视化的学习进度。

**设计要点**：

- 9 个 API 方法，覆盖状态管理、进度统计、历史记录
- 依赖反转：通过构造函数注入 `BookmarkStatusManager` 和 `KnowledgeBase`，便于测试
- 空数组优雅降级，不会因为没有数据而崩溃

**关键 API**：

```javascript
// 获取某书签的学习进度
const progress = learningProgress.getProgress(bookmarkId);
// { bookmarkId, status: 'reading', knowledgeEntries: [...], percentComplete: 60 }

// 获取整体学习概览
const overview = learningProgress.getOverview();
// { total, unread, reading, read, completionRate: 45.2 }
```

## R68: BookmarkAIRecommendations -- AI 智能推荐

**核心思路**：用 AI 分析用户的收藏模式，生成个性化的知识补充推荐。但关键是——**只发送统计摘要，不发送原始书签数据**，保护用户隐私。

**设计亮点**：

1. **隐私优先的 Prompt 设计**：AI 只看到 `topDomains`、`topCategories`、`readingProgress` 等统计摘要（不超过 1500 tokens），而非原始书签列表
2. **三层推荐策略**：
   - `pattern`：基于已有收藏模式推荐相似内容
   - `gap-filling`：检测知识盲区，推荐入门主题
   - `depth`：对已有强项推荐进阶内容
3. **智能降级**：AI 不可用时自动切换到基于规则的推荐，用户无感知
4. **缓存机制**：30 分钟 TTL 缓存，避免重复调用 AI

**关键 API**：

```javascript
// 先分析用户画像
const profile = recommender.analyzeProfile(bookmarks, { clusters, gapResult });

// 获取推荐（支持三种类型）
const recommendations = await recommender.getRecommendations({ type: 'gap-filling' });
// [{ type: 'gap-filling', topic: '容器化', reason: '...', confidence: 0.85 }]

// 缓存管理
recommender.clearCache();
const source = recommender.getLastSource(); // 'ai' | 'fallback'
```

**JSON 容错处理**是一个值得分享的工程实践：AI 返回的 JSON 可能被 markdown 代码块包裹、可能缺少字段、可能包含无效 type 值。我们在解析层做了完整的容错：

```javascript
// 支持 ```json ... ``` 包裹
const cleaned = raw.replace(/^```(?:json)?\s*\
?/i, '').replace(/\
?```\s*$/i, '');
// 字段校验 + 类型过滤
const valid = parsed.filter(r => r.topic && VALID_TYPES.includes(r.type));
```

## R69: BookmarkStatistics -- 统计仪表盘

**核心思路**：纯函数设计，不依赖 DOM 或 Chrome API，从书签数据中提取四个维度的统计信息。

**四个核心 API**：

| 方法 | 功能 | 返回 |
|------|------|------|
| `getTrend(granularity?)` | 按日/周/月聚合收藏趋势 | `[{period, count}]` |
| `getDistribution()` | 按文件夹分组的领域分布 | `[{name, count, percentage}]` |
| `getHeatmap()` | 7x24 活跃度热力图 | `number[7][24]` |
| `getSummary()` | 总览摘要 | `{total, uniqueDomains, topFolders, avgPerDay, streakDays}` |

**技术细节**：

- **ISO 8601 周算法**：周趋势聚合使用 ISO 标准，周一起始，避免跨年周数错误
- **UTC 一致性**：所有日期计算基于 UTC，避免时区导致的统计数据偏差
- **Streak 计算**：从今天倒推连续有收藏的天数，中断即停止
- **热力图矩阵**：`[dayOfWeek][hour]` 二维数组，Sun=0, Sat=6

```javascript
const stats = new BookmarkStatistics(bookmarks);

// 周趋势
const weekly = stats.getTrend('week');
// [{ period: '2026-W18', count: 12 }, { period: '2026-W19', count: 8 }]

// 活跃度热力图
const heatmap = stats.getHeatmap();
// heatmap[3][14] = 5  表示周三下午2点有5次收藏

// 总览
const summary = stats.getSummary();
// { total: 156, uniqueDomains: 42, topFolders: [...], avgPerDay: 3.2, streakDays: 7 }
```

## 飞轮迭代的效率

这三轮迭代的执行效率值得关注：

| 迭代 | 代码行数 | 测试数 | Guard 评分 | 耗时 |
|------|----------|--------|------------|------|
| R67 | 1048 | 27 | -- | -- |
| R68 | 1215 | 36 | 88.60 | ~25min |
| R69 | 446 | 19 | 93.25 | ~20min |
| **合计** | **2709** | **82** | -- | **~45min** |

R69 的评分从 88.60 提升到 93.25，说明飞轮迭代的「量化审查」机制确实在推动质量持续改进。

## 架构演进：从单点到闭环

```
R64 内容预览 -> R65 语义搜索 -> R66 知识关联
                                      |
R69 统计仪表盘 <- R68 AI 推荐 <- R67 学习进度
```

现在 PageWise 的书签系统形成了完整的知识闭环：

1. **采集**：书签采集器 + 内容预览
2. **组织**：主题聚类 + 标签系统 + 语义搜索
3. **关联**：知识关联引擎
4. **追踪**：学习进度 + 统计仪表盘
5. **推荐**：AI 智能推荐（隐私优先）

用户不再只是「收藏网页」，而是在构建一个有反馈、有洞察的个人知识体系。

## 下一步

- **R70**: 暗色主题（BookmarkDarkTheme）
- **R71**: 快捷键支持（BookmarkKeyboardShortcuts）
- 待修复: KnowledgePanel E2E 测试 17 个失败（pre-existing）

---

*本文由 Hermes Agent 根据飞轮迭代报告自动生成。技术细节基于 PageWise v2.x 代码库。*
