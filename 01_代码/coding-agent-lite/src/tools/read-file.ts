import fs from "node:fs/promises";
import type { AgentTool } from "./types.js";
import { resolveInsideWorkspace } from "../workspace.js";

export const readFileTool: AgentTool = {
  definition: {
    name: "read_file",
    description:
      "Read a UTF-8 text file from the workspace with line numbers. Use line_start and line_end to keep context small.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        line_start: { type: "integer", minimum: 1, default: 1 },
        line_end: { type: "integer", minimum: 1, default: 240 },
      },
      required: ["path"],
    },
  },
  async execute(input, context) {
    const data = input as { path: string; line_start?: number; line_end?: number };
    const target = resolveInsideWorkspace(context.workspaceRoot, data.path);
    const raw = await fs.readFile(target, "utf8");
    const lines = raw.split(/\r?\n/);
    const start = Math.max((data.line_start ?? 1) - 1, 0);
    const end = Math.min(data.line_end ?? start + 240, lines.length);
    const output = lines
      .slice(start, end)
      .map((line, index) => `${String(start + index + 1).padStart(4, " ")} | ${line}`)
      .join("\n");
    return {
      ok: true,
      output: output || "(empty file)",
      metadata: { totalLines: lines.length, shown: [start + 1, end] },
    };
  },
};
