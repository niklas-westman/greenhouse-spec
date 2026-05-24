import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type PackageJson = {
  name?: string;
  packageManager?: string;
  engines?: Record<string, string>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  bin?: string | Record<string, string>;
};

export function readPackageJson(cwd: string): PackageJson | null {
  const packageJsonPath = join(cwd, "package.json");

  if (!existsSync(packageJsonPath)) {
    return null;
  }

  return JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
}

export function hasDependency(packageJson: PackageJson | null, name: string): boolean {
  return Boolean(
    packageJson?.dependencies?.[name] ?? packageJson?.devDependencies?.[name],
  );
}
