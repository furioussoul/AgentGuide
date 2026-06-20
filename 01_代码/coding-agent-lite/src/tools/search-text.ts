import fs from "node:fs/promises";
import path from "node:path";
import type { AgentTool } from "./types.js";
import { resolveInsideWorkspace, toWorkspacePath } from "../workspace.js";

const ignored = new Set(["node_modules", ".git", "dist", ".next", "coverage"]);
const maxFileBytes = 512_000;

export const searchTextTool: AgentTool = {
  definition: {
    name: "search_text",
    description:
      "Search text recursively inside the workspace and return matching file names and line numbers. Use this to locate symbols, error messages, and tests.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        path: { type: "string", default: "." },
        case_sensitive: { type: "boolean", default: false },
        max_results: { type: "integer", minimum: 1, maximum: 100, default: 40 },
      },
      required: ["query"],
    },
  },
  async execute(input, context) {
    const data = input as {
      query: string;
      path?: string;
      case_sensitive?: boolean;
      max_results?: number;
    };
    const root = resolveInsideWorkspace(context.workspaceRoot, data.path || ".");
    const maxResults = Math.min(Math.max(data.max_results ?? 40, 1), 100);
    const needle = data.case_sensitive ? data.query : data.query.toLowerCase();
    const results: string[] = [];

    async function walk(current: string): Promise<void> {
      if (results.length >= maxResults) return;
      const entries = await fs.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxResults) return;
        if (ignored.has(entry.name)) continue;
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        const stat = await fs.stat(full);
        if (stat.size > maxFileBytes) continue;
        let text: string;
        try {
          text = await fs.readFile(full, "utf8");
        } catch {
          continue;
        }
        const lines = text.split(/\r?\n/);
        lines.forEach((line, index) => {
          if (results.length >= maxResults) return;
          const haystack = data.case_sensitive ? line : line.toLowerCase();
          if (haystack.includes(needle)) {
            results.push(`${toWorkspacePath(context.workspaceRoot, full)}:${index + 1}: ${line.trim()}`);
          }
        });
      }
    }

    await walk(root);
    return {
      ok: true,
      output: results.length ? results.join("\n") : `No matches for: ${data.query}`,
      metadata: { count: results.length, truncated: results.length >= maxResults },
    };
  },
};
