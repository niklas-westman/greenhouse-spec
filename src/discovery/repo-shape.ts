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
  "target/": "Maven build output",
};

export function discoverRepoShape(cwd: string): RepoShape {
  const packages = discoverPackages(cwd);
  const javaModules = discoverJavaModules(cwd);
  const generated = discoverGenerated(cwd);
  const shape = discoverShape(cwd, packages, javaModules);
  const gaps = discoverGaps(packages, javaModules, shape);

  return {
    schema_version: 1,
    managed_by: "greenhouse-spec",
    generated_at: new Date().toISOString(),
    confidence: shape.includes("polyglot") || shape.includes("workspace") ? "medium" : "high",
    shape,
    package_manager: detectPackageManager(cwd),
    packages,
    java_modules: javaModules,
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

  return [...languages];
}

function detectPackageFrameworks(packageJson: PackageJson | null): string[] {
  return ["react", "vite", "vitest"].filter((name) => hasDependency(packageJson, name));
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
    generated.push({
      path: `${path.replace(/\/$/, "")}/`,
      reason: "Maven build output",
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
  if (packages.some((item) => item.kind.includes("api-spec"))) {
    shape.add("api-spec");
  }
  if (packages.some((item) => item.kind.includes("infra"))) {
    shape.add("infra");
  }
  if (shape.has("java-maven") && packages.length > 0) {
    shape.add("polyglot");
  }

  return [...shape];
}

function discoverGaps(
  packages: RepoShape["packages"],
  javaModules: RepoShape["java_modules"],
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
