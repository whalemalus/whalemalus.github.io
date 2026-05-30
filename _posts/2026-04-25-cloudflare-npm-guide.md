---
layout: post
title: "域名配置实战：Cloudflare + NPM 反向代理完全指南"
date: 2026-04-25
categories: DevOps
tags: ["Cloudflare", "Nginx", "反向代理", "域名配置", "SSL/TLS"]
excerpt: "从购买域名、配置 Cloudflare DNS、部署 NPM 反向代理到实现 HTTPS 访问的全流程。涵盖 6 个关键步骤和多个实战踩坑点，看完就能配好。"
image: "https://whalemalus.com/file/cover-cloudflare-2024"
header:
  teaser: "https://whalemalus.com/file/cover-cloudflare-2024"
  overlay_image: "https://whalemalus.com/file/cover-cloudflare-2024"
original_url: "https://whalemalus.com/articles/cloudflare-npm-guide"
---

# Cloudflare + Nginx Proxy Manager：域名配置与反向代理完全指南

> **摘要**：本文记录了从购买域名、配置 Cloudflare DNS、部署 Nginx Proxy Manager（NPM）反向代理到实现 HTTPS 访问的全流程。涵盖 6 个关键步骤和多个实战踩坑点，适合需要为服务器配置域名访问的开发者参考。
>
> **关键词**：`Cloudflare` `Nginx Proxy Manager` `反向代理` `HTTPS` `域名配置`

---

## 楔子

买了台 VPS，兴冲冲地在上面部署了博客和各种服务。用 IP 地址访问，一切正常。

然后问题来了——你总不能在名片上印 `http://<你的服务器IP>:2222` 吧？

好吧，买个域名。域名买了，Cloudflare 的 DNS 也配了，Nginx 反向代理也装了，SSL 证书也上了……然后浏览器给了一个大大的 **502 Bad Gateway**。

接下来的三天，我在 NPM 的配置文件里反复横跳，在 Cloudflare 的 SSL 模式之间来回切换，对着浏览器的开发者工具发呆。直到某天凌晨，突然发现——原来是 NPM 容器的端口映射多了一个字母。

一个字母，三天青春。

如果你也正在经历类似的折磨，这篇攻略也许能帮你少走一些弯路。

## 全景地图

> 鸟瞰域名解析和反向代理的流程，理解各组件之间的关系

### 域名访问流程

```
用户输入域名
      │
      ▼
┌─────────────┐
│ DNS 解析    │  域名 → IP 地址
│ (Cloudflare)│
└─────────────┘
      │
      ▼
┌─────────────┐
│ CDN 缓存    │  静态资源直接返回
│ (Cloudflare)│
└─────────────┘
      │
      ▼
┌─────────────┐
│ 反向代理    │  转发请求到后端服务
│ (NPM)       │
└─────────────┘
      │
      ▼
┌─────────────┐
│ 后端服务    │  处理业务逻辑
│ (应用容器)  │
└─────────────┘
```

### 本文的学习路径

```
域名解析 → Cloudflare → NPM 配置 → SSL 证书 → 踩坑记录
   │          │          │          │          │
   ▼          ▼          ▼          ▼          ▼
 DNS原理    CDN加速    反向代理    HTTPS配置   常见问题
```

## 引言

为服务器配置域名访问，听起来简单——买域名、配 DNS、装个反向代理、上个 SSL，完事。但实际操作中，每一步都可能踩坑：

- Cloudflare 的 SSL 模式选 Full 还是 Full (Strict)？
- NPM 的代理配置怎么写？
- Origin Certificate 怎么上传？
- 为什么配完了还是 502？

本文会带你走完这 6 个步骤，每一步都有完整的命令和配置，以及踩坑记录。目标是：**看完就能配好，配好就能用。**

## 目录

- [楔子](#楔子)
- [全景地图](#全景地图)
- [引言](#引言)
- [问题背景](#问题背景)
- [技术架构总览](#技术架构总览)
- [问题清单](#问题清单)
- [实战指南](#实战指南)
- [验证](#验证)
- [踩坑记录](#踩坑记录)
- [附录：常用命令速查](#附录常用命令速查)
- [总结](#总结)

## 问题背景

### 我们的目标

在一台 **RackNerd VPS**（IP: `<你的服务器公网IP>`）上部署了多个服务（博客、OpenClaw 等），希望通过域名 **whalemalus.com** 直接访问这些服务，并配置 HTTPS 加密。

### 当前环境

| 组件 | 说明 |
|------|------|
| **服务器** | RackNerd VPS，IP: `<你的服务器公网IP>` |
| **域名** | `whalemalus.com`，在 Spaceship 购买 |
| **DNS 托管** | Cloudflare（免费版） |
| **服务器面板** | 1Panel |
| **反向代理** | Nginx Proxy Manager（1Panel 安装，Docker 部署） |
| **博客服务** | 运行在端口 2222 |

### 域名解析流程

```
用户浏览器 → 域名 whalemalus.com → Cloudflare DNS → 服务器 IP: <你的服务器公网IP>
```

听起来很简单对吧？但其实，我们遇到了一系列"坑"。下面我们逐一解决。

---

## 技术架构总览

在开始之前，先看看最终目标架构：

```
                    ┌─────────────────────────────────────────────────┐
                    │                   用户浏览器                     │
                    │         访问 https://whalemalus.com              │
                    └────────────────────┬────────────────────────────┘
                                         │
                                         ▼ HTTPS
                    ┌─────────────────────────────────────────────────┐
                    │              ☁️ Cloudflare CDN                    │
                    │   · Universal SSL (Let's Encrypt)                │
                    │   · 代理模式开启（橙色云朵）                       │
                    │   · SSL/TLS 模式：Full                            │
                    └────────────────────┬────────────────────────────┘
                                         │
                                         ▼ HTTPS (Origin Certificate)
                    ┌─────────────────────────────────────────────────┐
                    │         🖥️ RackNerd VPS (<你的服务器公网IP>)          │
                    │                                                   │
                    │  ┌─────────────────────────────────────────────┐ │
                    │  │       🐳 Docker: Nginx Proxy Manager        │ │
                    │  │              (OpenResty)                    │ │
                    │  │                                             │ │
                    │  │  监听 :443 → 解析域名 → 反向代理到后端服务   │ │
                    │  │                                             │ │
                    │  │  whalemalus.com → 172.18.0.1:2222 (博客)   │ │
                    │  └──────────────────┬──────────────────────────┘ │
                    │                     │                            │
                    │                     ▼                            │
                    │  ┌─────────────────────────────────────────────┐ │
                    │  │     📝 博客服务 (端口 2222)                  │ │
                    │  │     🦞 OpenClaw 等其他服务                   │ │
                    │  └─────────────────────────────────────────────┘ │
                    └─────────────────────────────────────────────────┘
```

**关键要点**：

- **Cloudflare** 负责 DNS 解析和外层 SSL
- **Nginx Proxy Manager (NPM)** 负责将域名请求转发到正确的后端服务
- **Origin Certificate** 用于 Cloudflare 到服务器之间的加密

---

## 问题清单

在配置过程中，我们踩了不少坑。这里先列出所有问题，后面逐一解决：

### 问题 1：端口映射错误

1Panel 安装的 Nginx Proxy Manager 默认将容器端口映射到 `30080`（HTTP）和 `30443`（HTTPS），而非标准的 `80` 和 `443`。

这意味着即使 Cloudflare 把流量送到了服务器的 443 端口，也没有服务在监听！

```
# 期望的映射
服务器:80  → NPM 容器:80
服务器:443 → NPM 容器:443

# 实际的映射（1Panel 默认）
服务器:30080 → NPM 容器:80
服务器:30443 → NPM 容器:443
```

### 问题 2：Cloudflare DNS 中有错误的 A 记录

Cloudflare 的 DNS 配置中存在多个 A 记录，其中包含了不属于我们的 IP：

```
whalemalus.com → <你的服务器公网IP>   ✅ 正确（我们的 VPS）
whalemalus.com → <示例IP-A>   ❌ 错误（不知道哪里来的）
whalemalus.com → <示例IP-B>   ❌ 错误（不知道哪里来的）
```

Cloudflare 会对这些 A 记录进行 **轮询 (Round Robin)**，导致大约 1/3 的请求被发送到错误的服务器。

### 问题 3：SSL 证书配置

Cloudflare 提供了 **Universal SSL**（Let's Encrypt 颁发），但 Cloudflare 到源站服务器之间也需要加密。需要生成 **Cloudflare Origin Certificate** 并配置到 NPM。

### 问题 4：NPM API 更新后配置未自动生成

通过 NPM 的 API 创建代理主机和上传证书后，Nginx 的实际配置文件并没有自动生成！需要手动创建。

---

## 实战指南

### 步骤 1：修改 NPM 端口映射

### 1.1 停用主机上的 Nginx（如果有的话）

首先检查服务器上是否有独立安装的 Nginx 在占用 80/443 端口：

```bash
# 检查是否有 Nginx 在运行
systemctl status nginx

# 如果在运行，停止并禁用
sudo systemctl stop nginx
sudo systemctl disable nginx
```

### 1.2 查找 NPM 的 docker-compose 文件

NPM 通常由 1Panel 安装，配置文件在 1Panel 的应用目录中：

```bash
# 查找 docker-compose 文件
find / -name "docker-compose.yml" -path "*/nginx*" 2>/dev/null

# 1Panel 的典型路径
ls /opt/nginx-proxy-manager/
```

### 1.3 修改 .env 文件

找到 `.env` 文件，修改端口配置：

```bash
# 进入 NPM 目录
cd /opt/nginx-proxy-manager/

# 编辑 .env
vi .env
```

修改以下内容：

```env
# 修改前（1Panel 默认）
PANEL_APP_PORT_HTTP1=30080
PANEL_APP_PORT_HTTP2=30443

# 修改后（标准端口）
PANEL_APP_PORT_HTTP1=80
PANEL_APP_PORT_HTTP2=443
```

### 1.4 重建容器

```bash
docker compose down
docker compose up -d --force-recreate
```

验证端口是否正确映射：

```bash
docker ps | grep nginx-proxy-manager
# 应该看到类似：0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
```

> ⚠️ **注意**：1Panel 在更新或重启应用时可能会覆盖 `.env` 的修改。如果发现端口又变回去了，需要再次修改。也可以通过 1Panel 的界面直接修改端口映射。

---

### 步骤 2：重置 NPM 管理员密码

如果忘记了 NPM 的管理密码，或者需要通过 API 操作但无法登录，可以通过修改数据库来重置密码。

### 2.1 安装 sqlite3

```bash
# Debian/Ubuntu
sudo apt update && sudo apt install -y sqlite3

# CentOS/RHEL
sudo yum install -y sqlite
```

### 2.2 找到 NPM 数据库文件

```bash
# 查找数据库文件
find / -name "*.sqlite" 2>/dev/null
# 或者
find / -name "database.sqlite" 2>/dev/null
```

典型路径：`/opt/nginx-proxy-manager/data/database.sqlite`

### 2.3 查看当前用户

```bash
sqlite3 /path/to/database.sqlite "SELECT id, email FROM user;"
```

输出类似：

```
1|admin@example.com
```

### 2.4 生成 bcrypt 密码哈希

```bash
# 方法一：使用 Python
python3 -c "import bcrypt; print(bcrypt.hashpw(b'your-new-password', bcrypt.gensalt()).decode())"

# 方法二：使用 Node.js（如果有的话）
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('your-new-password', 10));"

# 方法三：在线工具生成 bcrypt hash（注意安全，生成后立即使用）
```

### 2.5 更新数据库中的密码

```bash
sqlite3 /path/to/database.sqlite "UPDATE auth SET secret='$2b$10$YOUR_HASH_HERE' WHERE user_id=1;"
```

> 💡 **注意**：在 shell 中使用 bcrypt hash 时，注意 `$` 符号需要转义！

### 2.6 重启 NPM 容器

```bash
docker restart nginx-proxy-manager
# 或者
docker compose restart
```

现在可以使用新密码登录 NPM 管理界面（`http://YOUR_IP:81`）。

---

### 步骤 3：通过 NPM API 创建代理主机

### 3.1 获取 API Token

```bash
curl -X POST http://localhost:81/api/tokens 
  -H "Content-Type: application/json" 
  -d '{
    "identity": "admin@example.com",
    "secret": "***"
  }'
```

响应：

```json
{
  "token": "***",
  "expires": "2026-05-25T00:00:00.000Z",
  "user_id": 1
}
```

保存这个 token：

```bash
export NPM_TOKEN="***"
```

### 3.2 创建代理主机

```bash
curl -X POST http://localhost:81/api/nginx/proxy-hosts 
  -H "Authorization: Bearer *** 
  -H "Content-Type: application/json" 
  -d '{
    "domain_names": ["whalemalus.com", "www.whalemalus.com"],
    "forward_host": "172.18.0.1",
    "forward_port": 2222,
    "forward_scheme": "http",
    "ssl_forced": true,
    "block_exploits": true,
    "allow_websocket_upgrade": true,
    "http2_support": true,
    "caching_enabled": false
  }'
```

> 🔑 **关键点**：`forward_host` 使用 `172.18.0.1` 而非 `host.docker.internal`！
>
> `172.18.0.1` 是 Docker 默认桥接网络的网关 IP，相当于宿主机在 Docker 网络中的地址。而 `host.docker.internal` 在 Linux 上不一定可用（macOS/Windows 通常支持）。

### 3.3 验证代理主机创建成功

```bash
curl -s http://localhost:81/api/nginx/proxy-hosts 
  -H "Authorization: Bearer *** | python3 -m json.tool
```

你应该能看到刚创建的代理主机配置，`id` 应该是 `1`（或下一个递增的数字）。

---

### 步骤 4：上传 Cloudflare Origin Certificate

### 4.1 在 Cloudflare 生成 Origin Certificate

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 选择你的域名 `whalemalus.com`
3. 进入 **SSL/TLS** → **Origin Server**
4. 点击 **Create Certificate**
5. 保持默认设置：
 - 私钥类型：RSA (2048)
 - 主机名：`whalemalus.com`, `*.whalemalus.com`
 - 有效期：15 年
6. 点击 **Create**
7. **复制保存**生成的证书和私钥（私钥只显示一次！）

```
-----BEGIN CERTIFICATE-----
MIIE...（你的 Origin Certificate）
-----END CERTIFICATE-----
```

```
[REDACTED PRIVATE KEY]
```

### 4.2 通过 NPM API 上传证书

```bash
curl -X POST http://localhost:81/api/nginx/certificates 
  -H "Authorization: Bearer *** 
  -H "Content-Type: application/json" 
  -d '{
    "provider": "other",
    "nice_name": "Cloudflare Origin - whalemalus.com",
    "domain_names": ["whalemalus.com", "*.whalemalus.com"],
    "meta": {
      "certificate": "-----BEGIN CERTIFICATE-----
MIIE...（完整证书内容）
-----END CERTIFICATE-----",
      "certificate_key": "[REDACTED PRIVATE KEY]"
    }
  }'
```

> ⚠️ **注意**：证书和私钥中的换行符需要用 `
` 替代。可以使用以下命令处理：

```bash
# 将证书文件内容转为一行（替换换行为 
）
CERT=$(cat origin-cert.pem | tr '
' '
' | sed ':a;N;$!ba;s/
/\\\\\\\\
/g')
KEY=$(cat origin-key.pem | tr '
' '
' | sed ':a;N;$!ba;s/
/\\\\\\\\
/g')

# 然后在 JSON 中使用 $CERT 和 $KEY
```

### 4.3 验证证书上传成功

```bash
# 检查证书文件是否生成
ls -la /opt/nginx-proxy-manager/data/custom_ssl/npm-*/

# 应该看到类似
# cert.pem
# key.pem
```

---

### 步骤 5：手动创建 NPM Nginx 配置

这是最关键的一步！通过 API 创建代理主机和上传证书后，**Nginx 的配置文件可能不会自动生成**。我们需要手动创建。

### 5.1 找到 NPM 的 Nginx 配置目录

```bash
ls /opt/nginx-proxy-manager/data/nginx/proxy_host/
# 如果为空或不存在配置文件，就需要手动创建
```

### 5.2 创建代理主机配置

```bash
cat > /opt/nginx-proxy-manager/data/nginx/proxy_host/1.conf << 'EOF'
# whalemalus.com 代理配置
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;

    server_name whalemalus.com www.whalemalus.com;

    # Cloudflare Origin Certificate
    ssl_certificate /data/custom_ssl/npm-<ID>/cert.pem;
    ssl_certificate_key /data/custom_ssl/npm-<ID>/key.pem;

    # SSL 配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 5m;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # 代理配置
    location / {
        proxy_pass http://172.18.0.1:2222;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 支持
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 访问日志和错误日志
    access_log /data/logs/proxy-host-1_access.log proxy;
    error_log /data/logs/proxy-host-1_error.log warn;
}
EOF
```

### 5.3 创建默认服务器配置

为了防止没有匹配到域名的请求暴露信息，需要创建一个默认服务器：

```bash
# 先生成一个自签名证书用于默认服务器
openssl req -x509 -nodes -days 3650 
  -newkey rsa:2048 
  -keyout /opt/nginx-proxy-manager/data/nginx/default_key.pem 
  -out /opt/nginx-proxy-manager/data/nginx/default_cert.pem 
  -subj "/CN=default"

cat > /opt/nginx-proxy-manager/data/nginx/default.conf << 'EOF'
# 默认服务器 - 拒绝未知域名的 SSL 连接
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;

    server_name _;

    # 使用自签名证书
    ssl_certificate /data/nginx/default_cert.pem;
    ssl_certificate_key /data/nginx/default_key.pem;

    # 直接拒绝连接
    ssl_reject_handshake on;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;

    return 444;
}
EOF
```

> 💡 **`ssl_reject_handshake on;`** 的作用：当请求的 SNI（Server Name Indication）不匹配任何已配置的域名时，直接拒绝 TLS 握手，而不是返回默认证书。这样可以防止通过 IP 直接访问获取到不该暴露的信息。

### 5.4 测试并重载 Nginx 配置

```bash
# 进入 NPM 容器测试配置
docker exec nginx-proxy-manager nginx -t

# 如果测试通过，重载配置
docker exec nginx-proxy-manager nginx -s reload
```

---

### 步骤 6：修正 Cloudflare DNS

这是导致问题的最大元凶！

### 6.1 登录 Cloudflare Dashboard

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 选择域名 `whalemalus.com`
3. 进入 **DNS** → **Records**

### 6.2 删除错误的 A 记录

你会看到类似这样的 DNS 记录：

| 类型 | 名称 | 内容 | 代理状态 |
|------|------|------|----------|
| A | @ | <你的服务器公网IP> | ☁️ 已代理 |
| A | @ | <示例IP-A> | ☁️ 已代理 |
| A | @ | <示例IP-B> | ☁️ 已代理 |

**删除** 后面两条记录（<示例IP-A> 和 <示例IP-B>），只保留正确的 IP。

> ⚠️ 这些错误的 IP 可能是 Cloudflare 的默认停放页面 IP，或者是在域名迁移过程中残留的记录。

### 6.3 最终 DNS 配置

正确的 DNS 配置应该只有：

| 类型 | 名称 | 内容 | 代理状态 |
|------|------|------|----------|
| A | @ | <你的服务器公网IP> | ☁️ 已代理（橙色云朵） |
| CNAME | www | whalemalus.com | ☁️ 已代理（橙色云朵） |

> 💡 **橙色云朵**表示 Cloudflare 代理模式开启，流量会经过 Cloudflare CDN。**灰色云朵**表示仅做 DNS 解析，不经过 CDN。

### 6.4 检查 SSL/TLS 设置

在 Cloudflare Dashboard 中：

1. 进入 **SSL/TLS** → **Overview**
2. 将加密模式设置为 **Full**（或 **Full (strict)**）

```
Off       → 不加密（不推荐）
Flexible  → Cloudflare 到用户加密，到源站不加密
Full      → 全程加密，但不验证源站证书
Full (strict) → 全程加密，且验证源站证书（推荐使用 Origin Certificate 时选择）
```

推荐使用 **Full** 或 **Full (strict)**：

- **Full (strict)**：需要源站使用受信任的证书（Cloudflare Origin Certificate 符合条件）
- **Full**：接受自签名证书

### 6.5 确认 Universal SSL 状态

进入 **SSL/TLS** → **Edge Certificates**，确认：

- **Universal SSL Status**：Active
- 如果显示 Pending，可能需要等待几分钟到几小时

---

## 验证

完成以上所有步骤后，进行最终验证：

### 5.1 验证 DNS 解析

```bash
dig whalemalus.com

# 期望输出（显示 Cloudflare IP，而非源站 IP）
;; ANSWER SECTION:
whalemalus.com.    300    IN    A    104.21.xx.xx
whalemalus.com.    300    IN    A    172.67.xx.xx
```

> 💡 看到 Cloudflare 的 IP 是正确的！因为开启了代理模式，外部看到的是 Cloudflare 的 IP。

### 5.2 验证 HTTPS 访问

```bash
curl -I https://whalemalus.com

# 期望输出
HTTP/2 200
server: cloudflare
cf-ray: xxxxxxxxx
...
```

### 5.3 验证 SSL 证书

```bash
echo | openssl s_client -servername whalemalus.com -connect whalemalus.com:443 2>/dev/null | openssl x509 -noout -issuer -subject

# 期望输出（Cloudflare Universal SSL）
issuer= /C=US/O=Let's Encrypt/CN=R3
subject= /CN=whalemalus.com
```

### 5.4 浏览器验证

在浏览器中访问 `https://whalemalus.com`，应该能看到：

- 🔒 地址栏显示安全锁标志
- 博客页面正常加载
- 无证书错误或安全警告

### 5.5 验证 www 子域名

```bash
curl -I https://www.whalemalus.com

# 应该同样返回 200 OK
```

---

## 踩坑记录

### 坑 1：1Panel 覆盖 .env 修改

**现象**：修改了 NPM 的 `.env` 文件中的端口，但过一段时间发现端口又变回 30080/30443。

**原因**：1Panel 在更新应用、重启服务等操作时会重新生成配置文件，覆盖手动修改。

**解决方案**：

- 方案 A：通过 1Panel 界面修改端口（推荐）
- 方案 B：修改后锁定文件 `chattr +i .env`
- 方案 C：使用独立的 docker-compose，不通过 1Panel 管理

### 坑 2：host.docker.internal 在 Linux 上不可用

**现象**：在 Docker 容器中使用 `host.docker.internal` 无法连接到宿主机服务。

**原因**：`host.docker.internal` 是 Docker Desktop（macOS/Windows）的功能，在原生 Linux Docker 中需要额外配置。

**解决方案**：

```bash
# 方案 A：使用 Docker 网关 IP
# 查看 docker0 网桥 IP
ip addr show docker0
# 通常为 172.17.0.1

# 或者使用自定义网络的网关 IP
docker network inspect nginx-proxy-manager_default | grep Gateway
# 通常为 172.18.0.1

# 方案 B：在 docker-compose.yml 中添加
extra_hosts:
  - "host.docker.internal:host-gateway"
```

推荐使用 `172.18.0.1` 或 `172.17.0.1`（Docker 网关 IP）。

### 坑 3：NPM API 更新不会自动生成 Nginx 配置

**现象**：通过 API 成功创建了代理主机和上传了证书，但 Nginx 其实没有加载新配置。

**原因**：NPM 的某些版本中，API 操作只更新数据库，不会自动重新生成 Nginx 配置文件。

**解决方案**：

```bash
# 方案 A：通过 API 触发 Nginx 重载
docker exec nginx-proxy-manager nginx -s reload

# 方案 B：手动创建配置文件（如步骤 5 所述）

# 方案 C：通过 Web 界面操作（Web 界面通常会正确生成配置）
```

### 坑 4：Cloudflare 默认 A 记录可能是停放页面 IP

**现象**：域名解析到奇怪的 IP，不是自己的服务器。

**原因**：Cloudflare 在添加域名时可能会自动扫描 DNS 记录，如果之前域名有过停放页面（parking page），会自动添加停放 IP。

**解决方案**：

- 仔细检查所有 A 记录，删除不属于自己的 IP
- 使用 `dig` 命令验证实际解析结果

### 坑 5：中国镜像在海外服务器不可用

**现象**：在海外 VPS 上使用中国镜像源安装软件失败。

**原因**：阿里云镜像、清华镜像等主要面向中国大陆，海外访问可能受限或不可用。

**解决方案**：

```bash
# 使用默认源或国际镜像
# Debian/Ubuntu
sudo sed -i 's/mirrors.aliyun.com/archive.debian.org/g' /etc/apt/sources.list
# 或直接使用默认源

# pip
pip install xxx -i https://pypi.org/simple/
```

### 坑 6：SSL 模式配置不匹配

**现象**：Cloudflare 显示 522 错误（Connection Timed Out）或 521 错误（Web Server Is Down）。

**原因**：Cloudflare SSL 模式和源站配置不匹配。

**常见配置组合**：

| Cloudflare SSL 模式 | 源站需要 | 适用场景 |
|---------------------|----------|----------|
| Off | HTTP | 不推荐 |
| Flexible | HTTP 监听 80 | 测试环境 |
| Full | HTTPS（任意证书） | 通用场景 |
| Full (strict) | HTTPS（有效证书） | **推荐** |

---

## 附录：常用命令速查

### DNS 相关

```bash
# 查询 A 记录
dig whalemalus.com A

# 查询所有记录
dig whalemalus.com ANY

# 追踪解析路径
dig +trace whalemalus.com

# 使用 nslookup
nslookup whalemalus.com
```

### Docker 相关

```bash
# 查看运行中的容器
docker ps

# 查看容器日志
docker logs nginx-proxy-manager --tail 100 -f

# 进入容器
docker exec -it nginx-proxy-manager bash

# 重启容器
docker restart nginx-proxy-manager

# 查看容器网络
docker network inspect nginx-proxy-manager_default

# 重建容器
docker compose up -d --force-recreate
```

### Nginx 相关

```bash
# 测试 Nginx 配置
docker exec nginx-proxy-manager nginx -t

# 重载配置
docker exec nginx-proxy-manager nginx -s reload

# 查看 Nginx 进程
docker exec nginx-proxy-manager ps aux | grep nginx

# 查看错误日志
docker exec nginx-proxy-manager cat /data/logs/nginx-error.log
```

### SSL/TLS 相关

```bash
# 查看证书信息
openssl x509 -in cert.pem -noout -text

# 查看远程服务器证书
echo | openssl s_client -servername whalemalus.com -connect whalemalus.com:443 2>/dev/null | openssl x509 -noout -dates

# 生成自签名证书
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem -subj "/CN=example.com"
```

### Cloudflare API 相关

```bash
# 获取 Zone ID
curl -X GET "https://api.cloudflare.com/client/v4/zones?name=whalemalus.com" 
  -H "Authorization: Bearer *** 
  -H "Content-Type: application/json"

# 列出 DNS 记录
curl -X GET "https://api.cloudflare.com/client/v4/zones/YOUR_ZONE_ID/dns_records" 
  -H "Authorization: Bearer *** 创建 A 记录
curl -X POST "https://api.cloudflare.com/client/v4/zones/YOUR_ZONE_ID/dns_records" 
  -H "Authorization: Bearer *** 
  -H "Content-Type: application/json" 
  -d '{
    "type": "A",
    "name": "whalemalus.com",
    "content": "<你的服务器公网IP>",
    "proxied": true
  }'
```

---

## 总结

通过本文的步骤，我们完成了以下配置：

1. ✅ **修改 NPM 端口映射**：从 30080/30443 改为标准的 80/443
2. ✅ **重置 NPM 密码**：通过直接修改 SQLite 数据库
3. ✅ **创建代理主机**：通过 NPM API，使用正确的 Docker 网关 IP
4. ✅ **配置 SSL 证书**：上传 Cloudflare Origin Certificate
5. ✅ **手动创建 Nginx 配置**：处理 API 不生成配置的问题
6. ✅ **修正 DNS**：删除错误 A 记录，确保流量正确路由

**最终效果**：

```
🌐 访问 https://whalemalus.com
✅ 200 OK
🔒 SSL 证书有效（Let's Encrypt via Cloudflare）
📝 博客内容正常显示
```

### 关键经验总结

| 要点 | 说明 |
|------|------|
| Docker 网关 IP | Linux 上使用 `172.18.0.1` 或 `172.17.0.1` |
| DNS 配置 | 只保留正确的 A 记录，删除多余的 |
| NPM 配置 | API 操作后检查配置文件是否生成 |
| SSL 模式 | Cloudflare 设为 Full 或 Full (strict) |
| 端口映射 | 确保 NPM 监听标准 80/443 端口 |

---

> 📚 **参考资料**
>
> - [Nginx Proxy Manager 官方文档](https://nginxproxymanager.com/)
> - [Cloudflare SSL/TLS 文档](https://developers.cloudflare.com/ssl/)
> - [Docker 网络文档](https://docs.docker.com/network/)
> - [1Panel 官方文档](https://1panel.cn/docs/)

---