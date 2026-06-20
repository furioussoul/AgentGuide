import fs from "node:fs/promises";
import path from "node:path";
import type { AgentTool } from "./types.js";
import { checkFileStaleness, refreshFileBaseline } from "./file-state.js";
import { lineChangeSummary, resolveToolPath, toDisplayPath } from "./tool-helpers.js";

async function readExisting(target: string): Promise<string | null> {
  try {
    return await fs.readFile(target, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export const writeTool: AgentTool = {
  definition: {
    name: "write",
    description:
      "Create or overwrite a UTF-8 text file in the workspace. Creates parent directories. Use this for new files or deliberate full-file rewrites.",
    input_schema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Workspace-relative file path to create or overwrite." },
        content: { type: "string", description: "Complete file contents to write." },
      },
      required: ["filePath", "content"],
    },
  },
  async execute(input, context) {
    const data = input as { filePath?: string; content?: string };
    if (!data.filePath?.trim()) return { ok: false, output: "Missing filePath." };
    if (typeof data.content !== "string") return { ok: false, output: "content must be a string." };

    const target = resolveToolPath(context.workspaceRoot, data.filePath);
    const before = await readExisting(target);
    if (before !== null) {
      const staleness = await checkFileStaleness(context.sessionId, target);
      if (staleness.stale) {
        return {
          ok: false,
          output: `Write refused: ${staleness.message}`,
          metadata: { path: toDisplayPath(context.workspaceRoot, target), conflict: true },
        };
      }
    }

    if (before === data.content) {
      await refreshFileBaseline(context.sessionId, target);
      return {
        ok: true,
        output: `No changes written. ${toDisplayPath(context.workspaceRoot, target)} already matches requested content.`,
        metadata: { path: toDisplayPath(context.workspaceRoot, target), unchanged: true, created: false },
      };
    }

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data.content, "utf8");
    await refreshFileBaseline(context.sessionId, target);

    const diff = lineChangeSummary(before ?? "", data.content);
    const displayPath = toDisplayPath(context.workspaceRoot, target);
    return {
      ok: true,
      output:
        `${before === null ? "Created" : "Updated"} ${displayPath}. ` +
        `Lines: ${data.content.split(/\r?\n/).length}, +${diff.insertions}/-${diff.deletions}.`,
      metadata: {
        path: displayPath,
        created: before === null,
        bytes: Buffer.byteLength(data.content, "utf8"),
        previousBytes: before === null ? 0 : Buffer.byteLength(before, "utf8"),
        ...diff,
      },
    };
  },
};
