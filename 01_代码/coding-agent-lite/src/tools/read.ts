import type { AgentTool } from "./types.js";
import { clampInteger, readTextFile, resolveToolPath, toDisplayPath } from "./tool-helpers.js";
import { refreshFileBaseline } from "./file-state.js";

export const readTool: AgentTool = {
  definition: {
    name: "read",
    description:
      "Read a UTF-8 text file from the workspace. Supports paged line windows with offset and limit. Use before edit/write when changing an existing file.",
    input_schema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Workspace-relative file path to read." },
        offset: { type: "integer", minimum: 0, default: 0, description: "0-based line offset." },
        limit: {
          type: "integer",
          minimum: 0,
          maximum: 600,
          default: 240,
          description: "Number of lines to read. Use 0 to read from offset to EOF, subject to byte limits.",
        },
      },
      required: ["filePath"],
    },
  },
  async execute(input, context) {
    const data = input as { filePath?: string; offset?: number; limit?: number };
    if (!data.filePath?.trim()) {
      return { ok: false, output: "Missing filePath." };
    }

    const target = resolveToolPath(context.workspaceRoot, data.filePath);
    const { text, truncated, size } = await readTextFile(target);
    await refreshFileBaseline(context.sessionId, target);

    const lines = text.split(/\r?\n/);
    const offset = clampInteger(data.offset, 0, 0, Math.max(lines.length, 0));
    const requestedLimit = clampInteger(data.limit, 240, 0, 600);
    const end = requestedLimit === 0 ? lines.length : Math.min(lines.length, offset + requestedLimit);
    const shown = lines.slice(offset, end);
    const numbered = shown
      .map((line, index) => `${String(offset + index + 1).padStart(4, " ")} | ${line}`)
      .join("\n");

    const footer: string[] = [];
    if (offset > 0) footer.push(`hasMoreBefore=true`);
    if (end < lines.length || truncated) footer.push(`hasMoreAfter=true`);
    if (truncated) footer.push(`byteTruncated=true`);

    return {
      ok: true,
      output: [numbered || "(empty file)", footer.length ? `\n(${footer.join(", ")})` : ""].join(""),
      metadata: {
        path: toDisplayPath(context.workspaceRoot, target),
        totalLines: lines.length,
        startLine: shown.length ? offset + 1 : 0,
        endLine: shown.length ? end : 0,
        displayedLines: shown.length,
        size,
        truncated,
      },
    };
  },
};
