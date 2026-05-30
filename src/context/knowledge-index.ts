import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import fg from "fast-glob";
import { stringify as stringifyYaml } from "yaml";

import { parseYamlWithSchema } from "../schemas/common.js";
import type { MemoryType, SkillStatus } from "../schemas/context-manifest.js";
import {
  memoryIndexSchema,
  skillIndexSchema,
  type MemoryIndex,
  type MemoryIndexEntry,
  type SkillIndex,
  type SkillIndexEntry,
} from "../schemas/knowledge-index.js";

import {
  markdownSummary,
  markdownTitle,
  numberMetadata,
  parseMarkdownDocument,
  stringArrayMetadata,
  stringMetadata,
} from "./markdown.js";

export function buildMemoryIndex(cwd: string): MemoryIndex {
  const memories = fg
    .sync([".greenhouse/memory/**/*.md", ".greenhouse/proposals/**/*.md"], {
      cwd,
      onlyFiles: true,
      ignore: [".greenhouse/memory/README.md"],
    })
    .sort()
    .map((path) => memoryEntry(cwd, path))
    .filter((entry): entry is MemoryIndexEntry => Boolean(entry));

  return {
    schema_version: 1,
    managed_by: "greenhouse-spec",
    generated_at: new Date().toISOString(),
    policy: {
      canonical_source: ".greenhouse/memory/**/*.md",
      generated_index: "Generated from Markdown. Safe to refresh with greenhouse-spec inspect.",
    },
    memories,
  };
}

export function buildSkillIndex(cwd: string): SkillIndex {
  const skills = fg
    .sync([".greenhouse/skills/**/*.md"], {
      cwd,
      onlyFiles: true,
      ignore: [".greenhouse/skills/README.md"],
    })
    .sort()
    .map((path) => skillEntry(cwd, path));

  return {
    schema_version: 1,
    managed_by: "greenhouse-spec",
    generated_at: new Date().toISOString(),
    policy: {
      canonical_source: ".greenhouse/skills/**/*.md",
      generated_index: "Generated from repo-local skill Markdown. Safe to refresh with greenhouse-spec inspect.",
    },
    skills,
  };
}

export function writeKnowledgeIndexes(cwd: string): {
  memoryIndexPath: string;
  skillIndexPath: string;
} {
  const memoryIndexPath = join(cwd, ".greenhouse", "grown", "memory-index.yaml");
  const skillIndexPath = join(cwd, ".greenhouse", "grown", "skill-index.yaml");

  mkdirSync(dirname(memoryIndexPath), { recursive: true });
  writeFileSync(memoryIndexPath, yaml(buildMemoryIndex(cwd)), "utf8");
  writeFileSync(skillIndexPath, yaml(buildSkillIndex(cwd)), "utf8");

  return { memoryIndexPath, skillIndexPath };
}

export function readMemoryIndex(cwd: string): MemoryIndex {
  const indexPath = join(cwd, ".greenhouse", "grown", "memory-index.yaml");

  if (!existsSync(indexPath)) {
    return buildMemoryIndex(cwd);
  }

  return parseYamlWithSchema(readFileSync(indexPath, "utf8"), memoryIndexSchema);
}

export function readSkillIndex(cwd: string): SkillIndex {
  const indexPath = join(cwd, ".greenhouse", "grown", "skill-index.yaml");

  if (!existsSync(indexPath)) {
    return buildSkillIndex(cwd);
  }

  return parseYamlWithSchema(readFileSync(indexPath, "utf8"), skillIndexSchema);
}

function memoryEntry(cwd: string, path: string): MemoryIndexEntry | null {
  const document = parseMarkdownDocument(readFileSync(join(cwd, path), "utf8"));
  if (
    path.startsWith(".greenhouse/proposals/") &&
    stringMetadata(document.metadata, "proposal_type") !== "memory"
  ) {
    return null;
  }
  const memoryType = memoryTypeForPath(path, document.metadata);
  const status = statusForPath(path, document.metadata);
  const title = stringMetadata(document.metadata, "title") ?? markdownTitle(document.body, path);

  return {
    id: stringMetadata(document.metadata, "id") ?? sourceId("memory", path),
    path,
    title,
    summary: stringMetadata(document.metadata, "summary") ?? markdownSummary(document.body),
    memory_type: memoryType,
    status,
    authority: authorityForMetadata(document.metadata, status),
    freshness: "unknown",
    keywords: stringArrayMetadata(document.metadata, "keywords"),
    metadata: metadataForIndex(document.metadata, status),
  };
}

function skillEntry(cwd: string, path: string): SkillIndexEntry {
  const document = parseMarkdownDocument(readFileSync(join(cwd, path), "utf8"));
  const status = statusForPath(path, document.metadata);
  const title =
    stringMetadata(document.metadata, "name") ??
    stringMetadata(document.metadata, "title") ??
    markdownTitle(document.body, path);

  return {
    id: stringMetadata(document.metadata, "id") ?? sourceId(`skill.${status}`, path),
    path,
    title,
    summary:
      stringMetadata(document.metadata, "description") ??
      stringMetadata(document.metadata, "summary") ??
      markdownSummary(document.body),
    status,
    freshness: "unknown",
    keywords: stringArrayMetadata(document.metadata, "keywords"),
    metadata: metadataForIndex(document.metadata, status),
  };
}

function memoryTypeForPath(
  path: string,
  metadata: Record<string, unknown>,
): MemoryType {
  const explicit = stringMetadata(metadata, "memory_type");
  if (isMemoryType(explicit)) {
    return explicit;
  }
  if (path.includes("/decisions/")) {
    return "decision";
  }
  if (path.includes("/lessons/")) {
    return "lesson";
  }
  if (path.includes("/playbooks/")) {
    return "playbook";
  }
  if (path.includes("/references/")) {
    return "reference";
  }
  if (path.includes("/projects/")) {
    return "project";
  }
  if (path.includes("/inbox/")) {
    return "inbox";
  }
  if (path.includes("/proposals/")) {
    return "other";
  }
  return "other";
}

function statusForPath(path: string, metadata: Record<string, unknown>): SkillStatus {
  const explicit = stringMetadata(metadata, "status");
  if (isStatus(explicit)) {
    return explicit;
  }
  if (path.includes("/drafts/") || path.includes("/inbox/")) {
    return "draft";
  }
  if (path.includes("/proposals/")) {
    return "proposed";
  }
  return "adopted";
}

function authorityForMetadata(
  metadata: Record<string, unknown>,
  status: SkillStatus,
): "low" | "medium" | "high" {
  const explicit = stringMetadata(metadata, "authority");
  if (explicit === "low" || explicit === "medium" || explicit === "high") {
    return explicit;
  }
  return status === "adopted" ? "medium" : "low";
}

function metadataForIndex(
  metadata: Record<string, unknown>,
  status: SkillStatus,
): MemoryIndexEntry["metadata"] {
  return {
    status,
    authority: authorityForMetadata(metadata, status),
    created: stringMetadata(metadata, "created"),
    last_reviewed: stringMetadata(metadata, "last_reviewed"),
    last_used: stringMetadata(metadata, "last_used"),
    review_after_days: numberMetadata(metadata, "review_after_days"),
    owner: stringMetadata(metadata, "owner"),
  };
}

function sourceId(prefix: string, path: string): string {
  return `${prefix}.${path
    .replace(/^\.greenhouse\//, "")
    .replace(/\/SKILL\.md$/i, "")
    .replace(/\.md$/i, "")
    .replace(/[^a-zA-Z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase()}`;
}

function isMemoryType(value: string | undefined): value is MemoryType {
  return Boolean(
    value &&
      ["decision", "lesson", "playbook", "reference", "project", "inbox", "other"].includes(
        value,
      ),
  );
}

function isStatus(value: string | undefined): value is SkillStatus {
  return Boolean(value && ["adopted", "draft", "proposed"].includes(value));
}

function yaml(value: unknown): string {
  return stringifyYaml(value, { lineWidth: 0 });
}
