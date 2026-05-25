import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, relative } from "node:path";

export type PruneGeneratedRecordsOptions = {
  cwd: string;
  dryRun?: boolean;
  keep?: number;
};

export type PruneGeneratedRecordsReport = {
  cwd: string;
  dryRun: boolean;
  keep: number;
  scannedFolders: string[];
  deleted: string[];
  kept: string[];
  keptRecords: Array<{
    path: string;
    reason: string;
  }>;
};

const defaultKeep = 20;

export function pruneGeneratedRecords(
  options: PruneGeneratedRecordsOptions,
): PruneGeneratedRecordsReport {
  const keep = options.keep ?? defaultKeep;
  const folders = generatedRecordFolders(options.cwd);
  const deleted: string[] = [];
  const keptRecords: PruneGeneratedRecordsReport["keptRecords"] = [];

  for (const folder of folders) {
    const files = markdownFiles(folder)
      .map((path) => ({
        path,
        mtimeMs: statSync(path).mtimeMs,
      }))
      .sort((left, right) => {
        const byTime = right.mtimeMs - left.mtimeMs;
        return byTime === 0 ? right.path.localeCompare(left.path) : byTime;
      });
    const preserveReasons = preservationReasons(options.cwd, folder, files);

    for (const [index, file] of files.entries()) {
      const relativePath = relative(options.cwd, file.path).replace(/\\/g, "/");
      const reason =
        index < keep
          ? `within latest ${keep} record(s) for ${relative(options.cwd, folder).replace(/\\/g, "/")}`
          : preserveReasons.get(file.path);

      if (index < keep) {
        keptRecords.push({
          path: relativePath,
          reason: reason ?? "within retention window",
        });
        continue;
      }

      if (reason) {
        keptRecords.push({
          path: relativePath,
          reason,
        });
        continue;
      }

      deleted.push(relativePath);
      if (!options.dryRun) {
        rmSync(file.path, { force: true });
      }
    }
  }

  return {
    cwd: options.cwd,
    dryRun: Boolean(options.dryRun),
    keep,
    scannedFolders: folders.map((folder) =>
      relative(options.cwd, folder).replace(/\\/g, "/"),
    ),
    deleted,
    kept: keptRecords.map((record) => record.path),
    keptRecords,
  };
}

export function formatPruneGeneratedRecordsReport(
  report: PruneGeneratedRecordsReport,
): string {
  const lines = [
    "# Greenhouse Evidence Prune Report",
    "",
    `Repository: ${report.cwd}`,
    `Mode: ${report.dryRun ? "dry-run" : "write"}`,
    `Retention: latest ${report.keep} markdown files per generated record folder`,
    "",
    "## Folders",
    "",
  ];

  if (report.scannedFolders.length === 0) {
    lines.push("- none");
  } else {
    for (const folder of report.scannedFolders) {
      lines.push(`- ${folder}`);
    }
  }

  lines.push("", "## Pruned", "");
  if (report.deleted.length === 0) {
    lines.push("- none");
  } else {
    for (const file of report.deleted) {
      lines.push(`- ${report.dryRun ? "would delete" : "deleted"}: ${file}`);
    }
  }

  lines.push("", "## Kept", "");
  if (report.keptRecords.length === 0) {
    lines.push("- none");
  } else {
    for (const record of report.keptRecords) {
      lines.push(`- kept: ${record.path}`);
      lines.push(`  - reason: ${record.reason}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function preservationReasons(
  cwd: string,
  folder: string,
  files: Array<{ path: string; mtimeMs: number }>,
): Map<string, string> {
  const relativeFolder = relative(cwd, folder).replace(/\\/g, "/");
  if (relativeFolder !== ".greenhouse/evidence") {
    return new Map();
  }

  const reasons = new Map<string, string>();
  const latestFailureByCommand = new Map<string, { path: string; mtimeMs: number }>();

  for (const file of files) {
    for (const command of failedCommands(readFileSync(file.path, "utf8"))) {
      const current = latestFailureByCommand.get(command);
      if (!current || file.mtimeMs > current.mtimeMs) {
        latestFailureByCommand.set(command, file);
      }
    }
  }

  for (const [command, file] of latestFailureByCommand) {
    const existing = reasons.get(file.path);
    const reason = `latest failure evidence for ${command}`;
    reasons.set(file.path, existing ? `${existing}; ${reason}` : reason);
  }

  return reasons;
}

function failedCommands(content: string): string[] {
  const rows = parseTableRows(content, "## Commands run");
  return rows
    .filter((row) => row[1] === "fail")
    .map((row) => row[0]?.replace(/^`|`$/g, "").trim())
    .filter((command): command is string => Boolean(command) && command !== "none");
}

function parseTableRows(content: string, heading: string): string[][] {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) {
    return [];
  }

  const rows: string[][] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) {
      break;
    }
    if (!line.startsWith("|") || line.includes("---")) {
      continue;
    }
    const row = line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim().replace(/\\\|/g, "|"));
    if (row[0] === "Command") {
      continue;
    }
    rows.push(row);
  }
  return rows;
}

function generatedRecordFolders(cwd: string): string[] {
  const greenhousePath = join(cwd, ".greenhouse");
  const folders: string[] = [];
  const evidencePath = join(greenhousePath, "evidence");
  const reportsPath = join(greenhousePath, "reports");

  if (existsSync(evidencePath)) {
    folders.push(evidencePath);
  }

  if (existsSync(reportsPath)) {
    for (const folder of reportFolders(reportsPath)) {
      folders.push(folder);
    }
  }

  return folders;
}

function reportFolders(folder: string): string[] {
  const children = readdirSync(folder, { withFileTypes: true });
  const nested = children
    .filter((child) => child.isDirectory())
    .flatMap((child) => reportFolders(join(folder, child.name)));
  const hasMarkdown = children.some(
    (child) => child.isFile() && child.name.endsWith(".md"),
  );

  return hasMarkdown ? [folder, ...nested] : nested;
}

function markdownFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => join(folder, entry.name));
}
