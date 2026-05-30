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

import { createProgram } from "../src/cli.js";
import { writeEvidence } from "../src/evidence/write-evidence.js";
import { formatInitReport, runInit } from "../src/lifecycle/run-init.js";
import { runUpdate } from "../src/lifecycle/run-update.js";
import { greenhouseCommandForRepo } from "../src/native-scripts/package-script-proposals.js";
import {
  formatStatusJsonReport,
  formatStatusReport,
  formatStatusVerboseReport,
  runStatus,
} from "../src/status/run-status.js";
import { runPlant } from "../src/plant/run-plant.js";
import { GREENHOUSE_SPEC_VERSION } from "../src/version.js";

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

  it("init output explains first-install tailoring steps", () => {
    const repo = createRepo();

    const output = formatInitReport(runInit({ cwd: repo, dryRun: true }));

    expect(output).toContain("## First Install Workflow");
    expect(output).toContain("greenhouse-spec apply-proposals --safe --dry-run");
    expect(output).toContain("## Repo Tailoring Checklist");
    expect(output).toContain(".greenhouse/roots/validation.yaml");
    expect(output).toContain(".greenhouse/roots/docs.yaml");
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
    expect(project.greenhouse.installed_version).toBe(GREENHOUSE_SPEC_VERSION);
    expect(project.greenhouse.template_version).toBe(1);
    expect(project.greenhouse.install_mode).toBe("npm-package");
    expect(project.greenhouse.cli_command).toBe("greenhouse-spec");
  });

  it("update migrates local-checkout package scripts to portable package wiring", () => {
    const repo = createRepo();
    runPlant({ cwd: repo });
    writePackageJson(repo, {
      test: "node -e \"process.exit(0)\"",
      typecheck: "node -e \"process.exit(0)\"",
      greenhouse: "node ../greenhouse/code/greenhouse-spec/dist/cli.js",
      "greenhouse:tend": "node ../greenhouse/code/greenhouse-spec/dist/cli.js tend",
    });

    const report = runUpdate({ cwd: repo });
    const project = parseYaml(
      readFileSync(join(repo, ".greenhouse", "project.yaml"), "utf8"),
    ) as any;
    const packageJson = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as any;

    expect(report.ok).toBe(true);
    expect(project.greenhouse.install_mode).toBe("npm-package");
    expect(project.greenhouse.cli_command).toBe("greenhouse-spec");
    expect(packageJson.scripts.greenhouse).toBe("greenhouse-spec");
    expect(packageJson.scripts["greenhouse:tend"]).toBe("greenhouse-spec tend");
    expect(packageJson.devDependencies["greenhouse-spec"]).toBe(
      `^${GREENHOUSE_SPEC_VERSION}`,
    );
  });

  it("update adds missing installed purpose docs without overwriting authored roots", () => {
    const repo = createRepo();
    runPlant({ cwd: repo });
    rmSync(join(repo, ".greenhouse", "why-greenhouse-spec"), {
      recursive: true,
      force: true,
    });

    const report = runUpdate({ cwd: repo });

    expect(report.ok).toBe(true);
    expect(report.writes).toContainEqual(
      expect.objectContaining({
        relativePath: ".greenhouse/why-greenhouse-spec/README.md",
        status: "created",
      }),
    );
    expect(
      existsSync(join(repo, ".greenhouse", "why-greenhouse-spec", "tree-structure.md")),
    ).toBe(true);
  });

  it("status is read-only", () => {
    const repo = createRepo();
    runPlant({ cwd: repo });
    writePackageJson(repo, {
      test: "node -e \"process.exit(0)\"",
      typecheck: "node -e \"process.exit(0)\"",
      "greenhouse:tend": "node ./custom-tend.js",
    });
    initGitRepo(repo);
    const proposalsPath = join(repo, ".greenhouse", "grown", "validation-proposals.yaml");
    const before = readFileSync(proposalsPath, "utf8");

    const report = runStatus({ cwd: repo });

    expect(report.ok).toBe(false);
    expect(report.overallStatus).toBe("fail");
    expect(readFileSync(proposalsPath, "utf8")).toBe(before);
    expect(existsSync(join(repo, ".greenhouse", "reports", "tend"))).toBe(false);
  });

  it("status passes for a healthy clean repo", () => {
    const repo = createHealthyRepo();

    const report = runStatus({ cwd: repo });
    const output = formatStatusReport(report);

    expect(report.ok).toBe(true);
    expect(report.overallStatus).toBe("pass");
    expect(report.health.map((category) => category.state)).toEqual([
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
    ]);
    expect(output).toContain("Greenhouse Status");
    expect(output).toContain("State: pass");
    expect(output).toContain("Changed: 0 file(s), 0 routed");
    expect(output).toContain("Generated-only dirty: no");
    expect(output).toContain("Next: no action needed");
    expect(output).not.toContain("## Health Summary");
  });

  it("status verbose report preserves detailed sections", () => {
    const repo = createHealthyRepo();

    const output = formatStatusVerboseReport(runStatus({ cwd: repo }));

    expect(output).toContain("Status: pass");
    expect(output).toContain("## Health Summary");
    expect(output).toContain("## Install Health");
    expect(output).toContain("## Self-tending");
    expect(output).toContain("## Changed Validation");
    expect(output).toContain("## Impact Warnings");
    expect(output).toContain("## Repeated Failures");
  });

  it("status degrades when changed-file validation is pending", () => {
    const repo = createHealthyRepo();
    writeFileSync(join(repo, "README.md"), "# Lifecycle fixture\n\nChanged.\n", "utf8");

    const report = runStatus({ cwd: repo });

    expect(report.ok).toBe(true);
    expect(report.overallStatus).toBe("degraded");
    expect(report.health).toContainEqual(
      expect.objectContaining({
        id: "changed-validation",
        state: "degraded",
        nextCommand: "greenhouse-spec tend",
      }),
    );
    expect(formatStatusReport(report)).toContain("State: degraded");
    expect(formatStatusReport(report)).toContain("Next: greenhouse-spec tend");
  });

  it("status reports impact warnings for package script changes", () => {
    const repo = createHealthyRepo();
    writePackageJson(repo, {
      test: "node -e \"process.exit(0)\"",
      typecheck: "node -e \"process.exit(0)\"",
      greenhouse: greenhouseCommandForRepo(repo, "status"),
      "greenhouse:tend": greenhouseCommandForRepo(repo, "tend"),
      "greenhouse:tend:check": greenhouseCommandForRepo(repo, "tend --check"),
      "greenhouse:verify:dry": greenhouseCommandForRepo(
        repo,
        "verify --changed --dry-run",
      ),
      "greenhouse:proposals": greenhouseCommandForRepo(repo, "proposals"),
      prepush: "pnpm greenhouse:tend",
      "new-script": "node -e \"process.exit(0)\"",
    });

    const report = runStatus({ cwd: repo });
    const json = JSON.parse(formatStatusJsonReport(report));

    expect(report.verify.impactWarnings).toContainEqual(
      expect.objectContaining({
        id: "impact.package-scripts-docs",
        severity: "warning",
      }),
    );
    expect(formatStatusReport(report)).toContain("Impact: 1 warning");
    expect(formatStatusVerboseReport(report)).toContain("## Impact Warnings");
    expect(json.impactWarnings).toContainEqual(
      expect.objectContaining({
        id: "impact.package-scripts-docs",
      }),
    );
  });

  it("status fails when selected validation references a missing package script", () => {
    const repo = createHealthyRepo();
    writePackageJson(repo, {
      typecheck: "node -e \"process.exit(0)\"",
      greenhouse: greenhouseCommandForRepo(repo, "status"),
      "greenhouse:tend": greenhouseCommandForRepo(repo, "tend"),
      "greenhouse:tend:check": greenhouseCommandForRepo(repo, "tend --check"),
      "greenhouse:verify:dry": greenhouseCommandForRepo(
        repo,
        "verify --changed --dry-run",
      ),
      "greenhouse:proposals": greenhouseCommandForRepo(repo, "proposals"),
      prepush: "pnpm greenhouse:tend",
    });
    writeFileSync(join(repo, "src", "app.ts"), "export const app = 1;\n", "utf8");

    const report = runStatus({ cwd: repo });
    const output = formatStatusReport(report);
    const verbose = formatStatusVerboseReport(report);

    expect(report.ok).toBe(false);
    expect(report.overallStatus).toBe("fail");
    expect(report.health).toContainEqual(
      expect.objectContaining({
        id: "impact",
        state: "fail",
        nextCommand: "review blocking impact warnings before finishing work",
      }),
    );
    expect(report.verify.impactWarnings).toContainEqual(
      expect.objectContaining({
        id: "impact.missing-package-script.test",
        severity: "blocking",
      }),
    );
    expect(output).toContain("State: fail");
    expect(output).toContain("Impact: 1 warning, 1 blocking");
    expect(verbose).toContain("Add package script \"test\" to package.json");
  });

  it("status passes when latest evidence covers the current changed route", () => {
    const repo = createHealthyRepo();
    writeFileSync(join(repo, "README.md"), "# Lifecycle fixture\n\nChanged.\n", "utf8");
    const pending = runStatus({ cwd: repo });
    writePassingEvidence(repo, pending.verify.route);

    const report = runStatus({ cwd: repo });
    const output = formatStatusReport(report);

    expect(report.ok).toBe(true);
    expect(report.overallStatus).toBe("pass");
    expect(report.evidenceCoverage).toMatchObject({
      covered: true,
      status: "pass",
    });
    expect(report.health).toContainEqual(
      expect.objectContaining({
        id: "changed-validation",
        state: "pass",
        summary: "latest passing evidence covers current route.",
      }),
    );
    expect(output).toContain("Validation: covered by latest passing evidence.");
  });

  it("status degrades when latest matching evidence failed", () => {
    const repo = createHealthyRepo();
    writeFileSync(join(repo, "README.md"), "# Lifecycle fixture\n\nChanged.\n", "utf8");
    const pending = runStatus({ cwd: repo });
    writeEvidence({
      cwd: repo,
      route: pending.verify.route,
      commandResults: pending.verify.route.commands.map((command) => ({
        command: command.command,
        result: "fail" as const,
        exitCode: 1,
        output: "TypeError: validation failed",
      })),
      noPrune: true,
    });

    const report = runStatus({ cwd: repo });

    expect(report.overallStatus).toBe("degraded");
    expect(report.evidenceCoverage).toMatchObject({
      covered: false,
      status: "fail",
      reason: "latest matching evidence did not pass.",
    });
  });

  it("status degrades when latest evidence does not match the current route", () => {
    const repo = createHealthyRepo();
    writeFileSync(join(repo, "README.md"), "# Lifecycle fixture\n\nChanged.\n", "utf8");
    const pending = runStatus({ cwd: repo });
    writeEvidence({
      cwd: repo,
      route: {
        ...pending.verify.route,
        changedFiles: ["package.json"],
      },
      commandResults: pending.verify.route.commands.map((command) => ({
        command: command.command,
        result: "pass" as const,
        exitCode: 0,
        output: "ok",
      })),
      noPrune: true,
    });

    const report = runStatus({ cwd: repo });

    expect(report.overallStatus).toBe("degraded");
    expect(report.evidenceCoverage).toMatchObject({
      covered: false,
      reason: "latest evidence does not match current routed files and commands.",
    });
  });

  it("status identifies generated-only dirty trees without routing validation", () => {
    const repo = createHealthyRepo();
    writeFileSync(
      join(repo, ".greenhouse", "evidence", "generated-only.md"),
      "# Generated evidence\n",
      "utf8",
    );

    const report = runStatus({ cwd: repo });
    const output = formatStatusReport(report);

    expect(report.generatedOnlyDirty).toBe(true);
    expect(report.verify.route.commands).toHaveLength(0);
    expect(output).toContain("Generated-only dirty: yes");
  });

  it("status reports repeated generated failure observations", () => {
    const repo = createHealthyRepo();
    writeRepeatedFailureSignature(repo);

    const report = runStatus({ cwd: repo });

    expect(report.ok).toBe(true);
    expect(report.overallStatus).toBe("degraded");
    expect(report.repeatedFailures).toContainEqual(
      expect.objectContaining({
        command: "pnpm test",
        count: 2,
      }),
    );
    expect(formatStatusReport(report)).toContain("State: degraded");
    expect(formatStatusVerboseReport(report)).toContain("## Repeated Failures");
  });

  it("status treats repeated failures as resolved after newer passing evidence", () => {
    const repo = createHealthyRepo();
    writeRepeatedFailureSignature(repo);
    writeResolvedEvidenceIndex(repo);

    const report = runStatus({ cwd: repo });

    expect(report.ok).toBe(true);
    expect(report.overallStatus).toBe("pass");
    expect(report.repeatedFailures).toEqual([]);
    expect(formatStatusReport(report)).toContain("Repeated failures: none.");
  });

  it("status fails when doctor finds a blocking install issue", () => {
    const repo = createHealthyRepo();
    rmSync(join(repo, ".greenhouse", "grown", "repo-map.yaml"));

    const report = runStatus({ cwd: repo });

    expect(report.ok).toBe(false);
    expect(report.overallStatus).toBe("fail");
    expect(report.health).toContainEqual(
      expect.objectContaining({
        id: "install",
        state: "fail",
        nextCommand: "greenhouse-spec doctor",
      }),
    );
  });

  it("status fails when self-tending finds structural drift", () => {
    const repo = createRepo();
    runPlant({ cwd: repo });
    writePackageJson(repo, {
      test: "node -e \"process.exit(0)\"",
      typecheck: "node -e \"process.exit(0)\"",
      "greenhouse:tend": "node ./custom-tend.js",
    });
    initGitRepo(repo);

    const report = runStatus({ cwd: repo });

    expect(report.ok).toBe(false);
    expect(report.overallStatus).toBe("fail");
    expect(report.health).toContainEqual(
      expect.objectContaining({
        id: "self-tending",
        state: "fail",
        nextCommand: "greenhouse-spec inspect && greenhouse-spec proposals",
      }),
    );
  });

  it("status CLI exits successfully for degraded health", async () => {
    const repo = createHealthyRepo();
    writeRepeatedFailureSignature(repo);
    const originalLog = console.log;
    const originalExitCode = process.exitCode;
    const output: string[] = [];
    console.log = (message?: unknown) => {
      output.push(String(message));
    };
    process.exitCode = undefined;

    try {
      await createProgram().parseAsync(
        ["node", "greenhouse-spec", "status", "--cwd", repo],
        { from: "node" },
      );
      expect(process.exitCode).toBeUndefined();
      expect(output.join("\n")).toContain("State: degraded");
    } finally {
      console.log = originalLog;
      process.exitCode = originalExitCode;
    }
  });

  it("status CLI prints machine-readable JSON", async () => {
    const repo = createHealthyRepo();
    writeRepeatedFailureSignature(repo);
    const originalLog = console.log;
    const originalExitCode = process.exitCode;
    const output: string[] = [];
    console.log = (message?: unknown) => {
      output.push(String(message));
    };
    process.exitCode = undefined;

    try {
      await createProgram().parseAsync(
        ["node", "greenhouse-spec", "status", "--cwd", repo, "--json"],
        { from: "node" },
      );
      const parsed = JSON.parse(output.join("\n"));
      expect(process.exitCode).toBeUndefined();
      expect(parsed).toMatchObject({
        schema_version: 1,
        ok: true,
        overallStatus: "degraded",
        generatedOnlyDirty: true,
        nextCommand: "review repeated failures before assuming validation baseline is healthy",
        nextAction: {
          kind: "review",
          command: null,
        },
      });
      expect(parsed.health).toContainEqual(
        expect.objectContaining({
          id: "repeated-failures",
          state: "degraded",
        }),
      );
    } finally {
      console.log = originalLog;
      process.exitCode = originalExitCode;
    }
  });

  it("status CLI prints verbose Markdown when requested", async () => {
    const repo = createHealthyRepo();
    const originalLog = console.log;
    const originalExitCode = process.exitCode;
    const output: string[] = [];
    console.log = (message?: unknown) => {
      output.push(String(message));
    };
    process.exitCode = undefined;

    try {
      await createProgram().parseAsync(
        ["node", "greenhouse-spec", "status", "--cwd", repo, "--verbose"],
        { from: "node" },
      );
      expect(process.exitCode).toBeUndefined();
      expect(output.join("\n")).toContain("# Greenhouse Status Report");
      expect(output.join("\n")).toContain("## Health Summary");
    } finally {
      console.log = originalLog;
      process.exitCode = originalExitCode;
    }
  });

  it("status JSON formatter exposes routed files and generated-only dirty state", () => {
    const repo = createHealthyRepo();
    writeFileSync(
      join(repo, ".greenhouse", "evidence", "generated-only.md"),
      "# Generated evidence\n",
      "utf8",
    );

    const parsed = JSON.parse(formatStatusJsonReport(runStatus({ cwd: repo })));

    expect(parsed.generatedOnlyDirty).toBe(true);
    expect(parsed.changedValidation.routedFiles).toEqual([]);
    expect(parsed.changedValidation.evidenceCoverage).toMatchObject({
      covered: true,
      reason: "no routed files require evidence.",
    });
    expect(parsed.changedValidation.groups["greenhouse-generated"]).toEqual([
      ".greenhouse/evidence/",
    ]);
  });

  it("status CLI exits non-zero for failed health", async () => {
    const repo = createRepo();
    runPlant({ cwd: repo });
    writePackageJson(repo, {
      test: "node -e \"process.exit(0)\"",
      typecheck: "node -e \"process.exit(0)\"",
      "greenhouse:tend": "node ./custom-tend.js",
    });
    initGitRepo(repo);
    const originalLog = console.log;
    const originalExitCode = process.exitCode;
    console.log = () => {};
    process.exitCode = undefined;

    try {
      await createProgram().parseAsync(
        ["node", "greenhouse-spec", "status", "--cwd", repo],
        { from: "node" },
      );
      expect(process.exitCode).toBe(1);
    } finally {
      console.log = originalLog;
      process.exitCode = originalExitCode;
    }
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

function createHealthyRepo(): string {
  const repo = createRepo();
  runPlant({ cwd: repo });
  writePackageJson(repo, {
    test: "node -e \"process.exit(0)\"",
    typecheck: "node -e \"process.exit(0)\"",
    greenhouse: greenhouseCommandForRepo(repo),
    "greenhouse:status": greenhouseCommandForRepo(repo, "status"),
    "greenhouse:tend": greenhouseCommandForRepo(repo, "tend"),
    "greenhouse:tend:check": greenhouseCommandForRepo(repo, "tend --check"),
    "greenhouse:verify:dry": greenhouseCommandForRepo(
      repo,
      "verify --changed --dry-run",
    ),
    "greenhouse:proposals": greenhouseCommandForRepo(repo, "proposals"),
    prepush: "pnpm greenhouse:tend",
  });
  initGitRepo(repo);
  return repo;
}

function writePackageJson(repo: string, scripts: Record<string, string>): void {
  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify(
      {
        name: "lifecycle-fixture",
        scripts,
        devDependencies: {
          "greenhouse-spec": `^${GREENHOUSE_SPEC_VERSION}`,
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

function writeRepeatedFailureSignature(repo: string): void {
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
}

function writeResolvedEvidenceIndex(repo: string): void {
  writeFileSync(
    join(repo, ".greenhouse", "grown", "evidence-index.yaml"),
    [
      "schema_version: 1",
      "managed_by: greenhouse-spec",
      "generated_at: 2026-05-25T00:00:00.000Z",
      "policy:",
      "  agent_reading: Do not bulk-read evidence.",
      "  retention: Keep recent evidence indexed here.",
      "recent:",
      "  - path: evidence/pass.md",
      "    modified_at: 2026-05-25T00:00:00.000Z",
      "    summary: passing test evidence",
      "    status: pass",
      "    commands:",
      "      - pnpm test",
      "    failed_commands: []",
      "",
    ].join("\n"),
    "utf8",
  );
}

function writePassingEvidence(
  repo: string,
  route: ReturnType<typeof runStatus>["verify"]["route"],
): void {
  writeEvidence({
    cwd: repo,
    route,
    commandResults: route.commands.map((command) => ({
      command: command.command,
      result: "pass" as const,
      exitCode: 0,
      output: "ok",
    })),
    noPrune: true,
  });
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
