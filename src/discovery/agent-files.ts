import { existsSync } from "node:fs";
import { join } from "node:path";

export type AgentFileEntry = {
  path: string;
  present: boolean;
};

export const knownAgentFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  ".github/copilot-instructions.md",
  ".cursor/rules/",
] as const;

export const managedAgentInstructionFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  ".github/copilot-instructions.md",
] as const;

export function discoverAgentFiles(cwd: string): AgentFileEntry[] {
  return knownAgentFiles.map((path) => ({
    path,
    present: existsSync(join(cwd, path)),
  }));
}
