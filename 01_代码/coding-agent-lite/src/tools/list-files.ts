import fs from "node:fs/promises";
import path from "node:path";
import type { AgentTool } from "./types.js";
import { resolveInsideWorkspace, toWorkspacePath } from "../workspace.js";

const ignored = new Set(["node_modules", ".git", "dist", ".next", "coverage"]);

export const listFilesTool: AgentTool = {
  definition: {
    name: "list_files",
    description:
      "List files and directories inside the isolated workspace. Use this before reading files when you do not yet know the project structure.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative directory. Defaults to ." },
        max_entries: { type: "integer", minimum: 1, maximum: 300, default: 120 },
      },
    },
  },
  async execute(input, context) {
    const data = (input ?? {}) as { path?: string; max_entries?: number };
    const start = resolveInsideWorkspace(context.workspaceRoot, data.path || ".");
    const maxEntries = Math.min(Math.max(data.max_entries ?? 120, 1), 300);
    const lines: string[] = [];

    async function walk(current: string, depth: number): Promise<void> {
      if (lines.length >= maxEntries) return;
      const entries = await fs.readdir(current, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (lines.length >= maxEntries) break;
        if (ignored.has(entry.name)) continue;
        const full = path.join(current, entry.name);
        const relative = toWorkspacePath(context.workspaceRoot, full);
        lines.push(`${"  ".repeat(depth)}${entry.isDirectory() ? "📁" : "📄"} ${relative}`);
        if (entry.isDirectory() && depth < 4) await walk(full, depth + 1);
      }
    }

    await walk(start, 0);
    return {
      ok: true,
      output: lines.length ? lines.join("\n") : "Workspace is empty.",
      metadata: { truncated: lines.length >= maxEntries },
    };
  },
};
