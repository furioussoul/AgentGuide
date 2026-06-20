import path from "node:path";

export function resolveInsideWorkspace(workspaceRoot: string, requestedPath: string): string {
  const root = path.resolve(workspaceRoot);
  const target = path.resolve(root, requestedPath || ".");
  const relative = path.relative(root, target);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace: ${requestedPath}`);
  }
  return target;
}

export function toWorkspacePath(workspaceRoot: string, absolutePath: string): string {
  return path.relative(path.resolve(workspaceRoot), absolutePath) || ".";
}
