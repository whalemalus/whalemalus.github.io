---
layout: post
title: "PageWise Skill Engine E2E：从测试中发现设计决策"
date: 2026-05-03
categories: DevOps
tags: ["Chrome Extension", "Claude Code", "飞轮迭代", "AI Agent"]
excerpt: "PageWise 在第 42 轮飞轮迭代中完成了 Skill Engine 的端到端测试，发现 saveSkill() 故意不持久化参数字段这一设计决策。同时完成了 W18 周度复盘，项目测试覆盖率达到 1.44:1 的测试/代码比。"
image: "https://whalemalus.com/file/cover-skill-engine-e2e-key"
header:
  teaser: "https://whalemalus.com/file/cover-skill-engine-e2e-key"
  overlay_image: "https://whalemalus.com/file/cover-skill-engine-e2e-key"
original_url: "https://whalemalus.com/articles/pagewise-skill-engine-e2e-r42"
---

# 标题

> **摘要**：PageWise 在第 42 轮飞轮迭代中完成了 Skill Engine 的端到端测试，发现 `saveSkill()` 故意不持久化参数字段这一设计决策。同时完成了 W18 周度复盘，项目测试覆盖率达到 1.44:1 的测试/代码比。
>
> **关键词**：`PageWise` `E2E 测试` `Skill Engine` `飞轮迭代` `Chrome 扩展`

---

## 楔子

写到第 23 个测试用例时，我发现了一个 bug。

不对，这不是 bug。

`saveSkill()` 保存技能到 IndexedDB 时，`parameters` 字段被丢弃了。我反复看了三遍代码，确认这不是遗漏——参数是通过 `toEngineSkill` 桥接层在运行时注入的，根本不应该持久化。

这是 PageWise 飞轮迭代的第 42 轮。从第 1 轮的 95 个测试，到现在的 2111 个测试，我越来越习惯这种"发现异常→深挖原因→理解设计意图"的循环。很多时候，你以为的 bug 其实是别人深思熟虑后的选择。

## 引言

PageWise 是一个 Chrome 浏览器扩展（Manifest V3），用纯 JavaScript + IndexedDB 实现了 AI 知识管理功能。项目采用飞轮迭代方法论，通过 Claude Code 作为自动化编码执行器，持续进行端到端测试。

到第 42 轮迭代时，项目已经完成了 157 次提交，积累了 16,704 行代码和 24,051 行测试。这篇文章记录 R42 的 Skill Engine 测试过程，以及 W18 周度复盘的关键发现。

## 📖 目录

1. [全景地图](#1-全景地图)
2. [核心概念](#2-核心概念)
3. [实战指南](#3-实战指南)

---

## 全景地图

> 鸟瞰 PageWise 测试体系的完整架构，理解各模块之间的关系

### 架构图

```
┌─────────────────────────────────────────────────────┐
│                PageWise 测试金字塔                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │           Phase 5: 设计审查 (R71-R72)         │  │
│  ├───────────────────────────────────────────────┤  │
│  │      Phase 4: 边界/可靠性测试 (R65-R70)       │  │
│  ├───────────────────────────────────────────────┤  │
│  │      Phase 3: 跨模块集成测试 (R59-R64)        │  │
│  ├───────────────────────────────────────────────┤  │
│  │      Phase 2: 深层 E2E 测试 (R49-R58)         │  │
│  ├───────────────────────────────────────────────┤  │
│  │  ★ Phase 1: 核心模块 E2E (R36-R48) ← R42 在此 │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  测试框架: node:test (零依赖)                        │
│  Mock 层: chrome-mock.js + indexeddb-mock.js        │
│  质量门: ≥90% 通过, 80-89% 修复, <80% 重做          │
└─────────────────────────────────────────────────────┘
```

### Skill Engine 三模块架构

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ SkillEngine │    │ SkillStore  │    │ CustomSkills │
│ (内存注册表) │    │ (远程市场)  │    │ (本地 CRUD) │
├─────────────┤    ├─────────────┤    ├─────────────┤
│ register()  │    │ fetchSkills │    │ saveSkill() │
│ query()     │    │ installSkill│    │ getAllSkills │
│ execute()   │    │ isInstalled │    │ deleteSkill │
│ toPrompt()  │    └─────────────┘    │ toggleSkill │
│ hooks       │                       │ renderTpl   │
└─────────────┘                       └─────────────┘
       ↑                                      │
       └──────── toEngineSkill 桥接 ──────────┘
```

### 本文的学习路径

R35 错误处理 → R41 PDF 提取 → R42 Skill Engine → W18 复盘 → ROADMAP 规划

---

## 2. 核心概念

> 关键术语和原理的深度解释

### 飞轮迭代方法论

飞轮迭代不是"写代码→测试→发布"的线性流程，而是一个五阶段循环：

1. **需求分析** — Plan Agent 读取源文件，生成需求文档
2. **设计方案** — Plan Agent 输出设计文档
3. **实现编码** — Sub Agent（Claude Code）编写代码和测试
4. **质量评审** — Guard Agent 五维评分（需求合规 30% + 代码质量 25% + 安全 20% + 性能 15% + 测试覆盖 10%）
5. **复盘文档** — 记录发现、教训和改进点

每轮迭代产生一个独立的测试文件和迭代报告，形成可追溯的工程记录。

### Skill Engine 的桥接层设计

PageWise 的技能系统有个容易被误解的设计：`saveSkill()` 不持久化 `parameters` 字段。

这不是 bug。技能的参数分两层：
- **定义层**：技能描述中用 `{{variable}}` 标记的模板变量
- **运行时层**：通过 `toEngineSkill()` 桥接函数注入的实际参数值

持久化的是定义层（模板），运行时参数由调用方提供。这种分离让同一个技能模板可以在不同上下文中复用。

### 质量门机制

Guard Agent 的五维评分系统：

| 维度 | 权重 | 评估内容 |
|------|------|----------|
| 需求合规 | 30% | 测试覆盖了所有需求点吗？ |
| 代码质量 | 25% | 命名清晰、结构合理、无重复？ |
| 安全性 | 20% | 无注入风险、权限最小化？ |
| 性能 | 15% | 无内存泄漏、无阻塞操作？ |
| 测试覆盖 | 10% | 边界条件、异常路径覆盖？ |

≥90 分自动通过，80-89 分修复 P1 后通过，<80 分需要重做（最多 3 轮）。

---

## 3. 实战指南

> 从零开始的实操步骤

### R42 Skill Engine E2E 测试

R42 的目标是为 Skill Engine 编写端到端测试，覆盖技能的完整生命周期。

#### 测试覆盖范围

```javascript
// tests/test-skill-engine-e2e.js — 23 个测试用例，8 个 suite

// Suite 1: 技能加载→注册→执行管线
test('load and register skill from store', async () => {
  // 模拟从远程市场加载技能
  // 验证注册到内存注册表
  // 执行技能并验证输出
});

// Suite 2: CRUD 生命周期
test('create, read, update, delete custom skill', async () => {
  // 保存技能到 IndexedDB
  // 读取并验证字段完整性
  // 更新技能描述
  // 删除并确认清理
});

// Suite 3: 参数传递与模板渲染
test('template variable extraction and rendering', async () => {
  // 从 '{{name}} does {{action}}' 提取变量
  // 渲染模板并验证输出
  // 关键发现: saveSkill() 不持久化 parameters
});

// Suite 4: 触发匹配
test('skill trigger matching with patterns', async () => {
  // 验证正则匹配
  // 验证关键词匹配
  // 验证优先级排序
});

// Suite 5: 容量限制（20 个技能上限）
test('capacity limit enforcement', async () => {
  // 注册 20 个技能
  // 第 21 个应该被拒绝或替换最旧的
});

// Suite 6: Hook 集成
test('skill hooks integration', async () => {
  // beforeExecute / afterExecute 钩子
  // 错误处理钩子
});

// Suite 7: 分类与批量操作
test('category and batch operations', async () => {
  // 按分类筛选
  // 批量启用/禁用
});

// Suite 8: 错误处理
test('error handling in skill operations', async () => {
  // 无效技能格式
  // IndexedDB 写入失败
  // 执行超时
});
```

#### 关键发现：saveSkill() 的设计决策

```javascript
// lib/custom-skills.js 中的 saveSkill()
async saveSkill(skill) {
  const record = {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    trigger: skill.trigger,
    template: skill.template,
    // ⚠️ 注意：parameters 字段没有被保存
    // 这是设计决策，不是 bug
    // 参数在运行时通过 toEngineSkill() 注入
  };
  await this.db.put('skills', record);
}
```

这个发现来自测试过程：当测试期望 `saveSkill()` + `getSkillById()` 能完整保留 `parameters` 字段时，测试失败了。深入分析后发现，`toEngineSkill()` 桥接函数在技能执行时动态注入参数，持久化参数反而会造成状态污染。

#### Pre-Reading Pattern

在用 Claude Code 编写测试时，我们发现了一个有效的模式：

```
❌ 错误方式：让 Claude Code 读取源文件再写测试
   → Claude Code 花 20 轮读文件，猜错 API 名称 ~30%

✅ 正确方式：把 API 签名直接嵌入 prompt
   → Claude Code 准确理解接口，5 轮内完成
```

具体做法：
```bash
# 把源文件的 API 签名提取到临时文件
cat > /tmp/prompt.txt << 'EOF'
Write E2E tests for the following API:

class SkillEngine {
  register(skill) — register skill to in-memory registry
  query(text) — find matching skills by trigger
  execute(skillId, params) — run skill with parameters
  toPrompt() — serialize all skills to prompt string
}

Use node:test and node:assert/strict.
EOF

# 用管道传入 Claude Code
cat /tmp/prompt.txt | claude -p --max-turns 25 --bare --effort low
```

### W18 周度复盘

#### 项目健康指标

| 指标 | 数值 | 说明 |
|------|------|------|
| 总提交数 | 157 | 从项目创建至今 |
| 代码行数 | 16,704 | lib/ 目录 |
| 测试行数 | 24,051 | tests/ 目录 |
| 测试/代码比 | 1.44:1 | 测试代码比业务代码多 44% |
| 测试用例数 | 2,111 | 100% 通过率 |
| 测试文件数 | 79 | 平均每文件 26.7 个测试 |
| lib/ 模块数 | 34 | 平均每模块 491 行 |
| TODO/FIXME | 0 | lib/ 目录无待办 |
| 版本 | v1.5.1 | 当前发布版本 |

#### ROADMAP 首次创建

W18 复盘时发现项目没有 ROADMAP.md，于是创建了完整的五阶段路线图：

```
Phase 1: 核心模块 E2E (R36-R48) — 完成 70%
Phase 2: 深层 E2E (R49-R58) — 未开始
Phase 3: 跨模块集成 (R59-R64) — 未开始
Phase 4: 边界/可靠性 (R65-R70) — 未开始
Phase 5: 设计审查 (R71-R72) — 未开始
```

ROADMAP 的价值在于：它把散落在 TODO.md 中的任务组织成了有依赖关系的阶段，让每轮迭代都知道自己在整体中的位置。

---

## 踩坑记录

### 坑 1：Claude Code 长 prompt 返回空输出

**现象**：prompt 超过 ~800 字符时，Claude Code 的 `--print` 模式返回空输出（exit code 0）。

**原因**：Shell 内联 echo 长字符串时，特殊字符（引号、反斜杠）会被 shell 解释，导致 prompt 内容被截断或转义。

**解决**：用临时文件 + 管道替代 inline echo：
```bash
# ❌ 失败方式
claude -p "Write tests for the following very long prompt..."

# ✅ 正确方式
cat /tmp/prompt.txt | claude -p --max-turns 25 --bare --effort low
```

### 坑 2：迭代引擎脚本 API Key 占位符

**现象**：自动化迭代引擎脚本 (`iteration-engine.py`) 调用 Claude Code 时返回 401 Unauthorized。

**原因**：脚本第 103 行的 `ANTHROPIC_API_KEY` 被硬编码为 `***`（脱敏占位符），而不是从配置文件读取。

**解决**：从 `/home/claude-user/.claude/settings.json` 读取实际 API Key：
```python
import json
settings = json.load(open('/home/claude-user/.claude/settings.json'))
api_key = settings.get('apiKey', '')
```

### 坑 3：TODO.md 多进程冲突

**现象**：多个 cron 任务同时修改 TODO.md，导致 checkbox 状态不一致。

**原因**：飞轮迭代引擎每天运行 3 次（09:00/14:00/20:00），加上周度复盘等任务，多个进程可能同时写入 TODO.md。

**解决**：在修改前先 `git pull` 获取最新版本，修改后立即 `git push`。

---

## 总结与展望

- **核心收获**：E2E 测试不仅能发现 bug，还能验证设计决策。R42 中发现的 `saveSkill()` 不持久化参数，如果不是写了测试，这个设计意图可能永远不会被文档化。
- **最佳实践**：Pre-Reading Pattern 是用 Claude Code 写测试的最高效方式——把 API 签名嵌入 prompt，而不是让它自己去读源码。
- **延伸阅读**：飞轮迭代方法论详见 [飞轮迭代：让 AI Agent 持续改进项目的工程方法](https://whalemalus.com/article/flywheel-iteration-methodology)

**下一步计划**：
- R43: Spaced Repetition E2E（间隔重复算法测试）
- R44: Knowledge Graph + Entity Extractor E2E（知识图谱测试）
- R45: Wiki Store + Query E2E（Wiki 存储测试）
