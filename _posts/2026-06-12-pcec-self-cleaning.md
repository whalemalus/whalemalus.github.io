---
layout: post
title: "AI Agent 系统的自清洁：PCEC 引擎如何清理 31 天的孤儿目录和 17 处死引用"
date: 2026-06-12
categories: DevOps
tags: ["PCEC", "AI Agent", "自动化"]
excerpt: "PCEC 引擎清理了存在 31 天的无用目录、归档 7 个死脚本、修复 17 处过时引用，踩坑：归档后只修了 33% 引用。"
image: "https://whalemalus.com/file/cover-pcec-self-cleaning-key"
header:
  teaser: "https://whalemalus.com/file/cover-pcec-self-cleaning-key"
  overlay_image: "https://whalemalus.com/file/cover-pcec-self-cleaning-key"
original_url: "https://whalemalus.com/articles/pcec-self-cleaning"
---

# AI Agent 系统的自清洁：PCEC 引擎如何清理 31 天的孤儿目录和 17 处死引用

> **摘要**：今天 PCEC 引擎执行了四轮进化，清理了一个存在 31 天的无用目录、归档了 7 个死脚本、修复了分布在 6 个 skill 中的 17 处过时引用。过程中踩了一个坑：归档后只修了 33% 的引用，遗漏率 67%。本文记录完整的清理流程和验证策略。
>
> **关键词**：`PCEC` `AI Agent` `自动化运维` `死脚本清理` `引用修复`

---

## 楔子

早上九点，PCEC 引擎照常启动。它扫了一眼 `/root/.hermes/skills/` 目录，发现一个叫 `apple/` 的文件夹已经在那里躺了 31 天。打开一看，里面只有一个 `DESCRIPTION.md`，写着"macOS 桌面交互技能"——但服务器跑的是 Linux。

这就像搬家三个月后，发现储物间里还有一个写着"厨房用品"的箱子，打开全是空的。

## 引言

Hermes Agent 的技能系统目前有 120 个活跃 skill。时间长了，有些技能被废弃、有些脚本被替换、有些目录变成了空壳。不定期清理的话，这些"死重"会干扰诊断脚本，甚至导致误报。

PCEC（Periodic Cognitive Expansion Cycle）引擎每 3 小时运行一次，它的四问框架——推翻默认逻辑、剔除冗余流程、补齐短板漏洞、适配高并发——正好适合做这种系统级的清理工作。

这篇文章记录一次完整的清理过程——重点不是"清了什么"，而是"怎么验证清干净了"。

## 目录

- [全景地图：技能系统的生命周期](#全景地图技能系统的生命周期)
- [核心概念：什么是"孤儿"和"死引用"](#核心概念什么是孤儿和死引用)
- [实战指南：一次完整的清理流程](#实战指南一次完整的清理流程)
- [踩坑记录：67% 遗漏率的教训](#踩坑记录67-遗漏率的教训)
- [总结](#总结)

## 全景地图：技能系统的生命周期

```
skills/
├── docker-deployment/     ← 活跃：有 SKILL.md，在 available_skills 列表中
│   ├── SKILL.md
│   ├── scripts/
│   └── references/
├── apple/                 ← 孤儿：无 SKILL.md，不可发现，31 天未使用
│   └── DESCRIPTION.md
├── old-nginx-guide/       ← 死引用：SKILL.md 中引用了已删除的脚本
│   └── SKILL.md           ← "运行 scripts/old-deploy.sh" ← 这个文件不存在
└── .archive/              ← 归档区：被清理的技能放在这里
    ├── pagewise-continuous-iteration/
    └── ...
```

技能系统有三种"死亡"方式：

1. **孤儿目录**：有文件夹但无 SKILL.md，不在 available_skills 列表中，`skill_view` 无法加载
2. **死脚本**：SKILL.md 或其他 skill 引用的脚本文件已被删除或归档
3. **死引用**：skill 文档中引用了不存在的路径、命令或依赖

## 核心概念：什么是"孤儿"和"死引用"

**孤儿目录**（AP-010: orphan_skill_placeholder）

一个目录"看起来像"技能，但实际不可用。判定标准：
- 目录下无 `SKILL.md`
- 不在 `available_skills` 列表中
- 不被任何其他 skill 引用
- 不在诊断脚本的扫描范围内

`apple/` 目录就是典型案例。它是 2026 年 5 月 11 日创建的，大概是想做一个 macOS 桌面交互技能，但只写了一个 `DESCRIPTION.md` 就没再动过。在 Linux 服务器上，这个目录纯粹是噪音。

**死引用**（Dead References）

当一个 skill 的 SKILL.md 里写了"运行 `scripts/deploy.sh`"，但这个脚本已经被归档或删除，就形成了死引用。死引用不会导致运行时错误（因为 skill 文档只是给 AI 读的指令），但会误导 AI 执行不存在的命令。

今天发现的 17 处死引用中，有 10 处分布在 6 个 skill 里，包括 `vps-operations` 中对已归档脚本的 `chmod` 和 `crontab` 命令引用。

## 实战指南：一次完整的清理流程

### 第一步：识别孤儿目录

```bash
# 找出 skills/ 下有目录但无 SKILL.md 的条目
find /root/.hermes/skills -maxdepth 1 -type d \
  -not -name ".archive" \
  -not -name ".curator_backups" \
  -not -name "skills" | while read dir; do
    if [ ! -f "$dir/SKILL.md" ]; then
        echo "ORPHAN: $dir"
    fi
done
```

PCEC 今天的发现：`apple/` 目录，8KB，只有 `DESCRIPTION.md`。

### 第二步：归档孤儿

```bash
mkdir -p /root/.hermes/skills/.archive/
mv /root/.hermes/skills/apple/ /root/.hermes/skills/.archive/apple-2026-06-11/
```

归档而不是删除。万一以后真要做 macOS 技能，还能从 `.archive` 里找回来。

### 第三步：扫描死脚本引用

这一步是最关键的，也是今天踩坑的地方。

```bash
# 找出所有被归档的脚本
archived_scripts=$(find /root/.hermes/skills/.archive -name "*.sh" -o -name "*.py" | \
  sed 's|.*/.archive/[^/]*/||')

# 在活跃 skill 中搜索对这些脚本的引用
for script in $archived_scripts; do
    grep -rn "$script" /root/.hermes/skills/*/SKILL.md \
      /root/.hermes/skills/*/*/SKILL.md 2>/dev/null | \
      grep -v ".archive" | grep -v "⛔"
done
```

### 第四步：修复引用

有两种修复方式：
- **删除引用行**：如果整个功能已废弃
- **替换为新路径**：如果有替代脚本

### 第五步：验证（最容易忽略的一步）

```bash
# 验证：重新扫描，确认无残留引用
for script in $archived_scripts; do
    count=$(grep -rn "$script" /root/.hermes/skills/*/SKILL.md \
      /root/.hermes/skills/*/*/SKILL.md 2>/dev/null | \
      grep -v ".archive" | grep -v "⛔" | wc -l)
    if [ "$count" -gt 0 ]; then
        echo "REMAINING: $script ($count references)"
    fi
done
```

## 踩坑记录：67% 遗漏率的教训

今天最大的教训来自 15:01 和 18:01 两轮 PCEC 运行之间的差异。

**15:01 PCEC**：归档了 7 个死脚本，修复了 3 个受影响的 skill。看起来很干净。

**18:01 PCEC**：扫描发现还有 10 处引用分布在 6 个 skill 中，包括 `vps-operations` 里对已归档脚本的 `chmod` 和 `crontab` 命令。

3/9 = 33% 覆盖率，遗漏率 67%。

为什么会遗漏？因为 15:01 的修复逻辑是"找到报错的 skill → 修复"，而不是"扫描所有 skill → 找到所有引用 → 全部修复"。修了报错的 ≠ 修了所有的。

**改进措施**：在 PCEC 诊断脚本中新增了自动死脚本引用检测。每次 PCEC 运行时都会执行全量扫描，不再依赖手动逐一修复。

```bash
# 新增到 pcec-diagnostic-bootstrap.sh 的检测逻辑
echo "=== DEAD SCRIPT REFERENCES ==="
# 获取已归档脚本列表
# 在所有活跃 skill 中搜索引用
# 输出未修复的引用
```

下次再做归档，PCEC 会在当轮就扫出所有残留引用，不用等三小时后下一轮才发现。

## 总结

### 核心收获

今天的清理释放了 8KB 的 `apple/` 孤儿目录，归档了 7 个死脚本，修复了 17 处过时引用。但真正的收获不是这些数字，而是三个反模式的识别：

- **AP-008**：数据存在 ≠ 数据被消费（`expected-services.json` 创建 18 小时后监控 cron 仍未读取）
- **AP-009**：归档后必须全量验证引用（33% 覆盖率 → 67% 遗漏率）
- **AP-010**：目录存在 ≠ 技能有效（`apple/` 存在 31 天，从未被使用）

### 最佳实践

1. 归档操作要同步执行全量 grep 扫描，不能只修"报错的"
2. 创建声明式配置后，必须同步更新所有消费者
3. 定期扫描 skills/ 目录中的孤儿占位符
4. 诊断脚本应内置死引用检测，作为每次运行的常规检查

### 延伸阅读

- PCEC 引擎的完整设计：`skills/software-development/pcec-engine`
- 反退化检查机制：`skills/software-development/anti-degradation-lock`
- 诊断引导脚本：`scripts/pcec-diagnostic-bootstrap.sh`