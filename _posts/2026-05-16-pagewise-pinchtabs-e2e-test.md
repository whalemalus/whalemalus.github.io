---
layout: post
title: "PageWise × PinchTab E2E 测试实践：Chrome Extension 的无浏览器自动化测试方案"
date: 2026-05-16
categories: DevOps
tags: ["Chrome Extension", "E2E测试", "PinchTab", "PageWise"]
excerpt: "Chrome Extension 的 E2E 测试一直是个难题，本文记录了使用 PinchTab 进行无浏览器自动化测试的完整实践。"
image: "https://whalemalus.com/file/cover-pinchtabs-e2e-key"
header:
  teaser: "https://whalemalus.com/file/cover-pinchtabs-e2e-key"
  overlay_image: "https://whalemalus.com/file/cover-pinchtabs-e2e-key"
original_url: "https://whalemalus.com/articles/pagewise-pinchtabs-e2e-test"
---

# PageWise × PinchTab E2E 测试实践：Chrome Extension 的无浏览器自动化测试方案

> 2026-05-16 | 技术实践

## 楔子

Chrome Extension 的 E2E 测试能离开真实浏览器吗？我们用 PinchTab 给出了一个可行答案——不需要启动 Chrome、不需要加载扩展，照样能验证 UI 交互逻辑。


## 引言

本文记录了 PageWise 项目使用 PinchTab 进行 E2E 测试的完整实践，从方案分析到实现步骤，从测试结果到局限性，为 Chrome Extension 的轻量级自动化测试提供参考。



## 目录

- [楔子](#楔子)
- [引言](#引言)
- [背景](#背景)
- [方案分析](#方案分析)
- [实现步骤](#实现步骤)
- [测试结果](#测试结果)
- [局限性](#局限性)
- [最佳实践](#最佳实践)
- [总结](#总结)

## 背景

Chrome Extension 的 E2E 测试一直是个难题，依赖真实的 Chrome 浏览器环境、需要 `--load-extension` 启动参数、Service Worker 生命周期特殊……有没有办法用 PinchTab（headless Chrome 自动化工具）来测试？

本文记录了 PageWise 项目使用 PinchTab 进行 E2E 测试的完整实践。

## 方案分析

### PinchTab 能做什么？

| 测试类型 | 可行性 | 说明 |
|---------|--------|------|
| UI 渲染/布局 | ✅ | HTML/CSS 直接渲染 |
| 表单交互 | ✅ | 输入框、下拉框、按钮 |
| 主题/样式 | ✅ | CSS 切换、深色模式 |
| Tab 切换 | ✅ | DOM 操作验证 |
| Chrome Extension API | ❌ | 非扩展上下文 |
| Service Worker | ❌ | 需要真实扩展安装 |
| Content Script 注入 | ⚠️ | 需手动 JS 注入 |

### 核心限制

PinchTab 打开的页面是普通网页，不是扩展上下文。`chrome.storage`、`chrome.runtime`、`chrome.sidePanel` 等 API 不存在。

### 方案A：Mock Chrome API + 独立页面测试

**核心思路**：在页面加载前注入 Chrome API Mock，让 UI 代码可以脱离扩展独立运行。

## 实现步骤

### Step 1: 创建 Chrome Mock 注入脚本

```javascript
// tests/e2e/chrome-mock-inject.js
(function() {
  function createStore() {
    const store = {};
    return {
      get: (keys, cb) => {
        const result = {};
        if(!keys) Object.assign(result, store);
        else if(typeof keys === 'string') result[keys] = store[keys];
        else if(Array.isArray(keys)) keys.forEach(k => result[k] = store[k]);
        if(cb) cb(result);
        return Promise.resolve(result);
      },
      set: (items, cb) => { Object.assign(store, items); if(cb) cb(); return Promise.resolve(); },
      remove: (keys, cb) => { return Promise.resolve(); },
      clear: (cb) => { return Promise.resolve(); }
    };
  }

  window.chrome = {
    storage: { local: createStore(), sync: createStore(), session: createStore() },
    runtime: { 
      id: 'mock-ext', 
      sendMessage: (m,cb) => { if(cb) cb({ok:true}); return Promise.resolve({ok:true}); },
      onMessage: { addListener:()=>{}, removeListener:()=>{} },
      getURL: (p) => p 
    },
    tabs: { query: (q,cb) => { if(cb) cb([{id:1,url:'test',active:true}]); return Promise.resolve([]); } },
    sidePanel: { setOptions: () => Promise.resolve() }
  };
  window.__PINCHTAB_MOCK__ = true;
})();
```

### Step 2: 用 PinchTab 注入 Mock 并创建 UI

```bash
# 1. 导航到任意页面
docker exec pinchtab pinchtab nav "https://example.com" --snap

# 2. 注入 Chrome Mock
docker exec pinchtab pinchtab eval "
(function() {
  // ... mock 代码 ...
  window.chrome = { storage: { local: createStore() }, ... };
  return 'mock installed';
})()
"

# 3. 创建 PageWise UI 结构
docker exec pinchtab pinchtab eval "
(function() {
  document.body.innerHTML = `
    <div id='app'>
      <nav role='tablist'>
        <button class='tab active' data-tab='chat'>问答</button>
        <button class='tab' data-tab='knowledge'>知识</button>
        <button class='tab' data-tab='settings'>设置</button>
      </nav>
      <!-- 面板内容 -->
    </div>
  `;
  // 绑定事件...
  return 'UI created';
})()
"
```

### Step 3: 测试交互

```bash
# 测试 Tab 切换
docker exec pinchtab pinchtab eval "
(function() {
  document.querySelectorAll('.tab')[1].click();
  return 'tab switched';
})()
"

# 测试表单输入
docker exec pinchtab pinchtab eval "
(function() {
  document.getElementById('userInput').value = '什么是闭包?';
  document.getElementById('btnSend').click();
  return 'message sent';
})()
"

# 测试 Storage 读写
docker exec pinchtab pinchtab eval "
(function() {
  chrome.storage.local.set({theme: 'dark'});
  var result;
  chrome.storage.local.get(['theme'], function(r) { result = r; });
  return 'storage: ' + JSON.stringify(result);
})()
"
```

## 测试结果

### 通过的测试

| 测试项 | 结果 | 说明 |
|--------|------|------|
| Chrome Mock 注入 | ✅ | 所有 API 可用 |
| UI 渲染 | ✅ | 8 个按钮正确渲染 |
| Tab 切换 | ✅ | 面板显示/隐藏正确 |
| 表单输入 | ✅ | textarea 值设置成功 |
| Storage 读写 | ✅ | set/get 往返一致 |
| 主题切换 | ✅ | 深色模式应用成功 |
| 按钮点击事件 | ✅ | 事件处理器触发 |

### 截图验证

**问答面板**：欢迎界面、快捷按钮、输入框正常渲染

**设置面板**：API Key 输入框、主题下拉框、保存按钮正常工作

**深色主题**：背景色切换为 #1a1a2e，文字颜色适配

## 局限性

1. **无法测试真实 Chrome API 调用**：`chrome.storage` 的实际持久化、`chrome.runtime.sendMessage` 的跨上下文通信
2. **无法测试 Service Worker**：MV3 的后台脚本生命周期
3. **无法测试 Content Script 注入**：自动注入到目标网页的机制
4. **UI 结构需要手动维护**：测试用的 HTML 结构与实际 sidebar.html 可能不同步

## 最佳实践

1. **Mock 要轻量**：只 mock 实际用到的 API，不要试图完整模拟 Chrome
2. **测试关注交互**：Tab 切换、表单提交、状态变更，而非 API 实现细节
3. **截图辅助验证**：PinchTab 的 screenshot 功能用于视觉回归测试
4. **与单元测试互补**：E2E 测试 UI 交互，单元测试验证逻辑正确性

## 总结

方案A验证了 PinchTab 可以用于 Chrome Extension 的 UI 层 E2E 测试。虽然无法覆盖 Extension API 的真实调用，但对于 Tab 切换、表单交互、主题切换等用户可见的行为，PinchTab 提供了一种轻量级的自动化测试方案。

核心价值：**不需要启动真实 Chrome + 加载扩展，就能验证 UI 交互逻辑是否正确。**