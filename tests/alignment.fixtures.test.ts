import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import { writeFailureSignatures } from "../src/evidence/failure-signatures.js";
import { applyProposals } from "../src/proposals/apply-proposals.js";
import { runInspect } from "../src/inspect/run-inspect.js";
import { runPlant } from "../src/plant/run-plant.js";
import { runStatus } from "../src/status/run-status.js";
import { runVerify } from "../src/verify/run-verify.js";

const tempRepos: string[] = [];

afterEach(() => {
  for (const repo of tempRepos.splice(0)) {
    rmSync(repo, { recursive: true, force: true });
  }
});

describe("portable alignment fixtures", () => {
  it("detects package script drift while docs-only validation stays scoped", () => {
    const repo = createReadyRepo();
    writeValidationRoot(repo, [
      "schema_version: 1",
      "paths:",
      "  README.md:",
      "    required:",
      "      - id: docs",
      "        command: pnpm docs:check",
      "defaults:",
      "  required:",
      "    - id: test",
      "      command: pnpm test",
      "",
    ]);

    const packageImpact = runVerify({
      cwd: repo,
      paths: ["package.json"],
      dryRun: true,
    });
    const docsPlan = runVerify({
      cwd: repo,
      paths: ["README.md"],
      dryRun: true,
    });

    expect(packageImpact.impactWarnings).toContainEqual(
      expect.objectContaining({
        id: "impact.package-scripts-docs",
        severity: "warning",
      }),
    );
    expect(docsPlan.route.commands.map((command) => command.command)).toEqual([
      "pnpm docs:check",
    ]);
  });

  it("detects new source fallback and dead validation commands", () => {
    const repo = createReadyRepo();
    writeValidationRoot(repo, [
      "schema_version: 1",
      "paths:",
      "  src/**:",
      "    required:",
      "      - id: missing",
      "        command: pnpm missing-script",
      "defaults:",
      "  required:",
      "    - id: test",
      "      command: pnpm test",
      "",
    ]);
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "app.ts"), "export const app = 1;\n");
    initGitRepo(repo);
    writeFileSync(join(repo, "src", "app.ts"), "export const app = 2;\n");

    const fallback = runVerify({
      cwd: repo,
      paths: ["lib/new-area/index.ts"],
      dryRun: true,
    });
    const status = runStatus({ cwd: repo });

    expect(fallback.impactWarnings).toContainEqual(
      expect.objectContaining({
        id: "impact.source-fallback-route",
        severity: "guarded",
      }),
    );
    expect(status.overallStatus).toBe("fail");
    expect(status.verify.impactWarnings).toContainEqual(
      expect.objectContaining({
        id: "impact.missing-package-script.missing-script",
        severity: "blocking",
      }),
    );
  });

  it("detects generated output edits and API spec impact", () => {
    const repo = createReadyRepo();
    mkdirSync(join(repo, "src", "generated"), { recursive: true });
    writeFileSync(join(repo, "src", "generated", "client.ts"), "export {}\n");
    mkdirSync(join(repo, "api"), { recursive: true });
    writeFileSync(join(repo, "api", "openapi.yaml"), "openapi: 3.0.0\n");

    const generated = runVerify({
      cwd: repo,
      paths: ["src/generated/client.ts"],
      dryRun: true,
    });
    const api = runVerify({
      cwd: repo,
      paths: ["api/openapi.yaml"],
      dryRun: true,
    });

    expect(generated.impactWarnings).toContainEqual(
      expect.objectContaining({
        id: "impact.generated-boundary",
        severity: "guarded",
      }),
    );
    expect(api.impactWarnings).toContainEqual(
      expect.objectContaining({
        id: "impact.api-spec-generated",
        severity: "guarded",
      }),
    );
  });

  it("shows repeated failures as degraded while current failures still fail", () => {
    const repo = createReadyRepo({
      test: "node -e \"console.error('TypeError: localStorage.clear is not a function'); process.exit(1)\"",
    });
    writeFailureEvidence(repo, "first");
    writeFailureEvidence(repo, "second");
    writeFailureSignatures(repo);
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "App.tsx"), "export const app = 1;\n");
    initGitRepo(repo);
    writeFileSync(join(repo, "src", "App.tsx"), "export const app = 2;\n");

    const status = runStatus({ cwd: repo });
    const verify = runVerify({
      cwd: repo,
      paths: ["src/App.tsx"],
    });

    expect(status.overallStatus).toBe("degraded");
    expect(status.repeatedFailures).toContainEqual(
      expect.objectContaining({
        command: "pnpm test",
      }),
    );
    expect(verify.ok).toBe(false);
    expect(verify.commandResults).toContainEqual(
      expect.objectContaining({
        command: "pnpm test",
        result: "fail",
      }),
    );
  });

  it("keeps generated Greenhouse dirt out of routing", () => {
    const repo = createReadyRepo();
    initGitRepo(repo);
    writeFileSync(
      join(repo, ".greenhouse", "evidence", "generated-only.md"),
      "# generated\n",
    );

    const status = runStatus({ cwd: repo });

    expect(status.generatedOnlyDirty).toBe(true);
    expect(status.verify.route.commands).toEqual([]);
  });
});

function createReadyRepo(
  scripts: Record<string, string> = {},
): string {
  const repo = mkdtempSync(join(tmpdir(), "greenhouse-spec-fixture-align-"));
  tempRepos.push(repo);
  writeFileSync(join(repo, "README.md"), "# Fixture\n");
  writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writePackageJson(repo, {
    test: "node -e \"process.exit(0)\"",
    typecheck: "node -e \"process.exit(0)\"",
    "docs:check": "node -e \"process.exit(0)\"",
    ...scripts,
  });
  runPlant({ cwd: repo });
  runInspect({ cwd: repo });
  applyProposals({ cwd: repo, safe: true });
  return repo;
}

function writePackageJson(repo: string, scripts: Record<string, string>): void {
  writeFileSync(
    join(repo, "package.json"),
    `${JSON.stringify({ name: "fixture", scripts }, null, 2)}\n`,
  );
}

function writeValidationRoot(repo: string, lines: string[]): void {
  writeFileSync(
    join(repo, ".greenhouse", "roots", "validation.yaml"),
    lines.join("\n"),
  );
}

function initGitRepo(repo: string): void {
  execFileSync("git", ["init", "-b", "main"], { cwd: repo });
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync(
    "git",
    [
      "-c",
      "user.email=test@example.com",
      "-c",
      "user.name=Test",
      "commit",
      "-m",
      "init",
    ],
    { cwd: repo },
  );
}

function writeFailureEvidence(repo: string, id: string): void {
  writeFileSync(
    join(repo, ".greenhouse", "evidence", `${id}-verify.md`),
    [
      "# Verification",
      "",
      "## Commands run",
      "",
      "| Command | Result | Notes |",
      "|---|---:|---|",
      "| `pnpm test` | fail | TypeError: localStorage.clear is not a function |",
      "",
    ].join("\n"),
  );
}
