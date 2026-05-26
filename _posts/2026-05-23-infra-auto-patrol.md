---
layout: post
title: "基础设施自动化巡检实战：端口管理、飞轮守护与 Cron 自愈"
date: 2026-05-23
categories: DevOps
tags: ["Hermes Agent", "自动化", "cron", "DevOps"]
excerpt: "一台服务器十几个服务，端口冲突、容器暂停、飞书消息发不出去、飞轮迭代卡死——用 Hermes Agent 构建自动化巡检体系，让问题在发生时就被发现。"
image: "https://whalemalus.com/file/cover-infra-patrol-key"
original_url: "https://whalemalus.com/articles/infra-auto-patrol"
---

> **摘要**：一台服务器跑着十几个服务，端口冲突、容器暂停、飞书消息发不出去、飞轮迭代莫名卡死——这些问题如果靠人肉排查，每天至少烧掉半小时。本文记录了用 Hermes Agent 构建自动化巡检体系的实战过程，覆盖端口管理、飞轮守护、Cron 任务自愈三条主线。
>
> **关键词**：`Hermes Agent` `飞轮守护者` `端口管理` `自动化巡检` `Cron 自愈`

---

## 楔子

凌晨四点，手机弹出一条飞书消息：「智能体晨报发送失败，错误码 99992402」。

点开一看，不只是晨报——日报、Wiki 扫描器、磁盘清理……六个定时任务全部报同一个错。服务器上二十几个端口，谁在监听谁不知道。DocMind 的飞轮迭代已经卡了 26 小时没人发现。

这不是假设场景，这是 2026 年 5 月 22 日真实发生的事。

## 引言

当一台 VPS 上跑着 Docker 容器、Xray 代理、Nginx 反代、Claude Code 飞轮、飞书机器人等十几个服务时，「运维」不再是偶尔 SSH 上去看看那么简单。端口会冲突，容器会暂停，API 代理会静默失败，Cron 任务的 delivery 配置会过期。

本文记录的是：如何用 Hermes Agent 把这些巡检工作自动化，让问题在发生时就被发现和修复，而不是等用户投诉。

## 📖 目录

1. [全景地图](#1-全景地图)
2. [核心概念](#2-核心概念)
3. [实战指南](#3-实战指南)
4. [踩坑记录](#4-踩坑记录)
5. [总结与展望](#5-总结与展望)

---

## 1. 全景地图

> 鸟瞰服务器自动化巡检的完整架构，理解各组件之间的关系

### 架构图

```
┌─────────────────────────────────────────────────────┐
│              Hermes Agent 自动化巡检体系              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐        │
│  │ 端口管理  │   │ 飞轮守护  │   │ Cron自愈  │        │
│  │ 三件套    │   │ Guardian  │   │ Delivery  │        │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘        │
│       │              │              │               │
│       ▼              ▼              ▼               │
│  ┌─────────────────────────────────────────┐        │
│  │           Cron 定时调度层                │        │
│  │  (port-audit / guardian / delivery-check)│        │
│  └─────────────────────┬───────────────────┘        │
│                        │                            │
│                        ▼                            │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐        │
│  │ 飞书通知  │   │ 日志沉淀  │   │ 自动修复  │        │
│  └──────────┘   └──────────┘   └──────────┘        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 数据/请求流转

```
Cron 触发 → 诊断脚本执行 → 发现问题 → 尝试自动修复
    │                                      │
    │ 修复失败                              │ 修复成功
    ▼                                      ▼
飞书告警 ← 生成报告                  更新日志 + 通知
```

### 本文的学习路径

```
端口管理（基础）→ 飞轮守护（进阶）→ Cron 自愈（高级）→ 组合成完整体系
```

## 2. 核心概念

> 关键术语和原理的深度解释

### 飞轮守护者（Flywheel Guardian）

类比：就像工厂里的巡检机器人，每隔几小时沿着固定路线走一圈，检查每台机器是否正常运转。发现异常就尝试修复，修不了就通知工人。

在 Hermes Agent 体系中，飞轮守护者是一个 Cron 任务，定期执行诊断脚本检查两个项目（DocMind 和 PageWise）的健康状态：
- 最后一次 Git 提交是什么时候？
- TODO.md 里还有多少待办任务？
- CI 是否通过？
- Claude Code API 代理是否可达？

### 端口注册表

类比：公司前台的访客登记表。每个进来的「访客」（端口）都要登记姓名（服务名）、房间号（端口号）、来访目的（用途）。审计工具就是保安，定期核对登记表和实际在场的人是否一致。

### Cron Delivery 自愈

Cron 任务的 `origin.thread_id` 就像信件上的旧地址。如果收件人搬家了（飞书群被删除），信件就会退回。自愈机制就是：检测到退信 → 清除旧地址 → 重新投递到默认地址。

## 3. 实战指南

> 从零开始的实操步骤

### 3.1 端口管理三件套

#### 问题

服务器上有 19 个端口在监听，但没有统一的记录。某天一个新服务占用了已被使用的端口，导致另一个服务静默挂掉。

#### 解决方案：三个脚本 + 一个注册表

**注册表** (`/root/.hermes/port-registry.txt`)：

```bash
# 格式：端口号 | 协议 | 服务名 | 用途 | 是否对外
22|tcp|SSH|远程管理|是
80|tcp|Nginx|HTTP反代|是
443|tcp|Xray|VLESS/TLS代理|是
2222|tcp|DimStack|博客应用|否
3307|tcp|MySQL|数据库|否
6380|tcp|Redis|缓存|否
7860|tcp|DocMind|文档助手|否
8090|tcp|AxonHub|API网关|否
```

**port-list.sh** — 列出所有注册端口：

```bash
#!/bin/bash
# 列出端口注册表中所有条目
cat /root/.hermes/port-registry.txt | grep -v '^#' | column -t -s'|'
```

**port-register.sh** — 注册新端口：

```bash
#!/bin/bash
# 用法: port-register.sh <端口> <协议> <服务名> <用途> <是否对外>
echo "$1|$2|$3|$4|$5" >> /root/.hermes/port-registry.txt
echo "已注册: $1 $3"
```

**port-audit.sh** — 审计端口（核心脚本）：

```bash
#!/bin/bash
# 对比注册表和实际监听端口，找出异常
echo "=== 端口审计报告 ==="
echo ""

# 获取实际监听端口
ss -tlnp | tail -n +2 | awk '{print $4}' | grep -oE '[0-9]+$' | sort -un > /tmp/actual_ports.txt

# 获取注册端口
grep -v '^#' /root/.hermes/port-registry.txt | cut -d'|' -f1 | sort -un > /tmp/registered_ports.txt

# 未注册的端口（可能有安全风险）
echo "⚠️ 未注册但在监听的端口:"
comm -23 /tmp/actual_ports.txt /tmp/registered_ports.txt

# 已注册但未监听的端口（服务可能挂了）
echo ""
echo "🔴 已注册但未在监听的端口:"
comm -13 /tmp/actual_ports.txt /tmp/registered_ports.txt
```

#### 执行效果

```
=== 端口审计报告 ===

⚠️ 未注册但在监听的端口:
18080
54211

🔴 已注册但未在监听的端口:
(无)
```

发现两个未注册端口：18080（Xray WebSocket）和 54211（X-UI 面板），补充注册后注册表完整覆盖了所有 19 个端口。

### 3.2 飞轮守护者实战

#### 问题

DocMind 项目的飞轮迭代卡了 26 小时没人发现。原因是 Claude Code API 代理返回 HTTP 000（连接失败），但没有任何告警。

#### 诊断脚本

```python
#!/usr/bin/env python3
"""飞轮守护者诊断脚本"""
import subprocess, json, os

PROJECTS = {
    "DocMind": "/home/claude-user/docmind",
    "PageWise": "/home/claude-user/pagewise"
}

def check_project(name, path):
    issues = []
    
    # 检查 Git 状态
    result = subprocess.run(
        ["git", "-C", path, "log", "-1", "--format=%ct"],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        last_commit_ts = int(result.stdout.strip())
        hours_since = (time.time() - last_commit_ts) / 3600
        if hours_since > 12:
            issues.append(f"🔴 已 {hours_since:.0f} 小时无提交")
    
    # 检查 TODO 状态
    todo_path = os.path.join(path, "docs/TODO.md")
    if os.path.exists(todo_path):
        content = open(todo_path).read()
        pending = content.count("- [ ]")
        if pending == 0:
            issues.append("⚠️ TODO 已耗尽，需要生成新任务")
        elif pending > 10:
            issues.append(f"⚠️ 积压 {pending} 个待办任务")
    
    # 检查 CI 状态
    result = subprocess.run(
        ["gh", "run", "list", "--repo", f"whalemalus/{name.lower()}", 
         "--limit", "1", "--json", "conclusion"],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        runs = json.loads(result.stdout)
        if runs and runs[0].get("conclusion") != "success":
            issues.append(f"🔴 CI 最近一次运行失败")
    
    return issues

for name, path in PROJECTS.items():
    issues = check_project(name, path)
    if issues:
        print(f"\
{name}:")
        for issue in issues:
            print(f"  {issue}")
```

#### 实际巡检结果（5月22日）

```
DocMind:
  🔴 已 26 小时无提交
  ⚠️ 积压 7 个待办任务 (L003-L008)
  🔴 API 代理返回 HTTP 000

PageWise:
  ✅ 一切正常（最后提交 0 小时前，244 个任务已完成）
```

#### 自动修复尝试

守护者发现 DocMind 卡住后，尝试通过 Claude Code CLI 触发下一轮迭代：

```bash
# 写入提示文件
cat > /tmp/docmind-prompt.txt << 'EOF'
继续执行 L003: 输入验证与安全加固
检查 TODO.md 中 L003 的具体要求，开始实现。
EOF

# 通过 wrapper 调用 Claude Code
/home/claude-user/scripts/claude-code-wrapper.sh --prompt-file /tmp/docmind-prompt.txt
```

这次修复没有成功——Claude Code CLI 显示「Not logged in」，API 代理仍然不可达。但守护者做了正确的事：记录了问题、尝试了修复、失败后通知了用户。

### 3.3 Cron Delivery 自愈

#### 问题

6 个 Cron 任务同时报错 `[99992402] field validation failed`，飞书消息全部发不出去。

#### 根因排查

```python
# 检查哪些任务有 delivery 错误
import json
jobs = json.load(open('/root/.hermes/jobs.json'))
for job_id, job in jobs.items():
    delivery = job.get('delivery', {})
    if delivery.get('error'):
        print(f"{job_id}: {job['name']} → {delivery['error']}")
```

输出：

```
1c8277c2780d: 智能体晨报 → field validation failed
22851d3d155f: 智能体日报 → field validation failed
a1cb206018e3: server-disk-cleanup → field validation failed
030087d800ad: Wiki Inbox Scanner → field validation failed
ec33538bafa1: Wiki Sprout Detector → field validation failed
800b43384db7: Daily Asset Maintenance → field validation failed
```

6 个任务都有同一个 `origin.thread_id`：`om_x100b6fe8826e78a4b4c991ce01991d9`。这个飞书消息线程已经被删除了，但 Cron 任务的配置还指向它。

#### 修复

```python
# 清除所有任务的 stale thread_id
import json
jobs_path = '/root/.hermes/jobs.json'
jobs = json.load(open(jobs_path))

fixed = 0
for job_id, job in jobs.items():
    origin = job.get('origin', {})
    if 'thread_id' in origin:
        del origin['thread_id']
        fixed += 1

with open(jobs_path, 'w') as f:
    json.dump(jobs, f, indent=2, ensure_ascii=False)

print(f"已清除 {fixed} 个任务的 stale thread_id")
```

清除后手动触发晨报和日报验证，两者都返回 `status: ok`，`delivery_error: None`。

### 3.4 Cron 脚本路径 Bug

#### 问题

`signal-collect.py` 的完整 Python 代码被写在了 Cron 任务的 `script` 字段里。Cron 调度器把第一行 `#!/usr/bin/env python3` 当作文件路径去执行，报 `Script not found`。

#### 修复

```bash
# 把内联脚本保存为独立文件
# 内容从 jobs.json 的 script 字段提取
vim /root/.hermes/scripts/signal-collect.py

# 更新 Cron 任务引用文件路径
# jobs.json 中 script 字段改为: /root/.hermes/scripts/signal-collect.py
```

**教训**：Cron 的 `script` 字段只接受文件路径，不接受内联代码。这个坑很小，但在调试时很容易忽略——因为错误信息「Script not found」会让人去检查文件是否存在，而不是去检查 `script` 字段里存的到底是什么。

## 4. 踩坑记录

### 坑 1：容器暂停后静默失败

**现象**：`docker exec` 报错 `Container is paused`，但没有明确提示是哪个容器。

**原因**：Docker 容器长时间闲置后可能进入 `paused` 状态（尤其是内存紧张时）。

**解决**：在所有批量操作前加预检：

```bash
docker ps -a --filter name=dimstack-app --format '{{.Status}}' | grep -q Paused && docker unpause dimstack-app
```

### 坑 2：端口冲突的隐蔽性

**现象**：xurl OAuth2 认证失败，端口 8080 被占用。

**原因**：DocMind 前端的 `serve` 进程占用了 8080，和 xurl 默认回调端口冲突。

**解决**：修改 OAuth2 回调端口：

```bash
xurl auth apps redirect-uri set it-is-great http://localhost:18081/callback
```

**教训**：端口冲突不会只发生一次。有了端口注册表和审计脚本，这类问题可以在冲突发生前被发现。

### 坑 3：飞书 thread_id 过期无法自动发现

**现象**：6 个 Cron 任务同时发不出消息，但任务本身执行正常。

**原因**：飞书消息线程被删除后，`thread_id` 变成无效值，但 Cron 配置不会自动清除。

**解决**：定期检查所有 Cron 任务的 delivery 状态，发现错误立即清除 `thread_id`。

**教训**：外部系统的引用（thread_id、channel_id 等）都有生命周期。自动化系统需要有「引用失效检测」机制。

### 坑 4：内联脚本 vs 文件路径

**现象**：Cron 任务报 `Script not found`，但脚本内容明显存在。

**原因**：`script` 字段存的是代码内容而不是文件路径。Cron 调度器把 shebang 行当路径解析。

**解决**：始终将脚本保存为独立文件，`script` 字段只存路径。

## 5. 总结与展望

### 核心收获

1. **巡检要自动化**：端口审计、飞轮健康检查、Cron delivery 状态——这些如果靠人肉检查，每天至少烧半小时，而且很容易漏掉。写成 Cron 任务后，问题在发生时就被发现。

2. **修复要有梯度**：自动修复不是万能的。设计了三级梯度：尝试自动修复 → 修复失败则告警 → 告警后记录日志供人工排查。这次 DocMind 的 API 代理问题没有自动修复成功，但守护者正确地走了完整流程。

3. **注册表是基础设施**：端口注册表、博客文章注册表、飞轮项目注册表——这些「台账」看起来不起眼，但没有它们，自动化脚本就没有基准线可以对比。

### 最佳实践

- **端口管理**：新服务部署时同步更新注册表，定期运行审计脚本
- **飞轮守护**：设置合理的告警阈值（12小时无提交 → 警告，24小时 → 告警）
- **Cron 自愈**：所有 delivery 配置都应有 fallback 机制（thread_id 无效 → 发到默认聊天）

### 延伸阅读

- 飞轮迭代方法论：如何让 AI Agent 自主驱动项目迭代
- Hermes Agent Cron 体系：定时任务的配置、调试与自愈
- Docker 容器健康检查：从 `healthcheck` 到自动化巡检
