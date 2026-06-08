import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { parseYamlWithSchema } from "../schemas/common.js";
import { areaIndexSchema, type AreaIndex } from "../schemas/area-index.js";
import {
  contextManifestSchema,
  type ContextKind,
  type ContextManifest,
  type ContextManifestEntry,
} from "../schemas/context-manifest.js";
import type { MemoryIndexEntry, SkillIndexEntry } from "../schemas/knowledge-index.js";
import { readEvidenceIndex } from "../evidence/evidence-index.js";
import {
  readFailureSignatures,
  unresolvedRepeatedFailureSummaries,
} from "../evidence/failure-signatures.js";
import { discoverCommandIndex } from "../discovery/scripts.js";
import { discoverRepoShape } from "../discovery/repo-shape.js";
import { matchesPath } from "../validation/path-match.js";

import { readMemoryIndex, readSkillIndex } from "./knowledge-index.js";
import {
  querySqliteKnowledgeIndex,
  type SqliteKnowledgeMatch,
} from "./sqlite-index.js";
import { readSemanticRetrieval } from "./semantic-index.js";
import type { SemanticIndexMatch } from "../schemas/semantic-index.js";
import { terminalWords } from "../terminal/words.js";

export type ContextOptions = {
  cwd: string;
  task: string;
  json?: boolean;
  semantic?: boolean;
  writeReport?: boolean;
  paths?: string[];
  risks?: string[];
};

export type ContextSource = {
  id: string;
  kind: ContextKind;
  path: string;
  reason: string;
  status?: string;
  freshness?: string;
  summary: string;
  excerpt?: string;
};

export type ContextReport = {
  cwd: string;
  task: string;
  generatedAt: string;
  paths: string[];
  risks: string[];
  repo: {
    shape: string[];
    packageManager: string | null | undefined;
    commands: string[];
  };
  sources: ContextSource[];
  areas: Array<{
    id: string;
    path: string;
    kind: string;
    purpose: string;
    confidence: "low" | "medium" | "high";
    reason: string;
    validation: {
      status: "covered" | "fallback" | "missing";
      routes: string[];
      commands: string[];
      manual_checks: string[];
    };
    risks: string[];
    gaps: string[];
  }>;
  contextFreshness: {
    areaIndex: {
      status: "fresh" | "stale" | "missing" | "not_requested";
      path: string;
      generatedAt: string | null;
      stalePaths: string[];
      message: string;
    };
  };
  evidence: {
    latestPath: string | null;
    latestSummary: string | null;
    repeatedFailures: Array<{
      command: string;
      count: number;
      lastSeenAt: string;
      normalizedFailure: string;
    }>;
  };
  validationHints: string[];
  knownRisks: string[];
  semantic: {
    requested: boolean;
    enabled: boolean;
    indexPath: string;
    matches: number;
    note: string | null;
  };
  writtenReportPath?: string;
};

const maxIndexedMatches = 6;

export function runContext(options: ContextOptions): ContextReport {
  const repoShape = discoverRepoShape(options.cwd);
  const commandIndex = discoverCommandIndex(options.cwd);
  const memoryIndex = readMemoryIndex(options.cwd);
  const skillIndex = readSkillIndex(options.cwd);
  const manifest = readContextManifest(options.cwd);
  const areaIndex = readAreaIndex(options.cwd);
  const queryTerms = terms(options.task);
  const sqliteMatches = querySqliteKnowledgeIndex(options.cwd, options.task);
  const semantic = readSemanticRetrieval({
    cwd: options.cwd,
    manifest,
    task: options.task,
    requested: options.semantic,
  });
  const paths = options.paths ?? [];
  const risks = options.risks ?? [];
  const areaIndexFreshness = areaIndexFreshnessForPaths(options.cwd, areaIndex, paths);
  const manifestSources = manifest.context
    .map((entry) => manifestSource(options.cwd, entry, options.task, paths, risks))
    .filter((source): source is ContextSource => Boolean(source));
  const sqliteSources = sqliteMatches
    .map((match) =>
      sqliteSource(options.cwd, match, memoryIndex.memories, skillIndex.skills),
    )
    .filter((source): source is ContextSource => Boolean(source));
  const semanticSources = semantic.matches.map((match) =>
    semanticSource(options.cwd, match),
  );
  const lexicalSources = [
    ...memoryIndex.memories
      .map((entry) => scoredMemorySource(options.cwd, entry, queryTerms))
      .filter((source): source is ContextSource & { score: number } => Boolean(source)),
    ...skillIndex.skills
      .map((entry) => scoredSkillSource(options.cwd, entry, queryTerms))
      .filter((source): source is ContextSource & { score: number } => Boolean(source)),
  ]
    .sort((left, right) => right.score - left.score)
    .slice(0, maxIndexedMatches);
  const evidenceIndex = readEvidenceIndex(options.cwd);
  const latestEvidence = evidenceIndex?.recent[0] ?? null;
  const failureSignatures = readFailureSignatures(options.cwd);
  const repeatedFailures = unresolvedRepeatedFailureSummaries(
    failureSignatures,
    evidenceIndex,
  ).slice(0, 5);
  const report: ContextReport = {
    cwd: options.cwd,
    task: options.task,
    generatedAt: new Date().toISOString(),
    paths,
    risks,
    repo: {
      shape: repoShape.shape,
      packageManager: repoShape.package_manager,
      commands: commandIndex.commands.map((command) => command.command).slice(0, 12),
    },
    sources: uniqueSources([
      ...manifestSources,
      ...semanticSources,
      ...(sqliteSources.length > 0 ? sqliteSources : lexicalSources),
    ]),
    areas: matchingAreaContext(areaIndex?.index ?? null, paths),
    contextFreshness: {
      areaIndex: areaIndexFreshness,
    },
    evidence: {
      latestPath: latestEvidence?.path ?? null,
      latestSummary: latestEvidence?.summary ?? null,
      repeatedFailures: repeatedFailures.map((failure) => ({
        command: failure.command,
        count: failure.count,
        lastSeenAt: failure.lastSeenAt,
        normalizedFailure: failure.normalizedFailure,
      })),
    },
    validationHints: validationHints(commandIndex.commands.map((command) => command.command)),
    knownRisks: risks.length > 0 ? risks : repoShape.gaps.map((gap) => gap.message).slice(0, 5),
    semantic: {
      requested: Boolean(options.semantic),
      enabled: semantic.enabled,
      indexPath: semantic.indexPath,
      matches: semantic.matches.length,
      note: semantic.note,
    },
  };

  if (options.writeReport) {
    report.writtenReportPath = writeContextReport(report);
  }

  return report;
}

export function formatContextReport(report: ContextReport): string {
  const rules = report.sources.filter((source) =>
    ["rule", "doc", "report"].includes(source.kind),
  );
  const memories = report.sources.filter(
    (source) =>
      source.kind === "memory" &&
      source.status !== "draft" &&
      source.status !== "proposed",
  );
  const skills = report.sources.filter(
    (source) => source.kind === "skill" && source.status === "adopted",
  );
  const candidates = report.sources.filter(
    (source) =>
      (source.kind === "memory" || source.kind === "skill") &&
      (source.status === "draft" || source.status === "proposed"),
  );
  const lines = [
    ...formatAgentGuideCard(report),
    "",
    "# Greenhouse Context Brief",
    "",
    "## Task",
    "",
    report.task,
    "",
    "## Repo State",
    "",
    `- Repository: ${report.cwd}`,
    `- Shape: ${report.repo.shape.join(", ") || "unknown"}`,
    `- Package manager: ${report.repo.packageManager ?? "unknown"}`,
    `- Paths: ${report.paths.join(", ") || "none supplied"}`,
    `- Risks: ${report.risks.join(", ") || "none supplied"}`,
    `- Area index: ${report.contextFreshness.areaIndex.message}`,
    "",
    "## Governing Rules",
    "",
  ];

  appendSources(lines, rules);

  lines.push("", "## Relevant Memory", "");
  appendSources(lines, memories);

  lines.push("", "## Relevant Skills", "");
  appendSources(lines, skills);

  lines.push("", "## Candidate Memory And Skill Proposals", "");
  appendSources(lines, candidates);

  lines.push("", `## ${terminalWords.contextLanding}`, "");
  appendAreas(lines, report.areas);

  lines.push("", `## ${terminalWords.checks}`, "");
  if (report.validationHints.length === 0) {
    lines.push("- none");
  } else {
    for (const hint of report.validationHints) {
      lines.push(`- ${hint}`);
    }
  }
  if (report.semantic.requested) {
    lines.push(
      `- semantic retrieval: ${report.semantic.enabled ? "enabled" : "disabled"} (${report.semantic.matches} match${report.semantic.matches === 1 ? "" : "es"})`,
    );
    if (report.semantic.note) {
      lines.push(`- semantic note: ${report.semantic.note}`);
    }
  }

  lines.push("", "## Evidence", "");
  if (report.evidence.latestPath) {
    lines.push(`- latest: .greenhouse/${report.evidence.latestPath}`);
    lines.push(`- summary: ${report.evidence.latestSummary ?? "none"}`);
  } else {
    lines.push("- latest: none");
  }

  if (report.evidence.repeatedFailures.length > 0) {
    for (const failure of report.evidence.repeatedFailures) {
      lines.push(
        `- repeated failure: ${failure.command} seen ${failure.count} times; ${failure.normalizedFailure}`,
      );
    }
  }

  lines.push("", "## Known Risks", "");
  if (report.knownRisks.length === 0) {
    lines.push("- none");
  } else {
    for (const risk of report.knownRisks) {
      lines.push(`- ${risk}`);
    }
  }

  lines.push(
    "",
    "## Context Source IDs",
    "",
    ...(
      report.sources.length === 0
        ? ["- none"]
        : report.sources.map((source) => `- ${source.id}`)
    ),
    "",
    "## Suggested Agent Prompt",
    "",
    [
      "Use the selected Greenhouse context before editing.",
      "Verify current repo state against any stale or generated context.",
      "Run routed validation before claiming completion.",
    ].join(" "),
    "",
  );

  if (report.writtenReportPath) {
    lines.push(`Report written: ${report.writtenReportPath}`, "");
  }

  return lines.join("\n");
}

export function formatContextJson(report: ContextReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function latestContextReport(cwd: string): string | null {
  const reportsPath = join(cwd, ".greenhouse", "reports", "context");

  if (!existsSync(reportsPath)) {
    return null;
  }

  const reports = readdirSync(reportsPath)
    .filter((file) => file.endsWith(".md"))
    .map((file) => join(reportsPath, file))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);

  return reports[0] ?? null;
}

export function readContextReportSourceIds(reportPath: string): string[] {
  const content = readFileSync(reportPath, "utf8");
  const lines = content.split("\n");
  const start = lines.findIndex((line) => line.trim() === "## Context Source IDs");
  if (start === -1) {
    return [];
  }

  const ids: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) {
      break;
    }
    const id = line.match(/^-\s+(.+)$/)?.[1]?.trim();
    if (id && id !== "none") {
      ids.push(id);
    }
  }
  return ids;
}

function readContextManifest(cwd: string): ContextManifest {
  const manifestPath = join(cwd, ".greenhouse", "context", "manifest.yaml");

  if (!existsSync(manifestPath)) {
    return { schema_version: 1, context: [] };
  }

  return parseYamlWithSchema(readFileSync(manifestPath, "utf8"), contextManifestSchema);
}


type ReadAreaIndexResult = {
  index: AreaIndex;
  path: string;
  mtimeMs: number;
};

function readAreaIndex(cwd: string): ReadAreaIndexResult | null {
  const areaIndexPath = join(cwd, ".greenhouse", "grown", "area-index.yaml");

  if (!existsSync(areaIndexPath)) {
    return null;
  }

  return {
    index: parseYamlWithSchema(readFileSync(areaIndexPath, "utf8"), areaIndexSchema),
    path: areaIndexPath,
    mtimeMs: statSync(areaIndexPath).mtimeMs,
  };
}

function areaIndexFreshnessForPaths(
  cwd: string,
  areaIndex: ReadAreaIndexResult | null,
  paths: string[],
): ContextReport["contextFreshness"]["areaIndex"] {
  const displayPath = ".greenhouse/grown/area-index.yaml";

  if (paths.length === 0) {
    return {
      status: "not_requested",
      path: displayPath,
      generatedAt: areaIndex ? String(areaIndex.index.generated_at) : null,
      stalePaths: [],
      message: "supply --path to check area guidance freshness.",
    };
  }

  if (!areaIndex) {
    return {
      status: "missing",
      path: displayPath,
      generatedAt: null,
      stalePaths: paths,
      message: "missing; run greenhouse-spec inspect for area guidance.",
    };
  }

  const stalePaths = paths.filter((path) => {
    const absolutePath = join(cwd, path);
    return existsSync(absolutePath) && statSync(absolutePath).mtimeMs > areaIndex.mtimeMs;
  });

  if (stalePaths.length > 0) {
    return {
      status: "stale",
      path: displayPath,
      generatedAt: String(areaIndex.index.generated_at),
      stalePaths,
      message: `${displayPath} may be stale for ${summarizeList(stalePaths, 2)}; run greenhouse-spec inspect.`,
    };
  }

  return {
    status: "fresh",
    path: displayPath,
    generatedAt: String(areaIndex.index.generated_at),
    stalePaths: [],
    message: `${displayPath} is current for supplied files.`,
  };
}

function matchingAreaContext(
  areaIndex: AreaIndex | null,
  paths: string[],
): ContextReport["areas"] {
  if (!areaIndex || paths.length === 0) {
    return [];
  }

  return areaIndex.areas
    .map((area) => {
      const matchedPath = paths.find((path) => areaMatchesPath(area.path, path));
      if (!matchedPath) {
        return null;
      }

      return {
        id: area.id,
        path: area.path,
        kind: area.kind,
        purpose: area.purpose,
        confidence: area.confidence,
        reason: `path ${matchedPath} is inside ${area.path}`,
        validation: area.validation,
        risks: area.risks,
        gaps: area.gaps,
      };
    })
    .filter((area): area is ContextReport["areas"][number] => Boolean(area));
}

function areaMatchesPath(areaPath: string, candidatePath: string): boolean {
  const normalizedArea = areaPath.replace(/\\/g, "/");
  const normalizedCandidate = candidatePath.replace(/\\/g, "/");

  if (normalizedArea.endsWith("/")) {
    return normalizedCandidate.startsWith(normalizedArea);
  }

  return normalizedCandidate === normalizedArea;
}

function manifestSource(
  cwd: string,
  entry: ContextManifestEntry,
  task: string,
  paths: string[],
  risks: string[],
): ContextSource | null {
  const matchReason = activationReason(entry, task, paths, risks);
  if (!matchReason) {
    return null;
  }

  const resolvedPath = resolveContextEntryPath(cwd, entry.path);
  const content = existsSync(resolvedPath) ? readFileSync(resolvedPath, "utf8") : "";
  const kind = (entry.kind ?? entry.type ?? "doc") as ContextKind;

  return {
    id: entry.id,
    kind,
    path: formatPath(cwd, resolvedPath),
    reason: matchReason,
    summary: content ? firstLine(content) : "Referenced context file is missing.",
    excerpt: content ? excerpt(content, entry.budget.max_tokens) : undefined,
  };
}

function scoredMemorySource(
  cwd: string,
  entry: MemoryIndexEntry,
  queryTerms: string[],
): (ContextSource & { score: number }) | null {
  const content = readSourceContent(cwd, entry.path);
  const score = lexicalScore(queryTerms, [entry.title, entry.summary, content, ...entry.keywords]);
  if (score === 0) {
    return null;
  }

  return {
    id: entry.id,
    kind: "memory",
    path: entry.path,
    reason: `lexical match (${score})`,
    status: entry.status,
    freshness: entry.freshness,
    summary: entry.summary,
    excerpt: excerpt(content || entry.summary, 700),
    score,
  };
}

function semanticSource(cwd: string, match: SemanticIndexMatch): ContextSource {
  const content = readSourceContent(cwd, match.path);
  return {
    id: match.id,
    kind: match.kind,
    path: match.path,
    reason: `semantic index candidate${match.score === undefined ? "" : ` (${match.score})`}: ${match.reason}`,
    status: match.status,
    summary: firstLine(content) || match.reason,
    excerpt: content ? excerpt(content, 700) : undefined,
  };
}

function sqliteSource(
  cwd: string,
  match: SqliteKnowledgeMatch,
  memories: MemoryIndexEntry[],
  skills: SkillIndexEntry[],
): ContextSource | null {
  if (match.kind === "memory") {
    const entry = memories.find((item) => item.id === match.id);
    if (!entry) {
      return null;
    }
    const content = readSourceContent(cwd, entry.path);
    return {
      id: entry.id,
      kind: "memory",
      path: entry.path,
      reason: `sqlite fts match (rank ${match.rank.toFixed(3)})`,
      status: entry.status,
      freshness: entry.freshness,
      summary: entry.summary,
      excerpt: excerpt(content || entry.summary, 700),
    };
  }

  const entry = skills.find((item) => item.id === match.id);
  if (!entry) {
    return null;
  }
  const content = readSourceContent(cwd, entry.path);
  return {
    id: entry.id,
    kind: "skill",
    path: entry.path,
    reason:
      entry.status === "adopted"
        ? `sqlite fts adopted skill match (rank ${match.rank.toFixed(3)})`
        : `sqlite fts candidate skill match (rank ${match.rank.toFixed(3)}); not adopted`,
    status: entry.status,
    freshness: entry.freshness,
    summary: entry.summary,
    excerpt: excerpt(content || entry.summary, 900),
  };
}

function scoredSkillSource(
  cwd: string,
  entry: SkillIndexEntry,
  queryTerms: string[],
): (ContextSource & { score: number }) | null {
  const content = readSourceContent(cwd, entry.path);
  const score = lexicalScore(queryTerms, [entry.title, entry.summary, content, ...entry.keywords]);
  if (score === 0) {
    return null;
  }

  return {
    id: entry.id,
    kind: "skill",
    path: entry.path,
    reason:
      entry.status === "adopted"
        ? `adopted skill lexical match (${score})`
        : `candidate skill lexical match (${score}); not adopted`,
    status: entry.status,
    freshness: entry.freshness,
    summary: entry.summary,
    excerpt: excerpt(content || entry.summary, 900),
    score,
  };
}

function activationReason(
  entry: ContextManifestEntry,
  task: string,
  paths: string[],
  risks: string[],
): string | null {
  if (entry.activation.mode === "always") {
    return "manifest always";
  }
  if (entry.activation.mode === "keyword") {
    const match = entry.activation.keywords.find((keyword) =>
      task.toLowerCase().includes(keyword.toLowerCase()),
    );
    return match ? `manifest keyword: ${match}` : null;
  }
  if (entry.activation.mode === "risk") {
    const match = entry.activation.risks.find((risk) => risks.includes(risk));
    return match ? `manifest risk: ${match}` : null;
  }
  const match = entry.activation.paths.find((pattern) =>
    paths.some((path) => matchesPath(pattern, path)),
  );
  return match ? `manifest path: ${match}` : null;
}

function terms(task: string): string[] {
  const words = task
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);

  return [...new Set(words)];
}

function lexicalScore(queryTerms: string[], values: string[]): number {
  const haystack = values.join("\n").toLowerCase();
  return queryTerms.reduce((score, term) => score + occurrences(haystack, term), 0);
}

function occurrences(value: string, term: string): number {
  return value.split(term).length - 1;
}

function readSourceContent(cwd: string, path: string): string {
  const absolutePath = join(cwd, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

function validationHints(commands: string[]): string[] {
  const hints = [];
  const preferred = ["pnpm typecheck", "pnpm test", "pnpm build"].filter((command) =>
    commands.includes(command),
  );

  if (preferred.length > 0) {
    hints.push(`Available baseline commands: ${preferred.join(", ")}`);
  }
  hints.push("Use greenhouse-spec verify --changed --dry-run to inspect routed validation.");
  hints.push("Use greenhouse-spec tend as the finish gate.");

  return hints;
}

function uniqueSources(sources: ContextSource[]): ContextSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.id;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function appendSources(lines: string[], sources: ContextSource[]): void {
  if (sources.length === 0) {
    lines.push("- none");
    return;
  }

  for (const source of sources) {
    const status = source.status ? `, status: ${source.status}` : "";
    const freshness = source.freshness ? `, freshness: ${source.freshness}` : "";
    lines.push(`- ${source.id} (${source.path})`);
    lines.push(`  reason: ${source.reason}${status}${freshness}`);
    lines.push(`  summary: ${source.summary}`);
  }
}


function formatAgentGuideCard(report: ContextReport): string[] {
  const primaryArea = report.areas[0];
  const areaSummary = primaryArea
    ? `${friendlyAreaLabel(primaryArea)} (${primaryArea.validation.status})`
    : report.paths.length > 0
      ? "no matching area"
      : "supply --path for area guidance";
  const checkSummary =
    primaryArea?.validation.commands[0] ?? report.validationHints[0] ?? "run routed validation";
  const pathSummary = summarizeList(report.paths, 2) || "none supplied";

  return [
    "+-- GREENHOUSE GUIDE --------------------------------+",
    `| Task : ${fitGuideText(report.task)} |`,
    `| Files: ${fitGuideText(pathSummary)} |`,
    `| Where: ${fitGuideText(areaSummary)} |`,
    `| Next : ${fitGuideText(checkSummary)} |`,
    ...formatGuideHint(report),
    "+----------------------------------------------------+",
  ];
}

function formatGuideHint(report: ContextReport): string[] {
  const freshness = report.contextFreshness.areaIndex;
  if (freshness.status !== "stale" && freshness.status !== "missing") {
    return [];
  }

  return [`| Hint : ${fitGuideText("run greenhouse-spec inspect")} |`];
}

function fitGuideText(value: string): string {
  const width = 43;
  const normalized = value.replace(/\s+/g, " ").trim() || "none";
  const clipped = normalized.length > width ? `${normalized.slice(0, width - 3)}...` : normalized;
  return clipped.padEnd(width, " ");
}

function appendAreas(lines: string[], areas: ContextReport["areas"]): void {
  if (areas.length === 0) {
    lines.push("- none");
    return;
  }

  for (const area of areas) {
    lines.push(`- ${friendlyAreaName(area)} (${area.path})`);
    lines.push(`  confidence: ${area.confidence}`);
    lines.push(`  why: ${area.purpose}`);
    lines.push(`  matched because: ${area.reason}`);
    lines.push(`  check coverage: ${friendlyValidationStatus(area.validation.status)}`);
    if (area.validation.routes.length > 0) {
      lines.push(`  matching rules: ${summarizeList(area.validation.routes)}`);
    }
    if (area.validation.commands.length > 0) {
      lines.push(`  suggested checks: ${summarizeList(area.validation.commands)}`);
    }
    if (area.gaps.length > 0) {
      lines.push(`  needs attention: ${area.gaps.join("; ")}`);
    }
  }
}

function friendlyAreaName(area: ContextReport["areas"][number]): string {
  return `${friendlyAreaLabel(area)} - ${area.id}`;
}

function friendlyAreaLabel(area: ContextReport["areas"][number]): string {
  const labelByKind: Record<string, string> = {
    "api-contract-package": "API contract package",
    "documentation-area": "Docs and project knowledge",
    "frontend-package": "Frontend package",
    "infra-package": "Infrastructure package",
    "java-module": "Java module",
    "repo-area": "Repository area",
    "rust-module": "Rust module",
    "source-area": "Source code",
    "test-area": "Tests and fixtures",
  };
  return labelByKind[area.kind] ?? area.kind.replace(/-/g, " ");
}

function friendlyValidationStatus(status: ContextReport["areas"][number]["validation"]["status"]): string {
  if (status === "covered") {
    return "covered by a matching rule";
  }
  if (status === "fallback") {
    return "using fallback checks";
  }
  return "no matching check yet";
}

function summarizeList(values: string[], limit = 5): string {
  const visible = values.slice(0, limit);
  const remaining = values.length - visible.length;
  return `${visible.join(", ")}${remaining > 0 ? `, +${remaining} more` : ""}`;
}

function resolveContextEntryPath(cwd: string, entryPath: string): string {
  const rootRelative = join(cwd, entryPath);
  if (existsSync(rootRelative)) {
    return rootRelative;
  }
  return join(cwd, ".greenhouse", "context", entryPath);
}

function formatPath(cwd: string, path: string): string {
  const relativePath = relative(cwd, path).replace(/\\/g, "/");
  return relativePath.startsWith("..") ? path : relativePath;
}

function firstLine(content: string): string {
  return (
    content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("---")) ?? "Context file"
  );
}

function excerpt(content: string, maxTokens: number): string {
  const words = content.replace(/\s+/g, " ").trim().split(" ");
  return words.slice(0, Math.min(words.length, maxTokens)).join(" ");
}

function writeContextReport(report: ContextReport): string {
  const reportsPath = join(report.cwd, ".greenhouse", "reports", "context");
  mkdirSync(reportsPath, { recursive: true });
  const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}-context.md`;
  const reportPath = join(reportsPath, fileName);
  writeFileSync(reportPath, formatContextReport({ ...report, writtenReportPath: undefined }), "utf8");
  return reportPath;
}
