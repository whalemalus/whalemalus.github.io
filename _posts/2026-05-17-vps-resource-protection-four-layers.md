---
layout: post
title: "3.8GB 小内存 VPS 的四层资源防护体系"
date: 2026-05-17
categories: DevOps
tags: ["Docker", "Linux", "DevOps"]
excerpt: "当你的服务器只有3.8GB内存却跑着8个Docker容器时，四层防护方案让你不再担心卡死。"
image: "https://whalemalus.com/file/cover-vps-resource-protection-key"
header:
  teaser: "https://whalemalus.com/file/cover-vps-resource-protection-key"
  overlay_image: "https://whalemalus.com/file/cover-vps-resource-protection-key"
original_url: "https://whalemalus.com/articles/vps-resource-protection-four-layers"
---

# 3.8GB 小内存 VPS 的四层资源防护体系

> 当你的服务器只有 3.8GB 内存，却跑着 8 个 Docker 容器时，随时可能因为内存耗尽而卡死。本文分享一套实战验证的四层防护方案。

## 楔子

一台 3.8GB 内存的 VPS，部署了 DocMind、AxonHub、DimStack、PinchTab、Nginx Proxy Manager、Hermes Agent、Claude Code 等多个服务。内存使用率常年在 90% 以上，随时可能因为 OOM Killer 随机杀死关键进程，甚至服务器直接卡死需要硬重启。

这不是理论推演，是真实生产环境的日常。本文记录了从「每天提心吊胆」到「稳定运行」的完整防护方案。

## 引言

本文介绍一套在 3.8GB 内存 VPS 上经过实战验证的四层资源防护体系：earlyoom 守护进程（L1）、Docker 容器内存硬限制（L2）、智能看门狗自动暂停/恢复（L3）、Docker 日志轮转限制（L4）。每层解决不同粒度的资源问题，组合使用后系统稳定性显著提升。

## 目录

- [问题背景](#问题背景)
- [解决方案：四层防护](#解决方案四层防护)
- [整体架构](#整体架构)
- [验证效果](#验证效果)
- [关键经验](#关键经验)
- [相关工具](#相关工具)
- [总结](#总结)

## 问题背景

一台 3.8GB 内存的 VPS，部署了多个服务：

| 服务 | 用途 | 内存占用 |
|------|------|----------|
| DocMind | AI 文档助手 | ~60MB（空闲）→ 峰值可达 500MB+ |
| AxonHub | API 网关 | ~50MB（空闲）→ CPU 密集时飙升 |
| DimStack | 博客系统 | ~300MB + MySQL + Redis |
| PinchTab | 浏览器自动化 | ~170MB |
| Nginx Proxy Manager | 反向代理 | ~85MB |
| Hermes Agent | AI Agent | 由系统管理 |
| Claude Code | AI 编码助手 | 由系统管理 |

**核心矛盾**：所有容器都没有内存限制，任何一个服务的内存峰值都可能吃光所有内存，导致 OOM Killer 随机杀死进程（可能是关键服务），甚至服务器直接卡死需要重启。

## 解决方案：四层防护

### L1: earlyoom — 优雅的 OOM 守护进程

**问题**：Linux 默认的 OOM Killer 在内存完全耗尽时才触发，此时系统往往已经卡死，连 SSH 都连不上。

**方案**：[earlyoom](https://github.com/rfjakob/earlyoom)（⭐ 4000+）在内存还有余量时就主动终止最耗内存的进程，避免系统完全卡死。

```bash
# 安装
apt-get install -y earlyoom

# 配置保护名单（这些进程不会被杀死）
cat > /etc/default/earlyoom << 'EOF'
# 内存剩余 <10% 且 Swap 剩余 <10% 时触发
EARLYOOM_ARGS="-m 10 -s 10 --avoid 'hermes|claude|node|python.*hermes' --prefer '.*'"
EOF

# 启动并设为开机自启
systemctl enable --now earlyoom
```

**关键参数**：
- `-m 10`：内存剩余 <10% 时触发
- `-s 10`：Swap 剩余 <10% 时触发
- `--avoid`：保护名单，匹配的进程不会被优先杀死
- `--prefer`：优先回收名单

### L2: Docker 容器内存硬限制

**问题**：Docker 容器默认不限制内存，可以无限制地消耗宿主机内存。

**方案**：为每个容器设置 `--memory` 和 `--memory-swap` 限制。

```bash
# 为容器设置内存限制（运行时修改，无需重建）
docker update --memory=512m --memory-swap=768m docmind
docker update --memory=800m --memory-swap=1g axonhub-app
docker update --memory=512m --memory-swap=768m dimstack-app
docker update --memory=256m --memory-swap=512m dimstack-mysql
docker update --memory=128m --memory-swap=256m dimstack-redis
docker update --memory=512m --memory-swap=768m pinchtab
docker update --memory=256m --memory-swap=512m nginx-proxy-manager
docker update --memory=128m --memory-swap=256m docmind-redis
```

**内存分配策略**（总 3.8GB）：

| 容器 | 内存上限 | Swap 上限 | 设计思路 |
|------|----------|-----------|----------|
| 系统预留 | ~800MB | — | OS + Hermes + Claude Code |
| AxonHub | 800MB | 1GB | CPU 密集型，需要较多内存 |
| DocMind | 512MB | 768MB | 不常用时可暂停 |
| PinchTab | 512MB | 768MB | 测试完可暂停 |
| DimStack App | 512MB | 768MB | 博客应用 |
| MySQL | 256MB | 512MB | 数据库 |
| Nginx | 256MB | 512MB | 反向代理 |
| Redis ×2 | 128MB | 256MB | 缓存，占用小 |

**关键点**：
- `--memory` 是硬限制，超过会触发容器内 OOM Kill
- `--memory-swap` 包含内存 + Swap 总量
- 设置后**立即生效**，不需要重启容器
- 容器被 OOM Kill 后，Docker 会根据重启策略自动重启

### L3: 智能看门狗 — 自动暂停/恢复容器

**问题**：即使设了内存限制，多个容器同时运行仍然可能逼近系统极限。而且很多容器（如 DocMind、PinchTab）并非 24 小时都需要运行。

**方案**：一个 cron 定时任务，每 5 分钟检查资源使用率，自动暂停非核心容器。

```bash
#!/bin/bash
# /opt/scripts/resource-watchdog.sh
# 每 5 分钟由 cron 执行

MEM_THRESHOLD=85    # 内存使用率阈值
SWAP_THRESHOLD=70   # Swap 使用率阈值
CPU_THRESHOLD=90    # CPU 使用率阈值

# 获取使用率
get_mem_usage() { free | awk '/Mem:/ {printf "%.0f", $3/$2 * 100}'; }
get_swap_usage() { free | awk '/Swap:/ {if($2>0) printf "%.0f", $3/$2 * 100; else print 0}'; }

MEM=$(get_mem_usage)
SWAP=$(get_swap_usage)

# 保护名单：这些容器绝不暂停
is_protected() {
    case "$1" in
        *nginx-proxy*|*mysql*|*redis*) return 0 ;;
        *) return 1 ;;
    esac
}

# 需要回收时，暂停最大可回收容器
if [ "$MEM" -ge "$MEM_THRESHOLD" ] || [ "$SWAP" -ge "$SWAP_THRESHOLD" ]; then
    for container in $(docker stats --no-stream --format "{{.Name}}\\\\t{{.MemPerc}}" | \\\\
        while IFS=$'\\\\t' read name mem; do
            is_protected "$name" || echo "$(echo $mem | tr -d '%') $name"
        done | sort -rn | awk '{print $2}'); do
        docker pause "$container"
        # 暂停一个后检查是否够了
        [ "$(get_mem_usage)" -lt 75 ] && break
    done
fi

# 内存充足时恢复暂停的容器
if [ "$MEM" -lt 65 ] && [ -f /tmp/watchdog-paused-containers ]; then
    while read container; do
        docker unpause "$container" 2>/dev/null
    done < /tmp/watchdog-paused-containers
    rm -f /tmp/watchdog-paused-containers
fi
```

设置 cron：
```bash
chmod +x /opt/scripts/resource-watchdog.sh
(crontab -l; echo "*/5 * * * * /opt/scripts/resource-watchdog.sh") | crontab -
```

**自动行为**：
- 内存 >85% → 暂停最大可回收容器（按内存排序）
- 内存 <65% → 自动恢复暂停的容器
- 保护名单内的容器（Nginx、MySQL、Redis）永远不会被暂停

### L4: Docker 日志限制

**问题**：Docker 容器日志默认不限制大小，长时间运行可能吃满磁盘。

**方案**：

```json
// /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

每个容器最多保留 3 个 10MB 的日志文件（共 30MB），超过自动轮转。

```bash
# 重启 Docker 生效（会短暂中断所有容器）
systemctl restart docker
```

## 整体架构

```
┌─────────────────────────────────────────────────┐
│                   应用层                          │
│  DocMind  AxonHub  DimStack  PinchTab  Nginx    │
│  (512M)   (800M)   (512M)   (512M)   (256M)    │
├─────────────────────────────────────────────────┤
│ L2: Docker Memory Limit (硬限制)                 │
│  每个容器有独立内存上限，超限触发容器内 OOM Kill    │
├─────────────────────────────────────────────────┤
│ L3: Resource Watchdog (智能看门狗, cron 5min)    │
│  内存>85% → 暂停非核心容器                        │
│  内存<65% → 自动恢复                              │
├─────────────────────────────────────────────────┤
│ L1: earlyoom (OOM 守护进程)                      │
│  内存<10% → 杀死最耗内存进程(保护 hermes/claude)  │
├─────────────────────────────────────────────────┤
│ L4: Docker Log Rotation (日志轮转)               │
│  每容器最大 30MB，防磁盘写满                       │
├─────────────────────────────────────────────────┤
│                   宿主机                          │
│  3.8GB RAM + 2GB Swap                            │
│  系统预留 ~800MB (OS + Hermes + Claude Code)      │
└─────────────────────────────────────────────────┘
```

## 验证效果

部署后，通过 `docker stats` 观察：

```
NAME                    CPU %   MEM USAGE / LIMIT    MEM %
docmind                 0.18%   62.89MiB / 512MiB    12.3%
axonhub-app             52.25%  496MiB / 800MiB      62.0%
dimstack-app            0.30%   306.8MiB / 512MiB    59.9%
pinchtab                4.50%   172.4MiB / 512MiB    33.7%
nginx-proxy             0.14%   84.54MiB / 256MiB    33.0%
dimstack-mysql          1.01%   56.88MiB / 256MiB    22.2%
```

内存使用率从之前的 90%+ 降到稳定在 50-60%，Swap 使用也明显下降。

## 关键经验

1. **Docker 容器必须设内存限制**：默认不限制是最大的隐患
2. **earlyoom 比默认 OOM Killer 更可靠**：在系统卡死前就介入
3. **暂停比杀死更优雅**：`docker pause` 保留容器状态，恢复后无缝继续
4. **保护名单很重要**：Nginx、MySQL、Redis 这类基础设施不能被暂停
5. **日志必须限制**：Docker 日志是隐形的磁盘杀手
6. **Swap 是最后防线**：2GB Swap 配合 3.8GB RAM，给了系统足够的缓冲

## 相关工具

- [earlyoom](https://github.com/rfjakob/earlyoom) — Early OOM Daemon for Linux（⭐ 4000+）
- [Docker resource constraints](https://docs.docker.com/config/containers/resource_constraints/) — Docker 官方资源限制文档
- [cgroups v2](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html) — Linux 内核资源控制

## 总结

3.8GB 内存跑 8 个 Docker 容器，核心在于四层防护的组合使用：L1 earlyoom 在系统层面兜底、L2 Docker 内存硬限制隔离每个容器、L3 智能看门狗自动调度非核心服务、L4 日志轮转防止磁盘隐患。内存使用率从 90%+ 降到 50-60%，系统稳定运行。关键经验：容器必须设内存限制、暂停比杀死更优雅、保护名单不可省略。

---

*本文基于真实生产环境实践，服务器配置：3.8GB RAM / 2GB Swap / Ubuntu 24.04。方案已在生产环境稳定运行。*