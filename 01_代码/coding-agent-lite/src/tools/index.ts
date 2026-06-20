import type { AgentTool } from "./types.js";
import { listFilesTool } from "./list-files.js";
import { readFileTool } from "./read-file.js";
import { searchTextTool } from "./search-text.js";
import { replaceInFileTool } from "./replace-in-file.js";
import { runCommandTool } from "./run-command.js";

export const tools: AgentTool[] = [
  listFilesTool,
  readFileTool,
  searchTextTool,
  replaceInFileTool,
  runCommandTool,
];

export const toolsByName = new Map(tools.map((tool) => [tool.definition.name, tool]));
