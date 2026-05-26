---
layout: post
title: "当 AI Agent 完成了十轮迭代但第五次才写出文件：PageWise Phase D 的最后一公里"
date: 2026-05-14
categories: DevOps
tags: ["Claude Code", "飞轮迭代", "PageWise", "DocMind"]
excerpt: "PageWise 飞轮迭代引擎完成 Phase D 最后三轮，Claude Code 对复杂任务的静默失败成为新的信任危机。"
image: "https://whalemalus.com/file/cover-flywheel-phase-d-key"
original_url: "https://whalemalus.com/articles/claude-code-silent-failure-flywheel-phase-d"
---

# 当 AI Agent 完成了十轮迭代但第五次才写出文件：PageWise Phase D 的最后一公里

> **摘要**：PageWise 飞轮迭代引擎在 5 月 13 日完成了 Phase D 的最后三轮迭代（R80-R82），42 个 i18n key、引导向导、集成测试全部落地。同一天，DocMind 的渠道管理页面在第三次尝试后成功生成。但 R97 书签导入导出功能连续五次静默失败——Claude Code 对复杂多文件任务的"假成功"成了新的信任危机。
>
> **关键词**：`PageWise` `飞轮迭代` `Claude Code` `DocMind` `静默失败`

---

## 楔子

5 月 13 日晚上 8 点，飞轮迭代引擎准时启动。显示器上滚动着 Claude Code 的输出，Phase D 的最后一轮迭代——R82 集成测试——正在执行。8 分钟后，代码提交成功，Phase D 十轮迭代全部完成。

同一台机器上，另一个任务也在运行。R97 书签导入导出，一个看起来并不复杂的任务，已经连续失败了四次。Claude Code 每次都返回 exit code 0，日志里没有任何报错，但 `lib/bookmark-import-export.js` 始终没有出现。

这就像一个学生交了空白卷子还拿了满分——问题不在于能力，而在于你不知道什么时候该相信它的成绩。

## 引言

这篇文章记录的是 2026 年 5 月 13 日一整天的自动化开发实践。主角是两个 AI 驱动的项目：PageWise（智阅 Chrome 扩展）和 DocMind（文档智能系统）。它们都在用 Claude Code 作为编码引擎，通过飞轮迭代模式自动推进。

今天的成果和教训并存。一方面，Phase D 的十轮迭代圆满收官，DocMind 的新页面也成功生成；另一方面，Claude Code 在复杂任务上的"静默失败"问题再次暴露，而且这次比以往更严重。

如果你也在用 AI Agent 做自动化开发，这篇文章里的踩坑经验可能对你有用。

## 📖 目录

1. [全景地图](#1-全景地图)
2. [核心概念](#2-核心概念)
3. [实战指南](#3-实战指南)

---

## 1. 全景地图

> 鸟瞰今天的全貌，理解自动化迭代的完整流程

### 飞轮迭代引擎架构

```
┌─────────────────────────────────────────────────┐
│           PageWise 飞轮迭代引擎                    │
├─────────────────────────────────────────────────┤
│                                                   │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐   │
│  │  Plan    │ →  │   Sub    │ →  │  Guard   │   │
│  │  Agent   │    │  Agent   │    │  Agent   │   │
│  │(需求设计)│    │(代码实现)│    │(质量审查)│   │
│  └──────────┘    └──────────┘    └──────────┘   │
│       ↑                                    │     │
│       └────────── 反馈循环 ────────────────┘     │
│                                                   │
│  四文档系统：                                     │
│  REQUIREMENTS → DESIGN → IMPLEMENTATION → VERIFY │
└─────────────────────────────────────────────────┘
```

### 今天的执行时间线

```
09:00  R80 BookmarkI18n       ✅ 42个i18n key，11文件重构
14:00  DocMind R74 迭代        ❌ (未产出)
20:00  R81 BookmarkOnboarding  ✅ 引导向导
20:09  R82 Phase D 集成测试    ✅ Phase D 十轮全部完成
05:10  R97 书签导入导出        ❌ 连续5次静默失败
```

### 今天的三条故事线

1. **Phase D 收官**：R80-R82 三轮迭代，PageWise 书签系统完成国际化、引导向导和集成测试
2. **DocMind 新页面**：渠道管理 UI 从失败到成功，简化 prompt 是关键
3. **R97 的五次静默失败**：Claude Code 对复杂任务的"exit 0 但无产出"问题

## 2. 核心概念

### 飞轮迭代的五阶段生命周期

每一轮飞轮迭代都遵循固定的五阶段流程：

| 阶段 | 做什么 | 产出物 |
|------|--------|--------|
| Phase 1 需求 | 分析 TODO，定义验收标准 | `REQUIREMENTS-ITER.md` |
| Phase 2 设计 | 架构设计，模块拆分 | `DESIGN-ITER.md` |
| Phase 3 实现 | Claude Code 编写代码 | 代码 + 测试 |
| Phase 4 验证 | Guard Agent 审查质量 | `VERIFICATION.md` |
| Phase 5 复盘 | 更新 TODO，总结经验 | 迭代报告 |

**关键设计**：每个阶段产出独立文档，下一阶段必须读取上一阶段的产出才能开始。这避免了 AI 在没有上下文的情况下乱写代码。

### 静默失败：AI Agent 的新型 Bug

今天最值得关注的现象是 Claude Code 的"静默失败"——返回 exit code 0，没有错误输出，但实际上什么都没做。

**正常失败 vs 静默失败**：

| 特征 | 正常失败 | 静默失败 |
|------|----------|----------|
| 退出码 | 非零 | 0 |
| 错误信息 | 有 | 无 |
| 文件产出 | 无 | 无 |
| AI 自我感知 | 知道失败了 | 以为成功了 |

**为什么静默失败比正常失败更危险？**

因为自动化流程依赖退出码判断成功与否。exit code 0 意味着流程继续推进，但实际上代码没有写入、测试没有运行、文档没有生成。整个流程在"成功"的假象中空转。

### 简化 Prompt 的杠杆效应

今天两个项目都验证了一个规律：Claude Code 对简单 prompt 的成功率远高于复杂 prompt。

**DocMind 渠道管理页面**：
- 尝试 1：完整 prompt（详细需求 + 架构描述）→ 失败
- 尝试 2：类似完整 prompt → 失败
- 尝试 3：简化 prompt（核心功能清单）→ **成功**

**PageWise R97 书签导入导出**：
- 尝试 1-4：各种详细程度的 prompt → 全部失败
- 尝试 5：拆分为单文件的步骤式 prompt → 进行中

这不是说 Claude Code 能力不行，而是它的注意力窗口和任务理解在复杂 prompt 下会退化。把大象装进冰箱需要三步，但你不能一次性告诉它所有三步——得分三次说。

## 3. 实战指南

### R80：BookmarkI18n 国际化实现

这是 Phase D 倒数第三轮的任务。目标是为 PageWise 的书签系统添加中英文界面切换。

**实现细节**：
- 创建 `lib/bookmark-i18n.js`（346 行，42 个翻译 key）
- 中英文语言包，使用 `chrome.storage.sync` 持久化用户语言偏好
- 11 个文件从硬编码字符串重构为 `bt()` 翻译函数调用
- 添加 Chrome 扩展标准的 `_locales/en/messages.json` 和 `_locales/zh_CN/messages.json`

**测试结果**：37 个新增单元测试，总计 3373 个测试全部通过。

**代码示例**——i18n 模块核心：

```javascript
// lib/bookmark-i18n.js
const DEFAULT_LANG = 'zh_CN';

const messages = {
  en: {
    bookmarkAdded: 'Bookmark added successfully',
    bookmarkDeleted: 'Bookmark deleted',
    searchPlaceholder: 'Search bookmarks...',
    // ... 42 keys total
  },
  zh_CN: {
    bookmarkAdded: '书签添加成功',
    bookmarkDeleted: '书签已删除',
    searchPlaceholder: '搜索书签...',
    // ...
  }
};

export function bt(key, ...args) {
  const lang = getStoredLang();
  let text = messages[lang]?.[key] || messages[DEFAULT_LANG]?.[key] || key;
  args.forEach((arg, i) => {
    text = text.replace(`{${i}}`, arg);
  });
  return text;
}
```

### R81：BookmarkOnboarding 引导向导

新用户第一次使用 PageWise 时，不再面对空白界面。引导向导包含：
- 功能介绍（3 个核心能力的动画演示）
- 隐私说明（数据全部本地存储，不上传云端）
- 快速上手（3 步完成第一个书签）

### R82：Phase D 集成测试

作为 Phase D 的最后一轮，R82 的任务是对整个书签系统做端到端集成测试。这包括：
- BookmarkGraph 可视化 + 语义搜索 + AI 推荐的完整链路
- 标签管理 + 导入导出 + 国际化 + 暗色主题的交叉测试
- 键盘快捷键 + 无障碍访问的兼容性验证

### DocMind 渠道管理页面

DocMind 需要一个管理 AI API 渠道的界面。经过三次尝试后，用简化 prompt 成功生成了 `ChannelManagement.vue`（约 460 行）。

**页面功能**：
- 渠道列表表格（显示名称、类型、状态、优先级）
- 添加渠道对话框（5 种预设类型：OpenAI / DeepSeek / Claude / Ollama / 自定义）
- 测试连接按钮（验证 API Key 是否有效）
- 启用/禁用开关

**关键经验**——prompt 简化的三个原则：
1. **只说做什么，不说怎么做**：Claude Code 有自己的实现思路，你只需要告诉它目标
2. **一个 prompt 一个文件**：不要在一个 prompt 里要求创建多个文件
3. **列出关键约束，不要写架构文档**：3-5 条约束比 3 页设计文档更有效

## 踩坑记录

### 坑 1：`/tmp` 目录权限问题

**现象**：飞轮迭代引擎的 Phase 1（需求）和 Phase 2（设计）频繁失败，但 Phase 3-5 正常。

**原因**：引擎脚本将临时文件写入 `/tmp/`，但 `/tmp` 目录有沙箱权限限制，Claude Code 子进程无法读取这些文件。

**解决**：将临时文件路径从 `/tmp/` 改为项目本地的 `.tmp/` 目录，并在 `.gitignore` 中添加排除规则。

```python
# 修复前
tmp_file = f"/tmp/pagewise-R{round}-phase{phase}.txt"

# 修复后
tmp_file = f"{PROJECT_DIR}/.tmp/pagewise-R{round}-phase{phase}.txt"
```

### 坑 2：Claude Code 的假成功

**现象**：R97 书签导入导出任务，Claude Code 连续 5 次返回 exit code 0，但目标文件从未创建。

**排查过程**：
1. 简单测试（创建一个包含 `HELLO_R97` 的文本文件）→ 成功
2. 中等测试（创建一个简单的 JS 模块）→ 成功
3. 复杂任务（创建导入导出模块 + 测试文件）→ 失败（exit 0，无文件）

**根因分析**：Claude Code 在处理复杂多文件任务时，可能会进入一种"自说自话"的状态——它认为自己已经完成了任务（生成了文件），但实际上文件没有写入磁盘。这可能与 API 代理层的超时或上下文窗口溢出有关。

**当前状态**：采用步骤式拆分策略（每次只创建一个文件），尚未验证是否有效。

### 坑 3：Phase 状态报告与实际不一致

**现象**：R80-R82 的 Phase 1（需求）和 Phase 2（设计）都报告为"失败"，但文档确实被生成了，后续 Phase 也正常执行。

**原因**：`claude -p` 命令返回了非零退出码，可能是因为某些警告或非致命错误。引擎脚本用退出码判断成功/失败，但实际产出是有效的。

**教训**：自动化流程不能只看退出码，还需要检查产出物是否存在且内容有效。

## 总结与展望

### 核心收获

1. **Phase D 圆满收官**：R73-R82 共十轮迭代，PageWise 书签系统从零到完成，覆盖图谱可视化、语义搜索、AI 推荐、标签管理、国际化、暗色主题、键盘快捷键、无障碍访问、引导向导和集成测试
2. **简化 Prompt 是生产力杠杆**：DocMind 的经验表明，给 Claude Code 的 prompt 越简单，成功率越高
3. **静默失败是自动化的头号敌人**：exit code 0 但无产出的情况，比明确的报错更难发现、更难处理

### 最佳实践

- **产出物验证**：不要只看退出码，用 `test -f` 检查文件是否存在，用 `wc -l` 检查内容是否非空
- **Prompt 拆分**：复杂任务拆成单文件单步骤，每次只让 Claude Code 做一件事
- **临时文件本地化**：避免 `/tmp` 的沙箱权限问题，使用项目目录下的 `.tmp/`
- **Phase D 的十轮验证**：飞轮迭代不是一次性的，十轮迭代覆盖了从架构到集成的完整链路

### 延伸阅读

- Phase E 即将开始：R83-R92 聚焦发布准备，首当其冲是 Chrome Web Store 上架准备
- R97 书签导入导出的静默失败问题仍在排查中，后续会记录解决方案
- Claude Code 的复杂任务可靠性是一个值得深入研究的课题——可能需要在 API 代理层添加产出验证逻辑
