import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { ZodError, type ZodType } from "zod";

import { pruneGeneratedRecords } from "../evidence/prune.js";
import { commandIndexSchema } from "../schemas/command-index.js";
import {
  contextManifestSchema,
  type ContextManifest,
} from "../schemas/context-manifest.js";
import { parseYamlWithSchema } from "../schemas/common.js";
import { evidenceIndexSchema } from "../schemas/evidence-index.js";
import { failureSignaturesSchema } from "../schemas/failure-signatures.js";
import { docsRootSchema, type DocsRoot } from "../schemas/docs-root.js";
import { projectSchema, type ProjectConfig } from "../schemas/project.js";
import { repoMapSchema, type RepoMap } from "../schemas/repo-map.js";
import { repoShapeSchema } from "../schemas/repo-shape.js";
import { validationSchema } from "../schemas/validation.js";
import { validationProposalsSchema } from "../schemas/validation-proposals.js";
import { GREENHOUSE_TEMPLATE_VERSION } from "../version.js";
import {
  mvpInstalledDirectories,
  mvpInstalledTreePaths,
} from "../templates/installed-tree.js";

export type DoctorSeverity = "error" | "warning";

export type DoctorFinding = {
  severity: DoctorSeverity;
  check: string;
  message: string;
  path?: string;
};

export type DoctorReport = {
  cwd: string;
  greenhousePath: string;
  ok: boolean;
  findings: DoctorFinding[];
  writtenReportPath?: string;
};

export type RunDoctorOptions = {
  cwd: string;
  writeReport?: boolean;
  noPrune?: boolean;
};

const schemaFiles: Array<{ path: string; schema: ZodType<unknown> }> = [
  {
    path: "project.yaml",
    schema: projectSchema,
  },
  {
    path: "roots/validation.yaml",
    schema: validationSchema,
  },
  {
    path: "roots/docs.yaml",
    schema: docsRootSchema,
  },
  {
    path: "grown/repo-map.yaml",
    schema: repoMapSchema,
  },
  {
    path: "grown/repo-shape.yaml",
    schema: repoShapeSchema,
  },
  {
    path: "grown/command-index.yaml",
    schema: commandIndexSchema,
  },
  {
    path: "grown/validation-proposals.yaml",
    schema: validationProposalsSchema,
  },
  {
    path: "grown/evidence-index.yaml",
    schema: evidenceIndexSchema,
  },
  {
    path: "grown/failure-signatures.yaml",
    schema: failureSignaturesSchema,
  },
  {
    path: "context/manifest.yaml",
    schema: contextManifestSchema,
  },
];

const expectedPackageAliases = new Map([
  ["greenhouse", "greenhouse-spec"],
  ["greenhouse:status", "greenhouse-spec status"],
  ["greenhouse:tend", "greenhouse-spec tend"],
  ["greenhouse:tend:check", "greenhouse-spec tend --check"],
  ["greenhouse:verify:dry", "greenhouse-spec verify --changed --dry-run"],
  ["greenhouse:proposals", "greenhouse-spec proposals"],
  ["check:greenhouse", "greenhouse-spec doctor"],
  ["check:changed", "greenhouse-spec verify --changed"],
  ["check:changed:evidence", "greenhouse-spec verify --changed --write-evidence"],
  ["validate:scope", "greenhouse-spec verify --paths"],
  ["tend", "greenhouse-spec tend"],
  ["check:tend", "greenhouse-spec tend --check"],
]);

export function runDoctor(options: RunDoctorOptions): DoctorReport {
  const cwd = options.cwd;
  const greenhousePath = join(cwd, ".greenhouse");
  const findings: DoctorFinding[] = [];

  for (const directory of mvpInstalledDirectories) {
    const path = join(greenhousePath, directory);
    if (!existsSync(path)) {
      findings.push({
        severity: "error",
        check: "required-directory",
        message: `Missing required directory: .greenhouse/${directory}`,
        path: formatPath(cwd, path),
      });
    }
  }

  for (const filePath of mvpInstalledTreePaths) {
    const path = join(greenhousePath, filePath);
    if (!existsSync(path)) {
      findings.push({
        severity: "error",
        check: "required-file",
        message: `Missing required file: .greenhouse/${filePath}`,
        path: formatPath(cwd, path),
      });
    }
  }

  const parsed = validateSchemaFiles(cwd, greenhousePath, findings);

  if (parsed.manifest) {
    validateContextManifestPaths(cwd, greenhousePath, parsed.manifest, findings);
  }

  if (parsed.docsRoot) {
    validateTrackedDocs(cwd, parsed.docsRoot, findings);
  }

  if (parsed.repoMap) {
    validateGeneratedSourceSeparation(cwd, parsed.repoMap, findings);
  }

  if (parsed.project) {
    validateProjectMetadata(cwd, parsed.project, findings);
  }

  validatePackageAliases(cwd, findings);

  const report: DoctorReport = {
    cwd,
    greenhousePath,
    ok: !findings.some((finding) => finding.severity === "error"),
    findings,
  };

  if (options.writeReport) {
    report.writtenReportPath = writeDoctorReport(report);
    if (!options.noPrune) {
      pruneGeneratedRecords({ cwd });
    }
  }

  return report;
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = [
    `# Greenhouse Doctor Report`,
    "",
    `Repository: ${report.cwd}`,
    `Status: ${report.ok ? "pass" : "fail"}`,
    "",
    "## Findings",
    "",
  ];

  if (report.findings.length === 0) {
    lines.push("No issues found.");
  } else {
    for (const finding of report.findings) {
      const path = finding.path ? ` (${finding.path})` : "";
      lines.push(
        `- ${finding.severity.toUpperCase()} [${finding.check}] ${finding.message}${path}`,
      );
    }
  }

  lines.push("");

  if (report.writtenReportPath) {
    lines.push(`Report written: ${report.writtenReportPath}`, "");
  }

  return lines.join("\n");
}

function validateSchemaFiles(
  cwd: string,
  greenhousePath: string,
  findings: DoctorFinding[],
): {
  docsRoot?: DocsRoot;
  manifest?: ContextManifest;
  repoMap?: RepoMap;
  project?: ProjectConfig;
} {
  const parsed: {
    docsRoot?: DocsRoot;
    manifest?: ContextManifest;
    repoMap?: RepoMap;
    project?: ProjectConfig;
  } = {};

  for (const schemaFile of schemaFiles) {
    const path = join(greenhousePath, schemaFile.path);

    if (!existsSync(path)) {
      continue;
    }

    try {
      const result = readYaml(path, schemaFile.schema);
      if (schemaFile.path === "project.yaml") {
        parsed.project = result as ProjectConfig;
      }
      if (schemaFile.path === "roots/docs.yaml") {
        parsed.docsRoot = result as DocsRoot;
      }
      if (schemaFile.path === "context/manifest.yaml") {
        parsed.manifest = result as ContextManifest;
      }
      if (schemaFile.path === "grown/repo-map.yaml") {
        parsed.repoMap = result as RepoMap;
      }
    } catch (error) {
      findings.push({
        severity: "error",
        check: "schema",
        message: `Invalid ${schemaFile.path}: ${formatError(error)}`,
        path: formatPath(cwd, path),
      });
    }
  }

  return parsed;
}

function validateTrackedDocs(
  cwd: string,
  docsRoot: DocsRoot,
  findings: DoctorFinding[],
): void {
  for (const doc of docsRoot.tracked_docs) {
    const path = join(cwd, doc.path);
    if (!existsSync(path)) {
      findings.push({
        severity: "warning",
        check: "tracked-doc",
        message: `Tracked docs path is missing: ${doc.path}`,
        path: formatPath(cwd, path),
      });
    }
  }
}

function validateContextManifestPaths(
  cwd: string,
  greenhousePath: string,
  manifest: ContextManifest,
  findings: DoctorFinding[],
): void {
  const contextPath = join(greenhousePath, "context");

  for (const entry of manifest.context) {
    const targetPath = join(contextPath, entry.path);
    if (!existsSync(targetPath)) {
      findings.push({
        severity: "error",
        check: "context-path",
        message: `Context entry "${entry.id}" points to missing file: ${entry.path}`,
        path: formatPath(cwd, targetPath),
      });
    }
  }
}

function validateGeneratedSourceSeparation(
  cwd: string,
  repoMap: RepoMap,
  findings: DoctorFinding[],
): void {
  const sourcePaths = new Set(repoMap.source.map((entry) => normalizePath(entry.path)));

  for (const generated of repoMap.generated) {
    if (sourcePaths.has(normalizePath(generated.path))) {
      findings.push({
        severity: "error",
        check: "repo-map-generated-source",
        message: `Generated path is also listed as source: ${generated.path}`,
        path: formatPath(cwd, join(cwd, ".greenhouse/grown/repo-map.yaml")),
      });
    }
  }
}

function validateProjectMetadata(
  cwd: string,
  project: ProjectConfig,
  findings: DoctorFinding[],
): void {
  const metadata = project.greenhouse;
  const missing = [
    "installed_version",
    "template_version",
    "install_mode",
    "cli_command",
  ].filter((key) => metadata[key as keyof typeof metadata] === undefined);

  if (missing.length > 0) {
    findings.push({
      severity: "warning",
      check: "project-metadata",
      message: `Missing Greenhouse install metadata: ${missing.join(", ")}. Run greenhouse-spec update.`,
      path: formatPath(cwd, join(cwd, ".greenhouse/project.yaml")),
    });
  }

  if (
    metadata.template_version !== undefined &&
    metadata.template_version !== GREENHOUSE_TEMPLATE_VERSION
  ) {
    findings.push({
      severity: "warning",
      check: "template-version",
      message: `Installed template version ${metadata.template_version} differs from current ${GREENHOUSE_TEMPLATE_VERSION}. Run greenhouse-spec update.`,
      path: formatPath(cwd, join(cwd, ".greenhouse/project.yaml")),
    });
  }
}

function validatePackageAliases(cwd: string, findings: DoctorFinding[]): void {
  const packageJsonPath = join(cwd, "package.json");

  if (!existsSync(packageJsonPath)) {
    return;
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    name?: string;
    scripts?: Record<string, string>;
  };
  const scripts = packageJson.scripts ?? {};
  const selfHosted = packageJson.name === "greenhouse-spec";

  for (const [scriptName, expectedCommand] of expectedPackageAliases) {
    const actualCommand = scripts[scriptName];
    const effectiveExpected =
      selfHosted && scriptName === "greenhouse"
        ? "greenhouse-spec"
        : expectedCommand;
    if (actualCommand && !isAcceptedGreenhouseAlias(actualCommand, effectiveExpected)) {
      findings.push({
        severity: "warning",
        check: "package-script-alias",
        message: `Package script "${scriptName}" points to "${actualCommand}", expected "${effectiveExpected}".`,
        path: formatPath(cwd, packageJsonPath),
      });
    }
  }
}

function isAcceptedGreenhouseAlias(
  actualCommand: string,
  expectedCommand: string,
): boolean {
  if (actualCommand === expectedCommand) {
    return true;
  }

  const expectedArgs = expectedCommand.replace(/^greenhouse-spec\s*/, "").trim();

  if (expectedArgs === "" && actualCommand === "pnpm build && node dist/cli.js") {
    return true;
  }

  const selfHostedMatch = actualCommand.match(/^pnpm greenhouse(?:\s+(.*))?$/);
  if (selfHostedMatch) {
    return isCompatibleGreenhouseArgs(selfHostedMatch[1]?.trim() ?? "", expectedArgs);
  }

  const localCliMatch = actualCommand.match(
    /^node\s+(?:"([^"]*greenhouse-spec\/dist\/cli\.js)"|'([^']*greenhouse-spec\/dist\/cli\.js)'|([^\s]*greenhouse-spec\/dist\/cli\.js))(?:\s+(.*))?$/,
  );

  if (!localCliMatch) {
    return false;
  }

  const actualArgs = localCliMatch[4]?.trim() ?? "";
  return isCompatibleGreenhouseArgs(actualArgs, expectedArgs);
}

function isCompatibleGreenhouseArgs(actualArgs: string, expectedArgs: string): boolean {
  return actualArgs === expectedArgs || (expectedArgs === "" && actualArgs === "status");
}

function writeDoctorReport(report: DoctorReport): string {
  const reportsPath = join(report.greenhousePath, "reports", "doctor");
  mkdirSync(reportsPath, { recursive: true });

  const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
  const reportPath = join(reportsPath, fileName);
  writeFileSync(reportPath, formatDoctorReport(report), "utf8");

  return reportPath;
}

function readYaml<T>(path: string, schema: ZodType<T>): T {
  return parseYamlWithSchema(readFileSync(path, "utf8"), schema);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function formatPath(cwd: string, path: string): string {
  const relativePath = relative(cwd, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function formatError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
