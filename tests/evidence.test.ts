import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  annotateRepeatedFailures,
  buildFailureSignatures,
  failureExcerpt,
  isLowSignalFailureText,
  normalizeFailureText,
  writeFailureSignatures,
} from "../src/evidence/failure-signatures.js";
import { pruneGeneratedRecords } from "../src/evidence/prune.js";
import { writeEvidence } from "../src/evidence/write-evidence.js";

const tempRepos: string[] = [];

afterEach(() => {
  for (const repo of tempRepos.splice(0)) {
    rmSync(repo, { recursive: true, force: true });
  }
});

describe("evidence pruning", () => {
  it("dry-run reports old generated records without deleting them", () => {
    const repo = createRepoWithEvidence(4);

    const report = pruneGeneratedRecords({ cwd: repo, dryRun: true, keep: 2 });

    expect(report.deleted).toHaveLength(2);
    expect(markdownFiles(join(repo, ".greenhouse", "evidence"))).toHaveLength(4);
  });

  it("keeps the newest generated records per folder", () => {
    const repo = createRepoWithEvidence(4);

    const report = pruneGeneratedRecords({ cwd: repo, keep: 2 });

    expect(report.deleted).toHaveLength(2);
    expect(markdownFiles(join(repo, ".greenhouse", "evidence"))).toEqual([
      "record-2.md",
      "record-3.md",
    ]);
  });

  it("prunes report folders independently from evidence", () => {
    const repo = createRepoWithEvidence(1);
    const tendPath = join(repo, ".greenhouse", "reports", "tend");
    mkdirSync(tendPath, { recursive: true });
    writeTimedFile(join(tendPath, "report-0.md"), 0);
    writeTimedFile(join(tendPath, "report-1.md"), 1);
    writeTimedFile(join(tendPath, "report-2.md"), 2);

    pruneGeneratedRecords({ cwd: repo, keep: 1 });

    expect(markdownFiles(join(repo, ".greenhouse", "evidence"))).toEqual([
      "record-0.md",
    ]);
    expect(markdownFiles(tendPath)).toEqual(["report-2.md"]);
  });
});

describe("failure signatures", () => {
  it("extracts stable failure text from noisy command output", () => {
    const output = [
      " RUN  v2.1.9 /repo",
      "src/app.test.tsx:15",
      "TypeError: localStorage.clear is not a function",
      "    at /Users/niklas/project/src/app.test.tsx:15:18",
    ].join("\n");

    expect(failureExcerpt(output)).toContain(
      "TypeError: localStorage.clear is not a function",
    );
    expect(normalizeFailureText(failureExcerpt(output))).toBe(
      "localstorage.clear is not a function",
    );
  });

  it("detects low-signal runner summaries", () => {
    expect(
      isLowSignalFailureText(
        "> declarion@0.1.0 test <path> > vitest run run v2.1.9 <path>",
      ),
    ).toBe(true);
    expect(isLowSignalFailureText("localstorage.clear is not a function")).toBe(
      false,
    );
  });

  it("groups repeated failed command evidence and ignores passing commands", () => {
    const repo = createRepoWithEvidence(0);
    writeEvidenceFile(repo, "first.md", [
      "| Command | Result | Notes |",
      "|---|---:|---|",
      "| `pnpm test` | fail | TypeError: localStorage.clear is not a function |",
      "| `pnpm typecheck` | pass | ok |",
    ]);
    writeEvidenceFile(repo, "second.md", [
      "| Command | Result | Notes |",
      "|---|---:|---|",
      "| `pnpm test` | fail | TypeError: localStorage.clear is not a function |",
    ]);

    const index = buildFailureSignatures(repo);

    expect(index.signatures).toHaveLength(1);
    expect(index.signatures[0]).toMatchObject({
      command: "pnpm test",
      count: 2,
      normalized_failure: "localstorage.clear is not a function",
    });
  });

  it("does not index repeated runner-only summaries as failure signatures", () => {
    const repo = createRepoWithEvidence(0);
    writeEvidenceFile(repo, "first.md", [
      "| Command | Result | Notes |",
      "|---|---:|---|",
      "| `pnpm test` | fail | > declarion@0.1.0 test /repo > vitest run run v2.1.9 /repo |",
    ]);
    writeEvidenceFile(repo, "second.md", [
      "| Command | Result | Notes |",
      "|---|---:|---|",
      "| `pnpm test` | fail | > declarion@0.1.0 test /repo > vitest run run v2.1.9 /repo |",
    ]);

    const index = buildFailureSignatures(repo);

    expect(index.signatures).toHaveLength(0);
  });

  it("annotates matching failures without changing command results", () => {
    const repo = createRepoWithEvidence(0);
    writeEvidenceFile(repo, "first.md", [
      "| Command | Result | Notes |",
      "|---|---:|---|",
      "| `pnpm test` | fail | TypeError: localStorage.clear is not a function |",
    ]);
    writeFailureSignatures(repo);

    const annotations = annotateRepeatedFailures({
      cwd: repo,
      commandResults: [
        {
          command: "pnpm test",
          result: "fail",
          exitCode: 1,
          output: "TypeError: localStorage.clear is not a function",
        },
      ],
    });

    expect(annotations).toContainEqual(
      expect.objectContaining({
        command: "pnpm test",
        previousCount: 1,
      }),
    );
  });

  it("evidence writes refresh evidence and failure signature indexes", () => {
    const repo = createRepoWithEvidence(0);
    mkdirSync(join(repo, ".greenhouse", "grown"), { recursive: true });

    writeEvidence({
      cwd: repo,
      route: {
        mode: "patch",
        changedFiles: ["src/App.tsx"],
        risks: [],
        commands: [{ id: "test", command: "pnpm test", reason: "test" }],
        manualChecks: [],
        skippedValidation: null,
      },
      commandResults: [
        {
          command: "pnpm test",
          result: "fail",
          exitCode: 1,
          output: "TypeError: localStorage.clear is not a function",
        },
      ],
      noPrune: true,
    });

    expect(existsSync(join(repo, ".greenhouse", "grown", "evidence-index.yaml"))).toBe(
      true,
    );
    expect(
      existsSync(join(repo, ".greenhouse", "grown", "failure-signatures.yaml")),
    ).toBe(true);
  });
});

function createRepoWithEvidence(count: number): string {
  const repo = mkdtempSync(join(tmpdir(), "greenhouse-spec-evidence-"));
  tempRepos.push(repo);
  const evidencePath = join(repo, ".greenhouse", "evidence");
  mkdirSync(evidencePath, { recursive: true });

  for (let index = 0; index < count; index += 1) {
    writeTimedFile(join(evidencePath, `record-${index}.md`), index);
  }

  return repo;
}

function writeTimedFile(path: string, index: number): void {
  writeFileSync(path, `# ${index}\n`, "utf8");
  const time = new Date(2026, 0, 1, 0, 0, index);
  utimesSync(path, time, time);
}

function markdownFiles(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }
  return readdirSync(path).filter((file) => file.endsWith(".md")).sort();
}

function writeEvidenceFile(repo: string, name: string, lines: string[]): void {
  const evidencePath = join(repo, ".greenhouse", "evidence");
  mkdirSync(evidencePath, { recursive: true });
  writeFileSync(
    join(evidencePath, name),
    ["# Verification", "", "## Commands run", "", ...lines, ""].join("\n"),
    "utf8",
  );
}
