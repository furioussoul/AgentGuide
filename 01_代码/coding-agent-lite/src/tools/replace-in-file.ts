import fs from "node:fs/promises";
import type { AgentTool } from "./types.js";
import { resolveInsideWorkspace } from "../workspace.js";

function countOccurrences(text: string, fragment: string): number {
  if (!fragment) return 0;
  let count = 0;
  let cursor = 0;
  while (true) {
    const index = text.indexOf(fragment, cursor);
    if (index === -1) return count;
    count += 1;
    cursor = index + fragment.length;
  }
}

export const replaceInFileTool: AgentTool = {
  definition: {
    name: "replace_in_file",
    description:
      "Safely edit a workspace file by replacing one exact, unique text fragment. The old_text must appear exactly once; otherwise the tool refuses the edit.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_text: { type: "string" },
        new_text: { type: "string" },
      },
      required: ["path", "old_text", "new_text"],
    },
  },
  async execute(input, context) {
    const data = input as { path: string; old_text: string; new_text: string };
    const target = resolveInsideWorkspace(context.workspaceRoot, data.path);
    const before = await fs.readFile(target, "utf8");
    const count = countOccurrences(before, data.old_text);
    if (count !== 1) {
      return {
        ok: false,
        output: `Edit refused: old_text must match exactly once, but matched ${count} times. Read the file again and provide a more precise fragment.`,
        metadata: { matches: count },
      };
    }
    const after = before.replace(data.old_text, data.new_text);
    await fs.writeFile(target, after, "utf8");
    return {
      ok: true,
      output: `Updated ${data.path}. Replaced ${data.old_text.length} characters with ${data.new_text.length} characters.`,
      metadata: {
        path: data.path,
        oldLength: data.old_text.length,
        newLength: data.new_text.length,
      },
    };
  },
};
