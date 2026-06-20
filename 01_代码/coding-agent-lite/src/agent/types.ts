import type { MessageParam } from "../model/types.js";

export interface SessionState {
  messages: MessageParam[];
  updatedAt: number;
}

export interface AgentEvent {
  type: string;
  payload: Record<string, unknown>;
}
