---
layout: post
title: "飞轮守护者：当 AI Agent 学会自己巡检自己"
date: 2026-05-22
categories: DevOps
tags: ["飞轮迭代", "Claude Code", "自动化"]
excerpt: "飞轮守护者是一个自动化巡检系统，定时检查多个 AI 项目的健康状态，自动修复 TODO 耗尽、CI 失败等问题，并触发飞轮迭代。"
image: "https://whalemalus.com/file/cover-flywheel-guardian-key"
header:
  teaser: "https://whalemalus.com/file/cover-flywheel-guardian-key"
  overlay_image: "https://whalemalus.com/file/cover-flywheel-guardian-key"
original_url: "https://whalemalus.com/articles/flywheel-guardian-ai-agent-self-patrol"
---

# 飞轮守护者：当 AI Agent 学会自己巡检自己

> **摘要**：飞轮守护者是一个自动化巡检系统，定时检查多个 AI 项目的健康状态，自动修复 TODO 耗尽、CI 失败等问题，并触发飞轮迭代。本文记录了它在 DocMind 和 PageWise 两个项目上的实战表现。
>
> **关键词**：`飞轮迭代` `自动化巡检` `Claude Code` `Flywheel Guardian` `CI/CD`

---

## 楔子

凌晨三点，你被一条消息吵醒："PageWise CI 挂了。"

你打开电脑，登录 GitHub Actions，翻了 50 条日志，发现是覆盖率报告生成脚本缺了一个防御性清理命令。修一行配置，推送，等 CI 跑完——前后花了 40 分钟。

第二天早上，你发现 DocMind 已经 29 小时没有新提交了。TODO 列表里还有 10 个任务，但没人推动。

这两个场景，现在都被一个 cron 任务解决了。

## 引言

在持续迭代的 AI 项目中，有两个常见的"隐形杀手"：

1. **TODO 耗尽**——任务做完了，没人生成新任务，项目就停了
2. **CI 静默失败**——测试挂了，但没人看，问题越积越多

飞轮守护者（Flywheel Guardian）就是为了解决这两个问题而生的。它每 3 小时自动运行一次，像一个不知疲倦的值班工程师，巡检所有注册项目，发现问题就修，修不了就报警。

## 📖 目录

1. [全景地图](#全景地图)
2. [核心概念](#核心概念)
3. [实战指南](#实战指南)
4. [踩坑记录](#踩坑记录)
5. [总结与展望](#总结与展望)

---

## 全景地图

> 鸟瞰飞轮守护者的完整架构，理解各组件之间的关系

### 架构图

```
┌──────────────────────────────────────────────────────┐
│                   Cron Scheduler                      │
│              (每 3 小时触发一次)                        │
└─────────────────────┬────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────┐
│              flywheel-guardian-check.py                │
│                                                       │
│  ┌─────────┐    ┌──────────┐    ┌─────────────────┐ │
│  │ 诊断引擎 │───▶│ 自动修复 │───▶│   巡检报告生成   │ │
│  └────┬────┘    └────┬─────┘    └─────────────────┘ │
│       │              │                                │
│       ▼              ▼                                │
│  ┌─────────┐    ┌──────────┐                         │
│  │ 项目注册 │    │ 修复限制 │                         │
│  │  表 (.py)│    │ (最多3个) │                         │
│  └─────────┘    └──────────┘                         │
└──────────────────────────────────────────────────────┘
           │              │
           ▼              ▼
    ┌────────────┐  ┌────────────────┐
    │  DocMind   │  │   PageWise     │
    │ (Python)   │  │ (Chrome Ext)   │
    └────────────┘  └────────────────┘
```

### 巡检流程

```
诊断 → 分类问题 → 尝试修复 → 验证 → 记录 → 报告
  │                                        │
  │  发现超过 3 个问题？                     │
  └─── 是 → 只修前 3 个，其余标记为需人工介入 ─┘
```

### 本文的学习路径

概念理解 → 脚本剖析 → 问题诊断 → 自动修复 → 实战结果

---

## 核心概念

### 飞轮迭代（Flywheel Iteration）

飞轮迭代是一种 AI 驱动的持续开发模式：

- **任务自动生成**：TODO 清空后，脚本自动分析项目状态，生成下一批任务
- **Claude Code 执行**：每个任务由 Claude Code 子进程独立完成
- **质量门禁**：测试通过率 ≥90% 才允许提交
- **演进日志**：每轮迭代记录到 EVOLUTION-LOG.md

类比：飞轮就像一个自动贩卖机——你投进去一个"项目状态"，它吐出来一个"提交记录"。但如果贩卖机空了（TODO 耗尽），它就停了。守护者的工作就是确保贩卖机永远有货。

### 守护者模式（Guardian Pattern）

守护者不是"做事的人"，而是"确保有人在做事的人"。它的职责边界很清晰：

| 守护者能做的 | 守护者不能做的 |
|-------------|---------------|
| 检测 TODO 耗尽并生成新任务 | 修复复杂的业务逻辑 Bug |
| 检测 CI 失败并诊断原因 | 重构大段代码 |
| 清理重复的 TODO 条目 | 决定项目方向 |
| 触发飞轮迭代 | 替代人工 Code Review |
| 记录巡检日志 | 保证迭代质量 |

### 修复限制（3-Fix Rule）

守护者每次巡检最多自动修复 3 个问题。这不是偷懒，是安全阀：

- 防止一个错误的修复逻辑在循环中反复触发
- 避免自动修复引入新问题
- 超过 3 个问题说明项目有更深层的问题，需要人工介入

---

## 实战指南

### 1. 诊断脚本核心逻辑

```python
# flywheel-guardian-check.py 核心结构
def check_project(project_path, project_type):
    issues = []
    
    # 检查 1: TODO 是否耗尽
    todo_count = count_pending_tasks(project_path)
    if todo_count == 0:
        issues.append(("todo_depleted", project_path))
    
    # 检查 2: CI 是否失败
    ci_status = check_github_ci(project_path)
    if ci_status == "failed":
        issues.append(("ci_failed", project_path))
    
    # 检查 3: 最后提交时间
    last_commit_hours = hours_since_last_commit(project_path)
    if last_commit_hours > 24:
        issues.append(("stalled", project_path))
    
    return issues
```

### 2. 自动修复 TODO 耗尽

```bash
# 触发任务自动生成
python3 /home/claude-user/scripts/auto-task-selector.py /home/claude-user/pagewise

# ⚠️ 踩坑：auto-task-selector.py 只接受 1 个参数
# 错误：python3 auto-task-selector.py /path arg2  → 报错
# 正确：python3 auto-task-selector.py /path
```

### 3. CI 失败诊断

```bash
# 获取最近一次 CI 运行的状态
gh run list --repo whalemalus/pagewise --limit 1 --json status,conclusion,databaseId

# 下载失败日志
gh run view <run_id> --repo whalemalus/pagewise --log-failed
```

### 4. 清理重复 TODO

```python
# 检测并清理重复的任务条目
def clean_duplicate_tasks(todo_path):
    lines = open(todo_path).readlines()
    seen = set()
    cleaned = []
    for line in lines:
        task_key = extract_task_id(line)  # 如 "R181"
        if task_key and task_key in seen:
            continue  # 跳过重复
        seen.add(task_key)
        cleaned.append(line)
    
    if len(cleaned) < len(lines):
        write_file(todo_path, cleaned)
        log_fix(f"Removed {len(lines) - len(cleaned)} duplicate tasks")
```

### 5. 触发飞轮迭代

```bash
# 通过 Claude Code wrapper 触发迭代
/home/claude-user/scripts/claude-code-wrapper.sh \
  --prompt "执行任务 L002: REST API 模块拆分" \
  --project /home/claude-user/docmind
```

---

## 踩坑记录

### 坑 1：auto-task-selector.py 参数错误

**现象**：守护者调用 `auto-task-selector.py` 时传了 2 个参数，报错 `accepts at most 1 arg(s), received 2`。

**原因**：脚本设计只接受项目路径 1 个参数，但守护者把项目路径和项目类型都传进去了。

**解决**：只传项目路径：
```bash
python3 auto-task-selector.py /home/claude-user/pagewise
```

### 坑 2：Cron 环境中 Claude Code 子进程不稳定

**现象**：飞轮迭代引擎在 cron 环境中启动的 `claude -p` 子进程频繁超时（300s/600s），每个进程占用 ~200MB RAM。

**原因**：Cron 环境没有交互式终端，Claude Code 的某些行为依赖 TTY。加上 300s 的默认超时限制，复杂任务根本跑不完。

**解决**：Cron 飞轮迭代应该直接使用 Hermes 的原生工具链（read → patch → terminal），绕过 Claude Code 子进程层。引擎脚本只用于诊断和任务选择。

### 坑 3：孤儿进程堆积

**现象**：一次巡检发现 6+ 个 `claude -p` 孤儿进程，每个占用 200-500MB 内存。

**原因**：之前的迭代引擎超时后，子进程没有被正确清理。

**解决**：在巡检开始时检查并清理孤儿进程：
```bash
ps aux | grep "claude -p" | grep -v grep | awk '{print $2}' | xargs -r kill
```

### 坑 4：容器长时间闲置后进入 Paused 状态

**现象**：Docker 容器 `dimstack-app` 在长时间闲置后状态变为 `Paused`，导致所有操作失败。

**解决**：巡检前先检查容器状态：
```bash
docker ps -a --filter name=dimstack-app --format '{{.Status}}' | grep -q Paused && docker unpause dimstack-app
```

---

## 总结与展望

### 核心收获

1. **自动化巡检的价值不在于"修了多少"，而在于"发现了什么"**——29 小时无提交、TODO 清空、CI 静默失败，这些问题如果不被发现，会持续恶化。

2. **修复限制是必要的安全阀**——每次最多修 3 个问题，避免自动修复变成自动破坏。

3. **Cron 环境和交互式环境是两个世界**——在终端里能跑的脚本，在 cron 里可能完全不工作。Claude Code 子进程在 cron 中的不稳定性就是一个典型例子。

### 最佳实践

- 守护者只做"检测 + 轻量修复"，复杂修复留给飞轮迭代或人工
- 每次巡检记录到 EVOLUTION-LOG.md，形成可追溯的运维日志
- 孤儿进程清理应该在巡检开始时执行，而不是结束时
- 容器状态检查是所有 Docker 操作的前置条件

### 延伸阅读

- 飞轮迭代引擎的完整设计：`pagewise-iteration-engine.py`
- 任务自动生成方法论：`references/task-generation-methodology.md`
- Claude Code Session Logging：如何记录和复用 AI 对话经验
