import { execFileSync } from "node:child_process";

export function getChangedFiles(cwd: string): string[] {
  const output = execFileSync("git", ["status", "--porcelain"], {
    cwd,
    encoding: "utf8",
  });

  return output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map(parsePorcelainPath)
    .filter((path): path is string => Boolean(path));
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
