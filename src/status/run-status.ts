import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { runDoctor, type DoctorReport } from "../doctor/run-doctor.js";
import { readEvidenceIndex } from "../evidence/evidence-index.js";
import {
  readFailureSignatures,
  repeatedFailureSummaries,
} from "../evidence/failure-signatures.js";
import type { EvidenceIndex } from "../schemas/evidence-index.js";
import { runTend, type TendReport } from "../tend/run-tend.js";
import { runVerify, type VerifyReport } from "../verify/run-verify.js";

export type HealthState = "pass" | "degraded" | "fail";

export type HealthCategory = {
  id:
    | "install"
    | "self-tending"
    | "changed-validation"
    | "repeated-failures"
    | "evidence";
  label: string;
  state: HealthState;
  summary: string;
  nextCommand?: string;
};

export type NextAction = {
  kind: "command" | "review" | "none";
  label: string;
  command: string | null;
};

export type EvidenceCoverage = {
  covered: boolean;
  path: string | null;
  status: "pass" | "fail" | "missing";
  reason: string;
};

export type StatusReport = {
  cwd: string;
  ok: boolean;
  overallStatus: HealthState;
  health: HealthCategory[];
  generatedOnlyDirty: boolean;
  evidenceCoverage: EvidenceCoverage;
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
  const repeatedFailures = repeatedFailureSummaries(readFailureSignatures(options.cwd));
  const latestEvidencePath = findLatestEvidence(options.cwd);
  const evidenceCoverage = routeEvidenceCoverage({
    evidenceIndex: readEvidenceIndex(options.cwd),
    verify,
  });
  const health = buildHealthCategories({
    doctor,
    tend,
    verify,
    evidenceCoverage,
    repeatedFailures,
    latestEvidencePath,
  });
  const overallStatus = aggregateHealth(health);

  return {
    cwd: options.cwd,
    ok: overallStatus !== "fail",
    overallStatus,
    health,
    generatedOnlyDirty: isGeneratedOnlyDirty(verify),
    evidenceCoverage,
    doctor,
    tend,
    verify,
    repeatedFailures,
    latestEvidencePath,
  };
}

export function formatStatusReport(report: StatusReport): string {
  const changedCount = report.verify.route.allChangedFiles?.length ?? report.verify.route.changedFiles.length;
  const routedCount = report.verify.route.changedFiles.length;
  const validation =
    routedCount === 0
      ? "ready; no routed changed-file validation is pending."
      : report.evidenceCoverage.covered
        ? "covered by latest passing evidence."
        : `${report.verify.route.commands.length} command(s) selected; evidence needed.`;
  const drift = report.tend.selfTending && report.tend.selfTending.blocking.length > 0
    ? `${report.tend.selfTending.blocking.length} blocking proposal(s).`
    : "none blocking.";
  const repeatedFailures = report.repeatedFailures.length === 0
    ? "none."
    : `${report.repeatedFailures.length} repeated failure signature(s).`;
  const evidence = report.latestEvidencePath
    ? report.latestEvidencePath
    : "none.";

  return [
    "Greenhouse Status",
    "",
    `Repository: ${report.cwd}`,
    `State: ${report.overallStatus}`,
    `Changed: ${changedCount} file(s), ${routedCount} routed`,
    `Generated-only dirty: ${report.generatedOnlyDirty ? "yes" : "no"}`,
    `Validation: ${validation}`,
    `Drift: ${drift}`,
    `Repeated failures: ${repeatedFailures}`,
    `Evidence: ${evidence}`,
    `Next: ${recommendedNextCommand(report) ?? "no action needed"}`,
    "",
  ].join("\n");
}

export function formatStatusVerboseReport(report: StatusReport): string {
  const lines = [
    "# Greenhouse Status Report",
    "",
    `Repository: ${report.cwd}`,
    `Status: ${report.overallStatus}`,
    "",
    "## Health Summary",
    "",
    ...report.health.map((category) => {
      const next = category.nextCommand ? ` Next: ${category.nextCommand}` : "";
      return `- ${category.state}: ${category.label} - ${category.summary}${next}`;
    }),
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
  if (report.generatedOnlyDirty) {
    lines.push(
      "- generated-only dirty: yes; generated Greenhouse artifacts do not affect validation routing.",
    );
  }

  if (report.verify.route.commands.length === 0) {
    lines.push(`- commands: none (${report.verify.route.skippedValidation})`);
  } else {
    for (const command of report.verify.route.commands) {
      lines.push(`- command: ${command.command} (${command.reason})`);
    }
  }
  lines.push(`- evidence coverage: ${report.evidenceCoverage.reason}`);

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

export function formatStatusJsonReport(report: StatusReport): string {
  return `${JSON.stringify(
    {
      schema_version: 1,
      repository: report.cwd,
      ok: report.ok,
      overallStatus: report.overallStatus,
      generatedOnlyDirty: report.generatedOnlyDirty,
      health: report.health,
      changedValidation: {
        changedFiles: report.verify.route.allChangedFiles ?? report.verify.route.changedFiles,
        routedFiles: report.verify.route.changedFiles,
        groups: report.verify.classification.groups,
        commands: report.verify.route.commands,
        skippedValidation: report.verify.route.skippedValidation,
        evidenceCoverage: report.evidenceCoverage,
      },
      repeatedFailures: report.repeatedFailures,
      latestEvidencePath: report.latestEvidencePath,
      nextCommand: recommendedNextCommand(report),
      nextAction: recommendedNextAction(report),
    },
    null,
    2,
  )}\n`;
}

function nextCommand(report: StatusReport): string {
  const command = recommendedNextCommand(report);
  if (command) {
    return `- ${command}`;
  }
  return "- no action needed";
}

function recommendedNextCommand(report: StatusReport): string | null {
  const action = recommendedNextAction(report);
  if (action.kind === "none") {
    return null;
  }
  return action.command ?? action.label;
}

function recommendedNextAction(report: StatusReport): NextAction {
  const next = report.health.find((item) => item.nextCommand)?.nextCommand;
  if (!next) {
    return {
      kind: "none",
      label: "No action needed.",
      command: null,
    };
  }

  if (next.startsWith("greenhouse-spec ")) {
    return {
      kind: "command",
      label: `Run ${next}.`,
      command: next,
    };
  }

  return {
    kind: "review",
    label: next,
    command: null,
  };
}

function buildHealthCategories(options: {
  doctor: DoctorReport;
  tend: TendReport;
  verify: VerifyReport;
  evidenceCoverage: EvidenceCoverage;
  repeatedFailures: ReturnType<typeof repeatedFailureSummaries>;
  latestEvidencePath: string | null;
}): HealthCategory[] {
  return [
    installHealth(options.doctor),
    selfTendingHealth(options.tend),
    changedValidationHealth(options.verify, options.evidenceCoverage),
    repeatedFailuresHealth(options.repeatedFailures),
    evidenceHealth(options.repeatedFailures, options.latestEvidencePath),
  ];
}

function installHealth(doctor: DoctorReport): HealthCategory {
  if (!doctor.ok) {
    return {
      id: "install",
      label: "Install health",
      state: "fail",
      summary: `${doctor.findings.length} doctor finding(s) need attention.`,
      nextCommand: "greenhouse-spec doctor",
    };
  }

  return {
    id: "install",
    label: "Install health",
    state: "pass",
    summary: "doctor found no blocking issues.",
  };
}

function selfTendingHealth(tend: TendReport): HealthCategory {
  if (!tend.ok) {
    const blocking = tend.selfTending?.blocking.length ?? 0;
    return {
      id: "self-tending",
      label: "Self-tending",
      state: "fail",
      summary: `${blocking} structural proposal(s) require review.`,
      nextCommand: "greenhouse-spec inspect && greenhouse-spec proposals",
    };
  }

  return {
    id: "self-tending",
    label: "Self-tending",
    state: "pass",
    summary: "no structural drift found.",
  };
}

function changedValidationHealth(
  verify: VerifyReport,
  evidenceCoverage: EvidenceCoverage,
): HealthCategory {
  if (!verify.ok) {
    return {
      id: "changed-validation",
      label: "Changed validation",
      state: "fail",
      summary: "changed-file validation routing failed.",
      nextCommand: "greenhouse-spec verify --changed --dry-run",
    };
  }

  if (verify.route.changedFiles.length === 0) {
    return {
      id: "changed-validation",
      label: "Changed validation",
      state: "pass",
      summary: "no routed changed-file validation is pending.",
    };
  }

  if (evidenceCoverage.covered) {
    return {
      id: "changed-validation",
      label: "Changed validation",
      state: "pass",
      summary: "latest passing evidence covers current route.",
    };
  }

  if (verify.route.commands.length > 0) {
    return {
      id: "changed-validation",
      label: "Changed validation",
      state: "degraded",
      summary: `${verify.route.commands.length} validation command(s) selected without matching passing evidence.`,
      nextCommand: "greenhouse-spec tend",
    };
  }

  return {
    id: "changed-validation",
    label: "Changed validation",
    state: "pass",
    summary: "no routed changed-file validation is pending.",
  };
}

function repeatedFailuresHealth(
  repeatedFailures: ReturnType<typeof repeatedFailureSummaries>,
): HealthCategory {
  if (repeatedFailures.length > 0) {
    return {
      id: "repeated-failures",
      label: "Repeated failures",
      state: "degraded",
      summary: `${repeatedFailures.length} repeated failure signature(s) observed.`,
      nextCommand: "review repeated failures before assuming validation baseline is healthy",
    };
  }

  return {
    id: "repeated-failures",
    label: "Repeated failures",
    state: "pass",
    summary: "no repeated failure signatures observed.",
  };
}

function evidenceHealth(
  repeatedFailures: ReturnType<typeof repeatedFailureSummaries>,
  latestEvidencePath: string | null,
): HealthCategory {
  if (repeatedFailures.length > 0 && !latestEvidencePath) {
    return {
      id: "evidence",
      label: "Evidence",
      state: "degraded",
      summary: "repeated failures exist without a latest evidence pointer.",
      nextCommand: "greenhouse-spec inspect",
    };
  }

  return {
    id: "evidence",
    label: "Evidence",
    state: "pass",
    summary: latestEvidencePath
      ? `latest evidence: ${latestEvidencePath}.`
      : "no latest evidence required.",
  };
}

function aggregateHealth(categories: HealthCategory[]): HealthState {
  if (categories.some((category) => category.state === "fail")) {
    return "fail";
  }
  if (categories.some((category) => category.state === "degraded")) {
    return "degraded";
  }
  return "pass";
}

function isGeneratedOnlyDirty(verify: VerifyReport): boolean {
  return (
    verify.classification.all.length > 0 &&
    verify.classification.groups["greenhouse-generated"].length ===
      verify.classification.all.length
  );
}

function routeEvidenceCoverage(options: {
  evidenceIndex: EvidenceIndex | null;
  verify: VerifyReport;
}): EvidenceCoverage {
  const currentFiles = options.verify.route.changedFiles;
  const currentCommands = options.verify.route.commands.map((command) => command.command);

  if (currentFiles.length === 0) {
    return {
      covered: true,
      path: null,
      status: "pass",
      reason: "no routed files require evidence.",
    };
  }

  const latest = options.evidenceIndex?.recent[0];
  if (!latest) {
    return {
      covered: false,
      path: null,
      status: "missing",
      reason: "no evidence is indexed for the current route.",
    };
  }

  const sameFiles = sameSet(currentFiles, latest.changed_files ?? []);
  const sameCommands = sameSet(currentCommands, latest.commands ?? []);
  if (!sameFiles || !sameCommands) {
    return {
      covered: false,
      path: latest.path,
      status: latest.status ?? "missing",
      reason: "latest evidence does not match current routed files and commands.",
    };
  }

  if (latest.status !== "pass") {
    return {
      covered: false,
      path: latest.path,
      status: latest.status ?? "missing",
      reason: "latest matching evidence did not pass.",
    };
  }

  return {
    covered: true,
    path: latest.path,
    status: "pass",
    reason: "latest passing evidence covers current route.",
  };
}

function sameSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every((item, index) => item === normalizedRight[index]);
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
