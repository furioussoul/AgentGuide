# Coding Agent Lite

一个面向代码任务的最小 Coding Agent。它把 Web 工作台、Agent Loop、模型工具调用、受限代码工具和实时执行轨迹放在同一个小项目里，便于学习和二次开发。

## 1. 能力

- OpenAI-compatible 模型接口，使用 Vercel AI SDK 适配。
- 前端工作台支持 Markdown 消息、回车提交、Shift+Enter 换行。
- 运行中和完成后刷新页面，会保留对话与轨迹；运行中刷新会自动重连 SSE。
- Agent Loop 支持上下文裁剪、最大步数限制、工具调用和工具结果回填。
- 工具包括 `read`、`write`、`edit`、`glob`、`grep`、`bash`。
- `bash` 只允许执行 `ALLOWED_COMMANDS` 中的命令。
- 所有文件工具都被限制在 `WORKSPACE_DIR` 内。

## 2. 启动

```bash
cp .env.example .env
# 编辑 .env，填入 OPENAI_API_KEY 等配置
npm install
npm run dev
```

打开：`http://localhost:3000`

也可以使用 Bun：

```bash
bun install
bun dev
```

## 3. 环境变量

```bash
OPENAI_BASE_URL=http://67.209.179.201:20128/v1
OPENAI_API_KEY=replace_me
OPENAI_MODEL=cx/gpt-5.5
PORT=3000
MAX_AGENT_STEPS=50
MAX_CONTEXT_MESSAGES=36
WORKSPACE_DIR=./demo-project
ALLOWED_COMMANDS=npm test,node --test,npm run test,npm run build,npm run check,bun test
```

不要提交 `.env`。仓库只保留 `.env.example` 作为模板。

## 4. 推荐演示任务

```text
用 HTML 写一个贪吃蛇游戏，并运行测试。
```

重置 Demo：

```bash
npm run reset-demo
```

## 5. 常用命令

```bash
npm run dev        # 开发模式启动服务
npm run build      # TypeScript 编译检查
npm test           # 运行测试
npm run check      # 测试 + 编译
npm run reset-demo # 重置 demo-project
```

## 6. 架构

```text
Browser UI
  ↓ HTTP + SSE
Express Server
  ↓
Agent Loop
  ↓
OpenAI-compatible Model API
  ↓ tool calls
Tool Registry
  ├─ read
  ├─ write
  ├─ edit
  ├─ glob
  ├─ grep
  └─ bash
  ↓
Isolated Workspace + JSONL Trace
```

## 7. 目录

```text
public/          前端工作台
src/agent/       Agent Loop、上下文和系统提示词
src/model/       Vercel AI SDK 模型适配
src/tools/       代码工具
src/server.ts    Express、SSE、运行重连
demo-project/    默认被 Agent 操作的空工作区
test/            工具和 Agent Loop 测试
```
