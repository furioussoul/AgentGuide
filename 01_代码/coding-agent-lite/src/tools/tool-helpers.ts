import fs from "node:fs/promises";
import path from "node:path";
import { resolveInsideWorkspace, toWorkspacePath } from "../workspace.js";

export const ignoredDirectoryNames = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

export const defaultMaxFileBytes = 768 * 1024;

export interface WalkFile {
  absolutePath: string;
  workspacePath: string;
  size: number;
  mtimeMs: number;
}

export function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

export function normalizeWorkspacePath(value: string): string {
  return value.replaceAll(path.sep, "/").replace(/^\.\/+/, "");
}

export function resolveToolPath(workspaceRoot: string, requestedPath: string | undefined, fallback = "."): string {
  return resolveInsideWorkspace(workspaceRoot, requestedPath?.trim() || fallback);
}

export function toDisplayPath(workspaceRoot: string, absolutePath: string): string {
  return normalizeWorkspacePath(toWorkspacePath(workspaceRoot, absolutePath));
}

export function isProbablyBinary(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  const sampleLength = Math.min(buffer.length, 8192);
  let suspicious = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    const byte = buffer[index];
    if (byte === 0) return true;
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious += 1;
  }
  return suspicious / sampleLength > 0.08;
}

export async function readTextFile(absolutePath: string, maxBytes = defaultMaxFileBytes): Promise<{
  text: string;
  truncated: boolean;
  size: number;
}> {
  const stats = await fs.stat(absolutePath);
  if (stats.isDirectory()) {
    throw new Error(`Path is a directory: ${absolutePath}`);
  }
  const handle = await fs.open(absolutePath, "r");
  try {
    const bytesToRead = Math.min(stats.size, maxBytes + 1);
    const buffer = Buffer.alloc(bytesToRead);
    const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0);
    const used = buffer.subarray(0, bytesRead);
    if (isProbablyBinary(used)) {
      throw new Error(`File appears to be binary: ${absolutePath}`);
    }
    const truncated = bytesRead > maxBytes || stats.size > maxBytes;
    return {
      text: used.subarray(0, Math.min(bytesRead, maxBytes)).toString("utf8"),
      truncated,
      size: stats.size,
    };
  } finally {
    await handle.close();
  }
}

function segmentPatternToRegExp(segment: string): RegExp {
  let output = "";
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index];
    if (char === "*") {
      output += "[^/]*";
    } else if (char === "?") {
      output += "[^/]";
    } else if (char === "{") {
      const end = segment.indexOf("}", index + 1);
      if (end === -1) {
        output += "\\{";
      } else {
        const options = segment
          .slice(index + 1, end)
          .split(",")
          .map((item) => item.replace(/[|\\{}()[\]^$+?.]/g, "\\$&"));
        output += `(?:${options.join("|")})`;
        index = end;
      }
    } else {
      output += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`^${output}$`);
}

function matchGlobSegments(patternSegments: string[], pathSegments: string[]): boolean {
  if (patternSegments.length === 0) return pathSegments.length === 0;
  const [first, ...restPattern] = patternSegments;
  if (first === "**") {
    if (matchGlobSegments(restPattern, pathSegments)) return true;
    return pathSegments.length > 0 && matchGlobSegments(patternSegments, pathSegments.slice(1));
  }
  if (pathSegments.length === 0) return false;
  return segmentPatternToRegExp(first).test(pathSegments[0]) && matchGlobSegments(restPattern, pathSegments.slice(1));
}

export function matchesGlob(workspacePath: string, pattern: string): boolean {
  const normalizedPattern = normalizeWorkspacePath(pattern.trim() || "**/*");
  const normalizedPath = normalizeWorkspacePath(workspacePath);
  const patternSegments = normalizedPattern.split("/").filter(Boolean);
  const pathSegments = normalizedPath.split("/").filter(Boolean);
  return matchGlobSegments(patternSegments, pathSegments);
}

export function normalizeIncludePattern(include: string | undefined): string | undefined {
  const trimmed = include?.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes("/") || trimmed.startsWith("**/")) return trimmed;
  return `**/${trimmed}`;
}

export async function walkWorkspaceFiles(
  workspaceRoot: string,
  startPath = ".",
  options: { maxFiles?: number; include?: string; maxFileBytes?: number } = {},
): Promise<WalkFile[]> {
  const start = resolveToolPath(workspaceRoot, startPath);
  const maxFiles = options.maxFiles ?? 2000;
  const maxFileBytes = options.maxFileBytes ?? Number.POSITIVE_INFINITY;
  const includePattern = normalizeIncludePattern(options.include);
  const results: WalkFile[] = [];

  async function walk(current: string): Promise<void> {
    if (results.length >= maxFiles) return;
    const entries = await fs.readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      if (ignoredDirectoryNames.has(entry.name)) continue;
      const absolutePath = path.join(current, entry.name);
      const workspacePath = toDisplayPath(workspaceRoot, absolutePath);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stats = await fs.stat(absolutePath);
      if (stats.size > maxFileBytes) continue;
      if (includePattern && !matchesGlob(workspacePath, includePattern)) continue;
      results.push({
        absolutePath,
        workspacePath,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      });
    }
  }

  await walk(start);
  return results;
}

export function countOccurrences(text: string, fragment: string): number {
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

export function lineChangeSummary(before: string, after: string): { insertions: number; deletions: number } {
  if (before === after) return { insertions: 0, deletions: 0 };
  const beforeLines = before.length ? before.split(/\r?\n/) : [];
  const afterLines = after.length ? after.split(/\r?\n/) : [];
  const commonPrefix = (() => {
    let index = 0;
    while (index < beforeLines.length && index < afterLines.length && beforeLines[index] === afterLines[index]) {
      index += 1;
    }
    return index;
  })();
  let beforeEnd = beforeLines.length - 1;
  let afterEnd = afterLines.length - 1;
  while (beforeEnd >= commonPrefix && afterEnd >= commonPrefix && beforeLines[beforeEnd] === afterLines[afterEnd]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  return {
    insertions: Math.max(0, afterEnd - commonPrefix + 1),
    deletions: Math.max(0, beforeEnd - commonPrefix + 1),
  };
}
