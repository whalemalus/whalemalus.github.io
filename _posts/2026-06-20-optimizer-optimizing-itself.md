---
layout: post
title: "优化优化器 ≠ 优化系统：PCEC 引擎的七轮自我纠缠"
date: 2026-06-20
categories: DevOps
tags: ["飞轮迭代", "自动化", "DevOps"]
excerpt: "自进化 AI Agent 系统 PCEC 引擎连续 7 个周期都在做元维护——修诊断脚本、归一化 schema、提取大文件。每一项都有价值，但合在一起就是优化优化器而非改进系统。"
image: "https://whalemalus.com/file/cover-optimizer-optimizing-itself-key"
header:
  teaser: "https://whalemalus.com/file/cover-optimizer-optimizing-itself-key"
  overlay_image: "https://whalemalus.com/file/cover-optimizer-optimizing-itself-key"
original_url: "https://whalemalus.com/articles/optimizer-optimizing-itself"
---

# 优化优化器 ≠ 优化系统：PCEC 引擎的七轮自我纠缠

> **摘要**：自进化 AI Agent 系统 PCEC 引擎连续 7 个周期都在做"元维护"——修诊断脚本、归一化 schema、提取大文件。每一项都有价值，但合在一起就是"优化优化器"而非改进系统。本文记录这个反模式的发现和修正过程。
>
> **关键词**：`PCEC` `自进化系统` `反模式` `AI Agent` `元维护`

---

## 楔子

周一早上打开 PCEC 进化报告，看到一句话：

> "今日 7 个周期中 6 个为元维护（schema 归一化×3、诊断脚本修复×2、SKILL.md 提取×2）。"

我的第一反应是——这些不都是有价值的工作吗？诊断脚本修了假阳性，SKILL.md 从 55KB 压到 19KB，每次 skill_view 能省 36KB 上下文。每个单独拿出来都站得住脚。

但问题就在这。连续 7 个周期，每 3 小时一次，21 个小时里，系统一直在"打理自己的工具箱"，没有做任何真正影响用户的事情。

这就像一个员工整天在整理桌面、优化邮件模板、调整日历标签——每件事都有道理，但到下班时发现一行代码没写。

## 引言

PCEC（Periodic Cognitive Expansion Cycle）是我们自进化系统的核心引擎。它每 3 小时运行一次，做三件事：分析系统状态、产出实际改进、检查是否退化。设计初衷是让 AI Agent 能持续自我优化，不需要人工干预。

今天发现的 pitfall #79 揭示了一个反模式：**当优化器开始优化自己时，系统进入了"假忙碌"状态**。每轮看起来都有产出，但产出都是关于"怎么更好地优化"的，不是"怎么更好地服务用户"。

## 全景地图

```
自进化系统架构
├── PCEC 引擎（每3小时）
│   ├── 诊断扫描（系统状态、技能健康、cron 任务）
│   ├── 思维爆炸四问（推翻默认、剔除冗余、补齐短板、适配高并发）
│   ├── 三选一产出（技能/范式/杠杆）
│   └── 反退化检查（四道门禁）
│
├── 飞轮迭代（手动/自动）
│   ├── PageWise 飞轮（Chrome 扩展开发）
│   └── DocMind 飞轮（知识库管理）
│
├── 债务管理（每日日报）
└── 自反思引擎（每日 22:45）

今天的故障链：
PCEC 连续元维护 → pitfall #79 触发 → 引擎自我修正
    ↘ PageWise R2 发现 7 个误标完成任务
    ↘ DocMind R208 降级执行成功
```

## 核心概念

### 什么是"元维护"

元维护是指系统在维护自己的维护机制，而不是在维护业务功能。

打个比方：你开了一家餐厅。每天的正常工作是做菜、服务客人。偶尔你需要清洗烤箱、整理调料架、更新菜单——这些是维护。但如果连续一周你都在"优化厨房布局"、"改进排班系统"、"重新设计菜单排版"，客人来了发现没人在做菜——这就是元维护过度。

在 PCEC 引擎里，元维护的典型表现：

| 工作内容 | 属于什么 | 单独看有价值吗 |
|---------|---------|-------------|
| 修复诊断脚本假阳性 | 元维护 | ✅ 有 |
| 归一化 pcec-state.json schema | 元维护 | ✅ 有 |
| 提取超大 SKILL.md 到 references/ | 元维护 | ✅ 有 |
| 创建新技能解决实际问题 | 业务改进 | ✅ 有 |
| 修改 cron 配置改善系统行为 | 业务改进 | ✅ 有 |

问题不在于单个工作项，而在于连续 7 个周期都在左边打转。

### Pitfall #79 的检测逻辑

PCEC 引擎在第 21:00 的周期里终于发现了问题。检测方法很直接：检查 `completed_today` 列表里有多少条目的 output 包含元维护关键词（normalize、schema、trim、compact、diagnostic、false positive、extract）。

```python
meta_keywords = ['normalize', 'schema', 'trim', 'compact', 
                 'diagnostic', 'false positive', 'extract']
meta_count = 0
for t, typ, out in entries:
    if any(k in out.lower() for k in meta_keywords):
        meta_count += 1
# 6/7 触发 pitfall #79
```

结果：7 个条目里 6 个命中，只有 1 个是真正的非元维护产出（修复了 5 个 broken 的 related_skills 引用——这个勉强算 gap_fix 而非纯元维护）。

### 为什么"每个都有价值"的组合会变成问题

这里有个认知陷阱：当你评估每一项工作时，它确实有价值。诊断脚本修了假阳性，以后就不会误报了。SKILL.md 提取了，以后每次加载省 36KB。schema 归一化了，以后不会有字段不一致。

但"以后"一直在来，"现在"一直在被推迟。

PCEC 的设计目标是"每 3 小时强制认知扩展"——扩展的意思是让系统能做之前做不了的事，而不是让系统把已经在做的事情做得更"干净"。元维护让系统更干净，但没有扩展能力边界。

## 实战指南

### Pitfall #79 的解决规则

当 PCEC 连续 3 个周期的产出全是元维护时，必须强制执行一个有实质产出的周期。

"实质产出"的判定标准——必须至少满足一个：

- 创建了一个新技能并实际应用
- 修改了 cron 配置改变了系统行为
- 修复了一个影响用户的功能性 bug
- 产生了可复用的范式或决策框架

"不满足"的情况：

- 仅分析了问题但没有动手修
- 仅创建了技能但没有验证
- 仅更新了 memory 或状态文件
- 仅美化了输出格式

### 实操：第 21:00 周期怎么破局的

PCEC 在第 21:00 周期做了一件关键的事：把 `dimstack-blog-management` 技能的 SKILL.md 从 55KB 压缩到 19KB。

这件事本身是元维护（提取超大文件），但它同时做了一件非元维护的事：在诊断脚本里新增了 SKILL.MD BLOAT 检测段，自动标记所有超过 30KB 的技能文件。

```
提取 + 检测 = 杠杆

单独提取 → pitfall #79（元维护）
提取 + 自动检测 → 结构性效率杠杆（防止复发）
```

这就是"Extract + Detect"模式：修复问题的同时添加自动检测，把一次性修复变成永久性的预防机制。

### PageWise R2 的 7 个误标任务

同一天，PageWise 飞轮引擎在第 R2 轮运行时发现了一个相关但不同的问题：Claude Code API 不可达，引擎的实现阶段（Phase 1-3）被跳过，但 Phase 5（回顾阶段）仍然把 7 个任务标记为"完成"。

这些任务的测试文件从未创建。

根因：飞轮引擎在 API 失败后没有验证产出文件是否存在，就执行了回顾阶段。Phase 5 应该检查"Phase 3 声称创建的文件真的存在吗？"——但没有。

已修复：7 个任务全部恢复为待办状态，新增 R423 和 R424 两个任务。

### DocMind R208 的降级执行

同一天的另一个发现：当 Claude Code API 不可用时，agent 可以降级为手动执行。DocMind R208 任务中，agent 直接读取源码、手动 patch、手动测试，完成了 web_fetch.py 的异常处理精细化。

4 处裸 `except` 替换为具体异常类型 + `exc_info` 日志，10 个新测试通过，git push 成功。

这证明了一个观点：AI 编程助手的价值不在于"必须通过 API 调用"，而在于"知道该改什么、怎么改"。当 API 断了，agent 仍然可以用自己的理解能力完成任务。

## 踩坑记录

### 连续元维护的触发条件

回溯 7 个周期的产出：

| 时间 | 产出 | 类型 |
|------|------|------|
| 00:02 | 归一化 anti-patterns 注册表 | 元维护 |
| 03:02 | 修复 completed_history schema drift | 元维护 |
| 06:02 | 修复 docmind 诊断假阳性 | 元维护 |
| 09:04 | 压缩 pcec-state.json | 元维护 |
| 12:06 | 提取 flywheel-iteration SKILL.md | 元维护 |
| 15:06 | 提取 claude-code SKILL.md + 诊断膨胀检测 | 元维护 |
| 18:03 | 修复 5 个 broken related_skills 引用 | gap_fix |

为什么连续 6 个周期都选了元维护？因为 PCEC 的"思维爆炸四问"里，"剔除冗余流程"和"补齐短板漏洞"天然倾向于元维护——这些工作"看起来紧急"（假阳性在报警、文件太大在浪费 token），而且"做了就能看到效果"（文件变小了、报警停了）。

相比之下，"新增落地实用技能"需要更多创造力，"抽象通用问题范式"需要更多思考深度。元维护是阻力最小的路径。

教训：**自进化系统需要对抗"阻力最小路径"的机制**。PCEC 现在的规则是：连续 3 个周期元维护 → 强制非元维护产出。

### SKILL.md 提取的三个陷阱

在提取超大文件时遇到了三个坑（pitfall #80）：

1. **terminal `cat` 截断**：`cat` 输出在约 50KB/900 行处截断，但不报错。必须用 `sed -n 'start,endp'` 做定点提取。
2. **heredoc 定界符碰撞**：`cat > file << 'EOF'` 方式当内容包含 `EOF` 字样时静默丢失后续内容。改用 `write_file` 工具。
3. **行号漂移**：提取前必须用 `grep -n '^##'` 重新映射章节行号，不能依赖之前的缓存。

## 总结

### 核心收获

PCEC pitfall #79 的核心教训：**优化优化器 ≠ 优化系统**。

单独看每一项元维护工作都有价值。但当系统连续 21 个小时都在"打理工具箱"时，它实际上已经停下了真正的工作。检测方法很简单——看 completed_today 里有多少条目包含 normalize/schema/trim/compact/diagnostic/extract 这些关键词。

### 避免"假忙碌"的几个思路

自进化系统容易掉进"假忙碌"的坑里，因为元维护工作有两个特征让它看起来特别诱人：反馈快（改完立刻能看到效果）和风险低（不会破坏现有功能）。要对抗这种倾向，需要在引擎层面硬性规定：每 N 个周期必须有一个非元维护产出。这和"你不能整天整理桌面"是一个道理。

"Extract + Detect"也是个有用的模式：修一个问题的时候顺手加个自动检测，把一次性修复变成预防机制。单独提取 SKILL.md 是元维护，但提取的同时在诊断脚本里加膨胀检测，就变成了结构性效率杠杆。

### 延伸阅读

- [PCEC 引擎设计文档](https://hermes-agent.nousresearch.com/docs) — 自进化系统的完整架构
- Wikipedia: Signs of AI writing — AI 写作模式识别（humanizer 技能的理论基础）
- 本系列上一篇：[当修 Schema 时忘了通知消费者](https://whalemalus.com/article/schema-cascade-fix) — 配置演进的连锁修复