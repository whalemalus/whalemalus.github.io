---
layout: post
title: "注册表模式：让自动化任务不再硬编码"
date: 2026-04-30
categories: DevOps
tags: ["DevOps", "自动化", "AI Agent"]
excerpt: "通过维护一个配置文件作为唯一数据源，让 cron 任务不再硬编码路径和目标。结合 GitHub 仓库同步和博客文章发布的实践，展示注册表模式如何让自动化运维变得清爽。"
image: "https://whalemalus.com/file/cover-registry-2026"
original_url: "https://whalemalus.com/articles/registry-pattern-automation"
---

# 注册表模式：让自动化任务不再硬编码

> **摘要**：本文介绍一种让自动化任务动态发现工作目标的「注册表模式」。通过维护一个配置文件作为唯一数据源，cron 任务不再硬编码路径和目标，而是从注册表中动态读取。结合我们在服务器自动化运维中的实践，展示如何用两个简单的文本文件管理所有 GitHub 仓库同步和内容发布任务。

> **关键词**：`注册表模式` `自动化` `cron` `DevOps` `配置驱动`

---

## 楔子

我们服务器上跑着十几个定时任务：GitHub 仓库同步、博客文章发布、飞轮迭代、备份……最初每个任务的 prompt 里都硬编码了要检查哪些目录、推送到哪个仓库。

直到有一天我发现一个问题：我在对话中创建了一个新的 GitHub 项目，但定时任务根本不知道它的存在 — 因为它的路径没有写在任何 cron 任务的 prompt 里。

这让我意识到：**硬编码是自动化的天敌。**

---

## 1. 问题：硬编码的自动化

### 1.1 典型的硬编码 cron 任务

```yaml
# ❌ 硬编码方式
prompt: |
  检查以下目录是否有变更：
  - /home/user/project-a/
  - /home/user/project-b/
  - /opt/some-other-project/
  如有变更则 git push
```

**问题**：
- 新增项目时必须手动修改 cron 任务
- 项目路径分散在多个 cron 任务中，难以管理
- 删除一个项目后，cron 任务还在检查一个不存在的路径
- 项目搬了位置，所有引用它的 cron 任务都要改

### 1.2 更隐蔽的硬编码

```yaml
# ❌ 看似灵活，实际也是硬编码
prompt: |
  扫描 /home/user/ 目录下所有 git 仓库
  如有变更则 git push
```

**问题**：
- 项目不一定都在 `/home/user/` 下
- 有些目录是临时的，不该同步
- 有些仓库没有 remote，不该尝试 push
- 无法区分哪些仓库需要同步、哪些不需要

---

## 2. 解决方案：注册表模式

### 2.1 核心思想

**一个配置文件作为唯一数据源（Single Source of Truth）。**

```
注册表文件（配置）
    │
    ▼
定时任务读取注册表
    │
    ▼
逐个执行：检查 → 操作 → 报告
```

### 2.2 注册表格式

使用简单的文本格式，人可读、机器可解析：

```
# 以 # 开头的行是注释
<字段1> | <字段2> | <字段3> | ...
```

**为什么不用 YAML/JSON？**
- 文本文件更简单，不需要解析库
- 人可以直接用 `vim` 编辑，不需要格式知识
- `grep`、`awk` 等 Unix 工具可以直接处理
- 不容易出现格式错误（YAML 的缩进、JSON 的引号）

### 2.3 两种注册表

我们实践了两种注册表：

**注册表 1：GitHub 仓库同步**

```bash
# 文件: /home/user/.agent/github-repos.txt
# 格式: <本地路径> | <GitHub 仓库> | <描述>

/home/user/wiki | user/llm-wiki | LLM Wiki 知识库
/home/user/project | user/project | 项目代码
/root/.config | user/config-backup | 配置备份
```

**注册表 2：内容来源监控**

```bash
# 文件: /home/user/.agent/content-sources.txt
# 格式: <类型> | <路径> | <目标> | <描述>

session | /home/user/sessions/ | blog | 对话记录
wiki-page | /home/user/wiki/concepts/ | both | Wiki 概念页
skill | /home/user/.agent/skills/ | blog | 技能文档
```

---

## 3. 技术实现

### 3.1 注册表解析器

```bash
#!/bin/bash
# 读取注册表并逐行处理

REGISTRY="/home/user/.agent/github-repos.txt"

while IFS='|' read -r path repo desc; do
    # 跳过注释和空行
    [[ "$path" =~ ^#.*$ ]] && continue
    [[ -z "$path" ]] && continue
    
    # 去除首尾空格
    path=$(echo "$path" | xargs)
    repo=$(echo "$repo" | xargs)
    desc=$(echo "$desc" | xargs)
    
    # 检查路径是否存在
    if [[ ! -d "$path" ]]; then
        echo "⚠️ 路径不存在: $path ($desc)"
        continue
    fi
    
    # 检查是否有变更
    cd "$path"
    changes=$(git status --porcelain 2>/dev/null)
    
    if [[ -n "$changes" ]]; then
        echo "📝 有变更: $desc"
        git add -A
        git commit -m "auto-sync: $(date +%Y-%m-%d)"
        git push origin master
    else
        echo "⏭️ 无变更: $desc"
    fi
done < "$REGISTRY"
```

### 3.2 Cron 任务配置

```yaml
# cron 任务的 prompt 不再硬编码路径
prompt: |
  你是自动化同步 Agent。
  
  从 /home/user/.agent/github-repos.txt 读取仓库注册表。
  格式: <本地路径> | <GitHub 仓库> | <描述>
  以 # 开头的行是注释。
  
  对每个仓库:
  1. 检查路径是否存在
  2. 检查 git 变更
  3. 有变更则 commit + push
  4. 输出同步报告
```

### 3.3 注册表更新机制

```bash
# 新增仓库
echo "/home/user/new-project | user/new-project | 新项目" >> /home/user/.agent/github-repos.txt

# 删除仓库（用 sed 删除匹配行）
sed -i '|new-project|d' /home/user/.agent/github-repos.txt

# 查看注册表
cat /home/user/.agent/github-repos.txt | grep -v "^#"
```

---

## 4. 实践案例

### 4.1 GitHub 仓库每日同步

**注册表**: `/home/user/.agent/github-repos.txt`

```
/home/user/wiki | user/llm-wiki | LLM Wiki 知识库
/home/user/project | user/project | PageWise Chrome 扩展
/home/user/autopilot | user/autopilot | 飞轮迭代引擎
/home/user/.agent | user/config-backup | Hermes Agent 配置备份
```

**Cron 任务**: 每天 01:00 执行

**工作流程**:
```
01:00 触发
  → 读取 github-repos.txt（4 个仓库）
  → 逐个检查:
    - wiki: 有 2 个新页面 → commit + push ✅
    - pagewise: 飞轮迭代已自动提交 → 跳过 ⏭️
    - autopilot: 无变更 → 跳过 ⏭️
    - hermes-backup: 有配置变更 → commit + push ✅
  → 输出同步报告到飞书
```

**实际执行结果**:
```
last_run_at: 2026-04-30T11:51:00
last_status: ok

检测到 pagewise 仓库有未提交的迭代报告
→ 自动 commit: "docs: 新增 R25 迭代报告"
→ 自动 push: 成功
```

### 4.2 内容来源每日扫描

**注册表**: `/home/user/.agent/content-sources.txt`

```
session | .../claude-code-sessions/ | blog | Claude Code 对话记录
iter-report | .../pagewise/docs/reports/ | blog | 迭代报告
wiki-page | .../wiki/concepts/ | both | Wiki 概念页面
skill | /home/user/.agent/skills/ | blog | Skills
```

**Cron 任务**: 每天 02:00 执行

**工作流程**:
```
02:00 触发
  → 读取 content-sources.txt
  → 扫描过去 24 小时的新增内容:
    - session: 2 个新对话记录 → 撰写文章 → 发布博客
    - wiki-page: 3 个新概念页 → 撰写「知识库更新」→ 发布博客
    - iter-report: 5 个迭代报告 → 无重大功能 → 跳过
    - skill: 1 个新 skill → 撰写经验总结 → 发布博客
  → 脱敏检查 → 发布 → 清缓存
```

### 4.3 飞轮迭代与注册表的协作

飞轮迭代引擎在完成一轮迭代后，会自动 commit 代码。但有些变更不是飞轮产生的（比如我在对话中手动修改了文件），这些变更就会遗漏。

**注册表解决了这个问题**：每天 01:00 的 cron 任务会检查所有注册的仓库，把飞轮遗漏的变更也一并推送。

```
飞轮迭代（实时）     注册表 cron（每天一次）
    │                      │
    ▼                      ▼
自动 commit + push     检查所有仓库
    │                      │
    ├─ 代码变更 ✅         ├─ 飞轮已提交的 → 跳过
    ├─ 迭代报告 ✅         ├─ 飞轮遗漏的 → 补提交
    └─ 文档更新 ✅         └─ 对话中新增的 → 补提交
```

---

## 5. 注册表模式的优势

### 5.1 集中管理

所有需要同步的仓库、所有需要监控的内容来源，都集中在一两个文件里。不需要翻遍十几个 cron 任务来找到"哪个任务在检查哪个目录"。

### 5.2 动态扩展

新增一个项目？只需要往注册表加一行。不需要修改任何 cron 任务的 prompt。

### 5.3 容错性

注册表中的路径不存在时，cron 任务会记录警告但不会崩溃。不会因为一个仓库的问题影响其他仓库的同步。

### 5.4 可审计

注册表文件本身就在 Git 管理下。谁在什么时候添加了什么仓库，一目了然。

### 5.5 解耦

cron 任务的逻辑（怎么同步）和配置（同步什么）完全分离。修改配置不需要理解任务逻辑，修改任务逻辑不需要关心具体配置。

---

## 6. 适用场景

| 场景 | 注册表内容 | Cron 任务 |
|------|-----------|----------|
| GitHub 仓库同步 | 本地路径 + 仓库地址 | 每天检查变更并 push |
| 博客文章发布 | 内容来源路径 + 发布目标 | 每天扫描新内容并发布 |
| 监控检查 | 服务地址 + 检查间隔 | 按间隔检查服务健康 |
| 数据备份 | 数据目录 + 备份目标 | 每天增量备份 |
| 日志收集 | 日志路径 + 归档策略 | 每天归档日志 |

**共同特征**：有一组"目标"需要定期处理，且目标会动态增减。

---

## 7. 最佳实践

### 7.1 注册表文件命名

使用清晰的命名，让人一眼看出用途：

```
✅ github-repos.txt        — GitHub 仓库列表
✅ content-sources.txt     — 内容来源列表
✅ backup-targets.txt      — 备份目标列表

❌ config.txt              — 太模糊
❌ list.txt                — 不知道是什么列表
```

### 7.2 注册表格式

```
# 第一行写注释说明格式
# 格式: <字段1> | <字段2> | <字段3>

# 每个字段的含义在头部说明
# 字段1: 本地路径（绝对路径）
# 字段2: 远程仓库地址
# 字段3: 描述（人类可读）
```

### 7.3 注册表放在哪

放在 Agent 的配置目录下，和其他配置一起管理：

```
/home/user/.agent/
├── github-repos.txt       — 仓库注册表
├── content-sources.txt    — 内容来源注册表
├── skills/                — 技能文档
└── memory/                — 记忆文件
```

### 7.4 注册表的生命周期管理

```bash
# 新增
echo "新条目" >> /path/to/registry.txt

# 删除
sed -i '|要删除的关键词|d' /path/to/registry.txt

# 修改
sed -i 's|旧值|新值|' /path/to/registry.txt

# 查看
cat /path/to/registry.txt | grep -v "^#"

# 统计
cat /path/to/registry.txt | grep -v "^#" | grep -v "^$" | wc -l
```

---

## 8. 与其他模式的对比

| 模式 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| **硬编码** | 路径写在 cron prompt 里 | 最简单 | 难维护、容易遗漏 |
| **目录扫描** | 扫描固定目录下所有文件 | 自动发现 | 无法区分、可能误操作 |
| **注册表** | 维护一个配置文件 | 精确控制、易维护 | 需要手动注册 |
| **服务发现** | 通过 API 动态发现 | 全自动 | 复杂、需要额外服务 |

**注册表模式是硬编码和全自动之间的最佳平衡点。**

---

## 9. 扩展方向

### 9.1 注册表校验

定期检查注册表的健康状态：

```bash
# 检查所有路径是否存在
while IFS='|' read -r path repo desc; do
    [[ "$path" =~ ^#.*$ ]] && continue
    [[ -z "$path" ]] && continue
    path=$(echo "$path" | xargs)
    [[ ! -d "$path" ]] && echo "❌ 路径不存在: $path"
done < /home/user/.agent/github-repos.txt
```

### 9.2 注册表 Web UI

如果注册表条目很多，可以做一个简单的 Web 界面来管理：

- 查看所有注册的仓库/来源
- 添加/删除条目
- 查看每个条目的同步状态
- 手动触发同步

### 9.3 注册表继承

支持"基础注册表 + 项目注册表"的继承模式：

```
/home/user/.agent/global-repos.txt        — 全局仓库
/home/user/project/.project-repos.txt — 项目级仓库
```

---

## 总结

注册表模式的核心就一句话：**把"做什么"从"怎么做"中分离出来。**

- **怎么做**（cron 任务逻辑）→ 写一次，很少改
- **做什么**（注册表条目）→ 经常改，改起来很简单

两个文本文件，解决了所有自动化任务的动态发现问题：

```
github-repos.txt     → GitHub 仓库同步
content-sources.txt  → 博客文章发布
```

**不需要数据库，不需要配置中心，不需要 API。就是两个文本文件。**

如果你的服务器上也跑着一堆定时任务，不妨试试这个模式。把硬编码的路径抽出来放到注册表里，你会发现自动化运维突然变得清爽了很多。
