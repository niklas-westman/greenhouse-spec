import type { RepoMap } from "../schemas/repo-map.js";
import type { RepoShape } from "../schemas/repo-shape.js";
import type { AreaIndex } from "../schemas/area-index.js";
import type { ValidationConfig } from "../schemas/validation.js";
import type { RiskIndex } from "../validation/route-validation.js";

export function buildAreaIndex(options: {
  repoMap: RepoMap;
  repoShape: RepoShape;
  validation?: ValidationConfig | null;
  riskIndex?: RiskIndex;
}): AreaIndex {
  const validation = options.validation ?? { schema_version: 1 };
  const risks = options.riskIndex?.risks ?? [];
  const paths = new Set<string>();

  for (const entry of options.repoMap.source) {
    paths.add(normalizeAreaPath(entry.path));
  }
  for (const entry of options.repoMap.tests) {
    paths.add(normalizeAreaPath(entry.path));
  }
  for (const entry of options.repoMap.docs) {
    paths.add(normalizeAreaPath(entry.path));
  }
  for (const entry of options.repoShape.packages) {
    paths.add(entry.path);
  }
  for (const entry of options.repoShape.java_modules) {
    paths.add(entry.path);
  }
  for (const entry of options.repoShape.rust_modules) {
    paths.add(entry.path);
  }

  paths.delete(".");

  const areas = [...paths]
    .filter((path) => path.length > 0)
    .sort()
    .map((path) =>
      areaForPath({
        path,
        repoMap: options.repoMap,
        repoShape: options.repoShape,
        validation,
        risks,
      }),
    );

  return {
    schema_version: 1,
    managed_by: "greenhouse-spec",
    generated_at: new Date().toISOString(),
    policy: {
      purpose:
        "Generated map of repo areas, inferred purpose, validation coverage, and tending gaps.",
      authority:
        "Area purpose is observed status, not authored truth. Use it to propose roots, docs, memory, or validation updates.",
    },
    areas,
  };
}

function areaForPath(options: {
  path: string;
  repoMap: RepoMap;
  repoShape: RepoShape;
  validation: ValidationConfig;
  risks: NonNullable<RiskIndex["risks"]>;
}): AreaIndex["areas"][number] {
  const kind = areaKind(options.path, options.repoShape);
  const routes = matchingValidationRoutes(options.path, options.validation);
  const riskIds = options.risks
    .filter((risk) => risk.paths.some((pattern) => areaMatchesPattern(options.path, pattern)))
    .map((risk) => risk.id);
  const validationRules = routes
    .map((route) => options.validation.paths?.[route])
    .filter((rule): rule is NonNullable<ValidationConfig["paths"]>[string] =>
      Boolean(rule),
    );
  const commands = unique(
    validationRules.flatMap((rule) => rule.required.map((command) => command.command)),
  );
  const manualChecks = unique(
    validationRules.flatMap((rule) => rule.manual.map((check) => check.id)),
  );
  const signals = areaSignals(options.path, kind, options.repoMap, options.repoShape);
  const gaps = areaGaps({
    path: options.path,
    kind,
    routes,
    commands,
    manualChecks,
    riskIds,
  });

  return {
    id: areaId(options.path),
    path: options.path,
    kind,
    purpose: areaPurpose(options.path, kind),
    confidence: areaConfidence(kind, routes, signals),
    signals,
    validation: {
      status: validationStatus(routes, commands),
      routes,
      commands,
      manual_checks: manualChecks,
    },
    risks: riskIds,
    gaps,
  };
}

function areaKind(path: string, repoShape: RepoShape): string {
  const packageEntry = repoShape.packages.find((item) => item.path === path);
  if (packageEntry?.kind.includes("frontend")) {
    return "frontend-package";
  }
  if (packageEntry?.kind.includes("infra")) {
    return "infra-package";
  }
  if (packageEntry?.kind.includes("api-spec")) {
    return "api-contract-package";
  }
  if (repoShape.java_modules.some((item) => item.path === path)) {
    return "java-module";
  }
  if (repoShape.rust_modules.some((item) => item.path === path)) {
    return "rust-module";
  }
  if (path === "src/" || path.startsWith("src/")) {
    return "source-area";
  }
  if (path.startsWith("tests/") || path.includes("test")) {
    return "test-area";
  }
  if (path === "README.md" || path.startsWith("docs/") || path.startsWith("prep-docs/")) {
    return "documentation-area";
  }
  return "repo-area";
}

function areaPurpose(path: string, kind: string): string {
  if (kind === "frontend-package") {
    return "Frontend app or UI package. Changes here usually need visual, interaction, and build checks.";
  }
  if (kind === "infra-package") {
    return "Infrastructure and deployment support. Changes here can affect runtime setup or release flow.";
  }
  if (kind === "api-contract-package") {
    return "API contract or integration surface. Changes here can affect generated clients or service compatibility.";
  }
  if (kind === "java-module") {
    return "Java backend module. Changes here usually need module-specific build and test checks.";
  }
  if (kind === "rust-module") {
    return "Rust module or native runtime surface. Changes here usually need cargo checks or native smoke tests.";
  }
  if (kind === "test-area") {
    return "Automated tests and fixtures. Changes here affect how the project proves behavior.";
  }
  if (kind === "documentation-area") {
    return "Documentation and project knowledge. Changes here should make the project easier to understand.";
  }
  if (path.includes("schema")) {
    return "Shared schema or contract code. Changes here can affect validation, generated data, or API shape.";
  }
  if (path.includes("validation")) {
    return "Validation and readiness logic. Changes here affect what Greenhouse asks agents to prove.";
  }
  if (path.includes("engine")) {
    return "Domain engine code. Changes here can affect core business behavior.";
  }
  return "Main source code. Changes here usually need type, test, or build checks before finishing.";
}

function areaSignals(
  path: string,
  kind: string,
  repoMap: RepoMap,
  repoShape: RepoShape,
): string[] {
  const signals = [kind];

  if (repoMap.source.some((entry) => normalizeAreaPath(entry.path) === path)) {
    signals.push("repo-map-source");
  }
  if (repoMap.tests.some((entry) => normalizeAreaPath(entry.path) === path)) {
    signals.push("repo-map-tests");
  }
  if (repoMap.docs.some((entry) => normalizeAreaPath(entry.path) === path)) {
    signals.push("repo-map-docs");
  }

  const packageEntry = repoShape.packages.find((item) => item.path === path);
  if (packageEntry) {
    signals.push(...packageEntry.kind.map((item) => `package:${item}`));
    signals.push(...packageEntry.languages.map((item) => `language:${item}`));
    signals.push(...packageEntry.frameworks.map((item) => `framework:${item}`));
  }

  if (repoShape.java_modules.some((item) => item.path === path)) {
    signals.push("build-tool:maven");
  }
  if (repoShape.rust_modules.some((item) => item.path === path)) {
    signals.push("build-tool:cargo");
  }

  return unique(signals);
}

function areaGaps(options: {
  path: string;
  kind: string;
  routes: string[];
  commands: string[];
  manualChecks: string[];
  riskIds: string[];
}): string[] {
  const gaps: string[] = [];

  if (options.routes.length === 0 && shouldHaveValidation(options.kind)) {
    gaps.push("No direct check rule covers this area yet.");
  }
  if (options.riskIds.length > 0 && options.manualChecks.length === 0) {
    gaps.push("This risk area has no manual review step in its matching check rules.");
  }
  if (options.routes.length > 0 && options.commands.length === 0) {
    gaps.push("Matching check rules do not run any commands yet.");
  }

  return gaps;
}

function shouldHaveValidation(kind: string): boolean {
  return !["documentation-area", "repo-area"].includes(kind);
}

function matchingValidationRoutes(
  areaPath: string,
  validation: ValidationConfig,
): string[] {
  return Object.keys(validation.paths ?? {}).filter((pattern) =>
    areaMatchesPattern(areaPath, pattern),
  );
}

function areaMatchesPattern(areaPath: string, pattern: string): boolean {
  const normalizedArea = normalizeAreaPath(areaPath);
  const normalizedPattern = pattern.replace(/\\/g, "/");
  const prefix = normalizedPattern
    .replace(/\*\*.*$/, "")
    .replace(/\*.*$/, "")
    .replace(/\/+$/, "/");

  return (
    normalizedPattern === normalizedArea ||
    normalizedPattern.startsWith(normalizedArea) ||
    normalizedArea.startsWith(prefix)
  );
}

function validationStatus(routes: string[], commands: string[]): "covered" | "fallback" | "missing" {
  if (routes.length === 0) {
    return "missing";
  }
  if (commands.length === 0) {
    return "fallback";
  }
  return "covered";
}

function areaConfidence(
  kind: string,
  routes: string[],
  signals: string[],
): AreaIndex["areas"][number]["confidence"] {
  if (routes.length > 0 && signals.length > 1) {
    return "high";
  }
  if (kind === "repo-area") {
    return "low";
  }
  return "medium";
}

function normalizeAreaPath(path: string): string {
  if (path.includes("*")) {
    return path.replace(/\*\*.*$/, "").replace(/\*.*$/, "").replace(/\/+$/, "/");
  }
  return path.endsWith("/") || path.endsWith(".md") ? path : `${path}/`;
}

function areaId(path: string): string {
  return `area:${path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
