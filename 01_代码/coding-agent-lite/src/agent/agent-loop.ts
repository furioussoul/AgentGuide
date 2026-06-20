import type { MessageParam, ModelProvider, ToolResultBlock, ToolUseBlock } from "../model/types.js";
import type { AgentTool, ToolContext } from "../tools/types.js";
import { TraceRecorder } from "../trace.js";
import { trimMessages } from "./context.js";
import { systemPrompt } from "./system-prompt.js";

export interface AgentLoopOptions {
  provider: ModelProvider;
  tools: AgentTool[];
  toolContext: ToolContext;
  trace: TraceRecorder;
  maxSteps: number;
  maxContextMessages: number;
  messages: MessageParam[];
}

function textFromBlocks(blocks: Array<{ type: string; text?: string }>): string {
  return blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<{
  finalText: string;
  messages: MessageParam[];
}> {
  const toolsByName = new Map(options.tools.map((tool) => [tool.definition.name, tool]));
  let messages = trimMessages([...options.messages], options.maxContextMessages);
  await options.trace.record("run_start", { messageCount: messages.length });

  for (let step = 1; step <= options.maxSteps; step += 1) {
    await options.trace.record("model_start", { step, messageCount: messages.length });
    const response = await options.provider.createMessage({
      system: systemPrompt,
      messages,
      tools: options.tools.map((tool) => tool.definition),
      maxTokens: 1800,
    });
    await options.trace.record("model_end", {
      step,
      stopReason: response.stopReason,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    });

    messages.push({ role: "assistant", content: response.content });
    const toolCalls = response.content.filter(
      (block): block is ToolUseBlock => block.type === "tool_use",
    );

    if (toolCalls.length === 0) {
      const finalText = textFromBlocks(response.content);
      await options.trace.record("assistant", { step, text: finalText });
      await options.trace.record("run_end", { step, status: "completed" });
      return { finalText: finalText || "Task finished.", messages };
    }

    const toolResults: ToolResultBlock[] = [];
    for (const call of toolCalls) {
      await options.trace.record("tool_call", {
        step,
        tool: call.name,
        input: call.input,
      });
      const tool = toolsByName.get(call.name);
      if (!tool) {
        const message = `Unknown tool: ${call.name}`;
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          tool_name: call.name,
          is_error: true,
          content: message,
        });
        await options.trace.record("tool_result", {
          step,
          tool: call.name,
          ok: false,
          output: message,
        });
        continue;
      }

      try {
        const result = await tool.execute(call.input, options.toolContext);
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          tool_name: call.name,
          is_error: !result.ok,
          content: result.output,
        });
        await options.trace.record("tool_result", {
          step,
          tool: call.name,
          ok: result.ok,
          output: result.output,
          metadata: result.metadata ?? {},
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : safeJson(error);
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          tool_name: call.name,
          is_error: true,
          content: message,
        });
        await options.trace.record("tool_result", {
          step,
          tool: call.name,
          ok: false,
          output: message,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
    messages = trimMessages(messages, options.maxContextMessages);
  }

  const message = `Stopped after ${options.maxSteps} steps. Narrow the task or inspect the trace.`;
  await options.trace.record("run_end", { status: "step_limit", maxSteps: options.maxSteps });
  return { finalText: message, messages };
}
