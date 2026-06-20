import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoRoot = path.join(root, "demo-project");

await fs.rm(demoRoot, { recursive: true, force: true });
await fs.mkdir(demoRoot, { recursive: true });
await fs.writeFile(
  path.join(demoRoot, "README.md"),
  [
    "# Empty Demo Workspace",
    "",
    "This workspace is intentionally empty.",
    "",
    "Try:",
    "",
    "> 用 HTML 写一个贪吃蛇游戏，并运行测试。",
    "",
  ].join("\n"),
  "utf8",
);

console.log("Demo project reset to an empty workspace.");
