---
layout: post
title: "SSL/证书/公钥私钥/HTTPS 完全指南"
date: 2026-04-26
categories: 技术教程
tags: ["SSL/TLS", "安全", "Cloudflare"]
excerpt: "从零开始，循序渐进理解网络安全通信的核心概念。以 whalemalus.com 博客系统为例，讲解证书、PKI、数字签名、RSA 算法的原理与实战。"
image: "https://whalemalus.com/file/cover-ssl-cert-key"
original_url: "https://whalemalus.com/articles/ssl-certificate-complete-guide"
---

# SSL/证书/公钥私钥/HTTPS 完全指南

> **摘要**：从零开始，循序渐进理解网络安全通信的核心概念。以 whalemalus.com 博客系统为例，讲解证书、PKI、数字签名、RSA 算法的原理与实战。
>
> **关键词**：`SSL/TLS` `数字证书` `PKI` `RSA算法` `HTTPS`

---

## 楔子

"这个网站怎么显示不安全？"朋友发来截图，浏览器地址栏一个红色的警告图标。

我看了一眼，HTTP，不是 HTTPS。"你需要配置 SSL 证书。"

"SSL 证书是什么？公钥私钥又是什么？为什么还要数字签名？"朋友一脸懵。

这不就是当年的我吗？知道要配置 HTTPS，但背后的原理一窍不通。证书、PKI、数字签名、RSA...这些概念像一团乱麻，越查越迷糊。

直到我花了一整天，从零开始把这些概念梳理清楚，才发现：原来这些概念之间有清晰的逻辑链条，只是没人把它讲明白。

## 引言

HTTPS 已经成为现代网站的标配，但很多人对背后的原理一知半解：

1. **为什么需要 HTTPS？** — HTTP 明文传输的三大风险
2. **证书是什么？** — 数字世界的身份证
3. **PKI 如何工作？** — 证书的信任体系
4. **公钥私钥怎么用？** — 非对称加密的核心
5. **数字签名是什么？** — 防篡改的关键机制
6. **RSA 算法原理** — 数学如何保证安全

**技术栈**：Cloudflare CDN + Nginx Proxy Manager (NPM) + Dim Stack 博客

---

## 📖 目录

1. [全景地图：HTTPS 的完整图景](#1-全景地图https-的完整图景)
2. [核心概念：深入理解每个组件](#2-核心概念深入理解每个组件)
3. [实战指南：whalemalus.com 的配置](#3-实战指南whalemaluscom-的配置)
4. [踩坑记录](#4-踩坑记录)
5. [总结与展望](#5-总结与展望)

---

## 1. 全景地图：HTTPS 的完整图景

> 鸟瞰整个 HTTPS 的结构，理解各组件之间的关系

### 1.1 HTTPS 的本质

```
HTTPS = HTTP + SSL/TLS = 加密 + 身份验证 + 完整性
```

| 组件 | 作用 | 类比 |
|------|------|------|
| **HTTP** | 传输协议 | 信封 |
| **SSL/TLS** | 加密层 | 保险箱 |
| **证书** | 身份证明 | 身份证 |
| **PKI** | 信任体系 | 公安系统 |

### 1.2 完整的信任链

```
                    根证书（Root CA）
                    ═══════════════
                    预装在浏览器/操作系统
                         │
                         │ 签发
                         ▼
                    中间证书（Intermediate CA）
                    ═══════════════════════
                    由根证书签发
                         │
                         │ 签发
                         ▼
                    终端证书（End-Entity）
                    ═════════════════════
                    网站/服务器使用
```

### 1.3 两段加密模型

```
用户浏览器 ←── 第1段加密 ──→ Cloudflare ←── 第2段加密 ──→ NPM（你的服务器）
              │                              │
              │ Cloudflare 的证书            │ Origin Certificate
              │ （自动管理）                  │ （你手动上传）
```

**为什么需要两段？**
- 第1段：用户 ↔ Cloudflare，用 Cloudflare 的证书（自动管理）
- 第2段：Cloudflare ↔ 你的服务器，用 Origin Certificate（你上传）

---

## 2. 核心概念：深入理解每个组件

> 关键术语和原理的深度解释

### 2.1 证书：数字世界的身份证

**证书包含什么？**

```
┌─────────────────────────────────────┐
│  域名：whalemalus.com                │
│  有效期：2024-01-01 至 2025-01-01    │
│  颁发者：Cloudflare                  │
│  公钥：-----BEGIN PUBLIC KEY-----    │
│        MIIBIjANBgkqhk...            │
│        -----END PUBLIC KEY-----      │
│  数字签名：xxxxx（防伪造）            │
└─────────────────────────────────────┘
```

| 组件 | 作用 | 类比 |
|------|------|------|
| **域名** | 证书保护的网站地址 | 身份证上的姓名 |
| **公钥** | 用于加密数据 | 你给别人的锁 |
| **私钥** | 用于解密数据（必须保密！） | 你自己留的钥匙 |
| **颁发者** | 签发证书的机构 | 公安局（发身份证的） |
| **数字签名** | 证明证书真实性 | 身份证上的防伪标记 |

### 2.2 公钥与私钥：非对称加密基础

**一对密钥，两种用途：**

```
公钥（公开）                    私钥（保密）
   │                              │
   │  用公钥加密 →                │
   │  ═══════════════════════════→│
   │                              │  只有私钥能解密！
   │  ←═══════════════════════════│
   │         用私钥解密            │
```

**公钥加密/私钥解密的输入输出：**

| 操作 | 输入 | 输出 | 运算 |
|------|------|------|------|
| **公钥加密** | 明文 + 公钥 (e, n) | 密文 | `ciphertext = message^e mod n` |
| **私钥解密** | 密文 + 私钥 (d, n) | 明文 | `message = ciphertext^d mod n` |

### 2.3 数字签名与验证签名

**数字签名 ≠ 加密，它们解决不同的问题：**

| 功能 | 解决什么问题 | 例子 |
|------|--------------|------|
| **公钥加密/私钥解密** | **保密性**（防止窃听） | 浏览器用服务器公钥加密数据 |
| **数字签名** | **完整性 + 身份验证**（防止篡改 + 冒充） | CA 用私钥签名证书 |

**类比：**
- 公钥加密 = 把信放进保险箱（只有收件人能打开）
- 数字签名 = 在信上盖章（证明信是你写的，没被改过）

**签名和验证的输入输出：**

| 操作 | 输入 | 输出 | 用什么 |
|------|------|------|--------|
| **签名** | 数据 + 私钥 | 数字签名 | 私钥 (d, n) |
| **验证** | 数据 + 签名 + 公钥 | 验证结果 | 公钥 (e, n) |

**验证签名的完整流程：**

```
① 用 CA 的【公钥】解密数字签名 → 得到摘要1
② 用 SHA256 计算证书内容的摘要 → 得到摘要2
③ 比较摘要1和摘要2
   ├── 相同 → 验证通过 ✓
   └── 不同 → 验证失败 ✗
```

### 2.4 RSA 算法原理

**密钥生成过程：**

```
① 随机选择两个大质数 p 和 q
② 计算 n = p × q
③ 计算 φ(n) = (p-1)(q-1)
④ 选择公钥指数 e（通常 65537）
⑤ 计算私钥指数 d（e 关于 φ(n) 的模反元素）

结果：
公钥 = (e, n)
私钥 = (d, n)
```

**模反元素的通俗理解（时钟算术）：**

```
5 × ? ≡ 1 (mod 12)
答案：? = 5（因为 5 × 5 = 25，25 mod 12 = 1）

在 RSA 中：
e × d ≡ 1 (mod φ(n))
e 和 d 互为模反元素
```

**RSA 的两种用途：**

| 用途 | 运算 | 目的 |
|------|------|------|
| **加密/解密** | `message^e mod n` / `ciphertext^d mod n` | 保密 |
| **签名/验证** | `hash^d mod n` / `signature^e mod n` | 认证 |

### 2.5 签名算法：SHA256 与 RSA2048

**数字签名 = 哈希算法 + 非对称算法**

| 概念 | 是什么 | 作用 |
|------|--------|------|
| **SHA256** | 哈希算法（摘要算法） | 把任意长度的数据压缩成固定长度（256位） |
| **RSA2048** | 非对称加密算法 | 用私钥签名，用公钥验证 |

**它们的关系：**
```
数字签名 = RSA2048( SHA256(证书内容) )

1. 先用 SHA256 生成摘要
2. 再用 RSA2048 私钥加密摘要
3. 这就是数字签名
```

**为什么这些算法安全？**

| 算法 | 安全性基础 | 为什么难以破解 |
|------|------------|----------------|
| **RSA** | 大数分解难题 | 给定 n = p × q，分解出 p 和 q 非常困难 |
| **SHA256** | 抗碰撞 | 2^256 种可能输出，暴力破解需要 2^128 次 |

### 2.6 HTTPS 握手流程

```
用户浏览器                                          服务器
    │                                                  │
    │ ① Client Hello                                   │
    │    "我要访问 whalemalus.com"                      │
    │─────────────────────────────────────────────────→│
    │                                                  │
    │ ② Server Hello + 证书（含公钥 + 数字签名）         │
    │←─────────────────────────────────────────────────│
    │                                                  │
    │ ③ 【验证数字签名】用 CA 公钥验证 ✓                  │
    │                                                  │
    │ ④ 【公钥加密】用服务器公钥加密随机数                 │
    │─────────────────────────────────────────────────→│
    │                                                  │
    │ ⑤ 【私钥解密】用服务器私钥解密，得到随机数           │
    │                                                  │
    │ ⑥ 双方用随机数生成会话密钥                          │
    │                                                  │
    │ ⑦ 加密通信开始                                    │
    │═══════════════════════════════════════════════════│
```

**一句话总结：先验证身份（验签），再建立加密通道（公钥加密/私钥解密）。**

---

## 3. 实战指南：whalemalus.com 的配置

> 从零开始的实操步骤

### 3.1 整体架构

```
用户浏览器
    │
    ▼
Cloudflare CDN（HTTPS 终止，自动证书）
    │
    ▼
Nginx Proxy Manager（NPM，反向代理）
    │
    │ 使用 Cloudflare Origin Certificate
    ▼
Dim Stack 博客应用（端口 2222）
```

### 3.2 第一步：Cloudflare 生成 Origin Certificate

**在 Cloudflare 控制台：**

1. 路径：SSL/TLS → Origin Server → Create Certificate
2. 设置：
   - 域名：`whalemalus.com`, `*.whalemalus.com`
   - 有效期：15 年
   - 格式：PEM
3. 下载：
   - 证书文件（.crt）
   - 私钥文件（.key）

**⚠️ 重要：** Origin Certificate 不是自签名证书，是 Cloudflare 自己的 CA 签发的！

### 3.3 第二步：上传证书到 NPM

1. 登录 NPM 管理面板：`http://<服务器IP>:30081`
2. 进入 SSL Certificates → Add Custom Certificate
3. 填入：
   - Certificate：粘贴 .crt 文件内容
   - Certificate Key：粘贴 .key 文件内容

### 3.4 第三步：配置反向代理

**在 NPM 中创建 Proxy Host：**

```
Domain Names: whalemalus.com
Scheme: http
Forward Hostname: dimstack-app
Forward Port: 2222
```

**SSL 配置：**
```
SSL Certificate: 选择刚才上传的证书
Force SSL: ✓
HTTP/2 Support: ✓
HSTS Enabled: ✓
```

### 3.5 第四步：设置 Cloudflare SSL 模式

路径：SSL/TLS → Overview

```
选择 Full 模式：
- 浏览器到 Cloudflare：加密（用 Cloudflare 的证书）
- Cloudflare 到服务器：加密（用 Origin Certificate）
```

### 3.6 验证配置

```bash
# 检查 HTTPS 是否正常
curl -I https://whalemalus.com

# 检查证书信息
openssl s_client -connect whalemalus.com:443 -showcerts

# 检查证书有效期
openssl x509 -in certificate.crt -noout -dates
```

---

## 4. 踩坑记录

### 坑1：Cloudflare 522 错误

**现象**：网站显示 522 Connection Timed Out

**原因**：Cloudflare 无法连接到源服务器

**解决**：
1. 检查 NPM 是否在运行
2. 检查防火墙是否开放 80/443 端口
3. 检查 SSL/TLS 模式是否为 Full

### 坑2：NET::ERR_CERT_AUTHORITY_INVALID

**现象**：浏览器显示"证书不是由受信任的机构签发"

**原因**：使用了自签名证书或证书配置错误

**解决**：使用 Cloudflare Origin Certificate 或 Let's Encrypt 证书

### 坑3：NPM 默认服务器 SSL 错误

**现象**：访问未配置的域名时 SSL 握手失败

**原因**：NPM 默认服务器有 `ssl_reject_handshake on;`

**解决**：为默认服务器生成自签名证书

---

## 5. 总结与展望

### 核心收获

1. **HTTPS = 加密 + 身份验证 + 完整性**
2. **证书是数字身份证**，由 CA 签发，包含公钥和数字签名
3. **PKI 是信任体系**，根 CA → 中间 CA → 终端证书
4. **公钥私钥用于加密/解密**，数字签名用于验证身份
5. **RSA 算法基于数学难题**，目前无法破解
6. **两段加密模型**：用户↔Cloudflare + Cloudflare↔服务器

### 最佳实践

- ✅ 使用 HTTPS（不要用 HTTP）
- ✅ 设置 SSL/TLS 模式为 Full 或 Full (Strict)
- ✅ 启用 HSTS（强制 HTTPS）
- ✅ 定期检查证书有效期
- ✅ 妥善保管私钥文件

### 延伸阅读

- [MDN Web Docs: HTTPS](https://developer.mozilla.org/zh-CN/docs/Glossary/HTTPS)
- [Cloudflare: What is SSL?](https://www.cloudflare.com/learning/ssl/what-is-ssl/)
- [Let's Encrypt: How it works](https://letsencrypt.org/how-it-works/)

---

> 💡 **小贴士**：如果觉得文章对你有帮助，欢迎点赞、收藏、评论交流！
