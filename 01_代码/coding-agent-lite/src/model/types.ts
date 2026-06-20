export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  tool_name: string;
  is_error?: boolean;
  content: string;
}

export type ContentBlock = TextBlock | ToolUseBlock;

export type StopReason = "stop" | "length" | "tool_use" | "error" | "other";

export interface MessageParam {
  role: "user" | "assistant";
  content: string | ContentBlock[] | ToolResultBlock[];
}

export interface ToolDefinition {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface ModelResponse {
  content: ContentBlock[];
  stopReason: StopReason;
  inputTokens: number;
  outputTokens: number;
}

export interface ModelProvider {
  createMessage(args: {
    system: string;
    messages: MessageParam[];
    tools: ToolDefinition[];
    maxTokens: number;
  }): Promise<ModelResponse>;
}
