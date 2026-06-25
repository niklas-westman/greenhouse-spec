import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import fg from "fast-glob";
import { parseYamlWithSchema } from "../schemas/common.js";
import type { AreaIndex } from "../schemas/area-index.js";
import type { DocsRoot } from "../schemas/docs-root.js";
import type { EvidenceIndex } from "../schemas/evidence-index.js";
import type { MemoryIndex, SkillIndex } from "../schemas/knowledge-index.js";
import type { RepoMap } from "../schemas/repo-map.js";
import type { RepoShape } from "../schemas/repo-shape.js";
import {
  treeOfKnowledgeSchema,
  type TreeOfKnowledge,
  type TreeOfKnowledgeArea,
} from "../schemas/tree-of-knowledge.js";
import type { ValidationConfig } from "../schemas/validation.js";
import { matchesPath } from "../validation/path-match.js";

export type TreeOfKnowledgePage = {
  relativePath: string;
  content: string;
};

export function buildTreeOfKnowledge(options: {
  cwd: string;
  repoMap: RepoMap;
  repoShape: RepoShape;
  areaIndex: AreaIndex;
  docsRoot?: DocsRoot | null;
  validation?: ValidationConfig | null;
  memoryIndex?: MemoryIndex;
  skillIndex?: SkillIndex;
  evidenceIndex?: EvidenceIndex | null;
}): TreeOfKnowledge {
  const areaIndexByPath = new Map(
    options.areaIndex.areas.map((area) => [normalizeAreaPath(area.path), area]),
  );
  const paths = discoverKnowledgeAreaPaths(options);

  return {
    schema_version: 1,
    managed_by: "greenhouse-spec",
    generated_at: new Date().toISOString(),
    policy: {
      purpose:
        "Generated AI-facing map from repo areas to docs, rules, validation, risks, evidence, memory, and skills.",
      authority:
        "Generated tree pages are navigation status, not authored truth. Promote durable policy into .greenhouse/roots, docs, memory, or skills.",
      agent_reading:
        "Start at .greenhouse/tree-of-knowledge/index.md, then open only area pages relevant to the task or changed paths.",
    },
    generated_tree: {
      index: ".greenhouse/tree-of-knowledge/index.md",
      areas_dir: ".greenhouse/tree-of-knowledge/areas/",
    },
    areas: paths.map((path) =>
      knowledgeAreaForPath({
        path,
        areaIndexByPath,
        docsRoot: options.docsRoot,
        validation: options.validation,
        memoryIndex: options.memoryIndex,
        skillIndex: options.skillIndex,
        evidenceIndex: options.evidenceIndex,
      }),
    ),
  };
}

export function formatTreeOfKnowledgePages(tree: TreeOfKnowledge): TreeOfKnowledgePage[] {
  return [
    {
      relativePath: "tree-of-knowledge/index.md",
      content: formatTreeIndex(tree),
    },
    ...tree.areas.map((area) => ({
      relativePath: area.page_path.replace(/^\.greenhouse\//, ""),
      content: formatAreaPage(tree, area),
    })),
  ];
}

export function readTreeOfKnowledge(cwd: string): TreeOfKnowledge | null {
  const path = join(cwd, ".greenhouse", "grown", "tree-of-knowledge.yaml");
  if (!existsSync(path)) {
    return null;
  }
  return parseYamlWithSchema(readFileSync(path, "utf8"), treeOfKnowledgeSchema);
}

export function matchKnowledgeAreas(options: {
  tree: TreeOfKnowledge | null;
  task: string;
  paths: string[];
  limit?: number;
}): Array<TreeOfKnowledgeArea & { reason: string }> {
  if (!options.tree) {
    return [];
  }

  const queryTerms = terms(options.task);
  return options.tree.areas
    .map((area) => {
      const pathMatch = options.paths.find((path) => areaMatchesFile(area.path, path));
      if (pathMatch) {
        return { ...area, reason: `matched supplied path ${pathMatch}` };
      }

      const haystack = [
        area.path,
        area.kind,
        area.purpose,
        area.summary,
        ...area.docs.map((doc) => `${doc.path} ${doc.reason}`),
        ...area.memory_sources.map((source) => `${source.title ?? ""} ${source.reason}`),
        ...area.skill_sources.map((source) => `${source.title ?? ""} ${source.reason}`),
      ].join(" ").toLowerCase();
      const score = queryTerms.filter((term) => haystack.includes(term)).length;
      return score > 0 ? { ...area, reason: `matched task terms (${score})` } : null;
    })
    .filter((area): area is TreeOfKnowledgeArea & { reason: string } => Boolean(area))
    .sort((left, right) => knowledgeAreaPriority(right) - knowledgeAreaPriority(left))
    .slice(0, options.limit ?? 5);
}

function discoverKnowledgeAreaPaths(options: {
  cwd: string;
  repoMap: RepoMap;
  repoShape: RepoShape;
  areaIndex: AreaIndex;
  validation?: ValidationConfig | null;
}): string[] {
  const paths = new Set<string>();

  for (const area of options.areaIndex.areas) {
    paths.add(normalizeAreaPath(area.path));
  }
  for (const packageEntry of options.repoShape.packages) {
    if (packageEntry.path !== ".") {
      paths.add(normalizeAreaPath(packageEntry.path));
    }
  }
  for (const moduleEntry of [
    ...options.repoShape.java_modules,
    ...options.repoShape.rust_modules,
  ]) {
    if (moduleEntry.path !== ".") {
      paths.add(normalizeAreaPath(moduleEntry.path));
    }
  }
  for (const path of fg.sync(["src/*"], {
    cwd: options.cwd,
    onlyDirectories: true,
    ignore: generatedIgnorePatterns(options),
  })) {
    paths.add(normalizeAreaPath(path));
  }
  for (const pattern of Object.keys(options.validation?.paths ?? {})) {
    const areaPath = areaPathFromPattern(pattern);
    if (areaPath && !isGeneratedArea(areaPath, options)) {
      paths.add(areaPath);
    }
  }

  if (existsSync(join(options.cwd, "tests"))) {
    paths.add("tests/");
  }
  if (existsSync(join(options.cwd, ".greenhouse", "roots"))) {
    paths.add(".greenhouse/roots/");
  }
  if (existsSync(join(options.cwd, ".greenhouse", "context"))) {
    paths.add(".greenhouse/context/");
  }

  for (const doc of options.repoMap.docs) {
    paths.add(normalizeAreaPath(doc.path));
  }

  return [...paths]
    .filter((path) => path !== "." && !isGeneratedArea(path, options))
    .sort();
}

function knowledgeAreaForPath(options: {
  path: string;
  areaIndexByPath: Map<string, AreaIndex["areas"][number]>;
  docsRoot?: DocsRoot | null;
  validation?: ValidationConfig | null;
  memoryIndex?: MemoryIndex;
  skillIndex?: SkillIndex;
  evidenceIndex?: EvidenceIndex | null;
}): TreeOfKnowledgeArea {
  const normalizedPath = normalizeAreaPath(options.path);
  const indexed = nearestIndexedArea(normalizedPath, options.areaIndexByPath);
  const docs = docsForArea(normalizedPath, options.docsRoot);
  const validation = validationForArea(normalizedPath, indexed, options.validation);
  const risks = indexed?.risks ?? [];
  const memorySources = sourcesForArea(normalizedPath, options.memoryIndex?.memories ?? []);
  const skillSources = sourcesForArea(normalizedPath, options.skillIndex?.skills ?? []);
  const evidence = evidenceForArea(normalizedPath, options.evidenceIndex);
  const kind = indexed?.kind ?? areaKind(normalizedPath);
  const purpose = indexed?.purpose ?? areaPurpose(normalizedPath, kind);

  return {
    id: areaId(normalizedPath),
    path: normalizedPath,
    page_path: `.greenhouse/tree-of-knowledge/areas/${areaSlug(normalizedPath)}.md`,
    kind,
    purpose,
    summary: areaSummary(normalizedPath, purpose, docs.length, validation.status),
    confidence: indexed?.confidence ?? (docs.length > 0 || validation.routes.length > 0 ? "medium" : "low"),
    docs,
    validation,
    risks,
    memory_sources: memorySources,
    skill_sources: skillSources,
    evidence,
    agent_actions: agentActions({
      docs,
      validation,
      risks,
      memorySources,
      skillSources,
    }),
  };
}

function nearestIndexedArea(
  path: string,
  areaIndexByPath: Map<string, AreaIndex["areas"][number]>,
): AreaIndex["areas"][number] | undefined {
  return areaIndexByPath.get(path) ??
    [...areaIndexByPath.entries()]
      .filter(([areaPath]) => path.startsWith(areaPath) || areaPath.startsWith(path))
      .sort((left, right) => right[0].length - left[0].length)[0]?.[1];
}

function docsForArea(path: string, docsRoot?: DocsRoot | null): TreeOfKnowledgeArea["docs"] {
  const docs: TreeOfKnowledgeArea["docs"] = [];
  for (const doc of docsRoot?.tracked_docs ?? []) {
    for (const coverage of doc.covers ?? []) {
      if (coverageMatchesArea(path, coverage.path)) {
        docs.push({
          path: doc.path,
          reason: coverage.reason,
          strictness: coverage.strictness,
        });
      }
    }
  }
  return uniqueBy(docs, (doc) => `${doc.path}:${doc.reason}:${doc.strictness}`);
}

function validationForArea(
  path: string,
  indexed: AreaIndex["areas"][number] | undefined,
  validation?: ValidationConfig | null,
): TreeOfKnowledgeArea["validation"] {
  const routes = Object.entries(validation?.paths ?? {})
    .filter(([pattern]) => areaMatchesPattern(path, pattern))
    .map(([pattern]) => pattern);
  const rules = routes
    .map((route) => validation?.paths?.[route])
    .filter((rule): rule is NonNullable<ValidationConfig["paths"]>[string] =>
      Boolean(rule),
    );
  const commands = unique(rules.flatMap((rule) => rule.required.map((command) => command.command)));
  const manualChecks = unique(rules.flatMap((rule) => rule.manual.map((check) => check.id)));

  if (routes.length > 0) {
    return {
      status: commands.length > 0 ? "covered" : "fallback",
      routes,
      commands,
      manual_checks: manualChecks,
    };
  }

  return indexed?.validation ?? {
    status: "missing",
    routes: [],
    commands: [],
    manual_checks: [],
  };
}

function sourcesForArea<T extends {
  id: string;
  path: string;
  title: string;
  status: string;
  freshness: TreeOfKnowledgeArea["memory_sources"][number]["freshness"];
  keywords: string[];
  summary: string;
}>(
  path: string,
  entries: T[],
): TreeOfKnowledgeArea["memory_sources"] {
  const areaTerms = areaKeywords(path);
  return entries
    .filter((entry) => {
      const haystack = [
        entry.path,
        entry.title,
        entry.summary,
        ...entry.keywords,
      ].join(" ").toLowerCase();
      return areaTerms.some((term) => haystack.includes(term));
    })
    .slice(0, 5)
    .map((entry) => ({
      id: entry.id,
      path: entry.path,
      title: entry.title,
      status: entry.status,
      freshness: entry.freshness,
      reason: `matched area terms: ${areaTerms.join(", ")}`,
    }));
}

function evidenceForArea(
  path: string,
  evidenceIndex?: EvidenceIndex | null,
): TreeOfKnowledgeArea["evidence"] {
  return (evidenceIndex?.recent ?? [])
    .filter((entry) =>
      (entry.changed_files ?? []).some((changedFile) => areaMatchesFile(path, changedFile)),
    )
    .slice(0, 5)
    .map((entry) => ({
      path: `.greenhouse/${entry.path}`,
      summary: entry.summary,
      status: entry.status,
      reason: "recent evidence touched this area",
    }));
}

function agentActions(options: {
  docs: TreeOfKnowledgeArea["docs"];
  validation: TreeOfKnowledgeArea["validation"];
  risks: string[];
  memorySources: TreeOfKnowledgeArea["memory_sources"];
  skillSources: TreeOfKnowledgeArea["skill_sources"];
}): string[] {
  const actions: string[] = [
    "Read this page before editing files in this area.",
  ];

  if (options.docs.length > 0) {
    actions.push("Review linked docs when behavior or public contracts change.");
  }
  if (options.validation.status === "missing") {
    actions.push("Add or propose a validation route if this area receives recurring changes.");
  }
  if (options.risks.length > 0) {
    actions.push("Treat matched risks as guarded until validation and manual review are recorded.");
  }
  if (options.memorySources.some((source) => source.freshness === "stale")) {
    actions.push("Refresh stale memory after confirming it still matches the code.");
  }
  if (options.skillSources.length > 0) {
    actions.push("Apply linked skills when working in this area.");
  }

  return unique(actions);
}

function formatTreeIndex(tree: TreeOfKnowledge): string {
  const lines = [
    "# Tree Of Knowledge",
    "",
    "Generated by `greenhouse-spec inspect`. This is navigation status, not authored policy.",
    "",
    "## Agent Reading",
    "",
    tree.policy.agent_reading,
    "",
    "## Areas",
    "",
  ];

  for (const area of tree.areas) {
    const docs = area.docs.length > 0
      ? ` docs: ${area.docs.map((doc) => doc.path).join(", ")}`
      : " docs: none";
    lines.push(`- [${area.path}](${area.page_path.replace(".greenhouse/tree-of-knowledge/", "")}) - ${area.kind}; validation: ${area.validation.status};${docs}`);
  }

  lines.push("");
  return lines.join("\n");
}

function formatAreaPage(tree: TreeOfKnowledge, area: TreeOfKnowledgeArea): string {
  const lines = [
    `# ${area.path}`,
    "",
    `Generated: ${tree.generated_at}`,
    "",
    "## Summary",
    "",
    area.summary,
    "",
    "## Purpose",
    "",
    area.purpose,
    "",
    "## Agent Actions",
    "",
    ...listOrNone(area.agent_actions),
    "",
    "## Docs",
    "",
    ...listOrNone(area.docs.map((doc) => `${doc.path} (${doc.strictness}) - ${doc.reason}`)),
    "",
    "## Validation",
    "",
    ...formatValidation(area.validation),
    "",
    "## Risks",
    "",
    ...listOrNone(area.risks),
    "",
    "## Memory",
    "",
    ...listOrNone(area.memory_sources.map(formatSource)),
    "",
    "## Skills",
    "",
    ...listOrNone(area.skill_sources.map(formatSource)),
    "",
    "## Recent Evidence",
    "",
    ...listOrNone(area.evidence.map((entry) => `${entry.path}${entry.status ? ` (${entry.status})` : ""} - ${entry.summary}`)),
    "",
  ];

  return lines.join("\n");
}

function formatSource(source: TreeOfKnowledgeArea["memory_sources"][number]): string {
  const title = source.title ? `${source.title} - ` : "";
  const status = source.status ? ` (${source.status}${source.freshness ? `, ${source.freshness}` : ""})` : "";
  return `${source.path}${status}: ${title}${source.reason}`;
}

function formatValidation(validation: TreeOfKnowledgeArea["validation"]): string[] {
  return [
    `- status: ${validation.status}`,
    `- routes: ${validation.routes.join(", ") || "none"}`,
    `- commands: ${validation.commands.join(", ") || "none"}`,
    `- manual checks: ${validation.manual_checks.join(", ") || "none"}`,
  ];
}

function areaMatchesPattern(areaPath: string, pattern: string): boolean {
  const normalizedArea = normalizeAreaPath(areaPath);
  const sampleFile = sampleFileForArea(normalizedArea);
  return matchesPath(pattern, sampleFile) ||
    normalizeAreaPath(pattern).startsWith(normalizedArea) ||
    normalizedArea.startsWith(patternPrefix(pattern));
}

function coverageMatchesArea(areaPath: string, pattern: string): boolean {
  const normalizedArea = normalizeAreaPath(areaPath);
  return matchesPath(pattern, sampleFileForArea(normalizedArea)) ||
    normalizedArea.startsWith(patternPrefix(pattern));
}

function areaMatchesFile(areaPath: string, filePath: string): boolean {
  const normalizedArea = normalizeAreaPath(areaPath);
  const normalizedFile = normalizePath(filePath);
  return normalizedFile === normalizedArea.replace(/\/$/, "") ||
    normalizedFile.startsWith(normalizedArea);
}

function sampleFileForArea(areaPath: string): string {
  return areaPath.endsWith(".md") || /\.[a-z0-9]+$/i.test(areaPath)
    ? areaPath
    : `${areaPath}index.ts`;
}

function patternPrefix(pattern: string): string {
  return normalizeAreaPath(
    pattern
      .replace(/\*\*.*$/, "")
      .replace(/\*.*$/, "")
      .replace(/\/+$/, "/"),
  );
}

function areaPathFromPattern(pattern: string): string | null {
  if (pattern.startsWith(".greenhouse/grown/") || pattern.startsWith(".greenhouse/evidence/")) {
    return null;
  }
  const prefix = patternPrefix(pattern);
  return prefix || null;
}

function isGeneratedArea(path: string, options: { repoMap: RepoMap; repoShape: RepoShape }): boolean {
  const generated = [
    ...options.repoMap.generated.map((entry) => entry.path),
    ...options.repoShape.generated.map((entry) => entry.path),
    ".greenhouse/grown/",
    ".greenhouse/evidence/",
    ".greenhouse/reports/",
    ".greenhouse/tree-of-knowledge/",
    "node_modules/",
  ].map(normalizeAreaPath);
  return generated.some((generatedPath) =>
    path === generatedPath || path.startsWith(generatedPath),
  );
}

function generatedIgnorePatterns(options: { repoMap: RepoMap; repoShape: RepoShape }): string[] {
  return [
    "**/node_modules/**",
    ...options.repoMap.generated.map((entry) => `${entry.path.replace(/\/$/, "")}/**`),
    ...options.repoShape.generated.map((entry) => `${entry.path.replace(/\/$/, "")}/**`),
    ".greenhouse/grown/**",
    ".greenhouse/evidence/**",
    ".greenhouse/reports/**",
    ".greenhouse/tree-of-knowledge/**",
  ];
}

function areaKind(path: string): string {
  if (path.startsWith("src/")) {
    return "source-area";
  }
  if (path.startsWith("tests/")) {
    return "test-area";
  }
  if (path === "README.md" || path.startsWith("docs/")) {
    return "documentation-area";
  }
  if (path.startsWith(".greenhouse/roots/")) {
    return "greenhouse-root-area";
  }
  if (path.startsWith(".greenhouse/context/")) {
    return "greenhouse-context-area";
  }
  return "repo-area";
}

function areaPurpose(path: string, kind: string): string {
  if (kind === "source-area") {
    return "Application or CLI source subsystem.";
  }
  if (kind === "test-area") {
    return "Automated test coverage and fixtures.";
  }
  if (kind === "documentation-area") {
    return "Documentation and repo knowledge surface.";
  }
  if (kind.startsWith("greenhouse-")) {
    return "Greenhouse authored contract or context surface.";
  }
  return `Repository area at ${path}.`;
}

function areaSummary(
  path: string,
  purpose: string,
  docsCount: number,
  validationStatus: TreeOfKnowledgeArea["validation"]["status"],
): string {
  const docs = docsCount === 0 ? "no documented coverage" : `${docsCount} documented coverage link${docsCount === 1 ? "" : "s"}`;
  return `${path} is ${purpose.toLowerCase()} It has ${docs} and ${validationStatus} validation.`;
}

function areaKeywords(path: string): string[] {
  return normalizePath(path)
    .split(/[/.:-]+/)
    .filter((term) => term.length >= 3 && term !== "src" && term !== "tests");
}

function terms(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3);
}

function knowledgeAreaPriority(area: TreeOfKnowledgeArea): number {
  const strictnessRank = Math.max(
    0,
    ...area.docs.map((doc) =>
      ({ advisory: 1, warning: 2, guarded: 3, blocking: 4 })[doc.strictness],
    ),
  );
  return strictnessRank * 10 +
    (area.validation.status === "covered" ? 3 : 0) +
    area.risks.length;
}

function areaId(path: string): string {
  return `knowledge.area.${areaSlug(path).replace(/-/g, ".")}`;
}

function areaSlug(path: string): string {
  return path
    .replace(/\/$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "root";
}

function normalizeAreaPath(path: string): string {
  const normalized = normalizePath(path);
  if (!normalized || normalized === ".") {
    return ".";
  }
  return normalized.endsWith("/") || /\.[a-z0-9]+$/i.test(normalized)
    ? normalized
    : `${normalized}/`;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}

function listOrNone(items: string[]): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : ["- none"];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = key(value);
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}
