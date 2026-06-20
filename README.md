# Coding Agent Lite

一个面向代码任务的轻量 Coding Agent 工作台。它可以在受限 workspace 中读代码、创建文件、修改文件、搜索内容，并通过允许列表里的命令运行验证。

![Coding Agent Lite 贪吃蛇任务演示](01_代码/coding-agent-lite/docs/snake-demo.png)

## 功能

- OpenAI-compatible 模型接口，基于 Vercel AI SDK 接入。
- 单页 Coding Agent 工作台：左侧对话和 Markdown 结果，右侧实时执行轨迹。
- Agent Loop 支持工具调用、工具结果回填、上下文裁剪和 50 步上限。
- 六个代码工具：`read`、`write`、`edit`、`glob`、`grep`、`bash`。
- 支持从 0 创建项目文件，例如生成 HTML 贪吃蛇游戏、测试文件和 `package.json`。
- Workspace 沙箱限制，所有文件操作都被约束在 `WORKSPACE_DIR` 内。
- 命令允许列表限制，`bash` 只能运行 `ALLOWED_COMMANDS` 中的命令。
- 执行轨迹面板支持模型、工具、运行、错误分类筛选，并可展开查看详情。
- 浏览器刷新后保留当前对话和执行记录；运行中刷新会自动重连 SSE。

## 示例任务

```text
用 HTML 写一个贪吃蛇游戏，并运行测试。
```

一次完整运行会让 Agent 自己完成：

- 创建 `index.html` 游戏页面；
- 创建 `game.js` 核心逻辑；
- 创建 `test.js` Node 测试；
- 创建 `package.json` 并添加 `npm test`；
- 调用 `bash` 执行 `npm test`；
- 在消息体中用 Markdown 汇总变更文件和验证结果。

截图中的示例已经跑通：右侧 trace 显示 `write` 和 `bash` 工具调用，最终 `npm test` 输出 `All tests passed`。

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
MAX_AGENT_STEPS=50
MAX_CONTEXT_MESSAGES=36
WORKSPACE_DIR=./demo-project
ALLOWED_COMMANDS=npm test,node --test,npm run test,npm run build,npm run check,bun test
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
用 HTML 写一个贪吃蛇游戏，并运行测试。
```

## 常用命令

```bash
npm run dev        # 开发模式启动服务
npm run build      # TypeScript 编译检查
npm test           # 运行项目测试
npm run check      # 测试 + 编译
npm run reset-demo # 将 demo-project 重置为空 workspace
```

## 目录

```text
01_代码/coding-agent-lite/
  public/          # 前端工作台
  src/
    agent/         # Agent Loop、上下文和系统提示词
    model/         # Vercel AI SDK 模型适配
    tools/         # 六个代码工具
    server.ts      # Express、SSE、运行重连
  demo-project/    # Agent 操作的示例 workspace
  docs/            # README 截图等说明资产
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
        +-- read
        +-- write
        +-- edit
        +-- glob
        +-- grep
        +-- bash
```

每次任务都会生成一条 run，并把状态、模型调用、工具调用、工具结果和最终回复推送到前端。前端会把对话、轨迹和当前 run 游标保存到 `localStorage`，因此刷新页面后可以恢复视图；如果任务仍在运行，会用 run id 和序号继续订阅未接收的事件。

## 安全边界

这是教学和演示项目，不是本机全权限自动编程工具。

- 文件路径必须落在 `WORKSPACE_DIR` 内。
- `bash` 命令必须匹配 `ALLOWED_COMMANDS`。
- `.env`、依赖目录、构建产物和运行轨迹不会提交。
- 不建议直接暴露到公网，也不要把 workspace 指向包含生产密钥的目录。
