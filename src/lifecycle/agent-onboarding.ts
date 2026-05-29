import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { managedAgentInstructionFiles } from "../discovery/agent-files.js";
import type { PlannedWrite } from "../filesystem/safe-write.js";

const startMarker = "<!-- greenhouse-spec:start -->";
const endMarker = "<!-- greenhouse-spec:end -->";

const greenhouseAgentBlock = [
  startMarker,
  "## Greenhouse Validation",
  "",
  "Before finishing implementation work in this repository:",
  "",
  "- Run `greenhouse-spec status` to inspect repo health.",
  "- Run `greenhouse-spec tend` as the normal finish gate.",
  "- If structural drift is reported, run `greenhouse-spec proposals`, then review and apply safe proposals before finishing.",
  "- Treat `.greenhouse/roots/**` as authored repo policy and `.greenhouse/grown/**` as generated context.",
  "- Do not treat repeated or known failures as passing; fix them or report them clearly.",
  endMarker,
  "",
].join("\n");

export function buildAgentOnboardingWrites(cwd: string): PlannedWrite[] {
  const existingTargets = managedAgentInstructionFiles.filter((path) => {
    const targetPath = join(cwd, path);
    return existsSync(targetPath) && statSync(targetPath).isFile();
  });
  const targets = existingTargets.length > 0 ? existingTargets : ["AGENTS.md"];

  return targets.map((path) => {
    const existing = readExistingFile(cwd, path);
    return {
      relativePath: path,
      content: withGreenhouseAgentBlock(existing),
      kind: "managed",
    };
  });
}

export function withGreenhouseAgentBlock(existing: string): string {
  if (existing.includes(startMarker) && existing.includes(endMarker)) {
    const start = existing.indexOf(startMarker);
    const end = existing.indexOf(endMarker, start) + endMarker.length;
    const before = existing.slice(0, start).replace(/\s+$/u, "");
    const after = existing.slice(end).replace(/^\s+/u, "");
    return joinSections(before, greenhouseAgentBlock.trimEnd(), after);
  }

  const heading = "# Agent Instructions\n";
  const base = existing.trim().length > 0 ? existing.trimEnd() : heading.trimEnd();
  return `${base}\n\n${greenhouseAgentBlock}`;
}

function readExistingFile(cwd: string, path: string): string {
  const targetPath = join(cwd, path);
  return existsSync(targetPath) ? readFileSync(targetPath, "utf8") : "";
}

function joinSections(...sections: string[]): string {
  return `${sections.filter((section) => section.trim().length > 0).join("\n\n")}\n`;
}
