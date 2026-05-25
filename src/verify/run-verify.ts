import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

import {
  annotateRepeatedFailures,
  type FailureAnnotation,
} from "../evidence/failure-signatures.js";
import { writeEvidence } from "../evidence/write-evidence.js";
import { parseYamlWithSchema } from "../schemas/common.js";
import { validationSchema } from "../schemas/validation.js";
import { commandIndexSchema } from "../schemas/command-index.js";
import { getChangedFiles } from "../validation/changed-files.js";
import {
  classifyChangedFiles,
  type ChangedFileClassification,
} from "../validation/classify-changed-files.js";
import {
  runValidationCommand,
  type CommandExecutionResult,
} from "../validation/run-command.js";
import {
  routeValidation,
  type RiskIndex,
  type ValidationRoute,
} from "../validation/route-validation.js";

export type VerifyOptions = {
  cwd: string;
  changed?: boolean;
  dryRun?: boolean;
  mode?: string;
  paths?: string[];
  writeEvidence?: boolean;
  noPrune?: boolean;
};

export type VerifyReport = {
  cwd: string;
  ok: boolean;
  dryRun: boolean;
  route: ValidationRoute;
  commandResults: CommandExecutionResult[];
  failureAnnotations: FailureAnnotation[];
  evidencePath?: string;
  classification: ChangedFileClassification;
};

export function runVerify(options: VerifyOptions): VerifyReport {
  const validation = readValidationConfig(options.cwd);
  const commandIndex = readCommandIndex(options.cwd);
  const riskIndex = readRiskIndex(options.cwd);
  const changedFiles = options.changed ? getChangedFiles(options.cwd) : [];
  const classification = classifyChangedFiles(
    options.paths?.length ? options.paths : changedFiles,
  );
  const route = routeValidation({
    changedFiles: classification.routeFiles,
    allChangedFiles: classification.all,
    commandIndex,
    forcedMode: options.mode,
    allowDefaultFallback: classification.routeFiles.length > 0,
    riskIndex,
    validation,
  });
  const commandResults = options.dryRun
    ? route.commands.map((command) => ({
        command: command.command,
        result: "not_run" as const,
        exitCode: null,
        output: command.reason,
      }))
    : route.commands.map((command) =>
        runValidationCommand(options.cwd, command.command),
      );
  const ok = commandResults.every((result) => result.result !== "fail");
  const failureAnnotations = annotateRepeatedFailures({
    cwd: options.cwd,
    commandResults,
  });
  const report: VerifyReport = {
    cwd: options.cwd,
    ok,
    dryRun: Boolean(options.dryRun),
    route,
    commandResults,
    failureAnnotations,
    classification,
  };

  if (options.writeEvidence) {
    report.evidencePath = writeEvidence({
      cwd: options.cwd,
      route,
      commandResults,
      failureAnnotations,
      noPrune: options.noPrune,
    }).path;
  }

  return report;
}

function readCommandIndex(cwd: string) {
  const commandIndexPath = join(cwd, ".greenhouse", "grown", "command-index.yaml");

  if (!existsSync(commandIndexPath)) {
    return undefined;
  }

  return parseYamlWithSchema(
    readFileSync(commandIndexPath, "utf8"),
    commandIndexSchema,
  );
}

export function formatVerifyReport(report: VerifyReport): string {
  const lines = [
    "# Greenhouse Verify Report",
    "",
    `Repository: ${report.cwd}`,
    `Mode: ${report.route.mode}`,
    `Run mode: ${report.dryRun ? "dry-run" : "execute"}`,
    `Status: ${report.ok ? "pass" : "fail"}`,
    "",
    "## Changed files",
    "",
  ];

  if ((report.route.allChangedFiles ?? report.route.changedFiles).length === 0) {
    lines.push("- none");
  } else {
    for (const file of report.route.allChangedFiles ?? report.route.changedFiles) {
      lines.push(`- ${file}`);
    }
  }

  lines.push("", "## Changed file groups", "");
  for (const [category, files] of Object.entries(report.classification.groups)) {
    lines.push(`- ${category}: ${files.length === 0 ? "none" : files.join(", ")}`);
  }

  lines.push("", "## Routed files", "");
  if (report.route.changedFiles.length === 0) {
    lines.push("- none");
  } else {
    for (const file of report.route.changedFiles) {
      lines.push(`- ${file}`);
    }
  }

  lines.push("", "## Risks", "");
  if (report.route.risks.length === 0) {
    lines.push("- none");
  } else {
    for (const risk of report.route.risks) {
      lines.push(`- ${risk}`);
    }
  }

  lines.push("", "## Route explanation", "");
  if (report.route.explanations.length === 0) {
    lines.push("- none");
  } else {
    for (const explanation of report.route.explanations) {
      lines.push(`- ${explanation.kind}: ${explanation.message}`);
    }
  }

  lines.push("", "## Commands", "");
  if (report.route.commands.length === 0) {
    lines.push(`- skipped: ${report.route.skippedValidation}`);
  } else {
    for (const command of report.route.commands) {
      const result = report.commandResults.find(
        (item) => item.command === command.command,
      );
      const annotation = report.failureAnnotations.find(
        (item) => item.command === command.command,
      );
      const annotationText = annotation ? ` - ${annotation.message}` : "";
      lines.push(
        `- ${result?.result ?? "not_run"}: ${command.command}`,
      );
      lines.push(`  - source: ${command.source}${command.matched ? ` (${command.matched})` : ""}`);
      lines.push(`  - reason: ${command.reason}${annotationText}`);
    }
  }

  lines.push("", "## Repeated failures", "");
  if (report.failureAnnotations.length === 0) {
    lines.push("- none");
  } else {
    for (const annotation of report.failureAnnotations) {
      lines.push(
        `- ${annotation.command}: ${annotation.message} (${annotation.signatureId})`,
      );
    }
  }

  lines.push("", "## Manual checks", "");
  if (report.route.manualChecks.length === 0) {
    lines.push("- none");
  } else {
    for (const check of report.route.manualChecks) {
      lines.push(`- pending: ${check.prompt}`);
      lines.push(`  - source: ${check.source}${check.matched ? ` (${check.matched})` : ""}`);
      lines.push(`  - reason: ${check.reason}`);
    }
  }

  lines.push("", "## Skipped validation", "");
  lines.push(report.route.skippedValidation ?? "No validation was skipped.");

  if (report.evidencePath) {
    lines.push("", `Evidence written: ${report.evidencePath}`);
  }

  lines.push("");
  return lines.join("\n");
}

function readValidationConfig(cwd: string) {
  const validationPath = join(cwd, ".greenhouse", "roots", "validation.yaml");
  return parseYamlWithSchema(readFileSync(validationPath, "utf8"), validationSchema);
}

function readRiskIndex(cwd: string): RiskIndex | undefined {
  const riskIndexPath = join(cwd, ".greenhouse", "grown", "risk-index.yaml");

  if (!existsSync(riskIndexPath)) {
    return undefined;
  }

  return parseYaml(readFileSync(riskIndexPath, "utf8")) as RiskIndex;
}
