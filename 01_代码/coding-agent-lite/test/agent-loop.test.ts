import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  ContentBlock,
  MessageParam,
  ModelProvider,
  ModelResponse,
  ToolDefinition,
} from "../src/model/types.js";
import { runAgentLoop } from "../src/agent/agent-loop.js";
import { TraceRecorder } from "../src/trace.js";
import type { AgentTool } from "../src/tools/types.js";

class StubProvider implements ModelProvider {
  private index = 0;
  public constructor(private readonly responses: ModelResponse[]) {}
  async createMessage(_args: {
    system: string;
    messages: MessageParam[];
    tools: ToolDefinition[];
    maxTokens: number;
  }) {
    return this.responses[this.index++];
  }
}

const echoTool: AgentTool = {
  definition: {
    name: "echo",
    description: "Echo input",
    input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
  async execute(input) {
    return { ok: true, output: String((input as { text: string }).text) };
  },
};

test("agent loop executes a tool then returns text", async () => {
  const traceDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-trace-"));
  const provider = new StubProvider([
    {
      content: [{ type: "tool_use", id: "t1", name: "echo", input: { text: "ok" } }] as ContentBlock[],
      stopReason: "tool_use",
      inputTokens: 10,
      outputTokens: 5,
    },
    {
      content: [{ type: "text", text: "done" }] as ContentBlock[],
      stopReason: "stop",
      inputTokens: 12,
      outputTokens: 3,
    },
  ]);
  const result = await runAgentLoop({
    provider,
    tools: [echoTool],
    toolContext: { workspaceRoot: traceDir, allowedCommands: [] },
    trace: new TraceRecorder(traceDir),
    maxSteps: 3,
    maxContextMessages: 20,
    messages: [{ role: "user", content: "test" }],
  });
  assert.equal(result.finalText, "done");
});
