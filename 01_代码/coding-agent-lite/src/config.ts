import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const defaultAllowedCommands = [
  "npm test",
  "node --test",
  "npm run test",
  "npm run build",
  "npm run check",
  "bun test",
];

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  projectRoot,
  port: positiveInt(process.env.PORT, 3000),
  model: process.env.OPENAI_MODEL || "cx/gpt-5.5",
  apiKey: process.env.OPENAI_API_KEY || "",
  baseURL: process.env.OPENAI_BASE_URL || "http://67.209.179.201:20128/v1",
  maxAgentSteps: positiveInt(process.env.MAX_AGENT_STEPS, 50),
  maxContextMessages: positiveInt(process.env.MAX_CONTEXT_MESSAGES, 36),
  workspaceDir: path.resolve(projectRoot, process.env.WORKSPACE_DIR || "demo-project"),
  allowedCommands: (process.env.ALLOWED_COMMANDS || defaultAllowedCommands.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  publicDir: path.resolve(projectRoot, "public"),
  traceDir: path.resolve(projectRoot, "runtime-data", "traces"),
};
