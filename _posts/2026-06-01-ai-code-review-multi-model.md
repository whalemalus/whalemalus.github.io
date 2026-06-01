---
layout: post
title: "我们如何用 AI 做 Code Review：多模型交叉验证实战"
date: 2026-06-01
categories: 技术教程
tags: ["Code Review", "Claude Code", "AI Agent", "LLM", "自动化"]
excerpt: "AI 写代码的速度远超人类 Review 的速度。我们建立了一套多模型交叉验证的 Code Review 体系，用多个 AI 发现尽量多的问题，然后由人来决定哪些值得修。"
image: "https://whalemalus.com/file/cover-ai-code-review-key"
header:
  teaser: "https://whalemalus.com/file/cover-ai-code-review-key"
  overlay_image: "https://whalemalus.com/file/cover-ai-code-review-key"
original_url: "https://whalemalus.com/articles/ai-code-review-multi-model"
---

# 我们如何用 AI 做 Code Review：多模型交叉验证实战

## 楔子

> AI 一分钟能吐出几百行代码，跨七八个文件——但你真的敢直接合进 main 分支吗？

这一年多来，我们的开发流程已经全面 AI 化。从 PageWise 浏览器扩展到 DocMind 文档智能平台，几乎所有代码都由 AI 生成。但随之而来的问题很现实：**AI 写代码的速度远超人类 Review 的速度**。

每次功能提交动辄上千行，跨多个文件和模块。逐行审查不现实，不审查又不敢合并。我们需要一套系统化的 AI Code Review 流程。

## 引言

最近读到一篇文章《Using AI to write better code more slowly》，核心观点深得我心：**用 AI 写代码不应该只追求快，而应该让 AI 帮我们写出更健壮、质量更高的代码**。

受此启发，加上参考 Viking 的 Review Forge 流程，我们建立了一套适合自己的多模型交叉 Review 体系。这篇文章就是对我们实际工作流的完整记录。

## 目录

- [为什么需要多模型 Review](#为什么需要多模型-review)
- [我们的 Review 工作流](#我们的-review-工作流)
- [Step 1：多模型独立 Review](#step-1多模型独立-review)
- [Step 2：汇总与人工决策](#step-2汇总与人工决策)
- [Step 3：修复与交叉验证](#step-3修复与交叉验证)
- [工具链选型](#工具链选型)
- [踩坑记录](#踩坑记录)
- [总结](#总结)

## 全景地图

我们的 Code Review 流程分为三个核心阶段：

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  多模型 Review │ ──→ │  汇总 + 人工  │ ──→ │  修复 + 验证  │
│  (并行执行)    │     │  决策 Check   │     │  (交叉验证)   │
└─────────────┘     └─────────────┘     └─────────────┘
  GPT / Claude         优先级排序           Fix Agent
  DeepSeek / Qwen      人工筛选            Verify Agent
```

核心原则：**AI 负责发现问题，人负责决策取舍，不同模型交叉验证**。

## 核心概念

### 为什么需要多模型 Review

单模型 Review 的问题我们踩过很多次：

1. **盲区问题**：每个模型都有自己的注意力分配模式。同一个功能，GPT 擅长抓逻辑错误，Claude 擅长发现边界条件，DeepSeek 对类型系统敏感。单一模型总会漏掉某些视角。

2. **信任成本**：一个模型报了 15 个 bug，你得逐个验证"这是真 bug 还是模型理解偏了？"这个验证过程本身就很耗时。

3. **交叉验证的威力**：当我们让两个模型分别审同一份代码时，发现大约 60% 的问题是重叠的。**两个模型都发现的问题，基本就是铁板钉钉的真问题**——直接修，不需要犹豫。剩下 40% 各有侧重，需要人工判断。

### 多模型 Review 的两层价值

| 层级 | 价值 | 处理方式 |
|------|------|----------|
| 交叉验证（重叠发现） | 确定性高，几乎都是真问题 | 直接修，不纠结 |
| 扩大覆盖面（独立发现） | 补充了其他模型可能漏掉的视角 | 人工验证后决定 |

## 实战指南

### Step 1：多模型独立 Review

开发完成后，我们会在不同的 Agent 会话中分别运行 Review。每个模型独立分析代码 diff，生成自己的 bug 报告。

**实际操作**（以 Hermes Agent 为例）：

```
# 会话 1：使用 Claude Sonnet
> 帮我 review 这个 PR 的代码变更，列出所有潜在 bug 和改进建议

# 会话 2：使用 GPT-4o
> 分析这个 branch 相对 main 的变更，找出逻辑错误、边界问题和安全隐患

# 会话 3：使用 DeepSeek
> 审查这段代码的类型安全、错误处理和性能问题
```

每个模型生成独立的 Review 报告，保存为独立文件：

```
code_review/
├── feature-branch/
│   ├── claude-review.md
│   ├── gpt-review.md
│   └── deepseek-review.md
```

**我们常用的模型组合**：Claude Sonnet 4 / GPT-4o / DeepSeek V3。选择标准是各有所长、盲区互补。

### Step 2：汇总与人工决策

有了多份报告后，用任意一个模型做汇总分析：

```
> 把这三份 Review 报告合并，按以下规则整理：
> 1. 多个模型都提到的问题排在最前面（高优先级）
> 2. 每个问题标注是哪些模型发现的
> 3. 按严重程度分类：Critical / High / Medium / Low
```

汇总后的 checklist 长这样：

```markdown
- [ ] `CR-001` - 支付回调缺少幂等性检查
  - severity: critical
  - reviewers: claude, gpt, deepseek (3/3)
  
- [ ] `CR-002` - 用户头像上传未校验文件类型
  - severity: high  
  - reviewers: claude, gpt (2/3)

- [ ] `CR-003` - 日志打印了敏感信息
  - severity: medium
  - reviewers: deepseek (1/3)
```

**然后最关键的一步来了：人工逐条 Check。**

这一步不能省，也不能让 AI 代劳。AI 缺乏项目上下文和取舍判断力，它倾向于把所有问题都标记为重要。

我的做法是逐条回答两个问题：

1. **这个问题在实际场景下会出 bug 吗？** —— 大多数 AI 标记的问题，答案是"不会"。理论上不完美不等于实际会出事。
2. **修它的代价是什么？** —— 为了修复一个极窄的边界情况而改动 100 行代码，性价比太低。

一套 Review 下来，AI 可能列出十几条，我们真正动手修的通常就三四条。**AI 擅长找问题，不擅长决策。后者需要人对整个项目的理解。**

### Step 3：修复与交叉验证

确定要修的问题后，用一个模型执行修复，用另一个模型验证修复结果：

```
# Fix Agent（比如用 Claude）
> 按照 summary.md 中勾选的问题逐个修复，修复后跑测试

# Verify Agent（比如用 GPT）
> 检查 Fix Agent 的修复结果，验证每个问题是否真正解决，有没有引入新问题
```

**铁律：Review 和 Fix 不能是同一个模型。** 和人做 Code Review 一个道理——自己写的 bug 自己看不出来，是思维惯性问题。

如果 Verify Agent 发现问题未修复或引入了新 bug，就进入下一轮 Fix → Verify 循环，直到所有标记的问题都解决。

## 工具链选型

### Hermes Agent + Claude Code

我们的核心工作流基于 [Hermes Agent](https://github.com/nousresearch/hermes-agent)——一个支持多模型调度的 AI Agent 框架。它让我们可以在同一个界面中切换不同模型，管理 Review 流程。

编码任务通过 Claude Code CLI 执行，Review 任务通过 Hermes Agent 的多模型能力完成。这种分工让编码和审查使用不同的"思维模式"。

### API Fallback 机制

我们配置了多渠道 API 降级：主力用 Anthropic Claude，备用 OpenAI 和 DeepSeek。这不仅保证了可用性，也天然支持了多模型 Review 的需求——不同渠道用不同模型，正好满足交叉验证。

### 自动化集成

在飞轮迭代流程中，每个功能完成后自动触发 Review：

1. Claude Code 完成编码
2. 自动 git diff 生成变更摘要
3. 多模型并行 Review
4. 汇总报告 + 人工确认
5. 修复 + 验证
6. git commit + push + Release

## 踩坑记录

### 坑 1：不要滥用多模型

小改动（几个文件、几十行）用一个模型就够了。多模型 Review 有成本——每次调用都消耗 token 和时间。我们现在的策略是：**十几个文件以上的大功能用多模型，小修小补用单模型**。

### 坑 2：AI 的"严重"不等于你的"严重"

AI 标记为 High severity 的问题，可能在你的项目上下文中完全不重要。比如它可能标记"缺少 null check"为高危，但你知道那个字段在业务逻辑上不可能为 null。**不要被 severity 标签牵着走。**

### 坑 3：不要让 AI 自动修复所有问题

试过让 AI 自动修复所有 Review 发现的问题，结果是过度优化——改了不该改的代码，引入了新的 bug。**人工筛选是整个流程中最重要的一环。**

### 坑 4：Verify 必须用不同模型

用同一个模型做 Fix 和 Verify，等于自己检查自己。我们实测发现，换一个模型做 Verify 能多发现 15-20% 的修复遗漏。

## 总结

用了一段时间多模型 Review，几个真实感受：

1. **最大的价值是减少焦虑**。以前 AI 写完代码不敢直接合，因为不确定有没有坑。现在走完这套流程，至少知道哪些坑是评估过的、哪些是故意不修的。合代码心里有底。

2. **多模型确实有效，但不要滥用**。大功能才用，小改动一个模型就够了。

3. **核心就三点**：
   - 多个 AI 帮你审，减少盲区
   - 人工逐条 Check，决定修不修
   - 修完跑测试，并且交叉验证

这套流程不是什么银弹，但它解决了一个很朴素的问题：**用多个 AI 发现尽量多的问题，然后由人来决定哪些值得修。**

如果你也在用 AI 写大部分代码，Review 跟不上了，可以试试类似的流程。不需要完全照搬我们的，根据自己的项目规模和团队情况调整就好。

---

*参考来源：[Viking - 我是怎样使用 AI 来做 Code Review 的？](https://vikingz.me/ai-code-review/) | [Review Forge](https://github.com/vikingmute/review-forge)*