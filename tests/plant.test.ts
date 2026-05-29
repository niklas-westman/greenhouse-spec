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
import { runPlant } from "../src/plant/run-plant.js";

const tempRepos: string[] = [];

afterEach(() => {
  for (const repo of tempRepos.splice(0)) {
    rmSync(repo, { recursive: true, force: true });
  }
});

describe("plant", () => {
  it("shows planned files in dry-run without writing .greenhouse", () => {
    const repo = createDeclarionLiteRepo();

    const report = runPlant({ cwd: repo, dryRun: true });

    expect(report.ok).toBe(true);
    expect(report.writes.every((write) => write.status === "dry-run")).toBe(true);
    expect(report.writes.map((write) => write.relativePath)).toContain(
      ".greenhouse/project.yaml",
    );
    expect(existsSync(join(repo, ".greenhouse"))).toBe(false);
  });

  it("creates a doctor-valid greenhouse tree", () => {
    const repo = createDeclarionLiteRepo();

    const plantReport = runPlant({ cwd: repo });
    const doctorReport = runDoctor({ cwd: repo });
    const packageJson = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(plantReport.ok).toBe(true);
    expect(doctorReport.ok).toBe(true);
    expect(packageJson.scripts["greenhouse:tend"]).toBe("greenhouse-spec tend");
    expect(packageJson.scripts.prepush).toBe("pnpm greenhouse:tend");
    expect(existsSync(join(repo, ".greenhouse", "evidence"))).toBe(true);
    expect(
      existsSync(join(repo, ".greenhouse", "grown", "evidence-index.yaml")),
    ).toBe(true);
    expect(existsSync(join(repo, ".greenhouse", "reports", "doctor"))).toBe(true);
  });

  it("adds a managed Greenhouse validation block to existing agent instructions", () => {
    const repo = createDeclarionLiteRepo();

    const report = runPlant({ cwd: repo });
    const agents = readFileSync(join(repo, "AGENTS.md"), "utf8");

    expect(report.ok).toBe(true);
    expect(report.writes).toContainEqual(
      expect.objectContaining({
        relativePath: "AGENTS.md",
        status: "updated",
      }),
    );
    expect(agents).toContain("# Instructions");
    expect(agents).toContain("<!-- greenhouse-spec:start -->");
    expect(agents).toContain("greenhouse-spec tend");
    expect(agents).toContain("<!-- greenhouse-spec:end -->");
  });

  it("creates AGENTS.md with Greenhouse guidance when no agent instructions exist", () => {
    const repo = createDeclarionLiteRepo();
    rmSync(join(repo, "AGENTS.md"));

    const report = runPlant({ cwd: repo });
    const agents = readFileSync(join(repo, "AGENTS.md"), "utf8");
    const agentIndex = readGreenhouseYaml(repo, "grown/agent-index.yaml");

    expect(report.ok).toBe(true);
    expect(report.writes).toContainEqual(
      expect.objectContaining({
        relativePath: "AGENTS.md",
        status: "created",
      }),
    );
    expect(agents).toContain("# Agent Instructions");
    expect(agents).toContain("Greenhouse Validation");
    expect(agentIndex.agent_files).toContainEqual({
      path: "AGENTS.md",
      present: true,
    });
  });

  it("updates detected Copilot instruction files with Greenhouse guidance", () => {
    const repo = createDeclarionLiteRepo();
    mkdirSync(join(repo, ".github"), { recursive: true });
    writeFileSync(
      join(repo, ".github", "copilot-instructions.md"),
      "# Copilot Instructions\n",
      "utf8",
    );

    const report = runPlant({ cwd: repo });

    expect(report.ok).toBe(true);
    expect(report.writes).toContainEqual(
      expect.objectContaining({
        relativePath: ".github/copilot-instructions.md",
        status: "updated",
      }),
    );
    expect(
      readFileSync(join(repo, ".github", "copilot-instructions.md"), "utf8"),
    ).toContain("greenhouse-spec tend");
  });

  it("writes discovered project, command, and repo map data", () => {
    const repo = createDeclarionLiteRepo();

    runPlant({ cwd: repo });

    const project = readGreenhouseYaml(repo, "project.yaml");
    const commandIndex = readGreenhouseYaml(repo, "grown/command-index.yaml");
    const repoMap = readGreenhouseYaml(repo, "grown/repo-map.yaml");
    const repoShape = readGreenhouseYaml(repo, "grown/repo-shape.yaml");

    expect(project.repo.name).toBe("declarion-lite");
    expect(project.repo.type).toEqual(["app", "cli"]);
    expect(project.stack.package_manager).toBe("pnpm");
    expect(project.stack.frameworks).toEqual(["react", "vite"]);
    expect(commandIndex.commands.map((command: { id: string }) => command.id)).toEqual(
      expect.arrayContaining([
        "build",
        "check",
        "cli:build",
        "test",
        "test:cli",
        "typecheck",
        "greenhouse:tend",
        "greenhouse:tend:check",
        "greenhouse:proposals",
        "prepush",
      ]),
    );
    expect(repoMap.docs.map((entry: { path: string }) => entry.path)).toEqual([
      "README.md",
      "docs/",
      "prep-docs/",
    ]);
    expect(repoMap.generated.map((entry: { path: string }) => entry.path)).toEqual([
      "data/",
      "dist/",
      "dist-cli/",
      "outputs/",
    ]);
    expect(repoShape.shape).toContain("single-package");
    expect(repoShape.shape).toContain("frontend-react");
    expect(repoShape.packages).toContainEqual(
      expect.objectContaining({
        path: ".",
        kind: expect.arrayContaining(["frontend", "cli"]),
      }),
    );
  });

  it("does not overwrite authored greenhouse files unless forced", () => {
    const repo = createDeclarionLiteRepo();
    mkdirSync(join(repo, ".greenhouse", "roots"), { recursive: true });
    mkdirSync(join(repo, ".greenhouse", "context"), { recursive: true });
    writeFileSync(
      join(repo, ".greenhouse", "roots", "rules.md"),
      "# Custom Rules\n",
      "utf8",
    );
    writeFileSync(
      join(repo, ".greenhouse", "project.yaml"),
      "schema_version: 1\ncustom: true\n",
      "utf8",
    );
    writeFileSync(
      join(repo, ".greenhouse", "context", "manifest.yaml"),
      "schema_version: 1\ncontext: []\n",
      "utf8",
    );

    const report = runPlant({ cwd: repo });

    expect(report.ok).toBe(false);
    expect(report.writes).toContainEqual(
      expect.objectContaining({
        relativePath: ".greenhouse/roots/rules.md",
        status: "blocked",
      }),
    );
    expect(report.writes).toContainEqual(
      expect.objectContaining({
        relativePath: ".greenhouse/project.yaml",
        status: "blocked",
      }),
    );
    expect(report.writes).toContainEqual(
      expect.objectContaining({
        relativePath: ".greenhouse/context/manifest.yaml",
        status: "blocked",
      }),
    );
    expect(readFileSync(join(repo, ".greenhouse", "roots", "rules.md"), "utf8")).toBe(
      "# Custom Rules\n",
    );
  });

  it("overwrites authored roots when force-authored is passed", () => {
    const repo = createDeclarionLiteRepo();
    mkdirSync(join(repo, ".greenhouse", "roots"), { recursive: true });
    writeFileSync(
      join(repo, ".greenhouse", "roots", "rules.md"),
      "# Custom Rules\n",
      "utf8",
    );

    const report = runPlant({ cwd: repo, forceAuthored: true });

    expect(report.ok).toBe(true);
    expect(readFileSync(join(repo, ".greenhouse", "roots", "rules.md"), "utf8")).toContain(
      "# Greenhouse Rules",
    );
  });
});

function createDeclarionLiteRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "greenhouse-spec-plant-"));
  tempRepos.push(repo);

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
  writeFileSync(join(repo, "tsconfig.json"), "{}\n");
  writeFileSync(join(repo, "src", "app.test.ts"), "test('ok', () => {})\n");
  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify(
      {
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
      },
      null,
      2,
    ),
    "utf8",
  );

  return repo;
}

function readGreenhouseYaml(repo: string, relativePath: string): any {
  return parseYaml(readFileSync(join(repo, ".greenhouse", relativePath), "utf8"));
}
