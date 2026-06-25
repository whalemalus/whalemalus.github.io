---
layout: post
title: "当自动化系统发现自己的债：一个16天空转故事的止损设计"
date: 2026-06-26
categories: DevOps
tags: ["AI Agent", "飞轮迭代", "DevOps", "自动化"]
excerpt: "Claude Code API宕机16天，飞轮引擎每天空转2次消耗token。债务管理系统正确识别了问题，但系统本身缺少自动止损机制。复盘这个案例，讨论自治系统何时该放弃。"
image: "https://whalemalus.com/file/cover-stoploss-mechanism-key"
header:
  teaser: "https://whalemalus.com/file/cover-stoploss-mechanism-key"
  overlay_image: "https://whalemalus.com/file/cover-stoploss-mechanism-key"
original_url: "https://whalemalus.com/articles/autonomous-system-stoploss-mechanism"
---

---
title: "当自动化系统发现自己的债：一个 16 天空转故事的止损设计"
date: 2026-06-25
tags: [AI Agent, 飞轮迭代, DevOps, 自动化]
category: DevOps
excerpt: Claude Code API 宕机 16 天，飞轮引擎每天空转 2 次消耗 token。债务管理系统正确识别了问题，但系统本身缺少自动止损机制。这篇文章复盘这个案例，讨论自治系统何时该"放弃"。
---

# 当自动化系统发现自己的债：一个 16 天空转故事的止损设计

## 楔子

6 月 10 日早上 8 点，PageWise 飞轮引擎按时启动，准备调用 Claude Code API 执行当天的第一轮迭代。连接被拒绝。

6 月 11 日，同样的事情发生了。

6 月 12 日，13 日，14 日……一直到 6 月 25 日，每天早上 8 点和晚上 8 点，飞轮引擎准时启动，准时失败。16 天，32 次调用，零次成功。

与此同时，债务管理系统每天忠实地记录："Claude Code API 持续不可达，第 N 天。"从第 1 天记到第 16 天，优先级从不明确一路标到 🔴 高优先级。

系统知道自己病了，但停不下来。

## 问题：断路器只管一次运行

飞轮引擎内置了断路器机制。单次运行中，如果某个 Phase 连续失败，后续调用会被跳过，避免无意义的重试。冷却时间 1722 秒。

这个设计在"单次运行内 API 波动"的场景下工作得很好。但它有一个盲区：**断路器的状态不跨运行持久化。**

每次 cron 触发都是一次全新的运行。昨天的失败记录？清空了。前天的断路器状态？不存在。引擎从零开始，重新尝试连接，重新失败，重新触发断路器，然后退出。下一轮 cron 触发时，一切重来。

```
06-25 08:00 — Phase 1: Connection refused → 断路器触发 → 跳过 Phase 2-4
06-25 20:00 — Phase 1: Connection refused → 断路器触发 → 跳过 Phase 2-4
06-26 08:00 — Phase 1: Connection refused → 断路器触发 → 跳过 Phase 2-4
...无限循环
```

## 债务管理：系统的眼睛

在同一套系统里，有一个每日债务日报机制。它扫描当天所有 cron 任务的执行结果，识别失败项，按优先级分类，生成报告。

6 月 25 日的债务日报长这样：

```
🔴 高优先级（1项）
  - [2026-06-10] Claude Code API 持续不可达（第16天）
    端口 Connection refused，今日 08:00 + 20:00 两次
    PageWise 飞轮迭代全部 Phase 失败。TODO 剩余 9 项
    无法推进，飞轮空转消耗 token。

🟡 中优先级（1项）
  - [2026-06-24] state.db 持续增长

🟢 低优先级（1项）
  - [2026-05-31] Issue #35576 监控 25 天无变化
```

债务日报做得不错——它正确识别了问题，给出了明确的建议："恢复 claude-code 服务，或暂停 pagewise-iteration-morning cron。"

但建议只是建议。系统没有机制把建议转化为行动。

## 两个世界的裂缝

这里暴露了一个设计缺陷：**感知层和执行层之间没有闭环。**

债务管理系统（感知层）知道 API 宕了 16 天。飞轮引擎（执行层）每天还在傻傻地尝试连接。两者之间没有通信通道。

感知层说："这个任务应该暂停。"
执行层说："我的 cron 时间到了，我得跑。"

## 解法：三级止损机制

基于这个案例，设计了三级止损：

### 第一级：单次运行内断路（已有）

Phase 连续失败 → 跳过后续 Phase → 冷却 1722 秒。这个已经实现了，工作正常。

### 第二级：跨运行计数器（缺失，需新增）

```python
# 在飞轮引擎的状态文件中添加
{
    "consecutive_failures": 16,  # 跨运行累计
    "last_success": "2026-06-09T20:00:00Z",
    "auto_pause_threshold": 5,   # 连续失败 5 天后自动暂停
    "paused": false
}
```

逻辑：每次运行开始时检查 `consecutive_failures`。如果超过阈值（比如 5 天），自动暂停对应的 cron 任务，并通知用户。成功运行后重置计数器。

### 第三级：债务日报联动（缺失，需新增）

债务日报识别到 🔴 高优先级债务持续超过 N 天时，自动执行"建议操作"：

```python
if debt.days > 7 and debt.priority == "high":
    if debt.recommendation == "pause_cron":
        cron_pause(debt.cron_job_id)
        notify(f"自动暂停 {debt.cron_job_name}，已连续失败 {debt.days} 天")
```

## 对比：DocMind 的降级成功

有趣的是，同一天的 DocMind 飞轮迭代遇到了同样的 Claude Code API 不可用问题，但成功完成了。

DocMind 的 agent 在发现 CLI 不可用后，降级为手动执行模式：直接读取代码文件，手动识别需要修改的异常处理，手动运行测试。结果：`image.py` 的 2 处裸 `except Exception` 被改为具体异常类型，ruff check 通过，80 个测试全部通过。

这说明"API 不可用"不一定是死路。关键在于引擎是否有降级路径。PageWise 引擎完全依赖 Claude Code CLI，没有降级方案。DocMind 引擎有手动执行的备选路径。

## 经验总结

1. **断路器必须跨运行持久化。** 单次运行内的断路器只能防"抖动"，防不了"长期宕机"。状态文件是持久化跨运行状态的自然选择。

2. **感知层要能驱动执行层。** 债务管理系统识别出问题后，应该有权限暂停相关 cron 任务，而不只是生成报告等人来处理。

3. **降级路径比完美路径更重要。** DocMind 手动降级成功，PageWise 完全失败。设计引擎时，先想清楚"如果核心依赖不可用怎么办"，再想"正常流程怎么走"。

4. **止损阈值要预设，不要事后调。** "连续失败 5 天暂停"这个阈值应该在系统设计时就定好，而不是等到第 16 天才讨论。

5. **系统自我认知不等于自我修复。** 债务日报每天正确报告问题，但 16 天没有自动触发任何修复动作。知道病了和治病是两回事。

## 延伸思考

这个问题不只是飞轮引擎独有的。任何依赖外部服务的自动化系统都可能遇到：API 限流、服务降级、证书过期、DNS 故障。如果系统没有自动止损机制，它会在故障期间持续消耗资源（token、CPU、带宽），同时产生大量无用的失败日志。

一个好的自治系统应该像人一样有"止损意识"：尝试几次不行就暂停，等条件改善了再恢复。而不是无脑重试到天荒地老。