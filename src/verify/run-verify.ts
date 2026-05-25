import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

import {
  annotateRepeatedFailures,
  type FailureAnnotation,
} from "../evidence/failure-signatures.js";
import { writeEvidence } from "../evidence/write-evidence.js";
import { discoverRepoShape } from "../discovery/repo-shape.js";
import {
  detectChangeImpact,
  type ImpactWarning,
} from "../impact/detect-change-impact.js";
import { readDocsRoot } from "../impact/docs-root.js";
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
  impactWarnings: ImpactWarning[];
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
  const impactWarnings = detectChangeImpact({
    changedFiles: classification.all,
    docsRoot: readDocsRoot(options.cwd),
    repoShape: discoverRepoShape(options.cwd),
  });
  const fallbackSourceFiles = classification.groups["product-source"].filter(
    isSourceRouteDriftCandidate,
  );
  if (
    route.explanations.some((explanation) => explanation.kind === "fallback-default") &&
    fallbackSourceFiles.length > 0
  ) {
    impactWarnings.push({
      id: "impact.source-fallback-route",
      severity: "guarded",
      kind: "validation-route-drift",
      changedFiles: fallbackSourceFiles,
      affected: [".greenhouse/roots/validation.yaml"],
      reason:
        "source files used fallback validation; if this is a new repo area, add a scoped validation route.",
      resolution:
        "Add a scoped validation route for the new source area or confirm the fallback route is intentional.",
    });
  }
  impactWarnings.push(
    ...detectMissingPackageScriptImpacts({
      cwd: options.cwd,
      route,
    }),
  );
  const report: VerifyReport = {
    cwd: options.cwd,
    ok,
    dryRun: Boolean(options.dryRun),
    route,
    commandResults,
    failureAnnotations,
    impactWarnings,
    classification,
  };

  if (options.writeEvidence) {
    report.evidencePath = writeEvidence({
      cwd: options.cwd,
      route,
      commandResults,
      failureAnnotations,
      impactWarnings,
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
  const consideredFiles = report.route.allChangedFiles ?? report.route.changedFiles;
  const commandCount = report.route.commands.length;
  const manualCheckCount = report.route.manualChecks.length;
  const validationAction = report.dryRun ? "selected" : "executed";
  const unroutedFiles = consideredFiles.filter(
    (file) => !report.route.changedFiles.includes(file),
  );
  const lines = [
    "# Greenhouse Verify",
    "",
    `Repository: ${report.cwd}`,
    `Mode: ${report.route.mode}`,
    `Run mode: ${report.dryRun ? "dry-run" : "execute"}`,
    `Status: ${report.ok ? "pass" : "fail"}`,
    "",
    "## Changed",
    "",
  ];

  if (consideredFiles.length === 0) {
    lines.push("- none");
  } else {
    lines.push(
      `- ${consideredFiles.length} file${consideredFiles.length === 1 ? "" : "s"} considered`,
    );
    lines.push(`- ${report.route.changedFiles.length} routed for validation`);
    for (const file of consideredFiles) {
      lines.push(`- ${file}`);
    }
  }

  lines.push("", "## Groups", "");
  for (const [category, files] of Object.entries(report.classification.groups)) {
    lines.push(
      `- ${category}: ${files.length === 0 ? "none" : files.join(", ")}`,
    );
  }

  lines.push("", "## Impact", "");
  if (report.impactWarnings.length === 0) {
    lines.push("- none");
  } else {
    lines.push(`- summary: ${formatImpactSummary(report.impactWarnings)}`);
    for (const warning of report.impactWarnings) {
      lines.push(`- ${warning.severity}: ${warning.reason}`);
      lines.push(`  - changed: ${warning.changedFiles.join(", ")}`);
      lines.push(`  - affected: ${warning.affected.join(", ")}`);
      lines.push(`  - resolution: ${warning.resolution}`);
    }
  }

  lines.push("", "## Routing", "");
  lines.push(
    `- coverage: ${report.route.changedFiles.length}/${consideredFiles.length} file(s) routed`,
  );
  lines.push(
    `- validation: ${commandCount === 0 ? "no commands selected" : `${commandCount} ${pluralize("command", commandCount)} ${validationAction}`}`,
  );
  lines.push(
    `- manual checks: ${manualCheckCount === 0 ? "none" : `${manualCheckCount} pending`}`,
  );
  lines.push(`- mode: ${report.route.mode}`);

  if (report.route.risks.length === 0) {
    lines.push("- risks: none");
  } else {
    lines.push(`- risks: ${report.route.risks.join(", ")}`);
  }
  if (report.route.explanations.length === 0) {
    lines.push("- explanation: none");
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
      lines.push(
        `  - source: ${command.source}${command.matched ? ` (${command.matched})` : ""}`,
      );
      lines.push(`  - reason: ${command.reason}${annotationText}`);
    }
  }

  lines.push("", "## Manual Checks", "");
  if (report.route.manualChecks.length === 0) {
    lines.push("- none");
  } else {
    for (const check of report.route.manualChecks) {
      lines.push(`- pending: ${check.prompt}`);
      lines.push(
        `  - source: ${check.source}${check.matched ? ` (${check.matched})` : ""}`,
      );
      lines.push(`  - reason: ${check.reason}`);
    }
  }

  lines.push("", "## Repeated Failures", "");
  if (report.failureAnnotations.length === 0) {
    lines.push("- none");
  } else {
    for (const annotation of report.failureAnnotations) {
      lines.push(
        `- ${annotation.command}: ${annotation.message} (${annotation.signatureId})`,
      );
    }
  }

  lines.push("", "## Skipped / Excluded", "");
  if (unroutedFiles.length === 0 && !report.route.skippedValidation) {
    lines.push("- none");
  } else {
    if (unroutedFiles.length > 0) {
      for (const file of unroutedFiles) {
        lines.push(`- excluded: ${file}`);
      }
    }
    if (report.route.skippedValidation) {
      lines.push(`- skipped: ${report.route.skippedValidation}`);
    }
  }

  if (report.evidencePath) {
    lines.push("", "## Evidence", "", `- written: ${report.evidencePath}`);
  }

  lines.push("", "## Next", "", `- ${formatVerifyNextStep(report)}`);

  lines.push("");
  return lines.join("\n");
}

function detectMissingPackageScriptImpacts(options: {
  cwd: string;
  route: ValidationRoute;
}): ImpactWarning[] {
  const scripts = readPackageScripts(options.cwd);
  if (!scripts) {
    return [];
  }

  return options.route.commands
    .map((command): ImpactWarning | null => {
      const scriptName = simplePnpmScript(command.command);
      if (!scriptName || scripts[scriptName]) {
        return null;
      }

      return {
        id: `impact.missing-package-script.${scriptName}`,
        severity: "blocking" as const,
        kind: "validation-route-drift" as const,
        changedFiles: options.route.allChangedFiles ?? options.route.changedFiles,
        affected: [
          "package.json",
          ".greenhouse/roots/validation.yaml",
          `command: ${command.command}`,
        ],
        reason: `selected validation command "${command.command}" references missing package script "${scriptName}".`,
        resolution: `Add package script "${scriptName}" to package.json or update .greenhouse/roots/validation.yaml to a command that exists.`,
      };
    })
    .filter((warning): warning is ImpactWarning => warning !== null);
}

function readPackageScripts(cwd: string): Record<string, string> | null {
  const packageJsonPath = join(cwd, "package.json");
  if (!existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    return parsed.scripts ?? {};
  } catch {
    return null;
  }
}

function simplePnpmScript(command: string): string | null {
  const parts = command.trim().split(/\s+/);
  if (parts[0] !== "pnpm") {
    return null;
  }

  if (parts.length === 2 && isScriptName(parts[1])) {
    return parts[1];
  }

  if (parts.length === 3 && parts[1] === "run" && isScriptName(parts[2])) {
    return parts[2];
  }

  return null;
}

function isScriptName(value: string | undefined): value is string {
  const pnpmBuiltins = new Set([
    "add",
    "audit",
    "dlx",
    "exec",
    "install",
    "link",
    "remove",
    "update",
  ]);
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("-") &&
    !pnpmBuiltins.has(value)
  );
}

function formatImpactSummary(warnings: ImpactWarning[]): string {
  if (warnings.length === 0) {
    return "none";
  }
  const counts = warnings
    .map((warning) => warning.severity)
    .reduce<Record<string, number>>((countsBySeverity, severity) => {
      countsBySeverity[severity] = (countsBySeverity[severity] ?? 0) + 1;
      return countsBySeverity;
    }, {});

  return Object.entries(counts)
    .map(([severity, count]) => `${count} ${severity}`)
    .join(", ");
}

function isSourceRouteDriftCandidate(file: string): boolean {
  return /\.(cjs|css|go|java|js|jsx|mjs|rs|scss|ts|tsx|vue)$/i.test(file);
}

function formatVerifyNextStep(report: VerifyReport): string {
  if (!report.ok) {
    return "fix failed command(s), then rerun greenhouse-spec tend.";
  }

  if (report.dryRun && report.route.commands.length > 0) {
    return "run greenhouse-spec tend for the normal finish gate, or rerun verify without --dry-run.";
  }

  if (report.dryRun) {
    return "no validation command is needed for these inputs.";
  }

  if (report.evidencePath) {
    return report.route.manualChecks.length > 0
      ? "review pending manual checks."
      : "validation evidence is written.";
  }

  return "rerun with --write-evidence before finishing work.";
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
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
