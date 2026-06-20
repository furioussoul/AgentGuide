# Coding Agent Lite

一个面向代码任务的最小 Coding Agent。它提供一个轻量 Web 界面，让模型在受限工作区里读文件、搜索代码、精确替换文件内容，并运行允许列表里的验证命令。

## 功能

- OpenAI-compatible 模型接口，基于 Vercel AI SDK 接入。
- 单页 Coding Agent 工作台，支持 Markdown 消息展示。
- Agent Loop 支持工具调用、工具结果回填、上下文裁剪和步数上限。
- 五个代码工具：`list_files`、`read_file`、`search_text`、`replace_in_file`、`run_command`。
- Workspace 沙箱限制，所有文件操作都被约束在 `WORKSPACE_DIR` 内。
- 命令允许列表限制，默认只允许在 demo 项目里运行 `npm test`。
- 实时执行轨迹面板，支持模型、工具、运行、错误分类筛选。
- 浏览器刷新后保留当前对话和执行记录；运行中刷新会自动重连 SSE，继续接收后续消息。

## 快速开始

```bash
cd 01_代码/coding-agent-lite
cp .env.example .env
```

编辑 `.env`，填入你的模型配置：

```bash
OPENAI_BASE_URL=replace_me
OPENAI_API_KEY=replace_me
OPENAI_MODEL=replace_me
PORT=3000
WORKSPACE_DIR=./demo-project
ALLOWED_COMMANDS=npm test
```

安装依赖并启动：

```bash
npm install
npm run dev
```

也可以使用 Bun：

```bash
bun install
bun dev
```

打开 `http://localhost:3000`，输入代码任务，例如：

```text
用html、ts写一个贪吃蛇，并运行测试。
```

## 常用命令

```bash
npm run dev        # 开发模式启动服务
npm run build      # TypeScript 编译检查
npm test           # 运行项目测试
npm run check      # 测试 + 编译
npm run reset-demo # 重置 demo-project
```

## 目录

```text
01_代码/coding-agent-lite/
  public/          # 前端工作台
  src/
    agent/         # Agent Loop、上下文和系统提示词
    model/         # Vercel AI SDK 模型适配
    tools/         # 五个代码工具
    server.ts      # Express、SSE、运行重连
  demo-project/    # 默认被 Agent 操作的示例项目
  test/            # 工具和 Agent Loop 测试
```

## 架构

```text
Browser UI
  |
  | HTTP + SSE
  v
Express Server
  |
  v
Agent Loop
  |
  +-- OpenAI-compatible Model API
  |
  +-- Tool Registry
        |
        +-- list_files
        +-- read_file
        +-- search_text
        +-- replace_in_file
        +-- run_command
```

每次任务都会生成一条 run，并把状态、模型调用、工具调用、工具结果和最终回复推送到前端。前端会把对话、轨迹和当前 run 游标保存到 `localStorage`，因此刷新页面后可以恢复视图；如果任务仍在运行，会用 run id 和序号继续订阅未接收的事件。
