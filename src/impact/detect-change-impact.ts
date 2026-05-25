import type { RepoShape } from "../schemas/repo-shape.js";
import type { DocsOwnership, DocsRoot } from "../schemas/docs-root.js";

export type ImpactSeverity = "advisory" | "warning" | "guarded" | "blocking";

export type ImpactWarning = {
  id: string;
  severity: ImpactSeverity;
  kind:
    | "documentation-drift"
    | "validation-route-drift"
    | "generated-boundary"
    | "generated-output-drift"
    | "repo-shape-drift";
  changedFiles: string[];
  affected: string[];
  reason: string;
  resolution: string;
};

export function detectChangeImpact(options: {
  changedFiles: string[];
  docsRoot?: DocsRoot;
  repoShape?: RepoShape;
}): ImpactWarning[] {
  const warnings: ImpactWarning[] = [];
  const changedFiles = uniqueSorted(options.changedFiles);
  const docs = docsResolver(options.docsRoot);
  const add = (warning: ImpactWarning) => {
    if (warning.changedFiles.length > 0) {
      warnings.push({
        ...warning,
        changedFiles: uniqueSorted(warning.changedFiles),
        affected: uniqueSorted(warning.affected),
      });
    }
  };

  add({
    id: "impact.package-scripts-docs",
    severity: "warning",
    kind: "documentation-drift",
    changedFiles: changedFiles.filter(isPackageJson),
    affected: [
      ...docs(["setup", "package-scripts", "validation"], ["README.md", "docs/setup.md"]),
      ".greenhouse/roots/validation.yaml",
    ],
    reason:
      "package.json changed; setup docs and Greenhouse validation roots may describe stale scripts.",
    resolution:
      "Review affected setup/validation docs and validation roots; update stale command references or leave evidence that behavior did not change.",
  });

  add({
    id: "impact.cli-docs",
    severity: "advisory",
    kind: "documentation-drift",
    changedFiles: changedFiles.filter(isCliSource),
    affected: docs(["cli"], ["README.md", "docs/cli.md"]),
    reason: "CLI source changed; CLI docs, examples, or help text may be stale.",
    resolution:
      "Review affected CLI docs and help examples if command behavior or flags changed.",
  });

  add({
    id: "impact.api-spec-generated",
    severity: "guarded",
    kind: "generated-output-drift",
    changedFiles: changedFiles.filter(isApiSpec),
    affected: [
      ...docs(["api", "generated"], ["docs/api.md"]),
      "generated API clients or server stubs",
    ],
    reason:
      "API contract changed; generated clients/server stubs and API docs may need regeneration or review.",
    resolution:
      "Regenerate or review generated API outputs and API docs before treating the change as fully tended.",
  });

  add({
    id: "impact.env-docs",
    severity: "warning",
    kind: "documentation-drift",
    changedFiles: changedFiles.filter(isEnvOrConfigSchema),
    affected: [".env.example", ...docs(["env", "deployment", "setup"], ["docs/deployment.md", "README.md"])],
    reason:
      "environment or configuration schema changed; setup and deployment docs may be stale.",
    resolution:
      "Review `.env.example` and affected setup/deployment docs for required variable or config changes.",
  });

  add({
    id: "impact.workspace-shape",
    severity: "warning",
    kind: "repo-shape-drift",
    changedFiles: changedFiles.filter(isWorkspaceConfig),
    affected: [
      ".greenhouse/grown/repo-shape.yaml",
      ".greenhouse/roots/validation.yaml",
      ...docs(["workspace", "validation"], []),
    ],
    reason:
      "workspace configuration changed; repo shape, package scopes, and validation routes may need refresh.",
    resolution:
      "Run `greenhouse-spec inspect` and review validation proposals or route ownership for changed workspace scope.",
  });

  add({
    id: "impact.ci-validation-docs",
    severity: "warning",
    kind: "validation-route-drift",
    changedFiles: changedFiles.filter(isCiWorkflow),
    affected: [
      ...docs(["ci", "setup", "validation"], ["README.md", "docs/setup.md"]),
      ".greenhouse/roots/validation.yaml",
    ],
    reason:
      "CI workflow changed; local validation docs and Greenhouse routes may need review.",
    resolution:
      "Review affected validation docs and Greenhouse routes against the updated CI workflow.",
  });

  add({
    id: "impact.tauri-packaging",
    severity: "advisory",
    kind: "documentation-drift",
    changedFiles: changedFiles.filter(isTauriPath),
    affected: docs(["desktop"], ["docs/desktop.md", "README.md"]),
    reason: "Tauri/Rust desktop files changed; packaging or desktop runtime docs may be affected.",
    resolution:
      "Review desktop/runtime docs if packaging, permissions, or native runtime behavior changed.",
  });

  add({
    id: "impact.generated-boundary",
    severity: "guarded",
    kind: "generated-boundary",
    changedFiles: changedFiles.filter((file) =>
      isGeneratedOutput(file, options.repoShape),
    ),
    affected: ["source generator", ".greenhouse/roots/validation.yaml"],
    reason:
      "generated output changed; verify the source generator or boundary rule instead of treating generated files as authored source.",
    resolution:
      "Regenerate from the source generator or document why this generated output change is intentional.",
  });

  return uniqueWarnings(warnings);
}

function docsResolver(
  docsRoot: DocsRoot | undefined,
): (owners: DocsOwnership[], fallback: string[]) => string[] {
  return (owners, fallback) => {
    const tracked = docsRoot?.tracked_docs
      .filter((doc) => doc.owns.some((owner) => owners.includes(owner)))
      .map((doc) => doc.path) ?? [];
    return tracked.length > 0 ? tracked : fallback;
  };
}

function isPackageJson(file: string): boolean {
  return file.endsWith("package.json");
}

function isCliSource(file: string): boolean {
  return file.startsWith("src/cli/") || file.includes("/src/cli/");
}

function isApiSpec(file: string): boolean {
  const lower = file.toLowerCase();
  return (
    lower.endsWith("openapi.yaml") ||
    lower.endsWith("openapi.yml") ||
    lower.endsWith("openapi.json") ||
    lower.endsWith("api.yaml") ||
    lower.endsWith("api.yml")
  );
}

function isEnvOrConfigSchema(file: string): boolean {
  const lower = file.toLowerCase();
  return (
    lower.endsWith(".env.example") ||
    lower.endsWith("env.schema.ts") ||
    lower.endsWith("env.schema.js") ||
    lower.includes("/config/schema") ||
    lower.includes("/env/schema")
  );
}

function isWorkspaceConfig(file: string): boolean {
  return (
    file === "pnpm-workspace.yaml" ||
    file === "turbo.json" ||
    file === "nx.json" ||
    file.endsWith("/pnpm-workspace.yaml")
  );
}

function isCiWorkflow(file: string): boolean {
  return file.startsWith(".github/workflows/");
}

function isTauriPath(file: string): boolean {
  return file.startsWith("src-tauri/") || file.includes("/src-tauri/");
}

function isGeneratedOutput(file: string, repoShape?: RepoShape): boolean {
  const generated = repoShape?.generated ?? [];
  return generated
    .filter((item) => !item.path.startsWith(".greenhouse/"))
    .some((item) => file === item.path.replace(/\/$/, "") || file.startsWith(item.path));
}

function uniqueWarnings(warnings: ImpactWarning[]): ImpactWarning[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.id}\0${warning.changedFiles.join("\0")}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueSorted(items: string[]): string[] {
  return [...new Set(items)].sort();
}
