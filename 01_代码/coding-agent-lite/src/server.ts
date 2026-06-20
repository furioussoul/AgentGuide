import express from "express";
import path from "node:path";
import { config } from "./config.js";
import { OpenAIProvider } from "./model/openai-provider.js";
import { tools } from "./tools/index.js";
import { TraceRecorder, type TraceEvent } from "./trace.js";
import { runAgentLoop } from "./agent/agent-loop.js";
import { SessionStore } from "./agent/session-store.js";
import { clearFileBaselines } from "./tools/file-state.js";

const app = express();
const sessions = new SessionStore();
const provider = new OpenAIProvider(config.apiKey, config.baseURL, config.model);

app.use(express.json({ limit: "64kb" }));
app.use(express.static(config.publicDir));

type StreamEventType = "status" | "trace" | "assistant" | "done" | "error";

interface StreamEvent {
  seq: number;
  type: StreamEventType;
  payload: unknown;
}

interface ActiveRun {
  runId: string;
  sessionId: string;
  events: StreamEvent[];
  subscribers: Set<express.Response>;
  status: "running" | "done" | "error";
  nextSeq: number;
  createdAt: number;
  completedAt?: number;
}

const runs = new Map<string, ActiveRun>();
const activeRunBySession = new Map<string, string>();

function writeEvent(response: express.Response, type: string, payload: unknown): void {
  response.write(`event: ${type}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function writeStreamEvent(response: express.Response, event: StreamEvent): void {
  const payload = typeof event.payload === "object" && event.payload !== null
    ? { ...event.payload, seq: event.seq }
    : { value: event.payload, seq: event.seq };
  writeEvent(response, event.type, payload);
}

function addRunEvent(run: ActiveRun, type: StreamEventType, payload: unknown): void {
  const event = { seq: run.nextSeq, type, payload };
  run.nextSeq += 1;
  run.events.push(event);
  if (run.events.length > 600) run.events.shift();
  for (const subscriber of run.subscribers) {
    if (!subscriber.destroyed && !subscriber.writableEnded) {
      writeStreamEvent(subscriber, event);
    }
  }
}

function openEventStream(response: express.Response): void {
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();
}

function finishRun(run: ActiveRun, status: "done" | "error"): void {
  run.status = status;
  run.completedAt = Date.now();
  if (activeRunBySession.get(run.sessionId) === run.runId) {
    activeRunBySession.delete(run.sessionId);
  }
  for (const subscriber of run.subscribers) {
    subscriber.end();
  }
  run.subscribers.clear();
}

function subscribeRun(run: ActiveRun, response: express.Response, afterSeq = -1): void {
  openEventStream(response);
  for (const event of run.events) {
    if (event.seq > afterSeq) writeStreamEvent(response, event);
  }
  if (run.status !== "running") {
    response.end();
    return;
  }
  run.subscribers.add(response);
  response.on("close", () => {
    run.subscribers.delete(response);
  });
}

function startAgentRun(sessionId: string, message: string): ActiveRun {
  let run: ActiveRun;
  const trace = new TraceRecorder(config.traceDir, (event: TraceEvent) => {
    addRunEvent(run, "trace", event);
  });
  run = {
    runId: trace.runId,
    sessionId,
    events: [],
    subscribers: new Set(),
    status: "running",
    nextSeq: 0,
    createdAt: Date.now(),
  };
  runs.set(run.runId, run);
  activeRunBySession.set(sessionId, run.runId);

  void (async () => {
    try {
      const messages = sessions.get(sessionId);
      messages.push({ role: "user", content: message });
      addRunEvent(run, "status", { text: "Agent started", runId: trace.runId });

      const result = await runAgentLoop({
        provider,
        tools,
        toolContext: {
          workspaceRoot: config.workspaceDir,
          allowedCommands: config.allowedCommands,
          sessionId,
        },
        trace,
        maxSteps: config.maxAgentSteps,
        maxContextMessages: config.maxContextMessages,
        messages,
      });

      sessions.set(sessionId, result.messages);
      addRunEvent(run, "assistant", { text: result.finalText, runId: trace.runId });
      addRunEvent(run, "done", { runId: trace.runId });
      finishRun(run, "done");
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      await trace.record("error", { message: messageText });
      addRunEvent(run, "error", { message: messageText, runId: trace.runId });
      finishRun(run, "error");
    }
  })();

  return run;
}

app.post("/api/chat", (request, response) => {
  const sessionId = String(request.body?.sessionId || "").trim();
  const message = String(request.body?.message || "").trim();
  if (!sessionId || !message) {
    response.status(400).json({ error: "sessionId and message are required" });
    return;
  }

  const activeRunId = activeRunBySession.get(sessionId);
  const activeRun = activeRunId ? runs.get(activeRunId) : undefined;
  if (activeRun?.status === "running") {
    response.status(409).json({ error: "A task is already running for this conversation." });
    return;
  }

  const run = startAgentRun(sessionId, message);
  subscribeRun(run, response);
});

app.get("/api/runs/:runId/stream", (request, response) => {
  const run = runs.get(String(request.params.runId || ""));
  if (!run) {
    response.status(404).json({ error: "run not found" });
    return;
  }
  const afterSeq = Number.parseInt(String(request.query.after ?? "-1"), 10);
  subscribeRun(run, response, Number.isFinite(afterSeq) ? afterSeq : -1);
});

app.post("/api/reset", (request, response) => {
  const sessionId = String(request.body?.sessionId || "").trim();
  if (sessionId) {
    sessions.clear(sessionId);
    activeRunBySession.delete(sessionId);
    clearFileBaselines(sessionId);
  }
  response.json({ ok: true });
});

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    model: config.model,
    workspace: path.basename(config.workspaceDir),
    tools: tools.map((tool) => tool.definition.name),
  });
});

app.listen(config.port, () => {
  console.log(`Coding Agent Lite: http://localhost:${config.port}`);
  console.log(`Workspace: ${config.workspaceDir}`);
  console.log(`Allowed commands: ${config.allowedCommands.join(", ")}`);
});
