---
layout: post
title: "当监控系统学会自己动手：PCEC 从只报告到真修复的转变"
date: 2026-06-04
categories: DevOps
tags: ["AI Agent", "自动化", "cron", "Docker"]
excerpt: "凌晨3点swap飙到100%，监控系统精准诊断了问题然后什么都没做。记录PCEC如何从诊断型转变为行动型，以及顺带发现的cron任务碰撞问题。"
image: "https://whalemalus.com/file/cover-pce-diagnose-to-act-key"
header:
  teaser: "https://whalemalus.com/file/cover-pce-diagnose-to-act-key"
  overlay_image: "https://whalemalus.com/file/cover-pce-diagnose-to-act-key"
original_url: "https://whalemalus.com/articles/pce-diagnose-to-act"
---

# 当监控系统学会自己动手：PCEC 从"只报告"到"真修复"的转变

> **摘要**：凌晨 3 点，服务器 swap 飙到 100%，监控系统精准诊断了问题——然后什么都没做。3 小时后 swap 继续恶化，差一点 OOM。这篇文章记录了 PCEC（周期进化引擎）如何从"诊断型"转变为"行动型"，以及顺带发现的 cron 任务碰撞问题。
>
> **关键词**：`PCEC` `自愈系统` `swap 内存` `cron 调度` `AI Agent 运维`

---

## 楔子

凌晨 3 点，服务器 swap 飙到 100%。

PCEC（Periodic Cognitive Expansion Cycle，周期进化引擎）在 03:00 的巡检中精准识别了问题：3 个暂停的 Docker 容器占着约 420MB 内存不放，一个孤立的 LSP 进程吃掉 129MB，swappiness 设置过高（60）导致内核过早把内存页换出到磁盘。

诊断报告写得很漂亮。然后 PCEC 关掉了，什么都没执行。

3 小时后，swap 从 98.5% 飙到 100%——零余量。如果再晚半小时，系统就会触发 OOM killer，随机杀进程。

这个故事的结局不算坏：06:00 的 PCEC 运行时，它做了一个以前从没做过的决定——不只报告，直接动手修复。停止 3 个暂停容器，杀掉孤立 LSP，把 swappiness 从 60 降到 30。Swap 从 100% 回落到 73.2%。

这是 PCEC 自诞生以来第一次执行自主修复。从"诊断-报告-等人决策"变成"诊断-判断-直接行动"。这篇文章记录这个转变背后的思考，以及顺带发现的另一个问题：38 个 cron 任务的时间槽碰撞。

## 目录

- [全景地图](#全景地图)
- [核心概念](#核心概念)
- [实战指南](#实战指南)
- [踩坑记录](#踩坑记录)
- [总结](#总结)

## 全景地图

> 鸟瞰 PCEC 自愈系统的完整架构，理解诊断、决策、执行三个环节如何串联

### 架构图

```
┌─────────────────────────────────────────────────┐
│                  PCEC 引擎（每 3 小时）            │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  诊断层   │ →  │  决策层   │ →  │  执行层   │  │
│  │ (Collect) │    │ (Decide)  │    │ (Act)    │  │
│  └──────────┘    └──────────┘    └──────────┘  │
│       │               │               │        │
│       ▼               ▼               ▼        │
│  采集系统指标     判断阈值级别     执行修复动作    │
│  - swap 使用率    - Normal: 报告   - 停止容器     │
│  - 容器状态       - Warning: 建议  - 杀进程       │
│  - 进程列表       - Emergency: 行动 - 调参数      │
│  - 磁盘/内存                                   │
│                                                 │
└─────────────────────────────────────────────────┘

修复后 → 验证 → 记录到 capability_tree → 下次巡检复查
```

### 本文的学习路径

```
问题背景 → 诊断型 PCEC 的局限 → 自主修复协议设计
→ 3am 事件复盘 → cron 碰撞发现 → 错开方案 → 经验总结
```

## 核心概念

> PCEC 是什么，"诊断-行动分离"为什么会出问题

### PCEC 是什么

PCEC 全称 Periodic Cognitive Expansion Cycle（周期进化引擎），是 Hermes Agent 的自进化模块。每 3 小时运行一次，执行"思维爆炸四问"：

1. 当前系统有哪些默认假设可以被挑战？
2. 有哪些步骤可以简化或删除？
3. 有哪些明显的缺陷需要修复？
4. 如果规模增长 10 倍，系统会崩溃吗？

每次运行必须产出三选一：新技能、通用范式、或效率杠杆。

### 诊断-行动分离反模式

这是一个在自动化运维系统中常见的问题模式：

**症状**：系统能精准识别问题，但只输出报告，不执行任何操作。等人类看到报告、做出决策、再手动执行，可能已经过了几小时甚至几天。

**根因**：系统设计者出于安全考虑，把"发现问题"和"修复问题"拆成两个独立流程。诊断模块没有执行权限，只能汇报。

**什么时候这是对的**：生产环境的关键服务（数据库、核心 API），误操作的代价远高于延迟修复。

**什么时候这是错的**：非关键资源的低风险清理（停止已暂停的容器、杀孤立进程、调内核参数）。这些操作可逆、可审计、失败代价低。

### 阈值驱动的决策模型

PCEC 的修复协议用三个阈值级别来决定行动方式：

```
Normal（< 80%）  → 记录，不行动
Warning（80-95%） → 建议修复方案，等确认
Emergency（> 95%）→ 立即执行 Category A 清理
```

Category A 清理指的是低风险、可逆的资源释放操作：
- 停止已暂停的 Docker 容器
- 杀死孤立的 LSP/子进程
- 调低 swappiness 参数

这个分类的关键在于：每一项操作都不会影响正在运行的服务，都可以通过简单命令回滚。

## 实战指南

> 从零开始：如何让 PCEC 支持自主修复

### 第一步：定义 Category A 清理清单

不是所有操作都适合自动执行。Category A 必须满足三个条件：
- **可逆**：能用一条命令撤销
- **低风险**：不会影响正在运行的服务
- **可审计**：每次执行都记录日志

在 memory-pressure-guardian skill 中定义：

```yaml
category_a_cleanup:
  - name: "停止暂停容器"
    command: "docker stop <container>"
    reversible: "docker start <container>"
    risk: low
    
  - name: "杀死孤立 LSP"
    command: "kill <pid>"
    reversible: "不可逆，但 LSP 可自动重启"
    risk: low
    
  - name: "降低 swappiness"
    command: "sysctl vm.swappiness=30"
    reversible: "sysctl vm.swappiness=60"
    risk: low
```

### 第二步：在 PCEC prompt 中嵌入修复协议

PCEC 的 cron prompt 需要加入明确的行动指令：

```
当系统处于 Emergency 阈值（swap > 95% 或内存可用 < 5%）时：
1. 执行 Category A 清理（停止暂停容器、杀孤立进程、调参数）
2. 验证修复效果（等待 30 秒后重新采集指标）
3. 记录修复日志（写入 capability_tree.md）
4. 如果 Category A 不足以缓解，记录建议并等待人工决策
```

### 第三步：3am 事件的完整复盘

时间线：

```
03:00  PCEC 巡检发现 swap 98.5%
       - 诊断：3 个暂停容器（~420MB）、孤立 LSP（129MB）、swappiness=60
       - 行动：只写报告，未执行修复
       
03:00 - 06:00  无人干预，swap 缓慢上升

06:00  PCEC 再次巡检，swap 100%（零余量）
       - 诊断：同上，情况更严重
       - 行动：首次执行自主修复
         1. docker unpause dimstack-app → docker stop dimstack-app（-256MB）
         2. 停止另外 2 个暂停容器（-164MB）
         3. kill 孤立 LSP 进程（-129MB）
         4. sysctl vm.swappiness=30
       - 结果：swap 从 100% → 73.2%，系统恢复正常
```

教训：**3 小时的延迟足以让系统从"可修复"恶化到"濒临 OOM"**。对于非关键资源的低风险清理，等待人类决策的代价远高于自动执行的风险。

### 第四步：cron 任务碰撞检测

在分析 PCEC 运行数据时，顺带发现了一个被忽略数周的问题：cron 任务时间槽碰撞。

38 个 cron 任务中，09:00 工作日有 6 个同时触发：

```
09:00 碰撞（5 个 LLM agent 任务）:
├── pagewise-iteration-morning    # 飞轮迭代，5-15 分钟
├── docmind-iteration-morning     # 飞轮迭代，5-15 分钟
├── Wiki Inbox Scanner            # 知识库扫描
├── 飞轮守护者（*/3 周期任务）     # 巡检
├── PCEC（*/3 周期任务）          # 进化引擎
└── 端口注册表审计                # 脚本任务
```

负载尖峰从正常的 0.3 飙升到 3.98，网关 child_count 达到 6。

**根因**：两个 `*/3 * * * *` 周期任务（飞轮守护者 + PCEC）与所有整点固定任务重叠。

**修复方案**：只需调整分钟数，不改任务逻辑：

```
PCEC:           0 */3 * * *  →  15 */3 * * *   (+15 min 偏移)
docmind-morning: 0 9 * * 1-5 →  15 9 * * 1-5   (+15 min)
Wiki Scanner:    0 9 * * *   →  30 9 * * *     (+30 min)
```

预期效果：09:00 agent 碰撞从 5 个降到 2 个，负载尖峰减少约 60%。

## 踩坑记录

> 真实遇到的问题和解决方案

### 坑 1：Guardian 自动生成空洞任务

**现象**：auto-task-selector.py 输出的任务描述是"功能迭代""探索性改进""项目改进"——没有任何具体文件名、行号、问题描述。

**原因**：脚本的 prompt 没有强制要求输出具体内容。当项目没有明显问题时，它就生成万能但无用的任务描述。

**教训**：低标准系统持续向高标准系统注入垃圾。Guardian 生成的任务如果没有具体文件名+行数+问题描述+修复步骤+验收标准，应该被拒绝。

### 坑 2：重复问题无人升级

**现象**：同一个错误被 Guardian 记录了 6 次，每次独立评估，每次都是"已发现，待处理"，从未升级到更高优先级。

**原因**：Guardian 没有跨运行的状态追踪机制。每次巡检都是独立的，不知道同一个问题已经被发现了多少次。

**解决方案**：创建 recurring-issue-escalation 技能——三层升级机制：
- 第 1-2 次：记录
- 第 3-4 次：提升为 Warning
- 第 5+ 次：提升为 Critical，需要立即处理

### 坑 3：execute_code 超时导致 INSERT 看起来失败

**现象**：在 execute_code 中用 terminal() 执行大文章的 INSERT，60 秒超时返回错误。重试时得到 `Duplicate entry`。

**原因**：execute_code 的 terminal() 默认 60 秒超时。20KB+ 的 Base64 内容 INSERT 可能需要更长时间。服务端 INSERT 完成了，但客户端等不到响应。

**正确做法**：先用 `SELECT id FROM article WHERE id=<new_id>` 验证是否已插入，不要盲目重试。大文章 INSERT 用 `terminal(timeout=120)` 直接调用。

## 总结

### 核心收获

1. **诊断不行动 = 零价值**：在 Emergency 阈值下，报告的价值趋近于零。等 3 小时和等 3 分钟，结果完全不同。
2. **一次自主修复 > 十次诊断报告**：PCEC 06:00 的自主修复是整个系统最有价值的一次运行——不是因为它产出了新技能或新范式，而是因为它实际解决了一个正在恶化的问题。
3. **cron 碰撞是隐形性能杀手**：两个 `*/3` 任务与所有整点任务重叠，被忽略数周。只需偏移 15 分钟就能消除全部碰撞。

### 最佳实践

- Category A 清理（低风险、可逆操作）在 Emergency 阈值下应该自动执行
- 每个 cron 任务都需要检查是否有时间槽碰撞
- Guardian 自动生成的任务必须包含具体文件名和行号，否则拒绝
- 重复出现的问题需要状态追踪和自动升级机制

### 延伸阅读

- [memory-pressure-guardian skill] — 内存压力监控与自动修复协议
- [cron-job-staggering skill] — cron 任务时间槽碰撞检测
- [recurring-issue-escalation skill] — 重复问题三层升级机制