import type { AgentTool } from "./types.js";
import { clampInteger, matchesGlob, toDisplayPath, walkWorkspaceFiles } from "./tool-helpers.js";

export const globTool: AgentTool = {
  definition: {
    name: "glob",
    description:
      "Find files by glob pattern inside the workspace. Supports **, *, ?, and simple {js,ts} extension groups.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern, for example **/*.js or **/*.{html,css,js}." },
        path: { type: "string", default: ".", description: "Workspace-relative directory to search." },
        offset: { type: "integer", minimum: 0, default: 0 },
        limit: { type: "integer", minimum: 0, maximum: 500, default: 100 },
        sortBy: { type: "string", enum: ["recent", "path"], default: "recent" },
      },
      required: ["pattern"],
    },
  },
  async execute(input, context) {
    const data = input as {
      pattern?: string;
      path?: string;
      offset?: number;
      limit?: number;
      sortBy?: "recent" | "path";
    };
    const pattern = data.pattern?.trim();
    if (!pattern) return { ok: false, output: "Missing pattern." };

    const files = await walkWorkspaceFiles(context.workspaceRoot, data.path || ".", { maxFiles: 5000 });
    const matches = files.filter((file) => matchesGlob(toDisplayPath(context.workspaceRoot, file.absolutePath), pattern));
    matches.sort((left, right) => {
      if ((data.sortBy ?? "recent") === "recent") {
        const delta = right.mtimeMs - left.mtimeMs;
        if (delta !== 0) return delta;
      }
      return left.workspacePath.localeCompare(right.workspacePath);
    });

    const offset = clampInteger(data.offset, 0, 0, matches.length);
    const limit = clampInteger(data.limit, 100, 0, 500);
    const window = limit === 0 ? matches.slice(offset) : matches.slice(offset, offset + limit);
    const hasMore = offset + window.length < matches.length;
    const output = window.map((file) => file.workspacePath).join("\n");

    return {
      ok: true,
      output: output || `No files found matching ${pattern}.`,
      metadata: {
        pattern,
        count: window.length,
        totalCount: matches.length,
        offset,
        nextOffset: hasMore ? offset + window.length : null,
        hasMore,
        sortBy: data.sortBy ?? "recent",
      },
    };
  },
};
