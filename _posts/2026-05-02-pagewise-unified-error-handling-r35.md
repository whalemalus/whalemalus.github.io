---
layout: post
title: "当 AI Agent 学会优雅地犯错：PageWise 统一错误处理实战"
date: 2026-05-02
categories: DevOps
tags: []
excerpt: "一个 Chrome 扩展如何从 31 处散乱的 try-catch 进化到统一的错误分类体系，顺便为 Chrome Web Store 上架清除了国际化障碍。"
image: "https://whalemalus.com/file/cover-error-handling-key"
original_url: "https://whalemalus.com/articles/pagewise-unified-error-handling-r35"
---

# 当 AI Agent 学会「优雅地犯错」：PageWise 统一错误处理实战

> 一个 Chrome 扩展如何从 31 处散乱的 try-catch 进化到统一的错误分类体系，顺便为 Chrome Web Store 上架扫清了国际化障碍。

## 背景：错误处理的「历史债务」

PageWise 项目迭代到第 34 轮时，一个痛点浮出水面——核心模块的错误处理各自为政：

- `ai-client.js` 有 **31 处**错误处理，但没有使用统一的错误分类
- `knowledge-base.js` 有 **50 处**错误处理，同样缺乏标准化
- `service-worker.js`（后台 Service Worker）完全没有全局错误捕获

与此同时，虽然 `manifest.json` 中引用了 `__MSG_extName__` 国际化标记，但实际的 `_locales` 目录并不存在——这意味着提交 Chrome Web Store 时，扩展名称会显示为原始 key 而非本地化文本。

这两个问题被合并为迭代 #35（R35），标记为 **Complex** 级别。

## 设计决策

### 统一错误分类

项目中已经存在一个 `error-handler.js` 模块（393 行），包含完整的错误分类体系（`ErrorType` 枚举和分类函数）。但这个模块只在 `sidebar.js` 中被使用，核心模块完全没有集成。

设计决策：
- `ai-client.js` 所有错误对象附加 `.classified` 属性，调用方可直接获取错误类型
- `knowledge-base.js` 的 IndexedDB 操作使用 `classifyStorageError()` 统一分类
- `service-worker.js` 安装全局错误捕获（`self.onerror` + `unhandledrejection`）

### 国际化基础

创建 `_locales/en/messages.json` 和 `_locales/zh_CN/messages.json`，消除 Chrome Web Store 提交障碍。

## 实现过程

### 第一轮：核心模块集成

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

### 第二轮：全局错误捕获

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

### 第三轮：国际化文件

创建标准的 Chrome 扩展 locale 文件：

```json
// _locales/zh_CN/messages.json
{
  "extName": { "message": "智阅 PageWise" },
  "extDescription": { "message": "浏览技术网页时即时向 AI 提问，自动整理知识库" }
}
```

## 质量评审

Guard Agent 的量化评分：

| 维度 | 权重 | 得分 | 说明 |
|------|------|------|------|
| 功能完整性 | 30% | 85 | 核心模块集成完成，wiki-store 留给下轮 |
| 代码质量 | 25% | 88 | 错误对象携带 `.classified` 属性，设计清晰 |
| 测试覆盖 | 25% | 78 | 1873 测试全部通过，但缺少 error-handler 集成测试 |
| 文档同步 | 10% | 90 | 四份文档齐全 |
| 安全合规 | 10% | 95 | 无硬编码密钥，权限最小化 |

**加权总分：88/100** — 通过（修复一个 P1 问题后从 83 提升至 88）。

P1 问题：`service-worker.js` 中有一个未使用的 `import` 语句，已移除。

## 经验总结

### 1. 「先有后优」的错误处理策略

项目初期没有统一错误处理是可以接受的——过早抽象反而增加复杂度。但当错误处理代码超过 80 处时，统一分类的收益就显现了：
- 调试时可以直接看 `.classified.type` 而不是解析 error message
- 用户端可以根据错误类型显示不同的提示
- 监控时可以按错误类型聚合统计

### 2. Claude Code 的 Max Turns 问题

Complex 级别的任务（4+ 文件，架构级变更）在 25 turns 内很难一次完成。解决方案是**拆分调用**：
- 第一次调用（25 turns）：完成核心模块改造
- 第二次调用（10 turns）：完成全局错误捕获
- Plan Agent 直接完成：简单文件创建

### 3. 测试不减少是底线

1873 个测试全部通过，零回归。这是飞轮迭代的硬规则——任何迭代都不能让测试数量下降。

## 下一步

- R36：将 `wiki-store.js` 和 `conversation-store.js` 也集成 error-handler
- R36：补充 error-handler 的集成测试
- 为 `_locales` 添加更多语言支持

---

*本文基于 PageWise 项目飞轮迭代 #35（R35）自动生成，经人工编辑整理。*
*飞轮迭代流程 v1.2.0 · 三层 Agent 架构（Guard + Plan + Sub）*
