import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { discoverRepoShape } from "../discovery/repo-shape.js";
import { runDoctor, type DoctorReport } from "../doctor/run-doctor.js";
import {
  readFailureSignatures,
  repeatedFailureSummaries,
} from "../evidence/failure-signatures.js";
import { pruneGeneratedRecords } from "../evidence/prune.js";
import { writeEvidence } from "../evidence/write-evidence.js";
import {
  detectChangeImpact,
  type ImpactWarning,
} from "../impact/detect-change-impact.js";
import { buildValidationProposals } from "../proposals/build-proposals.js";
import type { ValidationProposal } from "../schemas/validation-proposals.js";
import { getChangedFiles } from "../validation/changed-files.js";
import { runVerify, type VerifyReport } from "../verify/run-verify.js";

export type TendProposal = {
  kind: "validation" | "protected-boundary" | "context";
  message: string;
};

export type TendState = "pass" | "warning" | "fail";

export type TendFlow = "finish-gate" | "structural-check";

export type TendValidationSummary = {
  executed: boolean;
  evidenceWritten: boolean;
  commands: string[];
  reason: string;
};

export type TendWriteSummary = {
  authoredRootsMutated: boolean;
  packageScriptsMutated: boolean;
  tendReportPath: string | null;
  evidencePath: string | null;
};

export type TendReport = {
  cwd: string;
  ok: boolean;
  state: TendState;
  flow: TendFlow;
  check: boolean;
  changedFiles: string[];
  latestEvidencePath: string | null;
  proposals: TendProposal[];
  repeatedFailures: ReturnType<typeof repeatedFailureSummaries>;
  impactWarnings: ImpactWarning[];
  doctor?: DoctorReport;
  verify?: VerifyReport;
  validation: TendValidationSummary;
  writes: TendWriteSummary;
  selfTending?: {
    total: number;
    pending: number;
    adoptable: number;
    conflicts: number;
    blocking: Array<{
      id: string;
      kind: string;
      status: string;
      target: string;
      reason: string;
    }>;
  };
  writtenReportPath?: string;
};

export function runTend(options: { cwd: string; check?: boolean; noPrune?: boolean }): TendReport {
  const changedFiles = safeChangedFiles(options.cwd);
  const latestEvidencePath = findLatestEvidence(options.cwd);
  const repoShape = discoverRepoShape(options.cwd);
  const latestEvidence = latestEvidencePath
    ? readFileSync(latestEvidencePath, "utf8")
    : "";
  const proposals = buildProposals(changedFiles, latestEvidence);
  const impactWarnings = detectChangeImpact({ changedFiles, repoShape });
  let repeatedFailures = repeatedFailureSummaries(
    readFailureSignatures(options.cwd),
  );
  const report: TendReport = {
    cwd: options.cwd,
    ok: true,
    state: "pass",
    flow: options.check ? "structural-check" : "finish-gate",
    check: Boolean(options.check),
    changedFiles,
    latestEvidencePath,
    proposals,
    repeatedFailures,
    impactWarnings,
    validation: {
      executed: false,
      evidenceWritten: false,
      commands: [],
      reason: options.check
        ? "tend --check is structural-only and does not execute validation."
        : "validation has not run yet.",
    },
    writes: {
      authoredRootsMutated: false,
      packageScriptsMutated: false,
      tendReportPath: null,
      evidencePath: null,
    },
  };

  if (options.check) {
    report.selfTending = buildSelfTendingCheck(options.cwd);
    report.ok = report.selfTending.blocking.length === 0;
    report.state = report.ok ? "pass" : "fail";
    return report;
  }

  report.doctor = runDoctor({ cwd: options.cwd });
  report.selfTending = buildSelfTendingCheck(options.cwd);

  if (!report.doctor.ok) {
    report.ok = false;
    report.state = "fail";
    report.validation.reason = "install/root health failed; validation was not run.";
    maybeWriteProposalReport(report, options);
    return report;
  }

  if (report.selfTending.blocking.length > 0) {
    report.ok = false;
    report.state = "fail";
    report.validation.reason = "structural drift blocks validation; run proposals before tending.";
    maybeWriteProposalReport(report, options);
    return report;
  }

  const dryRun = runVerify({ cwd: options.cwd, changed: true, dryRun: true });
  report.impactWarnings = dryRun.impactWarnings;
  if (dryRun.route.commands.length === 0) {
    report.verify = dryRun;
    report.validation.reason =
      dryRun.route.skippedValidation ?? "No validation commands were selected.";
  } else {
    const verify = runVerify({
      cwd: options.cwd,
      changed: true,
    });
    report.verify = verify;
    report.impactWarnings = verify.impactWarnings;
    report.ok = verify.ok;
    report.state = finalTendState(report);
    const evidence = writeEvidence({
      cwd: options.cwd,
      route: verify.route,
      commandResults: verify.commandResults,
      failureAnnotations: verify.failureAnnotations,
      impactWarnings: verify.impactWarnings,
      tending: {
        flow: report.flow,
        state: report.state,
        ok: report.ok,
        reason: verify.ok
          ? "selected validation passed."
          : "selected validation failed.",
      },
      noPrune: options.noPrune,
    });
    verify.evidencePath = evidence.path;
    report.validation = {
      executed: true,
      evidenceWritten: true,
      commands: verify.route.commands.map((command) => command.command),
      reason: verify.ok
        ? "selected validation passed."
        : "selected validation failed.",
    };
    report.writes.evidencePath = evidence.path;
    report.latestEvidencePath = evidence.path;
    repeatedFailures = repeatedFailureSummaries(readFailureSignatures(options.cwd));
    report.repeatedFailures = repeatedFailures;
  }

  report.state = finalTendState(report);
  maybeWriteProposalReport(report, options);

  return report;
}

function finalTendState(report: TendReport): TendState {
  if (!report.ok) {
    return "fail";
  }
  if (
    report.proposals.length > 0 ||
    report.impactWarnings.length > 0 ||
    report.repeatedFailures.length > 0 ||
    (report.verify?.route.manualChecks.length ?? 0) > 0
  ) {
    return "warning";
  }
  return "pass";
}

function maybeWriteProposalReport(
  report: TendReport,
  options: { cwd: string; noPrune?: boolean },
): void {
  if (report.proposals.length > 0) {
    report.writtenReportPath = writeTendReport(report);
    report.writes.tendReportPath = report.writtenReportPath;
    if (!options.noPrune) {
      pruneGeneratedRecords({ cwd: options.cwd });
    }
  }
}

export function formatTendReport(report: TendReport): string {
  const lines = [
    "# Greenhouse Tend Report",
    "",
    `Repository: ${report.cwd}`,
    `Flow: ${report.flow}`,
    `Status: ${report.state}`,
    "",
    "## Changed files",
    "",
  ];

  if (report.changedFiles.length === 0) {
    lines.push("- none");
  } else {
    for (const file of report.changedFiles) {
      lines.push(`- ${file}`);
    }
  }

  lines.push("", "## Install health", "");
  if (!report.doctor) {
    lines.push("- skipped");
  } else if (report.doctor.findings.length === 0) {
    lines.push("- pass: doctor found no issues");
  } else {
    for (const finding of report.doctor.findings) {
      lines.push(`- ${finding.severity}: ${finding.check} - ${finding.message}`);
    }
  }

  lines.push("", "## Evidence", "");
  lines.push(report.latestEvidencePath ? `- ${report.latestEvidencePath}` : "- none");

  lines.push("", "## Validation", "");
  if (report.validation.executed) {
    lines.push(
      `- executed: ${report.validation.commands.length === 0 ? "none" : report.validation.commands.join(", ")}`,
    );
  } else {
    lines.push(`- not run: ${report.validation.reason}`);
  }
  lines.push(
    `- evidence written: ${report.validation.evidenceWritten ? report.writes.evidencePath ?? "yes" : "no"}`,
  );

  lines.push("", "## Impact warnings", "");
  if (report.impactWarnings.length === 0) {
    lines.push("- none");
  } else {
    for (const warning of report.impactWarnings) {
      lines.push(`- ${warning.severity}: ${warning.reason}`);
      lines.push(`  - changed: ${warning.changedFiles.join(", ")}`);
      lines.push(`  - affected: ${warning.affected.join(", ")}`);
    }
  }

  lines.push("", "## Proposals", "");

  if (report.proposals.length === 0) {
    lines.push("No durable greenhouse updates needed.");
  } else {
    for (const proposal of report.proposals) {
      lines.push(`- ${proposal.kind}: ${proposal.message}`);
    }
  }

  lines.push("", "## Repeated failures", "");
  if (report.repeatedFailures.length === 0) {
    lines.push("- none");
  } else {
    for (const failure of report.repeatedFailures) {
      lines.push(
        `- ${failure.command}: seen ${failure.count} times, last ${failure.lastSeenAt} (${failure.normalizedFailure})`,
      );
    }
  }

  if (report.selfTending) {
    lines.push("", "## Self-tending gate", "");
    lines.push(`Total proposals: ${report.selfTending.total}`);
    lines.push(`Pending: ${report.selfTending.pending}`);
    lines.push(`Adoptable: ${report.selfTending.adoptable}`);
    lines.push(`Conflicts: ${report.selfTending.conflicts}`);
    lines.push("");

    if (report.selfTending.blocking.length === 0) {
      lines.push("No structural drift found.");
    } else {
      lines.push("Blocking proposals:");
      for (const proposal of report.selfTending.blocking) {
        lines.push(
          `- ${proposal.status}: ${proposal.id} (${proposal.kind}, ${proposal.target}) - ${proposal.reason}`,
        );
      }
      lines.push(
        "",
        "Next commands:",
        "- greenhouse-spec inspect",
        "- greenhouse-spec proposals",
        "- greenhouse-spec apply-proposals --safe --dry-run",
        "- greenhouse-spec apply-proposals --safe",
        "- greenhouse-spec adopt-proposals --id <proposal-id>",
        "- greenhouse-spec verify --changed --write-evidence",
      );
    }
  }

  if (report.writtenReportPath) {
    lines.push("", `Report written: ${report.writtenReportPath}`);
  }

  lines.push("");
  return lines.join("\n");
}

function buildSelfTendingCheck(cwd: string): NonNullable<TendReport["selfTending"]> {
  const repoShape = discoverRepoShape(cwd);
  const proposalIndex = buildValidationProposals({ cwd, repoShape });
  const blocking = proposalIndex.proposals
    .filter(isBlockingProposal)
    .map((proposal) => ({
      id: proposal.id,
      kind: proposal.kind,
      status: proposal.status,
      target: proposal.target.path,
      reason: proposal.reason,
    }));

  return {
    total: proposalIndex.proposals.length,
    pending: proposalIndex.proposals.filter((proposal) => proposal.status === "pending").length,
    adoptable: proposalIndex.proposals.filter((proposal) => proposal.status === "adoptable").length,
    conflicts: proposalIndex.proposals.filter((proposal) => proposal.status === "conflict").length,
    blocking,
  };
}

function isBlockingProposal(proposal: ValidationProposal): boolean {
  return ["pending", "adoptable", "conflict"].includes(proposal.status);
}

function buildProposals(
  changedFiles: string[],
  evidence: string,
): TendProposal[] {
  const proposals: TendProposal[] = [];
  const lowerEvidence = evidence.toLowerCase();

  if (
    lowerEvidence.includes("- [x] propose validation update") ||
    lowerEvidence.includes("| fail |") ||
    lowerEvidence.includes(" result: fail")
  ) {
    if (
      lowerEvidence.includes("fallback default required validation") &&
      changedFiles.some(isDocsPath)
    ) {
      proposals.push({
        kind: "validation",
        message:
          "Fallback validation failed on a docs-only patch; propose a README/docs path rule that runs lightweight docs validation only.",
      });
    } else if (
      lowerEvidence.includes("fallback default required validation") &&
      changedFiles.some(isCliPath)
    ) {
      proposals.push({
        kind: "validation",
        message:
          "Fallback validation failed on a CLI-only patch; propose a src/cli path rule using cli:build, test:cli, and typecheck.",
      });
    } else {
      proposals.push({
        kind: "validation",
        message:
          "Review recent evidence and consider updating `.greenhouse/roots/validation.yaml`. Authored roots were not changed.",
      });
    }
  }

  if (
    changedFiles.some((file) =>
      ["src/engine/tax/", "src/engine/sru/", "src/engine/sources/"].some(
        (prefix) => file.startsWith(prefix),
      ),
    )
  ) {
    proposals.push({
      kind: "protected-boundary",
      message:
        "Guarded domain paths changed; consider whether protected-boundaries needs a proposed update.",
    });
  }

  if (
    changedFiles.some((file) => file.startsWith("docs/") || file.startsWith("prep-docs/"))
  ) {
    proposals.push({
      kind: "context",
      message:
        "Documentation changed; consider whether context manifest entries should be proposed.",
    });
  }

  return uniqueProposals(proposals);
}

function isDocsPath(file: string): boolean {
  return (
    file === "README.md" ||
    file.endsWith(".md") ||
    file.startsWith("docs/") ||
    file.startsWith("prep-docs/")
  );
}

function isCliPath(file: string): boolean {
  return file.startsWith("src/cli/") || file.startsWith("src/tools/");
}

function writeTendReport(report: TendReport): string {
  const reportsPath = join(report.cwd, ".greenhouse", "reports", "tend");
  mkdirSync(reportsPath, { recursive: true });
  const reportPath = join(
    reportsPath,
    `${new Date().toISOString().replace(/[:.]/g, "-")}.md`,
  );
  writeFileSync(reportPath, formatTendReport({ ...report, writtenReportPath: undefined }), "utf8");
  return reportPath;
}

function findLatestEvidence(cwd: string): string | null {
  const evidencePath = join(cwd, ".greenhouse", "evidence");
  if (!existsSync(evidencePath)) {
    return null;
  }

  const files = readdirSync(evidencePath)
    .filter((file) => file.endsWith(".md"))
    .map((file) => join(evidencePath, file))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);

  return files[0] ?? null;
}

function safeChangedFiles(cwd: string): string[] {
  try {
    return getChangedFiles(cwd);
  } catch {
    return [];
  }
}

function uniqueProposals(proposals: TendProposal[]): TendProposal[] {
  const seen = new Set<string>();
  return proposals.filter((proposal) => {
    const key = `${proposal.kind}\0${proposal.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
