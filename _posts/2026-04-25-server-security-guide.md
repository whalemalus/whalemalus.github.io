---
layout: post
title: "服务器安全与反向代理配置指南"
date: 2026-04-25
categories: 服务器安全
tags: ["安全", "Linux", "Nginx"]
excerpt: "从裸奔到武装到牙齿的服务器安全加固实战。包括 fail2ban 防暴力破解、UFW 防火墙配置、端口收敛和反向代理跨域问题修复。"
image: "https://whalemalus.com/file/cover-security-2024"
header:
  teaser: "https://whalemalus.com/file/cover-security-2024"
  overlay_image: "https://whalemalus.com/file/cover-security-2024"
original_url: "https://whalemalus.com/articles/server-security-guide"
---

# 服务器安全加固与反向代理配置实战指南

> **摘要**：本文记录了一次完整的服务器安全加固过程，包括 fail2ban 防暴力破解、UFW 防火墙配置、端口收敛，以及 NPM 反向代理的域名访问配置和 OpenClaw 跨域问题修复。从"裸奔"到"武装到牙齿"的实战记录。
>
> **关键词**：`服务器安全` `fail2ban` `UFW` `反向代理` `跨域配置`

---

## 楔子

上线第一天，服务器就被扫了。

打开 fail2ban 的日志一看——过去 12 小时内，有 347 次 SSH 登录失败尝试，来自 23 个不同的 IP。最疯狂的一个 IP，在 10 分钟内尝试了 89 次。

服务器刚搭好的时候，我只顾着把服务跑起来，安全的事想着"回头再说"。结果"回头"的速度，远没有攻击者快。

这件事让我意识到：安全不是"以后再说"的事，而是"现在就得做"的事。

于是就有了这次安全加固——从安装 fail2ban 到配置 UFW 防火墙，从收敛端口到配置反向代理，一步到位。这篇文章就是整个过程的完整记录。


## 全景地图：服务器安全体系

> 鸟瞰服务器安全防护的完整体系，理解各层级之间的关系

### 安全防护层级

```
┌─────────────────────────────────────────────────────────────┐
│                    服务器安全防护体系                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 第1层：网络安全                                      │   │
│  │ • 防火墙 (UFW)                                      │   │
│  │ • 端口管理                                          │   │
│  │ • IP 白名单                                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 第2层：访问控制                                      │   │
│  │ • SSH 密钥认证                                      │   │
│  │ • fail2ban 防暴力破解                               │   │
│  │ • 强密码策略                                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 第3层：应用安全                                      │   │
│  │ • HTTPS 加密                                        │   │
│  │ • 反向代理                                          │   │
│  │ • 容器隔离                                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 第4层：数据安全                                      │   │
│  │ • 定期备份                                          │   │
│  │ • 日志审计                                          │   │
│  │ • 敏感信息加密                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 本文的学习路径

```
安全概述 → 防火墙 → SSH 安全 → fail2ban → 反向代理 → 最佳实践
   │          │          │          │          │          │
   ▼          ▼          ▼          ▼          ▼          ▼
 威胁模型    UFW配置    密钥认证    防暴力破解   NPM配置    安全清单
```

## 引言

一台新服务器上线后，最紧迫的事情不是部署应用，而是**安全加固**。

默认配置的服务器就像一扇没上锁的门——SSH 端口对外开放、没有防火墙、没有入侵检测。任何一个脚本小子都可以用自动化工具在几分钟内攻破。

本文将带你完成以下安全加固步骤：
- **fail2ban**：自动封禁暴力破解 IP，保护 SSH
- **UFW 防火墙**：只开放必要端口，关闭所有不必要的暴露面
- **端口收敛**：将所有管理面板和应用服务通过反向代理访问，不直接暴露端口
- **跨域修复**：解决 OpenClaw 等应用通过反向代理访问时的 WebSocket 连接问题

每一步都有完整的配置文件和验证命令。目标是：**让服务器从"裸奔"变成"武装到牙齿"。**

---


## 目录

- [全景地图：服务器安全体系](#全景地图服务器安全体系)
- [一、服务器安全加固](#一服务器安全加固)
- [二、Cloudflare DNS 配置](#二cloudflare-dns-配置)
- [三、NPM 反向代理配置](#三npm-反向代理配置)
- [四、OpenClaw 跨域访问配置](#四openclaw-跨域访问配置)
- [五、最终访问方式](#五最终访问方式)
- [六、安全检查清单](#六安全检查清单)
- [七、常见问题](#七常见问题)
- [八、信息脱敏说明](#八信息脱敏说明)


## 一、服务器安全加固

### 1.1 安装并配置 fail2ban

fail2ban 用于自动封禁暴力破解IP，保护SSH安全。

```bash
# 安装 fail2ban
apt-get install -y fail2ban

# 创建配置文件
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
# 封禁时间：1小时
bantime = 3600
# 观察时间窗口：10分钟
findtime = 600
# 最大失败次数：5次
maxretry = 5
# 使用systemd日志
backend = systemd

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600

# 重复犯罪者永久封禁
[recidive]
enabled = true
filter = recidive
logpath = /var/log/fail2ban.log
maxretry = 3
bantime = 86400
findtime = 86400
EOF

# 启动并设置开机自启
systemctl enable fail2ban
systemctl restart fail2ban

# 查看状态
fail2ban-client status
fail2ban-client status sshd
```

**验证：**
```bash
# 查看已封禁的IP
fail2ban-client status sshd | grep "Banned IP"
```

---

### 1.2 配置 UFW 防火墙

```bash
# 允许SSH（必须先允许，否则会锁死自己）
ufw allow 22/tcp comment "SSH"

# 允许HTTP/HTTPS（NPM需要）
ufw allow 80/tcp comment "HTTP"
ufw allow 443/tcp comment "HTTPS"

# 设置默认策略：拒绝入站，允许出站
ufw default deny incoming
ufw default allow outgoing

# 启用防火墙
echo "y" | ufw enable

# 查看状态
ufw status verbose
```

**最终防火墙规则：**
```
To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere    # SSH
80/tcp                     ALLOW       Anywhere    # HTTP
443/tcp                    ALLOW       Anywhere    # HTTPS
```

**注意：** 管理面板端口（如1Panel的18581、NPM的30081）不再对外暴露，通过NPM反向代理+域名访问。

---

### 1.3 允许Docker网络访问内部端口

NPM容器需要访问宿主机上的服务（如1Panel），需要添加防火墙规则：

```bash
# 允许Docker网络访问1Panel端口
ufw allow from 172.18.0.0/16 to any port 18581
```

---

## 二、Cloudflare DNS 配置

### 2.1 添加子域名DNS记录

在 Cloudflare 控制台为每个服务添加A记录，开启代理（橙色云朵）：

| 域名 | 类型 | 目标 | 代理状态 |
|------|------|------|----------|
| whalemalus.com | A | 服务器IP | 🟠 已代理 |
| www.whalemalus.com | CNAME | whalemalus.com | 🟠 已代理 |
| panel.whalemalus.com | A | 服务器IP | 🟠 已代理 |
| openclaw.whalemalus.com | A | 服务器IP | 🟠 已代理 |

**通过API批量添加（推荐）：**

```bash
# 使用Cloudflare API添加DNS记录
# 注意：用完后请立即删除API Token

TOKEN=*** Token"
ZONE_ID="你的Zone ID"

# 添加 panel 子域名
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" 
  -H "Authorization: Bearer *** 
  -H "Content-Type: application/json" 
  --data '{"type":"A","name":"panel","content":"<你的服务器IP>","ttl":1,"proxied":true}'

# 添加 openclaw 子域名
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" 
  -H "Authorization: Bearer *** 
  -H "Content-Type: application/json" 
  --data '{"type":"A","name":"openclaw","content":"<你的服务器IP>","ttl":1,"proxied":true}'
```

### 2.2 配置SSL证书

1. 在 Cloudflare 控制台 → SSL/TLS → 源服务器 → 创建证书
2. 下载证书和私钥
3. 在 NPM 中上传证书

---

## 三、NPM 反向代理配置

### 3.1 登录NPM

```bash
# 获取NPM API Token
curl -s -X POST http://localhost:30081/api/tokens 
  -H "Content-Type: application/json" 
  -d '{"identity":"<管理员邮箱>","secret": "***"}'
```

### 3.2 创建代理主机

**博客（已有）：**
- 域名：`whalemalus.com`, `www.whalemalus.com`
- 转发：`http://172.18.0.1:2222`
- SSL：启用

**1Panel管理面板：**
```bash
curl -s -X POST http://localhost:30081/api/nginx/proxy-hosts 
  -H "Authorization: Bearer *** 
  -H "Content-Type: application/json" 
  -d '{
    "domain_names": ["panel.whalemalus.com"],
    "forward_scheme": "http",
    "forward_host": "172.18.0.1",
    "forward_port": 18581,
    "ssl_forced": true,
    "block_exploits": true
  }'
```

**OpenClaw：**
```bash
curl -s -X POST http://localhost:30081/api/nginx/proxy-hosts 
  -H "Authorization: Bearer *** 
  -H "Content-Type: application/json" 
  -d '{
    "domain_names": ["openclaw.whalemalus.com"],
    "forward_scheme": "http",
    "forward_host": "172.18.0.2",
    "forward_port": 18789,
    "ssl_forced": true,
    "block_exploits": true
  }'
```

### 3.3 添加SSL证书到代理主机

```bash
# 更新代理主机，添加证书ID
curl -s -X PUT http://localhost:30081/api/nginx/proxy-hosts/$PROXY_ID 
  -H "Authorization: Bearer *** 
  -H "Content-Type: application/json" 
  -d '{
    "certificate_id": 1,
    "ssl_forced": true,
    "http2_support": true
  }'
```

### 3.4 1Panel 安全入口配置

1Panel默认启用安全入口，需要通过特定路径访问。

**方案一：禁用安全入口（推荐）**
```bash
# 修改1Panel数据库
sqlite3 /opt/1panel/db/core.db "UPDATE settings SET value='' WHERE key='SecurityEntrance';"

# 重启1Panel
systemctl restart 1panel-core
```

**方案二：保留安全入口**
如果保留安全入口，需要在NPM中配置路径重写：
```json
{
  "advanced_config": "location / {
    proxy_pass http://172.18.0.1:18581/mypanel;
}"
}
```

### 3.5 验证代理配置

```bash
# 查看所有代理主机
curl -s http://localhost:30081/api/nginx/proxy-hosts 
  -H "Authorization: Bearer *** | python3 -c "
import sys,json
for p in json.load(sys.stdin):
    domains = ', '.join(p['domain_names'])
    print(f"{domains} → {p['forward_host']}:{p['forward_port']}")
"
```

---

## 四、OpenClaw 跨域访问配置

### 4.1 问题描述

通过域名访问 OpenClaw 时，WebSocket 连接报错：
```
origin not allowed (open the Control UI from the gateway host or allow it in gateway.controlUi.allowedOrigins)
```

### 4.2 原因分析

OpenClaw 的 `gateway.controlUi.allowedOrigins` 默认只允许本地访问：
```json
"allowedOrigins": [
    "http://127.0.0.1:18789",
    "http://<服务器IP>:18789"
]
```

需要添加域名 `https://openclaw.whalemalus.com`。

### 4.3 解决方案

**编辑配置文件：**
```bash
vi /opt/1panel/apps/<app-name>/<app-name>/data/conf/openclaw.json
```

**修改 `gateway.controlUi.allowedOrigins`：**
```json
{
  "gateway": {
    "controlUi": {
      "allowedOrigins": [
        "http://127.0.0.1:18789",
        "http://<服务器IP>:18789",
        "https://openclaw.whalemalus.com"
      ]
    }
  }
}
```

**重启容器：**
```bash
cd /opt/1panel/apps/<app-name>/<app-name>
docker compose restart openclaw
```

**验证配置：**
```bash
cat /opt/1panel/apps/<app-name>/<app-name>/data/conf/openclaw.json | python3 -c "
import sys, json
config = json.load(sys.stdin)
print('allowedOrigins:', config['gateway']['controlUi']['allowedOrigins'])
"
```

---

## 五、最终访问方式

### 5.1 服务访问地址

| 服务 | 访问地址 | 说明 |
|------|----------|------|
| 博客 | https://whalemalus.com | 公开访问 |
| 1Panel | https://panel.whalemalus.com | 管理面板 |
| OpenClaw | https://openclaw.whalemalus.com | AI助手 |

### 5.2 端口状态

| 端口 | 状态 | 说明 |
|------|------|------|
| 22 | ✅ 开放 | SSH |
| 80 | ✅ 开放 | HTTP |
| 443 | ✅ 开放 | HTTPS |
| 2222 | ❌ 关闭 | 博客（仅通过域名访问） |
| 18581 | ❌ 关闭 | 1Panel（仅通过域名访问） |
| 18789 | ❌ 关闭 | OpenClaw（仅通过域名访问） |
| 30081 | ❌ 关闭 | NPM管理（通过1Panel管理） |

---

## 六、安全检查清单

### 6.1 已完成的安全措施

- [x] 安装并配置 fail2ban
- [x] 启用 UFW 防火墙
- [x] 只开放必要端口（22、80、443）
- [x] 所有服务通过 HTTPS 访问
- [x] 真实IP通过 Cloudflare 隐藏
- [x] 管理面板通过域名访问，不暴露端口
- [x] OpenClaw 配置跨域访问白名单

### 6.2 待完成的安全措施

- [ ] 禁用SSH root登录
- [ ] 配置SSH密钥认证
- [ ] MySQL禁止远程root连接
- [ ] Redis设置密码
- [ ] 定期更新系统和软件

---

## 七、常见问题

### Q1: fail2ban 误封了合法IP怎么办？

```bash
# 查看已封禁IP
fail2ban-client status sshd

# 解封指定IP
fail2ban-client set sshd unbanip <IP地址>
```

### Q2: 如何查看防火墙规则？

```bash
ufw status verbose
```

### Q3: NPM代理的容器之间如何通信？

NPM和OpenClaw都在 `1panel-network` 网络中，可以直接通过容器名或IP通信：
- NPM: `172.18.0.3`
- OpenClaw: `172.18.0.2`
- 网关: `172.18.0.1`

### Q4: 如何更新OpenClaw配置？

```bash
# 编辑配置文件
vi /opt/1panel/apps/<app-name>/<app-name>/data/conf/openclaw.json

# 重启容器
cd /opt/1panel/apps/<app-name>/<app-name>
docker compose restart openclaw
```

### Q5: Cloudflare API Token 用完后如何删除？

访问 https://dash.cloudflare.com/profile/api-tokens ，找到对应Token点击删除。

---

## 八、信息脱敏说明

本文档已做以下脱敏处理：

| 原始内容 | 脱敏后 |
|----------|--------|
| 公网IP地址 | `<你的服务器IP>` |
| 管理员用户名 | `<管理员>` |
| 密码/Token | `<密码>` 或 `<API Token>` |
| 服务器路径 | 保留通用路径 |
| Docker容器名 | 保留通用名称 |

**发布前检查命令：**
```bash
# 检查是否包含真实IP
```

## 总结

### 核心收获

本次安全加固完成了从「裸奔」到「武装到牙齿」的转变：

- fail2ban 自动封禁暴力破解 IP，recidive 规则对重复犯罪者永久封禁
- UFW 防火墙只开放 22/80/443 三个端口，管理面板全部通过反向代理访问
- NPM 反向代理统一域名入口，HTTPS 加密由 Cloudflare 处理
- 跨域问题通过修改 OpenClaw 的 allowedOrigins 配置解决

### 最佳实践

- 安全加固要在部署应用之前完成，不要留到「以后」
- 所有管理面板通过域名加 HTTPS 访问，不暴露原始端口
- API Token 用完立即删除，避免泄露风险
- 定期检查 fail2ban 日志，了解服务器面临的威胁态势