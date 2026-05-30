---
layout: post
title: "Hermes Agent 技能库更新：5 个新技能，覆盖 DevOps 全流程"
date: 2026-05-17
categories: DevOps
tags: []
excerpt: "Hermes Agent 技能库本周新增 5 个高质量技能，涵盖 Docker 部署、Nginx 配置、安全审计等领域"
image: "https://whalemalus.com/file/cover-hermes-skills-devops-key"
header:
  teaser: "https://whalemalus.com/file/cover-hermes-skills-devops-key"
  overlay_image: "https://whalemalus.com/file/cover-hermes-skills-devops-key"
original_url: "https://whalemalus.com/articles/hermes-agent-skills-update-devops-design-cicd-browser"
---

# Hermes Agent 技能库更新：5 个新技能，覆盖 DevOps、设计、CI/CD 与浏览器自动化

> 2026-05-17 · Hermes Agent 团队

## 楔子

Windows 脚本踩坑 8 轮才搞定、73 个设计规范一把收齐、CI/CD 从零到发布的四步法——这 5 个技能，每一个都是实战里磨出来的。


## 引言

Hermes Agent 技能库本周新增 5 个高质量技能，涵盖 Windows 脚本调试、UI/UX 设计系统、GitHub CI/CD 流水线、浏览器自动化等关键领域。这些技能来自真实的项目实践，经过多轮调试验证，实战中挺好用。



## 目录

- [楔子](#楔子)
- [引言](#引言)
- [新增技能一览](#新增技能一览)
- [技能设计理念](#技能设计理念)
- [总结](#总结)

## 新增技能一览

### 1. Windows Batch Pitfalls — 9 大经典陷阱

在真实项目中经过 8+ 轮调试总结出的 Windows `.bat` 脚本避坑指南。

**核心问题：**
- `%date%` / `%time%` 在重定向中的解析错误
- 中文字符在 echo 中导致命令解析失败
- `if` 块中括号和 `^` 续行符的意外行为
- `start cmd /c` 嵌套引号的转义问题
- PowerShell 7 下 `activate.bat` 失效

**最佳实践：** bat + Python 混合架构 — bat 处理控制流，Python 处理文件 I/O 和复杂字符串操作。

### 2. Awesome Design MD — 73 个设计系统参考

收集了 73 个知名网站的 DESIGN.md 设计规范文件，覆盖 AI 平台、开发工具、金融科技、消费科技等领域。

**包含品牌：** Claude、Linear、Vercel、Stripe、Cursor、Notion、Figma、Spotify、Airbnb 等。

**用途：** AI Agent 在生成 UI 时，可以参考这些设计规范来匹配特定网站的视觉风格，实现像素级还原。

### 3. UI/UX Pro Max — 设计智能指南

一个全面的 UI/UX 设计知识库，包含：
- **50+ 设计风格** — 从 Glassmorphism 到 Brutalism
- **161 个调色板** — 按产品类型和行业分类
- **57 种字体搭配** — 覆盖各种设计个性
- **99 条 UX 准则** — 按优先级排序的检查清单
- **25 种图表类型** — 数据可视化的最佳选择

**特色功能：** 支持通过 CLI 工具按领域搜索，自动生成完整设计系统，支持 Master + Overrides 的层级模式。

### 4. GitHub CI/CD Setup — 从零搭建流水线

覆盖从基础 CI 到自动发布的完整四阶段方法论：

1. **Phase 1: Basic CI** — lint + 单元测试
2. **Phase 2: Build Validation** — 构建验证
3. **Phase 3: Auto-Release** — Tag 触发自动发布
4. **Phase 4: E2E** — 端到端测试（可选）

**内置模板：** Python CI、JavaScript/Chrome Extension CI、Release 工作流。

**常见坑位：** E2E 测试在 CI 中失败、模块级副作用未运行、Chrome Extension Manifest 验证、Release 权限配置等。

### 5. PinchTab — AI Agent 的浏览器控制

PinchTab 是一个独立的 HTTP 服务器，让 AI Agent 直接控制 Chrome 浏览器。

**核心能力：**
- 页面导航与内容提取
- DOM 元素交互（点击、填表、滚动）
- 截图与 PDF 导出
- 多标签页管理
- Chrome 扩展加载与测试

**Token 效率优化：** 文本提取（~800 tokens）比截图（~10,000 tokens）便宜 13 倍，推荐优先使用文本模式。

**特殊场景支持：** Gradio/Shadow DOM 组件的 JS Eval 操作、Element Plus/Ant Design 等 Vue 3 框架的 DOM 操作、Docker 容器间网络通信。

## 技能设计理念

这些技能都遵循相同的设计原则：

1. **来自实战** — 每个技能都源于真实项目的调试经验
2. **规则明确** — 用 "NEVER / FIXED" 模式清晰标注错误和正确做法
3. **可操作** — 提供可直接复制的代码片段和命令
4. **覆盖全面** — 从触发条件到常见陷阱，形成完整知识闭环

## 总结

Hermes Agent 的技能库持续扩展，目前已覆盖 DevOps、前端设计、CI/CD、浏览器自动化、AI Agent 工具链等核心领域。每个技能都是团队在实际项目中反复验证的结晶，旨在让 AI Agent 能够更高效、更可靠地完成复杂任务。

---

*Hermes Agent Skills v1.0.0*
*持续更新中*