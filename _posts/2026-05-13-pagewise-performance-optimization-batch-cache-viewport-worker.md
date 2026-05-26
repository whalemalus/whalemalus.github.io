---
layout: post
title: "万级书签不卡顿：PageWise 性能优化的四个杀手锏"
date: 2026-05-13
categories: DevOps
tags: ["PageWise", "JavaScript", "Chrome Extension", "性能优化"]
excerpt: "当书签数量突破万级，图谱构建、相似度计算、视口渲染都会成为性能瓶颈。R78 迭代引入批处理引擎、LRU 缓存、视口裁剪和 Worker 卸载四大优化策略。"
image: "https://whalemalus.com/file/cover-performance-optimization-key"
original_url: "https://whalemalus.com/articles/pagewise-performance-optimization-batch-cache-viewport-worker"
---

# 万级书签不卡顿：PageWise 性能优化的四个杀手锏

> **摘要**：当书签数量突破万级，图谱构建、相似度计算、视口渲染都会成为性能瓶颈。R78 迭代为 PageWise 书签系统引入了批处理引擎、LRU 缓存、视口裁剪和 Worker 卸载四大优化策略，300 行代码、20 个测试用例，全量回归零失败。
>
> **关键词**：`性能优化` `批处理` `Web Worker` `LRU 缓存` `Chrome Extension`

---

## 楔子

打开浏览器，收藏夹里躺着 8000 多个书签。点开书签图谱面板——白屏。等了 5 秒，页面终于出现，但滚动一下又卡住了。这不是虚构的场景，而是 PageWise 用户反馈的真实痛点。

书签系统从 MVP 到 V1.0，功能越来越丰富：聚类、语义搜索、学习路径、AI 推荐……但性能始终是悬在头顶的达摩克利斯之剑。当书签数量从几百增长到几千甚至上万，原本流畅的交互变得迟缓，图谱构建从毫秒级变成秒级，内存占用也在持续攀升。

R78 迭代的目标很明确：**让万级书签场景下的核心操作回到流畅体验**。

---

## 引言

性能优化不是玄学，而是工程。它需要先量化问题、再选择策略、最后验证效果。

这次迭代聚焦四个核心场景：

1. **图谱构建**：万级书签的节点和边计算
2. **索引构建**：倒排索引的批量初始化
3. **相似度计算**：书签对之间的余弦相似度
4. **视口渲染**：只渲染用户可见的节点

每个场景对应一个优化策略，下面逐一展开。

---

## 📖 目录

1. [全景地图](#1-全景地图)
2. [核心概念](#2-核心概念)
3. [实战指南](#3-实战指南)
4. [踩坑记录](#4-踩坑记录)
5. [总结与展望](#5-总结与展望)

---

## 1. 全景地图

```
┌─────────────────────────────────────────────────┐
│              BookmarkPerformanceOptimizer        │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ 批处理引擎 │  │ LRU 缓存  │  │  视口裁剪     │  │
│  │          │  │          │  │              │  │
│  │ buildGraph│  │ trimCache│  │ getVisible   │  │
│  │ Batched() │  │ ()       │  │ Nodes()      │  │
│  │          │  │          │  │              │  │
│  │ buildIndex│  │ maxSize  │  │ viewport +   │  │
│  │ Batched() │  │ 控制     │  │ padding     │  │
│  │          │  │          │  │              │  │
│  │ compute  │  │ 基于 Map  │  │ 只返回视口内  │  │
│  │ Similarity│  │ 插入序   │  │ 的节点       │  │
│  │ Batched() │  │          │  │              │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
│                                                  │
│  ┌──────────────────┐  ┌─────────────────────┐  │
│  │   Worker 卸载     │  │   性能统计           │  │
│  │                   │  │                     │  │
│  │ createWorker()    │  │ getPerformance      │  │
│  │ runInWorker()     │  │ Stats()             │  │
│  │                   │  │                     │  │
│  │ 主线程自动降级     │  │ buildTime/cacheHits │  │
│  └──────────────────┘  │ batchCount 等       │  │
│                         └─────────────────────┘  │
└─────────────────────────────────────────────────┘
```

数据流：

```
书签数据 (8000+)
    │
    ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  批处理构建   │───▶│  LRU 缓存   │───▶│  视口裁剪   │
│  (分批 yield) │    │  (自动淘汰)  │    │  (按需渲染) │
└─────────────┘    └─────────────┘    └─────────────┘
    │
    ▼ (CPU 密集操作)
┌─────────────┐
│ Worker 线程  │
│ (后台计算)   │
└─────────────┘
```

---

## 2. 核心概念

### 2.1 批处理引擎：让出主线程

JavaScript 是单线程的。当你用 `for` 循环处理 8000 个书签时，主线程被完全阻塞，UI 无法响应任何用户操作。

**解决方案**：将大批量操作拆分成小批次，每批处理完后用 `setTimeout(0)` 让出主线程，让浏览器有机会处理渲染和用户事件。

```javascript
async buildGraphBatched(bookmarks, onProgress) {
  const batchSize = 100
  for (let i = 0; i < bookmarks.length; i += batchSize) {
    const batch = bookmarks.slice(i, i + batchSize)
    this._processGraphBatch(batch)
    
    // 让出主线程，浏览器可以处理渲染
    await new Promise(resolve => setTimeout(resolve, 0))
    
    if (onProgress) {
      onProgress({ phase: 'graph', current: i + batch.length, total: bookmarks.length })
    }
  }
}
```

**类比**：想象你在搬 8000 箱货物。一次性搬完会累死（阻塞），分批搬、每搬 100 箱休息一下（yield），虽然总时间差不多，但中间可以处理其他事情（UI 响应）。

### 2.2 LRU 缓存：最近最少使用淘汰

缓存是空间换时间的经典策略。但缓存不能无限增长，需要一个淘汰机制。

**LRU (Least Recently Used)** 策略：当缓存满时，淘汰最久没被访问的条目。

```javascript
trimCache(cache, maxSize) {
  if (cache.size <= maxSize) return cache
  
  // Map 的插入序 = 迭代序
  // 最先插入的 = 最久没更新的 = 应该被淘汰的
  const keysToDelete = [...cache.keys()].slice(0, cache.size - maxSize)
  for (const key of keysToDelete) {
    cache.delete(key)
  }
  return cache
}
```

**关键洞察**：ES6 的 `Map` 保持插入顺序，这意味着遍历 `Map.keys()` 时，最先遍历到的就是最早插入的。利用这个特性，我们可以用简洁的代码实现 LRU 淘汰。

### 2.3 视口裁剪：只渲染用户看到的

书签图谱可能有 8000 个节点，但用户屏幕一次只能看到 50-100 个。渲染全部节点是巨大的浪费。

```javascript
getVisibleNodes(nodes, viewport, padding = 50) {
  return nodes.filter(node => {
    return (
      node.x >= viewport.x - padding &&
      node.x <= viewport.x + viewport.width + padding &&
      node.y >= viewport.y - padding &&
      node.y <= viewport.y + viewport.height + padding
    )
  })
}
```

`padding` 参数预加载视口边缘外的节点，避免滚动时出现空白闪烁。

### 2.4 Worker 卸载：真正的多线程

Web Worker 运行在独立线程，不阻塞主线程。适合 CPU 密集型计算（如大规模相似度计算、TF-IDF 向量化）。

```javascript
createWorker() {
  // Worker 不可用时优雅降级到主线程
  if (typeof Worker === 'undefined') return null
  try {
    return new Worker('worker.js')
  } catch {
    return null
  }
}

async runInWorker(operation, data) {
  const worker = this.createWorker()
  if (!worker) {
    // 降级：主线程执行
    return this._executeOnMainThread(operation, data)
  }
  return new Promise((resolve, reject) => {
    worker.postMessage({ operation, data })
    worker.onmessage = (e) => resolve(e.data)
    worker.onerror = (e) => reject(e)
  })
}
```

**设计要点**：Worker 创建失败时（比如在某些受限环境）自动降级到主线程，保证功能可用性。

---

## 3. 实战指南

### 3.1 性能基准测试

在优化前，先建立基准：

```javascript
const stats = optimizer.getPerformanceStats()
console.log(`图谱构建: ${stats.buildTime}ms`)
console.log(`缓存命中: ${stats.cacheHits}/${stats.cacheTotal}`)
console.log(`批次数: ${stats.batchCount}`)
```

### 3.2 批处理的批次大小选择

| 批次大小 | 适用场景 | 单批耗时 |
|----------|----------|----------|
| 50 | 高频交互（拖拽、缩放） | ~2ms |
| 100 | 一般操作（搜索、过滤） | ~5ms |
| 200 | 初始化加载 | ~10ms |

经验法则：**单批耗时不超过 16ms**（60fps 的一帧时间），用户就不会感知到卡顿。

### 3.3 视口裁剪与 Canvas 结合

在 Canvas 渲染的图谱中，视口裁剪效果最显著：

```javascript
// 渲染循环
function render() {
  const visibleNodes = optimizer.getVisibleNodes(allNodes, camera.viewport)
  // 只绘制可见节点，8000 → ~80
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (const node of visibleNodes) {
    drawNode(ctx, node)
  }
  requestAnimationFrame(render)
}
```

从渲染 8000 个节点降到 ~80 个，帧率从卡顿回到 60fps。

### 3.4 测试策略

20 个测试用例覆盖：

- **批处理**：空数组、单批、多批、进度回调、取消
- **LRU 缓存**：未满不淘汰、满时淘汰最旧、更新刷新顺序
- **视口裁剪**：空视口、全包含、部分包含、padding 扩展
- **Worker**：创建成功/失败、降级执行、取消
- **性能统计**：零值、多次操作累积

---

## 4. 踩坑记录

### 4.1 setTimeout(0) 不是真正的 0ms

`setTimeout(0)` 实际延迟约 4ms（浏览器最小延迟）。在高频场景下，累积延迟不可忽略。

**解决**：对于需要精确控制的场景，考虑 `requestIdleCallback` 或 `requestAnimationFrame`。

### 4.2 Map 的迭代序在删除后不变

删除 Map 中间的条目不会改变其他条目的迭代顺序。这是 LRU 缓存正确性的基础，但容易被误以为「删除后重新排序」。

### 4.3 Worker 的序列化开销

向 Worker 传递大数据时，`postMessage` 会进行结构化克隆（structured clone），这个过程可能很慢。

**解决**：使用 `Transferable` 对象（如 `ArrayBuffer`）实现零拷贝传输，但传输后原对象不可用。

---

## 5. 总结与展望

### 核心收获

1. **批处理是万级数据的基本功**：不改变算法复杂度，但让 UI 保持响应
2. **缓存要有上限**：无限增长的缓存比没有缓存更危险
3. **视口裁剪是最高效的优化**：从 O(n) 渲染降到 O(可见区域)
4. **降级设计很重要**：Worker 不可用时要能回到主线程

### 测试数据

- 全量回归：3112 个测试用例，0 失败
- 新增模块：20 个测试用例，全部通过
- 代码量：300 行实现代码 + 267 行测试代码

### 延伸阅读

- Chrome DevTools Performance 面板分析
- Web Worker 最佳实践
- Canvas 渲染优化技巧

---

*本文基于 PageWise 飞轮迭代 R78 实战经验整理。PageWise 是一个 Chrome 浏览器扩展，帮助用户在浏览技术网页时即时向 AI 提问，并将回答整理成结构化知识库。*
