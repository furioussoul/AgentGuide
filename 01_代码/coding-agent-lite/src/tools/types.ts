import type { ToolDefinition } from "../model/types.js";

export interface ToolContext {
  workspaceRoot: string;
  allowedCommands: string[];
}

export interface ToolExecutionResult {
  ok: boolean;
  output: string;
  metadata?: Record<string, unknown>;
}

export interface AgentTool {
  definition: ToolDefinition;
  execute(input: unknown, context: ToolContext): Promise<ToolExecutionResult>;
}
