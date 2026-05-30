import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import fg from "fast-glob";

import { parseYamlWithSchema } from "../schemas/common.js";
import { contextManifestSchema, type ContextManifest } from "../schemas/context-manifest.js";
import {
  memoryIndexSchema,
  skillIndexSchema,
  type MemoryIndex,
  type SkillIndex,
} from "../schemas/knowledge-index.js";
import {
  numberMetadata,
  parseMarkdownDocument,
  stringMetadata,
} from "../context/markdown.js";

import type { DoctorFinding } from "./run-doctor.js";

const draftAgeWarningDays = 30;

export function validateKnowledgeHealth(cwd: string, findings: DoctorFinding[]): void {
  const manifest = readManifest(cwd);
  const memoryIndex = readMemoryIndex(cwd);
  const skillIndex = readSkillIndex(cwd);

  validateIndexedPaths(cwd, memoryIndex, skillIndex, findings);
  validateMarkdownLinks(cwd, findings);
  validateAdoptedFreshness(cwd, findings);
  validateDraftAge(cwd, findings);
  validateSkillMetadata(cwd, findings);
  validateHighAuthorityReachability(cwd, manifest, findings);
}

function validateIndexedPaths(
  cwd: string,
  memoryIndex: MemoryIndex | null,
  skillIndex: SkillIndex | null,
  findings: DoctorFinding[],
): void {
  for (const entry of memoryIndex?.memories ?? []) {
    if (!existsSync(join(cwd, entry.path))) {
      findings.push({
        severity: "error",
        check: "knowledge-index-path",
        message: `Memory index points to missing file: ${entry.path}`,
        path: entry.path,
      });
    }
  }

  for (const entry of skillIndex?.skills ?? []) {
    if (!existsSync(join(cwd, entry.path))) {
      findings.push({
        severity: "error",
        check: "knowledge-index-path",
        message: `Skill index points to missing file: ${entry.path}`,
        path: entry.path,
      });
    }
  }
}

function validateMarkdownLinks(cwd: string, findings: DoctorFinding[]): void {
  for (const path of knowledgeMarkdownPaths(cwd)) {
    const absolutePath = join(cwd, path);
    const content = readFileSync(absolutePath, "utf8");
    for (const link of markdownLinks(content)) {
      const target = resolveMarkdownLink(cwd, absolutePath, link);
      if (!target || existsSync(target)) {
        continue;
      }
      findings.push({
        severity: "warning",
        check: "knowledge-link",
        message: `Knowledge file links to missing local target: ${link}`,
        path,
      });
    }
  }
}

function validateAdoptedFreshness(cwd: string, findings: DoctorFinding[]): void {
  for (const path of adoptedKnowledgePaths(cwd)) {
    const document = parseMarkdownDocument(readFileSync(join(cwd, path), "utf8"));
    const reviewAfterDays = numberMetadata(document.metadata, "review_after_days") ?? 30;
    const latest = latestFreshnessDate(document.metadata);
    if (!latest) {
      findings.push({
        severity: "warning",
        check: "knowledge-freshness",
        message: "Adopted knowledge is missing last_reviewed or last_used metadata.",
        path,
      });
      continue;
    }

    if (Date.now() - latest.getTime() > reviewAfterDays * 24 * 60 * 60 * 1000) {
      findings.push({
        severity: "warning",
        check: "knowledge-freshness",
        message: `Adopted knowledge is stale; last reviewed or used more than ${reviewAfterDays} days ago.`,
        path,
      });
    }
  }
}

function validateDraftAge(cwd: string, findings: DoctorFinding[]): void {
  const draftPaths = fg.sync(
    [
      ".greenhouse/memory/inbox/**/*.md",
      ".greenhouse/proposals/**/*.md",
      ".greenhouse/skills/drafts/**/*.md",
      ".greenhouse/skills/proposals/**/*.md",
    ],
    {
      cwd,
      onlyFiles: true,
    },
  );

  for (const path of draftPaths) {
    const ageMs = Date.now() - statSync(join(cwd, path)).mtimeMs;
    if (ageMs > draftAgeWarningDays * 24 * 60 * 60 * 1000) {
      findings.push({
        severity: "info",
        check: "knowledge-draft-age",
        message: `Draft or proposal is older than ${draftAgeWarningDays} days and should be triaged or archived.`,
        path,
      });
    }
  }
}

function validateSkillMetadata(cwd: string, findings: DoctorFinding[]): void {
  const skillPaths = fg.sync(".greenhouse/skills/{adopted,drafts,proposals}/**/*.md", {
    cwd,
    onlyFiles: true,
    ignore: [".greenhouse/skills/README.md"],
  });

  for (const path of skillPaths) {
    const document = parseMarkdownDocument(readFileSync(join(cwd, path), "utf8"));
    const expectedStatus = path.includes("/adopted/")
      ? "adopted"
      : path.includes("/drafts/")
        ? "draft"
        : "proposed";
    const status = stringMetadata(document.metadata, "status");
    const name = stringMetadata(document.metadata, "name");
    const description = stringMetadata(document.metadata, "description");
    const missing = [
      status === expectedStatus ? null : `status: ${expectedStatus}`,
      name ? null : "name",
      description ? null : "description",
    ].filter((item): item is string => Boolean(item));

    if (missing.length > 0) {
      findings.push({
        severity: "warning",
        check: "skill-metadata",
        message: `Skill metadata is incomplete or mismatched: ${missing.join(", ")}.`,
        path,
      });
    }
  }
}

function validateHighAuthorityReachability(
  cwd: string,
  manifest: ContextManifest | null,
  findings: DoctorFinding[],
): void {
  const manifestPaths = new Set(
    (manifest?.context ?? []).map((entry) => entry.path.replace(/\\/g, "/")),
  );

  for (const path of fg.sync(".greenhouse/memory/**/*.md", {
    cwd,
    onlyFiles: true,
    ignore: [".greenhouse/memory/README.md"],
  })) {
    const document = parseMarkdownDocument(readFileSync(join(cwd, path), "utf8"));
    if (stringMetadata(document.metadata, "authority") !== "high") {
      continue;
    }
    if (!manifestPaths.has(path)) {
      findings.push({
        severity: "warning",
        check: "memory-reachability",
        message:
          "High-authority memory is not reachable from .greenhouse/context/manifest.yaml.",
        path,
      });
    }
  }
}

function readManifest(cwd: string): ContextManifest | null {
  const path = join(cwd, ".greenhouse", "context", "manifest.yaml");
  if (!existsSync(path)) {
    return null;
  }
  return parseYamlWithSchema(readFileSync(path, "utf8"), contextManifestSchema);
}

function readMemoryIndex(cwd: string): MemoryIndex | null {
  const path = join(cwd, ".greenhouse", "grown", "memory-index.yaml");
  if (!existsSync(path)) {
    return null;
  }
  return parseYamlWithSchema(readFileSync(path, "utf8"), memoryIndexSchema);
}

function readSkillIndex(cwd: string): SkillIndex | null {
  const path = join(cwd, ".greenhouse", "grown", "skill-index.yaml");
  if (!existsSync(path)) {
    return null;
  }
  return parseYamlWithSchema(readFileSync(path, "utf8"), skillIndexSchema);
}

function knowledgeMarkdownPaths(cwd: string): string[] {
  return fg.sync(
    [
      ".greenhouse/memory/**/*.md",
      ".greenhouse/skills/**/*.md",
      ".greenhouse/proposals/**/*.md",
    ],
    {
      cwd,
      onlyFiles: true,
      ignore: [".greenhouse/memory/README.md", ".greenhouse/skills/README.md"],
    },
  );
}

function adoptedKnowledgePaths(cwd: string): string[] {
  return fg.sync(
    [
      ".greenhouse/memory/{decisions,lessons,playbooks,references,projects}/**/*.md",
      ".greenhouse/skills/adopted/**/*.md",
    ],
    {
      cwd,
      onlyFiles: true,
    },
  );
}

function markdownLinks(content: string): string[] {
  return [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

function resolveMarkdownLink(
  cwd: string,
  sourcePath: string,
  link: string,
): string | null {
  if (/^(https?:|mailto:|#)/.test(link)) {
    return null;
  }
  const clean = link.split("#")[0]?.trim();
  if (!clean) {
    return null;
  }
  return isAbsolute(clean)
    ? clean
    : resolve(dirname(sourcePath), clean).startsWith(cwd)
      ? resolve(dirname(sourcePath), clean)
      : null;
}

function latestFreshnessDate(metadata: Record<string, unknown>): Date | null {
  const dates = [stringMetadata(metadata, "last_reviewed"), stringMetadata(metadata, "last_used")]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((left, right) => right.getTime() - left.getTime());

  return dates[0] ?? null;
}

export function formatKnowledgePath(cwd: string, path: string): string {
  return relative(cwd, path).replace(/\\/g, "/");
}
