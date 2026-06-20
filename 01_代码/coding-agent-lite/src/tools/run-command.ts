import { spawn } from "node:child_process";
import type { AgentTool } from "./types.js";

const maxOutputChars = 14_000;
const timeoutMs = 30_000;

function splitCommand(command: string): string[] {
  return command.trim().split(/\s+/).filter(Boolean);
}

export const runCommandTool: AgentTool = {
  definition: {
    name: "run_command",
    description:
      "Run an allowlisted verification command in the workspace. The command must exactly match one configured in ALLOWED_COMMANDS. Use it after editing to run tests.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Exact allowlisted command, for example npm test" },
      },
      required: ["command"],
    },
  },
  async execute(input, context) {
    const data = input as { command: string };
    const command = data.command.trim();
    if (!context.allowedCommands.includes(command)) {
      return {
        ok: false,
        output: `Command denied. Allowed commands: ${context.allowedCommands.join(", ")}`,
      };
    }

    const [program, ...args] = splitCommand(command);
    if (!program) return { ok: false, output: "Empty command." };

    return await new Promise((resolve) => {
      const child = spawn(program, args, {
        cwd: context.workspaceRoot,
        shell: false,
        env: { ...process.env, CI: "1", NO_COLOR: "1" },
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ ok: false, output: `Failed to start command: ${error.message}` });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n\n");
        const clipped = combined.length > maxOutputChars
          ? `${combined.slice(0, maxOutputChars)}\n… output truncated …`
          : combined;
        resolve({
          ok: code === 0 && !timedOut,
          output: `${timedOut ? "Command timed out." : `Exit code: ${code ?? "unknown"}`}\n${clipped || "(no output)"}`,
          metadata: { exitCode: code, timedOut },
        });
      });
    });
  },
};
