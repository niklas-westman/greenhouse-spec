import {
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

import { runPlant } from "../src/plant/run-plant.js";
import { getChangedFiles } from "../src/validation/changed-files.js";
import { classifyChangedFiles } from "../src/validation/classify-changed-files.js";
import { routeValidation } from "../src/validation/route-validation.js";
import { formatVerifyReport, runVerify } from "../src/verify/run-verify.js";

const tempRepos: string[] = [];

afterEach(() => {
  for (const repo of tempRepos.splice(0)) {
    rmSync(repo, { recursive: true, force: true });
  }
});

describe("validation routing and evidence", () => {
  it("detects changed files from git status", () => {
    const repo = createVerifyRepo();
    initGitRepo(repo);
    writeFileSync(join(repo, "src", "cli", "new-command.ts"), "export {}\n");

    expect(getChangedFiles(repo)).toContain("src/cli/new-command.ts");
  });

  it("selects commands from path rules and risk rules", () => {
    const route = routeValidation({
      changedFiles: ["src/engine/sru/export.ts"],
      validation: {
        schema_version: 1,
        paths: {
          "src/engine/sru/**": {
            mode: "guarded",
            required: [{ id: "sru-tests", command: "node -e \"process.exit(0)\"" }],
            recommended: [],
            manual: [
              {
                id: "sample-review",
                prompt: "Review generated SRU sample.",
              },
            ],
          },
        },
        risks: {
          "generated-output-contract": {
            mode: "guarded",
            required: [
              { id: "contract-tests", command: "node -e \"process.exit(0)\"" },
            ],
            recommended: [],
            manual: [],
          },
        },
        modes: {
          guarded: {
            required: [{ id: "typecheck", command: "node -e \"process.exit(0)\"" }],
            recommended: [],
            manual: [
              {
                id: "human-risk-review",
                prompt: "Human must review guarded risk notes before merge.",
              },
            ],
          },
        },
      },
      riskIndex: {
        risks: [
          {
            id: "generated-output-contract",
            paths: ["src/engine/sru/**"],
          },
        ],
      },
    });

    expect(route.mode).toBe("guarded");
    expect(route.risks).toEqual(["generated-output-contract"]);
    expect(route.commands.map((command) => command.id)).toEqual([
      "sru-tests",
      "contract-tests",
      "typecheck",
    ]);
    expect(route.manualChecks.map((check) => check.id)).toEqual([
      "sample-review",
      "human-risk-review",
    ]);
  });

  it("infers lightweight docs-only patch validation before full fallback", () => {
    const route = routeValidation({
      changedFiles: ["README.md"],
      validation: {
        schema_version: 1,
        defaults: {
          required: [
            { id: "format:check", command: "pnpm format:check" },
            { id: "typecheck", command: "pnpm typecheck" },
            { id: "test", command: "pnpm test" },
            { id: "test:cli", command: "pnpm test:cli" },
          ],
          recommended: [],
          manual: [],
        },
      },
    });

    expect(route.mode).toBe("patch");
    expect(route.commands).toEqual([
      {
        id: "format:check",
        command: "pnpm format:check",
        reason: "Inferred docs-only patch route.",
        source: "inferred-route",
        matched: "docs-only",
      },
    ]);
  });

  it("infers CLI-only patch validation from command index before full fallback", () => {
    const route = routeValidation({
      changedFiles: ["src/cli/main.ts"],
      commandIndex: {
        schema_version: 1,
        managed_by: "greenhouse-spec",
        generated_at: "2026-05-23T00:00:00Z",
        package_manager: "pnpm",
        commands: [
          {
            id: "cli:build",
            command: "pnpm cli:build",
            source: "package.json",
            purpose: "CLI build",
            confidence: "high",
          },
        ],
      },
      validation: {
        schema_version: 1,
        defaults: {
          required: [
            { id: "format:check", command: "pnpm format:check" },
            { id: "typecheck", command: "pnpm typecheck" },
            { id: "test", command: "pnpm test" },
            { id: "test:cli", command: "pnpm test:cli" },
          ],
          recommended: [],
          manual: [],
        },
      },
    });

    expect(route.mode).toBe("patch");
    expect(route.commands).toEqual([
      {
        id: "cli:build",
        command: "pnpm cli:build",
        reason: "Inferred CLI-only patch route.",
        source: "inferred-route",
        matched: "Inferred CLI-only patch route.",
      },
      {
        id: "test:cli",
        command: "pnpm test:cli",
        reason: "Inferred CLI-only patch route.",
        source: "inferred-route",
        matched: "Inferred CLI-only patch route.",
      },
      {
        id: "typecheck",
        command: "pnpm typecheck",
        reason: "Inferred CLI-only patch route.",
        source: "inferred-route",
        matched: "Inferred CLI-only patch route.",
      },
    ]);
  });

  it("infers app patch validation without CLI smoke checks", () => {
    const route = routeValidation({
      changedFiles: ["src/app.tsx"],
      validation: {
        schema_version: 1,
        defaults: {
          required: [
            { id: "format:check", command: "pnpm format:check" },
            { id: "typecheck", command: "pnpm typecheck" },
            { id: "test", command: "pnpm test" },
            { id: "test:cli", command: "pnpm test:cli" },
          ],
          recommended: [],
          manual: [],
        },
      },
    });

    expect(route.mode).toBe("patch");
    expect(route.commands.map((command) => command.command)).toEqual([
      "pnpm format:check",
      "pnpm typecheck",
      "pnpm test",
    ]);
    expect(route.commands.map((command) => command.command)).not.toContain(
      "pnpm test:cli",
    );
  });

  it("uses lint for inferred app patches when format check is unavailable", () => {
    const route = routeValidation({
      changedFiles: ["src/app.tsx"],
      commandIndex: {
        schema_version: 1,
        managed_by: "greenhouse-spec",
        generated_at: "2026-05-25T00:00:00Z",
        package_manager: "pnpm",
        commands: [
          {
            id: "lint",
            command: "pnpm lint",
            source: "package.json",
            purpose: "lint validation",
            confidence: "high",
          },
          {
            id: "typecheck",
            command: "pnpm typecheck",
            source: "package.json",
            purpose: "TypeScript validation",
            confidence: "high",
          },
          {
            id: "test",
            command: "pnpm test",
            source: "package.json",
            purpose: "test suite",
            confidence: "high",
          },
        ],
      },
      validation: {
        schema_version: 1,
        defaults: {
          required: [
            { id: "typecheck", command: "pnpm typecheck" },
            { id: "test", command: "pnpm test" },
          ],
          recommended: [],
          manual: [],
        },
      },
    });

    expect(route.commands.map((command) => command.command)).toEqual([
      "pnpm lint",
      "pnpm typecheck",
      "pnpm test",
    ]);
  });

  it("does not invent style checks for inferred app patches", () => {
    const route = routeValidation({
      changedFiles: ["src/app.tsx"],
      commandIndex: {
        schema_version: 1,
        managed_by: "greenhouse-spec",
        generated_at: "2026-05-25T00:00:00Z",
        package_manager: "pnpm",
        commands: [
          {
            id: "typecheck",
            command: "pnpm typecheck",
            source: "package.json",
            purpose: "TypeScript validation",
            confidence: "high",
          },
          {
            id: "test",
            command: "pnpm test",
            source: "package.json",
            purpose: "test suite",
            confidence: "high",
          },
        ],
      },
      validation: {
        schema_version: 1,
        defaults: {
          required: [
            { id: "typecheck", command: "pnpm typecheck" },
            { id: "test", command: "pnpm test" },
          ],
          recommended: [],
          manual: [],
        },
      },
    });

    expect(route.commands.map((command) => command.command)).toEqual([
      "pnpm typecheck",
      "pnpm test",
    ]);
    expect(route.commands.map((command) => command.command)).not.toContain(
      "pnpm format:check",
    );
  });

  it("uses lint for docs-only patches when format check is unavailable", () => {
    const route = routeValidation({
      changedFiles: ["README.md"],
      commandIndex: {
        schema_version: 1,
        managed_by: "greenhouse-spec",
        generated_at: "2026-05-25T00:00:00Z",
        package_manager: "pnpm",
        commands: [
          {
            id: "lint",
            command: "pnpm lint",
            source: "package.json",
            purpose: "lint validation",
            confidence: "high",
          },
        ],
      },
      validation: {
        schema_version: 1,
        defaults: {
          required: [],
          recommended: [],
          manual: [],
        },
      },
    });

    expect(route.commands).toEqual([
      {
        id: "lint",
        command: "pnpm lint",
        reason: "Inferred docs-only patch route.",
        source: "inferred-route",
        matched: "docs-only",
      },
    ]);
  });

  it("recognizes common uppercase React app entrypoints as app patches", () => {
    const route = routeValidation({
      changedFiles: ["src/App.tsx"],
      validation: {
        schema_version: 1,
        defaults: {
          required: [
            { id: "format:check", command: "pnpm format:check" },
            { id: "typecheck", command: "pnpm typecheck" },
            { id: "test", command: "pnpm test" },
            { id: "test:cli", command: "pnpm test:cli" },
          ],
          recommended: [],
          manual: [],
        },
      },
    });

    expect(route.mode).toBe("patch");
    expect(route.commands.map((command) => command.command)).toEqual([
      "pnpm format:check",
      "pnpm typecheck",
      "pnpm test",
    ]);
    expect(route.commands.map((command) => command.reason)).toEqual([
      "Inferred app patch route.",
      "Inferred app patch route.",
      "Inferred app patch route.",
    ]);
  });

  it("combines app and CLI patch validation when both areas change", () => {
    const route = routeValidation({
      changedFiles: ["src/app.tsx", "src/cli/main.ts"],
      validation: {
        schema_version: 1,
        defaults: {
          required: [
            { id: "format:check", command: "pnpm format:check" },
            { id: "typecheck", command: "pnpm typecheck" },
            { id: "test", command: "pnpm test" },
            { id: "test:cli", command: "pnpm test:cli" },
          ],
          recommended: [],
          manual: [],
        },
      },
    });

    expect(route.commands.map((command) => command.command)).toEqual([
      "pnpm format:check",
      "pnpm typecheck",
      "pnpm test",
      "pnpm test:cli",
    ]);
  });

  it("classifies generated greenhouse files separately from routed files", () => {
    const classification = classifyChangedFiles([
      "README.md",
      "src/cli/main.ts",
      "package.json",
      "AGENTS.md",
      ".greenhouse/roots/rules.md",
      ".greenhouse/evidence/2026-05-23T00-00-00-000Z-verify.md",
      ".greenhouse/grown/repo-map.yaml",
    ]);

    expect(classification.groups["product-source"]).toEqual([
      "README.md",
      "src/cli/main.ts",
    ]);
    expect(classification.groups["repo-config"]).toEqual(["package.json"]);
    expect(classification.groups["agent-instructions"]).toEqual(["AGENTS.md"]);
    expect(classification.groups["greenhouse-authored"]).toEqual([
      ".greenhouse/roots/rules.md",
    ]);
    expect(classification.groups["greenhouse-generated"]).toEqual([
      ".greenhouse/evidence/2026-05-23T00-00-00-000Z-verify.md",
      ".greenhouse/grown/repo-map.yaml",
    ]);
    expect(classification.routeFiles).not.toContain(
      ".greenhouse/grown/repo-map.yaml",
    );
  });

  it("combines lightweight docs, CLI, and config routes without full fallback", () => {
    const route = routeValidation({
      changedFiles: [
        "README.md",
        "src/cli/main.ts",
        "package.json",
        "AGENTS.md",
        ".greenhouse/roots/rules.md",
      ],
      commandIndex: {
        schema_version: 1,
        managed_by: "greenhouse-spec",
        generated_at: "2026-05-23T00:00:00Z",
        package_manager: "pnpm",
        commands: [
          {
            id: "check:greenhouse",
            command: "pnpm check:greenhouse",
            source: "package.json",
            purpose: "Greenhouse doctor",
            confidence: "high",
          },
        ],
      },
      validation: {
        schema_version: 1,
        defaults: {
          required: [
            { id: "format:check", command: "pnpm format:check" },
            { id: "typecheck", command: "pnpm typecheck" },
            { id: "test", command: "pnpm test" },
            { id: "test:cli", command: "pnpm test:cli" },
          ],
          recommended: [],
          manual: [],
        },
      },
    });

    expect(route.mode).toBe("patch");
    expect(route.commands.map((command) => command.command)).toEqual([
      "pnpm format:check",
      "pnpm test:cli",
      "pnpm typecheck",
      "pnpm check:greenhouse",
    ]);
    expect(route.commands.map((command) => command.command)).not.toContain(
      "pnpm test",
    );
    expect(route.manualChecks.map((check) => check.id)).toEqual([
      "greenhouse-authored-review",
      "agent-instructions-review",
    ]);
  });

  it("routes authored greenhouse config to doctor without CLI checks", () => {
    const route = routeValidation({
      changedFiles: [".greenhouse/roots/rules.md"],
      commandIndex: {
        schema_version: 1,
        managed_by: "greenhouse-spec",
        generated_at: "2026-05-23T00:00:00Z",
        package_manager: "pnpm",
        commands: [
          {
            id: "check:greenhouse",
            command: "pnpm check:greenhouse",
            source: "package.json",
            purpose: "Greenhouse doctor",
            confidence: "high",
          },
        ],
      },
      validation: {
        schema_version: 1,
        defaults: {
          required: [
            { id: "format:check", command: "pnpm format:check" },
            { id: "typecheck", command: "pnpm typecheck" },
            { id: "test", command: "pnpm test" },
            { id: "test:cli", command: "pnpm test:cli" },
          ],
          recommended: [],
          manual: [],
        },
      },
    });

    expect(route.commands.map((command) => command.command)).toEqual([
      "pnpm check:greenhouse",
    ]);
    expect(route.manualChecks.map((check) => check.id)).toEqual([
      "greenhouse-authored-review",
    ]);
  });

  it("explains selected checks in dry-run", () => {
    const repo = createVerifyRepo();
    writeValidationConfig(repo, "node -e \"process.exit(0)\"");
    writeRiskIndex(repo);
    initGitRepo(repo);
    writeFileSync(join(repo, "src", "engine", "sru", "export.ts"), "export {}\n");

    const report = runVerify({ cwd: repo, changed: true, dryRun: true });

    expect(report.ok).toBe(true);
    expect(report.route.mode).toBe("guarded");
    expect(report.commandResults.every((result) => result.result === "not_run")).toBe(
      true,
    );
    expect(report.commandResults[0]?.output).toContain("Matched path rule");
    expect(report.route.explanations).toContainEqual({
      kind: "path-rule",
      message: 'Matched path rule "src/engine/sru/**".',
    });
    expect(report.route.explanations).toContainEqual({
      kind: "risk-rule",
      message: 'Matched risk "generated-output-contract".',
    });
    expect(formatVerifyReport(report)).toContain("## Route explanation");
    expect(formatVerifyReport(report)).toContain("## Agent takeaway");
    expect(formatVerifyReport(report)).toContain(
      "- Coverage: 1/1 file(s) routed for validation.",
    );
    expect(formatVerifyReport(report)).toContain("## Validation plan");
    expect(formatVerifyReport(report)).toContain(
      '- path-rule: Matched path rule "src/engine/sru/**".',
    );
    expect(formatVerifyReport(report)).toContain(
      "- source: path-rule (src/engine/sru/**)",
    );
  });

  it("routes official source paths to guarded through the risk index", () => {
    const route = routeValidation({
      changedFiles: ["src/engine/sources/registry.ts"],
      validation: {
        schema_version: 1,
        defaults: {
          required: [
            { id: "format:check", command: "pnpm format:check" },
            { id: "typecheck", command: "pnpm typecheck" },
            { id: "test", command: "pnpm test" },
            { id: "test:cli", command: "pnpm test:cli" },
          ],
          recommended: [{ id: "build", command: "pnpm build" }],
          manual: [],
        },
        modes: {
          guarded: {
            required: [
              { id: "format:check", command: "pnpm format:check" },
              { id: "typecheck", command: "pnpm typecheck" },
              { id: "test", command: "pnpm test" },
              { id: "test:cli", command: "pnpm test:cli" },
              { id: "build", command: "pnpm build" },
            ],
            recommended: [],
            manual: [
              {
                id: "human-risk-review",
                prompt: "Human must review guarded risk notes before merge.",
              },
            ],
          },
        },
      },
      riskIndex: {
        risks: [
          {
            id: "official-source-change",
            paths: ["src/engine/sources/**"],
          },
        ],
      },
    });

    expect(route.mode).toBe("guarded");
    expect(route.risks).toEqual(["official-source-change"]);
    expect(route.commands.map((command) => command.command)).toEqual([
      "pnpm format:check",
      "pnpm typecheck",
      "pnpm test",
      "pnpm test:cli",
      "pnpm build",
    ]);
    expect(route.manualChecks.map((check) => check.id)).toEqual([
      "human-risk-review",
    ]);
  });

  it("runs commands and records failures", () => {
    const repo = createVerifyRepo();
    writeValidationConfig(repo, "node -e \"process.exit(1)\"");

    const report = runVerify({
      cwd: repo,
      paths: ["src/engine/sru/export.ts"],
      mode: "guarded",
    });

    expect(report.ok).toBe(false);
    expect(report.commandResults).toContainEqual(
      expect.objectContaining({
        result: "fail",
        exitCode: 1,
      }),
    );
  });

  it("does not fall back to full validation for generated-only greenhouse changes", () => {
    const repo = createVerifyRepo();
    writeValidationConfig(repo, "node -e \"process.exit(0)\"");

    const report = runVerify({
      cwd: repo,
      paths: [".greenhouse/evidence/2026-05-23T00-00-00-000Z-verify.md"],
      dryRun: true,
    });

    expect(report.ok).toBe(true);
    expect(report.route.changedFiles).toEqual([]);
    expect(report.route.commands).toEqual([]);
    expect(report.route.skippedValidation).toContain("no non-generated files");
    expect(report.route.explanations).toContainEqual({
      kind: "generated-excluded",
      message:
        ".greenhouse/evidence/2026-05-23T00-00-00-000Z-verify.md was excluded from validation routing because it is generated or not routable.",
    });
    expect(formatVerifyReport(report)).toContain("- generated-excluded:");
    expect(formatVerifyReport(report)).toContain("- skipped:");
  });

  it("prints impact warnings in dry-run reports", () => {
    const repo = createVerifyRepo();
    writeValidationConfig(repo, "node -e \"process.exit(0)\"");

    const report = runVerify({
      cwd: repo,
      paths: ["package.json"],
      dryRun: true,
    });
    const output = formatVerifyReport(report);

    expect(report.impactWarnings).toContainEqual(
      expect.objectContaining({
        id: "impact.package-scripts-docs",
        severity: "warning",
      }),
    );
    expect(output).toContain("- Impact warnings: 1 warning.");
    expect(output).toContain("## Impact warnings");
    expect(output).toContain("package.json changed; setup docs");
  });

  it("flags source fallback validation as a route drift impact", () => {
    const repo = createVerifyRepo();
    writeValidationConfig(repo, "node -e \"process.exit(0)\"");

    const report = runVerify({
      cwd: repo,
      paths: ["lib/new-area/index.ts"],
      dryRun: true,
    });

    expect(report.impactWarnings).toContainEqual(
      expect.objectContaining({
        id: "impact.source-fallback-route",
        severity: "guarded",
        kind: "validation-route-drift",
      }),
    );
  });

  it("writes evidence with selected commands and skipped validation notes", () => {
    const repo = createVerifyRepo();
    writeValidationConfig(repo, "node -e \"process.exit(0)\"");

    const report = runVerify({
      cwd: repo,
      paths: ["README.md"],
      writeEvidence: true,
    });

    expect(report.ok).toBe(true);
    expect(report.evidencePath).toBeDefined();
    const evidence = readFileSync(report.evidencePath ?? "", "utf8");
    expect(evidence).toContain("## Commands run");
    expect(evidence).toContain("No validation was skipped.");
  });
});

function createVerifyRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "greenhouse-spec-verify-"));
  tempRepos.push(repo);
  mkdirSync(join(repo, "src", "engine", "sru"), { recursive: true });
  mkdirSync(join(repo, "src", "cli"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# Verify fixture\n");
  writeFileSync(join(repo, "src", "cli", "main.ts"), "export {}\n");
  writeFileSync(join(repo, "src", "engine", "sru", "index.ts"), "export {}\n");
  writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify(
      {
        name: "verify-fixture",
        scripts: {
          test: "node -e \"process.exit(0)\"",
          typecheck: "node -e \"process.exit(0)\"",
        },
      },
      null,
      2,
    ),
  );
  runPlant({ cwd: repo });
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

function writeValidationConfig(repo: string, command: string): void {
  writeFileSync(
    join(repo, ".greenhouse", "roots", "validation.yaml"),
    [
      "schema_version: 1",
      "defaults:",
      "  required:",
      "    - id: format:check",
      `      command: ${JSON.stringify(command)}`,
      "    - id: default-test",
      `      command: ${JSON.stringify(command)}`,
      "modes:",
      "  patch:",
      "    required: []",
      "  guarded:",
      "    required:",
      "      - id: guarded-test",
      `        command: ${JSON.stringify(command)}`,
      "    manual:",
      "      - id: human-risk-review",
      "        prompt: Human must review guarded risk notes before merge.",
      "paths:",
      "  \"src/engine/sru/**\":",
      "    mode: guarded",
      "    required:",
      "      - id: sru-tests",
      `        command: ${JSON.stringify(command)}`,
      "risks:",
      "  generated-output-contract:",
      "    mode: guarded",
      "    required:",
      "      - id: contract-tests",
      `        command: ${JSON.stringify(command)}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

function writeRiskIndex(repo: string): void {
  writeFileSync(
    join(repo, ".greenhouse", "grown", "risk-index.yaml"),
    [
      "schema_version: 1",
      "managed_by: greenhouse-spec",
      "generated_at: 2026-05-22T00:00:00Z",
      "risks:",
      "  - id: generated-output-contract",
      "    paths:",
      "      - src/engine/sru/**",
      "    reason: SRU output contract.",
      "    confidence: medium",
      "",
    ].join("\n"),
    "utf8",
  );
}
