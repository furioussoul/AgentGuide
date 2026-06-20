import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type TraceEventType =
  | "run_start"
  | "model_start"
  | "model_end"
  | "tool_call"
  | "tool_result"
  | "assistant"
  | "error"
  | "run_end";

export interface TraceEvent {
  id: string;
  runId: string;
  at: string;
  type: TraceEventType;
  data: Record<string, unknown>;
}

export class TraceRecorder {
  public readonly runId = randomUUID();
  private readonly filePath: string;

  public constructor(
    traceDir: string,
    private readonly onEvent?: (event: TraceEvent) => void,
  ) {
    this.filePath = path.join(traceDir, `${this.runId}.jsonl`);
  }

  public async record(type: TraceEventType, data: Record<string, unknown>): Promise<TraceEvent> {
    const event: TraceEvent = {
      id: randomUUID(),
      runId: this.runId,
      at: new Date().toISOString(),
      type,
      data,
    };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, `${JSON.stringify(event)}\n`, "utf8");
    this.onEvent?.(event);
    return event;
  }
}
