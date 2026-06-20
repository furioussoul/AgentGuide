import fs from "node:fs/promises";
import type { AgentTool } from "./types.js";
import { checkFileStaleness, refreshFileBaseline } from "./file-state.js";
import { lineChangeSummary, resolveToolPath, toDisplayPath } from "./tool-helpers.js";
import { smartEdit, SmartEditError } from "./smart-edit.js";

export const editTool: AgentTool = {
  definition: {
    name: "edit",
    description:
      "Modify an existing workspace file by replacing text. Tries exact matching first, then quote/whitespace/indentation-tolerant matching. Read the file first.",
    input_schema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Workspace-relative file path to edit." },
        oldString: { type: "string", description: "Text to replace. Include surrounding context for unique matches." },
        newString: { type: "string", description: "Replacement text." },
        replaceAll: { type: "boolean", default: false, description: "Replace every occurrence instead of requiring one match." },
      },
      required: ["filePath", "oldString", "newString"],
    },
  },
  async execute(input, context) {
    const data = input as {
      filePath?: string;
      oldString?: string;
      newString?: string;
      replaceAll?: boolean;
    };
    if (!data.filePath?.trim()) return { ok: false, output: "Missing filePath." };
    if (typeof data.oldString !== "string") return { ok: false, output: "oldString must be a string." };
    if (typeof data.newString !== "string") return { ok: false, output: "newString must be a string." };

    const target = resolveToolPath(context.workspaceRoot, data.filePath);
    const staleness = await checkFileStaleness(context.sessionId, target);
    if (staleness.stale) {
      return {
        ok: false,
        output: `Edit refused: ${staleness.message}`,
        metadata: { path: toDisplayPath(context.workspaceRoot, target), conflict: true },
      };
    }

    let before: string;
    try {
      before = await fs.readFile(target, "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, output: `Edit failed: cannot read ${data.filePath}: ${message}` };
    }

    try {
      const result = smartEdit(before, data.oldString, data.newString, Boolean(data.replaceAll));
      await fs.writeFile(target, result.content, "utf8");
      await refreshFileBaseline(context.sessionId, target);
      const diff = lineChangeSummary(before, result.content);
      return {
        ok: true,
        output:
          `Edited ${toDisplayPath(context.workspaceRoot, target)} using ${result.strategy} match. ` +
          `Replacements: ${result.replacementCount}, +${diff.insertions}/-${diff.deletions}.`,
        metadata: {
          path: toDisplayPath(context.workspaceRoot, target),
          replacementCount: result.replacementCount,
          matchStrategy: result.strategy,
          matchedPreview: result.matchedText.replace(/\r?\n/g, "\\n").slice(0, 200),
          ...diff,
        },
      };
    } catch (error) {
      if (error instanceof SmartEditError) {
        return {
          ok: false,
          output: `Edit failed: ${error.message}`,
          metadata: {
            path: toDisplayPath(context.workspaceRoot, target),
            errorCode: error.code,
            ...error.details,
          },
        };
      }
      throw error;
    }
  },
};
