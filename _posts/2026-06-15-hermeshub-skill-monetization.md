---
layout: post
title: "AI Agent 技能变现实战：3 个 Skill 上架 HermesHub 的完整流程"
date: 2026-06-15
categories: 技术教程
tags: ["AI Agent", "HermesHub", "自动化"]
excerpt: "当 HermesHub marketplace 还只有 22 个 skill 的时候，我们把 3 个经过 20+ 轮迭代打磨的实战 skill 脱敏后提交了 PR。这篇文章记录了从挑选 skill 到脱敏再到提交的完整过程。"
image: "https://whalemalus.com/file/cover-hermeshub-skills-key"
header:
  teaser: "https://whalemalus.com/file/cover-hermeshub-skills-key"
  overlay_image: "https://whalemalus.com/file/cover-hermeshub-skills-key"
original_url: "https://whalemalus.com/articles/hermeshub-skill-monetization"
---

# AI Agent 技能变现实战：3 个 Skill 上架 HermesHub 的完整流程

> **摘要**：当 HermesHub marketplace 还只有 22 个 skill 的时候，我们把 3 个经过 20+ 轮迭代打磨的实战 skill 脱敏后提交了 PR。这篇文章记录了从"挑哪些 skill"到"怎么脱敏"再到"提交 PR"的完整过程。
>
> **关键词**：`HermesHub` `AI Agent` `Skill Marketplace` `脱敏` `技能变现`

---

上周末刷到一篇文章，标题大概是"Agent 能干活，也能赚钱了"。里面提到 HermesHub marketplace 目前只有 22 个 skill，市场极早期。我看了一眼自己积累的 100 多个 skill，突然觉得——这些东西不发出去有点浪费。

但发 skill 不像发 npm 包那么简单。skill 里面到处是内部 IP、密码、域名、文件路径，直接 push 上去等于裸奔。得先脱敏。

这篇文章就是这个过程的完整记录：挑了哪 3 个 skill、为什么挑它们、怎么脱敏、踩了什么坑、PR 最终长什么样。

## 目录

- [全景地图](#全景地图)
- [核心概念](#核心概念)
- [实战指南](#实战指南)
- [踩坑记录](#踩坑记录)
- [总结](#总结)

## 全景地图

> 从内部 skill 到公开发布的完整链路

```
┌─────────────────────────────────────────────────────┐
│              Skill 变现路径                           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │ 内部 Skill │───→│ 筛选评估 │───→│ 安全脱敏 │      │
│  │ (100+)    │    │ (通用性)  │    │ (去敏感)  │      │
│  └──────────┘    └──────────┘    └──────────┘      │
│                                          │          │
│                                          ▼          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │ 用户购买  │←───│ 上架审核  │←───│ 提交 PR  │      │
│  │ (x402支付)│    │ (安全扫描)│    │ (GitHub)  │      │
│  └──────────┘    └──────────┘    └──────────┘      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

HermesHub 的商业模式：x402 协议（HTTP 402 + USDC 链上支付），95% 归作者，零中介。目前市场极早期，22 个 skill，先发优势明显。

## 核心概念

> 挑 skill 的三个标准

不是所有 skill 都值得发出去。我用三个标准筛：

**通用性**：这个 skill 解决的问题是不是很多人会遇到？如果只和我的服务器环境绑定（比如"dimstack-blog-management"），发出去没意义。

**实战性**：这个 skill 是不是在真实场景里用过？纸上谈兵的 skill 和经过 20 轮迭代踩过坑的 skill，含金量完全不同。

**独立性**：这个 skill 是不是可以脱离我的环境独立运行？如果它依赖特定的 cron job 或 Docker 容器组合，别人拿到也用不了。

按这三个标准，我从 100 多个 skill 里挑出了 3 个：

| Skill | 类型 | 通用性 | 实战性 | 独立性 |
|-------|------|--------|--------|--------|
| systematic-debugging | debugging | 4阶段根因调查法，任何项目适用 | Vue/SPA、Docker、Python 依赖、卡死进程 4 个专项 recipe | 完全独立 |
| anti-degradation-lock | safety | 变更前 4 道门禁，任何代码变更适用 | 20+ 轮迭代中防止"坏进化" | 完全独立 |
| debt-management | project-management | 三级债务分类 + 生命周期管理 | 每日债务日报实际运行 | 需要 cron 配置（可选） |

## 实战指南

> 从读取 skill 到提交 PR 的完整步骤

### 第一步：读取 skill 内容

```bash
# 查看 skill 完整内容
skill_view(name='systematic-debugging')
skill_view(name='anti-degradation-lock')
skill_view(name='debt-management')
```

### 第二步：脱敏处理

这是最关键的一步。skill 里面可能包含：

- 公网 IP 地址（如 `45.76.xx.xx`）
- 内部域名（如 `whalemalus.com`）
- 密码 / API Key / Token
- 内部文件路径（如 `/opt/dim_stack/`）
- 用户邮箱
- 特定服务的配置信息

**脱敏规则**：
- IP 地址 → 只保留 `127.0.0.1`（localhost 安全）
- 域名 → 移除或替换为通用占位符
- 密码/Token → 全部移除
- 文件路径 → 泛化或移除
- 内部调试专节（如 TUI 调试、内部模块路径）→ 整节删除

我用 `infosec-redaction` skill 辅助脱敏，但最终还是人工过了一遍——自动脱敏会漏掉一些上下文相关的敏感信息（比如"我们的数据库密码是 xxx"这种间接暴露）。

### 第三步：Fork 并创建分支

```bash
cd /tmp/hermeshub
gh repo fork amanning3390/hermeshub --clone=false 2>/dev/null
git remote add whalemalus https://github.com/whalemalus/hermeshub.git
git checkout -b add-whalemalus-skills
```

### 第四步：复制 skill 文件到 HermesHub 结构

HermesHub 的 skill 目录结构是 `/skills/<category>/<skill-name>/SKILL.md`。把脱敏后的 SKILL.md 放进去，确认格式符合模板要求（triggers、description 等 frontmatter 字段）。

### 第五步：提交 PR

```bash
gh pr create \
  --repo amanning3390/hermeshub \
  --head whalemalus:add-whalemalus-skills \
  --base main \
  --title "feat: add 3 battle-tested community skills" \
  --body "## Summary
Adds 3 production-tested skills to HermesHub, all sanitized for public release:
..."
```

PR 提交后，HermesHub 有 65+ 条自动化安全扫描规则会跑一遍。如果脱敏不干净，这一步会打回来。

### 第六步：验证

PR 创建后确认：
- PR 状态正确
- 扫描无报错
- 描述信息完整

最终 PR：[#126](https://github.com/amanning3390/hermeshub/pull/126)

## 踩坑记录

### 坑 1：脱敏不是简单的正则替换

一开始我想用正则批量替换 IP 地址，但发现 skill 里有些 IP 是作为示例出现的（"比如你的服务器 IP 是 x.x.x.x"），有些是真实配置。正则全部替换会导致示例也变成占位符，读起来很怪。

解决：人工过一遍，区分"示例 IP"和"真实 IP"。示例保留，真实替换。

### 坑 2：skill 内容和 skill 引用的区别

有些 skill 引用了其他 skill（比如 debt-management 引用了 anti-degradation-lock）。脱敏时要同时检查被引用的 skill 是否也需要脱敏。

解决：先画出引用关系图，再逐个处理。

### 坑 3：HermesHub 模板有额外要求

HermesHub 的 SKILL.md 模板要求 `triggers` 字段和 `description` 字段，这些在我们的内部 skill 里不一定有。需要补充。

解决：查看 HermesHub 已有 skill 的格式，按模板补充缺失字段。

### 坑 4：Git 权限问题

Fork 后 push 到自己的 repo，再从自己的 repo 发 PR。如果直接 push 到原 repo，会被拒绝（没有写权限）。

解决：
```bash
# 正确流程：fork → clone fork → commit → push to fork → PR to original
gh repo fork amanning3390/hermeshub --clone
cd hermeshub
git checkout -b add-whalemalus-skills
# ... make changes ...
git push origin add-whalemalus-skills
gh pr create --repo amanning3390/hermeshub --head whalemalus:add-whalemalus-skills
```

## 总结

### 核心收获

1. **先发优势是真的**：HermesHub 只有 22 个 skill，市场极早期。现在发上去，相当于 npm 早期的那些包——用户搜什么都能搜到你。

2. **脱敏是最大的工作量**：选 skill、写内容都是次要的，真正花时间的是逐行检查敏感信息。建议平时写 skill 的时候就用通用占位符，不要等发出去的时候再脱。

3. **实战 skill 比理论 skill 值钱**：经过 20 轮迭代踩过坑的 skill，和照着文档写出来的 skill，含金量差距很大。"Battle-tested"不是营销词，是实打实的差异化。

### 最佳实践

- 写 skill 的时候就避免硬编码敏感信息
- 用 `infosec-redaction` 做初筛，但最终必须人工复核
- PR 描述要写清楚"这个 skill 解决什么问题"、"在什么场景下用过"
- 保持 skill 的独立性——别人拿到就能用，不需要你的环境

### 延伸阅读

- [HermesHub Marketplace](https://hermeshub.xyz)
- [x402 协议](https://www.x402.org)
- [Hermes Agent 文档](https://hermes-agent.nousresearch.com/docs)