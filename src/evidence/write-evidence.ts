import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { writeEvidenceIndex } from "./evidence-index.js";
import {
  failureExcerpt,
  type FailureAnnotation,
  writeFailureSignatures,
} from "./failure-signatures.js";
import { pruneGeneratedRecords } from "./prune.js";
import type { ImpactWarning } from "../impact/detect-change-impact.js";
import type { CommandExecutionResult } from "../validation/run-command.js";
import type { ValidationRoute } from "../validation/route-validation.js";

export type EvidenceWriteResult = {
  path: string;
};

export function writeEvidence(options: {
  cwd: string;
  route: ValidationRoute;
  commandResults: CommandExecutionResult[];
  failureAnnotations?: FailureAnnotation[];
  impactWarnings?: ImpactWarning[];
  noPrune?: boolean;
}): EvidenceWriteResult {
  const evidenceDirectory = join(options.cwd, ".greenhouse", "evidence");
  mkdirSync(evidenceDirectory, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const evidencePath = join(evidenceDirectory, `${timestamp}-verify.md`);
  writeFileSync(evidencePath, formatEvidence(options), "utf8");

  if (!options.noPrune) {
    pruneGeneratedRecords({ cwd: options.cwd });
  }
  writeEvidenceIndex(options.cwd);
  writeFailureSignatures(options.cwd);

  return { path: evidencePath };
}

function formatEvidence(options: {
  route: ValidationRoute;
  commandResults: CommandExecutionResult[];
  failureAnnotations?: FailureAnnotation[];
  impactWarnings?: ImpactWarning[];
}): string {
  const lines = [
    `# Verification: verify-${new Date().toISOString().slice(0, 10)}`,
    "",
    "## Summary",
    "",
    `- Change mode: ${options.route.mode}`,
    `- Changed files: ${options.route.changedFiles.join(", ") || "none"}`,
    `- Risks: ${options.route.risks.join(", ") || "none"}`,
    "- Context loaded: none",
    "",
    "## Commands run",
    "",
    "| Command | Result | Notes |",
    "|---|---:|---|",
  ];

  for (const result of options.commandResults) {
    const annotation = options.failureAnnotations?.find(
      (item) => item.command === result.command,
    );
    const notes = [
      annotation?.message,
      result.output
        ? result.result === "fail"
          ? failureExcerpt(result.output)
          : summarize(result.output)
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    lines.push(`| \`${result.command}\` | ${result.result} | ${notes} |`);
  }

  if (options.commandResults.length === 0) {
    lines.push("| none | not run | No commands were selected. |");
  }

  lines.push(
    "",
    "## Manual checks",
    "",
    "| Check | Result | Evidence |",
    "|---|---:|---|",
  );

  for (const check of options.route.manualChecks) {
    lines.push(`| ${check.prompt} | pending | ${check.reason} |`);
  }

  if (options.route.manualChecks.length === 0) {
    lines.push("| none | pass | No manual checks selected. |");
  }

  lines.push(
    "",
    "## Impact warnings",
    "",
    "| Severity | Kind | Changed files | Affected | Reason |",
    "|---|---|---|---|---|",
  );

  for (const warning of options.impactWarnings ?? []) {
    lines.push(
      `| ${warning.severity} | ${warning.kind} | ${warning.changedFiles.join(", ") || "none"} | ${warning.affected.join(", ") || "none"} | ${sanitizeCell(warning.reason)} |`,
    );
  }

  if ((options.impactWarnings ?? []).length === 0) {
    lines.push("| none | none | none | none | No impact warnings detected. |");
  }

  lines.push(
    "",
    "## Blocked or skipped validation",
    "",
    options.route.skippedValidation ?? "No validation was skipped.",
    "",
    "## Regressions or gaps",
    "",
    "None recorded.",
    "",
    "## Durable learnings",
    "",
    "- [ ] no durable updates needed",
    "- [ ] propose validation update",
    "- [ ] propose rule update",
    "- [ ] propose skill/doc update",
    "",
  );

  return lines.join("\n");
}

function summarize(output: string): string {
  return output.replace(/\s+/g, " ").slice(0, 180).replace(/\|/g, "\\|");
}

function sanitizeCell(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\|/g, "\\|");
}
