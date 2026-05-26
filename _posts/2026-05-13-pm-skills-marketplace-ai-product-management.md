---
layout: post
title: "PM Skills Marketplace：65 个技能、36 条工作流，AI 时代的产品经理操作系统"
date: 2026-05-13
categories: 技术教程
tags: []
excerpt: "Paweł Huryn 构建的 PM Skills Marketplace，把 Teresa Torres、Marty Cagan 等顶级产品专家的方法论编码成了 65 个 AI 技能和 36 条链式工作流。本文深度解析 8 大模块及如何融入 AI 驱动的开发流程。"
image: "https://whalemalus.com/file/339406eb56644e69"
original_url: "https://whalemalus.com/articles/pm-skills-marketplace-ai-product-management"
---

# PM Skills Marketplace：65 个技能、36 条工作流，AI 时代的产品经理操作系统

> **摘要**：产品经理用 AI，大多数时候只是用来写文档、改措辞。但 Paweł Huryn（Product Compass 创始人）构建的 PM Skills Marketplace，把 Teresa Torres、Marty Cagan、Alberto Savoia 等顶级产品专家的方法论编码成了 65 个 AI 技能和 36 条链式工作流。本文深度解析这套系统的架构、8 大模块、核心技能，以及如何将其融入 AI 驱动的开发流程。

## 产品经理的 AI 困境

产品经理用 ChatGPT 或 Claude，最常见的场景是：
- "帮我写个 PRD"
- "帮我分析一下竞品"
- "帮我起个产品名"

这些都是「一次性问答」——你问一句，AI 答一段。产出的文档质量取决于你的 prompt 质量，而且 AI 不会主动提醒你遗漏了什么。

PM Skills Marketplace 要解决的问题是：**让 AI 不只是写文档的工具，而是遵循成熟产品方法论的思考伙伴**。

## 什么是 PM Skills Marketplace

这是由 Paweł Huryn（[The Product Compass Newsletter](https://www.productcompass.pm) 创始人）开发的开源项目。它不是一个独立的应用，而是一套为 Claude Code、Cursor 等 AI 编程助手设计的「技能包」。

### 规模概览

| 维度 | 数量 |
|------|------|
| AI 技能（Skills） | 65 个 |
| 链式工作流（Commands） | 36 条 |
| 插件（Plugins） | 8 个 |
| 覆盖领域 | 从发现到战略、执行、上市、增长 |

### 核心理念

> Generic AI gives you text. PM Skills Marketplace gives you structure.
>
> 通用 AI 给你的是文字。PM Skills Marketplace 给你的是结构。

每个技能都编码了一个经过验证的 PM 框架——发现、假设映射、优先级排序、战略——并一步步引导你完成。你得到的是 Teresa Torres、Marty Cagan 和 Alberto Savoia 的严谨方法论，而不是躺在书架上的理论。

## 8 大模块详解

### 1. pm-product-discovery（产品发现）— 13 技能 + 5 命令

**核心价值**：从模糊的想法到验证过的方案，用结构化方法降低产品风险。

**关键技能**：

- **brainstorm-ideas** — 从 PM、设计师、工程师三个视角进行多角度头脑风暴
- **identify-assumptions** — 识别价值、可用性、商业可行性和技术可行性四个维度的风险假设
- **prioritize-assumptions** — 用 Impact × Risk 矩阵优先级排序假设，并建议验证实验
- **opportunity-solution-tree** — Teresa Torres 的 OST 框架：期望成果 → 机会 → 解决方案 → 实验
- **interview-script** — 基于 JTBD（Jobs to Be Done）的结构化用户访谈脚本
- **summarize-interview** — 将访谈记录结构化为 JTBD、满意度信号和行动项

**链式命令**：

```
/discover "AI 驱动的远程会议摘要工具"
```

这条命令会自动串联 4 个技能：头脑风暴 → 识别假设 → 优先排序 → 设计实验。

### 2. pm-product-strategy（产品战略）— 12 技能 + 5 命令

**核心价值**：从愿景到商业模式，从定价到竞争分析，覆盖完整的战略工具箱。

**关键技能**：

- **product-strategy** — 9 部分产品战略画布（愿景 → 防御性）
- **startup-canvas** — 融合产品战略 + 商业模式的创业画布
- **value-proposition** — 6 部分 JTBD 价值主张（Who, Why, What before, How, What after, Alternatives）
- **lean-canvas** / **business-model** — 精益画布和商业模式画布
- **pricing-strategy** — 定价模型、竞品分析、支付意愿估算
- **swot-analysis** / **pestle-analysis** / **porters-five-forces** — 经典战略分析工具

**链式命令**：

```
/strategy "面向中小企业的 B2B 项目管理工具"
/market-scan "项目管理 SaaS 市场"
/pricing "我们的协作工具定价"
```

### 3. pm-execution（产品执行）— 15 技能 + 10 命令

**核心价值**：日常产品管理工作——PRD、OKR、路线图、Sprint、回顾、发版。

**关键技能**：

- **create-prd** — 8 部分 PRD 模板（摘要、背景、目标、市场、价值、方案、发布）
- **brainstorm-okrs** — 团队级 OKR 头脑风暴，对齐公司目标
- **outcome-roadmap** — 将功能列表转化为成果导向的路线图
- **sprint-plan** — Sprint 规划：容量估算、故事选择、依赖映射、风险识别
- **retro** — 结构化 Sprint 回顾引导
- **pre-mortem** — 风险分析：Tigers（真风险）/ Paper Tigers（纸老虎）/ Elephants（房间里的大象）
- **stakeholder-map** — Power × Interest 网格 + 沟通策略
- **user-stories** / **job-stories** — 遵循 3C 和 INVEST 标准的用户故事
- **test-scenarios** — 从用户故事生成测试场景：正常路径、边界情况、错误处理

**链式命令**：

```
/write-prd "智能通知系统，减少告警疲劳"
/sprint plan — 下一个 Sprint 的规划
/sprint retro — 上一个 Sprint 的回顾
/write-stories job — 将「团队仪表盘」功能拆分为 job stories
/test-scenarios — 从用户故事生成测试场景
```

### 4. pm-market-research（市场研究）— 7 技能 + 3 命令

**核心价值**：用户画像、市场细分、旅程地图、市场规模估算、竞品分析。

**关键技能**：

- **user-personas** — 从研究数据创建精细的用户画像
- **market-segments** — 识别 3-5 个客户细分，包含人口统计、JTBD、产品契合度
- **customer-journey-map** — 端到端旅程地图：阶段、触点、情绪、痛点、机会
- **market-sizing** — TAM/SAM/SOM，自上而下和自下而上两种方法
- **competitor-analysis** — 竞品优势、劣势和差异化机会
- **sentiment-analysis** — 用户反馈的情感分析和主题提取

**链式命令**：

```
/research-users "我们有 12 个用户的访谈数据"
/competitive-analysis "设计工具领域的 Figma 竞品"
/analyze-feedback "这里有 200 条 Q4 的 NPS 反馈"
```

### 5. pm-data-analytics（数据分析）— 3 技能 + 3 命令

**核心价值**：让产品经理直接和数据对话。

**关键技能**：

- **sql-queries** — 从自然语言生成 SQL（支持 BigQuery、PostgreSQL、MySQL）
- **cohort-analysis** — 留存曲线、功能采纳、参与度趋势
- **ab-test-analysis** — 统计显著性、样本量验证、上线/扩展/停止建议

**链式命令**：

```
/write-query "按国家显示 Q4 的月活跃用户（BigQuery）"
/analyze-cohorts "1 月 vs 2 月注册用户的周留存"
/analyze-test "这是我们的结账流程 A/B 测试结果"
```

### 6. pm-go-to-market（上市策略）— 6 技能 + 3 命令

**核心价值**：从滩头阵地到增长飞轮，完整的上市策略。

**关键技能**：

- **beachhead-segment** — 识别第一个滩头市场细分
- **ideal-customer-profile** — ICP 画像：人口统计、行为、JTBD、需求
- **growth-loops** — 设计可持续的增长飞轮
- **gtm-motions** — 评估上市动作：产品驱动、销售驱动等
- **competitive-battlecard** — 销售就绪的竞争战卡：异议处理、制胜策略

**链式命令**：

```
/plan-launch "面向中型工程团队的 AI 代码审查工具"
/growth-strategy "连接自由职业者和初创公司的双边市场"
/battlecard "我们的 CRM vs Salesforce（SMB 市场）"
```

### 7. pm-marketing-growth（营销增长）— 5 技能 + 2 命令

**核心价值**：产品营销、定位、北极星指标。

**关键技能**：

- **marketing-ideas** — 有创意、低成本的营销方案
- **positioning-ideas** — 差异化的产品定位
- **value-prop-statements** — 用于营销、销售和引导的价值主张陈述
- **product-name** — 符合品牌价值和目标受众的产品命名
- **north-star-metric** — 北极星指标 + 输入指标 + 商业游戏分类

**链式命令**：

```
/market-product "面向电商管理者的 B2B 分析仪表盘"
/north-star "连接自由职业者和客户的双边市场"
```

### 8. pm-toolkit（工具箱）— 4 技能 + 5 命令

**核心价值**：产品经理的日常工具——简历优化、法律文档、校对。

**关键技能**：

- **review-resume** — PM 简历审查：XYZ+S 公式、关键词优化、结构优化
- **draft-nda** — 保密协议起草：管辖权适配条款
- **privacy-policy** — 隐私政策起草：GDPR/CCPA 合规
- **grammar-check** — 语法、逻辑和流畅度检查：定点修复而非重写

## Skills vs Commands：理解两层架构

PM Skills Marketplace 有两层：

### Skills（技能）= 知识和框架

技能是构建块。每个技能赋予 AI 领域知识、分析框架或引导式工作流。技能在对话中 **自动激活**——当你讨论相关话题时，AI 会自动加载对应的技能。

例如，当你问 "我们这个 AI 写作助手最冒险的假设是什么？" 时，`identify-assumptions` 技能会自动激活，引导你从价值、可用性、商业可行性、技术可行性四个维度分析。

### Commands（命令）= 链式工作流

命令是用户触发的端到端流程，用 `/command` 调用。它们将多个技能串联起来。

例如 `/discover` 命令串联了 4 个技能：

```
/discover "AI 驱动的会议摘要工具"
    │
    ├─ brainstorm-ideas（头脑风暴）
    │   → 从 PM、设计师、工程师视角生成 10+ 个想法
    │
    ├─ identify-assumptions（识别假设）
    │   → 从价值、可用性、商业、技术四个维度识别风险假设
    │
    ├─ prioritize-assumptions（优先排序）
    │   → Impact × Risk 矩阵排序，建议验证实验
    │
    └─ brainstorm-experiments（设计实验）
        → 为每个高风险假设设计精益实验
```

### 命令可以串联

命令设计为可以相互衔接，匹配 PM 的日常工作流。任何命令完成后，它会建议相关的下一步命令——跟着提示走就行。

```
/discover → /write-prd → /sprint plan → /write-stories → /test-scenarios
```

## 安装和使用

### Claude Code（CLI）

```bash
# 添加市场源
claude plugin marketplace add phuryn/pm-skills

# 安装单个插件
claude plugin install pm-product-discovery@pm-skills
claude plugin install pm-product-strategy@pm-skills
claude plugin install pm-execution@pm-skills
claude plugin install pm-market-research@pm-skills
claude plugin install pm-data-analytics@pm-skills
claude plugin install pm-go-to-market@pm-skills
claude plugin install pm-marketing-growth@pm-skills
claude plugin install pm-toolkit@pm-skills
```

### Claude Cowork（非开发者推荐）

1. 打开 Customize（左下角）
2. 进入 Browse plugins → Personal → +
3. 选择 Add marketplace from GitHub
4. 输入：`phuryn/pm-skills`

### 其他 AI 助手（仅技能）

PM Skills 的 `skills/*/SKILL.md` 文件遵循通用技能格式，可以在任何支持技能的工具中使用：

```bash
# 复制所有技能到 OpenCode
for plugin in pm-*/; do
  mkdir -p .opencode/skills/
  cp -r "$plugin/skills/"* .opencode/skills/ 2>/dev/null
done
```

支持：Gemini CLI、OpenCode、Cursor、Codex CLI、Kiro 等。

## 如何融入 AI 驱动的开发流程

这才是最有价值的部分。PM Skills Marketplace 不只是一个「PM 工具」，它可以深度融入 AI 驱动的软件开发流程。

### 场景 1：产品发现阶段

在项目启动前，用 `/discover` 命令系统化地验证想法：

```
/discover "本地文件智能助手，用 AI 帮用户管理、总结、问答文档"
```

AI 会帮你：
1. 从三个视角头脑风暴功能点
2. 识别最冒险的假设
3. 用 Impact × Risk 矩阵排序
4. 设计最小化验证实验

### 场景 2：需求文档阶段

用 `/write-prd` 生成结构化的 PRD：

```
/write-prd "文档知识图谱功能：自动从文档中提取实体和关系，构建可视化知识网络"
```

产出的 PRD 包含 8 个标准部分：摘要、背景、目标、市场细分、价值主张、方案细节、指标、发布计划。

### 场景 3：Sprint 规划阶段

用 `/sprint plan` 做 Sprint 规划，包含容量估算、故事选择、依赖映射和风险识别。

### 场景 4：与 UUPM 协同

PM Skills 负责「做什么」，UI-UX Pro Max 负责「怎么做」：

```
PM Skills: /write-prd "设置页面" → 定义功能需求和用户故事
    ↓
UI-UX Pro Max: 为设置页面生成设计系统 → 推荐 Soft UI Evolution 风格
    ↓
Claude Code: 按照 PRD + 设计系统实现代码
```

### 场景 5：上市策略阶段

功能开发完成后，用 `/plan-launch` 规划上市：

```
/plan-launch "DocMind 本地文件智能助手，面向知识工作者"
```

AI 会帮你识别滩头市场、定义 ICP、设计信息传递、选择渠道、制定发布计划。

## 方法论来源

PM Skills Marketplace 的技能不是凭空设计的，而是基于这些顶级产品专家的方法论：

| 专家 | 著作 | 对应技能 |
|------|------|----------|
| Teresa Torres | *Continuous Discovery Habits* | opportunity-solution-tree |
| Marty Cagan | *INSPIRED* / *TRANSFORMED* | product-strategy, value-proposition |
| Alberto Savoia | *The Right It* | brainstorm-experiments-new |
| Dan Olsen | *The Lean Product Playbook* | user-personas, market-segments |
| Roger L. Martin | *Playing to Win* | product-strategy |
| Ash Maurya | *Running Lean* | lean-canvas, startup-canvas |
| Christina Wodtke | *Radical Focus* | brainstorm-okrs |
| Anthony W. Ulwick | *Jobs to Be Done* | job-stories, value-proposition |
| Sean Ellis | *Hacking Growth* | growth-loops, north-star-metric |
| Maja Voje | *Go-To-Market Strategist* | gtm-strategy, beachhead-segment |

## 适合谁用

| 角色 | 使用场景 |
|------|----------|
| **产品经理** | 日常工作的结构化框架，避免遗漏关键维度 |
| **创业者** | 从想法到上市的完整路径 |
| **技术负责人** | 需要做产品决策但缺少 PM 方法论 |
| **独立开发者** | 一个人兼顾开发和产品 |
| **AI 工程师** | 构建 AI 产品时的需求分析和市场定位 |

## 总结

PM Skills Marketplace 把产品经理的「隐性知识」编码成了 AI 可执行的「显性框架」。65 个技能覆盖了产品管理的完整生命周期，36 条链式命令让复杂的方法论变得一键可用。

在我们的实践中，最大的价值不是「让 AI 写 PRD 更快」，而是「让 AI 提醒你不要忘记重要的事情」。当你用 `/discover` 命令时，AI 不会直接给你一个方案，而是先帮你识别假设、排序风险、设计实验——这才是产品经理应该做的事情。

---

**相关链接**：
- GitHub: github.com/phuryn/pm-skills
- 作者: Paweł Huryn — [The Product Compass Newsletter](https://www.productcompass.pm)
- 许可证: MIT
