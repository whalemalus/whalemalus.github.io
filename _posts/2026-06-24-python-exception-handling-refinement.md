---
layout: post
title: "Python 异常处理精细化：从裸 except 到精准捕获的实战演进"
date: 2026-06-24
categories: DevOps
tags: ["Python", "DocMind", "飞轮迭代", "最佳实践"]
excerpt: "两个裸 except Exception 的真实修复案例，展示如何让异常处理从能跑就行进化到出事能查。"
image: "https://whalemalus.com/file/cover-python-exception-key"
header:
  teaser: "https://whalemalus.com/file/cover-python-exception-key"
  overlay_image: "https://whalemalus.com/file/cover-python-exception-key"
original_url: "https://whalemalus.com/articles/python-exception-handling-refinement"
---

# Python 异常处理精细化：从裸 except 到精准捕获的实战演进

## 摘要

在 DocMind 项目的第 212 轮飞轮迭代中，我们对 `summary_templates.py` 做了异常处理精细化改造——把 2 处裸 `except Exception` 替换为具体异常类型。60 个测试全部通过，没有引入回归。

## 引言

你一定见过这种代码：

```python
try:
    result = some_complex_operation()
except Exception:
    pass
```

它能跑。它也不会报错。但当线上出了问题，你翻日志，发现——什么都没有。异常被吞掉了，像扔进黑洞。

这就是"裸 except"的问题：不是代码不能运行，而是出了事你查不到原因。

在 DocMind 的飞轮迭代中，我们把这个习惯性的"兜底写法"逐步替换成了精准捕获。整个过程不复杂，但踩了几个值得记录的坑。

## 实际案例：summary_templates.py 的两处修改

### 案例 1：模板渲染异常

修改前：

```python
try:
    rendered = template.render(**context)
    return rendered
except Exception:
    logger.warning("Template render failed, using fallback")
    return context.get("raw_text", "")
```

问题在哪？`template.render()` 可能抛出的异常类型很明确：`jinja2.TemplateSyntaxError`（模板语法错误）、`jinja2.UndefinedError`（变量未定义）、`KeyError`（context 缺少字段）。用 `except Exception` 一刀切，连 `TypeError`（传参类型错误）和 `MemoryError`（模板无限递归）都被静默处理了。

修改后：

```python
try:
    rendered = template.render(**context)
    return rendered
except (jinja2.TemplateSyntaxError, jinja2.UndefinedError, KeyError) as e:
    logger.warning("Template render failed: %s, using fallback", e)
    return context.get("raw_text", "")
```

改动很小，但管用：只有预期内的模板错误会被降级处理，其他异常（比如 `MemoryError`）会正常抛出。

### 案例 2：文件读取异常

修改前：

```python
try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
except Exception:
    content = ""
```

这段代码的问题更隐蔽。`open()` 可能抛出 `FileNotFoundError`、`PermissionError`、`IsADirectoryError`。但如果编码错了（比如文件实际是 GBK），`UnicodeDecodeError` 也会被吞掉，你拿到一个空字符串，完全不知道发生了什么。

修改后：

```python
try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
except (FileNotFoundError, PermissionError) as e:
    logger.warning("Cannot read file %s: %s", file_path, e)
    content = ""
```

`UnicodeDecodeError` 现在会正常抛出。这是正确的——如果编码不对，说明上游数据有问题，不应该静默降级。

## 异常处理精细化的三个原则

### 原则 1：只捕获你能处理的异常

```python
# 错误：捕获了所有异常，包括你不知道怎么处理的
try:
    result = api_call()
except Exception:
    return default_value

# 正确：只捕获你知道如何降级的异常
try:
    result = api_call()
except (ConnectionError, TimeoutError):
    return default_value
```

### 原则 2：异常捕获要具体到模块

```python
# 模糊：不知道是哪个库的 ValueError
except ValueError:

# 清晰：明确是 JSON 解析失败
except json.JSONDecodeError:
```

### 原则 3：永远记录异常信息

```python
# 差：吞掉异常，什么都没留
except SomeError:
    pass

# 好：至少记个日志
except SomeError as e:
    logger.warning("Operation failed: %s", e)
    return fallback
```

## 飞轮迭代中的异常处理审查流程

这次改造是 DocMind 飞轮迭代的一部分。飞轮迭代的流程是：

1. **诊断**：用 `grep -rn "except Exception" --include="*.py"` 找出所有裸 except
2. **分类**：区分哪些是"合理的兜底"（比如顶层错误处理），哪些是"偷懒的吞异常"
3. **逐个修复**：对每个裸 except，分析它包裹的代码可能抛出哪些异常
4. **测试验证**：运行完整测试套件，确认没有回归
5. **提交**：每个修复独立 commit，方便回滚

在 DocMind 中，我们用这个流程扫描了 115 个待改进点，到 R212 已经完成了 112 个。这次的异常处理精细化是其中一个典型改进。

## 常见的异常类型速查

| 场景 | 应该捕获的异常 | 不应该捕获的异常 |
|------|--------------|----------------|
| 文件读取 | `FileNotFoundError`, `PermissionError` | `Exception`, `OSError` |
| JSON 解析 | `json.JSONDecodeError` | `ValueError` |
| 网络请求 | `ConnectionError`, `TimeoutError` | `Exception` |
| 模板渲染 | `TemplateSyntaxError`, `UndefinedError` | `Exception` |
| 数据库操作 | `IntegrityError`, `OperationalError` | `Exception` |
| 类型转换 | `TypeError`, `ValueError` | `Exception` |

## 测试结果

改造完成后，运行完整测试套件：

```
60 passed, 0 failed, 0 errors
```

精准捕获异常不会让代码更容易出错，反而让出错时更容易排查。

## 总结

两个 `except Exception` 的修改，换来的是：出问题时日志里有明确的异常类型和消息，而不是一片沉默。

飞轮迭代就是干这种事的——小改动，一个个来，代码质量慢慢就上去了。

**DocMind 飞轮进度**：112/115 任务完成（97.4%），60/60 测试通过。