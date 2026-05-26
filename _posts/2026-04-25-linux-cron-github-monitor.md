---
layout: post
title: "Linux 定时任务实战：用 Cron 监控 GitHub Issue 回复"
date: 2026-04-25
categories: DevOps
tags: ["cron", "自动化", "Linux", "安全"]
excerpt: "从零开始讲解 Linux cron 定时任务，从基础语法到实战案例——用 cron 自动监控 GitHub Issue 的开发者回复，并将结果推送到即时通讯工具。"
image: "https://whalemalus.com/file/cover-cron-2026"
header:
  teaser: "https://whalemalus.com/file/cover-cron-2026"
  overlay_image: "https://whalemalus.com/file/cover-cron-2026"
original_url: "https://whalemalus.com/articles/linux-cron-github-monitor"
---

# Linux 定时任务实战：用 Cron 监控 GitHub Issue 回复

> **摘要**：本文从零开始讲解 Linux 下的 cron 定时任务，从基础语法到实战案例——用 cron 自动监控 GitHub Issue 的开发者回复，并将结果推送到即时通讯工具。适合需要自动化运维任务的开发者。
>
> **关键词**：`Linux` `cron` `定时任务` `GitHub` `自动化运维`

---

## 楔子

上周在 GitHub 上给一个开源项目提了个 Issue，描述了一个缓存一致性的 Bug。提交之后就开始等开发者回复。

第一天，没回复。第二天，没回复。第三天，我差点忘了这回事。

直到一周后偶然点开 Issue 页面——开发者三天前就回复了，说"感谢反馈，下个版本修复"。还问了一个跟进问题，希望我补充一些信息。

但因为我没及时看到，这个 Issue 就这么沉了下去。

后来我想：有没有办法让服务器自动帮我盯着？有新回复就通知我？

答案是——当然有。Linux 自带的 `cron` 就能搞定。


## 全景地图：Linux 定时任务生态

> 鸟瞰 Linux 定时任务的完整生态，理解 cron 在其中的位置

### 定时任务技术栈

```
┌─────────────────────────────────────────────────────────────┐
│                   Linux 定时任务生态                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   cron      │    │  systemd    │    │   anacron   │     │
│  │  (传统)     │    │  timer      │    │  (延迟)     │     │
│  ├─────────────┤    ├─────────────┤    ├─────────────┤     │
│  │ 精确到分钟  │    │ 精确到秒    │    │ 适合笔记本  │     │
│  │ 用户级任务  │    │ 系统级任务  │    │ 错过会补执行│     │
│  │ 最常用      │    │ 现代替代    │    │ 非实时      │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                             │
│  适用场景：                                                 │
│  • 定时备份数据库                                           │
│  • 自动清理日志                                             │
│  • 监控服务状态                                             │
│  • 定时同步数据                                             │
│  • 自动化运维任务                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### cron 的工作流程

```
用户编辑 crontab
      │
      ▼
crontab 文件保存到 /var/spool/cron/
      │
      ▼
cron daemon 每分钟检查一次
      │
      ├── 匹配当前时间？──→ 是 ──→ 执行命令
      │
      └── 否 ──→ 继续等待
```

### 本文的学习路径

```
基础概念 → 语法详解 → 创建任务 → 实战案例 → 调试技巧 → 最佳实践
   │          │          │          │          │          │
   ▼          ▼          ▼          ▼          ▼          ▼
 cron是    5个时间    crontab   监控GitHub  查看日志   避坑指南
  什么      字段       命令      Issue回复   调试方法
```

## 引言

`cron` 是 Linux 系统中最古老也最可靠的定时任务工具。从定时备份数据库、自动清理日志，到监控服务状态、自动部署——几乎所有需要"定期执行"的任务，cron 都能胜任。

本文将从基础开始，带你掌握 cron 的核心用法，并通过一个完整的实战案例——**自动监控 GitHub Issue 回复**——展示如何将 cron 与现代开发工具结合，打造自动化运维工作流。

你将学到：
- cron 表达式的语法和含义
- 如何创建、管理和调试定时任务
- 如何用 `gh` CLI 与 GitHub API 交互
- 如何构建一个完整的监控 + 通知脚本
- 定时任务的常见坑和最佳实践

## 📖 目录

1. [Cron 基础：什么是定时任务](#1-cron-基础什么是定时任务)
2. [Cron 表达式语法详解](#2-cron-表达式语法详解)
3. [创建和管理定时任务](#3-创建和管理定时任务)
4. [实战：监控 GitHub Issue 回复](#4-实战监控-github-issue-回复)
5. [进阶：定时任务的调试与日志](#5-进阶定时任务的调试与日志)
6. [踩坑记录](#6-踩坑记录)
7. [最佳实践](#7-最佳实践)
8. [总结](#8-总结)

---

## 1. Cron 基础：什么是定时任务

### 1.1 Cron 的工作原理

cron 是一个守护进程（daemon），它在后台运行，每分钟检查一次是否有需要执行的任务。

```
┌─────────────────────────────────────────────┐
│                cron daemon                   │
│                                             │
│  每分钟检查一次 ──→ 是否有匹配当前时间的任务？ │
│                      │                      │
│                 Yes  │  No                  │
│                 ↓    │  ↓                   │
│            执行任务   │  继续等待             │
└─────────────────────────────────────────────┘
```

### 1.2 Cron 的两个核心概念

| 概念 | 说明 | 文件位置 |
|------|------|----------|
| **crontab** | 定时任务配置文件，每个用户一份 | `/var/spool/cron/crontabs/` |
| **cron 表达式** | 定义"什么时候执行"的时间规则 | 写在 crontab 里 |

### 1.3 查看当前用户的定时任务

```bash
# 列出当前用户的所有定时任务
crontab -l

# 列出指定用户的定时任务（需要 root）
crontab -l -u username
```

## 2. Cron 表达式语法详解

### 2.1 基本格式

cron 表达式由 **5 个时间字段** + **1 个命令** 组成：

```
┌───────────── 分钟 (0-59)
│ ┌─────────── 小时 (0-23)
│ │ ┌───────── 日期 (1-31)
│ │ │ ┌─────── 月份 (1-12)
│ │ │ │ ┌───── 星期 (0-7, 0和7都是周日)
│ │ │ │ │
* * * * * command_to_execute
```

### 2.2 特殊符号

| 符号 | 含义 | 示例 |
|------|------|------|
| `*` | 任意值 | `* * * * *` = 每分钟 |
| `,` | 列举多个值 | `1,15 * * * *` = 每小时的第1和第15分钟 |
| `-` | 范围 | `9-17 * * * *` = 每天 9:00 到 17:00 |
| `/` | 步长 | `*/5 * * * *` = 每5分钟 |
| `0` | 特定值 | `0 9 * * *` = 每天早上9点整 |

### 2.3 常用表达式速查

```bash
# 每分钟执行
* * * * * /path/to/script.sh

# 每5分钟执行
*/5 * * * * /path/to/script.sh

# 每小时执行
0 * * * * /path/to/script.sh

# 每天凌晨2点执行
0 2 * * * /path/to/script.sh

# 每天早上9点和下午6点执行
0 9,18 * * * /path/to/script.sh

# 每周一早上9点执行
0 9 * * 1 /path/to/script.sh

# 每月1号凌晨3点执行
0 3 1 * * /path/to/script.sh

# 工作日（周一到周五）早上9点执行
0 9 * * 1-5 /path/to/script.sh

# 每12小时执行一次
0 */12 * * * /path/to/script.sh
```

### 2.4 图解示例

```
0 9 * * 1-5 /home/user/backup.sh
│ │  │ │ │
│ │  │ │ └── 周一到周五
│ │  │ └──── 每月
│ │  └────── 每天
│ └───────── 早上9点
└─────────── 整点（第0分钟）

= 工作日每天早上9点整执行备份
```

## 3. 创建和管理定时任务

### 3.1 编辑定时任务

```bash
# 交互式编辑（推荐）
crontab -e

# 直接设置（会覆盖已有任务！慎用！）
echo "0 9 * * * /path/to/script.sh" | crontab -
```

### 3.2 从文件导入

```bash
# 创建任务文件
cat > my-cron-tasks.txt << 'EOF'
# 每天凌晨2点备份数据库
0 2 * * * /home/user/backup-db.sh

# 每6小时检查服务状态
0 */6 * * * /home/user/check-service.sh

# 每周一清理日志
0 3 * * 1 find /var/log -name "*.log" -mtime +30 -delete
EOF

# 导入
crontab my-cron-tasks.txt
```

### 3.3 删除所有定时任务

```bash
# 删除当前用户的所有定时任务（谨慎！）
crontab -r
```

### 3.4 环境变量

cron 的环境变量和你登录时不同！常见的坑：

```bash
# ❌ 错误：cron 找不到 node
0 9 * * * node /home/user/script.js

# ✅ 正确：使用绝对路径
0 9 * * * /usr/bin/node /home/user/script.js

# ✅ 或者在 crontab 开头设置 PATH
PATH=/usr/local/bin:/usr/bin:/bin
0 9 * * * node /home/user/script.js
```

## 4. 实战：监控 GitHub Issue 回复

### 4.1 场景描述

我们给开源项目 [lingview/dim_stack](https://github.com/lingview/dim_stack) 提了一个 Issue（[#12](https://github.com/lingview/dim_stack/issues/12)），需要监控开发者是否回复。

### 4.2 前置准备

#### 安装 gh CLI

```bash
# Ubuntu/Debian
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \\
  dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | \\
  tee /etc/apt/sources.list.d/github-cli.list > /dev/null
apt-get update && apt-get install -y gh
```

#### GitHub 认证

```bash
# 方式1：用 Classic Token 认证（推荐，需要 public_repo 权限）
echo "ghp_your_token_here" | gh auth login --with-token

# 方式2：交互式认证
gh auth login

# 验证
gh auth status
```

#### 创建 Classic Token

1. 打开 https://github.com/settings/tokens
2. 点击 **Generate new token (classic)**
3. 勾选 `public_repo` 权限
4. 生成并复制 token

### 4.3 编写监控脚本

创建文件 `/home/user/scripts/github-issue-monitor.sh`：

```bash
#!/bin/bash
# GitHub Issue 回复监控脚本
# 功能：检查指定 Issue 是否有新回复，有则输出通知内容

# ============ 配置区 ============
OWNER="lingview"          # 仓库所有者
REPO="dim_stack"          # 仓库名
ISSUE_NUMBER=12           # Issue 编号
STATE_FILE="/tmp/github-issue-${OWNER}-${REPO}-${ISSUE_NUMBER}.state"
# ================================

# 获取 Issue 信息和评论
COMMENTS=$(gh issue view $ISSUE_NUMBER \\
  --repo "$OWNER/$REPO" \\
  --comments 2>&1)

ISSUE_STATE=$(gh issue view $ISSUE_NUMBER \\
  --repo "$OWNER/$REPO" \\
  --json state -q '.state' 2>&1)

# 检查是否成功获取
if [ $? -ne 0 ]; then
  echo "❌ 获取 Issue 失败: $COMMENTS"
  exit 1
fi

# 计算当前评论数（简单方式：统计评论中的时间戳）
CURRENT_COUNT=$(echo "$COMMENTS" | grep -c "^•")

# 读取上次记录的评论数
LAST_COUNT=0
if [ -f "$STATE_FILE" ]; then
  LAST_COUNT=$(cat "$STATE_FILE")
fi

# 比较
if [ "$CURRENT_COUNT" -gt "$LAST_COUNT" ]; then
  NEW_COUNT=$((CURRENT_COUNT - LAST_COUNT))
  echo "🔔 GitHub Issue #${ISSUE_NUMBER} 有 ${NEW_COUNT} 条新回复！"
  echo ""
  echo "Issue: https://github.com/${OWNER}/${REPO}/issues/${ISSUE_NUMBER}"
  echo "状态: $ISSUE_STATE"
  echo ""
  echo "最新评论:"
  echo "$COMMENTS" | tail -20
  echo ""
  
  # 更新状态文件
  echo "$CURRENT_COUNT" > "$STATE_FILE"
elif [ "$ISSUE_STATE" = "CLOSED" ]; then
  echo "✅ GitHub Issue #${ISSUE_NUMBER} 已关闭"
  echo "https://github.com/${OWNER}/${REPO}/issues/${ISSUE_NUMBER}"
  
  # 更新状态
  echo "CLOSED" > "$STATE_FILE.closed"
else
  echo "⏳ GitHub Issue #${ISSUE_NUMBER} 暂无新回复 (评论数: $CURRENT_COUNT)"
fi
```

设置执行权限：

```bash
chmod +x /home/user/scripts/github-issue-monitor.sh
```

### 4.4 设置定时任务

```bash
# 编辑 crontab
crontab -e

# 添加以下内容：
# 每6小时检查一次 GitHub Issue 回复
0 */6 * * * /home/user/scripts/github-issue-monitor.sh >> /var/log/github-monitor.log 2>&1

# 或者更频繁：每2小时检查一次
0 */2 * * * /home/user/scripts/github-issue-monitor.sh >> /var/log/github-monitor.log 2>&1
```

### 4.5 增强版：带通知推送的脚本

如果希望有新回复时自动发消息通知，可以结合各种通知渠道：

```bash
#!/bin/bash
# GitHub Issue 监控 + 通知推送

OWNER="lingview"
REPO="dim_stack"
ISSUE_NUMBER=12
STATE_FILE="/tmp/github-issue-${OWNER}-${REPO}-${ISSUE_NUMBER}.state"

# 获取评论
COMMENTS=$(gh issue view $ISSUE_NUMBER --repo "$OWNER/$REPO" --comments 2>&1)
CURRENT_COUNT=$(echo "$COMMENTS" | grep -c "^•")
LAST_COUNT=0
[ -f "$STATE_FILE" ] && LAST_COUNT=$(cat "$STATE_FILE")

if [ "$CURRENT_COUNT" -gt "$LAST_COUNT" ]; then
  NEW_COUNT=$((CURRENT_COUNT - LAST_COUNT))
  MSG="🔔 GitHub Issue #${ISSUE_NUMBER} 有 ${NEW_COUNT} 条新回复！\
https://github.com/${OWNER}/${REPO}/issues/${ISSUE_NUMBER}"
  
  # ===== 通知方式（选择一种或多种） =====
  
  # 方式1：发送到企业微信机器人
  # curl -X POST "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=*** \\
  #   -H 'Content-Type: application/json' \\
  #   -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"$MSG\"}}"
  
  # 方式2：发送到钉钉机器人
  # curl -X POST "https://oapi.dingtalk.com/robot/send?access_token=*** \\
  #   -H 'Content-Type: application/json' \\
  #   -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"$MSG\"}}"
  
  # 方式3：发送邮件
  # echo -e "$MSG" | mail -s "GitHub Issue 回复通知" your@email.com
  
  # 方式4：发送 Telegram 消息
  # curl -s "https://api.telegram.org/botYOUR_TOKEN/sendMessage" \\
  #   -d "chat_id=YOUR_CHAT_ID&text=$MSG"
  
  # 方式5：写入日志（最低限度）
  echo -e "$(date '+%Y-%m-%d %H:%M:%S') $MSG" >> /var/log/github-monitor.log
  
  echo "$CURRENT_COUNT" > "$STATE_FILE"
fi
```

### 4.6 完整工作流图

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│   cron 定时   │────→│  监控脚本执行     │────→│  gh CLI 查询  │
│  每6小时触发   │     │  比较评论数变化   │     │  GitHub API  │
└──────────────┘     └──────────────────┘     └──────────────┘
                            │
                     有新回复? │
                      ┌──────┴──────┐
                      │             │
                     Yes           No
                      │             │
                      ↓             ↓
              ┌──────────┐   ┌──────────┐
              │ 发送通知   │   │ 记录日志   │
              │ 邮件/IM   │   │ 继续等待   │
              └──────────┘   └──────────┘
```

## 5. 进阶：定时任务的调试与日志

### 5.1 查看 cron 日志

```bash
# Ubuntu/Debian
tail -f /var/log/syslog | grep CRON

# CentOS/RHEL
tail -f /var/log/cron

# 查看所有 cron 相关日志
grep CRON /var/log/syslog | tail -20
```

### 5.2 调试技巧

```bash
# 1. 先手动运行脚本，确认能正常工作
/home/user/scripts/github-issue-monitor.sh

# 2. 在 crontab 中添加调试信息
* * * * * echo "$(date) running" >> /tmp/cron-debug.log; /home/user/scripts/github-issue-monitor.sh >> /tmp/cron-debug.log 2>&1

# 3. 使用 run-parts 测试
# /etc/cron.d/ 下的脚本可以用 run-parts 测试
run-parts --test /etc/cron.d/
```

### 5.3 常用调试命令

```bash
# 查看当前 crontab
crontab -l

# 查看 cron 服务状态
systemctl status cron

# 重启 cron 服务
systemctl restart cron

# 查看 cron 进程
ps aux | grep cron
```

## 6. 踩坑记录

### 坑1：环境变量缺失

**现象**：脚本手动运行正常，但 cron 执行时找不到命令

**原因**：cron 的 PATH 环境变量很精简，不包含 `/usr/local/bin` 等路径

**解决**：
```bash
# 在 crontab 开头设置 PATH
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

# 或者在脚本中设置
export PATH="/usr/local/bin:$PATH"
```

### 坑2：相对路径失效

**现象**：脚本中使用了 `./config.yaml`，cron 执行时找不到文件

**原因**：cron 的工作目录不是脚本所在目录

**解决**：
```bash
# 使用绝对路径
CONFIG="/home/user/scripts/config.yaml"

# 或者在脚本开头切换目录
cd "$(dirname "$0")"
```

### 坑3：输出没有重定向

**现象**：cron 执行了但看不到结果，也没有日志

**原因**：cron 的 stdout/stderr 默认发邮件，但系统没配邮件

**解决**：
```bash
# 重定向输出到日志文件
0 */6 * * * /path/to/script.sh >> /var/log/myscript.log 2>&1
```

### 坑4：权限不足

**现象**：脚本手动运行正常，cron 执行时报 Permission denied

**原因**：cron 以不同用户身份执行，权限可能不同

**解决**：
```bash
# 确保脚本有执行权限
chmod +x /path/to/script.sh

# 如果需要 root 权限，使用 root 的 crontab
sudo crontab -e
```

### 坑5：时区问题

**现象**：cron 没有在预期时间执行

**原因**：系统时区和预期不一致

**解决**：
```bash
# 检查系统时区
timedatectl

# 设置时区
sudo timedatectl set-timezone Asia/Shanghai
```

## 7. 最佳实践

### 7.1 命名规范

```bash
# 好的命名：描述性 + 日期
/home/user/scripts/github-issue-monitor.sh
/home/user/scripts/db-backup-daily.sh
/home/user/scripts/log-cleanup-weekly.sh

# 不好的命名
/home/user/scripts/a.sh
/home/user/scripts/test.sh
/home/user/scripts/script1.sh
```

### 7.2 日志规范

```bash
# 在脚本中添加日志
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "开始执行..."
log "任务完成"
```

### 7.3 错误处理

```bash
#!/bin/bash
set -e  # 遇到错误立即退出

# 或者更精细的错误处理
if ! gh issue view 12 --repo owner/repo > /dev/null 2>&1; then
  echo "❌ GitHub API 调用失败"
  exit 1
fi
```

### 7.4 锁机制（防止重复执行）

```bash
#!/bin/bash
LOCKFILE="/tmp/my-script.lock"

# 检查是否已有实例在运行
if [ -f "$LOCKFILE" ]; then
  echo "已有实例在运行，退出"
  exit 0
fi

# 创建锁文件
trap "rm -f $LOCKFILE" EXIT
touch "$LOCKFILE"

# ... 执行任务 ...
```

## 8. 总结

### 核心要点

| 要点 | 说明 |
|------|------|
| cron 表达式 | 5个字段：分 时 日 月 周 |
| 环境变量 | cron 的 PATH 很精简，用绝对路径 |
| 输出重定向 | 一定要重定向到日志文件 |
| 权限 | 确保脚本有执行权限 |
| 调试 | 先手动运行，再配置 cron |

### 常用命令速查

```bash
crontab -e          # 编辑定时任务
crontab -l          # 查看定时任务
crontab -r          # 删除所有定时任务
systemctl status cron  # 查看 cron 服务状态
tail -f /var/log/syslog | grep CRON  # 查看 cron 日志
```

### 延伸阅读

- [crontab.guru](https://crontab.guru/) — 在线 cron 表达式生成器
- [GitHub CLI 文档](https://cli.github.com/manual/) — gh 命令完整参考
- [systemd timer](https://www.freedesktop.org/software/systemd/man/systemd.timer.html) — cron 的现代替代方案

---

> 💡 如果觉得文章对你有帮助，欢迎点赞、收藏、评论交流！有问题也可以在评论区留言。
