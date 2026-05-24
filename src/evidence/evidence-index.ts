import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { stringify as stringifyYaml } from "yaml";

import type { EvidenceIndex } from "../schemas/evidence-index.js";

const maxRecentEvidenceEntries = 20;

export function writeEvidenceIndex(cwd: string): string {
  const indexPath = join(cwd, ".greenhouse", "grown", "evidence-index.yaml");
  mkdirSync(dirname(indexPath), { recursive: true });
  writeFileSync(indexPath, stringifyYaml(buildEvidenceIndex(cwd), { lineWidth: 0 }), "utf8");
  return indexPath;
}

export function buildEvidenceIndex(cwd: string): EvidenceIndex {
  const evidenceDirectory = join(cwd, ".greenhouse", "evidence");
  const evidenceFiles = existsSync(evidenceDirectory)
    ? readdirSync(evidenceDirectory)
        .filter((file) => file.endsWith(".md"))
        .map((file) => join(evidenceDirectory, file))
        .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)
        .slice(0, maxRecentEvidenceEntries)
    : [];

  return {
    schema_version: 1,
    managed_by: "greenhouse-spec",
    generated_at: new Date().toISOString(),
    policy: {
      agent_reading:
        "Do not bulk-read evidence. Read specific evidence only when continuing a change, debugging validation, or following a tend/report pointer.",
      retention:
        "Keep recent evidence indexed here; archive or prune old records when they no longer help future validation decisions.",
    },
    recent: evidenceFiles.map((path) => ({
      path: relative(join(cwd, ".greenhouse"), path).replace(/\\/g, "/"),
      modified_at: new Date(statSync(path).mtimeMs).toISOString(),
      summary: summarizeEvidence(path),
    })),
  };
}

function summarizeEvidence(path: string): string {
  const content = readFileSync(path, "utf8");
  const heading = content
    .split("\n")
    .find((line) => line.startsWith("# "))
    ?.replace(/^#\s+/, "")
    .trim();

  const mode = content.match(/Change mode:\s*([^\n]+)/i)?.[1]?.trim();
  const changedFiles = content.match(/Changed files:\s*([^\n]+)/i)?.[1]?.trim();

  return [heading, mode ? `mode ${mode}` : null, changedFiles ? `files ${changedFiles}` : null]
    .filter(Boolean)
    .join("; ")
    .slice(0, 240) || "Verification evidence";
}
