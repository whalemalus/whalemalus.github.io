---
layout: post
title: "从零搭建 LLM Wiki：Karpathy 的个人知识库方案实践"
date: 2026-04-30
categories: 技术教程
tags: ["LLM", "知识库", "AI Agent"]
excerpt: "不用向量数据库，不用 RAG，只用 Markdown 文件和 LLM，就能构建一个不断积累的个人知识库。本文记录了从概念理解到本地部署的完整过程。"
image: "https://whalemalus.com/file/cover-llm-wiki-2026"
original_url: "https://whalemalus.com/articles/build-llm-wiki-karpathy"
---

# 从零搭建 LLM Wiki：Karpathy 的个人知识库方案实践

> **摘要**：本文记录了从了解 Karpathy 的 LLM Wiki 概念，到理解技术原理，再到本地部署实践的完整过程。包括与传统 RAG 的对比、三层架构详解、三大操作流程，以及如何将 LLM Wiki 理念集成到 Chrome 扩展项目中的规划。

> **关键词**：`LLM Wiki` `知识库` `Karpathy` `RAG` `Markdown` `AI Agent`

---

## 楔子

前几天刷到 Andrej Karpathy 的一条推文，他分享了一个叫「LLM Wiki」的方案。核心思路很简单：**不用向量数据库，不用 RAG，只用 Markdown 文件和 LLM，就能构建一个不断积累的个人知识库。**

我第一反应是：这也太朴素了吧？但仔细读完他的 Gist 之后，发现这个思路比 RAG 优雅得多。于是我花了一天时间，从概念理解到本地部署，完整地跑通了整个流程。

这篇文章就是这个过程的记录。

---

## 1. 为什么需要 LLM Wiki？

### 1.1 RAG 的问题

大多数人用 LLM + 文档的方式是 RAG（Retrieval-Augmented Generation）：

```
你有 100 篇文章
    ↓
切成 1000 个碎片，转成向量，存入向量数据库
    ↓
每次提问：把问题转成向量 → 找最像的 5 个碎片 → 让 AI 基于碎片回答
    ↓
下次同样的问题：重复上面全部过程
```

问题在于：**知识没有积累。** 每次提问都是从零开始检索。你问一个需要综合 5 篇文章的复杂问题，AI 要每次都重新找到并拼接这些碎片。

NotebookLM、ChatGPT 文件上传、大多数 RAG 系统都是这样工作的。

### 1.2 LLM Wiki 的思路

Karpathy 的方案不同：

> 不是在查询时从原始文档中检索，而是让 LLM **增量构建并维护一个持久化的 wiki** — 一组结构化的、相互链接的 Markdown 文件，位于你和原始来源之间。当你添加一个新来源时， LLM 不只是索引它以便后续检索，而是阅读它、提取关键信息，并将其整合到现有 wiki 中 — 更新实体页面、修订主题摘要、标记新数据与旧说法矛盾的地方。知识被编译一次，然后保持更新，而不是在每次查询时重新推导。

**一句话总结：RAG 是每次考试都重新翻书，LLM Wiki 是先整理好笔记，考试时看笔记。**

---

## 2. 三层架构

LLM Wiki 只有三层，极其简洁：

```
wiki/
├── raw/              ← 第一层：原始素材（不可变）
│   ├── articles/
│   ├── papers/
│   └── transcripts/
│
├── entities/         ← 第二层：LLM 编译的 wiki 页面
├── concepts/
├── comparisons/
│
├── SCHEMA.md         ← 第三层：规则
├── index.md
└── log.md
```

### 2.1 第一层：Raw Sources（原始素材）

**不可变。** LLM 读取但永不修改。

就像图书馆的藏书 — 你不会在书上涂改，而是在笔记本上记笔记。你读了一篇好文章，保存到 `raw/articles/`；听了一个播客，保存到 `raw/transcripts/`。

每个素材文件头部有 frontmatter，记录来源 URL、导入日期、内容摘要（sha256），方便后续检测来源是否变化。

### 2.2 第二层：The Wiki（LLM 编译的页面）

**这是核心。** LLM 读完原始素材后，不是简单复制粘贴，而是：

1. **提取关键信息** — 从一篇文章中提取人物、工具、概念、观点
2. **创建独立页面** — 每个重要实体/概念一个页面
3. **建立交叉引用** — 页面之间用 `[[wikilinks]]` 互相链接
4. **综合多来源** — 如果两篇文章都提到 Docker，更新同一个 Docker 页面

举例：你扔进去一篇 Karpathy 的 LLM Wiki 文章，LLM 会编译出：

```
entities/karpathy.md              ← Karpathy 是谁
concepts/llm-wiki.md              ← LLM Wiki 是什么概念
concepts/three-layer-arch.md      ← 三层架构是什么
comparisons/rag-vs-llm-wiki.md    ← RAG 和 LLM Wiki 的对比
```

一个素材可能触发 5-15 个页面的创建/更新。**这就是知识的复利效应。**

### 2.3 第三层：The Schema（规则）

告诉 LLM 怎么维护 wiki 的「工作手册」：

- 文件命名规则（小写 + 连字符）
- 每个页面必须有 YAML frontmatter（标题、日期、标签、来源）
- 标签分类（预定义的标签列表）
- 什么时候该创建新页面（出现 2+ 次才建页）
- 矛盾怎么处理（标记，不覆盖）
- 页面超过 200 行时拆分

Schema 是你和 LLM 之间的「合同」。没有它，LLM 会按自己的想法乱来；有了它，LLM 就是一个守规矩的 wiki 维护者。

---

## 3. 三大操作

### 3.1 Ingest（导入）

你给我一篇文章，我帮你编译进 wiki：

```
你: "把这篇文章加入 wiki: https://xxx.com/article"

LLM:
  ① 下载文章内容 → 保存到 raw/articles/xxx.md
  ② 阅读文章，和你讨论要点
  ③ 检查 wiki 里是否已有相关页面
  ④ 创建/更新 wiki 页面（每个页面至少 2 个 [[wikilinks]]）
  ⑤ 更新 index.md（目录）
  ⑥ 更新 log.md（操作日志）
  ⑦ Git commit
```

### 3.2 Query（查询）

不是对原始文章提问，而是对「编译后的知识」提问：

```
你: "wiki 里 RAG 和 LLM Wiki 有什么区别？"

LLM:
  ① 读 index.md，找到相关页面
  ② 读 comparisons/rag-vs-llm-wiki.md
  ③ 综合回答，引用来源页面
  ④ 如果回答有价值 → 归档到 queries/ 目录
```

关键洞察：**好的查询结果应该被归档回 wiki。** 这样你的探索也会积累。

### 3.3 Lint（健康检查）

定期让 LLM 检查 wiki 健康状况：

- 孤立页面（没人链接到的页面）
- 断裂链接（`[[xxx]]` 指向不存在的页面）
- 过时内容（90 天没更新的页面）
- 矛盾标记（两个页面说法不一致）
- 缺失索引（文件存在但 index.md 没收录）

---

## 4. 与 RAG 的对比

| 维度 | 传统 RAG | LLM Wiki |
|------|----------|----------|
| 数据处理 | 分块 + 向量嵌入 + 向量数据库 | Markdown + LLM 直接阅读 |
| 检索方式 | 相似性搜索 | LLM 内生理解 + 结构化索引 |
| 可追溯性 | 向量嵌入是「黑箱」 | 每条声明可追溯到具体 .md 文件 |
| 维护成本 | 需要向量数据库和嵌入服务 | 只需要文件系统 |
| 知识积累 | 每次从零检索，无积累 | 持久化编译，知识不断复利 |
| 交叉引用 | 需要额外工程 | LLM 自动维护 |
| 矛盾检测 | 无法自动检测 | LLM 主动标记 |

**RAG 的优势**：处理大规模文档集合（万级+），不需 LLM 理解全部内容。

**LLM Wiki 的优势**：知识被深度理解和综合，零基础设施成本，知识不断复利。

**选择建议**：文档量巨大用 RAG，追求深度理解用 LLM Wiki，也可以混合使用。

---

## 5. 本地部署实践

### 5.1 目录结构

```bash
mkdir -p wiki/{raw/{articles,papers,transcripts,assets},entities,concepts,comparisons,queries}
```

### 5.2 三个核心文件

**SCHEMA.md** — 定义规则（标签分类、页面格式、命名约定）

**index.md** — 内容目录（所有页面的索引，按类型分组）

```markdown
# Wiki Index
> Last updated: 2026-04-30 | Total pages: 6

## Entities
- [[karpathy]] — AI 领域教育者，LLM Wiki 提出者

## Concepts
- [[llm-wiki]] — LLM 增量构建个人知识库的模式
- [[three-layer-architecture]] — 三层架构详解
- [[wiki-operations]] — 三大操作：Ingest、Query、Lint

## Comparisons
- [[rag-vs-llm-wiki]] — RAG 与 LLM Wiki 的全面对比
```

**log.md** — 操作日志（时序记录，仅追加）

### 5.3 工具链

```
LLM (Claude Code / Hermes Agent)  ← 创建和维护 wiki 页面
VS Code                           ← 阅读和浏览 wiki
Git                               ← 版本管理和同步
```

**不需要**：向量数据库、嵌入服务、服务器、特殊工具。

**就是一堆 .md 文件放在文件夹里，用 VS Code 看，用 LLM 维护。**

### 5.4 日常使用流程

```
早上: 看到一篇好文章 → 发给 LLM: "把这篇文章加入 wiki"
      → LLM ingest，编译进 wiki

下午: 研究某个技术问题 → 问 LLM: "wiki 里关于 Docker 网络有哪些内容？"
      → LLM 读 wiki 页面，综合回答

晚上: 打开 VS Code，浏览 wiki
      → 看看今天新增了什么页面
      → 点击 [[wikilinks]] 跳转关联页面

周末: 让 LLM lint 一下
      → 检查孤立页面、过时内容、矛盾标记
```

---

## 6. 集成到 Chrome 扩展项目

我们正在开发一个叫「智阅 PageWise」的 Chrome 扩展，帮助用户在浏览技术网页时向 AI 提问，并将回答整理成知识库。

当前的 PageWise 知识库是 IndexedDB 存储的 Q&A 列表 — 知识是散落的，条目之间没有关联。

我们计划将 LLM Wiki 理念集成到 PageWise 中，分三个阶段：

### Level 1：Markdown 导出

将 PageWise 知识库导出为 LLM Wiki 格式的 .md 文件：
- 每条 Q&A → 独立 .md 文件（含 YAML frontmatter）
- AI 自动提取实体/概念，生成独立页面
- 自动建立 `[[wikilinks]]` 交叉引用
- 导出目录自动 Git 管理

### Level 2：知识编译引擎

在 PageWise 内部实现「编译」逻辑：
- Q&A 自动分类（实体/概念维度）
- 基于实体共现建立深度关联
- 矛盾检测（新旧知识冲突时提示）
- 每次导入生成编译报告

### Level 3：LLM Wiki 浏览器

PageWise 成为 LLM Wiki 的 Web 前端：
- 侧边栏新增「Wiki」浏览标签
- 知识图谱增加 wiki 视图
- 一键「Ingest」编译进 wiki
- 「Ask Wiki」模式（对整个 wiki 提问）
- 与服务器 wiki 目录双向同步

---

## 7. 为什么这个方案有效

Karpathy 说得好：

> 知识库维护的繁琐之处不在于阅读或思考，而在于记账 — 更新交叉引用、保持摘要最新、标记矛盾。人类放弃 wiki 是因为维护负担增长快于价值。LLM 不会厌倦，不会忘记更新交叉引用，一次可以修改 15 个文件。wiki 之所以能保持更新，是因为维护成本接近于零。

**人的工作**：策展素材、引导分析、提出好问题、思考意义。

**LLM 的工作**：总结、交叉引用、归档、维护一致性、标记矛盾。

这个分工是自然的。人擅长判断什么重要，LLM 擅长执行繁琐的维护工作。

---

## 8. 相关资源

- Karpathy 的 LLM Wiki Gist：https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- Toolin AI 的教程解读：https://toolin.ai/blog/karpathy-llm-wiki-tutorial
- 我们的 LLM Wiki 仓库（私有）：已部署到本地服务器

---

## 总结

LLM Wiki 不是一个工具，而是一种**工作模式**：

1. **收集素材** — 读到什么好东西，扔进 `raw/`
2. **LLM 编译** — 让 LLM 读取素材，编译为结构化 wiki 页面
3. **持续积累** — 每次新素材都会更新已有页面，知识不断复利
4. **定期维护** — LLM 定期 lint，保持 wiki 健康

**比 RAG 简单，比 RAG 有效，比 RAG 便宜。**

如果你有一个 LLM Agent（Claude Code、Hermes、Cursor 等），今天就可以开始搭建你自己的 LLM Wiki。只需要创建一个文件夹，写一个 SCHEMA.md，然后开始往里面扔素材。

知识的复利，从第一个 .md 文件开始。
