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

import {
  formatAlignmentReport,
  runAlignment,
  type AlignmentRepoContract,
} from "../src/alignment/run-alignment.js";
import { applyProposals } from "../src/proposals/apply-proposals.js";
import { runInspect } from "../src/inspect/run-inspect.js";
import { runPlant } from "../src/plant/run-plant.js";

const tempRepos: string[] = [];

afterEach(() => {
  for (const repo of tempRepos.splice(0)) {
    rmSync(repo, { recursive: true, force: true });
  }
});

describe("alignment checks", () => {
  it("passes an Ensember-like Tauri alignment contract", () => {
    const repo = createEnsemberLikeRepo();
    runPlant({ cwd: repo });
    runInspect({ cwd: repo });
    applyProposals({ cwd: repo, safe: true });
    initGitRepo(repo);

    const report = runAlignment({
      contracts: [ensemberContract(repo)],
    });
    const output = formatAlignmentReport(report);

    expect(report.ok).toBe(true);
    expect(output).toContain("# Greenhouse Alignment Report");
    expect(output).toContain("tend - finish gate returned pass.");
    expect(output).toContain("impact:package-script-impact");
    expect(output).toContain("verify:tauri-source-route");
    expect(output).toContain("src-tauri/target/ is Rust/Cargo build output");
  });

  it("fails when an expected route command is missing", () => {
    const repo = createEnsemberLikeRepo();
    runPlant({ cwd: repo });
    initGitRepo(repo);

    const report = runAlignment({
      contracts: [ensemberContract(repo)],
    });

    expect(report.ok).toBe(false);
    expect(report.repos[0].checks).toContainEqual(
      expect.objectContaining({
        id: "verify:tauri-source-route",
        state: "fail",
      }),
    );
  });
});

function ensemberContract(repo: string): AlignmentRepoContract {
  return {
    name: "ensember-fixture",
    path: repo,
    expectedStatus: ["pass"],
    expectedShapes: ["frontend-react", "rust-cargo", "tauri"],
    expectedGenerated: [
      {
        path: "src-tauri/target/",
        reason: "Rust/Cargo build output",
      },
    ],
    tend: {
      expectedState: "pass",
      validationExecuted: false,
      evidenceWritten: false,
    },
    impact: [
      {
        id: "package-script-impact",
        path: "package.json",
        warnings: [{ id: "impact.package-scripts-docs", severity: "warning" }],
      },
      {
        id: "tauri-impact",
        path: "src-tauri/src/lib.rs",
        warnings: [{ id: "impact.tauri-packaging", severity: "advisory" }],
      },
    ],
    verify: [
      {
        id: "app-route",
        path: "src/app.tsx",
        commands: ["pnpm lint", "pnpm typecheck", "pnpm test"],
        excludedCommands: ["pnpm format:check"],
      },
      {
        id: "tauri-source-route",
        path: "src-tauri/src/lib.rs",
        commands: ["cd src-tauri && cargo test"],
      },
      {
        id: "tauri-manifest-route",
        path: "src-tauri/Cargo.toml",
        mode: "guarded",
        commands: [
          "cd src-tauri && cargo test",
          "pnpm typecheck",
          "pnpm test",
          "pnpm build",
        ],
        manualChecks: ["tauri-runtime-review", "human-risk-review"],
      },
    ],
  };
}

function createEnsemberLikeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "greenhouse-spec-alignment-"));
  tempRepos.push(repo);
  mkdirSync(join(repo, "src"), { recursive: true });
  mkdirSync(join(repo, "src-tauri", "src"), { recursive: true });
  mkdirSync(join(repo, "src-tauri", "target"), { recursive: true });
  writeFileSync(join(repo, "src", "app.tsx"), "export {}\n");
  writeFileSync(join(repo, "src-tauri", "src", "lib.rs"), "");
  writeFileSync(
    join(repo, "src-tauri", "Cargo.toml"),
    ["[package]", 'name = "ensember"', 'version = "0.1.0"', ""].join("\n"),
  );
  writeFileSync(join(repo, "src-tauri", "Cargo.lock"), "# lock\n");
  writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(
    join(repo, "package.json"),
    `${JSON.stringify(
      {
        name: "ensember",
        scripts: {
          build: "tsc -b && vite build",
          lint: "eslint .",
          test: "vitest run",
          typecheck: "tsc -b --pretty false",
          tauri: "tauri",
          "tauri:dev": "tauri dev",
        },
        dependencies: {
          "@tauri-apps/api": "2.11.0",
          react: "19.2.6",
        },
        devDependencies: {
          "@tauri-apps/cli": "2.11.2",
          typescript: "5.9.3",
          vite: "7.2.4",
          vitest: "4.0.14",
        },
      },
      null,
      2,
    )}\n`,
  );
  return repo;
}

function initGitRepo(repo: string): void {
  execFileSync("git", ["init"], { cwd: repo });
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
