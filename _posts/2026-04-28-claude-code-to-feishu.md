---
layout: post
title: "把 Claude Code 接入飞书：从终端到企业 IM 的 AI 编码助手"
date: 2026-04-28
categories: 技术教程
tags: ["飞书", "WebSocket"]
excerpt: "Claude Code 在终端里跑得很好，但团队协作时总不能每个人都 SSH 到服务器。用一个 Python 文件 + WebSocket，把 Claude Code 桥接到飞书。"
image: "https://whalemalus.com/file/cover-claude-feishu-key"
original_url: "https://whalemalus.com/articles/claude-code-to-feishu"
---

# 把 Claude Code 接入飞书：从终端到企业 IM 的 AI 编码助手

> **摘要**：Claude Code 在终端里跑得很好，但团队协作时总不能每个人都 SSH 到服务器。这篇文章记录了如何用一个 Python 文件 + WebSocket，把 Claude Code 桥接到飞书，让团队在 IM 里直接使用 AI 编码能力。
>
> **关键词**：`Claude Code` `飞书机器人` `WebSocket` `AI Agent` `企业 IM`

---

## 楔子

周五下午，同事在飞书群里问：

> "这个 Python 报错怎么解决？"附了一张截图。

我切到终端，打开 Claude Code，把报错贴进去，等它分析完，复制结果，切回飞书，粘贴发送。

三分钟后，另一个同事又问了一个类似的问题。

我重复了一遍同样的操作。

那一刻我在想：**Claude Code 已经能处理这些问题了，为什么我还要当中间人？**

---

## 引言

这篇文章要做的事很简单：**把 Claude Code 从你的终端搬到飞书里。**

完成后，团队成员在飞书群里 @机器人 发一段报错，就能实时看到 Claude Code 的分析过程——读了哪个文件、跑了什么命令、最终结论是什么。

不需要公网 IP，不需要域名，不需要 API 网关。一个 Python 文件 + Systemd，5 分钟部署完成。

技术栈：Claude Code CLI、飞书开放平台 WebSocket API、Python lark-oapi。

---

## 1. 全景地图：系统架构

```
┌─────────────┐     WebSocket       ┌──────────────┐     CLI (subprocess)     ┌─────────────┐
│   飞书用户   │ ←────────────────→ │  Python Bot   │ ──────────────────────→ │ Claude Code │
│  (手机/PC)   │    飞书长连接       │  (服务器运行)  │                          │    CLI      │
└─────────────┘                     └──────────────┘                          └─────────────┘
                                          │
                                          │ 实时反馈
                                          ▼
                                    ⚙️ 步骤1: `cat auth.py`
                                    📝 步骤2: 写入 test_auth.py
                                    ✅ 完成
```

**关键设计决策：Bot 不做任何 AI 处理，只做桥接。**

为什么要这样？因为 Claude Code 本身已经是一个完整的 AI Agent——它能读文件、写代码、跑命令、搜索代码库。Bot 只需要把飞书的消息传给它，把它的输出传回飞书。

这意味着：Claude Code 终端里能做的事，飞书里都能做。

---

## 2. 核心概念

### 2.1 为什么用 WebSocket 而不是 Webhook？

飞书机器人有两种接收消息的方式：

| 方式 | 需要公网 IP | 延迟 | 部署难度 |
|------|------------|------|---------|
| Webhook（HTTP 回调） | ✅ 需要 | 低 | 高（要配域名、SSL、反向代理） |
| WebSocket（长连接） | ❌ 不需要 | 低 | 低（一个 Python 进程） |

WebSocket 方案的优势是**不需要公网 IP**。Bot 主动连接飞书服务器，建立长连接后双向通信。对于部署在内网或没有域名的服务器来说，这是唯一的选择。

飞书的 WebSocket API 通过 `lark_oapi.ws.Client` 实现，底层是 `wss://msg-frontier.feishu.cn/ws/v2`。

### 2.2 Claude Code 的 stream-json 输出

Claude Code CLI 支持 `--output-format stream-json` 参数，可以实时输出 JSON 流：

```bash
claude -p "分析这段代码" --output-format stream-json --verbose
```

每行是一个 JSON 对象，包含：
- `type: "assistant"` — AI 的思考和工具调用
- `type: "result"` — 最终结果

Bot 解析这些 JSON 事件，提取工具调用信息，实时推送到飞书：

```json
{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"cat auth.py"}}]}}
{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"/tmp/test.py"}}]}}
{"type":"result","result":"分析完成，问题在于..."}
```

### 2.3 会话隔离

每个飞书聊天（私聊或群聊）有独立的 `chat_id`。Bot 根据 `chat_id` 创建独立的工作目录：

```
/home/claude-user/Claude Projects/
├── chat_12345678/    ← 用户A的工作目录
├── chat_87654321/    ← 用户B的工作目录
└── chat_11223344/    ← 群聊C的工作目录
```

这样不同用户的文件操作互不干扰。

---

## 3. 实战指南：5 分钟部署

### 3.1 前置条件

- Claude Code 已安装并配置好（`claude --version` 能正常输出）
- 飞书企业自建应用（[创建指南](https://open.feishu.cn/app)）
- Python 3.10+

### 3.2 创建飞书应用

1. 登录 [飞书开发者后台](https://open.feishu.cn/app)
2. 创建企业自建应用
3. 记录 `App ID` 和 `App Secret`

### 3.3 一键部署

```bash
# 克隆项目
git clone https://github.com/whalemalus/claude-code-to-feishu.git
cd claude-code-to-feishu

# 配置环境变量
cp .env.example .env
nano .env
# 填入 FEISHU_APP_ID 和 FEISHU_APP_SECRET

# 一键部署
chmod +x setup.sh
./setup.sh
```

`setup.sh` 会自动：
1. 安装系统依赖（python3、pip）
2. 安装 Python 包（lark-oapi）
3. 创建 `claude-user`（Claude Code 禁止以 root 运行）
4. 注册 Systemd 服务

### 3.4 飞书后台配置

回到飞书开发者后台：

1. **开启机器人能力**：应用功能 → 机器人 → 启用
2. **添加权限**：
   - `im:message` — 发送消息
   - `im:message:send_as_bot` — 以机器人身份发送
   - `im:message.p2p_msg:readonly` — 接收私聊消息
3. **订阅事件**：事件与回调 → 事件配置 → 添加 `im.message.receive_v1`
4. **发布应用**：版本管理与发布 → 创建版本 → 发布

### 3.5 开始使用

在飞书中搜索你的机器人名称，直接发消息：

```
你: 帮我写一个快速排序算法

Bot: 🤔 步骤1: `cat > quicksort.py << 'EOF'...`
Bot: 📝 步骤2: 写入 quicksort.py
Bot: ⚙️ 步骤3: `python3 quicksort.py`
Bot: ✅ 完成
     📋 cat → Write → Bash
     
     排序结果：[1, 2, 3, 5, 8]
```

---

## 4. 技术实现详解

### 4.1 消息处理流程

```python
def handle_message(data):
    msg = data.event.message
    text = extract_text(msg.content)
    chat_id = msg.chat_id
    
    # 特殊命令
    if text == "/clear":
        shutil.rmtree(get_work_dir(chat_id))
        send_feishu(chat_id, "🔄 已清除")
        return
    
    # 在新线程中调用 Claude Code
    threading.Thread(
        target=call_claude_code,
        args=(chat_id, text, msg.message_id)
    ).start()
```

为什么用新线程？因为 Claude Code 处理任务可能需要几十秒到几分钟。如果在主线程阻塞，会丢失其他用户的消息。

### 4.2 Claude Code 调用与实时反馈

```python
def call_claude_code(chat_id, user_message, user_msg_id):
    # 构建命令
    shell_cmd = (
        f"cd '{work_dir}' && "
        f"claude -p '{escaped_msg}' "
        f"--dangerously-skip-permissions "
        f"--output-format stream-json "
        f"--verbose "
        f"--max-turns 15"
    )
    
    # 添加思考表情 🤔
    thinking_reaction = add_reaction(user_msg_id, "THINKING")
    
    # 流式读取输出
    process = subprocess.Popen(
        ["sudo", "-u", CLAUDE_USER, "bash", "-c", shell_cmd],
        stdout=subprocess.PIPE, text=True, bufsize=1
    )
    
    for line in process.stdout:
        event = json.loads(line)
        
        if event["type"] == "assistant":
            for block in event["message"]["content"]:
                if block["type"] == "tool_use":
                    name = block["name"]
                    # 实时推送到飞书
                    if name == "Bash":
                        send_feishu(chat_id, f"⚙️ `{block['input']['command'][:80]}`")
                    elif name == "Write":
                        send_feishu(chat_id, f"📝 写入 `{block['input']['file_path']}`")
                    elif name == "Read":
                        send_feishu(chat_id, f"📖 读取 `{block['input']['file_path']}`")
    
    # 删除思考表情，添加完成表情 ✅
    remove_reaction(user_msg_id, thinking_reaction)
    add_reaction(user_msg_id, "DONE")
    send_feishu(chat_id, f"✅ 完成\
\
{final_text}")
```

### 4.3 消息去重

飞书的 WebSocket 可能会重复推送同一条消息。用一个简单的内存字典去重：

```python
processed_messages = {}

def is_duplicate(message_id):
    now = time.time()
    # 清理过期记录
    expired = [k for k, v in processed_messages.items() if now - v > 60]
    for k in expired:
        del processed_messages[k]
    
    if message_id in processed_messages:
        return True
    processed_messages[message_id] = now
    return False
```

---

## 5. 踩坑记录

### 坑 1：Claude Code 禁止以 root 运行

```
Error: --dangerously-skip-permissions cannot be used with root/sudo privileges
```

**原因**：Claude Code 有安全限制，root 用户不能跳过权限检查。

**解决**：创建专用的 `claude-user`，用 `sudo -u claude-user` 执行 Claude Code：

```bash
useradd -m -s /bin/bash claude-user
```

### 坑 2：Python 包名是 lark-oapi 不是 lark_oapi

```bash
pip3 install lark-oapi  # ✅ 正确（包名用连字符）
import lark_oapi as lark  # ✅ 导入用下划线
```

Python 的包名和导入名不一致，容易搞混。

### 坑 3：飞书事件订阅需要先保存再发布

配置事件订阅后，必须：
1. 先保存配置
2. 创建新版本
3. 发布版本

如果跳过"创建版本"直接测试，事件不会推送。

### 坑 4：Antropic API Gateway（AxonHub）的可选集成

如果你不想直接用 Anthropic 官方 API（比如想用第三方模型或想省钱），可以在 Claude Code 前面加一个 API 网关：

```env
# .env
ANTHROPIC_API_KEY=your-gateway-key
ANTHROPIC_BASE_URL=http://your-server:8090/anthropic
```

Bot 的 `call_claude_code` 会把这些环境变量注入到 Claude Code 的执行环境中。这样 Claude Code 实际调用的是你的网关，网关再转发到任意模型。

---

## 6. 总结与展望

### 核心收获

1. **Bot 只做桥接，不做 AI**。让 Claude Code 做它擅长的事，Bot 只负责消息转发。
2. **WebSocket 优于 Webhook**。不需要公网 IP，部署简单，延迟低。
3. **stream-json 是关键**。没有它，用户只能看到最终结果；有了它，用户能实时看到每一步操作。
4. **会话隔离很重要**。不同用户的工作目录必须独立，否则文件操作会互相干扰。

### 可以做什么

- 团队代码审查：在群里贴代码，机器人自动审查
- 快速原型：描述需求，机器人直接生成可运行的代码
- Bug 诊断：贴报错信息，机器人自动分析原因
- 文档生成：指定代码目录，机器人生成 API 文档

### 项目地址

- GitHub: [whalemalus/claude-code-to-feishu](https://github.com/whalemalus/claude-code-to-feishu)
- 一键部署，MIT 协议，欢迎 Star 和 PR

---

*本文由 Hermes Agent 整理，基于实际部署经验编写。项目已在生产环境运行，服务稳定。*
