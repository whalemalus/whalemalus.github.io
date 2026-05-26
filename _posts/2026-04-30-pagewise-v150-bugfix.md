---
layout: post
title: "智阅 PageWise v1.5.0 发布复盘：打包遗漏与三个典型 Bug 的根因分析"
date: 2026-04-30
categories: DevOps
tags: ["Chrome Extension", "Bug 排查"]
excerpt: "PageWise v1.5.0 发布时发现 zip 安装包缺失，同时定位了三个影响用户体验的 Bug：页面切换后内容提取失败、AI 消息操作按钮布局错位、学习路径生成超时。"
image: "https://whalemalus.com/file/cover-pagewise-v150-key"
original_url: "https://whalemalus.com/articles/pagewise-v150-bugfix"
---

# 智阅 PageWise v1.5.0 发布复盘：打包遗漏与三个典型 Bug 的根因分析

> **摘要**：PageWise v1.5.0 发布时发现 zip 安装包缺失，根源是 manifest.json 版本号停留在 1.0.0。同时定位了三个影响用户体验的 Bug：页面切换后内容提取失败、AI 消息操作按钮布局错位、学习路径生成超时。本文记录完整的排查过程和修复思路。
>
> **关键词**：`Chrome Extension` `PageWise` `Bug 排查` `Manifest V3` `前端调试`

---

## 楔子

发布 v1.5.0 的时候，满怀期待地把 zip 包的下载链接发给朋友，对方打开 GitHub Release 页面，翻了半天说："包呢？"

看了看 Release 页面，tag 是有了，changelog 也写了，唯独那个 `pagewise-v1.5.0.zip` 不见踪影。回去检查构建脚本，发现 manifest.json 里的 version 字段还写着 `1.0.0`——构建脚本从这里读版本号，所以打出来的包叫 `pagewise-v1.0.0.zip`，跟 v1.4.0 的包重名，直接被跳过了。

这种"差一个字段"的疏忽，在实际项目中出奇地常见。

## 引言

PageWise（智阅）是一个 Chrome Extension（Manifest V3），在浏览技术页面时可以通过侧边栏向 AI 提问，并自动整理成知识库。项目地址：`https://github.com/whalemalus/pagewise`

v1.5.0 本应是一个常规迭代版本，但在发布打包环节出了纰漏。更棘手的是，用户在测试过程中报告了三个 Bug，涉及内容提取、布局渲染和 API 超时三个不同层面。本文按照"打包问题 → Bug 定位 → 根因分析"的顺序，记录这次发布复盘的完整过程。

---

## 📖 目录

1. [全景地图](#全景地图)
2. [发布打包：一个字段引发的事故](#发布打包一个字段引发的事故)
3. [Bug 1：页面切换后内容提取失败](#bug-1页面切换后内容提取失败)
4. [Bug 2：AI 消息操作按钮布局错位](#bug-2ai-消息操作按钮布局错位)
5. [Bug 3：学习路径生成超时](#bug-3学习路径生成超时)
6. [踩坑记录](#踩坑记录)
7. [总结与展望](#总结与展望)

---

## 全景地图

> 鸟瞰 PageWise Chrome Extension 的架构，理解各模块之间的关系

### 架构图

```
┌─────────────────────────────────────────────────────┐
│                  PageWise Extension                   │
│                                                       │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────┐│
│  │  Sidebar     │    │ Content Script│    │ Background││
│  │  (sidebar.js)│◄──►│ (content.js) │    │ (service  ││
│  │  6500+ lines │    │              │    │  worker)  ││
│  └──────┬──────┘    └──────────────┘    └──────────┘│
│         │                                             │
│  ┌──────▼──────┐    ┌──────────────┐    ┌──────────┐│
│  │  AI Client   │    │ Knowledge    │    │ Skill    ││
│  │ (ai-client.js│    │ Base (IDB)   │    │ Engine   ││
│  │  OpenAI/     │    │              │    │          ││
│  │  Claude协议) │    │              │    │          ││
│  └──────┬──────┘    └──────────────┘    └──────────┘│
│         │                                             │
│  ┌──────▼──────┐                                     │
│  │  API Gateway │  ← AxonHub (localhost:8090)        │
│  │  → 模型服务  │                                     │
│  └─────────────┘                                     │
└─────────────────────────────────────────────────────┘
```

### 本文的排查路径

打包问题 → Content Script 通信 → CSS 布局 → API 超时机制

---

## 发布打包：一个字段引发的事故

### 现象

v1.5.0 的 GitHub Release 已创建，但没有 zip 安装包附件。之前的 v1.4.0 都有 `pagewise-v1.4.0.zip`。

### 根因

`scripts/build.sh` 从 `manifest.json` 的 `version` 字段读取版本号来命名输出文件。但 manifest.json 里的 version 还是 `1.0.0`：

```json
// manifest.json (修改前)
{
  "manifest_version": 3,
  "version": "1.0.0",    // ← 这里应该是 1.5.0
  "name": "智阅 PageWise",
  ...
}
```

构建脚本的行为：
```bash
# scripts/build.sh 中的关键行
VERSION=$(grep '"version"' manifest.json | sed 's/.*"version": *"\(.*\)".*/\1/')
# VERSION = "1.0.0"
OUTPUT="pagewise-v${VERSION}.zip"
# 输出: pagewise-v1.0.0.zip ← 与 v1.4.0 的包重名！
```

GitHub CLI 上传时，如果 asset 文件名与已有 release 的 asset 冲突，会被静默跳过。

### 修复

```bash
# 1. 修正 manifest.json 版本号
sed -i 's/"version": "1.0.0"/"version": "1.5.0"/' manifest.json

# 2. 重新构建
bash scripts/build.sh
# 输出: dist/pagewise-v1.5.0.zip (169KB)

# 3. 上传到 GitHub Release
gh release upload v1.5.0 dist/pagewise-v1.5.0.zip

# 4. 提交修复
git add manifest.json
git commit -m "fix: manifest.json version 1.0.0 → 1.5.0"
git push
```

### 教训

> **版本号应该在一处管理，多处引用。** 目前 manifest.json 和 git tag 是两个独立的版本来源，很容易不同步。理想方案是构建脚本从 git tag 读取版本号，或者用 CI/CD 自动同步。

---

## Bug 1：页面切换后内容提取失败

### 现象

用户在不同标签页之间切换时，侧边栏显示：

```
⚠️ 无法提取页面内容
手动输入
```

但实际上目标页面是正常可读的。

### 定位过程

问题出在 Sidebar 与 Content Script 的通信链路上。

**关键代码路径**（`sidebar/sidebar.js`）：

```
line 171: onUpdated 监听器 → 页面加载完成后触发 extractContent()
line 177: onActivated 监听器 → 标签页切换时触发 loadPageContext()
line 969: extractContent() → chrome.tabs.sendMessage({ action: 'extractContent' })
```

**发现问题**：`onActivated`（标签页切换事件）只调用了 `loadPageContext()`，没有调用 `extractContent()`。这意味着切换标签页后，侧边栏仍然显示上一个页面的内容（或空内容）。

```javascript
// sidebar.js line 177 — 问题所在
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    this.currentTabId = activeInfo.tabId;
    this.loadPageContext();  // ← 只加载了上下文，没有提取内容！
    // 缺少: this.extractContent(activeInfo.tabId);
});
```

对比 `onUpdated` 的正确实现：

```javascript
// sidebar.js line 171 — 正确的实现
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        this._refreshDebounce(tabId);  // ← 包含 extractContent()
    }
});
```

### 根因

Chrome Extension 的 `tabs.onActivated` 事件只在用户切换标签页时触发，此时新标签页的 DOM 已经加载完毕，不会再触发 `onUpdated`。如果不主动调用 `extractContent()`，侧边栏拿到的就是旧数据或空数据。

### 修复思路

在 `onActivated` 监听器中增加内容提取调用：

```javascript
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    this.currentTabId = activeInfo.tabId;
    this.loadPageContext();
    await this.extractContent(activeInfo.tabId);  // ← 补上这一行
});
```

需要注意防抖（debounce），避免切换过快时产生大量无效请求。

---

## Bug 2：AI 消息操作按钮布局错位

### 现象

AI 回复消息下方的操作按钮（复制 / 保存 / 高亮 / 分支）显示在消息气泡的**右侧**，而不是下方。

### 定位过程

**HTML 结构**（`sidebar.js` line 2282-2294，`addAIMessage()` 方法）：

```html
<div class="message-ai">
    <div class="message-bubble">
        <!-- AI 回复内容 -->
    </div>
    <div class="message-actions">
        <button class="msg-action-btn">📋 复制</button>
        <button class="msg-action-btn">💾 保存</button>
        <button class="msg-action-btn">📌 高亮</button>
        <button class="msg-action-btn">🔀 分支</button>
    </div>
</div>
```

**CSS 分析**（`sidebar.css` line 524-531）：

```css
.message-actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
}
```

`message-actions` 本身是 `display: flex`，理论上应该在 `.message-bubble` 下方。但问题出在父容器 `.message-ai` 使用了 `flex` 布局，导致子元素排列方向被覆盖。

### 修复思路

确保 `.message-ai` 使用 `flex-direction: column`：

```css
.message-ai {
    display: flex;
    flex-direction: column;  /* ← 确保垂直排列 */
}

.message-actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    width: 100%;              /* ← 占满整行 */
    flex-wrap: wrap;          /* ← 按钮过多时自动换行 */
}
```

---

## Bug 3：学习路径生成超时

### 现象

点击"生成学习路径"按钮后，等待约 30 秒，显示：

```
AI 响应超时，请稍后重试
```

### 定位过程

**关键代码**（`sidebar.js` line 4268-4339，`generateLearningPath()` 方法）：

```javascript
// sidebar.js line 4300-4303
const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('请求超时（30秒）')), 30000);
});

const result = await Promise.race([
    this.aiClient.chat(systemPrompt, userPrompt, { maxTokens: 2000 }),
    timeoutPromise
]);
```

学习路径生成需要 AI 分析整个知识库的内容，然后输出结构化的路径图。这个任务的 token 消耗比普通问答大得多——系统提示词包含完整的知识库摘要，输出要求 `maxTokens: 2000`。

**问题**：30 秒的硬编码超时对这种重任务来说太短了。特别是在通过 API 网关（如 AxonHub）转发时，额外的网络延迟会进一步压缩可用时间。

### 根因

超时时间没有根据任务类型动态调整。普通问答 10-15 秒足够，但学习路径生成可能需要 45-60 秒。

### 修复思路

```javascript
// 根据任务类型设置不同的超时时间
const TIMEOUT = {
    chat: 15000,           // 普通问答: 15s
    learningPath: 60000,   // 学习路径: 60s
    skillGenerate: 45000,  // 技能生成: 45s
};

const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('请求超时')), TIMEOUT.learningPath);
});
```

或者更优雅的方案：使用流式响应（streaming），在第一个 token 到达时就取消超时计时器。

---

## 踩坑记录

### 坑 1：manifest.json 版本号与 Git Tag 不同步

**现象**：构建脚本从 manifest.json 读版本号，但发布时手动打 git tag，两个来源独立管理。

**原因**：没有单一事实来源（Single Source of Truth）。

**解决**：构建脚本应该从 `git describe --tags --abbrev=0` 读取版本号，或者用 CI/CD 在 tag push 时自动触发构建。

### 坑 2：Chrome Extension 的 tabs.onActivated 不触发内容提取

**现象**：切换标签页后侧边栏显示旧内容。

**原因**：`onActivated` 只更新 tabId，不触发内容提取。`onUpdated` 只在页面加载时触发。

**解决**：在 `onActivated` 中主动调用 `extractContent()`，并加防抖。

### 坑 3：硬编码超时不适应不同任务

**现象**：重任务（学习路径生成）频繁超时。

**原因**：所有 API 调用共用一个 30 秒超时。

**解决**：按任务类型配置超时时间，或改用流式响应 + 心跳检测。

---

## 总结与展望

### 核心收获

1. **发布流程要有自动化检查**：版本号、构建产物、GitHub Release 附件，任何一步遗漏都会导致发布不完整。
2. **Chrome Extension 的事件模型容易踩坑**：`onActivated` 和 `onUpdated` 的触发时机不同，需要仔细处理每个事件的副作用。
3. **超时策略要考虑任务差异**：不同复杂度的 API 调用需要不同的超时时间，一刀切的硬编码值会在重任务场景下失效。

### 最佳实践

- 构建脚本从 git tag 读取版本号，避免手动同步
- Content Script 通信加防抖，避免频繁消息传递
- API 超时按任务类型分层配置，重任务用流式响应

### 延伸阅读

- [Chrome Extension Manifest V3 文档](https://developer.chrome.com/docs/extensions/reference/)
- [PageWise 项目仓库](https://github.com/whalemalus/pagewise)
- [AxonHub API 网关配置指南](https://whalemalus.com/article/claude-code-troubleshooting)
