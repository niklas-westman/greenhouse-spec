import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { runDoctor } from "../src/doctor/run-doctor.js";
import { mvpInstalledDirectories } from "../src/templates/installed-tree.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDirectory, "..");
const templateRoot = join(repoRoot, "templates", "installed");
const tempRepos: string[] = [];

afterEach(() => {
  for (const repo of tempRepos.splice(0)) {
    rmSync(repo, { recursive: true, force: true });
  }
});

describe("doctor", () => {
  it("passes on a valid MVP greenhouse tree", () => {
    const repo = createFixtureRepo();

    const report = runDoctor({ cwd: repo });

    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
  });

  it("fails when project.yaml is missing", () => {
    const repo = createFixtureRepo();
    rmSync(join(repo, ".greenhouse", "project.yaml"));

    const report = runDoctor({ cwd: repo });

    expect(report.ok).toBe(false);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        severity: "error",
        check: "required-file",
        message: "Missing required file: .greenhouse/project.yaml",
      }),
    );
  });

  it("fails with a file/key message for invalid schema YAML", () => {
    const repo = createFixtureRepo();
    writeFileSync(
      join(repo, ".greenhouse", "project.yaml"),
      "schema_version: 2\nrepo:\n  name: ''\n",
      "utf8",
    );

    const report = runDoctor({ cwd: repo });

    expect(report.ok).toBe(false);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        severity: "error",
        check: "schema",
        path: ".greenhouse/project.yaml",
      }),
    );
    expect(report.findings.map((finding) => finding.message).join("\n")).toContain(
      "schema_version",
    );
  });

  it("fails when context manifest entries point to missing files", () => {
    const repo = createFixtureRepo();
    writeFileSync(
      join(repo, ".greenhouse", "context", "manifest.yaml"),
      [
        "schema_version: 1",
        "context:",
        "  - id: missing-doc",
        "    type: doc",
        "    path: docs/missing.md",
        "    activation:",
        "      mode: always",
        "    budget:",
        "      max_tokens: 600",
        "",
      ].join("\n"),
      "utf8",
    );

    const report = runDoctor({ cwd: repo });

    expect(report.ok).toBe(false);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        severity: "error",
        check: "context-path",
        message:
          'Context entry "missing-doc" points to missing file: docs/missing.md',
      }),
    );
  });

  it("fails when generated paths are also listed as source paths", () => {
    const repo = createFixtureRepo();
    writeFileSync(
      join(repo, ".greenhouse", "grown", "repo-map.yaml"),
      [
        "schema_version: 1",
        "managed_by: greenhouse-spec",
        "generated_at: 2026-05-22T15:00:00Z",
        "confidence: medium",
        "source:",
        "  - path: dist/",
        "    kind: application-source",
        "    confidence: high",
        "tests: []",
        "docs: []",
        "generated:",
        "  - path: dist/",
        "    reason: build output",
        "agent_files: []",
        "",
      ].join("\n"),
      "utf8",
    );

    const report = runDoctor({ cwd: repo });

    expect(report.ok).toBe(false);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        severity: "error",
        check: "repo-map-generated-source",
        message: "Generated path is also listed as source: dist/",
      }),
    );
  });

  it("warns when package script aliases point somewhere unexpected", () => {
    const repo = createFixtureRepo();
    writeFileSync(
      join(repo, "package.json"),
      JSON.stringify(
        {
          scripts: {
            "check:changed": "echo nope",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const report = runDoctor({ cwd: repo });

    expect(report.ok).toBe(true);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        check: "package-script-alias",
      }),
    );
  });

  it("accepts local node CLI package script aliases", () => {
    const repo = createFixtureRepo();
    writeFileSync(
      join(repo, "package.json"),
      JSON.stringify(
        {
          scripts: {
            greenhouse: "node ../greenhouse/code/greenhouse-spec/dist/cli.js status",
            "greenhouse:tend": "node ../greenhouse/code/greenhouse-spec/dist/cli.js tend",
            "greenhouse:tend:check":
              "node ../greenhouse/code/greenhouse-spec/dist/cli.js tend --check",
            "greenhouse:verify:dry":
              "node ../greenhouse/code/greenhouse-spec/dist/cli.js verify --changed --dry-run",
            "greenhouse:proposals":
              "node ../greenhouse/code/greenhouse-spec/dist/cli.js proposals",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const report = runDoctor({ cwd: repo });

    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
  });

  it("accepts self-hosted greenhouse package script aliases", () => {
    const repo = createFixtureRepo();
    writeFileSync(
      join(repo, "package.json"),
      JSON.stringify(
        {
          name: "greenhouse-spec",
          scripts: {
            greenhouse: "pnpm build && node dist/cli.js",
            "check:greenhouse": "pnpm greenhouse doctor",
            "check:changed": "pnpm greenhouse verify --changed",
            "check:changed:evidence":
              "pnpm greenhouse verify --changed --write-evidence",
            "validate:scope": "pnpm greenhouse verify --paths",
            "greenhouse:tend": "pnpm greenhouse tend",
            "greenhouse:tend:check": "pnpm greenhouse tend --check",
            "greenhouse:verify:dry": "pnpm greenhouse verify --changed --dry-run",
            "greenhouse:proposals": "pnpm greenhouse proposals",
            tend: "pnpm greenhouse tend",
            "check:tend": "pnpm greenhouse tend --check",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const report = runDoctor({ cwd: repo });

    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
  });

  it("writes a doctor report when requested", () => {
    const repo = createFixtureRepo();

    const report = runDoctor({ cwd: repo, writeReport: true });

    expect(report.ok).toBe(true);
    expect(report.writtenReportPath).toBeDefined();
    expect(existsSync(report.writtenReportPath ?? "")).toBe(true);
    expect(readFileSync(report.writtenReportPath ?? "", "utf8")).toContain(
      "Status: pass",
    );
  });
});

function createFixtureRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "greenhouse-spec-doctor-"));
  tempRepos.push(repo);

  const greenhousePath = join(repo, ".greenhouse");
  cpSync(templateRoot, greenhousePath, { recursive: true });

  for (const directory of mvpInstalledDirectories) {
    mkdirSync(join(greenhousePath, directory), { recursive: true });
  }

  return repo;
}
