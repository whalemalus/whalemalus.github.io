---
layout: post
title: "别让 catch 块变成黑洞：两个项目的异常处理治理实战"
date: 2026-06-17
categories: DevOps
tags: ["JavaScript", "Python", "PageWise", "DocMind", "飞轮迭代"]
excerpt: "PageWise 13处静默catch块和DocMind 3处裸except Exception的治理实战，以及为什么能跑就行的异常处理迟早会反噬。"
image: "https://whalemalus.com/file/cover-exception-handling-key"
header:
  teaser: "https://whalemalus.com/file/cover-exception-handling-key"
  overlay_image: "https://whalemalus.com/file/cover-exception-handling-key"
original_url: "https://whalemalus.com/articles/exception-handling-silent-catch"
---

# 别让 catch 块变成黑洞：两个项目的异常处理治理实战

> **摘要**：PageWise 项目有 13 处 `catch` 块吞掉了所有错误，DocMind 有 3 处 `except Exception:` 把真正的异常藏起来了。这篇文章记录了从发现到修复的完整过程，以及为什么"能跑就行"的异常处理迟早会反噬。
>
> **关键词**：`异常处理` `JavaScript` `Python` `catch` `except` `PageWise` `DocMind`

---

我花了很长时间才意识到，代码里最危险的不是 bug，是那些把 bug 藏起来的代码。

## 发现问题

事情从一次飞轮迭代开始。PageWise 的 R421 任务要求扫描所有 `catch` 块，找出"吞掉错误"的那些。扫描结果比我预想的严重——13 处 `catch` 块里，有的完全空着，有的只有一行注释，没有任何日志输出。

几乎同一时间，DocMind 的 R205 任务也在做类似的事：找 `except Exception:` 这种写法。Python 里 `except Exception:` 比 JavaScript 的空 `catch` 更隐蔽，因为它不会让你的程序崩溃，但也不会告诉你到底出了什么问题。

两个项目，两种语言，同一个毛病。

## 静默 catch 块到底有什么问题

先看一个 PageWise 里的真实例子：

```javascript
// page-sense-dom.js 第 221 行
try {
  const result = analyzeDOMStructure(element);
  return result;
} catch (e) {
  // 什么都没有
}
```

这段代码的意思是：如果 DOM 分析出了任何问题——类型错误、引用错误、内存溢出——统统假装没发生，返回 `undefined`。调用方拿到 `undefined`，继续往下跑，可能在更远的地方产生一个完全不相关的报错。

这就是"静默失败"的本质：错误没有消失，只是换了个地方出现，而且变得更难排查。

DocMind 的情况类似：

```python
# graph.py 第 593 行
try:
    nodes = build_graph(data)
except Exception:
    pass
```

`except Exception:` 加 `pass`，等于告诉 Python："不管出了什么事，别告诉我。"

## 修复策略

两种语言的修法不一样，但原则相同：**要么处理它，要么记录它，不要假装看不见。**

### JavaScript 侧（PageWise）

PageWise 的 13 处静默 catch 分成了三类：

**第一类：需要日志的**（10 处）

```javascript
// 修复前
try {
  await processStream(response);
} catch (e) {
  // 空
}

// 修复后
try {
  await processStream(response);
} catch (e) {
  console.warn('[AI-Client-Stream] stream read failed:', e.message);
}
```

用 `console.debug` 还是 `console.warn` 取决于上下文。如果这个错误是预期中的（比如网络断开），用 `debug`。如果是不应该发生的（比如数据格式错），用 `warn`。

**第二类：fire-and-forget 的**（2 处）

有些操作本身就不需要处理错误，比如遥测上报和设置保存。但即使不处理，也要写清楚为什么：

```javascript
// telemetry.js 第 289 行
try {
  sendTelemetry(event);
} catch (e) {
  // Fire-and-forget: telemetry failures should not affect user operations
  void 0;
}
```

`void 0` 加注释，说明这是有意为之，不是忘了写。

**第三类：需要保留空 catch 的**（1 处）

`settings-events.js` 的 catch 块是设计上的选择——事件监听器的回调不能抛异常，否则会打断整个事件链。这种情况保留空 catch，但加上注释：

```javascript
try {
  callback(event);
} catch (e) {
  // By design: event listeners must not throw to avoid breaking the event chain
}
```

### Python 侧（DocMind）

DocMind 的修法更直接——把 `except Exception:` 换成具体的异常类型：

```python
# 修复前
try:
    nodes = build_graph(data)
except Exception:
    pass

# 修复后
try:
    nodes = build_graph(data)
except (KeyError, ValueError, RuntimeError) as e:
    logger.error(f"Graph construction failed: {e}", exc_info=True)
```

选择哪些异常类型取决于 `build_graph` 内部可能抛什么。`KeyError` 是数据缺字段，`ValueError` 是数据格式错，`RuntimeError` 是运行时逻辑错误。这三种覆盖了大部分场景，但不会吞掉 `MemoryError` 或 `KeyboardInterrupt` 这种真正严重的问题。

关键点：`exc_info=True` 把完整的堆栈信息写进日志。没有堆栈的错误日志跟没有一样。

## 一个容易踩的坑

有人会问：那我把 `except Exception:` 改成 `except (KeyError, ValueError):`，如果代码抛了 `TypeError` 怎么办？

答案是：**它应该崩溃**。

如果代码抛出了你没预料到的异常类型，说明有你不知道的 bug。让它崩溃，让它出现在错误监控里，让你有机会发现它。`except Exception:` 的问题恰恰在于它把这种情况也吞掉了。

## 修复结果

PageWise：13 处全部处理完毕，8236 个测试全部通过，lint 零报错。改动涉及 10 个文件，每个文件的改动都很小——通常是加一行 `console.debug` 或 `console.warn`。

DocMind：3 处 `except Exception:` 替换为具体异常类型，ruff check 通过，276 个图谱相关测试全部通过。

两个项目加起来，16 处"看不见的错误"变成了"能被发现的错误"。

## 我从这次治理中学到的

第一个教训是关于时间的。这些静默 catch 块不是故意写的，通常是调试时临时加的，想着"等会儿再处理"，然后就忘了。等到系统出了问题，排查起来花的时间远比当初加一行日志要多。

第二个教训是关于 `except Exception:` 的。Python 社区有个说法叫"请求原谅比许可更容易"（EAFP），但异常处理不是这个道理。宽泛的 `except` 看起来是防御性编程，实际上是放弃了对错误的控制。

第三个教训是工具的价值。手动找 16 处问题可能需要好几天，但用 linter 规则（比如 ESLint 的 `no-empty` 和 Ruff 的 `BLE001`）可以在 CI 里自动拦截。这次治理之后，两个项目都加了相应的 lint 规则，以后不会再有新的静默 catch 混进来。

## 如果你也想做类似的治理

扫描你项目的 catch/except 块，问自己三个问题：

1. **这个 catch 块有日志输出吗？** 没有就是静默失败。
2. **它捕获的异常范围合理吗？** `except Exception:` 和空 `catch` 都是可疑的。
3. **调用方知道这里失败了吗？** 如果函数返回了 `undefined` 或 `None` 但调用方没有检查，错误就被吞掉了。

然后根据实际情况决定：加日志、缩小捕获范围、或者保留空块但加上注释。不要一刀切，也不要假装问题不存在。