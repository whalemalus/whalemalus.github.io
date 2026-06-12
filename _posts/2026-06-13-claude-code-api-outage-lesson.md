---
layout: post
title: "当 Claude Code API 突然消失：一个飞轮系统的 24 小时"
date: 2026-06-13
categories: DevOps
tags: ["Claude Code", "飞轮迭代", "自动化"]
excerpt: "Claude Code API 突然不可达 24 小时，两个飞轮系统面对同样故障，一个瘫痪一个完成任务。记录故障发现、影响和教训。"
image: "https://whalemalus.com/file/cover-cc-api-outage-key"
header:
  teaser: "https://whalemalus.com/file/cover-cc-api-outage-key"
  overlay_image: "https://whalemalus.com/file/cover-cc-api-outage-key"
original_url: "https://whalemalus.com/articles/claude-code-api-outage-lesson"
---

# 当 Claude Code API 突然消失：一个飞轮系统的 24 小时

> **摘要**：Claude Code API (port 3456) 突然不可达，持续 24 小时以上。两个飞轮迭代系统面对同样的故障，一个完全瘫痪，另一个照常完成任务。这篇文章记录了故障的发现、影响和教训。
>
> **关键词**：`Claude Code` `飞轮迭代` `故障恢复` `API 不可达` `PCEC`

---

那天下午检查 PageWise 飞轮迭代的执行结果时，我看到所有 Phase 都标记为失败。错误信息很短：`Connection refused`。Claude Code 的 API 端口 3456 没有任何响应。

这不是第一次遇到 API 不可达。通常等几分钟就好了。但这次不一样——从头天晚上到第二天下午，整整 24 小时，端口 3456 都是死的。

同一天运行的另一个飞轮系统 DocMind 却完成了任务。基础设施一样，Claude Code 依赖一样，结果不一样。

## 目录

- [全景地图](#全景地图)
- [核心概念](#核心概念)
- [实战指南](#实战指南)
- [踩坑记录](#踩坑记录)
- [总结](#总结)

## 全景地图

> 理解飞轮系统中 API 依赖的全景

```
┌─────────────────────────────────────────────┐
│           飞轮迭代引擎                        │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────┐    ┌──────────┐               │
│  │ PageWise │    │ DocMind  │               │
│  │ 飞轮     │    │ 飞轮     │               │
│  └────┬─────┘    └────┬─────┘               │
│       │               │                     │
│       ▼               ▼                     │
│  ┌──────────┐    ┌──────────┐               │
│  │ Claude   │    │ terminal │               │
│  │ Code API │    │ / patch  │               │
│  │ :3456    │    │ 直接操作  │               │
│  └────┬─────┘    └────┬─────┘               │
│       │               │                     │
│       ▼               ▼                     │
│    ❌ 失败          ✅ 成功                  │
│                                             │
└─────────────────────────────────────────────┘
```

两个飞轮系统走的路径不同。PageWise 严格依赖 Claude Code API，API 挂了就什么都做不了。DocMind 的 agent 碰巧绕过了 API，直接用 terminal 工具操作文件，完成了任务。

## 核心概念

### 飞轮迭代是什么

飞轮迭代是一种让 AI agent 自主推进项目的方式。引擎读取 TODO 列表，挑选下一个任务，调用 Claude Code 执行，验证结果，然后进入下一轮。每 8-12 小时自动触发一次。

核心依赖链：飞轮引擎 → Claude Code API → 实际编码 → 测试验证 → git commit。

### 为什么 API 不可达会是致命的

飞轮引擎的每个 Phase（需求分析、实现、测试、回顾）都需要调用 Claude Code API。如果 API 不可达，Phase 1 就会失败，后续 Phase 跟着失败。引擎最终输出一份"所有 Phase 失败"的报告，然后——问题来了——它仍然会执行 git commit，提交一份空的迭代报告。

这个 Phase 5 的 bug 已经被记录了三次。第一次手动 revert 了空 commit。第二次在审计历史里标记了。第三次又出现了。根因是引擎的 Phase 5 回顾逻辑没有检查前面的 Phase 是否有实际产出。

### 两种失败模式

**PageWise 的失败模式**：严格依赖 API → API 不可达 → 全部 Phase 失败 → 引擎退出。没有 fallback，没有重试，没有替代路径。

**DocMind 的"成功"模式**：agent 在执行过程中发现 API 不通，转而直接使用 terminal 工具读写文件、运行测试。这不是设计出来的 fallback，而是 agent 的即兴发挥。

## 实战指南

### 检测 API 不可达

```bash
# 检查 Claude Code API 端口
ss -tlnp | grep 3456

# 检查进程是否存在
pgrep -af "claude"

# 检查连接
curl -s http://localhost:3456/health --max-time 5
```

### 飞轮引擎的 fallback 策略

理想的飞轮引擎应该有这样的降级逻辑：

```
Phase 1: 尝试调用 Claude Code API
  ├── 成功 → 继续正常流程
  └── 失败 (Connection refused)
        ├── 重试 2-3 次，间隔 30s
        └── 仍失败 → 降级为 terminal 直接操作
              ├── 用 read_file 读取目标文件
              ├── 用 patch 工具修改代码
              ├── 用 terminal 运行测试
              └── 标记为"降级模式完成"
```

当前的 pagewise-iteration-engine.py 没有这个降级逻辑。API 不通就直接退出，标记为失败。

### Phase 5 的 commit 守卫

引擎在 Phase 1-3 全部失败时不应该执行 git commit。修复方案很简单：

```python
# 在 Phase 5 之前添加检查
impl_phases = [phase1_result, phase2_result, phase3_result]
if all(r.status == 'failed' for r in impl_phases):
    logger.warning("All implementation phases failed, skipping commit")
    return IterationResult(status='failed_no_commit')
```

## 踩坑记录

### 僵尸技能清理：14 个技能归档

同一天，PCEC 进化引擎执行了一次大规模的僵尸技能清理。

背景是这样的：诊断脚本在 12:05 首次检测到 13 个不可达的僵尸技能（超过 30 天未使用，零引用）。到 21:00 周期，实际归档了 14 个——边界条件导致的 1 个差异。

归档的技能分布：
- creative 类别：5 个（baoyu-infographic、touchdesigner-mcp、baoyu-comic 等）
- research 类别：3 个（blogwatcher、polymarket 等）
- devops 类别：2 个
- software-development 类别：2 个
- smart-home、data-science 各 1 个

清理前 120 个活跃技能，清理后 106 个。减少了 12% 的技能发现噪音。

### AP-013：状态报告与实际持久化的不一致

PCEC 引擎还有一个更隐蔽的问题。03:04 和 09:01 两个周期的报告声称添加了新的反模式（AP-011、AP-012），但 15:07 检查时 pcec-state.json 里仍然只有 10 个反模式。

根因：每个 PCEC 周期启动一个全新的 agent 实例。这个实例读取当前状态，在内存中添加新反模式，然后写回文件。但写回时它重建了整个列表，而不是读取 → 合并 → 写回。如果两个周期之间的状态没有正确传递，后一个周期会覆盖前一个周期的写入。

已修复：在诊断脚本中添加了反模式计数回归检测。如果 `anti_patterns` 数组长度减少，立即告警。

### expected-services manifest 过期 51 小时

expected-services manifest 是一个声明式配置文件，记录了系统中应该运行的服务和 cron 任务。健康检查脚本会读取它来判断服务是否异常。

问题是：manifest 文件最后一次更新是 51 小时前。在这期间，系统添加了新的 cron 任务、归档了旧的服务，但 manifest 没有同步更新。健康检查脚本基于过期的 manifest 做判断，可能会漏报新增服务的异常。

教训：声明式配置需要自动保鲜机制。可以设置 48 小时过期自动刷新，或者在每次服务变更时自动更新 manifest。

## 总结

### 核心收获

这次故障暴露了自主系统的一个常见陷阱：依赖单一路径。PageWise 飞轮把所有赌注压在 Claude Code API 上，API 挂了就彻底瘫痪。DocMind 碰巧成功了，但那不是设计出来的弹性，是运气。

真正的弹性需要 fallback 路径。飞轮引擎应该在 API 不可达时降级为直接工具操作，而不是直接退出。这个改进还没做，但至少现在知道该往哪个方向走了。

### 最佳实践

- 飞轮引擎需要 API fallback 机制，不能依赖单一路径
- Phase 5 commit 必须有产出检查守卫
- 声明式配置需要自动保鲜，不能依赖手动刷新
- 僵尸技能清理应该从手动演进为自动化
- 诊断脚本的 patch 积累会导致模糊匹配退化，每 10 次 patch 后应整体重写

### 延伸阅读

- PCEC 周期进化引擎的设计理念
- 飞轮迭代方法论
- Claude Code 最佳实践