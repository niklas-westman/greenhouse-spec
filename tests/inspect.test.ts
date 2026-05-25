import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";
import { afterEach, describe, expect, it } from "vitest";

import { runDoctor } from "../src/doctor/run-doctor.js";
import { runInspect } from "../src/inspect/run-inspect.js";
import { runPlant } from "../src/plant/run-plant.js";

const tempRepos: string[] = [];

afterEach(() => {
  for (const repo of tempRepos.splice(0)) {
    rmSync(repo, { recursive: true, force: true });
  }
});

describe("inspect", () => {
  it("refreshes grown files without mutating authored roots or package scripts", () => {
    const repo = createDeclarionLiteRepo();
    runPlant({ cwd: repo });
    updatePackageJson(repo, (packageJson) => {
      packageJson.scripts = {
        ...packageJson.scripts,
        "validate:domain": "greenhouse-spec verify --paths",
      };
    });
    const rulesBefore = readGreenhouseFile(repo, "roots/rules.md");
    const validationBefore = readGreenhouseFile(repo, "roots/validation.yaml");
    const packageJsonBefore = readFileSync(join(repo, "package.json"), "utf8");

    const report = runInspect({ cwd: repo });

    expect(report.ok).toBe(true);
    expect(readGreenhouseFile(repo, "roots/rules.md")).toBe(rulesBefore);
    expect(readGreenhouseFile(repo, "roots/validation.yaml")).toBe(
      validationBefore,
    );
    expect(readFileSync(join(repo, "package.json"), "utf8")).toBe(
      packageJsonBefore,
    );
    expect(
      readGreenhouseYaml(repo, "grown/command-index.yaml").commands.map(
        (command: { id: string }) => command.id,
      ),
    ).toContain("validate:domain");
  });

  it("supports dry-run without updating grown files", () => {
    const repo = createTinyNodeRepo();
    runPlant({ cwd: repo });
    const commandIndexBefore = readGreenhouseFile(repo, "grown/command-index.yaml");
    updatePackageJson(repo, (packageJson) => {
      packageJson.scripts = {
        ...packageJson.scripts,
        check: "node --check index.js",
      };
    });

    const report = runInspect({ cwd: repo, dryRun: true });

    expect(report.ok).toBe(true);
    expect(report.writes.every((write) => write.status === "dry-run")).toBe(true);
    expect(readGreenhouseFile(repo, "grown/command-index.yaml")).toBe(
      commandIndexBefore,
    );
  });

  it("prints package script and validation-root proposals without applying them", () => {
    const repo = createDeclarionLiteRepo();
    mkdirSync(join(repo, "src", "engine", "sru"), { recursive: true });
    runPlant({ cwd: repo });
    const packageJsonBefore = readFileSync(join(repo, "package.json"), "utf8");

    const report = runInspect({ cwd: repo });

    expect(report.proposals).toContainEqual(
      expect.objectContaining({
        kind: "package-script",
        name: "greenhouse",
        command: expect.stringMatching(/greenhouse-spec\/dist\/cli\.js$/),
      }),
    );
    expect(report.proposals).toContainEqual(
      expect.objectContaining({
        kind: "package-script",
        name: "greenhouse:status",
        command: expect.stringContaining("greenhouse-spec/dist/cli.js status"),
      }),
    );
    expect(report.proposals).toContainEqual(
      expect.objectContaining({
        kind: "package-script",
        name: "validate:cli",
      }),
    );
    expect(report.proposals).toContainEqual(
      expect.objectContaining({
        kind: "validation-root",
      }),
    );
    expect(readFileSync(join(repo, "package.json"), "utf8")).toBe(
      packageJsonBefore,
    );
  });

  it("refreshes the evidence index from recent evidence files", () => {
    const repo = createTinyNodeRepo();
    runPlant({ cwd: repo });
    writeFileSync(
      join(repo, ".greenhouse", "evidence", "2026-05-23-verify.md"),
      [
        "# Verification: docs-patch",
        "",
        "## Summary",
        "",
        "- Change mode: patch",
        "- Changed files: README.md",
        "",
      ].join("\n"),
    );

    runInspect({ cwd: repo });

    const evidenceIndex = readGreenhouseYaml(repo, "grown/evidence-index.yaml");
    expect(evidenceIndex.policy.agent_reading).toContain("Do not bulk-read");
    expect(evidenceIndex.recent).toContainEqual(
      expect.objectContaining({
        path: "evidence/2026-05-23-verify.md",
      }),
    );
  });

  it("refreshes the failure signature index from recent failed evidence", () => {
    const repo = createTinyNodeRepo();
    runPlant({ cwd: repo });
    writeFileSync(
      join(repo, ".greenhouse", "evidence", "2026-05-23-fail.md"),
      [
        "# Verification: app-patch",
        "",
        "## Commands run",
        "",
        "| Command | Result | Notes |",
        "|---|---:|---|",
        "| `pnpm test` | fail | TypeError: localStorage.clear is not a function |",
        "",
      ].join("\n"),
    );

    runInspect({ cwd: repo });

    const failureIndex = readGreenhouseYaml(
      repo,
      "grown/failure-signatures.yaml",
    );
    expect(failureIndex.signatures).toContainEqual(
      expect.objectContaining({
        command: "pnpm test",
        count: 1,
        normalized_failure: "localstorage.clear is not a function",
      }),
    );
  });

  it("works on Declarion-lite, Marwes-lite, and tiny Node fixtures", () => {
    const repos = [
      createDeclarionLiteRepo(),
      createMarwesLiteRepo(),
      createTinyNodeRepo(),
    ];

    for (const repo of repos) {
      expect(runPlant({ cwd: repo }).ok).toBe(true);
      expect(runInspect({ cwd: repo }).ok).toBe(true);
      expect(runDoctor({ cwd: repo }).ok).toBe(true);
      expect(existsSync(join(repo, ".greenhouse", "grown", "repo-map.yaml"))).toBe(
        true,
      );
      expect(existsSync(join(repo, ".greenhouse", "grown", "repo-shape.yaml"))).toBe(
        true,
      );
    }
  });
});

function createDeclarionLiteRepo(): string {
  const repo = createTempRepo("declarion-lite");
  mkdirSync(join(repo, "src", "cli"), { recursive: true });
  mkdirSync(join(repo, "src", "components"), { recursive: true });
  mkdirSync(join(repo, "docs"), { recursive: true });
  mkdirSync(join(repo, "prep-docs"), { recursive: true });
  mkdirSync(join(repo, "data"), { recursive: true });
  mkdirSync(join(repo, "outputs"), { recursive: true });
  mkdirSync(join(repo, "dist"), { recursive: true });
  mkdirSync(join(repo, "dist-cli"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# Declarion Lite\n");
  writeFileSync(join(repo, "AGENTS.md"), "# Instructions\n");
  writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(join(repo, "src", "app.test.ts"), "test('ok', () => {})\n");
  writePackageJson(repo, {
    name: "declarion-lite",
    type: "module",
    engines: {
      node: ">=24 <26",
    },
    bin: {
      declarion: "./dist-cli/cli/main.js",
    },
    scripts: {
      build: "tsc -b && pnpm cli:build && vite build",
      check: "pnpm typecheck && pnpm test",
      "cli:build": "tsc -p tsconfig.cli.json",
      test: "vitest run",
      "test:cli": "pnpm cli:build && node dist-cli/cli/main.js --help",
      typecheck: "tsc -b",
    },
    dependencies: {
      react: "18.3.1",
    },
    devDependencies: {
      typescript: "5.6.3",
      vite: "5.4.10",
      vitest: "2.1.4",
    },
  });
  return repo;
}

function createMarwesLiteRepo(): string {
  const repo = createTempRepo("marwes-lite");
  mkdirSync(join(repo, "packages", "button", "src"), { recursive: true });
  mkdirSync(join(repo, "docs", "registry", "families"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# Marwes Lite\n");
  writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writePackageJson(repo, {
    name: "marwes-lite",
    type: "module",
    scripts: {
      compass: "node scripts/compass.mjs",
      "check:changed": "pnpm compass --changed",
      "check:compass": "pnpm compass",
      "check:repo-map": "node scripts/check-repo-map.mjs",
      "validate:family": "node scripts/validate-family.mjs",
    },
    devDependencies: {
      typescript: "5.6.3",
      vitest: "2.1.4",
    },
  });
  return repo;
}

function createTinyNodeRepo(): string {
  const repo = createTempRepo("tiny-node");
  writeFileSync(join(repo, "package-lock.json"), "{}\n");
  writePackageJson(repo, {
    name: "tiny-node",
    type: "module",
    scripts: {
      test: "node --test",
    },
  });
  return repo;
}

function createTempRepo(name: string): string {
  const repo = mkdtempSync(join(tmpdir(), `greenhouse-spec-${name}-`));
  tempRepos.push(repo);
  return repo;
}

function writePackageJson(repo: string, value: Record<string, unknown>): void {
  writeFileSync(join(repo, "package.json"), JSON.stringify(value, null, 2), "utf8");
}

function updatePackageJson(
  repo: string,
  update: (packageJson: { scripts?: Record<string, string> }) => void,
): void {
  const packageJson = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  update(packageJson);
  writePackageJson(repo, packageJson);
}

function readGreenhouseFile(repo: string, relativePath: string): string {
  return readFileSync(join(repo, ".greenhouse", relativePath), "utf8");
}

function readGreenhouseYaml(repo: string, relativePath: string): any {
  return parseYaml(readGreenhouseFile(repo, relativePath));
}
