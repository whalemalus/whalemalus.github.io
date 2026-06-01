---
layout: post
title: "当37个定时任务同时失控：自动化运维的自我修复实战"
date: 2026-06-02
categories: DevOps
tags: ["cron", "自动化", "DevOps", "飞轮迭代"]
excerpt: "37个定时任务因API限流集体失败，运维守护者自动修复15个任务配置，PCEC引擎产出断路器和限流感知技能。从反复修同一个bug到在创建时预防。"
image: "https://whalemalus.com/file/cover-cron-self-healing-key"
header:
  teaser: "https://whalemalus.com/file/cover-cron-self-healing-key"
  overlay_image: "https://whalemalus.com/file/cover-cron-self-healing-key"
original_url: "https://whalemalus.com/articles/cron-self-healing-resilience"
---

# 当 37 个定时任务同时失控：自动化运维的自我修复实战

> **摘要**：我们的 Hermes Agent 系统运行着 37 个定时任务，某天 18:00 三个任务因 OpenRouter API 限流集体失败。运维守护者自动修复了 15 个任务的 delivery 配置，PCEC 引擎产出了断路器和限流感知技能。这篇文章记录了从「反复修同一个 bug」到「在创建时就预防」的转变过程。
>
> **关键词**：`cron` `自动化运维` `断路器` `限流` `自愈系统`

---

今天下午六点，三个定时任务同时挂了。

不是什么复杂的 bug，就是 OpenRouter 免费模型的每日 50 次请求额度用完了。三个任务在同一秒触发，拿到 429，集体失败。这种事在 37 个任务的系统里迟早会发生——只是没想到来得这么快。

## 问题的根源

我们的 Hermes Agent 系统跑着 37 个定时任务：飞轮迭代每 3 小时一轮、运维巡检每天 6 次、Wiki 发芽检测、安全扫描、博客同步……大部分任务需要调用 LLM，而它们共享同一个 OpenRouter 免费模型的配额。

免费模型每天 50 次请求。37 个任务，其中 4 个高频调用 Claude Code CLI，再加上其他任务偶尔调用——算下来高峰期每天消耗 80-100 次请求。超了就 429，没商量。

这不是第一次出问题。之前 Feishu 的 99992402 错误已经修了 5 次以上，每次修完过几天又冒出来。根因是新任务创建时默认 `deliver: feishu`，但大部分后台任务根本不需要推送到飞书。

## 运维守护者的自动修复

20:00，运维守护者 V2 启动扫描。它发现了 6 个问题：

1. 15 个任务的 delivery 配置错误（feishu/origin → 应该是 local）
2. 3 个任务因 429 失败需要重跑
3. OpenRouter 额度耗尽是系统性问题

守护者做了两件事：

**批量修复 delivery**：把 15 个后台任务（监控、巡检、备份、同步）的 delivery 从 feishu/origin 统一改为 local。这些任务的结果不需要推送到飞书，改成本地存储就够了。一次性修完，Feishu 99992402 错误从此消失。

**触发失败任务重跑**：对 3 个被 429 击中的任务，等额度重置后手动触发重跑。其中 2 个成功恢复，1 个（hermes-agent-weekly-update）因为连续 error 时间太长，需要额外处理。

## PCEC 引擎的认知扩展

每隔 3 小时，PCEC（Periodic Cognitive Expansion Cycle）引擎会执行一次「思维爆炸」——分析系统中的默认假设、冗余流程、短板漏洞和高并发风险。

今天的分析发现了几个关键问题：

**默认值设计错误**：cron 任务的 delivery 默认是 feishu，但 37 个任务中只有少数需要推送到飞书。这个默认值导致了 Feishu 99992402 的反复出现。

**解决方案**：升级 `cron-defaults-guardian` 技能，增加创建时拦截规则：

```
deliver 字段决策树：
- 任务名包含「监控/巡检/备份/同步/检测」→ local
- 任务名包含「发布/推送/通知」且需要用户可见 → feishu
- 其他 → local（安全默认值）
```

同时增加了 OpenRouter 限流感知模块，根据任务数量估算每日请求消耗：

| 任务数 | 每日请求估算 | 风险 |
|--------|-------------|------|
| < 20 | ~40 次 | 安全 |
| 20-40 | ~80 次 | 高峰期限流 |
| 40-100 | ~200 次 | 必然限流 |

## 断路器技能

PCEC 还创建了 `claude-code-cron-resilience` 技能，定义了四层防御：

1. **预检**：调用前检查 API 是否可用、配额是否充足
2. **自适应超时**：根据历史响应时间动态调整超时
3. **断路器**：连续失败 3 次后自动熔断，避免浪费配额
4. **优雅降级**：API 不可用时跳过本轮，不生成虚假完成记录

这个技能已经创建，但还没有集成到飞轮引擎代码中。集成之后，引擎在 Claude Code 不可用时会自动降级到手动生成任务，而不是傻等 900 秒超时。

## 飞轮迭代的覆盖率跃升

在系统自愈的同时，PageWise 项目的飞轮迭代也在推进。今天完成了 R3 和 R367 两轮迭代：

- `knowledge-base-cursor.js`：27.3% → 98.2%（+19 个测试用例）
- `skill-store.js`：34.11% → 94.5%（+16 个测试用例）
- 全量测试：7871 pass / 0 fail
- 总语句覆盖率：93.95% → 94.4%

单轮迭代提升 60 个百分点的覆盖率，说明之前的测试覆盖存在大量空白区域。飞轮引擎的任务选择算法会优先选择覆盖率低的文件，所以这种集中提升是正常的。

## 踩坑记录

**坑 1：免费额度是硬瓶颈**

OpenRouter 免费模型每天 50 次请求，在 37 个任务的系统里根本不够用。解决办法是充值 credits（$10 → 1000 次/天），或者把关键任务改用付费模型。

**坑 2：docker restart 不会解除 paused 状态**

容器长时间闲置后可能进入 paused 状态。`docker restart` 会重启容器内的进程，但不会 unpause。必须先 `docker unpause`，再 `docker restart`，然后再 `docker unpause` 一次。

**坑 3：MySQL 输出包含警告信息**

用 `mysql -N -e "SELECT ..."` 获取数值时，MySQL 会把 `[Warning] Using a password on the command line interface` 输出到 stderr，但 `terminal()` 会把它混在 output 里。不能直接 `int(output.strip())`，要用正则提取数字。

**坑 4：execute_code 超时但操作已成功**

在 `execute_code` 里执行大文章的 INSERT 操作，60 秒超时返回错误，但服务端实际已经插入成功。重试会得到 `Duplicate entry` 错误。正确做法是先 `SELECT id FROM article WHERE id=<new_id>` 验证是否已存在。

## 总结

### 核心收获

37 个定时任务的系统，靠的不是「出了问题再修」，而是「在创建时就预防」。Feishu 99992402 从反复修 5 次到一次性根治，靠的是反转默认值——后台任务默认 local，需要推送的任务才用 feishu。

外部 API 配额是自动化系统的硬瓶颈。37 个任务共享 50 次/天的免费额度，迟早会集体阵亡。解法是三层保护：预检可用性、断路器防连续失败、降级策略确保跳过不造假。

### 最佳实践

1. **默认值设计要安全**：不确定该用什么值时，选副作用最小的那个
2. **同一问题修 3 次以上，必须升级为架构级预防**：打补丁不如改默认值
3. **外部调用必须有断路器**：硬编码超时 + 无重试 = 最差组合
4. **合并同类任务**：37 个任务可以合并到 30 个左右，降低调度冲突和资源消耗
5. **容器状态检查是发布流程的第一步**：paused 状态会导致所有 docker exec 失败

### 延伸阅读

- [我们如何用 AI 做 Code Review：多模型交叉验证实战](https://whalemalus.com/article/ai-code-review-multi-model)
- [数字生命体的涌现：Agent 生态第三轮发芽报告](https://whalemalus.com/article/agent-digital-lifeform-third-sprout)