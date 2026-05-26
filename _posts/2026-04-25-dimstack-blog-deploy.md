---
layout: post
title: "博客系统部署：Dim Stack Docker 部署实战"
date: 2026-04-25
categories: 技术教程
tags: ["Docker", "MySQL", "容器化"]
excerpt: "将 Dim Stack 博客系统通过 Docker Compose 部署到云服务器的完整过程，涵盖 Dockerfile 适配、MySQL 中文乱码修复、NPM 反向代理配置等关键环节。"
image: "https://whalemalus.com/file/cover-dimstack-2024"
original_url: "https://whalemalus.com/articles/dimstack-blog-deploy"
---

# 次元栈（Dim Stack）博客系统 Docker 部署实战

> **摘要**：本文详细记录了将 Dim Stack 博客系统通过 Docker Compose 部署到云服务器的完整过程，涵盖 Dockerfile 适配、docker-compose 编排、MySQL 中文乱码修复、NPM 反向代理配置等关键环节。适合想搭建个人博客的开发者参考。
>
> **关键词**：`Dim Stack` `Docker` `博客系统` `MySQL` `utf8mb4`

---

## 楔子

"你有没有博客？"

面试官问出这句话的时候，我心里一沉。不是没有——GitHub 上有好几个 half-finished 的 Hugo 站点，还有一个用 Notion 搭的"博客"，看起来像是一份作业清单。

"有的，但还在完善中……"

面试结束后，我决定认真搞一个。不需要花哨，但要像样——自己部署、自己维护、有自己的域名。

在 GitHub 上翻了一圈，找到了 Dim Stack——一个基于 Spring Boot + React 的博客系统，看起来现代、轻量、开源。文档说"一行命令部署"。

我信了。

然后花了整整两天，从"一行命令"出发，经过 Dockerfile 适配、MySQL 字符集踩坑、NPM 反向代理配置……最终才把它跑起来。

这篇文章就是这两天的完整记录。如果你也想自己搭一个博客，希望能帮你省下一些时间。


## 全景地图：博客系统架构

> 鸟瞰 Dim Stack 博客系统的完整架构，理解各组件之间的关系

### 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Dim Stack 博客架构                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  用户浏览器                                                  │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────┐                                            │
│  │ Cloudflare  │  CDN + DNS + SSL                           │
│  └─────────────┘                                            │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────┐                                            │
│  │     NPM     │  反向代理                                   │
│  └─────────────┘                                            │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ dimstack-   │    │ dimstack-   │    │ dimstack-   │     │
│  │ app         │    │ mysql       │    │ redis       │     │
│  │ (应用)      │    │ (数据库)    │    │ (缓存)      │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 本文的学习路径

```
系统架构 → Docker Compose → 环境变量 → 数据持久化 → 踩坑记录
   │          │          │          │          │
   ▼          ▼          ▼          ▼          ▼
 组件关系    编排配置    数据库配置   卷挂载      常见问题
```

## 引言

Dim Stack 是一个基于 Spring Boot 4 + React 19 的现代化个人博客系统，采用前后端一体化架构。它支持自定义主题、文章分类标签、Markdown 编辑、评论系统等常见博客功能，开箱即用。

但"开箱即用"的前提是——你得先把箱子打开。

本文将带你完成以下步骤：
- 分析项目结构，理解部署需求
- 编写和适配 Dockerfile 与 docker-compose.yml
- 解决部署过程中的中文乱码、字体缺失等典型问题
- 配置 NPM 反向代理，实现域名 HTTPS 访问

每一步都有完整的命令、配置文件和踩坑记录。

## 📖 目录

1. [项目介绍](#1-项目介绍)
2. [项目分析](#2-项目分析)
3. [环境准备](#3-环境准备)
4. [Dockerfile 适配修改](#4-dockerfile-适配修改)
5. [编写 docker-compose.yml](#5-编写-docker-composeyml)
6. [构建与启动](#6-构建与启动)
7. [博客初始化](#7-博客初始化)
8. [NPM 反向代理配置](#8-npm-反向代理配置)
9. [最终架构总览](#9-最终架构总览)
10. [Docker 常用运维命令](#10-docker-常用运维命令)
11. [常见问题与解决方案](#11-常见问题与解决方案)
12. [总结](#12-总结)

---

## 1. 项目介绍

### 🌟 什么是 Dim Stack？

**Dim Stack**（次元栈）是一个基于 **Spring Boot 4 + React 19** 的现代化个人博客系统，采用前后端一体化架构，兼具高性能和良好的开发体验。

- **GitHub 仓库**：[https://github.com/lingview/dim_stack](https://github.com/lingview/dim_stack)
- **项目定位**：个人技术博客 / 内容创作平台

### 🔧 技术栈一览

| 层级 | 技术 | 版本 |
|------|------|------|
| 后端框架 | Spring Boot | 4.0.6 |
| Java 版本 | OpenJDK | 17+（推荐 21） |
| 前端框架 | React | 19 |
| 构建工具 | Vite | 7 |
| CSS 框架 | Tailwind CSS | v4 |
| 数据库 | MySQL | 8 |
| 缓存 | Redis | 7 |
| 容器化 | Docker + Docker Compose | — |

### ✨ 核心功能

- 📝 **文章管理**：Markdown 编辑器，支持草稿、发布、置顶
- 💬 **评论点赞**：内置评论系统，支持嵌套回复
- 🏷️ **标签分类**：灵活的文章标签与分类管理
- 👤 **用户系统**：注册、登录、角色权限管理
- 🔄 **SSR 支持**：服务端渲染，利于 SEO
- 🤖 **大模型集成**：AI 辅助内容审核与生成
- 🖼️ **图片压缩**：自动压缩上传图片，节省存储
- 🔍 **SEO 优化**：sitemap、meta 标签、结构化数据

---

## 2. 项目分析

在开始部署之前，我们先对项目结构和 Docker 相关配置进行分析。

### 📁 关键文件

项目根目录已经提供了 `Dockerfile`，但**没有** `docker-compose.yml`。这意味着我们需要自行编写编排文件，将应用与 MySQL、Redis 一起管理。

### 🐳 现有 Dockerfile 分析

```dockerfile
FROM eclipse-temurin:21-jre-alpine

# 工作目录
WORKDIR /dim_stack

# 复制构建产物
COPY target/*.jar app.jar

# 暴露端口
EXPOSE 2222

# 启动命令
ENTRYPOINT ["java", "-jar", "app.jar"]
```

关键信息提取：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 基础镜像 | `eclipse-temurin:21-jre-alpine` | Alpine + OpenJDK 21 |
| 应用端口 | `2222` | 非常规端口，需注意防火墙 |
| 卷挂载点 | `config/`, `upload/`, `logs/`, `.random_salt` | 需要持久化的数据 |

### 🔗 安装向导

Dim Stack 提供了 Web 安装向导，首次部署完成后访问：

```
http://<服务器IP>:2222/init/setup
```

安装向导会引导你完成：
- 管理员账号创建
- MySQL 数据库连接配置
- Redis 连接配置
- 数据库表自动初始化

---

## 3. 环境准备

### 📋 前置条件

- 一台 Linux 云服务器（推荐 Ubuntu 22.04 / Debian 12）
- 已安装 Docker 和 Docker Compose
- 已安装 Git
- 已安装 Maven（用于构建 JAR 包）

### 📂 创建目录结构

```bash
# 创建项目根目录
mkdir -p /opt/dim_stack
cd /opt/dim_stack

# 创建持久化目录
mkdir -p config upload logs mysql-data redis-data
```

目录结构如下：

```
/opt/dim_stack/
├── config/          # 应用配置文件
├── upload/          # 上传的图片等文件
├── logs/            # 应用日志
├── mysql-data/      # MySQL 数据持久化
├── redis-data/      # Redis 数据持久化
├── Dockerfile       # 即将从项目复制
└── docker-compose.yml  # 即将编写
```

### 🔐 设置目录权限

Docker 容器内进程通常以特定用户运行，需要确保挂载目录的权限正确：

```bash
# 设置目录所有者为 1001（容器内常用用户 ID）
chown -R 1001:1001 /opt/dim_stack/

# 确认权限
ls -la /opt/dim_stack/
```

### 📦 克隆项目并构建 JAR 包

```bash
# 克隆项目
git clone https://github.com/lingview/dim_stack.git
cd dim_stack

# 使用 Maven 构建（跳过前端构建，如果已有构建产物）
mvn clean package -DskipTests

# 确认 JAR 包生成
ls -la target/*.jar
```

### 📄 复制 Dockerfile

```bash
# 将 Dockerfile 复制到部署目录
cp Dockerfile /opt/dim_stack/
cp target/*.jar /opt/dim_stack/target/
```

---

## 4. Dockerfile 适配修改

### ⚠️ 问题发现

原始 Dockerfile 中使用了**中国镜像源**（清华镜像），这在国内服务器上构建速度很快，但在**海外服务器上可能不可用或极慢**：

```dockerfile
# 原始配置（中国镜像）
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories
```

### 🔧 解决方案

根据服务器所在地区选择合适的镜像源：

**海外服务器**（使用默认镜像）：

```dockerfile
# 无需修改，或显式指定
RUN sed -i 's/dl-cdn.alpinelinux.org/dl-cdn.alpinelinux.org/g' /etc/apk/repositories
```

实际上直接删除或注释掉该行即可：

```dockerfile
# 海外服务器 - 注释掉中国镜像
# RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories
```

**国内服务器**（保持原样）：

```dockerfile
# 国内服务器 - 使用清华镜像加速
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories
```

### 📝 修改后的完整 Dockerfile

```dockerfile
FROM eclipse-temurin:21-jre-alpine

WORKDIR /dim_stack

# 海外服务器注释掉下行，国内服务器保留
# RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories

COPY target/*.jar app.jar

EXPOSE 2222

ENTRYPOINT ["java", "-jar", "app.jar"]
```

---

## 5. 编写 docker-compose.yml

由于项目没有提供 `docker-compose.yml`，我们需要自行编写一个完整的编排文件，将应用、MySQL、Redis 三个服务统一管理。

### 📝 完整配置

```yaml
version: '3.8'

services:
  # ==================== MySQL 数据库 ====================
  mysql:
    image: mysql:8.0
    container_name: dimstack-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: DimStack@2026
      MYSQL_DATABASE: dim_stack
      MYSQL_CHARSET: utf8mb4
      MYSQL_COLLATION: utf8mb4_unicode_ci
    ports:
      - "127.0.0.1:3307:3306"
    volumes:
      - ./mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s
    networks:
      - dimstack-net

  # ==================== Redis 缓存 ====================
  redis:
    image: redis:7-alpine
    container_name: dimstack-redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    ports:
      - "127.0.0.1:6380:6379"
    volumes:
      - ./redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - dimstack-net

  # ==================== Dim Stack 应用 ====================
  dimstack:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: dimstack-app
    restart: unless-stopped
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "2222:2222"
    volumes:
      - ./config:/dim_stack/config
      - ./upload:/dim_stack/upload
      - ./logs:/dim_stack/logs
      - ./.random_salt:/dim_stack/.random_salt
    networks:
      - dimstack-net

# ==================== 网络配置 ====================
networks:
  dimstack-net:
    driver: bridge
```

### 🔍 配置详解

| 配置项 | 说明 |
|--------|------|
| `restart: unless-stopped` | 服务器重启后自动恢复容器 |
| `127.0.0.1:3307:3306` | MySQL 仅监听本地，避免暴露到公网 |
| `127.0.0.1:6380:6379` | Redis 仅监听本地，安全起见 |
| `depends_on + service_healthy` | 等待数据库就绪后再启动应用 |
| `dimstack-net` | 自定义桥接网络，容器间通过服务名通信 |
| `healthcheck` | 健康检查确保服务真正可用 |

---

## 6. 构建与启动

### 🏗️ 构建镜像

```bash
cd /opt/dim_stack

# 首次构建（或 Dockerfile 有修改时）
docker compose build

# 如果遇到缓存问题，强制重新构建
docker compose build --no-cache
```

构建过程输出示例：

```
[+] Building 45.2s (8/8) FINISHED
 => [dimstack]  1/4 FROM eclipse-temurin:21-jre-alpine
 => [dimstack]  2/4 WORKDIR /dim_stack
 => [dimstack]  3/4 COPY target/*.jar app.jar
 => [dimstack]  4/4 EXPOSE 2222
 => exporting to image
 => => naming to docker.io/library/dimstack-dimstack
```

### 🚀 启动所有服务

```bash
# 后台启动
docker compose up -d
```

输出示例：

```
[+] Running 4/4
 ✔ Network dimstack-net    Created
 ✔ Container dimstack-mysql  Healthy
 ✔ Container dimstack-redis  Healthy
 ✔ Container dimstack-app    Started
```

### ✅ 验证容器状态

```bash
docker compose ps
```

预期输出：

```
NAME            IMAGE                   STATUS                   PORTS
dimstack-app    dimstack-dimstack       Up 2 minutes             0.0.0.0:2222->2222/tcp
dimstack-mysql  mysql:8.0               Up 2 minutes (healthy)   127.0.0.1:3307->3306/tcp
dimstack-redis  redis:7-alpine          Up 2 minutes (healthy)   127.0.0.1:6380->6379/tcp
```

三个容器全部正常运行 ✅

### 📊 查看日志

```bash
# 查看所有服务日志
docker compose logs -f

# 仅查看应用日志
docker compose logs -f dimstack

# 查看最后 100 行
docker compose logs --tail=100 dimstack
```

---

## 7. 博客初始化

### 🌐 访问安装向导

服务启动后，在浏览器中访问：

```
http://<服务器IP>:2222/init/setup
```

### 📋 安装向导步骤

#### 第一步：欢迎页面

系统会自动检测运行环境，确认 Java 版本、数据库驱动等组件就绪。

#### 第二步：管理员账号设置

填写管理员信息：
- 用户名
- 密码
- 邮箱地址

#### 第三步：数据库连接配置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 数据库主机 | `mysql` | Docker 内部使用服务名 |
| 数据库端口 | `3306` | 容器内部端口 |
| 数据库名 | `dim_stack` | 与 docker-compose.yml 一致 |
| 用户名 | `root` | MySQL root 用户 |
| 密码 | `DimStack@2026` | 与 docker-compose.yml 一致 |

> ⚠️ **重要提示**：在 Docker 网络内，应用容器通过服务名 `mysql` 访问数据库容器，而不是 `localhost` 或 `127.0.0.1`。

#### 第四步：Redis 连接配置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| Redis 主机 | `redis` | Docker 内部使用服务名 |
| Redis 端口 | `6379` | 容器内部端口 |
| 密码 | 留空 | 未设置密码 |

#### 第五步：完成初始化

点击「完成安装」，系统将自动：
- 创建数据库表结构
- 插入初始数据
- 生成配置文件到 `config/` 目录
- 跳转到博客首页或管理后台

### 🎉 初始化完成

访问 `http://<服务器IP>:2222` 即可看到博客首页，访问 `/admin` 进入管理后台。

---

## 8. NPM 反向代理配置

为了使用域名访问并通过 HTTPS 加密传输，我们使用 **Nginx Proxy Manager**（NPM）进行反向代理。

### 🏗️ 架构说明

NPM 是一个基于 Nginx 的可视化反向代理管理工具，支持通过 Web UI 配置代理规则和 SSL 证书。

### 🔧 通过 NPM API 创建代理主机

如果你已经部署了 NPM，可以通过 API 或 Web UI 创建代理规则：

```bash
# 通过 API 创建代理主机
curl -X POST "http://npm-host:81/api/nginx/proxy-hosts" 
  -H "Authorization: Bearer *** 
  -H "Content-Type: application/json" 
  -d '{
    "domain_names": ["whalemalus.com"],
    "forward_host": "172.18.0.1",
    "forward_port": 2222,
    "ssl_forced": true,
    "hsts_enabled": true,
    "http2_support": true,
    "block_exploits": true
  }'
```

### 📋 配置要点

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 域名 | `whalemalus.com` | 你的博客域名 |
| 转发地址 | `172.18.0.1:2222` | Docker 宿主机在 NPM 网络中的 IP |
| SSL | Cloudflare Origin Certificate | 源站证书 |
| HSTS | 启用 | 强制 HTTPS |
| HTTP/2 | 启用 | 提升性能 |

### 🔐 SSL 证书配置

1. 在 Cloudflare 控制面板生成 **Origin Certificate**
2. 复制证书内容和私钥
3. 在 NPM 的 SSL 选项卡中上传证书
4. 启用「Force SSL」和「HTTP/2」

### 📝 Web UI 操作步骤

1. 登录 NPM 管理面板（通常在 `http://<IP>:81`）
2. 进入 **Hosts** → **Proxy Hosts** → **Add Proxy Host**
3. 填写域名：`whalemalus.com`
4. 填写转发目标：`172.18.0.1`，端口：`2222`
5. 切换到 **SSL** 选项卡：
   - 选择「Custom」证书类型
   - 粘贴 Origin Certificate 和 Private Key
   - 勾选 Force SSL、HSTS、HTTP/2
6. 保存

---

## 9. 最终架构总览

### 🏛️ 请求流转路径

```
用户浏览器
    │
    ▼
┌─────────────────────────────────┐
│   Cloudflare CDN / DNS / SSL    │  ← 全球加速 + 边缘 SSL
└─────────────┬───────────────────┘
              │ HTTPS (443)
              ▼
┌─────────────────────────────────┐
│   Nginx Proxy Manager (NPM)     │  ← 反向代理 + 源站 SSL 终结
│   监听: 443                     │
└─────────────┬───────────────────┘
              │ HTTP (2222)
              ▼
┌─────────────────────────────────┐
│   Dim Stack Application         │  ← Spring Boot 4 + React 19
│   容器: dimstack-app            │
│   端口: 2222                    │
└──────┬──────────────┬───────────┘
       │              │
       ▼              ▼
┌──────────────┐ ┌──────────────┐
│ MySQL 8.0    │ │ Redis 7      │
│ 容器:        │ │ 容器:        │
│ dimstack-mysql│ │ dimstack-redis│
│ 端口: 3306   │ │ 端口: 6379   │
└──────────────┘ └──────────────┘
```

### 🔒 安全层级

| 层级 | 安全措施 |
|------|----------|
| 第一层 | Cloudflare WAF + DDoS 防护 |
| 第二层 | NPM 反向代理 + SSL/TLS |
| 第三层 | Docker 网络隔离 |
| 第四层 | MySQL/Redis 仅本地监听 |

---

## 10. Docker 常用运维命令

### 📦 服务管理

```bash
# 启动所有服务（后台运行）
docker compose up -d

# 停止所有服务
docker compose down

# 重启所有服务
docker compose restart

# 重启单个服务
docker compose restart dimstack

# 查看服务状态
docker compose ps

# 查看资源占用
docker stats
```

### 📊 日志查看

```bash
# 实时查看所有日志
docker compose logs -f

# 实时查看应用日志
docker compose logs -f dimstack

# 查看最后 200 行日志
docker compose logs --tail=200

# 查看特定时间段日志
docker compose logs --since="2026-04-25T00:00:00" dimstack
```

### 🔧 进入容器调试

```bash
# 进入应用容器
docker exec -it dimstack-app /bin/bash

# 进入 MySQL 容器
docker exec -it dimstack-mysql mysql -uroot -pDimStack@2026

# 进入 Redis 容器
docker exec -it dimstack-redis redis-cli
```

### 🏗️ 重新构建

```bash
# 增量构建（利用缓存）
docker compose build

# 完全重新构建（清除缓存）
docker compose build --no-cache

# 构建并启动
docker compose up -d --build
```

### 🗄️ 数据库操作

```bash
# 备份数据库
docker exec dimstack-mysql mysqldump -uroot -pDimStack@2026 dim_stack > backup_$(date +%Y%m%d).sql

# 恢复数据库
docker exec -i dimstack-mysql mysql -uroot -pDimStack@2026 dim_stack < backup_20260425.sql

# 进入 MySQL 命令行
docker exec -it dimstack-mysql mysql -uroot -pDimStack@2026 dim_stack
```

---

## 11. 常见问题与解决方案

### ❓ 问题一：中国镜像在海外服务器不可用

**症状**：构建时卡在 `apk add` 步骤，或报错无法连接 mirrors.tuna.tsinghua.edu.cn

**原因**：Dockerfile 中使用了清华镜像源，海外服务器访问慢或不可达

**解决**：

```dockerfile
# 注释掉中国镜像配置
# RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories
```

---

### ❓ 问题二：host.docker.internal 解析失败

**症状**：应用无法连接 MySQL/Redis，报错 `UnknownHostException: host.docker.internal`

**原因**：`host.docker.internal` 在 Linux 上默认不支持（仅 Docker Desktop 支持）

**解决**：使用 Docker Compose 的自定义网络，通过**服务名**访问：

```yaml
# ❌ 错误写法
spring.datasource.url=jdbc:mysql://host.docker.internal:3306/dim_stack

# ✅ 正确写法（Docker 网络内）
spring.datasource.url=jdbc:mysql://mysql:3306/dim_stack
```

---

### ❓ 问题三：容器间网络不通

**症状**：应用容器无法连接到 MySQL 或 Redis 容器

**原因**：容器不在同一个 Docker 网络中

**解决**：确保 `docker-compose.yml` 中所有服务都加入了同一个网络：

```yaml
networks:
  dimstack-net:
    driver: bridge
```

验证网络连通性：

```bash
# 从应用容器 ping MySQL
docker exec dimstack-app ping mysql

# 检查网络
docker network inspect dimstack-net
```

---

### ❓ 问题四：MySQL 初始化超时

**症状**：应用启动时数据库连接失败，MySQL 容器日志显示仍在初始化

**原因**：MySQL 首次启动需要较长时间初始化数据目录

**解决**：已在 `docker-compose.yml` 中配置健康检查和 `start_period`：

```yaml
mysql:
  healthcheck:
    test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
    interval: 10s
    timeout: 5s
    retries: 10
    start_period: 30s   # 给 MySQL 30 秒启动时间
```

应用通过 `depends_on` + `condition: service_healthy` 等待 MySQL 就绪后再启动。

---

### ❓ 问题五：上传文件权限问题

**症状**：上传图片失败，日志显示 `Permission denied`

**原因**：宿主机目录权限与容器内用户不匹配

**解决**：

```bash
# 修复权限
chown -R 1001:1001 /opt/dim_stack/upload
chmod -R 755 /opt/dim_stack/upload
```

---

### ❓ 问题六：端口被占用

**症状**：启动时报错 `Bind for 0.0.0.0:2222 failed: port is already allocated`

**原因**：端口 2222 已被其他进程占用

**解决**：

```bash
# 查找占用端口的进程
lsof -i :2222

# 杀掉占用进程
kill -9 <PID>

# 或修改 docker-compose.yml 中的端口映射
ports:
  - "3222:2222"  # 改用其他端口
```

---

## 12. 总结

### 📝 部署清单

- [x] 准备服务器环境（Docker、Docker Compose）
- [x] 创建目录结构并设置权限
- [x] 克隆项目并构建 JAR 包
- [x] 适配 Dockerfile（处理镜像源问题）
- [x] 编写 docker-compose.yml（MySQL + Redis + App）
- [x] 构建并启动容器
- [x] 通过 Web 向导初始化博客
- [x] 配置 NPM 反向代理 + SSL
- [x] 验证全链路访问

### 💡 经验总结

1. **Docker Compose 的价值**：虽然项目只提供了 Dockerfile，但通过编写 `docker-compose.yml`，我们将三个服务（应用、数据库、缓存）统一编排，实现了一键部署和管理。

2. **网络设计很重要**：使用自定义桥接网络，让容器间通过服务名通信，避免了 `host.docker.internal` 的兼容性问题。

3. **健康检查不可少**：通过 `healthcheck` 和 `depends_on.condition`，确保应用在数据库就绪后再启动，避免启动失败。

4. **安全分层防护**：从 Cloudflare → NPM → Docker 网络隔离 → 服务本地监听，层层防护保障系统安全。

5. **镜像源要因地制宜**：国内用清华/阿里镜像加速，海外用默认源，一个注释的切换就能解决构建问题。

### 🎯 后续优化方向

- 配置定时备份（MySQL + 上传文件）
- 添加监控告警（容器状态、磁盘空间）
- 配置日志轮转（防止日志撑满磁盘）
- 考虑使用 Docker Swarm 或 K8s 实现高可用

---

> 📌 **本文档持续更新**，如有问题或建议，欢迎在 GitHub Issues 中反馈。
>
> 🔗 项目地址：[https://github.com/lingview/dim_stack](https://github.com/lingview/dim_stack)
>
> 📅 最后更新：2026 年 4 月