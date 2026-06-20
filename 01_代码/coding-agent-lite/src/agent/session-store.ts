import type { MessageParam } from "../model/types.js";
import type { SessionState } from "./types.js";

export class SessionStore {
  private readonly sessions = new Map<string, SessionState>();

  public get(sessionId: string): MessageParam[] {
    return [...(this.sessions.get(sessionId)?.messages ?? [])];
  }

  public set(sessionId: string, messages: MessageParam[]): void {
    this.sessions.set(sessionId, { messages: [...messages], updatedAt: Date.now() });
  }

  public clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
