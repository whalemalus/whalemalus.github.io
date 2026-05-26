---
layout: post
title: "让 AI 帮你写 GUI：DocMind 设置页面的 Claude Code 实战"
date: 2026-05-09
categories: 技术教程
tags: ["Claude Code", "AI Agent", "Gradio"]
excerpt: "DocMind 的 AI 模型配置一直藏在 JSON 文件里，本文记录了如何用 Claude Code 在一个晚上内把配置文件变成一个完整的 Gradio 设置页面。"
image: "https://whalemalus.com/file/cover-docmind-settings-gui-key"
original_url: "https://whalemalus.com/articles/docmind-settings-gui-claude-code"
---

# 让 AI 帮你写 GUI：DocMind 设置页面的 Claude Code 实战

> **摘要**：DocMind 是一个本地文件智能助手，但它的 AI 模型配置一直藏在 JSON 文件里，普通用户根本不知道怎么改。本文记录了如何用 Claude Code 在一个晚上内把配置文件变成一个完整的 Gradio 设置页面——包括踩坑、修 Bug、跑通 443 个测试的全过程。
>
> **关键词**：`DocMind` `Claude Code` `Gradio` `AI 模型配置` `自动化开发`

---

## 楔子

凌晨四点，盯着终端里 Claude Code 的输出，看到它把 8 个文件改完、34 个新测试全部通过的那一刻，我有种奇怪的感觉——这已经不是第一次了。

DocMind 的设置页面从"用户只能手动编辑 JSON"到"点几下鼠标就能切换 AI 模型"，整个过程花了一个多小时。其中 Claude Code 写代码大概占了 20 分钟，剩下的时间都在处理它留下的坑。

## 引言

DocMind 是一个本地文件智能助手，支持文件浏览、AI 摘要、问答、知识库和知识图谱。技术栈是 Python + Gradio 6.x + ChromaDB，前端就是一个 Tab 页界面。

问题出在 AI 模型配置上。DocMind 支持多个 AI 提供商（OpenAI、Claude、DeepSeek、本地 Ollama），每个提供商可以配多个 channel，每个 channel 有自己的 API 地址、密钥和模型列表。这些配置全在 `data/settings.json` 里：

```json
{
  "channels": [
    {
      "name": "openai",
      "base_url": "https://api.openai.com/v1",
      "api_key": "sk-...",
      "models": ["gpt-4o", "gpt-4o-mini"],
      "priority": 10,
      "enabled": true
    }
  ],
  "defaults": {
    "summarizer_model": "gpt-4o",
    "qa_model": "gpt-4o",
    "kg_model": "gpt-4o-mini"
  }
}
```

对于开发者来说改 JSON 没什么，但 DocMind 是要分发给普通用户的。让他们打开 VS Code 改 JSON？不现实。

目标很明确：做一个 GUI 设置页面，让用户在浏览器里就能管理 AI 模型配置。

## 全景地图：DocMind 的架构

> 鸟瞰 DocMind 的完整架构，理解设置页面在其中的位置

```
┌─────────────────────────────────────────────────────┐
│                    DocMind                           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ 文件浏览  │  │  AI 摘要  │  │   问答   │          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
│       │              │              │                │
│       ▼              ▼              ▼                │
│  ┌──────────────────────────────────────┐           │
│  │          Gateway Core                │           │
│  │  (AI 模型路由、Channel 管理)          │           │
│  └──────────────┬───────────────────────┘           │
│                  │                                   │
│  ┌───────────────┼───────────────────┐              │
│  │               ▼                   │              │
│  │  ┌─────────────────────────────┐  │              │
│  │  │     Settings (data/)        │  │              │
│  │  │  channels + defaults        │  │              │
│  │  └─────────────────────────────┘  │              │
│  │                                   │              │
│  │  ┌─────────────────────────────┐  │              │
│  │  │     Settings GUI (新增)      │  │              │
│  │  │  Gradio 组件 + API 端点      │  │              │
│  │  └─────────────────────────────┘  │              │
│  └───────────────────────────────────┘              │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ 知识库    │  │ 知识图谱  │  │  设置    │ ← 新增   │
│  └──────────┘  └──────────┘  └──────────┘          │
└─────────────────────────────────────────────────────┘
```

设置页面需要做的事情：
1. **读取配置**：从 `data/settings.json` 加载 channels 和 defaults
2. **展示列表**：每个 channel 显示名称、URL、模型列表、优先级、启用状态
3. **增删改查**：添加新 channel、编辑已有配置、删除不需要的
4. **模型选择**：下拉框选择默认的摘要模型、问答模型、知识图谱模型
5. **持久化**：修改后自动保存到 `settings.json`

## 核心概念：Claude Code 的工作模式

### 委托 vs 直接执行

这次尝试了两种方式让 Claude Code 干活：

**方式一：delegate_task（子代理）**
```python
delegate_task(
    goal="实现 DocMind 的 Settings GUI 页面",
    context="项目路径: /home/claude-user/docmind, 技术栈: Python + Gradio 6.x",
    acp_command="claude",
    acp_args=["--acp", "--stdio", "--model", "claude-opus-4-6"]
)
```

结果：失败。`--acp` 选项在 Claude Code CLI 中不存在。

**方式二：terminal + claude -p（直接调用）**
```bash
su - claude-user -c "
  export ANTHROPIC_API_KEY='sk-ant-...'
  export ANTHROPIC_BASE_URL='http://localhost:8090/anthropic'
  cd /home/claude-user/docmind
  claude -p '实现 Settings GUI 页面...' --max-turns 30 --dangerously-skip-permissions
"
```

结果：成功（但有副作用）。Claude Code 创建了文件但没提交，还留下了两个 Bug。

### Claude Code 的"半成品"问题

Claude Code 在这次任务中 hit 了 max-turns（30 轮）限制。它创建了所有需要的文件，写了 34 个测试，但没有执行 `git commit`。这意味着：

1. 文件已经存在，但没有版本记录
2. 测试文件和实现文件可能不完全匹配
3. 需要人工检查和修复

这是 Claude Code 的一个常见模式——它擅长写代码，但在"收尾"环节（提交、清理、验证）经常掉链子。

## 实战指南：从 JSON 到 GUI

### 第一步：设计文档

先写一份设计文档，明确需求：

```markdown
# Settings GUI 设计

## 功能需求
1. Channel 管理：添加/编辑/删除 AI 模型 channel
2. 默认模型选择：为摘要、问答、知识图谱选择默认模型
3. 一键测试：测试 channel 连通性
4. 优先级排序：拖拽调整 channel 优先级

## 技术方案
- 后端：FastAPI 路由 + JSON 持久化
- 副端：Gradio 组件（gr.Dataframe, gr.Dropdown, gr.Button）
```

### 第二步：让 Claude Code 写代码

```bash
su - claude-user -c "
  export ANTHROPIC_API_KEY='your-key'
  export ANTHROPIC_BASE_URL='http://localhost:8090/anthropic'
  cd /home/claude-user/docmind
  claude -p '根据 docs/SETTINGS_GUI_DESIGN.md 实现 Settings 页面：
    1. 创建 src/docmind/web/api/settings.py - 设置持久化模块
    2. 创建 src/docmind/web/components/settings.py - Gradio 设置组件
    3. 修改 src/docmind/web/app.py - 添加设置 Tab
    4. 创建 tests/unit/test_settings.py - 单元测试
    请确保代码风格与现有代码一致。' \
    --max-turns 30 --dangerously-skip-permissions
"
```

Claude Code 创建了 8 个文件（4 个新文件 + 4 个修改），写了 34 个测试。

### 第三步：修复 Claude Code 留下的坑

**Bug 1：测试导入错误**

```python
# 测试文件导入了不存在的函数名
from docmind.web.api.settings import test_channel  # ❌ 不存在

# 实际函数名是 check_channel
from docmind.web.api.settings import check_channel  # ✅ 正确
```

修复：在测试文件中用 `patch()` 替换导入。

**Bug 2：Channel 排序逻辑缺失**

```python
# Claude Code 写的 _refresh_channels() 没有排序
def _refresh_channels(self):
    channels = load_settings()["channels"]
    # 直接返回，没有按优先级排序

# 修复：加上 sorted()
def _refresh_channels(self):
    channels = load_settings()["channels"]
    channels = sorted(channels, key=lambda ch: ch.get("priority", 100))
```

### 第四步：跑通测试

```bash
cd /home/claude-user/docmind
python -m pytest tests/ -v

# 结果：443 passed
# 包括 34 个新增的 Settings 测试
```

### 第五步：提交发布

```bash
git add -A
git commit -m "feat: AI 模型配置 GUI (Settings 页面)"
git tag v0.6.0
git push origin master --tags
```

## 踩坑记录

### 坑 1：Claude Code 的 --acp 选项不存在

**现象**：`delegate_task` 使用 `acp_command="claude"` 调用 Claude Code，返回错误。

**原因**：Claude Code CLI 不支持 `--acp` 选项。这个选项是 Hermes Agent 自己的概念，不是 Claude Code 的。

**解决**：改用 `terminal()` + `claude -p '...' --max-turns N --dangerously-skip-permissions`。

### 坑 2：Claude Code 不提交代码

**现象**：Claude Code 创建了所有文件，但 `git status` 显示全是 untracked files。

**原因**：Claude Code 在 30 轮 max-turns 内完成了代码编写，但没有执行 `git commit`。它可能认为"代码写完了就是完成"，或者在最后几轮被截断了。

**解决**：人工执行 `git add -A && git commit`。这是 Claude Code 的一个已知行为模式——它擅长"写"，不擅长"收尾"。

### 坑 3：测试函数名和实现不匹配

**现象**：`pytest` 报错 `ImportError: cannot import name 'test_channel'`。

**原因**：Claude Code 在写测试时用了 `test_channel` 作为函数名，但实现文件中实际函数名是 `check_channel`。两个文件是分开写的，没有交叉验证。

**解决**：在测试文件中用 `unittest.mock.patch` 替换实际导入，或者直接改函数名。这次选择了修改测试文件。

### 坑 4：排序逻辑遗漏

**现象**：Channel 列表不按优先级显示，先添加的排在前面。

**原因**：`_refresh_channels()` 函数直接返回 `settings["channels"]`，没有排序。

**解决**：加一行 `sorted(channels, key=lambda ch: ch.get("priority", 100))`。

### 坑 5：AxonHub API 端点路径

**现象**：Claude Code 调用 `/anthropic` 端点返回 401 Unauthorized。

**原因**：AxonHub 的 API 端点配置需要确认。`/anthropic` 路径可能不正确，需要检查 AxonHub 的实际路由。

**解决**：从 AxonHub 的 SQLite 数据库中提取 API key，确认 base URL 配置正确。最终使用 `http://localhost:8090/anthropic`。

## 总结与展望

### 核心收获

1. **Claude Code 是"快速原型机"**：它能在 20 分钟内写出 8 个文件和 34 个测试，但需要人工检查和修复。把它当成"高级代码生成器"而不是"全栈工程师"。

2. **设计文档是必要的输入**：没有设计文档，Claude Code 会按自己的理解实现，经常偏离需求。有了设计文档，它的输出质量明显提高。

3. **测试是最后的安全网**：Claude Code 写的测试和实现可能不完全匹配，但跑通测试是验证代码正确性的唯一方法。

### 最佳实践

- **先写设计文档，再让 Claude Code 写代码**
- **设置 max-turns=30，避免无限循环**
- **Claude Code 完成后，人工检查并提交**
- **始终跑通测试，不要信任 Claude Code 的"全部通过"报告**

### 延伸阅读

- [Claude Code 官方文档](https://docs.anthropic.com/claude-code)
- [Gradio 6.x 文档](https://www.gradio.app/docs)
- [DocMind 项目](https://github.com/whalemalus/docmind)
