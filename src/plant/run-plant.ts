import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { stringify as stringifyYaml } from "yaml";

import { discoverAgentFiles } from "../discovery/agent-files.js";
import type { AgentFileEntry } from "../discovery/agent-files.js";
import { discoverCommandIndex } from "../discovery/scripts.js";
import { detectPackageManager } from "../discovery/package-manager.js";
import { hasDependency, readPackageJson } from "../discovery/package-json.js";
import { greenhouseCommandForRepo } from "../native-scripts/package-script-proposals.js";
import { discoverRepoMap } from "../discovery/repo-map.js";
import { discoverRepoShape } from "../discovery/repo-shape.js";
import { discoverRiskIndex } from "../discovery/risks.js";
import { buildValidationProposals } from "../proposals/build-proposals.js";
import { buildEvidenceIndex } from "../evidence/evidence-index.js";
import { buildFailureSignatures } from "../evidence/failure-signatures.js";
import { findPackageRoot } from "../filesystem/package-root.js";
import { runInspect } from "../inspect/run-inspect.js";
import { buildMemoryIndex, buildSkillIndex } from "../context/knowledge-index.js";
import { buildAgentOnboardingWrites } from "../lifecycle/agent-onboarding.js";
import { buildPackageScriptOnboardingWrites } from "../lifecycle/package-script-onboarding.js";
import {
  applySafeWrites,
  type PlannedWrite,
  type SafeWriteResult,
} from "../filesystem/safe-write.js";
import { mvpInstalledDirectories } from "../templates/installed-tree.js";
import {
  GREENHOUSE_INSTALL_MODE,
  GREENHOUSE_SPEC_VERSION,
  GREENHOUSE_TEMPLATE_VERSION,
} from "../version.js";

export type PlantOptions = {
  cwd: string;
  dryRun?: boolean;
  forceAuthored?: boolean;
};

export type PlantReport = {
  cwd: string;
  ok: boolean;
  dryRun: boolean;
  directories: string[];
  writes: SafeWriteResult[];
};

const packageRoot = findPackageRoot(import.meta.url);
const templateRoot = join(packageRoot, "templates", "installed");

export function runPlant(options: PlantOptions): PlantReport {
  const directories = mvpInstalledDirectories.map(
    (directory) => `.greenhouse/${directory}`,
  );
  const packageScriptOnboardingWrites = buildPackageScriptOnboardingWrites(options.cwd);
  const agentOnboardingWrites = buildAgentOnboardingWrites(options.cwd);
  const writes = [
    ...buildPlantWrites(options.cwd, agentOnboardingWrites),
    ...packageScriptOnboardingWrites,
    ...agentOnboardingWrites,
  ];
  const results = applySafeWrites({
    cwd: options.cwd,
    dryRun: options.dryRun,
    forceAuthored: options.forceAuthored,
    writes,
  });
  const ok = results.every((result) => result.status !== "blocked");

  if (ok && !options.dryRun) {
    for (const directory of directories) {
      mkdirSync(join(options.cwd, directory), { recursive: true });
    }
    runInspect({ cwd: options.cwd });
  }

  return {
    cwd: options.cwd,
    ok,
    dryRun: Boolean(options.dryRun),
    directories,
    writes: results,
  };
}

export function formatPlantReport(report: PlantReport): string {
  const lines = [
    "# Greenhouse Plant Report",
    "",
    `Repository: ${report.cwd}`,
    `Mode: ${report.dryRun ? "dry-run" : "write"}`,
    `Status: ${report.ok ? "pass" : "blocked"}`,
    "",
    "## Directories",
    "",
  ];

  for (const directory of report.directories) {
    lines.push(`- ${directory}`);
  }

  lines.push("", "## Files", "");

  for (const write of report.writes) {
    const reason = write.reason ? ` - ${write.reason}` : "";
    lines.push(`- ${write.status}: ${write.relativePath}${reason}`);
  }

  lines.push("");
  return lines.join("\n");
}

function buildPlantWrites(
  cwd: string,
  agentOnboardingWrites: PlannedWrite[],
): PlannedWrite[] {
  const repoMap = discoverRepoMap(cwd);
  const agentFiles = plannedAgentFiles(cwd, agentOnboardingWrites);
  repoMap.agent_files = agentFiles;
  const repoShape = discoverRepoShape(cwd);
  const commandIndex = discoverCommandIndex(cwd);
  const riskIndex = discoverRiskIndex(cwd);
  const validationProposals = buildValidationProposals({ cwd, repoShape });
  const now = new Date().toISOString();

  return [
    authored("project.yaml", projectYaml(cwd)),
    authored("roots/rules.md", template("roots/rules.md")),
    authored("roots/protected-boundaries.md", template("roots/protected-boundaries.md")),
    authored("roots/validation.yaml", validationYaml(cwd)),
    authored("roots/authority.md", template("roots/authority.md")),
    authored("roots/docs.yaml", template("roots/docs.yaml")),
    authored("why-greenhouse-spec/README.md", template("why-greenhouse-spec/README.md")),
    authored("why-greenhouse-spec/tree-structure.md", template("why-greenhouse-spec/tree-structure.md")),
    authored("why-greenhouse-spec/agent-workflow.md", template("why-greenhouse-spec/agent-workflow.md")),
    generated("grown/repo-map.yaml", yaml(repoMap)),
    generated("grown/repo-shape.yaml", yaml(repoShape)),
    generated("grown/command-index.yaml", yaml(commandIndex)),
    generated("grown/validation-proposals.yaml", yaml(validationProposals)),
    generated("grown/docs-index.yaml", yaml({
      schema_version: 1,
      managed_by: "greenhouse-spec",
      generated_at: now,
      docs: repoMap.docs,
    })),
    generated("grown/risk-index.yaml", yaml(riskIndex)),
    generated("grown/agent-index.yaml", yaml({
      schema_version: 1,
      managed_by: "greenhouse-spec",
      generated_at: now,
      agent_files: agentFiles,
    })),
    generated("grown/evidence-index.yaml", yaml(buildEvidenceIndex(cwd))),
    generated("grown/failure-signatures.yaml", yaml(buildFailureSignatures(cwd))),
    generated("grown/memory-index.yaml", yaml(buildMemoryIndex(cwd))),
    generated("grown/skill-index.yaml", yaml(buildSkillIndex(cwd))),
    generated(
      "grown/last-inspection.md",
      [
        "# Last Greenhouse Inspection",
        "",
        `Generated by \`greenhouse-spec plant\` on ${now}.`,
        "",
        `Repo shape: ${repoShape.shape.join(", ") || "unknown"}`,
        `Repo shape gaps: ${repoShape.gaps.length}`,
        `Validation proposals: ${validationProposals.proposals.length}`,
        "",
      ].join("\n"),
    ),
    authored("context/manifest.yaml", template("context/manifest.yaml")),
    authored("memory/README.md", template("memory/README.md")),
    authored("skills/README.md", template("skills/README.md")),
    authored("scripts/check-changed.mjs", template("scripts/check-changed.mjs"), true),
    authored("scripts/check-greenhouse.mjs", template("scripts/check-greenhouse.mjs"), true),
    authored("scripts/validate-scope.mjs", template("scripts/validate-scope.mjs"), true),
    authored("templates/evidence.md", template("templates/evidence.md")),
    authored("templates/verification.md", template("templates/verification.md")),
  ];
}

function plannedAgentFiles(
  cwd: string,
  agentOnboardingWrites: PlannedWrite[],
): AgentFileEntry[] {
  const plannedPaths = new Set(
    agentOnboardingWrites.map((write) => write.relativePath),
  );
  return discoverAgentFiles(cwd).map((entry) => ({
    ...entry,
    present: entry.present || plannedPaths.has(entry.path),
  }));
}

function projectYaml(cwd: string): string {
  const packageJson = readPackageJson(cwd);
  const packageManager = detectPackageManager(cwd);
  const frameworks = ["react", "vite"].filter((name) =>
    hasDependency(packageJson, name),
  );
  const testRunners = hasDependency(packageJson, "vitest") ? ["vitest"] : [];
  const languages = hasDependency(packageJson, "typescript") ? ["typescript"] : [];
  const repoTypes = new Set<string>();

  if (frameworks.length > 0) {
    repoTypes.add("app");
  }
  if (packageJson?.bin) {
    repoTypes.add("cli");
  }
  if (repoTypes.size === 0) {
    repoTypes.add("app");
  }

  return yaml({
    schema_version: 1,
    profile_version: 1,
    repo: {
      name: packageJson?.name ?? cwd.split("/").at(-1) ?? "unknown",
      description: "Repository initialized with greenhouse-spec",
      type: [...repoTypes],
      default_branch: null,
    },
    stack: {
      package_manager: packageManager,
      languages,
      runtimes: packageJson?.engines?.node
        ? {
            node: packageJson.engines.node,
          }
        : {},
      frameworks,
      test_runners: testRunners,
    },
    greenhouse: {
      folder: ".greenhouse",
      created_at: new Date().toISOString().slice(0, 10),
      last_inspected_at: null,
      mode_default: "growth",
      installed_version: GREENHOUSE_SPEC_VERSION,
      template_version: GREENHOUSE_TEMPLATE_VERSION,
      install_mode: GREENHOUSE_INSTALL_MODE,
      cli_command: greenhouseCommandForRepo(cwd),
      last_updated_at: null,
    },
  });
}

function validationYaml(cwd: string): string {
  const scripts = readPackageJson(cwd)?.scripts ?? {};
  const required = [
    commandIfPresent(scripts, "format:check", "pnpm format:check") ??
      commandIfPresent(scripts, "lint", "pnpm lint"),
    commandIfPresent(scripts, "typecheck", "pnpm typecheck"),
    commandIfPresent(scripts, "test", "pnpm test"),
    commandIfPresent(scripts, "test:cli", "pnpm test:cli"),
  ].filter((command) => command !== null);
  const recommended = [
    commandIfPresent(scripts, "build", "pnpm build"),
  ].filter((command) => command !== null);
  const growthRequired =
    required.length > 0
      ? required
      : [
          { id: "typecheck", command: "pnpm typecheck" },
          { id: "test", command: "pnpm test" },
        ];

  return yaml({
    schema_version: 1,
    defaults: {
      required: growthRequired,
      recommended,
    },
    timeouts: {
      default_seconds: 300,
      long_seconds: 900,
    },
    modes: {
      patch: {
        required: [
          {
            id: "changed-scope",
            command: "greenhouse-spec verify --changed",
          },
        ],
      },
      growth: {
        required: growthRequired,
      },
      guarded: {
        required: recommended.length > 0 ? [...growthRequired, ...recommended] : growthRequired,
        manual: [
          {
            id: "human-risk-review",
            prompt: "Human must review guarded risk notes before merge.",
          },
        ],
      },
    },
    paths: {},
    risks: {},
    blocked: {
      destructive: {
        patterns: ["rm -rf", "git reset --hard"],
        action: "ask-human",
      },
    },
  });
}

function commandIfPresent(
  scripts: Record<string, string>,
  id: string,
  command: string,
): { id: string; command: string } | null {
  return scripts[id] ? { id, command } : null;
}

function authored(
  relativePath: string,
  content: string,
  executable = false,
): PlannedWrite {
  return greenhouseWrite(relativePath, content, "authored", executable);
}

function generated(
  relativePath: string,
  content: string,
  executable = false,
): PlannedWrite {
  return greenhouseWrite(relativePath, content, "generated", executable);
}

function greenhouseWrite(
  relativePath: string,
  content: string,
  kind: PlannedWrite["kind"],
  executable = false,
): PlannedWrite {
  return {
    relativePath: `.greenhouse/${relativePath}`,
    content,
    kind,
    executable,
  };
}

function template(relativePath: string): string {
  return readFileSync(join(templateRoot, relativePath), "utf8");
}

function yaml(value: unknown): string {
  return stringifyYaml(value, {
    lineWidth: 0,
  });
}
