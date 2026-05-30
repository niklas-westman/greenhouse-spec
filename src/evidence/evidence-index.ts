import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { stringify as stringifyYaml } from "yaml";

import { parseYamlWithSchema } from "../schemas/common.js";
import { evidenceIndexSchema, type EvidenceIndex } from "../schemas/evidence-index.js";

const maxRecentEvidenceEntries = 20;

export function writeEvidenceIndex(cwd: string): string {
  const indexPath = join(cwd, ".greenhouse", "grown", "evidence-index.yaml");
  mkdirSync(dirname(indexPath), { recursive: true });
  writeFileSync(indexPath, stringifyYaml(buildEvidenceIndex(cwd), { lineWidth: 0 }), "utf8");
  return indexPath;
}

export function readEvidenceIndex(cwd: string): EvidenceIndex | null {
  const indexPath = join(cwd, ".greenhouse", "grown", "evidence-index.yaml");

  if (!existsSync(indexPath)) {
    return null;
  }

  return parseYamlWithSchema(readFileSync(indexPath, "utf8"), evidenceIndexSchema);
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
  const recent = evidenceFiles.map((path) => evidenceEntry(cwd, path));

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
    summary: evidenceSummary(recent),
    recent,
  };
}

function evidenceSummary(
  recent: EvidenceIndex["recent"],
): NonNullable<EvidenceIndex["summary"]> {
  const latestTending = recent.find((entry) => entry.tending_state);
  const latestFailuresByCommand = new Map<
    string,
    { command: string; evidence: string; notes: string }
  >();

  for (const entry of recent) {
    if (entry.status !== "fail") {
      continue;
    }
    for (const failure of entry.failed_commands ?? []) {
      if (latestFailuresByCommand.has(failure.command)) {
        continue;
      }
      latestFailuresByCommand.set(failure.command, {
        command: failure.command,
        evidence: entry.path,
        notes: failure.notes,
      });
    }
  }

  return {
    latest_tending_state: latestTending?.tending_state,
    latest_tending_evidence: latestTending?.path,
    latest_failures_by_command: [...latestFailuresByCommand.values()],
  };
}

function evidenceEntry(cwd: string, path: string): EvidenceIndex["recent"][number] {
  const content = readFileSync(path, "utf8");
  const metadata = parseEvidenceMetadata(content);

  return {
    path: relative(join(cwd, ".greenhouse"), path).replace(/\\/g, "/"),
    modified_at: new Date(statSync(path).mtimeMs).toISOString(),
    summary: summarizeEvidence(content),
    status: metadata.status,
    mode: metadata.mode,
    changed_files: metadata.changedFiles,
      commands: metadata.commands,
      context_loaded: metadata.contextLoaded,
      manual_checks: metadata.manualChecks,
    impact_warnings: metadata.impactWarnings,
    failed_commands: metadata.failedCommands,
    tending_state: metadata.tendingState,
  };
}

function summarizeEvidence(content: string): string {
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

function parseEvidenceMetadata(content: string): {
  status: "pass" | "fail";
  mode?: string;
  changedFiles: string[];
  commands: string[];
  contextLoaded: string[];
  failedCommands: Array<{
    command: string;
    notes: string;
  }>;
  manualChecks: string[];
  impactWarnings: string[];
  tendingState?: string;
} {
  const mode = content.match(/Change mode:\s*([^\n]+)/i)?.[1]?.trim();
  const changedFiles = splitCsv(
    content.match(/Changed files:\s*([^\n]+)/i)?.[1]?.trim(),
  );
  const contextLoaded = splitCsv(
    content.match(/Context loaded:\s*([^\n]+)/i)?.[1]?.trim(),
  );
  const commandRows = parseTableRows(content, "## Commands run");
  const manualRows = parseTableRows(content, "## Manual checks");
  const impactRows = parseTableRows(content, "## Impact warnings");
  const commands = commandRows
    .map((row) => row[0]?.replace(/^`|`$/g, "").trim())
    .filter((command) => Boolean(command) && command !== "none");
  const failedCommands = commandRows
    .filter((row) => row[1] === "fail")
    .map((row) => ({
      command: row[0]?.replace(/^`|`$/g, "").trim() ?? "",
      notes: row[2]?.trim() || "failed",
    }))
    .filter((row) => row.command && row.command !== "none");
  const manualChecks = manualRows
    .filter((row) => row[0] && row[0] !== "none" && row[1] === "pending")
    .map((row) => row[0]);
  const impactWarnings = impactRows
    .filter((row) => row[0] && row[0] !== "none")
    .map((row) => `${row[0]}:${row[1]}:${row[4]}`.trim());
  const tendingState = content.match(/^- State:\s*([^\n]+)/m)?.[1]?.trim();

  return {
    status: commandRows.some((row) => row[1] === "fail") ? "fail" : "pass",
    mode,
    changedFiles,
    contextLoaded,
    commands,
    failedCommands,
    manualChecks,
    impactWarnings,
    tendingState,
  };
}

function parseTableRows(content: string, heading: string): string[][] {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) {
    return [];
  }

  const rows: string[][] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) {
      break;
    }
    if (!line.startsWith("|") || line.includes("---")) {
      continue;
    }
    const row = line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim().replace(/\\\|/g, "|"));
    if (["Command", "Check", "Severity"].includes(row[0] ?? "")) {
      continue;
    }
    rows.push(row);
  }
  return rows;
}

function splitCsv(value: string | undefined): string[] {
  if (!value || value === "none") {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
