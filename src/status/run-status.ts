import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { runDoctor, type DoctorReport } from "../doctor/run-doctor.js";
import {
  readFailureSignatures,
  repeatedFailureSummaries,
} from "../evidence/failure-signatures.js";
import { runTend, type TendReport } from "../tend/run-tend.js";
import { runVerify, type VerifyReport } from "../verify/run-verify.js";

export type StatusReport = {
  cwd: string;
  ok: boolean;
  doctor: DoctorReport;
  tend: TendReport;
  verify: VerifyReport;
  repeatedFailures: ReturnType<typeof repeatedFailureSummaries>;
  latestEvidencePath: string | null;
};

export function runStatus(options: { cwd: string }): StatusReport {
  const doctor = runDoctor({ cwd: options.cwd });
  const tend = runTend({ cwd: options.cwd, check: true });
  const verify = runVerify({ cwd: options.cwd, changed: true, dryRun: true });

  return {
    cwd: options.cwd,
    ok: doctor.ok && tend.ok && verify.ok,
    doctor,
    tend,
    verify,
    repeatedFailures: repeatedFailureSummaries(readFailureSignatures(options.cwd)),
    latestEvidencePath: findLatestEvidence(options.cwd),
  };
}

export function formatStatusReport(report: StatusReport): string {
  const lines = [
    "# Greenhouse Status Report",
    "",
    `Repository: ${report.cwd}`,
    `Status: ${report.ok ? "pass" : "fail"}`,
    "",
    "## Install Health",
    "",
  ];

  if (report.doctor.findings.length === 0) {
    lines.push("- pass: doctor found no issues");
  } else {
    for (const finding of report.doctor.findings) {
      lines.push(`- ${finding.severity}: ${finding.check} - ${finding.message}`);
    }
  }

  lines.push("", "## Self-tending", "");
  if (!report.tend.selfTending) {
    lines.push("- skipped: tend check did not run");
  } else if (report.tend.selfTending.blocking.length === 0) {
    lines.push("- pass: no structural drift found");
  } else {
    for (const proposal of report.tend.selfTending.blocking) {
      lines.push(
        `- ${proposal.status}: ${proposal.id} (${proposal.kind}, ${proposal.target})`,
      );
    }
  }

  lines.push("", "## Changed Validation", "");
  if (report.verify.route.changedFiles.length === 0) {
    lines.push("- routed files: none");
  } else {
    lines.push(`- routed files: ${report.verify.route.changedFiles.join(", ")}`);
  }

  if (report.verify.route.commands.length === 0) {
    lines.push(`- commands: none (${report.verify.route.skippedValidation})`);
  } else {
    for (const command of report.verify.route.commands) {
      lines.push(`- command: ${command.command} (${command.reason})`);
    }
  }

  lines.push("", "## Repeated Failures", "");
  if (report.repeatedFailures.length === 0) {
    lines.push("- none");
  } else {
    for (const failure of report.repeatedFailures) {
      lines.push(
        `- ${failure.command}: seen ${failure.count} times, last ${failure.lastSeenAt} (${failure.normalizedFailure})`,
      );
    }
  }

  lines.push("", "## Evidence", "");
  lines.push(report.latestEvidencePath ? `- latest: ${report.latestEvidencePath}` : "- latest: none");

  lines.push("", "## Next Command", "");
  lines.push(nextCommand(report));
  lines.push("");

  return lines.join("\n");
}

function nextCommand(report: StatusReport): string {
  if (!report.doctor.ok) {
    return "- greenhouse-spec doctor";
  }
  if (!report.tend.ok) {
    return "- greenhouse-spec inspect && greenhouse-spec proposals";
  }
  if (report.verify.route.commands.length > 0) {
    return "- greenhouse-spec verify --changed --write-evidence";
  }
  if (report.repeatedFailures.length > 0) {
    return "- review repeated failures before assuming validation baseline is healthy";
  }
  return "- no action needed";
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

  const latest = files[0];
  return latest ? relative(cwd, latest).replace(/\\/g, "/") : null;
}
