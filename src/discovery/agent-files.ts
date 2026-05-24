import { existsSync } from "node:fs";
import { join } from "node:path";

export type AgentFileEntry = {
  path: string;
  present: boolean;
};

const knownAgentFiles = ["AGENTS.md", "CLAUDE.md", ".cursor/rules/"] as const;

export function discoverAgentFiles(cwd: string): AgentFileEntry[] {
  return knownAgentFiles.map((path) => ({
    path,
    present: existsSync(join(cwd, path)),
  }));
}
