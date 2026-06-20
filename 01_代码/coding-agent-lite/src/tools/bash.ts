import { spawn } from "node:child_process";
import type { AgentTool } from "./types.js";
import { clampInteger, resolveToolPath, toDisplayPath } from "./tool-helpers.js";

const maxOutputChars = 24_000;
const defaultTimeoutMs = 120_000;
const maxTimeoutMs = 300_000;

function coerceCommand(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((part) => String(part)).join(" ").trim();
  if (value && typeof value === "object") {
    const object = value as { command?: unknown; cmd?: unknown; shell?: unknown };
    return coerceCommand(object.command ?? object.cmd ?? object.shell);
  }
  return value == null ? "" : String(value).trim();
}

function isAllowedCommand(command: string, allowedCommands: string[]): boolean {
  return allowedCommands.some((allowed) => {
    if (allowed === command) return true;
    if (allowed.endsWith(" *")) return command.startsWith(allowed.slice(0, -1));
    return false;
  });
}

function summarizeFailure(command: string, output: string, exitCode: number | null, timedOut: boolean): string {
  if (timedOut) return "timed_out";
  if (exitCode === 0) return "passed";
  if (/command not found|not found|ENOENT/i.test(output)) return "command_not_found";
  if (/permission denied|EACCES/i.test(output)) return "permission_denied";
  if (/assert|fail|test/i.test(output) || /\btest\b/.test(command)) return "test_failure";
  if (/syntax error|ts\d{3,5}|compile|build/i.test(output) || /\b(build|tsc)\b/.test(command)) return "build_failure";
  return "failed";
}

export const bashTool: AgentTool = {
  definition: {
    name: "bash",
    description:
      "Run an allowlisted shell command inside the workspace. Use for tests and verification after writing or editing files.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command. It must match ALLOWED_COMMANDS exactly or an allowed prefix rule." },
        workdir: { type: "string", default: ".", description: "Workspace-relative working directory." },
        timeout: { type: "integer", minimum: 1000, maximum: maxTimeoutMs, default: defaultTimeoutMs },
        description: { type: "string", description: "Short description of why this command is being run." },
      },
      required: ["command"],
    },
  },
  async execute(input, context) {
    const data = input as { command?: unknown; workdir?: string; timeout?: number };
    const command = coerceCommand(data.command);
    if (!command) return { ok: false, output: "Missing command." };
    if (!isAllowedCommand(command, context.allowedCommands)) {
      return {
        ok: false,
        output: `Command denied: ${command}\nAllowed commands:\n${context.allowedCommands.map((item) => `- ${item}`).join("\n")}`,
        metadata: { denied: true },
      };
    }

    const cwd = resolveToolPath(context.workspaceRoot, data.workdir || ".");
    const timeoutMs = clampInteger(data.timeout, defaultTimeoutMs, 1000, maxTimeoutMs);

    return await new Promise((resolve) => {
      const child = spawn(command, {
        cwd,
        shell: true,
        env: { ...process.env, CI: "1", NO_COLOR: "1" },
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
        }, 1000).unref();
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
        if (stdout.length > maxOutputChars) stdout = stdout.slice(-maxOutputChars);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
        if (stderr.length > maxOutputChars) stderr = stderr.slice(-maxOutputChars);
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ ok: false, output: `Failed to start command: ${error.message}` });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n\n");
        const clipped = combined.length > maxOutputChars
          ? `${combined.slice(0, maxOutputChars)}\n... output truncated ...`
          : combined;
        const status = summarizeFailure(command, clipped, code, timedOut);
        resolve({
          ok: code === 0 && !timedOut,
          output: [
            `Command: ${command}`,
            `Workdir: ${toDisplayPath(context.workspaceRoot, cwd)}`,
            `Status: ${status}`,
            `Exit code: ${code ?? "unknown"}`,
            clipped || "(no output)",
          ].join("\n"),
          metadata: { command, workdir: toDisplayPath(context.workspaceRoot, cwd), exitCode: code, timedOut, status },
        });
      });
    });
  },
};
