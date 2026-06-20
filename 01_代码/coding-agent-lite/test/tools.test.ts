import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bashTool } from "../src/tools/bash.js";
import { editTool } from "../src/tools/edit.js";
import { globTool } from "../src/tools/glob.js";
import { grepTool } from "../src/tools/grep.js";
import { readTool } from "../src/tools/read.js";
import type { ToolContext } from "../src/tools/types.js";
import { writeTool } from "../src/tools/write.js";
import { clearFileBaselines } from "../src/tools/file-state.js";

async function makeWorkspace(): Promise<{ root: string; context: ToolContext }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-tools-"));
  return {
    root,
    context: {
      workspaceRoot: root,
      allowedCommands: ["npm test", "node --test"],
      sessionId: crypto.randomUUID(),
    },
  };
}

test("write creates nested files and read returns numbered lines", async () => {
  const { root, context } = await makeWorkspace();
  const writeResult = await writeTool.execute(
    { filePath: "src/index.html", content: "<h1>Snake</h1>\n<script>const score = 0;</script>\n" },
    context,
  );
  assert.equal(writeResult.ok, true);
  assert.equal(await fs.readFile(path.join(root, "src", "index.html"), "utf8"), "<h1>Snake</h1>\n<script>const score = 0;</script>\n");

  const readResult = await readTool.execute({ filePath: "src/index.html", offset: 1, limit: 1 }, context);
  assert.equal(readResult.ok, true);
  assert.match(readResult.output, /2 \| <script>/);
});

test("edit supports targeted and replaceAll edits", async () => {
  const { root, context } = await makeWorkspace();
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "game.js"), "const label = “snake”;\nconst speed = 1;\nconst speed = 1;\n", "utf8");
  await readTool.execute({ filePath: "src/game.js" }, context);

  const quoteResult = await editTool.execute(
    { filePath: "src/game.js", oldString: "const label = \"snake\";", newString: "const label = \"贪吃蛇\";" },
    context,
  );
  assert.equal(quoteResult.ok, true);
  assert.match(await fs.readFile(path.join(root, "src", "game.js"), "utf8"), /“贪吃蛇”/);

  const replaceAllResult = await editTool.execute(
    { filePath: "src/game.js", oldString: "const speed = 1;", newString: "const speed = 2;", replaceAll: true },
    context,
  );
  assert.equal(replaceAllResult.ok, true);
  assert.equal((await fs.readFile(path.join(root, "src", "game.js"), "utf8")).match(/speed = 2/g)?.length, 2);
  clearFileBaselines(context.sessionId);
});

test("glob and grep find created HTML game files", async () => {
  const { root, context } = await makeWorkspace();
  await fs.mkdir(path.join(root, "test"), { recursive: true });
  await fs.writeFile(path.join(root, "index.html"), "<canvas id=\"game\"></canvas>\n<script>function moveSnake(){}</script>\n", "utf8");
  await fs.writeFile(path.join(root, "test", "game.test.js"), "import test from 'node:test';\ntest('snake', () => {});\n", "utf8");

  const globResult = await globTool.execute({ pattern: "**/*.{html,js}", sortBy: "path" }, context);
  assert.equal(globResult.ok, true);
  assert.match(globResult.output, /index\.html/);
  assert.match(globResult.output, /test\/game\.test\.js/);

  const grepResult = await grepTool.execute(
    { pattern: "moveSnake", include: "*.html", isRegexp: false, outputMode: "content" },
    context,
  );
  assert.equal(grepResult.ok, true);
  assert.match(grepResult.output, /index\.html:2/);
});

test("bash runs an allowlisted npm test command inside the workspace", async () => {
  const { root, context } = await makeWorkspace();
  await fs.mkdir(path.join(root, "test"), { recursive: true });
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ type: "module", scripts: { test: "node --test" } }, null, 2),
    "utf8",
  );
  await fs.writeFile(
    path.join(root, "test", "snake.test.js"),
    "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('math', () => assert.equal(1 + 1, 2));\n",
    "utf8",
  );

  const result = await bashTool.execute({ command: "npm test", timeout: 30_000 }, context);
  assert.equal(result.ok, true, result.output);
  assert.match(result.output, /Status: passed/);
});
