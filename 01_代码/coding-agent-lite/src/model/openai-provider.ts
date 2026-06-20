import { createOpenAI } from "@ai-sdk/openai";
import { generateText, jsonSchema, tool, type FinishReason, type ModelMessage } from "ai";
import type {
  ContentBlock,
  MessageParam,
  ModelProvider,
  ModelResponse,
  StopReason,
  ToolDefinition,
  ToolResultBlock,
} from "./types.js";

function isToolResultBlockArray(content: MessageParam["content"]): content is ToolResultBlock[] {
  return Array.isArray(content) && content.every((block) => block.type === "tool_result");
}

function toStopReason(reason: FinishReason): StopReason {
  if (reason === "stop") return "stop";
  if (reason === "length") return "length";
  if (reason === "tool-calls") return "tool_use";
  if (reason === "error") return "error";
  return "other";
}

function toModelMessages(messages: MessageParam[]): ModelMessage[] {
  return messages.map((message) => {
    if (message.role === "user" && isToolResultBlockArray(message.content)) {
      const toolResults = message.content;
      return {
        role: "tool",
        content: toolResults.map((result) => ({
          type: "tool-result",
          toolCallId: result.tool_use_id,
          toolName: result.tool_name,
          output: { type: "text", value: result.content },
        })),
      };
    }

    if (message.role === "assistant" && Array.isArray(message.content)) {
      const blocks = message.content as ContentBlock[];
      return {
        role: "assistant",
        content: blocks.map((block) => {
          if (block.type === "text") {
            return { type: "text", text: block.text };
          }
          return {
            type: "tool-call",
            toolCallId: block.id,
            toolName: block.name,
            input: block.input,
          };
        }),
      };
    }

    return {
      role: "user",
      content: typeof message.content === "string" ? message.content : "",
    };
  });
}

function toToolSet(tools: ToolDefinition[]) {
  return Object.fromEntries(
    tools.map((definition) => [
      definition.name,
      tool({
        description: definition.description,
        inputSchema: jsonSchema(definition.input_schema),
      }),
    ]),
  );
}

export class OpenAIProvider implements ModelProvider {
  private readonly client;

  public constructor(
    apiKey: string,
    baseURL: string,
    private readonly model: string,
  ) {
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is missing. Copy .env.example to .env and set the key.");
    }
    if (!baseURL) {
      throw new Error("OPENAI_BASE_URL is missing. Copy .env.example to .env and set it.");
    }
    this.client = createOpenAI({ apiKey, baseURL, name: "custom-openai" });
  }

  public async createMessage(args: {
    system: string;
    messages: MessageParam[];
    tools: ToolDefinition[];
    maxTokens: number;
  }): Promise<ModelResponse> {
    const response = await generateText({
      model: this.client.chat(this.model),
      system: args.system,
      messages: toModelMessages(args.messages),
      tools: toToolSet(args.tools),
      toolChoice: "auto",
      maxOutputTokens: args.maxTokens,
    });

    const content: ContentBlock[] = [];
    if (response.text.trim()) {
      content.push({ type: "text", text: response.text });
    }
    for (const call of response.toolCalls) {
      content.push({
        type: "tool_use",
        id: call.toolCallId,
        name: call.toolName,
        input: call.input,
      });
    }

    return {
      content,
      stopReason: toStopReason(response.finishReason),
      inputTokens: response.usage.inputTokens ?? 0,
      outputTokens: response.usage.outputTokens ?? 0,
    };
  }
}
