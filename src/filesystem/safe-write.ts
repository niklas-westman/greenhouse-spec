import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type PlannedWriteKind = "authored" | "generated";

export type PlannedWrite = {
  relativePath: string;
  content: string;
  kind: PlannedWriteKind;
  executable?: boolean;
};

export type SafeWriteResultStatus =
  | "blocked"
  | "created"
  | "dry-run"
  | "skipped"
  | "updated";

export type SafeWriteResult = {
  relativePath: string;
  status: SafeWriteResultStatus;
  reason?: string;
};

export type SafeWriteOptions = {
  cwd: string;
  dryRun?: boolean;
  forceAuthored?: boolean;
  writes: PlannedWrite[];
};

export function applySafeWrites(options: SafeWriteOptions): SafeWriteResult[] {
  const blocked = findBlockedWrites(options);

  if (blocked.length > 0) {
    return blocked;
  }

  return options.writes.map((write) => {
    const targetPath = join(options.cwd, write.relativePath);

    if (options.dryRun) {
      return {
        relativePath: write.relativePath,
        status: "dry-run",
      };
    }

    const existed = existsSync(targetPath);

    if (existed) {
      const existingContent = readFileSync(targetPath, "utf8");
      if (existingContent === write.content) {
        return {
          relativePath: write.relativePath,
          status: "skipped",
          reason: "content unchanged",
        };
      }
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, write.content, {
      encoding: "utf8",
      mode: write.executable ? 0o755 : 0o644,
    });

    return {
      relativePath: write.relativePath,
      status: existed ? "updated" : "created",
    };
  });
}

function findBlockedWrites(options: SafeWriteOptions): SafeWriteResult[] {
  return options.writes
    .filter((write) => {
      if (write.kind !== "authored" || options.forceAuthored) {
        return false;
      }

      return existsSync(join(options.cwd, write.relativePath));
    })
    .map((write) => ({
      relativePath: write.relativePath,
      status: "blocked",
      reason:
        "authored greenhouse file already exists; rerun with --force-authored to overwrite",
    }));
}
