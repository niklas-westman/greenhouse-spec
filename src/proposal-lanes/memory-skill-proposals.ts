import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

import type { MemoryType } from "../schemas/context-manifest.js";
import {
  formatMarkdownDocument,
  markdownTitle,
  parseMarkdownDocument,
  stringMetadata,
} from "../context/markdown.js";

export type ProposalLaneWrite = {
  path: string;
  action: "create" | "update";
};

export type ProposalLaneReport = {
  cwd: string;
  ok: boolean;
  dryRun: boolean;
  action: "memory-propose" | "memory-adopt" | "skill-propose" | "skill-adopt";
  writes: ProposalLaneWrite[];
  message: string;
};

export function proposeMemory(options: {
  cwd: string;
  title: string;
  memoryType: MemoryType;
  body: string;
  dryRun?: boolean;
}): ProposalLaneReport {
  const filePath = join(
    options.cwd,
    ".greenhouse",
    "proposals",
    `${timestamp()}-memory-${slugify(options.title)}.md`,
  );
  const body = [`# ${options.title}`, "", options.body.trim(), ""].join("\n");
  const content = formatMarkdownDocument(
    {
      proposal_type: "memory",
      status: "proposed",
      title: options.title,
      memory_type: options.memoryType,
      created: today(),
      owner: "greenhouse",
    },
    body,
  );

  writeIfNeeded(filePath, content, options.dryRun);

  return report({
    cwd: options.cwd,
    dryRun: options.dryRun,
    action: "memory-propose",
    writes: [{ path: formatPath(options.cwd, filePath), action: "create" }],
    message: `Memory proposal ${options.dryRun ? "would be written" : "written"} to ${formatPath(options.cwd, filePath)}.`,
  });
}

export function proposeSkill(options: {
  cwd: string;
  name: string;
  description: string;
  body: string;
  dryRun?: boolean;
}): ProposalLaneReport {
  const filePath = join(
    options.cwd,
    ".greenhouse",
    "skills",
    "proposals",
    `${timestamp()}-${slugify(options.name)}.md`,
  );
  const body = [`# ${options.name}`, "", options.body.trim(), ""].join("\n");
  const content = formatMarkdownDocument(
    {
      proposal_type: "skill",
      status: "proposed",
      name: options.name,
      description: options.description,
      created: today(),
      owner: "greenhouse",
    },
    body,
  );

  writeIfNeeded(filePath, content, options.dryRun);

  return report({
    cwd: options.cwd,
    dryRun: options.dryRun,
    action: "skill-propose",
    writes: [{ path: formatPath(options.cwd, filePath), action: "create" }],
    message: `Skill proposal ${options.dryRun ? "would be written" : "written"} to ${formatPath(options.cwd, filePath)}.`,
  });
}

export function adoptMemoryProposal(options: {
  cwd: string;
  proposalPath: string;
  memoryType?: MemoryType;
  dryRun?: boolean;
}): ProposalLaneReport {
  const sourcePath = resolvePath(options.cwd, options.proposalPath);
  const source = readProposal(sourcePath);
  const title =
    stringMetadata(source.metadata, "title") ?? markdownTitle(source.body, sourcePath);
  const memoryType =
    options.memoryType ?? memoryTypeFromMetadata(source.metadata) ?? "other";
  const targetPath = join(
    options.cwd,
    ".greenhouse",
    "memory",
    memoryDirectory(memoryType),
    `${slugify(title)}.md`,
  );

  if (existsSync(targetPath)) {
    return report({
      cwd: options.cwd,
      dryRun: options.dryRun,
      action: "memory-adopt",
      ok: false,
      writes: [],
      message: `Adopted memory target already exists: ${formatPath(options.cwd, targetPath)}.`,
    });
  }

  const adoptedContent = formatMarkdownDocument(
    {
      id: `memory.${memoryType}.${slugify(title).replace(/-/g, ".")}`,
      status: "adopted",
      authority: "medium",
      title,
      memory_type: memoryType,
      created: stringMetadata(source.metadata, "created") ?? today(),
      last_reviewed: today(),
      review_after_days: 30,
      owner: stringMetadata(source.metadata, "owner") ?? "greenhouse",
    },
    source.body,
  );
  const updatedProposal = formatMarkdownDocument(
    {
      ...source.metadata,
      status: "adopted",
      adopted_path: formatPath(options.cwd, targetPath),
      adopted_at: today(),
    },
    source.body,
  );

  writeIfNeeded(targetPath, adoptedContent, options.dryRun);
  writeIfNeeded(sourcePath, updatedProposal, options.dryRun);

  return report({
    cwd: options.cwd,
    dryRun: options.dryRun,
    action: "memory-adopt",
    writes: [
      { path: formatPath(options.cwd, targetPath), action: "create" },
      { path: formatPath(options.cwd, sourcePath), action: "update" },
    ],
    message: `Memory proposal ${options.dryRun ? "would be adopted" : "adopted"} to ${formatPath(options.cwd, targetPath)}.`,
  });
}

export function adoptSkillProposal(options: {
  cwd: string;
  proposalPath: string;
  name?: string;
  dryRun?: boolean;
}): ProposalLaneReport {
  const sourcePath = resolvePath(options.cwd, options.proposalPath);
  const source = readProposal(sourcePath);
  const name =
    options.name ??
    stringMetadata(source.metadata, "name") ??
    markdownTitle(source.body, sourcePath);
  const targetPath = join(
    options.cwd,
    ".greenhouse",
    "skills",
    "adopted",
    slugify(name),
    "SKILL.md",
  );

  if (existsSync(targetPath)) {
    return report({
      cwd: options.cwd,
      dryRun: options.dryRun,
      action: "skill-adopt",
      ok: false,
      writes: [],
      message: `Adopted skill target already exists: ${formatPath(options.cwd, targetPath)}.`,
    });
  }

  const adoptedContent = formatMarkdownDocument(
    {
      id: `skill.adopted.${slugify(name).replace(/-/g, ".")}`,
      status: "adopted",
      name,
      description:
        stringMetadata(source.metadata, "description") ??
        "Repo-local adopted Greenhouse skill.",
      created: stringMetadata(source.metadata, "created") ?? today(),
      last_reviewed: today(),
      review_after_days: 30,
      owner: stringMetadata(source.metadata, "owner") ?? "greenhouse",
    },
    source.body,
  );
  const updatedProposal = formatMarkdownDocument(
    {
      ...source.metadata,
      status: "adopted",
      adopted_path: formatPath(options.cwd, targetPath),
      adopted_at: today(),
    },
    source.body,
  );

  writeIfNeeded(targetPath, adoptedContent, options.dryRun);
  writeIfNeeded(sourcePath, updatedProposal, options.dryRun);

  return report({
    cwd: options.cwd,
    dryRun: options.dryRun,
    action: "skill-adopt",
    writes: [
      { path: formatPath(options.cwd, targetPath), action: "create" },
      { path: formatPath(options.cwd, sourcePath), action: "update" },
    ],
    message: `Skill proposal ${options.dryRun ? "would be adopted" : "adopted"} to ${formatPath(options.cwd, targetPath)}.`,
  });
}

export function formatProposalLaneReport(report: ProposalLaneReport): string {
  const lines = [
    "# Greenhouse Proposal Lane",
    "",
    `Action: ${report.action}`,
    `Mode: ${report.dryRun ? "dry-run" : "write"}`,
    `Status: ${report.ok ? "pass" : "fail"}`,
    `Repository: ${report.cwd}`,
    "",
    "## Result",
    "",
    `- ${report.message}`,
    "",
    "## Writes",
    "",
  ];

  if (report.writes.length === 0) {
    lines.push("- none");
  } else {
    for (const write of report.writes) {
      lines.push(`- ${write.action}: ${write.path}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function readProposal(path: string): ReturnType<typeof parseMarkdownDocument> {
  if (!existsSync(path)) {
    throw new Error(`Proposal not found: ${path}`);
  }
  return parseMarkdownDocument(readFileSync(path, "utf8"));
}

function writeIfNeeded(path: string, content: string, dryRun?: boolean): void {
  if (dryRun) {
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function report(
  values: Omit<ProposalLaneReport, "ok" | "dryRun"> & {
    dryRun?: boolean;
    ok?: boolean;
  },
): ProposalLaneReport {
  return {
    ok: values.ok ?? true,
    ...values,
    dryRun: Boolean(values.dryRun),
  };
}

function resolvePath(cwd: string, path: string): string {
  return isAbsolute(path) ? path : join(cwd, path);
}

function formatPath(cwd: string, path: string): string {
  const relativePath = relative(cwd, path).replace(/\\/g, "/");
  return relativePath.startsWith("..") ? path : relativePath;
}

function memoryTypeFromMetadata(metadata: Record<string, unknown>): MemoryType | null {
  const value = stringMetadata(metadata, "memory_type");
  return isMemoryType(value) ? value : null;
}

function memoryDirectory(memoryType: MemoryType): string {
  const directories: Record<MemoryType, string> = {
    decision: "decisions",
    lesson: "lessons",
    playbook: "playbooks",
    reference: "references",
    project: "projects",
    inbox: "inbox",
    other: "references",
  };
  return directories[memoryType];
}

function isMemoryType(value: string | undefined): value is MemoryType {
  return Boolean(
    value &&
      ["decision", "lesson", "playbook", "reference", "project", "inbox", "other"].includes(
        value,
      ),
  );
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "proposal"
  );
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
