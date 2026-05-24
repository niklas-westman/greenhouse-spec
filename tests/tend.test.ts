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
import { execFileSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import { applyProposals } from "../src/proposals/apply-proposals.js";
import { formatTendReport } from "../src/tend/run-tend.js";
import { runInspect } from "../src/inspect/run-inspect.js";
import { runPlant } from "../src/plant/run-plant.js";
import { runTend } from "../src/tend/run-tend.js";

const tempRepos: string[] = [];

afterEach(() => {
  for (const repo of tempRepos.splice(0)) {
    rmSync(repo, { recursive: true, force: true });
  }
});

describe("tend", () => {
  it("returns no-op for trivial changes without durable evidence signal", () => {
    const repo = createRepo();
    initGitRepo(repo);
    writeFileSync(join(repo, "README.md"), "# Updated\n");

    const report = runTend({ cwd: repo });

    expect(report.proposals).toEqual([]);
    expect(report.writtenReportPath).toBeUndefined();
  });

  it("writes a proposal report for evidence that asks for validation learning", () => {
    const repo = createRepo();
    writeFileSync(
      join(repo, ".greenhouse", "evidence", "2026-05-22-verify.md"),
      [
        "# Verification",
        "",
        "## Commands run",
        "",
        "| Command | Result | Notes |",
        "|---|---:|---|",
        "| `pnpm test` | fail | missing routed test |",
        "",
        "## Durable learnings",
        "",
        "- [x] propose validation update",
        "",
      ].join("\n"),
    );

    const report = runTend({ cwd: repo });

    expect(report.proposals).toContainEqual(
      expect.objectContaining({
        kind: "validation",
      }),
    );
    expect(report.writtenReportPath).toBeDefined();
    expect(existsSync(report.writtenReportPath ?? "")).toBe(true);
  });

  it("proposes a specific docs routing update for fallback failure on docs-only changes", () => {
    const repo = createRepo();
    initGitRepo(repo);
    writeFileSync(join(repo, "README.md"), "# Updated\n");
    writeFileSync(
      join(repo, ".greenhouse", "evidence", "2026-05-23-docs.md"),
      [
        "# Verification",
        "",
        "## Commands run",
        "",
        "| Command | Result | Notes |",
        "|---|---:|---|",
        "| `pnpm test` | fail | Fallback default required validation. |",
        "",
      ].join("\n"),
    );

    const report = runTend({ cwd: repo });

    expect(report.proposals).toContainEqual(
      expect.objectContaining({
        kind: "validation",
        message:
          "Fallback validation failed on a docs-only patch; propose a README/docs path rule that runs lightweight docs validation only.",
      }),
    );
  });

  it("proposes a specific CLI routing update for fallback failure on CLI-only changes", () => {
    const repo = createRepo();
    mkdirSync(join(repo, "src", "cli"), { recursive: true });
    writeFileSync(join(repo, "src", "cli", "main.ts"), "export {}\n");
    initGitRepo(repo);
    writeFileSync(join(repo, "src", "cli", "main.ts"), "export const help = true;\n");
    writeFileSync(
      join(repo, ".greenhouse", "evidence", "2026-05-23-cli.md"),
      [
        "# Verification",
        "",
        "## Commands run",
        "",
        "| Command | Result | Notes |",
        "|---|---:|---|",
        "| `pnpm test` | fail | Fallback default required validation. |",
        "",
      ].join("\n"),
    );

    const report = runTend({ cwd: repo });

    expect(report.proposals).toContainEqual(
      expect.objectContaining({
        kind: "validation",
        message:
          "Fallback validation failed on a CLI-only patch; propose a src/cli path rule using cli:build, test:cli, and typecheck.",
      }),
    );
  });

  it("does not mutate authored roots while creating a tend report", () => {
    const repo = createRepo();
    const rulesPath = join(repo, ".greenhouse", "roots", "rules.md");
    const rulesBefore = readFileSync(rulesPath, "utf8");
    mkdirSync(join(repo, "src", "engine", "tax"), { recursive: true });
    writeFileSync(join(repo, "src", "engine", "tax", "index.ts"), "export {}\n");
    initGitRepo(repo);
    writeFileSync(join(repo, "src", "engine", "tax", "index.ts"), "export const x = 1;\n");

    const report = runTend({ cwd: repo });

    expect(report.proposals).toContainEqual(
      expect.objectContaining({
        kind: "protected-boundary",
      }),
    );
    expect(readFileSync(rulesPath, "utf8")).toBe(rulesBefore);
  });

  it("check passes when no structured proposals exist", () => {
    const repo = createRepo();
    runInspect({ cwd: repo });
    applyProposals({ cwd: repo, safe: true });

    const report = runTend({ cwd: repo, check: true });

    expect(report.ok).toBe(true);
    expect(report.selfTending?.blocking).toEqual([]);
    expect(report.writtenReportPath).toBeUndefined();
  });

  it("check fails on pending package script proposals", () => {
    const repo = createRepo();

    const report = runTend({ cwd: repo, check: true });

    expect(report.ok).toBe(false);
    expect(report.selfTending?.blocking).toContainEqual(
      expect.objectContaining({
        id: "package-script:check:tend",
        status: "pending",
      }),
    );
  });

  it("check fails on pending validation seed proposals", () => {
    const repo = createMilibryLikeRepo();
    runPlant({ cwd: repo });

    const report = runTend({ cwd: repo, check: true });

    expect(report.ok).toBe(false);
    expect(report.selfTending?.blocking).toContainEqual(
      expect.objectContaining({
        id: "validation-route:src-db",
        status: "pending",
      }),
    );
  });

  it("check fails on adoptable and conflict proposals", () => {
    const adoptableRepo = createMilibryLikeRepo();
    runPlant({ cwd: adoptableRepo });
    writeValidationPaths(adoptableRepo, {
      "src/db/**": milibryDbRule(),
    });

    const conflictRepo = createMilibryLikeRepo();
    runPlant({ cwd: conflictRepo });
    writeValidationPaths(conflictRepo, {
      "src/db/**": {
        mode: "patch",
        required: [{ id: "custom", command: "pnpm custom" }],
      },
    });

    const adoptableReport = runTend({ cwd: adoptableRepo, check: true });
    const conflictReport = runTend({ cwd: conflictRepo, check: true });

    expect(adoptableReport.ok).toBe(false);
    expect(adoptableReport.selfTending?.blocking).toContainEqual(
      expect.objectContaining({
        id: "validation-route:src-db",
        status: "adoptable",
      }),
    );
    expect(conflictReport.ok).toBe(false);
    expect(conflictReport.selfTending?.blocking).toContainEqual(
      expect.objectContaining({
        id: "validation-route:src-db",
        status: "conflict",
      }),
    );
  });

  it("check does not write generated files or tend reports", () => {
    const repo = createRepo();
    const proposalsPath = join(repo, ".greenhouse", "grown", "validation-proposals.yaml");
    const proposalsBefore = readFileSync(proposalsPath, "utf8");

    runTend({ cwd: repo, check: true });

    expect(readFileSync(proposalsPath, "utf8")).toBe(proposalsBefore);
    expect(existsSync(join(repo, ".greenhouse", "reports", "tend"))).toBe(false);
  });

  it("check report prints resolution commands for structural drift", () => {
    const repo = createRepo();

    const output = formatTendReport(runTend({ cwd: repo, check: true }));

    expect(output).toContain("greenhouse-spec inspect");
    expect(output).toContain("greenhouse-spec apply-proposals --safe --dry-run");
    expect(output).toContain("greenhouse-spec adopt-proposals --id <proposal-id>");
  });
});

function createRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "greenhouse-spec-tend-"));
  tempRepos.push(repo);
  writeFileSync(join(repo, "README.md"), "# Tend fixture\n");
  writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify(
      {
        name: "tend-fixture",
        scripts: {
          test: "node -e \"process.exit(0)\"",
          typecheck: "node -e \"process.exit(0)\"",
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  runPlant({ cwd: repo });
  return repo;
}

function createMilibryLikeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "greenhouse-spec-tend-milibry-"));
  tempRepos.push(repo);
  mkdirSync(join(repo, "scripts"), { recursive: true });
  mkdirSync(join(repo, "src", "db"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# Milibry fixture\n");
  writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(join(repo, "scripts", "generate-db.mjs"), "export {}\n");
  writeFileSync(join(repo, "scripts", "ingest.mjs"), "export {}\n");
  writeFileSync(join(repo, "scripts", "query.mjs"), "export {}\n");
  writeFileSync(join(repo, "scripts", "query.test.mjs"), "export {}\n");
  writeFileSync(join(repo, "src", "db", "database.ts"), "export {}\n");
  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify(
      {
        name: "milibry",
        scripts: {
          build: "pnpm generate && tsc -b && vite build",
          test: "vitest run",
          generate: "node ./scripts/generate-db.mjs",
          "query:test": "node --test ./scripts/query.test.mjs",
        },
        dependencies: {
          "better-sqlite3": "11.0.0",
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

function writeValidationPaths(repo: string, paths: Record<string, unknown>): void {
  writeFileSync(
    join(repo, ".greenhouse", "roots", "validation.yaml"),
    `${JSON.stringify({ schema_version: 1, paths }, null, 2)}\n`,
    "utf8",
  );
}

function milibryDbRule(): Record<string, unknown> {
  return {
    mode: "guarded",
    required: [
      { id: "generate", command: "pnpm generate" },
      { id: "test", command: "pnpm test" },
    ],
    recommended: [],
    manual: [],
  };
}

function initGitRepo(repo: string): void {
  execFileSync("git", ["init"], { cwd: repo });
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync(
    "git",
    ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "init"],
    { cwd: repo },
  );
}
