---
layout: post
title: "GitHub CI/CD 从零到实战：原理、实践与踩坑"
date: 2026-05-18
categories: 技术教程
tags: []
excerpt: "从零开始理解 GitHub CI/CD 的原理和作用，用 DocMind 和 PageWise 两个真实项目的经验，手把手教你搭建完整的自动化流水线。"
image: "https://whalemalus.com/file/cover-cicd-key"
header:
  teaser: "https://whalemalus.com/file/cover-cicd-key"
  overlay_image: "https://whalemalus.com/file/cover-cicd-key"
original_url: "https://whalemalus.com/articles/github-cicd-from-scratch"
---

> **摘要**：GitHub CI/CD 是什么？为什么每个现代项目都在用？本文从零开始，用 DocMind 和 PageWise 两个真实项目的经验，带你理解 CI/CD 的原理、作用、应用场景，并手把手教你从零搭建一套完整的自动化流水线。
>
> **关键词**：`GitHub Actions` `CI/CD` `自动化测试` `持续集成` `持续部署`

---

## 楔子

凌晨两点，你刚改完一个 bug，信心满满地推送到 GitHub。第二天早上，同事告诉你：你的代码把整个项目的测试搞炸了。你一脸懵——"我本地跑得好好的啊？"

这种场景，每个开发者都经历过。问题的根源很简单：**你的本地环境和别人的不一样**。你装了某个依赖、改了某个配置、用了一个特定版本的 Python——这些在你的电脑上没问题，但到了别人那里就炸了。

GitHub CI/CD 就是来解决这个问题的。它在每次你推送代码时，自动在一个干净的环境里跑一遍所有检查：代码风格对不对？测试过不过？能不能正常打包？如果任何一步失败，它会立刻告诉你，而不是等到半夜同事打电话来。

---

## 引言

本文将从实际项目经验出发，讲解 GitHub CI/CD 的方方面面。我们有两个真实案例：

- **DocMind**（本地文件智能助手）—— Python FastAPI 后端 + Vue 3 前端，3400+ 测试用例
- **PageWise**（Chrome 浏览器扩展）—— TypeScript + Chrome Extension MV3，5700+ 测试用例

这两个项目从零搭建了 CI/CD 流水线，过程中踩了不少坑。本文会把这些经验一并分享。

---

## 📖 目录

1. [全景地图](#1-全景地图)
2. [核心概念](#2-核心概念)
3. [实战指南](#3-实战指南)
4. [踩坑记录](#4-踩坑记录)
5. [总结与展望](#5-总结与展望)

---

## 1. 全景地图

> 鸟瞰 CI/CD 的完整体系，理解各组件之间的关系

### 什么是 CI/CD？

```
┌─────────────────────────────────────────────────────────┐
│                    CI/CD 全景图                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  开发者 ──push──→ GitHub ──触发──→ GitHub Actions        │
│                                      │                  │
│                              ┌───────┴───────┐          │
│                              │               │          │
│                            CI 阶段        CD 阶段        │
│                              │               │          │
│                        ┌─────┴─────┐   ┌─────┴─────┐    │
│                        │           │   │           │    │
│                      Lint       Test  Build     Release  │
│                    (代码风格)  (测试) (打包)    (发布)    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- **CI（Continuous Integration，持续集成）**：每次推送代码，自动检查代码质量和运行测试
- **CD（Continuous Deployment/Delivery，持续部署/交付）**：测试通过后，自动打包、发布

### 为什么需要 CI/CD？

| 没有 CI/CD | 有 CI/CD |
|------------|----------|
| 手动跑测试，经常忘记 | 每次推送自动跑 |
| "我本地没问题" | 统一环境，结果一致 |
| 发布靠人工，容易出错 | 自动打包发布 |
| Bug 到生产环境才发现 | PR 阶段就拦截 |
| 回归测试靠记忆 | 全量测试每次跑 |

### GitHub Actions 的核心组件

```
┌──────────────────────────────────────────┐
│           GitHub Actions 架构            │
├──────────────────────────────────────────┤
│                                          │
│  Workflow (工作流)                        │
│  ├── .github/workflows/ci.yml           │
│  │                                       │
│  ├── Trigger (触发条件)                   │
│  │   ├── push: 推送时触发                 │
│  │   ├── pull_request: PR 时触发          │
│  │   └── tag: 打标签时触发                │
│  │                                       │
│  ├── Job (作业)                           │
│  │   ├── lint (代码风格检查)              │
│  │   ├── test (运行测试)                  │
│  │   └── build (打包构建)                 │
│  │                                       │
│  └── Step (步骤)                          │
│      ├── actions/checkout (拉取代码)      │
│      ├── actions/setup-python (装环境)    │
│      └── 运行具体命令                     │
│                                          │
└──────────────────────────────────────────┘
```

### 学习路径

```
理解概念 → 写第一个 workflow → 添加 lint → 添加测试 → 添加构建 → 添加自动发布
```

---

## 2. 核心概念

> 关键术语和原理的深度解释

### 2.1 Workflow（工作流）

Workflow 是 CI/CD 的顶层单元，一个 `.yml` 文件就是一个 workflow。它定义了"什么时候触发、做什么事"。

**类比**：Workflow 就像一份菜谱——写好步骤，每次有食材（代码推送）进来，就按菜谱自动做菜（检查、测试、打包）。

```yaml
# .github/workflows/ci.yml
name: CI              # 工作流名称，显示在 GitHub Actions 页面

on:                   # 触发条件
  push:               # 每次 push 都触发
    branches: [master]
  pull_request:       # 每次 PR 也触发
    branches: [master]
```

### 2.2 Job（作业）

一个 workflow 可以包含多个 job，默认**并行执行**。每个 job 运行在一个独立的虚拟机上。

```yaml
jobs:
  lint:               # Job 1: 代码风格检查
    runs-on: ubuntu-latest
    steps: [...]

  test:               # Job 2: 运行测试
    runs-on: ubuntu-latest
    steps: [...]
```

**为什么要分 job？**
- 并行执行，更快得到结果
- 互不影响，一个失败不阻塞另一个
- 独立环境，避免依赖冲突

### 2.3 Step（步骤）

每个 job 由多个 step 组成，按顺序执行。

```yaml
steps:
  - name: 拉取代码              # Step 1
    uses: actions/checkout@v4

  - name: 安装 Python           # Step 2
    uses: actions/setup-python@v5
    with:
      python-version: '3.12'

  - name: 安装依赖              # Step 3
    run: pip install -r requirements.txt

  - name: 运行测试              # Step 4
    run: pytest tests/ -v
```

### 2.4 Runner（运行器）

Runner 是执行 job 的虚拟机。GitHub 提供免费的云端 runner：

| Runner | 系统 | 适用场景 |
|--------|------|----------|
| `ubuntu-latest` | Ubuntu 24.04 | 大多数项目（推荐） |
| `windows-latest` | Windows Server | Windows 特定项目 |
| `macos-latest` | macOS | iOS/macOS 开发 |

也可以用**自托管 runner**（self-hosted），比如在自己的服务器上运行，适合需要特殊环境的场景。

### 2.5 Actions（动作）

Actions 是可复用的组件，用 `uses` 引用。最常用的几个：

```yaml
# 拉取代码
- uses: actions/checkout@v4

# 设置 Python 环境
- uses: actions/setup-python@v5
  with:
    python-version: '3.12'

# 设置 Node.js 环境
- uses: actions/setup-node@v4
  with:
    node-version: '20'
```

### 2.6 触发机制详解

```yaml
on:
  # 推送到 master 分支时触发
  push:
    branches: [master]

  # PR 目标是 master 时触发
  pull_request:
    branches: [master]

  # 推送 v 开头的标签时触发（用于发布）
  push:
    tags: ['v*']

  # 手动触发
  workflow_dispatch:

  # 定时触发（每天 UTC 0 点）
  schedule:
    - cron: '0 0 * * *'
```

---

## 3. 实战指南

> 从零开始搭建 CI/CD 流水线

### 3.1 第一步：创建 Workflow 文件

在项目根目录创建 `.github/workflows/ci.yml`：

```bash
mkdir -p .github/workflows
touch .github/workflows/ci.yml
```

### 3.2 Python 项目的完整 CI 配置

以 DocMind 项目为例（FastAPI + pytest）：

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  # ── Job 1: 代码风格检查 ──
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install ruff
        run: pip install ruff

      - name: 检查代码风格
        run: ruff check src/

      - name: 检查代码格式
        run: ruff format --check src/

  # ── Job 2: 单元测试 ──
  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: 安装依赖
        run: |
          pip install -r requirements.txt
          pip install -r requirements-test.txt

      - name: 运行单元测试
        run: pytest tests/unit/ -v --tb=short
```

**关键点解释**：

1. **`ruff`** 是 Python 的代码风格检查工具，类似 ESLint 之于 JavaScript
2. **`pytest`** 是 Python 的测试框架，`-v` 显示详细输出，`--tb=short` 简化错误信息
3. **两个 job 并行运行**：lint 和 test 互不依赖，同时跑节省时间

### 3.3 JavaScript / Chrome Extension 项目的 CI 配置

以 PageWise 项目为例（TypeScript + Chrome Extension MV3）：

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: ESLint 代码检查
        run: npm run lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: 运行单元测试
        run: npm test

  package-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run build

      - name: 检查包体积
        run: |
          SIZE=$(du -sh dist/ | cut -f1)
          echo "包体积: $SIZE"
          # 如果超过 5MB 则失败
          MAX_SIZE=5000
          ACTUAL=$(du -sk dist/ | cut -f1)
          if [ "$ACTUAL" -gt "$MAX_SIZE" ]; then
            echo "包体积超过限制: ${ACTUAL}KB > ${MAX_SIZE}KB"
            exit 1
          fi
```

### 3.4 自动发布（Release）

当测试稳定后，可以添加自动发布 workflow：

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags: ['v*']  # 推送 v 开头的标签时触发

permissions:
  contents: write  # 需要写权限来创建 Release

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: 打包项目
        run: |
          zip -r release.zip . -x ".git/*" "node_modules/*" ".github/*"

      - name: 创建 GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: release.zip
          generate_release_notes: true
```

**使用方式**：

```bash
# 本地打标签并推送
git tag v1.0.0
git push origin v1.0.0

# GitHub Actions 自动触发 → 创建 Release → 上传 zip
```

### 3.5 Docker 构建验证

对于有 Dockerfile 的项目，可以添加构建验证：

```yaml
# .github/workflows/docker-build.yml
name: Docker Build

on:
  pull_request:
    branches: [master]

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: 构建 Docker 镜像
        run: docker build -t myapp:test .

      - name: 验证镜像能启动
        run: |
          docker run -d --name test-app -p 8000:8000 myapp:test
          sleep 5
          curl -f http://localhost:8000/health || exit 1
          docker stop test-app
```

### 3.6 环境变量和密钥管理

CI 中经常需要 API Key、密码等敏感信息。GitHub Secrets 解决了这个问题：

**设置步骤**：
1. 进入仓库 → Settings → Secrets and variables → Actions
2. 点击 "New repository secret"
3. 输入名称和值（如 `API_KEY`）

**在 workflow 中使用**：

```yaml
steps:
  - name: 运行需要 API 的测试
    env:
      API_KEY: ${{ secrets.API_KEY }}
    run: pytest tests/ -v
```

**⚠️ 重要**：永远不要把密钥硬编码在 `.yml` 文件中！

### 3.7 缓存优化

每次 CI 运行都要重新安装依赖，很慢。缓存可以加速：

```yaml
# Python 缓存
- uses: actions/setup-python@v5
  with:
    python-version: '3.12'
    cache: 'pip'  # 自动缓存 pip 包

# Node.js 缓存
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'  # 自动缓存 npm 包
```

效果：依赖安装从 2 分钟降到 10 秒。

### 3.8 完整的三阶段流水线

将所有内容组合成一个完整的 CI/CD 体系：

```
┌─────────────────────────────────────────────────────┐
│                 三阶段流水线                          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  阶段1: CI（每次 push/PR）                           │
│  ├── lint（代码风格）     ← 10-30 秒                │
│  ├── test（单元测试）     ← 1-5 分钟                │
│  └── build（构建验证）    ← 30 秒-2 分钟            │
│                                                     │
│  阶段2: CD-Release（打标签时）                        │
│  ├── 打包项目                                       │
│  ├── 创建 GitHub Release                            │
│  └── 上传产物                                       │
│                                                     │
│  阶段3: CD-Deploy（可选，手动或自动）                 │
│  ├── 构建 Docker 镜像                               │
│  ├── 推送到镜像仓库                                  │
│  └── 部署到服务器                                    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 4. 踩坑记录

> 我们在 DocMind 和 PageWise 项目中踩过的坑

### 4.1 测试本地通过但 CI 失败

**现象**：本地 `pytest` 全绿，CI 里有一个测试失败。

**原因**：测试依赖了模块级别的注册逻辑，但 CI 的导入顺序不同。

```python
# 某个 converter 模块在导入时注册自己
# 本地跑时碰巧先导入了这个模块
# CI 环境导入顺序不同，注册没发生

# ❌ 错误：假设注册已发生
def test_converter(self):
    converter = ConverterFactory.get_converter(".txt")  # 返回 None！

# ✅ 正确：显式注册
def test_converter(self):
    from docmind.converters.markitdown_converter import MarkItDownConverter
    ConverterFactory.register(MarkItDownConverter)  # 确保注册
    converter = ConverterFactory.get_converter(".txt")  # 正常工作
```

**教训**：不要依赖模块导入的副作用，测试中要显式设置所需状态。

### 4.2 pytest -x 隐藏了多个失败

**现象**：CI 显示 "1 failed"，本地跑看到 "5 failed"。

**原因**：CI 命令里有 `-x` 参数，遇到第一个失败就停止。

```yaml
# ❌ 只报告第一个失败
- run: pytest tests/ -x -v

# ✅ 跑完所有测试，报告全部结果
- run: pytest tests/ -v --tb=short
```

### 4.3 CSS 变量测试因设计风格变更失败

**现象**：字体测试失败，提示 `--font-sans 未以 sans-serif 结尾`。

**原因**：项目从无衬线风格改成了学术复古风格（serif），但测试还在检查 sans-serif。

```python
# ❌ 只接受 sans-serif
assert value.endswith("sans-serif")

# ✅ 接受两种风格
assert value.endswith("sans-serif") or value.endswith("serif")
```

**教训**：测试要与设计决策保持同步。设计变了，测试也要跟着改。

### 4.4 缺少依赖导致 CI 失败

**现象**：本地有 `markitdown[all]`，CI 报 `ModuleNotFoundError`。

**原因**：`requirements.txt` 里只写了 `markitdown`，但代码用到了 `markitdown[all]` 的功能。

```yaml
# ✅ 在 CI 中显式安装需要的依赖
- name: 安装依赖
  run: |
    pip install -r requirements.txt
    pip install "markitdown[all]"  # 显式安装，不依赖 requirements
```

### 4.5 Release 权限不足

**现象**：Release workflow 报 `Resource not accessible by integration`。

**原因**：默认的 `GITHUB_TOKEN` 没有写权限。

```yaml
# ✅ 添加权限声明
permissions:
  contents: write  # 创建 Release 需要写权限
```

### 4.6 Node.js 版本警告

**现象**：CI 日志显示 `Node.js 20 actions are deprecated`。

**原因**：GitHub Actions 正在从 Node.js 20 迁移到 24。

**解决方案**：暂时只是警告，不影响运行。关注 `actions/checkout`、`actions/setup-python` 等官方 action 的更新。

---

## 5. 总结与展望

### 核心收获

1. **CI/CD 不是可选的，是必须的**。只要项目超过一个人、超过一天的开发周期，CI/CD 就值得投入。

2. **从简单开始**。先加 lint + 测试，再慢慢加构建、发布。不要一开始就追求完美的流水线。

3. **测试是核心**。CI 的价值在于自动跑测试。没有测试的 CI 就是没有灵魂的躯壳。

4. **踩坑是正常的**。CI 环境和本地环境不一样，一定会遇到各种问题。关键是建立"CI 失败 → 分析原因 → 修复 → 推送"的肌肉记忆。

### 最佳实践

| 实践 | 说明 |
|------|------|
| lint 和 test 并行 | 节省时间，互不阻塞 |
| 缓存依赖 | pip/npm 缓存可以节省 1-2 分钟 |
| 不要用 `-x` | 让 pytest 跑完所有测试 |
| 显式安装依赖 | 不要依赖 requirements.txt 的完整性 |
| 测试要独立 | 不依赖模块导入顺序、不依赖外部状态 |
| 密钥用 Secrets | 永远不要硬编码敏感信息 |
| PR 阶段拦截 | 让 CI 在合并前就发现问题 |

### 延伸阅读

- [GitHub Actions 官方文档](https://docs.github.com/en/actions)
- [GitHub Actions Marketplace](https://github.com/marketplace?type=actions) — 现成的 Actions 组件
- [ruff 文档](https://docs.astral.sh/ruff/) — Python 代码风格工具
- [pytest 文档](https://docs.pytest.org/) — Python 测试框架

---

> **作者的话**：本文的所有配置都来自 DocMind 和 PageWise 两个真实项目的实践。如果你按照步骤操作遇到问题，欢迎在评论区留言，我会尽量解答。CI/CD 的学习曲线不陡，但需要动手实践——打开你的项目，创建第一个 `.github/workflows/ci.yml`，然后推送到 GitHub，看看会发生什么。
