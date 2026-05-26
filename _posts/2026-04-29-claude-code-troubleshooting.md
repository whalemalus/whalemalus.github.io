---
layout: post
title: "Claude Code 调优实战：当\"慢\"的真相是权限问题"
date: 2026-04-29
categories: DevOps
tags: ["Claude Code", "AI Agent"]
excerpt: "Claude Code 调用耗时异常，原以为是 API 网关延迟，排查后发现是文件权限问题。修复后 10 轮飞轮迭代，测试从 537 增长到 663 个。"
image: "https://whalemalus.com/file/cover-cc-troubleshoot-key"
header:
  teaser: "https://whalemalus.com/file/cover-cc-troubleshoot-key"
  overlay_image: "https://whalemalus.com/file/cover-cc-troubleshoot-key"
original_url: "https://whalemalus.com/articles/claude-code-troubleshooting"
---

# Claude Code 调优实战：当"慢"的真相是权限问题

> **摘要**：Claude Code 调用耗时异常，原以为是 API 网关延迟，排查后发现是文件权限问题——`tests/` 目录属于 root，而 Claude Code 运行在普通用户下，每次调用都在权限报错中耗尽所有轮次。修复后 10 轮飞轮迭代，测试从 537 增长到 663 个。
>
> **关键词**：`Claude Code` `权限问题` `飞轮迭代` `AI Agent` `测试覆盖`

---

## 楔子

那天下午，Claude Code 又"卡住"了。

我盯着终端，看着 Claude Code 一轮又一轮地尝试各种方案——`sudo`、`setfacl`、Python 重定向——每个都失败。12 轮用完，什么也没完成。

"这代理也太慢了，"我心想，"AxonHub 网关是不是有问题？"

测了一下延迟——6 毫秒。不是网关的问题。

那是什么？

直到我用 `ls -la` 看了一眼项目目录，真相才浮出水面：`tests/` 目录的 owner 是 `root`，而 Claude Code 运行在 `claude-user` 用户下。

**它不是慢，它是被权限挡住了，然后把所有轮次都浪费在了"怎么绕过权限"上。**

## 引言

这个故事的核心教训很简单：**在 AI Agent 的世界里，权限问题不会报错然后停止，它会默默消耗你所有的调用轮次，让你以为是性能问题。**

这篇文章会讲清楚三件事：

1. **怎么发现的** — 从"网关慢"到"权限问题"的排查过程
2. **怎么修的** — 一行 `chown` 解决，加上 5 个 Claude Code 调优技巧
3. **修完之后** — 10 轮飞轮迭代，测试覆盖从 537 到 663

如果你也在用 Claude Code 做自动化开发，这篇文章能帮你避开一个隐蔽的坑。

---

## 📖 目录

1. [全景地图](#全景地图)
2. [核心概念](#核心概念)
3. [实战指南](#实战指南)
4. [踩坑记录](#踩坑记录)
5. [总结与展望](#总结与展望)

---

## 全景地图

> 鸟瞰 Claude Agent 调用链路，理解每个环节可能出问题的地方

### 调用链路架构

```
┌─────────────────────────────────────────────────────┐
│                  Hermes Agent                        │
│  (任务编排、飞轮迭代、结果收集)                        │
└──────────────────────┬──────────────────────────────┘
                       │ delegate_task
                       ▼
┌─────────────────────────────────────────────────────┐
│               Claude Code CLI                        │
│  版本: 2.1.119                                       │
│  用户: claude-user (uid=1000)                        │
│  最大轮次: 12                                         │
│  参数: --bare --effort low                           │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP API
                       ▼
┌─────────────────────────────────────────────────────┐
│            AxonHub API 网关                           │
│  地址: localhost:8090/anthropic                      │
│  延迟: ~6ms                                          │
│  功能: 请求转发、模型路由                              │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│          Anthropic API (Claude Sonnet 4)             │
└─────────────────────────────────────────────────────┘
```

### 问题定位路径

```
现象: Claude Code 调用"极慢"
  │
  ├─ 假设1: AxonHub 网关延迟 → 测量: 6ms，排除
  │
  ├─ 假设2: Claude Code 版本问题 → 更新到 2.1.119，未解决
  │
  └─ 假设3: 文件权限问题 → ls -la tests/ → owner=root ✓
     │
     └─ 修复: chown -R claude-user:claude-user → 问题解决
```

### 本文的学习路径

```
排查思路 → 权限修复 → 调优技巧 → 飞轮迭代 → 最佳实践
```

---

## 核心概念

### 1. Claude Code 的轮次机制

Claude Code 每次调用有**最大轮次限制**（默认 12 轮）。每一轮包括：思考 → 生成工具调用 → 执行 → 观察结果。

**关键理解**：如果某一步反复失败，Claude Code 不会立即停止，而是会尝试各种 workaround，直到轮次耗尽。

```
轮次 1: 尝试写文件 → Permission denied
轮次 2: 尝试 sudo → Permission denied (--dangerously-skip-permissions 不允许)
轮次 3: 尝试 setfacl → Permission denied
轮次 4: 尝试 Python 写文件 → Permission denied
...
轮次 12: 轮次耗尽，任务未完成
```

**类比**：这就像一个实习生被锁在办公室外面，他不会直接告诉你"我进不去"，而是会花一整天尝试各种方式——翻窗户、找物业、撬锁——最后你才发现他根本没有钥匙。

### 2. 用户隔离与权限模型

Claude Code 运行在 `claude-user`（uid=1000）下，而 Hermes Agent 运行在 `root` 下。

```
root 创建文件 → owner=root, group=root
claude-user 尝试写入 → Permission denied
```

**根本原因**：Hermes 的 `write_file` 工具以 root 身份创建文件，导致文件 owner 是 root。当 Claude Code（claude-user）尝试在同一目录创建测试文件时，权限不足。

### 3. 飞轮迭代方法论

飞轮迭代（Flywheel Iteration）是一种增量式开发方法：

```
Round N: 选择模块 → 生成测试 → 运行验证 → 提交 → 下一轮
```

每轮：
- **聚焦一个模块**，不贪多
- **自动生成测试**，不手写
- **必须全部通过**才能进入下一轮
- **每轮一个 commit**，可追溯

**类比**：像滚雪球——每一轮都让雪球更大一点，而动量（已有的测试基础设施）让后续轮次越来越快。

---

## 实战指南

### 第一步：排查 Claude Code "慢"的问题

```bash
# 1. 测量 AxonHub 网关延迟
curl -w "\
延迟: %{time_total}s\
" -s http://localhost:8090/anthropic/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-6","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'
# 结果: 延迟 ~0.006s → 网关不是瓶颈

# 2. 检查项目目录权限
ls -la /home/claude-user/pagewise/tests/
# drwxr-xr-x 2 root root 4096 ... tests/  ← owner 是 root！

# 3. 检查 Claude Code 运行用户
ps aux | grep claude
# claude-user  12345  ... claude ...
```

### 第二步：修复权限问题

```bash
# 一行命令解决
chown -R claude-user:claude-user /home/claude-user/pagewise/

# 验证
ls -la /home/claude-user/pagewise/tests/
# drwxr-xr-x 2 claude-user claude-user 4096 ... tests/  ← 修复成功
```

### 第三步：Claude Code 调优技巧

#### 技巧1：`--bare --effort low` 减少思考开销

```bash
# 优化前：简单任务也要 12 轮
claude --dangerously-skip-permissions

# 优化后：简单任务 5-8 轮完成
claude --bare --effort low
```

- `--bare`：减少输出格式化
- `--effort low`：降低思考深度，适合简单任务

#### 技巧2：Pre-Reading Pattern（预读模式）

不要让 Claude Code 自己去读文件，直接把代码嵌入 prompt：

```bash
# 写 prompt 到文件
cat > /tmp/prompt.txt << 'PROMPT'
请为以下代码编写单元测试：

```javascript
// lib/utils.js
function saveConversation(messages) {
  chrome.storage.session.set({ conversation: messages });
}
function loadConversation() {
  return chrome.storage.session.get('conversation');
}
```

要求：使用 node:test，覆盖正常和异常情况。
PROMPT

# 通过 cat 管道传入，避免 shell 转义问题
su - claude-user -c 'ANTHROPIC_BASE_URL=http://localhost:8090/anthropic claude --bare --effort low < /tmp/prompt.txt'
```

#### 技巧3：权限预检（每次调用前执行）

```bash
# 创建一个权限修复脚本
cat > /tmp/fix-perms.sh << 'EOF'
#!/bin/bash
chown -R claude-user:claude-user /home/claude-user/pagewise/
EOF
chmod +x /tmp/fix-perms.sh

# 每次委托 Claude Code 前运行
/tmp/fix-perms.sh
```

#### 技巧4：环境变量显式导出

```bash
# root 不能直接用 --dangerously-skip-permissions
# 必须 su 到 claude-user 并显式导出环境变量
su - claude-user -c '
  export ANTHROPIC_BASE_URL=http://localhost:8090/anthropic
  export ANTHROPIC_API_KEY=your-key-here
  claude --bare --effort low < /tmp/prompt.txt
'
```

### 第四步：飞轮迭代执行

修复权限后，执行 10 轮飞轮迭代：

```bash
# Round 1: SkillStore 模块 (12 tests)
# Round 2: Custom Skills (16 tests)
# Round 3: AI Client (17 tests)
# Round 4: Knowledge Base (10 tests)
# Round 5: Page Sense (8 tests)
# Round 6: Memory System (8 tests)
# Round 7: Conversation Store (8 tests)
# Round 8: Spaced Repetition (8 tests)
# Round 9: Prompt Templates + Stats (10 tests)
# Round 10: Integration + Edge Cases (29 tests)
```

每轮的执行流程：

```
1. 选择目标模块
2. 读取源代码，嵌入 prompt
3. 委托 Claude Code 生成测试
4. 运行全部测试（包括历史测试）
5. 全部通过 → git commit
6. 进入下一轮
```

**最终结果**：537 → 663 测试（+126），10 个 commit，全部通过 ✅

---

## 踩坑记录

### 坑1：权限问题伪装成性能问题

**现象**：Claude Code 调用"极慢"，每次都要 12 轮才能结束（而且任务没完成）

**原因**：`tests/` 目录 owner 是 root，Claude Code（claude-user）无法创建文件，每轮都在尝试各种 workaround

**解决**：
```bash
chown -R claude-user:claude-user /home/claude-user/pagewise/
```

**教训**：在 AI Agent 场景下，权限问题不会直接报错停止，而是会静默消耗所有调用轮次。排查"慢"的问题时，先检查权限。

### 坑2：`--dangerously-skip-permissions` 不允许 root 使用

**现象**：以 root 身份运行 Claude Code，`--dangerously-skip-permissions` 不生效

**原因**：Claude Code 出于安全考虑，不允许 root 绕过权限检查

**解决**：
```bash
su - claude-user -c 'claude --bare --effort low'
```

### 坑3：Shell 转义问题导致 prompt 丢失

**现象**：直接在命令行传 prompt，特殊字符被 shell 解释

**原因**：prompt 中包含引号、反引号、美元符号等

**解决**：写到文件，通过 cat 管道传入
```bash
echo 'prompt...' > /tmp/prompt.txt
su - claude-user -c 'claude < /tmp/prompt.txt'
```

### 坑4：R9 测试假设错误的 API 行为

**现象**：`saveTemplate` 测试失败，假设用户传入 ID，实际是自动生成

**原因**：Claude Code 生成测试时没有先确认 API 行为，基于假设编写

**解决**：先读源码确认 API 签名，再写测试。在 prompt 中明确要求"先确认 API 行为"

---

## 总结与展望

### 核心收获

1. **权限问题是 AI Agent 的隐形杀手** — 它不会报错停止，而是静默消耗所有轮次
2. **排查"慢"的问题，先看权限** — `ls -la` 比 `curl` 测延迟更有用
3. **飞轮迭代有效** — 聚焦单模块 + 自动测试 + 每轮提交，10 轮增长 126 个测试

### 最佳实践

| 实践 | 说明 |
|------|------|
| 权限预检 | 每次委托 Claude Code 前 `chown` 项目目录 |
| `--bare --effort low` | 简单任务用低开销模式，5-8 轮完成 |
| Pre-Reading Pattern | 把代码嵌入 prompt，不让 Claude Code 自己读文件 |
| 文件管道传参 | 用 `/tmp/prompt.txt` + `cat` 避免 shell 转义 |
| 飞轮迭代 | 每轮一个模块，全量测试，一个 commit |

### 延伸阅读

- [Claude Code 官方文档](https://docs.anthropic.com/claude-code)
- [把 Claude Code 接入飞书](https://whalemalus.com/article/claude-code-to-feishu)
- [飞轮迭代方法论](https://whalemalus.com/article/docker-deployment-guide)
