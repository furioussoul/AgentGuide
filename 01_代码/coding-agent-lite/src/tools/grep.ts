import fs from "node:fs/promises";
import type { AgentTool } from "./types.js";
import { clampInteger, readTextFile, walkWorkspaceFiles } from "./tool-helpers.js";

const maxPatternLength = 500;
const maxResults = 500;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeOutputMode(value: unknown): "content" | "files" | "count" {
  return value === "files" || value === "files_with_matches" || value === "count" ? value === "files_with_matches" ? "files" : value : "content";
}

function validatePattern(pattern: string): void {
  if (pattern.length > maxPatternLength) {
    throw new Error(`Pattern too long. Maximum ${maxPatternLength} characters.`);
  }
  if (/(\.\*){3,}|(\.\+){3,}|\([^)]*[+*][^)]*\)[+*{]/.test(pattern)) {
    throw new Error("Pattern looks too expensive to run. Use literal search or a narrower regex.");
  }
}

export const grepTool: AgentTool = {
  definition: {
    name: "grep",
    description:
      "Search file contents in the workspace. Supports literal or regex search, include globs, context lines, pagination, and output modes.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Text or regex pattern to search for." },
        path: { type: "string", default: ".", description: "Workspace-relative directory to search." },
        include: { type: "string", description: "Optional file glob, for example *.js or **/*.{html,js}." },
        isRegexp: { type: "boolean", default: true },
        contextLines: { type: "integer", minimum: 0, maximum: 10, default: 0 },
        beforeContext: { type: "integer", minimum: 0, maximum: 10 },
        afterContext: { type: "integer", minimum: 0, maximum: 10 },
        offset: { type: "integer", minimum: 0, default: 0 },
        limit: { type: "integer", minimum: 0, maximum: 300, default: 80 },
        outputMode: { type: "string", enum: ["content", "files", "files_with_matches", "count"], default: "content" },
      },
      required: ["pattern"],
    },
  },
  async execute(input, context) {
    const data = input as {
      pattern?: string;
      path?: string;
      include?: string;
      isRegexp?: boolean;
      contextLines?: number;
      beforeContext?: number;
      afterContext?: number;
      offset?: number;
      limit?: number;
      outputMode?: string;
    };
    const pattern = String(data.pattern ?? "").trim();
    if (!pattern) return { ok: false, output: "Missing pattern." };

    if (data.isRegexp !== false) validatePattern(pattern);
    const regex = new RegExp(data.isRegexp === false ? escapeRegExp(pattern) : pattern, "g");
    const outputMode = normalizeOutputMode(data.outputMode);
    const before = clampInteger(data.beforeContext ?? data.contextLines, 0, 0, 10);
    const after = clampInteger(data.afterContext ?? data.contextLines, 0, 0, 10);
    const offset = clampInteger(data.offset, 0, 0, maxResults);
    const limit = clampInteger(data.limit, 80, 0, 300);

    const files = await walkWorkspaceFiles(context.workspaceRoot, data.path || ".", {
      include: data.include,
      maxFiles: 3000,
      maxFileBytes: 768 * 1024,
    });

    const matches: Array<{ file: string; line: number; content: string; before: string[]; after: string[] }> = [];
    const counts = new Map<string, number>();

    for (const file of files) {
      if (matches.length >= maxResults) break;
      let text: string;
      try {
        text = (await readTextFile(file.absolutePath)).text;
      } catch {
        continue;
      }
      const lines = text.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        if (regex.test(lines[index])) {
          counts.set(file.workspacePath, (counts.get(file.workspacePath) ?? 0) + 1);
          if (outputMode === "content") {
            matches.push({
              file: file.workspacePath,
              line: index + 1,
              content: lines[index].slice(0, 260),
              before: before > 0 ? lines.slice(Math.max(0, index - before), index).map((line) => line.slice(0, 260)) : [],
              after: after > 0 ? lines.slice(index + 1, index + 1 + after).map((line) => line.slice(0, 260)) : [],
            });
          }
        }
        regex.lastIndex = 0;
        if (matches.length >= maxResults) break;
      }
    }

    if (outputMode === "files") {
      const allFiles = [...counts.keys()];
      const window = limit === 0 ? allFiles.slice(offset) : allFiles.slice(offset, offset + limit);
      return {
        ok: true,
        output: window.join("\n") || `No matches for ${pattern}.`,
        metadata: { pattern, fileCount: allFiles.length, displayed: window.length, offset, hasMore: offset + window.length < allFiles.length },
      };
    }

    if (outputMode === "count") {
      const rows = [...counts.entries()].map(([file, count]) => `${file}:${count}`);
      const window = limit === 0 ? rows.slice(offset) : rows.slice(offset, offset + limit);
      return {
        ok: true,
        output: window.join("\n") || `No matches for ${pattern}.`,
        metadata: { pattern, totalMatches: [...counts.values()].reduce((sum, count) => sum + count, 0), fileCount: counts.size },
      };
    }

    const window = limit === 0 ? matches.slice(offset) : matches.slice(offset, offset + limit);
    const blocks = window.map((match) => {
      const lines: string[] = [];
      match.before.forEach((line, index) => {
        lines.push(`${match.file}-${match.line - match.before.length + index}: ${line}`);
      });
      lines.push(`${match.file}:${match.line}: ${match.content}`);
      match.after.forEach((line, index) => {
        lines.push(`${match.file}-${match.line + index + 1}: ${line}`);
      });
      return lines.join("\n");
    });

    return {
      ok: true,
      output: blocks.join("\n--\n") || `No matches for ${pattern}.`,
      metadata: {
        pattern,
        matches: matches.length,
        filesWithMatches: counts.size,
        displayed: window.length,
        offset,
        hasMore: offset + window.length < matches.length,
      },
    };
  },
};
