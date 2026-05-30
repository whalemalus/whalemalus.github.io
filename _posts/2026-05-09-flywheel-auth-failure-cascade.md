---
layout: post
title: "当飞轮引擎连续三轮静默失败：一次 API 认证问题的排查与反思"
date: 2026-05-09
categories: DevOps
tags: []
excerpt: "PageWise 飞轮迭代引擎连续三轮迭代产出为空，根因是 Claude Code CLI 认证失效但返回 exit code 0，引擎将失败误判为成功。本文复盘这次级联失败并提出修复方案。"
image: "https://whalemalus.com/file/cover-flywheel-auth-failure-key"
header:
  teaser: "https://whalemalus.com/file/cover-flywheel-auth-failure-key"
  overlay_image: "https://whalemalus.com/file/cover-flywheel-auth-failure-key"
original_url: "https://whalemalus.com/articles/flywheel-auth-failure-cascade"
---

# 当飞轮引擎连续三轮静默失败：一次 API 认证问题的排查与反思

> 今天 PageWise 飞轮迭代引擎连续执行了 R1、R2、R3 三轮迭代，结果全部产出为空。这不是功能没写好，而是更隐蔽的问题——Claude Code CLI 认证失效，引擎却浑然不知地继续运行。

## 楔子

飞轮迭代引擎跑了三轮，状态栏全是绿色对勾，看起来一切正常。但打开产出目录，空空如也。这不是功能 bug，而是一个更隐蔽的问题——认证失效后系统仍然「认为」自己成功了。

## 引言

本文复盘 PageWise 飞轮迭代引擎连续三轮静默失败的完整排查过程。从表面现象到根因定位，从级联失败模式分析到引擎设计缺陷暴露，最后给出修复计划和经验教训。

## 目录

- [楔子](#楔子)
- [引言](#引言)
- [现象：三轮迭代，零产出](#现象：三轮迭代，零产出)
- [根因：Claude Code CLI 未认证](#根因：Claude Code CLI 未认证)
- [级联失败模式](#级联失败模式)
- [暴露的引擎缺陷](#暴露的引擎缺陷)
- [修复计划](#修复计划)
- [经验总结](#经验总结)

## 现象：三轮迭代，零产出

| 轮次 | 任务 | 代码变更 | 测试新增 | 耗时 |
|------|------|----------|----------|------|
| R1 | E2E 测试 | 0 文件 | 0 | 8 分 27 秒 |
| R2 | 书签-知识库联动 | 0 文件 | 0 | 9 分 44 秒 |
| R3 | 自动分类 | 0 文件 | 0 | 5 分 31 秒 |

从外部看，引擎状态栏全是 ✅——需求分析完成、设计完成、实现完成、测试全部通过、回顾完成。但实际上，**每一个阶段都是空转**。

## 根因：Claude Code CLI 未认证

排查后发现问题很简单：

```bash
$ echo "test" | claude -p --bare --max-turns 1 --effort low
> Not logged in · Please run /login
```

Claude Code 返回了「Not logged in」错误信息，但关键问题是：**它返回的 exit code 是 0**。

这意味着对于任何检查 `rc == 0` 来判断成功与否的脚本来说，这个「未登录」的状态看起来和「成功执行」一模一样。

## 级联失败模式

由于 exit code 的歧义，失败像多米诺骨牌一样传导：

```
Phase 1 & 2: Claude Code 无法执行
    → REQUIREMENTS/DESIGN 文件未被更新
    → 引擎读到旧文件，认为"需求已有"

Phase 3: Claude Code 无法执行
    → 无代码产出
    → 但 rc=0，引擎标记为"✅ 完成"

Phase 4: 无新代码，自然无新测试
    → 测试解析函数 count("✓") 和 count("✗") 均为 0
    → 被判定为"全部通过"

Phase 5: 引擎认为一切都成功了
    → 将 TODO.md 中对应任务标记为 [x]
    → 下一轮迭代将跳过这些任务
```

最终结果：**TODO.md 中 R72/R73/R74 被错误标记为已完成**，但实际上没有任何功能代码被创建。

## 暴露的引擎缺陷

这次事件暴露了飞轮引擎中的三个设计缺陷：

### 缺陷 1：成功判定过于简单

`run_claude_code()` 函数仅检查 `returncode == 0`，没有分析 stdout 内容。当 CLI 返回有意义的错误信息（如「Not logged in」）但 exit code 为 0 时，引擎无法区分成功和失败。

**改进方向**：在检查 exit code 的同时，分析输出内容中是否包含已知错误关键词。

### 缺陷 2：测试解析逻辑有漏洞

`run_tests()` 函数使用 `output.count("✓")` 和 `output.count("✗")` 来统计测试结果，但实际的测试输出使用 `# pass` 和 `# fail` 格式。由于 `tail -20` 截取的汇总行不包含 `✓/✗` 符号，任何情况下都会返回 0/0。

**改进方向**：解析 `# pass N` / `# fail N` 格式的汇总行，而非依赖符号计数。

### 缺陷 3：空产出未被检测

引擎没有检查「Phase 3 是否真的产出了代码文件」这一基本条件。即使 git diff 为空，Phase 4 和 Phase 5 仍照常执行。

**改进方向**：在 Phase 3 完成后检查 git diff，如果没有实际代码变更，应中止后续阶段并报告失败。

## 修复计划

1. **Claude Code 认证**：为执行用户配置有效的 API Key 认证
2. **引擎成功判定**：增加输出内容分析，不仅依赖 exit code
3. **测试解析**：修正为解析标准格式的测试汇总行
4. **TODO.md 恢复**：将 R72/R73/R74 从 `[x]` 恢复为 `[ ]`
5. **空产出检测**：在验证阶段增加 git diff 非空检查

## 经验总结

自动化引擎最大的风险不是「报错」，而是「静默失败」。当一个系统把失败误判为成功时，它不仅没有完成任务，还会在元数据层面制造「已完成」的假象，误导后续的决策和迭代。

这次事件提醒我们：

- **不要只相信 exit code**——很多 CLI 工具在错误情况下仍返回 0
- **空产出应该触发告警**——一个「成功」的实现阶段必须有实际代码产出
- **元数据的准确性比功能本身更重要**——错误的 TODO 标记会导致任务被永久跳过

---