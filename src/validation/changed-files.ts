import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export function getChangedFiles(cwd: string): string[] {
  const output = execFileSync("git", ["status", "--porcelain"], {
    cwd,
    encoding: "utf8",
  });

  const files = output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map(parsePorcelainPath)
    .flatMap((path) => expandChangedPath(cwd, path))
    .filter((path): path is string => Boolean(path));

  return [...new Set(files)];
}

function parsePorcelainPath(line: string): string | null {
  const path = line.slice(3);

  if (!path) {
    return null;
  }

  if (path.includes(" -> ")) {
    return path.split(" -> ").at(-1) ?? null;
  }

  return path;
}

function expandChangedPath(cwd: string, path: string | null): string[] {
  if (!path) {
    return [];
  }

  const absolutePath = join(cwd, path);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isDirectory()) {
    return [path];
  }
  if (path.startsWith(".greenhouse/")) {
    return [path];
  }

  const gitFiles = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "--", path],
    {
      cwd,
      encoding: "utf8",
    },
  )
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);

  return gitFiles.length > 0 ? gitFiles : listDirectoryFiles(cwd, path);
}

function listDirectoryFiles(cwd: string, path: string): string[] {
  const absolutePath = join(cwd, path);
  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = `${path.replace(/\/$/, "")}/${entry.name}`;
    if (entry.isDirectory()) {
      return listDirectoryFiles(cwd, childPath);
    }
    return childPath;
  });
}
