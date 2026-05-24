import {
  existsSync,
  readdirSync,
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
};

const defaultKeep = 20;

export function pruneGeneratedRecords(
  options: PruneGeneratedRecordsOptions,
): PruneGeneratedRecordsReport {
  const keep = options.keep ?? defaultKeep;
  const folders = generatedRecordFolders(options.cwd);
  const deleted: string[] = [];
  const kept: string[] = [];

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

    for (const [index, file] of files.entries()) {
      const relativePath = relative(options.cwd, file.path).replace(/\\/g, "/");
      if (index < keep) {
        kept.push(relativePath);
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
    kept,
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

  lines.push("");
  return lines.join("\n");
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
