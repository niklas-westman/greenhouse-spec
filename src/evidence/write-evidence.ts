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

export type EvidenceTendingContext = {
  flow: string;
  state: string;
  ok: boolean;
  reason: string;
};

export type EvidenceContextLink = {
  reportPath: string;
  sourceIds: string[];
};

export function writeEvidence(options: {
  cwd: string;
  route: ValidationRoute;
  commandResults: CommandExecutionResult[];
  failureAnnotations?: FailureAnnotation[];
  impactWarnings?: ImpactWarning[];
  tending?: EvidenceTendingContext;
  context?: EvidenceContextLink;
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
  tending?: EvidenceTendingContext;
  context?: EvidenceContextLink;
}): string {
  const lines = [
    `# Verification: verify-${new Date().toISOString().slice(0, 10)}`,
    "",
    "## Summary",
    "",
    `- Change mode: ${options.route.mode}`,
    `- Changed files: ${options.route.changedFiles.join(", ") || "none"}`,
    `- Risks: ${options.route.risks.join(", ") || "none"}`,
    `- Context loaded: ${options.context?.reportPath ?? "none"}`,
    `- Evidence source: ${options.tending ? "tend" : "verify"}`,
    `- Evidence policy: bounded command excerpts; full logs are not stored by default.`,
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
    "## Route reasons",
    "",
    "| Item | Source | Reason |",
    "|---|---|---|",
  );

  for (const command of options.route.commands) {
    lines.push(
      `| \`${command.command}\` | ${command.source}${command.matched ? ` (${command.matched})` : ""} | ${sanitizeCell(command.reason)} |`,
    );
  }

  for (const explanation of options.route.explanations ?? []) {
    lines.push(
      `| ${explanation.kind} | route | ${sanitizeCell(explanation.message)} |`,
    );
  }

  if (
    options.route.commands.length === 0 &&
    (options.route.explanations ?? []).length === 0
  ) {
    lines.push("| none | none | No route reasons recorded. |");
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
    "| Severity | Kind | Changed files | Affected | Reason | Resolution |",
    "|---|---|---|---|---|---|",
  );

  for (const warning of options.impactWarnings ?? []) {
    lines.push(
      `| ${warning.severity} | ${warning.kind} | ${warning.changedFiles.join(", ") || "none"} | ${warning.affected.join(", ") || "none"} | ${sanitizeCell(warning.reason)} | ${sanitizeCell(warning.resolution)} |`,
    );
  }

  if ((options.impactWarnings ?? []).length === 0) {
    lines.push("| none | none | none | none | No impact warnings detected. | none |");
  }

  lines.push("", "## Tending state", "");
  if (options.tending) {
    lines.push(`- Flow: ${options.tending.flow}`);
    lines.push(`- State: ${options.tending.state}`);
    lines.push(`- OK: ${options.tending.ok ? "true" : "false"}`);
    lines.push(`- Reason: ${options.tending.reason}`);
  } else {
    lines.push("- not recorded: evidence was written by direct verify.");
  }

  lines.push("", "## Context used", "");
  if (options.context) {
    lines.push(`- Report: ${options.context.reportPath}`);
    if (options.context.sourceIds.length === 0) {
      lines.push("- Source IDs: none recorded");
    } else {
      lines.push("- Source IDs:");
      for (const sourceId of options.context.sourceIds) {
        lines.push(`  - ${sourceId}`);
      }
    }
  } else {
    lines.push("- none");
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
  return output
    .replace(/\/Users\/[^\s|]+/g, "<path>")
    .replace(/\/private\/[^\s|]+/g, "<path>")
    .replace(/\b[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|KEY)=([^\s|]+)/gi, "$1=<redacted>")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "<redacted-token>")
    .replace(/\s+/g, " ")
    .slice(0, 180)
    .replace(/\|/g, "\\|");
}

function sanitizeCell(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\|/g, "\\|");
}
