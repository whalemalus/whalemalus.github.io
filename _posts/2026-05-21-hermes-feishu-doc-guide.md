---
layout: post
title: "Hermes Agent 接入飞书云文档完全指南：从零到读写文档"
date: 2026-05-21
categories: 技术教程
tags: []
excerpt: "手把手教你让 AI 智能体通过飞书开放平台 API 读取、搜索、编辑飞书云文档。两种方案附完整踩坑记录。"
image: "https://whalemalus.com/file/cover-hermes-feishu-key"
original_url: "https://whalemalus.com/articles/hermes-feishu-doc-guide"
---

# Hermes Agent 接入飞书云文档完全指南：从零到读写文档

> **摘要**：手把手教你让 AI 智能体（Hermes Agent）通过飞书开放平台 API 读取、搜索、编辑飞书云文档。两种方案（官方 CLI + 原生 API），附完整踩坑记录。
>
> **关键词**：`Hermes Agent` `飞书开放平台` `lark-cli` `云文档API` `AI自动化`

---

## 楔子

凌晨两点，你还在手动把飞书文档里的会议纪要复制到 AI 助手的对话框里。复制、粘贴、提问、复制回答、切回飞书、粘贴——来回七八次，脖子已经僵了。

你心想：能不能让 AI 直接读我的飞书文档？甚至帮我把总结写回飞书？

答案是：可以。而且只需要 30 分钟配置。

---

## 引言

飞书（Lark）是国内最主流的企业协作平台之一，大量团队的知识资产都沉淀在飞书云文档中。Hermes Agent 是一个开源的 AI 智能体框架，支持工具调用、定时任务、多平台接入。

将两者打通后，你可以：
- **让 AI 读取飞书文档**：发一个链接，AI 自动获取全文内容
- **让 AI 搜索飞书文档**：用自然语言在知识库中检索
- **让 AI 编辑飞书文档**：自动生成总结、更新文档内容
- **自动化工作流**：定时扫描文档 → AI 分析 → 写回结果

本文介绍两种接入方案，从简单的官方 CLI 到灵活的原生 API。

---

## 📖 目录

1. [全景地图](#全景地图)
2. [方案一：lark-cli 官方工具（推荐）](#方案一lark-cli-官方工具推荐)
3. [方案二：飞书开放 API（备用）](#方案二飞书开放-api备用)
4. [实战：读取飞书文档](#实战读取飞书文档)
5. [实战：编辑飞书文档](#实战编辑飞书文档)
6. [踩坑记录](#踩坑记录)
7. [总结与展望](#总结与展望)

---

## 全景地图

```
┌──────────────────────────────────────────────────────┐
│                   飞书 + AI 智能体                     │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────┐    ┌──────────────┐    ┌──────────┐  │
│  │ 用户指令  │───→│  Hermes Agent │───→│ 飞书 API │  │
│  │ (飞书/CLI)│    │  (AI 智能体)  │    │ (开放平台)│  │
│  └──────────┘    └──────────────┘    └──────────┘  │
│                          │                    │      │
│                          ▼                    ▼      │
│                   ┌──────────────┐    ┌──────────┐  │
│                   │ lark-cli CLI │    │ REST API │  │
│                   │ (方案一·推荐) │    │ (方案二)  │  │
│                   └──────────────┘    └──────────┘  │
│                                                      │
│  能力清单：                                           │
│  ✅ 读取文档全文    ✅ 搜索文档                        │
│  ✅ 编辑/追加内容   ✅ 创建新文档                      │
│  ✅ 发送飞书消息    ✅ 管理群组                        │
│  ✅ 日历/任务操作   ✅ 多维表格操作                    │
└──────────────────────────────────────────────────────┘
```

**两种方案对比：**

| 维度 | 方案一：lark-cli | 方案二：原生 API |
|------|-----------------|-----------------|
| 复杂度 | ⭐ 低 | ⭐⭐⭐ 高 |
| 功能覆盖 | 文档/消息/日历/表格 | 仅文档读取 |
| 认证方式 | OAuth 一次性登录 | App Token 定期刷新 |
| 推荐场景 | 日常使用 | lark-cli 不可用时 |

---

## 方案一：lark-cli 官方工具（推荐）

### 第一步：安装 lark-cli

```bash
npm install -g @larksuite/cli
lark-cli --version  # 验证安装成功
```

需要 Node.js v18+。

### 第二步：绑定到你的 AI 智能体

```bash
lark-cli config bind --source hermes --identity user-default
```

这一步告诉 lark-cli："我在 Hermes Agent 环境中运行，请用用户身份操作。"

**身份选择：**
- `user-default`：以你的个人身份操作，能访问你的私人文档、日历、邮件。**读取个人文档必须选这个**。
- `bot-only`：仅用机器人身份，安全但无法访问个人资源。

### 第三步：OAuth 登录（一次性）

```bash
# 第一轮：获取授权链接
lark-cli auth login --recommend --no-wait --json
```

输出中有一个 `verification_url`，把它发给用户（或者自己打开），在浏览器中完成授权。

```bash
# 用户授权后，用返回的 device_code 完成登录
lark-cli auth login --device-code "<device_code>" --json
```

**关键：OAuth 必须分批授权，不能一次请求所有权限。** 第一轮用 `--recommend` 获取基础读取权限。如果后续需要搜索或发消息，再追加：

```bash
# 追加搜索权限
lark-cli auth login --scope "search:docs:read" --no-wait --json

# 追加发消息权限
lark-cli auth login --scope "im:message.send_as_user" --no-wait --json
```

### 第四步：验证登录状态

```bash
lark-cli auth status
```

显示已登录的用户信息即表示成功。

---

## 方案二：飞书开放 API（备用）

当 lark-cli 不可用时，可以直接调用飞书 Open API。

### 第一步：创建飞书应用

1. 打开 [飞书开放平台](https://open.feishu.cn/) → 创建企业自建应用
2. 在"权限管理"中申请以下权限：
   - `docx:document:readonly` — 读取文档
   - `wiki:wiki:readonly` — 读取知识库
   - `docx:document` — 编辑文档（如需写入）
3. 获取 `App ID` 和 `App Secret`，保存到环境变量：

```bash
# 写入 ~/.hermes/.env
echo "FEISHU_APP_ID=cli_xxxxx" >> ~/.hermes/.env
echo "FEISHU_APP_SECRET=xxxxx" >> ~/.hermes/.env
```

### 第二步：获取 Tenant Access Token

```bash
source ~/.hermes/.env
TOKEN=$(curl -s -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" \
  -H "Content-Type: application/json" \
  -d "{\"app_id\":\"${FEISHU_APP_ID}\",\"app_secret\":\"${FEISHU_APP_SECRET}\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['tenant_access_token'])")
echo "Token: ${TOKEN:0:20}..."
```

Token 有效期约 2 小时，长时间操作需要刷新。

### 第三步：提取文档 Token

从飞书文档 URL 中提取 token：
- Wiki 格式：`https://xxx.feishu.cn/wiki/{DOC_TOKEN}`
- Docx 格式：`https://xxx.feishu.cn/docx/{DOC_TOKEN}`

### 第四步：获取文档内容（分页）

```bash
# 获取文档元信息
curl -s "https://open.feishu.cn/open-apis/docx/v1/documents/${DOC_TOKEN}" \
  -H "Authorization: Bearer ${TOKEN}"

# 获取文档块（每页最多 500 个 block）
curl -s "https://open.feishu.cn/open-apis/docx/v1/documents/${DOC_TOKEN}/blocks?page_size=500" \
  -H "Authorization: Bearer ${TOKEN}"
```

如果返回 `data.has_more: true`，用 `data.page_token` 参数获取下一页。

---

## 实战：读取飞书文档

### 用 lark-cli 读取（最简单）

```bash
# 直接传 URL
lark-cli docs +fetch --doc "https://xxx.feishu.cn/wiki/ABC123" --format pretty

# 传文档 token
lark-cli docs +fetch --doc "ABC123" --api-version v2 --format pretty
```

输出就是文档的全文内容，可以直接交给 AI 分析。

### 搜索飞书文档

```bash
lark-cli docs +search --query "项目计划" --page-size 5 --format pretty
```

### 读取知识库（Wiki）

```bash
# 列出知识库空间
lark-cli wiki +space-list --format pretty

# 获取 wiki 节点信息
lark-cli wiki +node-get --token "https://feishu.cn/wiki/ABC123" --format json
```

---

## 实战：编辑飞书文档

### 追加内容到文档末尾

```bash
# 先写内容到临时文件
cat > /tmp/ai-summary.md << 'EOF'
## AI 自动生成摘要

本文主要讨论了以下要点：

1. **核心结论**：XXX
2. **行动计划**：XXX
3. **风险提示**：XXX

> 此摘要由 Hermes Agent 自动生成
EOF

# 追加到文档
lark-cli docs +update --doc "ABC123" --mode append --markdown @/tmp/ai-summary.md
```

### 在指定位置插入内容

```bash
# 在某个章节标题后面插入
lark-cli docs +update --doc "ABC123" --mode insert_after \
  --selection-by-title "## 会议记录" \
  --markdown @/tmp/new-content.md

# 在模糊匹配的文本后面插入
lark-cli docs +update --doc "ABC123" --mode insert_after \
  --selection-with-ellipsis "讨论了...最终决定" \
  --markdown @/tmp/follow-up.md
```

### 覆盖整个文档

```bash
lark-cli docs +update --doc "ABC123" --mode overwrite --markdown @/tmp/full-content.md
```

### 创建新文档

```bash
cd /path/to/file && lark-cli docs +create \
  --title "AI 自动生成报告" \
  --markdown @report.md \
  --wiki-space my_library \
  --as user \
  --jq '.doc_url'
```

---

## 踩坑记录

### 坑 1：OAuth 权限必须分批授权

**现象**：一次性请求所有权限（读文档 + 搜索 + 发消息 + 日历），OAuth 页面直接报错。

**原因**：飞书 OAuth 对单次请求的 scope 数量和组合有限制。

**解决**：分 2-3 轮授权。第一轮用 `--recommend`，后续按需追加。

### 坑 2：lark-cli 必须先绑定环境

**现象**：直接运行 `lark-cli auth login` 报错 "hermes context detected but lark-cli is not bound to it"。

**解决**：先执行 `lark-cli config bind --source hermes --identity user-default`。

### 坑 3：Wiki 页面需要额外处理

**现象**：用 wiki URL 直接读取文档，返回内容为空或报权限错误。

**原因**：Wiki 的 URL 中的 token 是 `node_token`，不是文档的 `obj_token`。

**解决**：
```bash
# 先获取 obj_token
lark-cli wiki +node-get --token "https://feishu.cn/wiki/NODE_TOKEN" --format json
# 用返回的 obj_token 读取文档
lark-cli docs +fetch --doc "<obj_token>" --format pretty
```

### 坑 4：`docs +update` 必须用 v1 API

**现象**：`lark-cli docs +update --api-version v2` 报错 "command is required"。

**解决**：`docs +fetch` 用 v2，`docs +update` 用 v1（默认）。

### 坑 5：`--markdown` 参数的文件路径

**现象**：`lark-cli docs +create --markdown /absolute/path/file.md` 报错 "must be a relative path"。

**解决**：先 `cd` 到文件所在目录，然后用相对路径：`--markdown @file.md`。

### 坑 6：内置 `feishu_doc_read` 工具的限制

**现象**：在普通对话中调用 `feishu_doc_read(doc_token)` 报错 "Feishu client not available (not in a Feishu comment context)"。

**原因**：Hermes 的内置飞书工具只在飞书评论上下文中可用。

**解决**：改用 `lark-cli docs +fetch`，它在任何上下文中都能工作。

### 坑 7：Token 过期

**现象**：运行一段时间后 API 调用返回 401。

**原因**：User Token 有效期约 2 小时，Refresh Token 有效期 7 天。

**解决**：重新执行 `lark-cli auth login` 刷新授权。

---

## 总结与展望

### 核心收获

1. **lark-cli 是首选方案**：安装简单、功能全面、自动处理认证和分页
2. **OAuth 分批授权是必须的**：不要试图一次申请所有权限
3. **Wiki 页面需要 token 转换**：node_token ≠ obj_token
4. **读写分离的权限设计**：只读用 `--recommend`，写入需要额外授权

### 最佳实践

- 生产环境用 `bot-only` 身份，开发调试用 `user-default`
- 文档操作前先 `lark-cli auth status` 确认登录状态
- 大文档分页处理，不要一次拉取所有内容
- 编辑操作先在测试文档上验证

### 延伸阅读

- [飞书开放平台官方文档](https://open.feishu.cn/document/home/index)
- [lark-cli GitHub 仓库](https://github.com/larksuite/cli)
- [Hermes Agent 官方文档](https://hermes-agent.nousresearch.com/docs)
