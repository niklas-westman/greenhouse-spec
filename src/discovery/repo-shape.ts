import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

import fg from "fast-glob";
import { parse as parseYaml } from "yaml";

import type { RepoShape } from "../schemas/repo-shape.js";

import { detectPackageManager } from "./package-manager.js";
import { hasDependency, readPackageJson, type PackageJson } from "./package-json.js";

type CommandSet = RepoShape["packages"][number]["commands"];

const generatedDirectoryReasons: Record<string, string> = {
  ".greenhouse/grown/": "Greenhouse generated index output",
  ".greenhouse/evidence/": "Greenhouse generated validation evidence",
  ".greenhouse/reports/": "Greenhouse generated reports",
  "dist/": "JavaScript build output",
  "dist-cli/": "CLI build output",
};

export function discoverRepoShape(cwd: string): RepoShape {
  const packages = discoverPackages(cwd);
  const javaModules = discoverJavaModules(cwd);
  const rustModules = discoverRustModules(cwd);
  const generated = discoverGenerated(cwd);
  const shape = discoverShape(cwd, packages, javaModules, rustModules);
  const gaps = discoverGaps(packages, javaModules, rustModules, shape);

  return {
    schema_version: 1,
    managed_by: "greenhouse-spec",
    generated_at: new Date().toISOString(),
    confidence: shape.includes("polyglot") || shape.includes("workspace") ? "medium" : "high",
    shape,
    package_manager: detectPackageManager(cwd),
    packages,
    java_modules: javaModules,
    rust_modules: rustModules,
    generated,
    gaps,
  };
}

function discoverPackages(cwd: string): RepoShape["packages"] {
  const packagePaths = new Set<string>();

  if (existsSync(join(cwd, "package.json"))) {
    packagePaths.add("package.json");
  }

  for (const packagePath of discoverWorkspacePackageJsonPaths(cwd)) {
    packagePaths.add(packagePath);
  }

  return [...packagePaths]
    .sort((left, right) => packageDirectory(left).localeCompare(packageDirectory(right)))
    .map((packagePath) => packageEntry(cwd, packagePath));
}

function discoverWorkspacePackageJsonPaths(cwd: string): string[] {
  const workspacePath = join(cwd, "pnpm-workspace.yaml");
  if (!existsSync(workspacePath)) {
    return [];
  }

  const workspace = parseYaml(readFileSync(workspacePath, "utf8")) as {
    packages?: string[];
  } | null;
  const patterns = workspace?.packages ?? [];
  if (patterns.length === 0) {
    return [];
  }

  return fg.sync(
    patterns
      .filter((pattern) => !pattern.startsWith("!"))
      .map((pattern) => `${pattern.replace(/\/+$/, "")}/package.json`),
    {
      cwd,
      ignore: ["**/node_modules/**"],
      onlyFiles: true,
    },
  );
}

function packageEntry(cwd: string, packagePath: string): RepoShape["packages"][number] {
  const directory = packageDirectory(packagePath);
  const packageJson = readNestedPackageJson(cwd, packagePath);
  return {
    path: directory,
    name: packageJson?.name ?? null,
    kind: detectPackageKind(cwd, directory, packageJson),
    languages: detectPackageLanguages(cwd, directory, packageJson),
    frameworks: detectPackageFrameworks(packageJson),
    commands: detectPackageCommands(directory, packageJson),
    confidence: packageJson ? "high" : "low",
  };
}

function readNestedPackageJson(cwd: string, packagePath: string): PackageJson | null {
  if (packagePath === "package.json") {
    return readPackageJson(cwd);
  }

  const absolutePath = join(cwd, packagePath);
  if (!existsSync(absolutePath)) {
    return null;
  }

  return JSON.parse(readFileSync(absolutePath, "utf8")) as PackageJson;
}

function packageDirectory(packagePath: string): string {
  const directory = dirname(packagePath);
  return directory === "." ? "." : `${directory}/`;
}

function detectPackageKind(
  cwd: string,
  directory: string,
  packageJson: PackageJson | null,
): string[] {
  const kind = new Set<string>();

  if (directory !== ".") {
    kind.add("workspace-package");
  }
  if (hasDependency(packageJson, "react")) {
    kind.add("frontend");
  }
  if (
    hasDependency(packageJson, "@tauri-apps/api") ||
    hasDependency(packageJson, "@tauri-apps/cli") ||
    Boolean(packageJson?.scripts?.tauri) ||
    Boolean(packageJson?.scripts?.["tauri:dev"]) ||
    existsSync(join(cwd, directory, "src-tauri", "Cargo.toml"))
  ) {
    kind.add("desktop");
  }
  if (hasDependency(packageJson, "aws-cdk-lib") || basename(directory) === "infra-aws") {
    kind.add("infra");
  }
  if (packageJson?.bin) {
    kind.add("cli");
  }
  if (existsSync(join(cwd, directory, "src", "main", "resources", "api.yaml"))) {
    kind.add("api-spec");
  }
  if (kind.size === 0) {
    kind.add(directory === "." ? "root" : "package");
  }

  return [...kind];
}

function detectPackageLanguages(
  cwd: string,
  directory: string,
  packageJson: PackageJson | null,
): string[] {
  const languages = new Set<string>();

  if (hasDependency(packageJson, "typescript") || existsSync(join(cwd, directory, "tsconfig.json"))) {
    languages.add("typescript");
  }
  if (existsSync(join(cwd, directory, "pom.xml"))) {
    languages.add("java");
  }
  if (
    existsSync(join(cwd, directory, "Cargo.toml")) ||
    existsSync(join(cwd, directory, "src-tauri", "Cargo.toml"))
  ) {
    languages.add("rust");
  }

  return [...languages];
}

function detectPackageFrameworks(packageJson: PackageJson | null): string[] {
  const frameworks = ["react", "vite", "vitest"].filter((name) =>
    hasDependency(packageJson, name),
  );

  if (
    hasDependency(packageJson, "@tauri-apps/api") ||
    hasDependency(packageJson, "@tauri-apps/cli") ||
    Boolean(packageJson?.scripts?.tauri) ||
    Boolean(packageJson?.scripts?.["tauri:dev"])
  ) {
    frameworks.push("tauri");
  }

  return frameworks;
}

function detectPackageCommands(
  directory: string,
  packageJson: PackageJson | null,
): CommandSet {
  const scripts = packageJson?.scripts ?? {};
  const prefix = directory === "." ? "pnpm" : `pnpm --dir ${directory.replace(/\/$/, "")}`;

  return {
    build: scripts.build ? `${prefix} build` : null,
    lint: scripts.lint ? `${prefix} lint` : null,
    test: scripts.test ? `${prefix} test` : null,
    typecheck: scripts.typecheck ? `${prefix} typecheck` : null,
  };
}

function discoverJavaModules(cwd: string): RepoShape["java_modules"] {
  return fg.sync(["pom.xml", "**/pom.xml"], {
    cwd,
    ignore: ["**/node_modules/**", "**/target/**"],
    onlyFiles: true,
  }).sort().map((pomPath) => {
    const directory = dirname(pomPath) === "." ? "." : `${dirname(pomPath)}/`;
    return {
      path: directory,
      artifact_id: readArtifactId(join(cwd, pomPath)),
      build_tool: "maven" as const,
      commands: {
        build: directory === "." ? "mvn package" : `cd ${directory.replace(/\/$/, "")} && mvn package`,
        test: directory === "." ? "mvn test" : `cd ${directory.replace(/\/$/, "")} && mvn test`,
      },
      confidence: "medium" as const,
    };
  });
}

function discoverRustModules(cwd: string): RepoShape["rust_modules"] {
  return fg.sync(["Cargo.toml", "**/Cargo.toml"], {
    cwd,
    ignore: ["**/node_modules/**", "**/target/**"],
    onlyFiles: true,
  }).sort().map((cargoPath) => {
    const directory = dirname(cargoPath) === "." ? "." : `${dirname(cargoPath)}/`;
    return {
      path: directory,
      package_name: readCargoPackageName(join(cwd, cargoPath)),
      build_tool: "cargo" as const,
      commands: {
        build: directory === "." ? "cargo build" : `cd ${directory.replace(/\/$/, "")} && cargo build`,
        test: directory === "." ? "cargo test" : `cd ${directory.replace(/\/$/, "")} && cargo test`,
      },
      confidence: "medium" as const,
    };
  });
}

function readCargoPackageName(cargoPath: string): string | null {
  const source = readFileSync(cargoPath, "utf8");
  const packageSection = source.match(/\[package\]([\s\S]*?)(?:\n\[|$)/);
  const match = packageSection?.[1]?.match(/^\s*name\s*=\s*"([^"]+)"\s*$/m);
  return match?.[1] ?? null;
}

function readArtifactId(pomPath: string): string | null {
  const source = readFileSync(pomPath, "utf8").replace(
    /<parent>[\s\S]*?<\/parent>/,
    "",
  );
  const match = source.match(/<artifactId>\s*([^<]+?)\s*<\/artifactId>/);
  return match?.[1] ?? null;
}

function discoverGenerated(cwd: string): RepoShape["generated"] {
  const generated: RepoShape["generated"] = Object.entries(generatedDirectoryReasons)
    .filter(([path]) => existsSync(join(cwd, path)))
    .map(([path, reason]) => ({
      path,
      reason,
      confidence: "high" as const,
    }));

  for (const path of fg.sync(["**/target"], {
    cwd,
    ignore: ["**/node_modules/**"],
    onlyDirectories: true,
  })) {
    const normalizedPath = `${path.replace(/\/$/, "")}/`;
    generated.push({
      path: normalizedPath,
      reason: targetDirectoryReason(cwd, normalizedPath),
      confidence: "high",
    });
  }

  for (const path of fg.sync(["**/src/generated"], {
    cwd,
    ignore: ["**/node_modules/**"],
    onlyFiles: false,
    onlyDirectories: true,
  })) {
    generated.push({
      path: `${path.replace(/\/$/, "")}/`,
      reason: "Generated source output",
      confidence: "medium",
    });
  }

  return uniqueByPath(generated);
}

function discoverShape(
  cwd: string,
  packages: RepoShape["packages"],
  javaModules: RepoShape["java_modules"],
  rustModules: RepoShape["rust_modules"],
): string[] {
  const shape = new Set<string>();

  if (packages.length <= 1) {
    shape.add("single-package");
  }
  if (existsSync(join(cwd, "pnpm-workspace.yaml")) || packages.length > 1) {
    shape.add("workspace");
  }
  if (packages.some((item) => item.kind.includes("frontend"))) {
    shape.add("frontend-react");
  }
  if (javaModules.length > 0) {
    shape.add("java-maven");
  }
  if (rustModules.length > 0) {
    shape.add("rust-cargo");
  }
  if (
    existsSync(join(cwd, "src-tauri", "Cargo.toml")) ||
    packages.some((item) => item.frameworks.includes("tauri"))
  ) {
    shape.add("tauri");
  }
  if (packages.some((item) => item.kind.includes("api-spec"))) {
    shape.add("api-spec");
  }
  if (packages.some((item) => item.kind.includes("infra"))) {
    shape.add("infra");
  }
  if ((shape.has("java-maven") || shape.has("rust-cargo")) && packages.length > 0) {
    shape.add("polyglot");
  }

  return [...shape];
}

function discoverGaps(
  packages: RepoShape["packages"],
  javaModules: RepoShape["java_modules"],
  rustModules: RepoShape["rust_modules"],
  shape: string[],
): RepoShape["gaps"] {
  const gaps: RepoShape["gaps"] = [];

  if (shape.includes("workspace")) {
    const packagesWithoutTest = packages
      .filter((item) => item.path !== "." && !item.commands.test)
      .map((item) => item.path);
    if (packagesWithoutTest.length > 0) {
      gaps.push({
        id: "workspace-package-without-test-command",
        severity: "warning",
        message: "Some workspace packages do not expose a test script.",
        paths: packagesWithoutTest,
      });
    }
  }

  if (javaModules.length > 0) {
    gaps.push({
      id: "maven-routes-need-authored-validation",
      severity: "info",
      message: "Maven modules were detected; verify authored validation routes call the intended Maven commands.",
      paths: javaModules.map((item) => item.path),
    });
  }

  if (rustModules.length > 0) {
    gaps.push({
      id: "cargo-routes-need-authored-validation",
      severity: "info",
      message: "Cargo modules were detected; verify authored validation routes call the intended Cargo commands.",
      paths: rustModules.map((item) => item.path),
    });
  }

  if (shape.includes("polyglot")) {
    gaps.push({
      id: "polyglot-routing-review",
      severity: "info",
      message: "Polyglot repos usually need path-specific validation routes instead of broad root defaults.",
      paths: [],
    });
  }

  return gaps;
}

function targetDirectoryReason(cwd: string, targetPath: string): string {
  const modulePath = targetPath.replace(/target\/$/, "");

  if (existsSync(join(cwd, modulePath, "Cargo.toml"))) {
    return "Rust/Cargo build output";
  }

  if (existsSync(join(cwd, modulePath, "pom.xml"))) {
    return "Maven build output";
  }

  return "Build output";
}

function uniqueByPath<T extends { path: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = item.path.replace(/\\/g, "/");
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    item.path = normalized;
    return true;
  });
}
