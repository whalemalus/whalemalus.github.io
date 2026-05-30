---
layout: post
title: "一日四役：从删掉 39,500 行代码到飞轮引擎的集体沉默"
date: 2026-05-16
categories: DevOps
tags: ["飞轮迭代", "Docker", "Vue.js", "自动化", "Claude Code"]
excerpt: "2026年5月15日四场技术实战：DocMind删掉39500行Gradio代码迁移到Vue3，PageWise飞轮引擎连续三轮产出为零，Hermes Agent接入7引擎元搜索，以及磁盘100%满导致MySQL崩溃的紧急抢修。"
image: "https://whalemalus.com/file/cover-four-battles-key"
header:
  teaser: "https://whalemalus.com/file/cover-four-battles-key"
  overlay_image: "https://whalemalus.com/file/cover-four-battles-key"
original_url: "https://whalemalus.com/articles/four-battles-automation-day"
---

# 一日四役：从删掉 39,500 行代码到飞轮引擎的集体沉默

> **摘要**：2026 年 5 月 15 日，四场技术实战同时展开，DocMind 从 Gradio 迁移到 Vue 3 删掉近 4 万行代码，PageWise 飞轮迭代引擎连续三轮产出为零，Hermes Agent 接入 7 引擎元搜索，以及一次磁盘 100% 满导致 MySQL 崩溃的紧急抢修。本文记录这一天的完整技术细节与踩坑经验。
>
> **关键词**：`Vue 3 迁移` `飞轮迭代` `自动化陷阱` `磁盘空间` `元搜索`

---

## 楔子

凌晨两点，手机震了一下。Hermes 的定时任务发来消息：磁盘满了，MySQL 容器在反复崩溃。我迷迷糊糊看了一眼，60G 的盘用了 60G，一分不剩。

清理完缓存、重启容器、发布完文章，天已经亮了。打开飞书，发现 Claude Code 已经在后台默默删掉了 DocMind 的 39,500 行 Gradio 代码。下午，PageWise 的飞轮迭代引擎跑了三轮，报告上写着"全部通过"，但 git diff 是空的。

这一天像是自动化的压力测试，有些自动化表现惊艳，有些则暴露了深层的信任危机。

---

## 引言

自动化是把双刃剑。做得好，它能在你睡觉时删掉 39,500 行废弃代码并让 3,470 个测试全部通过；做得不好，它跑完三轮迭代告诉你"一切正常"，但实际上一行代码都没写。

5 月 15 日这一天，我在四个不同的项目上经历了自动化的两面：DocMind 的 Claude Code 清理做得很顺利，PageWise 的飞轮引擎却连续翻车，Hermes Agent 的搜索插件接入半途而废，而凌晨的磁盘危机则提醒我，再聪明的自动化，也扛不住物理资源的枯竭。

---


## 目录

- [楔子](#楔子)
- [引言](#引言)
- [全景地图](#全景地图)
- [实战一：DocMind 39,500 行 Gradio 代码清理](#实战一docmind-39500-行-gradio-代码清理)
- [实战二：PageWise 飞轮引擎的三轮沉默](#实战二pagewise-飞轮引擎的三轮沉默)
- [实战三：Hermes Agent 接入 webserp 元搜索](#实战三hermes-agent-接入-webserp-元搜索)
- [实战四：磁盘 100% 满的紧急抢修](#实战四磁盘-100-满的紧急抢修)
- [踩坑记录](#踩坑记录)
- [总结与展望](#总结与展望)

## 目录

1. [全景地图：四个战场的全局视角](#全景地图)
2. [实战一：DocMind 39,500 行 Gradio 代码清理](#实战一docmind-39500-行-gradio-代码清理)
3. [实战二：PageWise 飞轮引擎的三轮沉默](#实战二pagewise-飞轮引擎的三轮沉默)
4. [实战三：Hermes Agent 接入 webserp 元搜索](#实战三hermes-agent-接入-webserp-元搜索)
5. [实战四：磁盘 100% 满的紧急抢修](#实战四磁盘-100-满的紧急抢修)
6. [踩坑记录](#踩坑记录)
7. [总结与展望](#总结与展望)

---

## 全景地图

>  2026-05-15 四个技术战场的全局关系

```
┌─────────────────────────────────────────────────────────────────┐
│                     2026-05-15 技术全景                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   DocMind    │    │  PageWise    │    │  Hermes      │      │
│  │  Gradio→Vue  │    │  飞轮迭代    │    │  元搜索接入   │      │
│  │  ✅ 成功     │    │  ❌ 失败     │    │  ⏸️ 未完成    │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                   │                   │               │
│         │   Claude Code     │   Claude Code     │   手动编码    │
│         │   自动执行         │   子代理调用       │   + 子代理    │
│         │                   │                   │               │
│         └───────────┬───────┴───────────────────┘               │
│                     │                                           │
│              ┌──────┴──────┐                                    │
│              │  磁盘危机    │                                    │
│              │  100% 满     │                                    │
│              │  MySQL 崩溃  │                                    │
│              └─────────────┘                                    │
└─────────────────────────────────────────────────────────────────┘
```

### 本文的学习路径

1. **成功的自动化**：理解为什么 DocMind 的 Claude Code 清理能一次成功
2. **失败的自动化**：分析飞轮引擎三轮沉默的根因
3. **未完成的自动化**：webserp 接入为何卡在最后一步
4. **基础设施的底线**：磁盘危机的教训

---

## 实战一：DocMind 39,500 行 Gradio 代码清理

### 背景

DocMind 是一个文档智能分析平台，最初用 Gradio 做前端。随着功能复杂化，Gradio 的局限性越来越明显，组件定制困难、状态管理混乱、测试覆盖无法保证。团队决定迁移到 Vue 3 + FastAPI 架构。

问题在于：旧的 Gradio 代码散布在 40+ 个组件文件、55 个测试文件和 10+ 个静态资源中，手动清理几乎不可能不出错。

### Claude Code 的执行过程

这次清理完全由 Claude Code 自动执行，通过 wrapper 脚本调度：

```bash
# 调用 Claude Code 执行清理任务
claude --model claude-sonnet-4-20250514 --bare --dangerously-skip-permissions
# 参数文件: /tmp/docmind-cleanup-gradio.txt
```

**第一轮清理**：删除 21,501 行
- 40+ Gradio 组件文件（`_legacy/gradio/` 和 `src/docmind/web/`）
- 10+ 静态资源文件
- 修改了 `src/docmind/main.py`（移除 `--legacy-gradio` 参数）
- 更新 Docker 配置

**第二轮修复**：测试驱动的迭代
- 清理后跑测试，发现 55 个 Gradio 测试文件还在引用已删除的模块
- 批量删除这些测试文件
- 修复 `FileResponse` 类型注解导致的 Pydantic 错误
- 修复 catch-all 路由缺少 OpenAPI tags 的问题

### 最终结果

```
3470 passed, 6 pre-existing failures, 8 errors (missing deps)
两个提交:
  dd13809 (-39,454 行删除)
  c8dd937 (+8/-2 修复)
```

### 新架构

```
┌─────────────────────────────────────────┐
│           DocMind 新架构                 │
├─────────────────────────────────────────┤
│                                         │
│  浏览器请求 → FastAPI (Uvicorn)         │
│      │                                  │
│      ├── /api/v1/* → REST API          │
│      ├── /docs     → Swagger UI         │
│      ├── /assets/* → Vue 静态资源       │
│      └── /*        → Vue SPA (catch-all)│
│                                         │
│  Dockerfile:                            │
│    Node.js/npm → npm run build          │
│    Python → uvicorn main:app            │
└─────────────────────────────────────────┘
```

### 为什么这次成功了？

1. **任务边界清晰**：删除 Gradio 代码是一个定义明确的操作，找到所有 Gradio 相关文件，删除，修复引用
2. **有即时反馈**：测试套件 3,470 个测试提供了即时验证
3. **迭代式修复**：不是一次性完成，而是删完跑测试、失败就修、再跑再修
4. **不涉及业务逻辑**：纯清理操作，不需要理解复杂的业务需求

---

## 实战二：PageWise 飞轮引擎的三轮沉默

### 背景

PageWise 是一个 Chrome 浏览器扩展（Manifest V3），帮助用户在浏览技术网页时即时向 AI 提问。项目采用飞轮迭代引擎，一个自动化的五阶段开发流程：

```
需求分析 → 设计 → 实现 → 验证 → 回顾
```

引擎由 Python 脚本驱动，每个阶段调用 Claude Code CLI 子代理执行。项目已经完成了 85 轮迭代（R1-R85），积累了 1,873 个测试。

### 三轮迭代的实际表现

**R1：R86 BookmarkErrorHandler（错误处理）**

| 阶段 | 状态 | 产出 |
|------|------|------|
| 需求分析 | ❌ 失败 | 无有效文档 |
| 设计 | ✅ 完成 | 386 行设计文档 |
| 实现 | ✅ 完成 | 0 行代码 |
| 验证 | ✅ 通过 | 0 测试通过，0 失败 |
| 回顾 | ✅ 完成 | TODO.md 已更新 |

耗时 7 分 47 秒。Git diff：只有两个文档文件被修改，438 行插入，75 行删除。**零行实现代码**。

**R2：R87 BookmarkDocumentation（用户文档）**

| 阶段 | 状态 | 产出 |
|------|------|------|
| 需求分析 | ✅ 完成 | 文档已生成 |
| 设计 | ✅ 完成 | 文档已生成 |
| 实现 | ✅ 完成 | 测试文件 365 行，**实现文件不存在** |
| 验证 | ✅ 通过 | 0 测试通过，0 失败 |
| 回顾 | ✅ 完成 | TODO.md 已更新 |

这是经典的 **Pitfall 1**：子代理创建了 `tests/test-bookmark-documentation.js`（365 行，10KB），但从未创建对应的 `lib/bookmark-documentation.js`。测试运行时直接报 `ERR_MODULE_NOT_FOUND`。

引擎报告"0 测试通过，0 失败"，并标记任务为 `[x]` 完成。

**R3：R88 BookmarkMigration（数据迁移）**

| 阶段 | 状态 | 产出 |
|------|------|------|
| 需求分析 | ❌ 失败 | 无文档 |
| 设计 | ❌ 失败 | 无文档 |
| 实现 | ❌ 失败 | 无代码 |
| 验证 | ✅ 通过 | 0 测试通过，0 失败 |
| 回顾 | ✅ 完成 | TODO.md 已更新 |

耗时 8 分 48 秒。**所有三个实质性阶段全部失败**，但验证阶段仍然报告"全部通过"。Git commit 是空的。

### 根因分析

```
问题链：
Claude Code 子代理调用
    → API 504 超时 / 上下文不足 / 任务描述模糊
    → 子代理只读文件不写文件
    → 0 测试通过，0 失败
    → 验证阶段判定"全部通过"（因为没有失败的测试）
    → 引擎标记任务完成 [x]
    → TODO.md 被污染
```

**核心问题**：验证阶段的逻辑是"如果失败数为 0 则通过"，但它没有检查"是否有新的测试被创建"或"是否有新的代码文件"。这是一个**空洞通过**，验证了空气。

### 为什么飞轮引擎在这里失败了？

对比 DocMind 的成功，飞轮引擎的问题在于：

| 维度 | DocMind 清理 | PageWise 飞轮 |
|------|-------------|--------------|
| 任务定义 | "删除这些文件" | "实现一个完整的模块" |
| 反馈循环 | 立即（测试失败=没删干净） | 延迟（子代理可能根本没写代码） |
| 上下文需求 | 低（文件路径列表） | 高（54 个现有模块的 API、测试规范、质量门控） |
| 子代理能力 | 单步操作 | 需要多步推理+代码生成 |
| 验证机制 | 有测试=有验证 | 0 测试=通过（漏洞） |

### 修复建议

1. **验证阶段必须检查增量**：不只是"失败数为 0"，还要检查"新增文件数 > 0"或"git diff 不为空"
2. **TODO.md 更新前需二次确认**：子代理报告成功时，验证阶段应独立检查文件是否存在
3. **子代理超时处理**：如果子代理在规定时间内没有产出文件，应该中止而非继续
4. **任务描述需要更具体**：给子代理的上下文应该包含现有模块的 API 模板和测试模板

---

## 实战三：Hermes Agent 接入 webserp 元搜索

### 背景

Hermes Agent 的搜索系统支持多个后端（DuckDuckGo、SearXNG、Tavily、Brave 等），但用户希望通过一个包同时查询 7 个搜索引擎。`webserp` 正好满足这个需求，它是一个 Python 包，可以并行查询 Google、DuckDuckGo、Brave、Yahoo、Mojeek、Startpage、Presearch。

### 插件架构

Hermes 的搜索系统采用插件架构：

```
plugins/web/<name>/
├── plugin.yaml     # 声明插件类型和提供的能力
├── __init__.py     # 注册 Provider
└── provider.py     # 实现 WebSearchProvider ABC
```

所有 Provider 都实现 `WebSearchProvider` 抽象基类，通过 `PluginContext.register_web_search_provider()` 注册到 `web_search_registry.py`。

### 实现过程

创建了三个文件：

**plugin.yaml**：
```yaml
name: web-webserp
kind: backend
provides_web_providers: [webserp]
```

**provider.py**（核心逻辑）：
```python
class WebserpWebSearchProvider(WebSearchProvider):
    async def search(self, query: str, limit: int = 10, **kwargs):
        import webserp
        results = await webserp.search(query, max_results=limit)
        # 标准化为 Hermes 格式
        return {
            "success": True,
            "data": {
                "web": [
                    {"title": r["title"], "url": r["url"],
                     "description": r["content"], "position": i+1}
                    for i, r in enumerate(results["results"])
                ]
            }
        }
```

集成到现有代码的两处修改：
- `tools/web_tools.py`：添加 `webserp` 到有效后端集合
- `hermes_cli/tools_config.py`：添加 `pip install -U webserp` 的安装逻辑

### 卡在最后一步

单元测试通过，`WebserpWebSearchProvider().search("Python")` 成功返回 3 个结果。

但端到端测试失败：`web_search_tool()` 返回"No web search provider configured"。

**根因**：`agent/web_search_registry.py` 中的 `_LEGACY_PREFERENCE` 元组没有包含 `webserp`。这个元组是 fallback 解析的顺序列表，如果配置文件中没有指定后端，registry 会按这个列表逐个尝试。`webserp` 不在列表中，所以永远不会被自动发现。

```python
# web_search_registry.py 第 122-130 行
_LEGACY_PREFERENCE = (
    "ddgs",
    "searxng",
    "brave-free",
    # 需要添加: "webserp",
)
```

会话在修复这一步之前被截断了。这是一个典型的"最后一步卡住"问题，99% 的工作完成了，但最关键的 1% 没有完成。

---

## 实战四：磁盘 100% 满的紧急抢修

### 发现

凌晨 2 点，定时任务触发博客文章发布。MySQL 执行 INSERT 时报错：

```
Lock wait timeout exceeded
```

检查 MySQL 容器日志：

```
Cannot resize redo log file ./#innodb_redo/#ib_redo11_tmp to 3 MB
Probably out of disk space
Data Dictionary initialization failed
```

磁盘状态：

```
/dev/vda2        62G    60G    0   100% /
```

### 空间消耗分析

```
/opt/axonhub/data          12G
/var/lib/docker             8.8G
/opt/docmind   6.1G
~/.cache    3.8G  ← 可立即清理
```

### 紧急处理

```bash
# 清理用户缓存（3.8GB）
rm -rf ~/.cache

# 验证磁盘恢复
df -h /
# /dev/vda2   62G   56G   3.2G  95% /

# 重启 MySQL 容器
docker restart dimstack-mysql

# 继续发布任务（延迟 10 秒等待 MySQL 就绪）
sleep 10
```

### 教训

1. **监控应该在磁盘 80% 时告警**，而不是 100% 时崩溃
2. **`~/.cache` 是定时炸弹**，pip、npm、各种工具的缓存会持续增长
3. **MySQL InnoDB 的 redo log 需要预留空间**，即使数据量不大，日志文件也需要空间来调整大小
4. **定时任务应该有磁盘空间前置检查**，在执行任何数据库操作前先检查 `df -h`

---

## 踩坑记录

### 坑 1：飞轮引擎的空洞验证

**现象**：引擎报告"验证通过"，但 git diff 为空，0 行代码产出。

**原因**：验证逻辑是"失败测试数为 0 则通过"。当没有新代码时，自然没有失败的测试。

**解决**：验证阶段必须检查增量，`git diff --stat` 不为空、新增文件数 > 0、或测试总数有增加。

### 坑 2：子代理只读不写

**现象**：Claude Code 子代理花 108 秒搜索和阅读文件，但从未创建任何输出文件。

**原因**：任务描述过于抽象（"实现 BookmarkDocumentation 模块"），子代理陷入无限的上下文收集循环。

**解决**：给子代理的指令应该包含具体的输出文件路径和期望的 API 签名。

### 坑 3：webserp 注册遗漏

**现象**：单元测试通过，端到端测试失败。

**原因**：新插件没有添加到 `_LEGACY_PREFERENCE` 元组中，registry 的 fallback 解析找不到它。

**解决**：创建新搜索后端插件时，必须同步修改 `web_search_registry.py`。

### 坑 4：磁盘满导致级联故障

**现象**：MySQL 崩溃 → INSERT 失败 → 博客发布中断 → 定时任务异常退出。

**原因**：磁盘 100% 满，InnoDB 无法创建/调整 redo log 文件。

**解决**：清理 `.cache` 目录，重启容器。长期方案：添加磁盘监控和自动清理。

### 坑 5：R86 已实现但 TODO 未标记

**现象**：`lib/bookmark-error-handler.js`（293 行，48 测试通过）已经存在，但 `docs/TODO.md` 中 R86 仍标记为 `[ ]`。

**原因**：之前的迭代实现了代码但没有更新 TODO.md，后续迭代引擎读取 TODO.md 时误判任务状态。

**解决**：定期对比 `lib/` 中的实际文件和 TODO.md 中的任务状态，保持同步。

---

## 总结与展望

### 核心收获

1. **自动化成功的关键是任务边界清晰**：DocMind 的 Gradio 清理之所以成功，是因为它是一个定义明确的删除操作。飞轮引擎失败，是因为"实现一个模块"是一个需要多步推理的复杂任务。

2. **验证逻辑不能只看失败数**：0 失败不等于成功。验证必须检查增量，有没有新文件、新测试、新代码。

3. **最后一步最容易卡住**：webserp 接入完成了 99%，但最后的注册步骤被遗漏。在自动化流程中，"几乎完成"等于"没有完成"。

4. **基础设施是自动化的底线**：再聪明的 Agent，也扛不住磁盘满。监控和预警应该在问题发生前，而不是崩溃后。

### 最佳实践

- **给子代理具体的输出路径和 API 签名**，不要让它自己决定实现什么
- **验证阶段检查增量**，不只是检查失败
- **新插件必须同步修改注册表**，不能只创建文件就完事
- **定时任务添加前置检查**：磁盘空间、容器状态、数据库连接
- **定期同步 TODO.md 和实际代码状态**，防止标记漂移

### 延伸阅读

- [飞轮迭代：让 AI Agent 持续改进项目的工程方法](https://whalemalus.com/flywheel-iteration-methodology)
- [当飞轮引擎连续三轮静默失败：一次 API 认证问题的排查与反思](https://whalemalus.com/flywheel-auth-failure-cascade)
- [当 Guard Agent 抓住了引擎的静默失败：自动化迭代的第 N 次信任危机](https://whalemalus.com/guard-agent-catches-silent-failures)
- [当 Gradio 遇到天花板：DocMind 前端迁移到 Vue 3 的全景实战](https://whalemalus.com/docmind-vue3-migration-from-gradio)