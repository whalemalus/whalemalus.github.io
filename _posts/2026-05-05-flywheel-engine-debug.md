---
layout: post
title: "当飞轮引擎自己也需要修 Bug：自动化迭代的信任危机"
date: 2026-05-05
categories: DevOps
tags: ["飞轮迭代", "Claude Code", "Bug 排查"]
excerpt: "PageWise 飞轮迭代引擎连续两次运行失败——API 密钥占位符未替换、语法错误导致 Claude Code 调用静默失败，引擎却报告成功。"
image: "https://whalemalus.com/file/cover-flywheel-engine-debug-key"
header:
  teaser: "https://whalemalus.com/file/cover-flywheel-engine-debug-key"
  overlay_image: "https://whalemalus.com/file/cover-flywheel-engine-debug-key"
original_url: "https://whalemalus.com/articles/flywheel-engine-debug"
---

# 当飞轮引擎自己也需要修 Bug：自动化迭代的信任危机

> **摘要**：PageWise 项目的飞轮迭代引擎连续两次运行失败——API 密钥占位符未替换、语法错误导致所有 Claude Code 调用静默失败，引擎却报告"成功"。本文记录从发现到修复的全过程，以及自动化系统中"假成功"的防范经验。
>
> **关键词**：`飞轮迭代` `Claude Code` `自动化` `Bug 排查` `BookmarkLinkChecker`

---

## 楔子

5 月 4 日下午两点，飞轮迭代引擎准时启动。日志显示五个阶段全部完成——需求、设计、实现、验证、回顾，一行行绿色的 ✅ 让人安心。但当我打开项目目录，发现一个新文件都没有。

引擎说它成功了，代码却不存在。

这不是第一次。四个小时前的 R2 轮次，同样的事情已经发生过一次。引擎跑完了所有阶段，git 也提交了，但提交的只有一个需求文档——没有一行代码。

两次"成功"，两次空跑。飞轮引擎本身，成了最需要修的那个 Bug。

## 引言

PageWise 是一个 Chrome 浏览器扩展，用于 AI 辅助网页阅读和知识管理。项目的开发采用"飞轮迭代"方法——一个自动化引擎驱动 Claude Code 完成需求分析、设计、编码、测试、回顾五个阶段，循环往复。

截至 5 月初，飞轮已经跑完了 51 轮迭代（R43-R51），积累了 2000 多个测试用例。引擎脚本 `pagewise-iteration-engine.py` 被设计成"放着不管就能跑"的自动化系统。

但"放着不管"恰恰是问题所在。当引擎本身出现 Bug，而你又没有验证机制时，自动化就变成了一个制造虚假进度的机器。

## 全景地图

```
┌─────────────────────────────────────────────────────┐
│              飞轮迭代系统                              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐    ┌──────────────┐               │
│  │ 迭代引擎      │───→│  Claude Code  │               │
│  │ (Python 脚本) │    │  (子代理)     │               │
│  └──────┬───────┘    └──────┬───────┘               │
│         │                   │                        │
│         ▼                   ▼                        │
│  ┌──────────────┐    ┌──────────────┐               │
│  │ TODO.md      │    │ 项目源码      │               │
│  │ (任务队列)    │    │ (lib/tests/)  │               │
│  └──────────────┘    └──────────────┘               │
│                                                     │
│  五个阶段：                                           │
│  需求 → 设计 → 实现 → 验证 → 回顾                     │
│                                                     │
│  ⚠️ 故障点：API 密钥传递                              │
│  ⚠️ 故障点：错误检测逻辑                              │
└─────────────────────────────────────────────────────┘
```

## 目录

- [全景地图](#全景地图)
- [核心概念](#核心概念)
- [实战指南](#实战指南)
- [踩坑记录](#踩坑记录)
- [总结](#总结)

---

## 核心概念

### 飞轮迭代引擎

飞轮迭代引擎是一个 Python 脚本，负责自动化驱动 Claude Code 完成开发任务。它从 `TODO.md` 读取下一个待完成的任务，然后依次调用 Claude Code 执行五个阶段：

1. **需求分析**：生成 `docs/REQUIREMENTS-ITER{n}.md`
2. **设计**：生成 `docs/DESIGN-ITER{n}.md`
3. **实现**：生成代码文件到 `lib/` 和 `tests/`
4. **验证**：运行测试套件
5. **回顾**：生成迭代报告，更新 TODO.md

每个阶段通过 `subprocess` 调用 Claude Code CLI，传入系统提示词和上下文文件。

### "假成功"现象

引擎的每个阶段调用 Claude Code 后，只检查 `returncode == 0`（进程退出码）。但 Claude Code 即使因认证失败返回 401，进程退出码也是 0。引擎看到 0，就标记为"成功"，继续下一个阶段。

这就是"假成功"——系统报告一切正常，实际上什么都没发生。

### API 密钥传递机制

引擎需要将 Anthropic API 密钥传递给 Claude Code。脚本中有一段逻辑从 `/home/claude-user/.claude/settings.json` 读取密钥，然后通过环境变量 `ANTHROPIC_API_KEY` 传给子进程。

问题出在具体的代码实现上。

## 实战指南

### 第一步：R2 轮次的异常信号

5 月 4 日下午 2 点，R2 轮次执行。引擎报告五个阶段全部完成，git 也自动提交了。但查看提交内容：

```bash
git log --oneline -1
# 7605cff docs: R63 iteration — REQUIREMENTS only

git show --stat 7605cff
# docs/REQUIREMENTS-ITER3.md  (208 lines)
# docs/TODO.md                (updated)
# 没有 lib/ 或 tests/ 的变更
```

只有需求文档和 TODO 更新，没有代码文件。R52（BookmarkGraph MVP E2E 测试）的任务没有被实际完成。

### 第二步：定位引擎脚本的 Bug

检查引擎脚本 `/root/scripts/pagewise-iteration-engine.py`，发现两个关键问题：

**Bug 1：API 密钥占位符（第 106 行）**

```python
# 错误代码
export ANTHROPIC_API_KEY=***

# 正确应该是
export ANTHROPIC_API_KEY={api_key}
```

脚本上方有读取 `settings.json` 的逻辑，但读取后的 `api_key` 变量没有被正确插入到环境变量设置中。`***` 是一个占位符，本应在后续修改中替换，但被遗漏了。

**Bug 2：语法错误（第 125 行）**

```python
# 错误代码
{api_key}("运行测试套件")

# 正确应该是
log("运行测试套件")
```

`{api_key}` 被错误地插入到了 `log()` 函数调用的位置。这是一个 Python 语法错误，会导致 `NameError`。

### 第三步：理解为什么错误检测失效

引擎的错误检测逻辑只检查进程退出码：

```python
result = subprocess.run(cmd, shell=True, capture_output=True)
if result.returncode == 0:
    log("✅ 阶段完成")
else:
    log("❌ 阶段失败")
```

但 Claude Code 的 401 认证失败不会改变退出码。引擎需要更严格的验证：

```python
# 改进后的检测逻辑
result = subprocess.run(cmd, shell=True, capture_output=True)

# 退出码不为 0 → 明确失败
if result.returncode != 0:
    log("❌ 阶段失败：退出码 " + str(result.returncode))
    return False

# 退出码为 0，但输出为空 → 可能是假成功
if not result.stdout.strip() and not result.stderr.strip():
    log("⚠️ 警告：无输出，可能是认证失败")
    return False

# 检查 stderr 中是否有认证错误
if "401" in result.stderr or "Unauthorized" in result.stderr:
    log("❌ 认证失败")
    return False

log("✅ 阶段完成")
```

### 第四步：手动修复 R63

由于引擎无法正常工作，R63（BookmarkLinkChecker 模块）需要手动实现。

创建 `lib/bookmark-link-checker.js`：

```javascript
class BookmarkLinkChecker {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 5;
    this.timeout = options.timeout || 8000;
    this.rateLimitPerDomain = options.rateLimitPerDomain || 2; // QPS
    this.results = [];
    this.controller = null;
  }

  async checkAll(bookmarks) {
    this.controller = new AbortController();
    this.results = [];

    // 按域名分组，实现速率限制
    const domainGroups = this._groupByDomain(bookmarks);
    const tasks = [];

    for (const [domain, urls] of Object.entries(domainGroups)) {
      for (const url of urls) {
        tasks.push(this._rateLimitedCheck(domain, url));
      }
    }

    // 并发执行，受 concurrency 限制
    await this._runWithConcurrency(tasks, this.concurrency);
    return this.results;
  }

  async checkOne(url) {
    return this._checkUrl(url);
  }

  async _checkUrl(url) {
    try {
      // HEAD 请求优先，节省带宽
      let response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(this.timeout),
        redirect: 'follow'
      });

      // HEAD 被拒绝时回退到 GET
      if (response.status === 405 || response.status === 501) {
        response = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(this.timeout),
          redirect: 'follow'
        });
      }

      const result = {
        url,
        status: response.ok ? 'alive' : (response.redirected ? 'redirect' : 'dead'),
        statusCode: response.status,
        redirectedTo: response.redirected ? response.url : null,
        checkedAt: new Date().toISOString()
      };

      this.results.push(result);
      return result;
    } catch (error) {
      const result = {
        url,
        status: 'unknown',
        error: error.message,
        checkedAt: new Date().toISOString()
      };
      this.results.push(result);
      return result;
    }
  }

  cancel() {
    if (this.controller) {
      this.controller.abort();
    }
  }

  getDeadLinks() {
    return this.results.filter(r => r.status === 'dead');
  }

  getRedirectLinks() {
    return this.results.filter(r => r.status === 'redirect');
  }

  getReport() {
    const alive = this.results.filter(r => r.status === 'alive').length;
    const dead = this.results.filter(r => r.status === 'dead').length;
    const redirect = this.results.filter(r => r.status === 'redirect').length;
    const unknown = this.results.filter(r => r.status === 'unknown').length;
    return { total: this.results.length, alive, dead, redirect, unknown };
  }
}
```

创建对应的测试文件 `tests/test-bookmark-link-checker-e2e.js`，覆盖：
- 单个 URL 检查（alive / dead / redirect / timeout）
- 批量检查的并发控制
- 域名速率限制
- 取消操作
- 报告生成

## 踩坑记录

### 踩坑 1：grep 检查遗漏了 `***`

在 R3 运行前，执行了 `grep '\*\*\*' pagewise-iteration-engine.py` 来检查是否还有占位符。结果返回空——没有找到。

但实际情况是第 106 行确实有 `***`。原因可能是 grep 的通配符转义问题，或者脚本在检查后被修改过。

**教训**：不要只依赖 grep，直接用 `cat -n` 查看关键行号附近的内容。

### 踩坑 2：退出码 ≠ 成功

Claude Code CLI 即使遇到 401 认证错误，进程退出码仍然是 0。引擎只检查退出码，导致所有失败的调用都被标记为"成功"。

**教训**：自动化系统的错误检测必须多层验证——退出码、输出内容、文件存在性，缺一不可。

### 踩坑 3：部分修复导致更隐蔽的 Bug

脚本的第 106 行之前有读取 API 密钥的代码，说明有人尝试过修复。但修复不完整——读取了密钥却没有替换掉占位符。这种"修了一半"的状态比完全没修更危险，因为它给人一种"已经修好了"的错觉。

**教训**：修复 Bug 后必须端到端验证，不能只看代码逻辑"看起来对"。

## 总结
**核心收获**：
- 自动化系统的最大风险不是"跑不了"，而是"跑了但没跑对"
- 错误检测必须验证实际产出，不能只看退出码
- "部分修复"比"完全没修"更危险

**最佳实践**：
- 飞轮引擎运行后，检查 git diff 确认实际变更
- 每个阶段的产出必须有对应的文件存在性检查
- API 密钥等敏感配置不要硬编码，从环境变量或配置文件读取

**延伸阅读**：
- PageWise 飞轮迭代方法论：从 R1 到 R42 的完整记录
- Claude Code 子代理工作流：四角色质量门控管道
- 注册表模式：让自动化任务不再硬编码