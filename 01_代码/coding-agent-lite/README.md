# Coding Agent Lite

一个面向代码任务的最小 Coding Agent。它把 Web 工作台、Agent Loop、模型工具调用、受限代码工具和实时执行轨迹放在同一个小项目里，便于学习和二次开发。

## 1. 能力

- OpenAI-compatible 模型接口，使用 Vercel AI SDK 适配。
- 前端工作台支持 Markdown 消息、回车提交、Shift+Enter 换行。
- 运行中和完成后刷新页面，会保留对话与轨迹；运行中刷新会自动重连 SSE。
- Agent Loop 支持上下文裁剪、最大步数限制、工具调用和工具结果回填。
- 工具包括 `list_files`、`read_file`、`search_text`、`replace_in_file`、`run_command`。
- `run_command` 只允许执行 `ALLOWED_COMMANDS` 中的精确命令。
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
MAX_AGENT_STEPS=10
MAX_CONTEXT_MESSAGES=36
WORKSPACE_DIR=./demo-project
ALLOWED_COMMANDS=npm test
```

不要提交 `.env`。仓库只保留 `.env.example` 作为模板。

## 4. 推荐演示任务

```text
修复满 100 元仍收取运费的 Bug，并运行测试。
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
  ├─ list_files
  ├─ read_file
  ├─ search_text
  ├─ replace_in_file
  └─ run_command
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
demo-project/    默认被 Agent 操作的示例项目
test/            工具和 Agent Loop 测试
```

## 8. 安全边界

这不是本机全权限 Coding Agent。它只允许：

- 访问 `WORKSPACE_DIR`；
- 使用注册的五个工具；
- 执行 `ALLOWED_COMMANDS` 中的精确命令；
- 使用精确唯一文本替换进行编辑。

不要把这个教学 Demo 直接暴露到公网，也不要把工作目录指向包含密钥或生产代码的目录。

## 9. Clean-room 声明

本项目为面向公开课程从零设计和编写的示例代码：

- 不包含任何公司项目源码；
- 不沿用内部项目目录、类名、函数名或错误码；
- 不包含客服、Kanban、多 Agent、企业 Workflow DSL 等非必要模块；
- 使用虚构 Demo Project；
- 只根据公开的模型 Tool Use 接口和通用 Agent Loop 原理实现。

## 10. 课程边界

课程标题中的“Claude Code 类”表示目标能力相似：阅读代码、编辑文件、运行验证并循环修复。课程不声称还原 Claude Code 未公开的内部源码或架构。
