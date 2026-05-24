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

import { parse as parseYaml } from "yaml";
import { afterEach, describe, expect, it } from "vitest";

import { runInit } from "../src/lifecycle/run-init.js";
import { runUpdate } from "../src/lifecycle/run-update.js";
import { formatStatusReport, runStatus } from "../src/status/run-status.js";
import { runPlant } from "../src/plant/run-plant.js";

const tempRepos: string[] = [];

afterEach(() => {
  for (const repo of tempRepos.splice(0)) {
    rmSync(repo, { recursive: true, force: true });
  }
});

describe("lifecycle commands", () => {
  it("init dry-run reports planned install without writing .greenhouse", () => {
    const repo = createRepo();

    const report = runInit({ cwd: repo, dryRun: true });

    expect(report.ok).toBe(true);
    expect(report.plant.writes.every((write) => write.status === "dry-run")).toBe(true);
    expect(existsSync(join(repo, ".greenhouse"))).toBe(false);
  });

  it("update dry-run reports managed changes without mutating installed files", () => {
    const repo = createRepo();
    runPlant({ cwd: repo });
    const scriptPath = join(repo, ".greenhouse", "scripts", "check-greenhouse.mjs");
    const before = readFileSync(scriptPath, "utf8");

    const report = runUpdate({ cwd: repo, dryRun: true });

    expect(report.ok).toBe(true);
    expect(report.writes.some((write) => write.status === "dry-run")).toBe(true);
    expect(readFileSync(scriptPath, "utf8")).toBe(before);
  });

  it("update refreshes managed helper files and project metadata", () => {
    const repo = createRepo();
    runPlant({ cwd: repo });
    const scriptPath = join(repo, ".greenhouse", "scripts", "check-greenhouse.mjs");
    writeFileSync(scriptPath, "// stale\n", "utf8");

    const report = runUpdate({ cwd: repo });
    const project = parseYaml(
      readFileSync(join(repo, ".greenhouse", "project.yaml"), "utf8"),
    ) as any;

    expect(report.ok).toBe(true);
    expect(readFileSync(scriptPath, "utf8")).not.toBe("// stale\n");
    expect(project.greenhouse.installed_version).toBe("0.1.0");
    expect(project.greenhouse.template_version).toBe(1);
    expect(project.greenhouse.install_mode).toBe("local-checkout");
    expect(project.greenhouse.cli_command).toContain("greenhouse-spec/dist/cli.js");
  });

  it("status is read-only", () => {
    const repo = createRepo();
    runPlant({ cwd: repo });
    initGitRepo(repo);
    const proposalsPath = join(repo, ".greenhouse", "grown", "validation-proposals.yaml");
    const before = readFileSync(proposalsPath, "utf8");

    const report = runStatus({ cwd: repo });

    expect(report.ok).toBe(false);
    expect(readFileSync(proposalsPath, "utf8")).toBe(before);
    expect(existsSync(join(repo, ".greenhouse", "reports", "tend"))).toBe(false);
  });

  it("status reports repeated generated failure observations", () => {
    const repo = createRepo();
    runPlant({ cwd: repo });
    initGitRepo(repo);
    writeFileSync(
      join(repo, ".greenhouse", "grown", "failure-signatures.yaml"),
      [
        "schema_version: 1",
        "managed_by: greenhouse-spec",
        "generated_at: 2026-05-24T00:00:00.000Z",
        "policy:",
        "  effect: Generated observations only. Matching failures must still fail validation.",
        "signatures:",
        "  - id: failure:abc123",
        "    command: pnpm test",
        "    normalized_failure: 'localstorage.clear is not a function'",
        "    count: 2",
        "    first_seen_at: 2026-05-23T00:00:00.000Z",
        "    last_seen_at: 2026-05-24T00:00:00.000Z",
        "    evidence_paths:",
        "      - evidence/first.md",
        "      - evidence/second.md",
        "",
      ].join("\n"),
      "utf8",
    );

    const report = runStatus({ cwd: repo });

    expect(report.repeatedFailures).toContainEqual(
      expect.objectContaining({
        command: "pnpm test",
        count: 2,
      }),
    );
    expect(formatStatusReport(report)).toContain("## Repeated Failures");
  });
});

function createRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "greenhouse-spec-lifecycle-"));
  tempRepos.push(repo);
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# Lifecycle fixture\n");
  writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify(
      {
        name: "lifecycle-fixture",
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
  return repo;
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
