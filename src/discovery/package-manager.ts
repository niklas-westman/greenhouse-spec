import { existsSync } from "node:fs";
import { join } from "node:path";

import { readPackageJson } from "./package-json.js";

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun" | null;

export function detectPackageManager(cwd: string): PackageManager {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (existsSync(join(cwd, "package-lock.json"))) {
    return "npm";
  }
  if (existsSync(join(cwd, "yarn.lock"))) {
    return "yarn";
  }
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) {
    return "bun";
  }

  const packageManager = readPackageJson(cwd)?.packageManager?.split("@")[0];

  if (
    packageManager === "pnpm" ||
    packageManager === "npm" ||
    packageManager === "yarn" ||
    packageManager === "bun"
  ) {
    return packageManager;
  }

  return null;
}
