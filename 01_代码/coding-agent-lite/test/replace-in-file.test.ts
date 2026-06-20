import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { replaceInFileTool } from "../src/tools/replace-in-file.js";

test("replace_in_file edits one exact occurrence", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-edit-"));
  await fs.writeFile(path.join(root, "a.txt"), "hello world", "utf8");
  const result = await replaceInFileTool.execute(
    { path: "a.txt", old_text: "world", new_text: "agent" },
    { workspaceRoot: root, allowedCommands: [] },
  );
  assert.equal(result.ok, true);
  assert.equal(await fs.readFile(path.join(root, "a.txt"), "utf8"), "hello agent");
});

test("replace_in_file refuses ambiguous matches", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-edit-"));
  await fs.writeFile(path.join(root, "a.txt"), "x x", "utf8");
  const result = await replaceInFileTool.execute(
    { path: "a.txt", old_text: "x", new_text: "y" },
    { workspaceRoot: root, allowedCommands: [] },
  );
  assert.equal(result.ok, false);
  assert.match(result.output, /matched 2 times/);
});
