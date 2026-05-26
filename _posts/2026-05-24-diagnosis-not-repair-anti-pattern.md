---
layout: post
title: "诊断≠修复：当 AI Agent 的巡检系统陷入“永远在诊断”的死循环"
date: 2026-05-24
categories: DevOps
tags: ["AI Agent", "飞轮迭代", "自动化"]
excerpt: "飞轮守护者巡检系统连续4天检测到同一个CI失败问题，每次都准确诊断出根因，但每次都没能完成修复。本文复盘这个反模式，提出pending_fixes缓存机制。"
image: "https://whalemalus.com/file/cover-diagnosis-not-repair-key"
original_url: "https://whalemalus.com/articles/diagnosis-not-repair-anti-pattern"
---

# 诊断≠修复：当 AI Agent 的巡检系统陷入"永远在诊断"的死循环

> **摘要**：飞轮守护者巡检系统连续 4 天检测到同一个 CI 失败问题，每次都准确诊断出根因，但每次都没能完成修复。本文复盘这个"诊断-丢失-再诊断"的反模式，提出 pending_fixes 缓存机制，让监控系统真正闭环。
>
> **关键词**：`飞轮守护者` `AI Agent` `自动化巡检` `CI/CD` `自愈系统`

---

## 楔子

周三下午三点，飞轮守护者（Flywheel Guardian）准时启动巡检。

扫描 PageWise 项目，发现 5 个测试失败。定位到 `test-coverage-infra.js`，确认根因是 `package.json` 里错误的 `rm -rf` 命令。记录到 Evolution Log。巡检结束。

一切看起来很正常——直到你发现，周一早上九点的那次巡检，做了完全相同的事。

四天。同一个问题。四次诊断。零次修复。

## 引言

自动化监控系统的核心价值不是"发现问题"，而是"解决问题"。一个只会诊断不会修复的巡检系统，和一个只会发告警邮件的监控有什么区别？

本文记录了飞轮守护者巡检系统在实际运行中暴露的一个设计缺陷——"诊断≠修复"反模式，以及我们如何通过一个简单的缓存机制来解决它。

如果你正在构建任何类型的自动化监控或自愈系统，这个教训值得参考。

## 📖 目录

1. [全景地图](#全景地图)
2. [核心概念](#核心概念)
3. [实战指南](#实战指南)
4. [踩坑记录](#踩坑记录)
5. [总结与展望](#总结与展望)

---

## 全景地图

> 鸟瞰自动化巡检系统的完整架构，理解诊断与修复之间的断层

### 飞轮守护者架构

```
┌─────────────────────────────────────────────────────┐
│                  飞轮守护者系统                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │ 定时触发  │───→│ 诊断引擎  │───→│ 修复执行  │      │
│  │ (Cron)   │    │ (Check)  │    │ (Fix)    │      │
│  └──────────┘    └──────────┘    └──────────┘      │
│                        │              ↑             │
│                        │         ⚠️ 断层！          │
│                        ↓              │             │
│                  ┌──────────┐         │             │
│                  │ 诊断结果  │─────────┘             │
│                  │ (临时变量) │  ← 会话结束即丢失       │
│                  └──────────┘                       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 问题的数据流

```
巡检 #1 (周一 09:00)
  → 检测到 CI 失败
  → 诊断根因: package.json 的 rm -rf 问题
  → 会话结束, 诊断结果丢失

巡检 #2 (周一 15:00)
  → 检测到 CI 失败 (同一个)
  → 重新诊断根因 (重复工作)
  → 会话结束, 诊断结果再次丢失

巡检 #3 (周二 09:00)
  → 同上

巡检 #4 (周三 15:00)
  → 同上
  → 第四次诊断同一个问题
```

### 本文的学习路径

问题现象 → 根因分析 → 设计缺陷 → 解决方案 → 实现细节 → 通用模式

---

## 核心概念

### 1. 诊断≠修复反模式

这个反模式的核心特征：

| 特征 | 表现 |
|------|------|
| **诊断能力强** | 能准确找到根因，分析透彻 |
| **修复能力弱** | 诊断结果没有传递给修复环节 |
| **会话隔离** | 每次巡检是独立会话，不共享上下文 |
| **重复工作** | 每次从零开始诊断，浪费计算资源 |
| **时间浪费** | 问题持续存在，用户等待修复 |

类比：就像一个医生每次看诊都准确诊断出病因，但病历本是用铅笔写的，下次来就擦掉了。病人每次来都要重新检查。

### 2. 会话边界问题

AI Agent 的一个根本限制：**会话是无状态的**。

```
会话 A: "发现问题 X, 根因是 Y, 修复方案是 Z"
         ↓ (会话结束)
会话 B: "发现问题 X, 根因是..." (从头开始)
```

这和传统的监控系统不同。Prometheus + Alertmanager 的告警会持久化到数据库，修复脚本可以从数据库读取。但 AI Agent 的"诊断结果"存在于会话的上下文窗口中，会话结束就消失了。

### 3. 闭环缺失

一个完整的自愈系统需要：

```
检测 → 诊断 → 计划 → 执行 → 验证 → 完成
  ↑                                    │
  └──────────── 如果失败 ←──────────────┘
```

飞轮守护者在"诊断"之后断了：

```
检测 → 诊断 → (丢失) → 检测 → 诊断 → (丢失) → ...
```

---

## 实战指南

### 方案：Pending Fixes 缓存机制

核心思想：**将诊断结果持久化到文件，让修复动作可以从文件中恢复上下文**。

#### 1. 定义缓存文件格式

创建 `/root/.hermes/pending_fixes.md`：

```markdown
# Pending Fixes

## [PageWise] CI 失败 - coverage 基础设施
- **检测时间**: 2026-05-20 09:00
- **问题类型**: ci_failed
- **根因**: package.json 第16行 test:coverage 脚本包含 `rm -rf coverage/tmp`，
  与测试断言冲突（测试期望只用 clean-coverage.js）
- **修复方案**:
  1. 编辑 /home/claude-user/pagewise/package.json
  2. 移除 test:coverage 中的 `rm -rf coverage/tmp 2>/dev/null;`
  3. 确保 CI 环境预生成 coverage-summary.json, lcov.info
- **影响范围**: 5/7801 测试失败
- **优先级**: 高（已持续 4 天）
- **状态**: pending
```

#### 2. 修改巡检流程

在诊断脚本中加入缓存读取逻辑：

```python
import os
import yaml
from datetime import datetime

PENDING_FIXES_PATH = "/root/.hermes/pending_fixes.md"

def load_pending_fixes():
    """加载待修复列表"""
    if not os.path.exists(PENDING_FIXES_PATH):
        return []
    # 解析 markdown 格式的待修复项
    fixes = []
    with open(PENDING_FIXES_PATH) as f:
        content = f.read()
    # ... 解析逻辑
    return fixes

def save_pending_fix(project, issue_type, root_cause, fix_plan):
    """保存诊断结果到缓存"""
    entry = {
        "project": project,
        "issue_type": issue_type,
        "root_cause": root_cause,
        "fix_plan": fix_plan,
        "detected_at": datetime.now().isoformat(),
        "status": "pending"
    }
    # 追加到 pending_fixes.md
    with open(PENDING_FIXES_PATH, "a") as f:
        f.write(format_fix_entry(entry))

def check_and_fix(project):
    """巡检主流程：先检查缓存，再诊断"""
    # 第一步：检查是否有待修复项
    pending = load_pending_fixes()
    project_fixes = [f for f in pending if f["project"] == project]
    
    if project_fixes:
        # 有待修复项，直接执行修复
        for fix in project_fixes:
            execute_fix(fix)
        return
    
    # 第二步：没有待修复项，执行诊断
    issues = diagnose(project)
    for issue in issues:
        # 诊断后立即保存到缓存
        save_pending_fix(
            project=project,
            issue_type=issue["type"],
            root_cause=issue["root_cause"],
            fix_plan=issue["fix_plan"]
        )
```

#### 3. 修复执行与验证

```python
def execute_fix(fix):
    """执行修复并验证"""
    print(f"执行修复: {fix['project']} - {fix['issue_type']}")
    
    # 执行修复计划中的每一步
    for step in fix["fix_plan"]:
        result = terminal(step["command"])
        if result["exit_code"] != 0:
            print(f"修复步骤失败: {step}")
            return False
    
    # 验证修复结果
    if verify_fix(fix):
        # 修复成功，从缓存中移除
        remove_from_pending(fix)
        log_evolution(f"修复完成: {fix['issue_type']}")
        return True
    else:
        # 修复失败，更新状态
        update_pending_status(fix, "failed")
        return False
```

### 完整的巡检流程

```
┌──────────┐
│ 定时触发  │
└────┬─────┘
     ↓
┌──────────┐     ┌──────────┐
│ 读取缓存  │────→│ 有待修复? │
└──────────┘     └────┬─────┘
                      │
              ┌───────┴───────┐
              ↓               ↓
         有(执行修复)     无(执行诊断)
              │               │
              ↓               ↓
        ┌──────────┐   ┌──────────┐
        │ 执行修复  │   │ 检测问题  │
        └────┬─────┘   └────┬─────┘
             ↓               ↓
        ┌──────────┐   ┌──────────┐
        │ 验证结果  │   │ 诊断根因  │
        └────┬─────┘   └────┬─────┘
             ↓               ↓
        ┌──────────┐   ┌──────────┐
        │ 更新缓存  │   │ 保存缓存  │
        └──────────┘   └──────────┘
```

---

## 踩坑记录

### 坑 1: 缓存文件格式选择

**现象**：最初用 JSON 格式存储 pending_fixes，但 AI Agent 在会话中直接编辑 JSON 容易出错（引号转义、逗号遗漏）。

**原因**：AI Agent 更擅长读写 Markdown，JSON 的语法严格性在 Agent 自主编辑时是负担。

**解决**：改用 Markdown 格式，用 `## [项目] 标题` 作为分隔符，YAML frontmatter 存储结构化数据。

### 坑 2: 缓存过期问题

**现象**：有些问题在缓存后被其他途径修复了（比如手动修复），但缓存记录还在，导致下次巡检尝试修复一个已解决的问题。

**原因**：缓存没有过期机制和验证逻辑。

**解决**：在执行修复前先验证问题是否仍然存在：

```python
def execute_fix(fix):
    # 先验证问题是否还在
    if not verify_issue_exists(fix):
        remove_from_pending(fix)
        print(f"问题已自行解决: {fix['issue_type']}")
        return True
    # ... 执行修复
```

### 坑 3: 并发巡检冲突

**现象**：两次巡检间隔太短（比如手动触发 + 定时触发），同时读取缓存，重复执行修复。

**原因**：没有锁机制。

**解决**：使用文件锁：

```python
import fcntl

def acquire_lock():
    lock_file = open("/tmp/guardian.lock", "w")
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return lock_file
    except IOError:
        print("另一个巡检正在进行，跳过")
        return None
```

---

## 总结与展望

### 核心收获

1. **监控系统的价值在闭环**：检测和诊断只是手段，修复才是目的。一个不能闭环的监控系统，本质上只是一个昂贵的日志收集器。

2. **AI Agent 需要持久化中间状态**：会话的无状态特性是 Agent 自主工作流的最大障碍。任何需要跨会话传递的信息，都必须显式持久化。

3. **简单机制解决复杂问题**：一个 Markdown 文件就能解决"反复诊断"的问题，不需要复杂的数据库或消息队列。

### 最佳实践

- **诊断即持久化**：诊断完成后立即写入缓存，不要等到会话结束
- **修复前验证**：执行修复前先确认问题仍然存在
- **清理已完成项**：修复成功后立即从缓存中移除
- **记录修复历史**：用 Evolution Log 记录每次修复的完整过程

### 延伸阅读

- 飞轮守护者的完整架构：[飞轮守护者：当 AI Agent 学会自己巡检自己](https://whalemalus.com/article/flywheel-guardian-ai-agent-self-patrol)
- 基础设施自动化巡检实战：[基础设施自动化巡检实战](https://whalemalus.com/article/infra-auto-patrol)
- PageWise 项目的飞轮迭代实践：[PageWise v3.0.0 发布](https://whalemalus.com/article/pagewise-v3-release-5857-tests-102-iterations)
