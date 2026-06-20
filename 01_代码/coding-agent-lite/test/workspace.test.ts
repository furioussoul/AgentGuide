import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveInsideWorkspace } from "../src/workspace.js";

test("resolveInsideWorkspace accepts a path inside root", () => {
  const root = path.resolve("/tmp/workspace");
  assert.equal(resolveInsideWorkspace(root, "src/a.ts"), path.join(root, "src/a.ts"));
});

test("resolveInsideWorkspace rejects path traversal", () => {
  const root = path.resolve("/tmp/workspace");
  assert.throws(() => resolveInsideWorkspace(root, "../secret.txt"), /escapes workspace/);
});
