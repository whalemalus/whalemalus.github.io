---
layout: post
title: "Docker 部署实战：从零开始容器化应用"
date: 2026-04-25
categories: DevOps
tags: ["Docker", "容器化", "Linux"]
excerpt: "以 OpenClaw 项目为实战案例，系统讲解 Docker 核心概念、docker-compose 编排、常用运维命令和日志排查技巧。从在我电脑上能跑的经典困境出发，带你掌握容器化部署的完整流程。"
image: "https://whalemalus.com/file/cover-docker-2024"
header:
  teaser: "https://whalemalus.com/file/cover-docker-2024"
  overlay_image: "https://whalemalus.com/file/cover-docker-2024"
original_url: "https://whalemalus.com/articles/docker-deployment-guide"
---

# Docker 从入门到实战：以 OpenClaw 为例详解容器化部署

> **摘要**：本文以 OpenClaw 项目为实战案例，讲清楚 Docker 的核心概念、docker-compose 编排、常用运维命令和日志排查技巧。从"在我电脑上能跑"的经典困境出发，带你一步步掌握容器化部署的流程。
>
> **关键词**：`Docker` `容器化` `docker-compose` `OpenClaw` `运维部署`

---

## 楔子

"在我电脑上明明能跑啊！"

这句话，大概是程序员职业生涯中最经典的台词了。上周五下午，同事信誓旦旦地说代码没问题，结果部署到服务器上直接炸了——Python 版本不对，系统库缺了三个，还有一个神秘的 `glibc` 报错。

折腾了整整一个周末，周一早上顶着黑眼圈来到工位，发现新来的实习生已经用 Docker 把同样的项目跑起来了。一行命令，不到两分钟。

"你……怎么做到的？"

他笑了笑："装个 Docker 就行。"

那一刻，我决定认真学一下这玩意儿。

## 全景地图

> 鸟瞰 Docker 容器化的完整生态，理解各组件之间的关系

### Docker 核心架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker 技术栈                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   镜像      │    │   容器      │    │   卷        │     │
│  │  (Image)    │    │ (Container) │    │  (Volume)   │     │
│  ├─────────────┤    ├─────────────┤    ├─────────────┤     │
│  │ 只读模板    │    │ 运行实例    │    │ 持久化存储  │     │
│  │ 分层存储    │    │ 隔离环境    │    │ 数据不丢失  │     │
│  │ 可以复用    │    │ 可以销毁    │    │ 独立于容器  │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                  │                  │             │
│         └──────────────────┼──────────────────┘             │
│                            │                                │
│                            ▼                                │
│                   ┌─────────────┐                           │
│                   │ docker-     │                           │
│                   │ compose.yml │                           │
│                   │  (编排)     │                           │
│                   └─────────────┘                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 本文的学习路径

```
核心概念 → 实战项目 → 架构图 → 配置详解 → 命令大全 → 最佳实践
   │          │          │          │          │          │
   ▼          ▼          ▼          ▼          ▼          ▼
 镜像/容器   OpenClaw   请求流转   docker-    exec/logs  避坑指南
 /卷/端口    项目介绍   过程       compose    常用命令
```

## 引言

这不是一篇"Docker 是什么"的科普文。本文以一个真实的开源项目 **OpenClaw** 为例，从零开始记录一次完整的容器化部署过程。

你将学到：
- Docker 的核心概念（镜像、容器、Compose）——用人话讲明白
- 如何编写和理解 `docker-compose.yml`
- 容器运维中最常用的命令和排查技巧
- 那些文档里不会写、但实际部署一定会踩的坑

如果你和当初的我一样，对 Docker 只停留在"听说过"的阶段，或者每次部署都靠感觉——这篇文章应该能帮到你。

## 目录

- [楔子](#楔子)
- [全景地图](#全景地图)
- [引言](#引言)
- [核心概念](#核心概念)
- [实战指南](#实战指南)
- [踩坑记录](#踩坑记录)
- [总结](#总结)

---

## 核心概念

### 1. 镜像（Image）—— 模板/蓝图

**类比：** 镜像就像是一张**菜谱**📕，或者是一个**系统还原点**。

镜像是一个只读的模板，包含了运行应用程序所需的一切：
- 操作系统（如 Debian Bookworm）
- 运行时环境（如 Node.js 24）
- 应用代码
- 依赖库
- 配置文件

**在我们的 OpenClaw 项目中：**
```
镜像：1panel/openclaw:2026.4.21
基础镜像：node:24-bookworm（基于 Debian Bookworm + Node.js 24）
```

镜像是**不可变的**——一旦创建就不能修改。如果需要更新，就创建一个新版本的镜像。镜像名后面的 `:2026.4.21` 就是**标签（tag）**，表示版本号。

### 2. 容器（Container）—— 镜像的运行实例

**类比：** 如果镜像是菜谱，那容器就是**照着菜谱做出来的一道菜**🍲。

从一个镜像可以创建多个容器，就像同一张菜谱可以做出很多盘菜。每个容器都是独立运行的，有自己的文件系统、网络和进程空间。

**在我们的项目中：**
```
容器名：1Panel-openclaw-gFtw
来自镜像：1panel/openclaw:2026.4.21
状态：运行中（Up）
```

> 💡 **一句话总结：** 镜像是静态的模板，容器是动态的运行实例。镜像可以类比为"类（Class）"，容器可以类比为"对象（Object）"。

### 3. 卷（Volume）—— 持久化存储

**类比：** 容器就像是酒店房间🏨，退房后房间会被清空。卷就像是**保险箱**🔒，即使退房，保险箱里的东西还在。

容器默认是临时的——删除容器后，里面的文件就没了。但我们的配置文件、数据不能丢啊！所以需要**卷挂载**，把容器内的目录映射到宿主机的磁盘上。

**在我们的项目中：**
```yaml
volumes:
  - ./data/conf:/home/node/.openclaw          # 配置文件持久化
  - ./data/workspace:/home/node/.openclaw/workspace  # 工作区数据持久化
  - /etc/localtime:/etc/localtime             # 同步宿主机时区
```

这意味着：
- 容器里 `/home/node/.openclaw` 目录的内容，其实保存在宿主机的 `./data/conf` 中
- 即使容器被删除重建，数据依然存在
- 第三个挂载是把宿主机的时区信息传给容器，保证时间一致

### 4. 端口映射（Port Mapping）—— 网络桥梁

**类比：** 容器有自己的"内网电话号码"，但外面的人打不进来。端口映射就像是前台总机📞，把外部来电转接到内部分机。

**在我们的项目中：**
```
端口映射：0.0.0.0:18789 → 18789
```

这表示：
- 宿主机所有网卡（0.0.0.0）的 18789 端口
- 转发到容器内部的 18789 端口
- 任何人通过 `http://服务器IP:18789` 都能访问到容器内的 OpenClaw 服务

### 5. docker-compose.yml —— 编排说明书

**类比：** 如果 Docker 命令是**单个食材的处理**（切菜、炒菜），那 docker-compose 就是**整桌宴席的菜谱**📋——一道命令搞定所有菜。

`docker-compose.yml` 用声明式的方式定义了：
- 用什么镜像
- 怎么配置网络
- 挂载什么目录
- 映射什么端口
- 设置什么环境变量
- 健康检查怎么做

---

### OpenClaw 项目信息

OpenClaw 是一个运行在 Node.js 上的网关服务。我们的部署方式是通过 **1Panel** 面板进行 Docker 容器化管理。

### OpenClaw 容器信息一览

| 项目 | 值 |
|------|-----|
| **镜像** | `1panel/openclaw:2026.4.21` |
| **基础系统** | Node.js 24 + Debian Bookworm |
| **容器名** | `1Panel-openclaw-gFtw` |
| **服务端口** | 18789 |
| **运行用户** | `node`（非 root，更安全） |
| **网络** | `1panel-network` |
| **重启策略** | `unless-stopped`（除非手动停止，否则自动重启） |
| **启动命令** | `node openclaw.mjs gateway --allow-unconfigured` |
| **健康检查** | `curl/fetch http://127.0.0.1:18789/healthz` |
| **配置路径** | `/opt/your-app/docker-compose.yml` |

---

### 部署架构全景

下面是 OpenClaw Docker 部署的整体架构：

```
┌─────────────────────────────────────────────────────────────────────┐
│                        🖥️  宿主机 (Host Machine)                      │
│                                                                       │
│   ┌───────────────────────────────────────────────────────────────┐   │
│   │                    🐳 Docker Engine                           │   │
│   │                                                               │   │
│   │   ┌─────────────────────────────────────────────────────┐    │   │
│   │   │        📦 容器: 1Panel-openclaw-gFtw                 │    │   │
│   │   │                                                      │    │   │
│   │   │   基础镜像: 1panel/openclaw:2026.4.21                │    │   │
│   │   │   (node:24-bookworm)                                 │    │   │
│   │   │                                                      │    │   │
│   │   │   👤 运行用户: node                                   │    │   │
│   │   │                                                      │    │   │
│   │   │   🚀 启动进程:                                       │    │   │
│   │   │   /usr/local/bin/docker-entrypoint.sh                │    │   │
│   │   │     └── node openclaw.mjs gateway --allow-unconfigured│   │   │
│   │   │                                                      │    │   │
│   │   │   🌐 监听端口: 18789                                  │    │   │
│   │   │                                                      │    │   │
│   │   │   ❤️ 健康检查: fetch http://127.0.0.1:18789/healthz   │    │   │
│   │   │                                                      │    │   │
│   │   │   📂 文件挂载 (卷):                                    │    │   │
│   │   │   ┌──────────────────────────────────────────────┐   │    │   │
│   │   │   │ /home/node/.openclaw                         │   │    │   │
│   │   │   │     ↕ 映射到宿主机 ./data/conf               │   │    │   │
│   │   │   │                                              │   │    │   │
│   │   │   │ /home/node/.openclaw/workspace               │   │    │   │
│   │   │   │     ↕ 映射到宿主机 ./data/workspace          │   │    │   │
│   │   │   │                                              │   │    │   │
│   │   │   │ /etc/localtime                               │   │    │   │
│   │   │   │     ↕ 映射到宿主机 /etc/localtime             │   │    │   │
│   │   │   └──────────────────────────────────────────────┘   │    │   │
│   │   └─────────────────────────────────────────────────────┘    │   │
│   │                                                               │   │
│   │   ┌─────────────────────────────────────────────┐             │   │
│   │   │   🌐 Docker 网络: 1panel-network             │             │   │
│   │   │   └── 容器通过此网络与其他 1Panel 管理的     │             │   │
│   │   │       容器互通                               │             │   │
│   │   └─────────────────────────────────────────────┘             │   │
│   └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
│   宿主机端口: 0.0.0.0:18789 ──────→ 容器端口: 18789                    │
│                                                                       │
│   📁 宿主机磁盘目录:                                                   │
│   /opt/your-app/                                 │
│   ├── docker-compose.yml          ← 编排配置文件                       │
│   └── data/                       ← 持久化数据                        │
│       ├── conf/                   ← OpenClaw 配置                     │
│       └── workspace/              ← 工作区数据                         │
└─────────────────────────────────────────────────────────────────────┘
```

### 请求流转过程

```
用户浏览器                宿主机                    Docker 容器
    │                        │                          │
    │  http://IP:18789       │                          │
    │ ─────────────────────→ │                          │
    │                        │  iptables/NAT 转发        │
    │                        │  0.0.0.0:18789 → 18789   │
    │                        │ ────────────────────────→ │
    │                        │                          │ node openclaw.mjs
    │                        │                          │ 处理请求...
    │                        │  ←────────────────────── │
    │                        │  响应数据                 │
    │  ←──────────────────── │                          │
    │  页面内容/JSON          │                          │
```

---

## 实战指南

让我们逐行解析这个 docker-compose 配置文件：

```yaml
version: "3.8"

services:
  openclaw:
    image: 1panel/openclaw:2026.4.21          # 使用的 Docker 镜像及版本标签
    container_name: 1Panel-openclaw-gFtw      # 容器的名称（便于识别）
    restart: unless-stopped                    # 重启策略
    user: node                                 # 以 node 用户运行（非 root）
    networks:
      - 1panel-network                         # 加入 1panel-network 网络
    ports:
      - "0.0.0.0:18789:18789"                 # 端口映射
    volumes:
      - ./data/conf:/home/node/.openclaw       # 配置目录挂载
      - ./data/workspace:/home/node/.openclaw/workspace  # 工作区挂载
      - /etc/localtime:/etc/localtime          # 时区同步
    entrypoint:
      - /usr/local/bin/docker-entrypoint.sh    # 入口点脚本
    command:
      - node
      - openclaw.mjs
      - gateway
      - --allow-unconfigured                  # 启动命令及参数
    healthcheck:
      test: ["CMD", "fetch", "http://127.0.0.1:18789/healthz"]
      interval: 30s                            # 每 30 秒检查一次
      timeout: 10s                             # 超时时间 10 秒
      retries: 3                               # 连续失败 3 次视为不健康
      start_period: 10s                        # 启动后等 10 秒再开始检查

networks:
  1panel-network:
    external: true                             # 使用已存在的外部网络
```

### 逐项深度解析

### `image: 1panel/openclaw:2026.4.21`

指定使用的 Docker 镜像。这个镜像的完整名称包含三部分：
- **仓库地址**：省略了默认的 `docker.io/`（Docker Hub）
- **镜像名**：`1panel/openclaw`
- **标签**：`:2026.4.21`（版本号，类似 Git 的 tag）

镜像的基础构建层：
```
1panel/openclaw:2026.4.21
    └── 基于 node:24-bookworm
            └── 基于 debian:bookworm
                    └── 基于 scratch（Docker 最小基础镜像）
```

Docker 镜像采用**分层存储**，每一层只记录与上一层的差异，大大节省磁盘空间。

### `restart: unless-stopped`

重启策略决定了容器在退出后是否自动重启：

| 策略 | 说明 |
|------|------|
| `no` | 默认值，不自动重启 |
| `always` | 总是自动重启（包括手动停止后 Docker 重启时） |
| `on-failure` | 只在非正常退出（退出码非0）时重启 |
| `unless-stopped` | 总是自动重启，除非是手动 `docker stop` 停止的 |

OpenClaw 使用 `unless-stopped` 是一个很好的选择——服务器重启后容器会自动恢复运行，但如果你手动停止了它，Docker 不会自作主张地帮你重启。

### `user: node`

以非 root 用户运行容器内的进程。这是一个**安全最佳实践** ✅：
- 即使容器被攻破，攻击者也只有普通用户的权限
- 防止容器内的恶意进程修改系统文件
- OpenClaw 镜像内置了 `node` 用户

### `ports: "0.0.0.0:18789:18789"`

端口映射格式：`[宿主机IP:]宿主机端口:容器端口[/协议]`

```
0.0.0.0:18789:18789
│        │      │
│        │      └── 容器内部端口
│        └───────── 宿主机暴露端口
└────────────────── 绑定所有网络接口
```

- `0.0.0.0` 表示监听所有网络接口（所有人都能访问）
- 如果写成 `127.0.0.1:18789:18789`，则只有本机可以访问
- 如果写成 `18789:18789`，默认等同于 `0.0.0.0:18789:18789`

### `volumes` 卷挂载详解

```yaml
volumes:
  - ./data/conf:/home/node/.openclaw
  - ./data/workspace:/home/node/.openclaw/workspace
  - /etc/localtime:/etc/localtime
```

**前两个是"绑定挂载"（Bind Mounts）**：

```
宿主机目录                容器目录
./data/conf      ←→      /home/node/.openclaw
./data/workspace  ←→      /home/node/.openclaw/workspace
```

这是**双向映射**——在容器内修改文件，宿主机上也能看到；反之亦然。这样即使容器被删除重建，只要指向同一个宿主机目录，数据就还在。

**第三个是只读时区同步**：
```
/etc/localtime   ←→      /etc/localtime
```
让容器和宿主机使用相同的时区设置，确保日志时间、定时任务等时间一致。

> ⚠️ **注意**：`./data/conf` 这里的 `.` 指的是 docker-compose.yml 所在的目录，即 `/opt/your-app/`。

### `entrypoint` 与 `command`

```yaml
entrypoint:
  - /usr/local/bin/docker-entrypoint.sh
command:
  - node
  - openclaw.mjs
  - gateway
  - --allow-unconfigured
```

**entrypoint** 是容器启动时**必定执行**的入口程序（通常是初始化脚本）。
**command** 是传给 entrypoint 的参数。

最终执行的命令相当于：
```bash
/usr/local/bin/docker-entrypoint.sh node openclaw.mjs gateway --allow-unconfigured
```

`docker-entrypoint.sh` 通常负责：
- 环境变量初始化
- 权限设置
- 依赖检查
- 最后 `exec` 执行真正的业务命令

`--allow-unconfigured` 参数允许服务在未完成配置时也能启动，方便初次部署。

### `healthcheck` 健康检查

```yaml
healthcheck:
  test: ["CMD", "fetch", "http://127.0.0.1:18789/healthz"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 10s
```

Docker 会定期向容器内的 `http://127.0.0.1:18789/healthz` 发送请求：
- 如果返回成功（HTTP 200），容器状态为 `healthy` ✅
- 如果连续 3 次失败，状态变为 `unhealthy` ❌
- 启动后有 10 秒的缓冲期，这段时间内不计入检查

> 💡 健康检查不影响容器运行，但可以被其他监控系统（如 1Panel）利用来自动处理故障。

### `networks: 1panel-network (external: true)`

```yaml
networks:
  1panel-network:
    external: true
```

- `1panel-network` 是一个预创建的 Docker 网络
- `external: true` 表示这个网络不是由本 compose 文件创建的，而是已经存在的
- 同一网络内的容器可以通过**容器名互相访问**

例如，如果还有另一个容器 `nginx` 也在 `1panel-network` 中，它可以访问 `http://1Panel-openclaw-gFtw:18789`。

---

### 常用命令速查

### 查看类命令

### 查看运行中的容器
```bash
docker ps
```

输出示例：
```
CONTAINER ID   IMAGE                          COMMAND                  STATUS                  NAMES
a1b2c3d4e5f6   1panel/openclaw:2026.4.21     "/usr/local/bin/doc…"   Up 3 days (healthy)     1Panel-openclaw-gFtw
```

常用参数：
```bash
docker ps              # 只显示运行中的容器
docker ps -a           # 显示所有容器（包括已停止的）
docker ps -q           # 只显示容器 ID（适合脚本使用）
docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"  # 自定义输出格式
```

### 查看镜像
```bash
docker images                          # 列出本地所有镜像
docker images 1panel/openclaw          # 过滤查看特定镜像
```

### 查看容器详细信息
```bash
docker inspect 1Panel-openclaw-gFtw    # 查看容器完整配置信息（JSON 格式）
docker inspect --format '{{.State.Status}}' 1Panel-openclaw-gFtw  # 查看容器状态
```

### 启动/停止类命令

```bash
# 使用 docker-compose 管理（推荐方式，因为配置都在 docker-compose.yml 中）
cd /opt/your-app/

docker compose up -d        # 后台启动所有服务（-d = detached，后台运行）
docker compose down          # 停止并移除容器和网络
docker compose restart       # 重启服务
docker compose stop          # 只停止容器，不移除
docker compose start         # 启动已停止的容器
docker compose pull          # 拉取最新镜像
docker compose up -d --force-recreate  # 强制重建容器（镜像有更新时使用）

# 也可以直接用 docker 命令操作单个容器
docker stop 1Panel-openclaw-gFtw       # 停止容器
docker start 1Panel-openclaw-gFtw      # 启动容器
docker restart 1Panel-openclaw-gFtw    # 重启容器
docker rm 1Panel-openclaw-gFtw         # 删除已停止的容器
```

### 日志类命令

```bash
docker logs 1Panel-openclaw-gFtw              # 查看全部日志
docker logs -f 1Panel-openclaw-gFtw           # 实时跟踪日志（-f = follow）
docker logs --tail 100 1Panel-openclaw-gFtw   # 只看最后 100 行
docker logs --since 1h 1Panel-openclaw-gFtw   # 看最近 1 小时的日志
docker logs --since 2026-04-20T00:00:00 1Panel-openclaw-gFtw  # 看指定时间之后的日志
```

### 健康检查与状态

```bash
docker inspect --format='{{.State.Health.Status}}' 1Panel-openclaw-gFtw
# 输出: healthy / unhealthy / starting

docker inspect --format='{{json .State.Health}}' 1Panel-openclaw-gFtw | python3 -m json.tool
# 查看详细的健康检查历史记录
```

---

### 容器内操作

### 进入容器

```bash
docker exec -it 1Panel-openclaw-gFtw bash
```

参数说明：
- `exec`：在运行中的容器内执行命令
- `-i`：交互模式（interactive）
- `-t`：分配伪终端（tty）
- `bash`：要执行的命令（启动 bash shell）

进入后你会看到类似：
```
node@a1b2c3d4e5f6:~$ 
```

> 💡 **注意**：因为我们设置了 `user: node`，所以默认进入时就是 `node` 用户，不是 root。

### 在容器内探索

```bash
# 查看当前用户
whoami                                    # 输出: node

# 查看 OpenClaw 工作目录
ls -la /home/node/.openclaw/              # 查看配置目录
ls -la /home/node/.openclaw/workspace/    # 查看工作区

# 查看进程
ps aux                                    # 查看容器内所有进程
ps aux | grep openclaw                    # 查找 openclaw 相关进程

# 查看网络
cat /etc/hosts                            # 查看 hosts 文件
env                                       # 查看所有环境变量

# 退出容器
exit
```

### 不进入容器直接执行命令

有时候你不需要进入交互式 shell，直接在容器外执行命令更高效：

```bash
# 查看容器内的文件
docker exec 1Panel-openclaw-gFtw ls -la /home/node/.openclaw/

# 在容器内执行单条命令
docker exec 1Panel-openclaw-gFtw cat /home/node/.openclaw/config.yaml

# 查看容器内 Node.js 版本
docker exec 1Panel-openclaw-gFtw node --version

# 以 root 用户进入（如果需要更高权限）
docker exec -it -u root 1Panel-openclaw-gFtw bash

# 复制文件：宿主机 → 容器
docker cp ./my-config.yaml 1Panel-openclaw-gFtw:/home/node/.openclaw/config.yaml

# 复制文件：容器 → 宿主机
docker cp 1Panel-openclaw-gFtw:/home/node/.openclaw/config.yaml ./backup-config.yaml
```

> 💡 因为我们有卷挂载，修改配置文件也可以直接在宿主机上操作：
> ```bash
> # 直接在宿主机编辑配置（效果等同于在容器内编辑）
> vim /opt/your-app/data/conf/config.yaml
> ```

---

### 日志排查与健康检查

### 排查 OpenClaw 服务异常

当 OpenClaw 服务出现问题时，按以下步骤排查：

### 第一步：检查容器状态
```bash
docker ps -a | grep openclaw
```

可能的状态：
| 状态 | 含义 | 处理方式 |
|------|------|---------|
| `Up (healthy)` | 正常运行 | 无需处理 ✅ |
| `Up (unhealthy)` | 运行但不健康 | 查看日志 ❓ |
| `Exited (1)` | 已退出（错误退出） | 查看日志并重启 ❌ |
| `Restarting` | 反复重启中 | 查看日志找原因 ❌ |

### 第二步：查看日志
```bash
# 查看最近 50 行日志
docker logs --tail 50 1Panel-openclaw-gFtw

# 实时跟踪日志（调试时很有用）
docker logs -f 1Panel-openclaw-gFtw
```

### 第三步：检查网络连通性
```bash
# 在宿主机上测试服务是否响应
curl http://127.0.0.1:18789/healthz

# 查看端口是否被占用
ss -tlnp | grep 18789
# 或
netstat -tlnp | grep 18789
```

### 第四步：检查资源占用
```bash
# 查看容器资源使用情况
docker stats 1Panel-openclaw-gFtw --no-stream

# 输出示例：
# CONTAINER ID   NAME                     CPU %   MEM USAGE / LIMIT   MEM %   NET I/O         BLOCK I/O
# a1b2c3d4e5f6   1Panel-openclaw-gFtw    0.15%   128.5MiB / 2GiB     6.28%   1.2MB / 856kB   12.3MB / 0B
```

### 第五步：终极调试——进入容器排查
```bash
docker exec -it 1Panel-openclaw-gFtw bash

# 检查配置文件是否正确
cat /home/node/.openclaw/config.yaml

# 测试网络
curl http://127.0.0.1:18789/healthz

# 检查磁盘空间
df -h

# 检查文件权限
ls -la /home/node/.openclaw/
```

### 容器自动重启失败的处理

如果容器反复重启（`Restarting` 状态）：

```bash
# 1. 停止容器
docker stop 1Panel-openclaw-gFtw

# 2. 检查日志找原因
docker logs --tail 200 1Panel-openclaw-gFtw

# 3. 修复问题后重新启动
docker start 1Panel-openclaw-gFtw

# 4. 如果需要重建容器
cd /opt/your-app/
docker compose down
docker compose up -d
```

---

## 踩坑记录

### 推荐做法

### 1. 镜像更新流程

当 OpenClaw 发布新版本时：

```bash
cd /opt/your-app/

# 方式一：拉取新镜像并重建
docker compose pull                    # 拉取最新镜像
docker compose up -d --force-recreate  # 用新镜像重建容器

# 方式二：修改 docker-compose.yml 中的版本号
# 将 image: 1panel/openclaw:2026.4.21 改为 image: 1panel/openclaw:2026.5.1
# 然后执行：
docker compose pull
docker compose up -d
```

> 💡 **更新前务必备份数据！**
> ```bash
> cp -r /opt/your-app/data /opt/your-app/data.backup.$(date +%Y%m%d)
> ```

### 2. 数据备份策略

```bash
# 备份配置和数据
BACKUP_DIR="/backup/openclaw/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r /opt/your-app/data "$BACKUP_DIR/"

# 可以加入 crontab 定期自动备份
# crontab -e
# 0 2 * * * cp -r /opt/your-app/data /backup/openclaw/$(date +\\\\\\\\%Y\\\\\\\\%m\\\\\\\\%d)
```

### 3. 安全建议

- ✅ 使用非 root 用户运行（OpenClaw 已经这样做了：`user: node`）
- ✅ 不要在 docker-compose.yml 中硬编码密码，使用 `.env` 文件
- ✅ 生产环境考虑使用 `127.0.0.1:18789:18789` 配合反向代理（Nginx）
- ✅ 定期更新镜像以获取安全补丁
- ✅ 不需要的端口不要暴露

### 4. 资源限制

在 docker-compose.yml 中添加资源限制：

```yaml
services:
  openclaw:
    # ... 其他配置 ...
    deploy:
      resources:
        limits:
          cpus: '2.0'          # 最多使用 2 个 CPU 核心
          memory: 1G           # 最多使用 1GB 内存
        reservations:
          cpus: '0.5'          # 至少保留 0.5 个 CPU
          memory: 256M         # 至少保留 256MB 内存
```

### 常见坑点

### 坑 1：容器内时间与宿主机不一致
**解决：** 挂载 `/etc/localtime`（OpenClaw 配置中已包含）
```yaml
volumes:
  - /etc/localtime:/etc/localtime:ro   # ro = read-only
```

### 坑 2：删除容器后数据丢失
**原因：** 数据没有持久化到卷中
**解决：** 确保重要目录都有卷挂载，像 OpenClaw 的 `./data/conf` 配置

### 坑 3：端口冲突
```
Error: Bind for 0.0.0.0:18789 failed: port is already allocated
```
**解决：**
```bash
# 查看是谁占用了端口
ss -tlnp | grep 18789
# 停止占用端口的服务，或修改 docker-compose.yml 中的端口映射
```

### 坑 4：权限问题
```
Permission denied
```
**原因：** 容器内用户（node）没有权限访问某些文件
**解决：**
```bash
# 在宿主机上修改文件权限
chown -R 1000:1000 /opt/your-app/data/
# 1000 通常是容器内 node 用户的 UID
```

### 坑 5：Docker 磁盘空间不足
```bash
# 查看 Docker 磁盘使用
docker system df

# 清理未使用的镜像、容器、网络
docker system prune

# 彻底清理（包括未使用的镜像，⚠️ 谨慎使用）
docker system prune -a
```

### 实用命令速查表

```
┌──────────────────────────────────────────────────────────────────┐
│                    🐳 Docker 命令速查表                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📋 查看                                                          │
│  docker ps                           查看运行中容器               │
│  docker ps -a                        查看所有容器                  │
│  docker images                       查看所有镜像                  │
│  docker stats                        查看资源使用                  │
│                                                                  │
│  🚀 生命周期                                                       │
│  docker compose up -d                后台启动                      │
│  docker compose down                 停止并移除                    │
│  docker compose restart              重启                          │
│  docker compose pull                 拉取最新镜像                  │
│  docker compose logs -f              查看日志                      │
│                                                                  │
│  🔧 操作                                                           │
│  docker exec -it <容器名> bash       进入容器                      │
│  docker logs -f <容器名>             实时日志                      │
│  docker logs --tail 100 <容器名>     最近100行日志                 │
│  docker cp <容器名>:<路径> <本地>    从容器复制文件                 │
│  docker cp <本地> <容器名>:<路径>    复制文件到容器                 │
│                                                                  │
│  🧹 清理                                                           │
│  docker system prune                 清理无用资源                  │
│  docker image prune                  清理无用镜像                  │
│  docker volume prune                 清理无用卷                    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 总结

### 核心收获

通过 OpenClaw 的实际 Docker 部署，我们学习了：

| 知识点 | 对应的 OpenClaw 实践 |
|--------|---------------------|
| Docker 镜像 | `1panel/openclaw:2026.4.21` |
| Docker 容器 | `1Panel-openclaw-gFtw` |
| 端口映射 | `0.0.0.0:18789 → 18789` |
| 卷挂载 | `./data/conf:/home/node/.openclaw` |
| docker-compose | 完整的编排配置 |
| 健康检查 | `fetch http://127.0.0.1:18789/healthz` |
| 安全实践 | `user: node` 非 root 运行 |
| 重启策略 | `unless-stopped` |
| 网络 | `1panel-network` 容器互通 |
| 常用命令 | exec, logs, compose up/down |

### 延伸阅读

```
你在这里 ⭐
    │
    ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  📖 Dockerfile   │     │  🌐 Docker       │     │  🎼 Docker       │
│  编写自定义镜像  │ ──→ │  网络深入学习    │ ──→ │  Swarm / K8s     │
│                 │     │  (bridge/host/   │     │  集群编排        │
│  FROM, RUN,     │     │   overlay)       │     │                  │
│  CMD, COPY...   │     │                  │     │                  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                        │                       │
         ▼                        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  📦 多阶段构建   │     │  🔒 Docker       │     │  ☁️ 云原生        │
│  优化镜像大小    │     │  安全最佳实践    │     │  CI/CD 流水线    │
│                 │     │  Seccomp,        │     │  GitOps,         │
│                 │     │  AppArmor...     │     │  Helm Charts     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### 延伸阅读

- 📘 [Docker 官方文档](https://docs.docker.com/)——最权威的参考
- 📗 [Docker — 从入门到实践](https://yeasy.gitbook.io/docker_practice/)——优秀的中文社区版教程
- 📙 [Play with Docker](https://labs.play-with-docker.com/)——在线练习 Docker 环境
- 📕 [1Panel 官方文档](https://1panel.cn/docs/)——你正在使用的面板文档

---

*本文基于 OpenClaw Docker 实际部署环境编写，配置路径：`/opt/your-app/docker-compose.yml`*