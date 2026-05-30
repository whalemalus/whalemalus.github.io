---
layout: post
title: "DocMind Docker 部署调试实录：四个让人抓狂的 Bug 与解法"
date: 2026-05-18
categories: DevOps
tags: ["Docker", "Vue 3", "Bug 排查", "DevOps"]
excerpt: "在将 DocMind 部署到 Docker 容器时，连续遭遇四个诡异 Bug——静态服务器不代理 API、容器认证不同步、LLM 网关 504、SSE 流式阻塞。本文记录排查过程和解法。"
image: "https://whalemalus.com/file/cover-docmind-docker-debug-key"
header:
  teaser: "https://whalemalus.com/file/cover-docmind-docker-debug-key"
  overlay_image: "https://whalemalus.com/file/cover-docmind-docker-debug-key"
original_url: "https://whalemalus.com/articles/docmind-docker-deploy-debugging"
---

# DocMind Docker 部署调试实录：四个让人抓狂的 Bug 与解法

> **摘要**：在将 DocMind 文档管理系统部署到 Docker 容器时，连续遭遇四个诡异 Bug，静态服务器不代理 API 导致白屏、源码与容器认证状态不同步、上游 LLM 网关 504 超时、SSE 流式响应无限阻塞。本文记录每个问题的排查过程和最终解法。
>
> **关键词**：`Docker` `Vue 3` `FastAPI` `反向代理` `LLM 网关`

---

## 楔子

周五凌晨三点，我盯着浏览器里一片空白的 DocMind 页面，心里只有一个念头：代码明明是对的，为什么跑起来就不行？

本地开发一切正常，`npm run dev` 启动后功能完好。可一旦放进 Docker 容器，所有 API 请求都像石沉大海，没有报错，没有 404，只有无尽的白屏。这不是代码的错，是部署的错。而部署的错，往往比代码的错更难找。

## 引言

DocMind 是一个基于 Vue 3 + FastAPI 的文档管理系统，支持文档摘要、问答、知识图谱等 AI 功能。本地开发阶段一切顺利，但当我把它打包进 Docker 容器部署到服务器后，接连踩了四个坑。

这四个坑各有各的诡异之处：一个是静态文件服务器的"善意"行为，一个是容器内外代码版本不一致，一个是上游服务的间歇性故障，还有一个是流式协议的兼容性问题。它们看似独立，实则共同指向一个道理，**Docker 部署不是简单的"打包运行"，环境差异会放大每一个被忽视的细节**。

---


## 目录

- [楔子](#楔子)
- [引言](#引言)
- [全景地图](#全景地图)
- [核心概念](#核心概念)
- [实战指南](#实战指南)
- [踩坑记录](#踩坑记录)
- [总结](#总结)

## 目录

1. [全景地图](#全景地图)
2. [核心概念](#核心概念)
3. [实战指南](#实战指南)
4. [踩坑记录](#踩坑记录)
5. [总结与展望](#总结与展望)

---

## 全景地图

>  DocMind Docker 部署的完整架构，理解各组件之间的关系

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│                    用户浏览器                            │
│              http://localhost:3000                       │
└──────────────────────┬──────────────────────────────────┘
                       │
           ┌───────────▼───────────┐
           │   Vite Dev Server     │
           │   (前端开发服务器)     │
           │   port 3000           │
           │   /api → :7860        │
           └───────────┬───────────┘
                       │ proxy
           ┌───────────▼───────────┐
           │   FastAPI Backend     │
           │   (Docker Container)  │
           │   port 7860           │
           │   docmind-docmind     │
           └───┬───────────────┬───┘
               │               │
    ┌──────────▼──┐    ┌───────▼────────┐
    │ Redis Cache  │    │  LLM Gateway   │
    │ port 6379    │    │  (fufu.iqach)  │
    │ docmind-     │    │  mimo-2.5-pro  │
    │ redis        │    │  间歇性 504    │
    └──────────────┘    └────────────────┘
```

### 四个 Bug 的位置

```
Bug 1: Vite Dev Server vs npx serve -s  ← 前端代理层
Bug 2: auth.py 源码 vs 容器版本        ← 认证层
Bug 3: LLM Gateway 504                 ← 上游服务层
Bug 4: SSE 流式阻塞                    ← 协议层
```

### 本文的学习路径

```
Bug 1 (白屏) → Bug 2 (401) → Bug 3 (504) → Bug 4 (挂起)
     ↓              ↓             ↓              ↓
  代理配置      容器同步       网关降级       协议兼容
```

---

## 核心概念

### 1. 静态服务器 vs 开发服务器

`npx serve -s` 是一个纯静态文件服务器，它的工作就是把文件原样返回给浏览器。当请求 `/api/v1/status` 时，它找不到这个文件，于是返回 `index.html`（SPA 的 fallback 机制）。浏览器拿到的是 HTML，而不是 JSON。

Vite Dev Server 不同，它支持代理配置。在 `vite.config.ts` 里可以写：

```javascript
// vite.config.ts
server: {
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:7860',
      changeOrigin: true,
    },
    '/health': {
      target: 'http://127.0.0.1:7860',
    }
  }
}
```

这样 `/api/*` 的请求会被正确转发到后端，而不是返回 HTML。

**类比**：静态服务器像一个只会递文件的图书管理员，你要什么它就给什么，找不到就给你一本空白书。Vite Dev Server 像一个有分拣能力的前台，知道哪些请求该转给后端处理。

### 2. Docker 容器的代码同步问题

当你在本地修改了 `auth.py`，Docker 容器里的代码不会自动更新。容器有自己的文件系统，它是从镜像构建时复制进去的。

```bash
# 本地代码改了，但容器还是旧的
# 查看容器里的 auth.py
docker exec docmind cat /app/src/docmind/web/api/auth.py

# 对比本地的
cat src/docmind/web/api/auth.py
```

如果不 rebuild 镜像或重新 `docker cp`，容器永远运行旧代码。

### 3. SSE（Server-Sent Events）流式协议

SSE 是一种服务器向客户端推送数据的协议。客户端发起请求后，服务器通过一个长连接持续发送数据块：

```
HTTP/1.1 200 OK
Content-Type: text/event-stream

data: {"chunk": "你"}
data: {"chunk": "好"}
data: {"chunk": "世"}
data: {"chunk": "界"}
data: [DONE]
```

问题在于：不是所有 LLM 供应商都支持 SSE。如果供应商返回的是普通 JSON（不是流式），而客户端用 `httpx.iter_lines()` 去读，它会一直等待更多的行，直到超时。

---

## 实战指南

### Bug 1：白屏，静态服务器不代理 API

**现象**：浏览器打开页面一片空白，控制台没有报错。

**排查过程**：

```bash
# 1. 检查后端是否正常
curl http://localhost:7860/health
# → {"status": "ok"}

# 2. 检查前端到后端的连通性
curl http://localhost:3000/api/v1/status
# → <!DOCTYPE html>...（返回了 HTML！）

# 3. 确认前端服务器类型
ps aux | grep serve
# → npx serve -s
```

**根因**：`npx serve -s` 不支持 API 代理，所有 `/api/*` 请求都返回了 `index.html`。

**修复**：

```bash
# 停止 serve，改用 Vite dev server
# 在 Dockerfile 或启动脚本中：
npx vite --port 3000 --host
```

同时加固路由守卫，验证 API 响应格式：

```typescript
// frontend/src/router/index.ts
try {
  const status = await getOnboardingStatus()
  // 验证响应是布尔值，不是 HTML
  if (typeof status.onboarded === 'boolean') {
    onboarded.value = status.onboarded
  } else {
    console.error('Invalid API response:', status)
    onboarded.value = true // 降级处理
  }
} catch (e) {
  onboarded.value = true
}
```

### Bug 2：401 Unauthorized，容器认证状态不同步

**现象**：所有 API 请求返回 401，但本地代码已经禁用了认证。

**排查过程**：

```bash
# 1. 本地代码确认
grep -A5 "def verify_api_key" src/docmind/web/api/auth.py
# → return APIKeyInfo(...)  # 已禁用

# 2. 容器内代码确认
docker exec docmind grep -A5 "def verify_api_key" /app/src/docmind/web/api/auth.py
# → if not api_key: raise HTTPException(401)  # 还是旧的！
```

**根因**：本地 `auth.py` 已经改成了"永远返回默认值"（禁用认证），但 Docker 容器里还是旧版本，仍然要求 `Authorization` 头。

**修复**：

```bash
# 方法1：复制文件到容器
docker cp src/docmind/web/api/auth.py docmind:/app/src/docmind/web/api/auth.py
docker restart docmind

# 方法2：重新构建镜像（更彻底）
docker build -t docmind-docmind .
docker stop docmind && docker rm docmind
docker run -d --name docmind ... docmind-docmind
```

### Bug 3：504 Gateway Timeout，LLM 网关不稳定

**现象**：知识图谱生成、文档摘要等 AI 功能间歇性失败，后端日志显示 `所有渠道均失败`。

**排查过程**：

```bash
# 1. 直接测试 LLM 端点
curl -s -o /dev/null -w "%{http_code}" \\\\\\\\
  -X POST https://<LLM服务地址>/v1/chat/completions \\\\\\\\
  -H "Content-Type: application/json" \\\\\\\\
  -d '{"model":"mimo-2.5-pro","messages":[{"role":"user","content":"hi"}]}'
# → 504

# 2. 检查网关配置
docker exec docmind cat /app/data/settings.json
# → 只配置了一个 channel，没有 fallback
```

**根因**：LLM 网关只有一个通道，当上游返回 504 时没有备用通道可以切换。

**修复**（代码层面）：

```python
# src/docmind/gateway/core.py
async def chat_stream(self, messages, **kwargs):
    # 给 stream 路由也加上 fallback
    return await self.route_with_fallback(messages, stream=True, **kwargs)
```

```typescript
// frontend/src/api/client.ts - 改善错误信息
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    // 用后端返回的具体错误替换 Axios 泛型错误
    const detail = error.response?.data?.detail
    if (detail) {
      error.message = detail
    }
    return Promise.reject(error)
  }
)
```

**建议**：在 LLM 网关配置中添加备用通道，避免单点故障。

### Bug 4：挂起，SSE 流式响应阻塞

**现象**：点击"摘要"按钮后，页面一直转圈，永远不会返回结果。

**排查过程**：

```bash
# 1. 测试后端流式端点
curl -N http://localhost:7860/api/v1/chat/stream \\\\\\\\
  -H "Content-Type: application/json" \\\\\\\\
  -d '{"file_id": "test"}'
# → 没有 SSE 事件流，直接返回 JSON
```

**根因**：前端用 `httpx.Client.stream()` 配合 `iter_lines()` 读取 SSE 数据，但 LLM 供应商不支持流式返回，直接回了一个普通 JSON。`iter_lines()` 会一直等待更多的行，永远不会结束。

**修复**：

```typescript
// frontend/src/components/tabs/SummaryTab.vue
// 从流式改为非流式调用
import { summarizeFile } from '@/api/summary'  // 非流式版本

// 添加超时保护
const controller = new AbortController()
setTimeout(() => controller.abort(), 120_000) // 120秒超时

const result = await summarizeFile(fileId, { signal: controller.signal })
```

流式代码保留在后端，等 LLM 供应商支持 SSE 后再启用。

---

## 踩坑记录

### 坑 1：SPA Fallback 的双刃剑

SPA（单页应用）的 fallback 机制，找不到文件就返回 `index.html`，在开发时很方便，但在部署时会掩盖真正的 404 错误。API 请求返回 HTML 而不是 JSON，Axios 不会抛异常（因为 HTTP 状态码是 200），导致错误被静默吞掉。

**教训**：永远在 API 响应拦截器中验证 Content-Type 或数据结构。

### 坑 2：Docker 容器是"快照"

Docker 容器的文件系统是在构建时固化的。`docker run` 之后，容器内的代码不会跟随宿主机变化。除非使用 volume 映射或重新构建，否则改了代码等于没改。

**教训**：每次修改代码后，要么 `docker cp` + `docker restart`，要么重新构建镜像。没有第三种选择。

### 坑 3：上游服务不可控

LLM 网关是第三方服务，它的稳定性不在你的控制范围内。单通道配置意味着上游一挂，所有 AI 功能全废。

**教训**：关键服务必须有 fallback 通道。代码层面用 `route_with_fallback()` 兜底，运维层面配置多个供应商。

### 坑 4：流式 ≠ 通用

SSE 是一个很好的用户体验优化，但前提是服务端真的支持。如果服务端返回普通 JSON，客户端的流式读取代码会变成一个无限等待的死循环。

**教训**：流式调用必须有超时保护。同时保留非流式版本作为降级方案。

---

## 总结

### 核心收获

1. **环境差异是 Docker 部署的第一杀手**，本地 `npm run dev` 和容器内 `npx serve -s` 的行为完全不同
2. **容器代码不会自动同步**，修改本地代码后，容器里的文件不会变
3. **上游服务必须有 fallback**，单通道配置等于单点故障
4. **流式协议需要降级方案**，不是所有服务端都支持 SSE

### 最佳实践

- 前端开发服务器用 Vite（支持代理），不要用纯静态服务器
- 认证逻辑变更后，必须同步更新 Docker 容器
- LLM 网关至少配置两个通道
- 流式调用必须有超时保护和非流式降级
- API 响应拦截器要验证数据结构，不能只看 HTTP 状态码

### 延伸阅读

- Vite 代理配置：https://vitejs.dev/config/server-options.html#server-proxy
- Docker 容器文件系统：https://docs.docker.com/storage/
- SSE 规范：https://html.spec.whatwg.org/multipage/server-sent-events.html