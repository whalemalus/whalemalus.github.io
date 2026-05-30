---
layout: post
title: "当 AI Agent 学会优雅地犯错：PageWise 统一错误处理实战"
date: 2026-05-02
categories: DevOps
tags: []
excerpt: "一个 Chrome 扩展如何从 31 处散乱的 try-catch 进化到统一的错误分类体系，顺便为 Chrome Web Store 上架清除了国际化障碍。"
image: "https://whalemalus.com/file/cover-error-handling-key"
header:
  teaser: "https://whalemalus.com/file/cover-error-handling-key"
  overlay_image: "https://whalemalus.com/file/cover-error-handling-key"
original_url: "https://whalemalus.com/articles/pagewise-unified-error-handling-r35"
---

# 当 AI Agent 学会「优雅地犯错」：PageWise 统一错误处理实战

> 一个 Chrome 扩展如何从 31 处散乱的 try-catch 进化到统一的错误分类体系，顺便为 Chrome Web Store 上架扫清了国际化障碍。

---

## 楔子

`ai-client.js` 有 31 处错误处理，`knowledge-base.js` 有 50 处。两个文件加起来 81 处 try-catch，没有一处用统一的错误分类。

这不是代码质量差——项目初期没有统一错误处理是正常的。但到了第 34 轮，81 处散乱的错误处理已经让调试变成猜谜游戏。

## 引言

PageWise 是一个 Chrome 扩展，让你在浏览技术网页时直接向 AI 提问。项目用飞轮迭代方式开发，到 R34 时功能基本完备，但积累了不少技术债。

R35 要解决两个问题：

1. 核心模块的错误处理缺乏统一分类
2. manifest.json 引用了国际化标记，但 _locales 目录不存在

这两个问题被合并为一个迭代，标记为 Complex 级别。

## 目录

- [全景地图](#全景地图)
- [核心概念](#核心概念)
- [实战指南](#实战指南)
- [踩坑记录](#踩坑记录)
- [总结](#总结)

---

## 全景地图

### 改造前的状态

核心模块的错误处理各自为政：ai-client.js 有 31 处错误处理，knowledge-base.js 有 50 处，都没有使用统一的错误分类。service-worker.js 作为后台入口，完全没有全局错误捕获。

### 质量评审分数

| 维度 | 权重 | 得分 | 说明 |
|------|------|------|------|
| 功能完整性 | 30% | 85 | 核心模块集成完成，wiki-store 留给下轮 |
| 代码质量 | 25% | 88 | 错误对象携带 `.classified` 属性，设计清晰 |
| 测试覆盖 | 25% | 78 | 1873 测试全部通过，但缺少 error-handler 集成测试 |
| 文档同步 | 10% | 90 | 四份文档齐全 |
| 安全合规 | 10% | 95 | 无硬编码密钥，权限最小化 |

加权总分：88/100 — 通过（修复一个 P1 问题后从 83 提升至 88）。

---

## 核心概念

### 统一错误分类

项目中已经存在一个 `error-handler.js` 模块（393 行），包含完整的错误分类体系（`ErrorType` 枚举和分类函数）。但这个模块只在 `sidebar.js` 中被使用，核心模块完全没有集成。

设计决策：
- `ai-client.js` 所有错误对象附加 `.classified` 属性，调用方可直接获取错误类型
- `knowledge-base.js` 的 IndexedDB 操作使用 `classifyStorageError()` 统一分类
- `service-worker.js` 安装全局错误捕获（`self.onerror` + `unhandledrejection`）

### 「先有后优」的错误处理策略

项目初期没有统一错误处理是可以接受的——过早抽象反而增加复杂度。但当错误处理代码超过 80 处时，统一分类的收益就显现了：
- 调试时可以直接看 `.classified.type` 而不是解析 error message
- 用户端可以根据错误类型显示不同的提示
- 监控时可以按错误类型聚合统计

### 国际化基础

`manifest.json` 中引用了 `__MSG_extName__` 国际化标记，但实际的 `_locales` 目录并不存在。提交 Chrome Web Store 时，扩展会显示原始 key 而非本地化文本。

创建 `_locales/en/messages.json` 和 `_locales/zh_CN/messages.json`，消除 Chrome Web Store 提交障碍。

---

## 实战指南

### 步骤 1：核心模块集成

Claude Code 接手 `ai-client.js` 和 `knowledge-base.js` 的改造。关键改动：

```javascript
// 改造前：散乱的错误处理
try {
  const response = await fetch(url, options);
  // ...
} catch (error) {
  console.error('AI request failed:', error);
  throw error;
}

// 改造后：统一分类
try {
  const response = await fetch(url, options);
  // ...
} catch (error) {
  const classified = classifyAIError(error);
  error.classified = classified;
  throw error;
}
```

`knowledge-base.js` 的改造更为复杂——涉及 50 处 IndexedDB 操作，每一处都需要用 `classifyStorageError()` 包装。

### 步骤 2：全局错误捕获

`service-worker.js` 作为 Chrome 扩展的后台入口，需要捕获所有未处理的异常：

```javascript
// 全局错误捕获
self.onerror = (message, source, lineno, colno, error) => {
  const classified = error ? classifyAIError(error) : { type: 'UNKNOWN', message };
  console.error('[Global Error]', classified);
};

self.addEventListener('unhandledrejection', (event) => {
  const classified = classifyAIError(event.reason);
  console.error('[Unhandled Rejection]', classified);
});
```

### 步骤 3：国际化文件

创建标准的 Chrome 扩展 locale 文件：

```json
// _locales/zh_CN/messages.json
{
  "extName": { "message": "智阅 PageWise" },
  "extDescription": { "message": "浏览技术网页时即时向 AI 提问，自动整理知识库" }
}
```

### 步骤 4：修复 P1 问题

Guard Agent 发现 `service-worker.js` 中有一个未使用的 `import` 语句，已移除。分数从 83 提升至 88。

---

## 踩坑记录

### 坑 1：Claude Code 的 Max Turns 不够

Complex 级别的任务（4+ 文件，架构级变更）在 25 turns 内很难一次完成。

解决方案是拆分调用：
- 第一次调用（25 turns）：完成核心模块改造
- 第二次调用（10 turns）：完成全局错误捕获
- Plan Agent 直接完成：简单文件创建

### 坑 2：测试不减少是底线

1873 个测试全部通过，零回归。这是飞轮迭代的硬规则——任何迭代都不能让测试数量下降。

P1 问题（未使用的 import）不影响测试结果，但 Guard Agent 仍然要求修复后才能通过。

---

## 总结

### 核心收获

1. **统一错误分类有临界点**：80 处以下可以各自为政，超过 80 处就需要统一分类
2. **拆分调用解决 Max Turns 限制**：Complex 任务分多次调用，每次专注一个子任务
3. **测试数量只增不减**：1873 个测试全部通过，零回归

### 最佳实践

- 调试时直接看错误类型而不是解析 message
- `service-worker.js` 必须有全局错误捕获，否则未处理异常会静默消失
- 国际化文件要在上架前创建，否则 Chrome Web Store 会显示原始 key

### 延伸阅读

- R36：将 `wiki-store.js` 和 `conversation-store.js` 也集成 error-handler
- R36：补充 error-handler 的集成测试
- 为 `_locales` 添加更多语言支持

---

*本文基于 PageWise 项目飞轮迭代 #35（R35）自动生成，经人工编辑整理。*
*飞轮迭代流程 v1.2.0 · 三层 Agent 架构（Guard + Plan + Sub）*