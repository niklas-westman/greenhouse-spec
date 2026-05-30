import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  adoptMemoryProposal,
  adoptSkillProposal,
  formatProposalLaneReport,
  proposeMemory,
  proposeSkill,
} from "../src/proposal-lanes/memory-skill-proposals.js";
import { runPlant } from "../src/plant/run-plant.js";

const tempRepos: string[] = [];

afterEach(() => {
  for (const repo of tempRepos.splice(0)) {
    rmSync(repo, { recursive: true, force: true });
  }
});

describe("memory and skill proposal lanes", () => {
  it("writes and adopts a memory proposal", () => {
    const repo = createRepo();

    const proposeReport = proposeMemory({
      cwd: repo,
      title: "Navigation Rule",
      memoryType: "decision",
      body: "Keep navigation keyboard-accessible.",
    });
    const proposalPath = proposeReport.writes[0]?.path ?? "";
    const adoptReport = adoptMemoryProposal({
      cwd: repo,
      proposalPath,
    });
    const adoptedPath = join(repo, ".greenhouse", "memory", "decisions", "navigation-rule.md");

    expect(proposeReport.ok).toBe(true);
    expect(existsSync(join(repo, proposalPath))).toBe(true);
    expect(adoptReport.ok).toBe(true);
    expect(existsSync(adoptedPath)).toBe(true);
    expect(readFileSync(adoptedPath, "utf8")).toContain("status: adopted");
    expect(readFileSync(join(repo, proposalPath), "utf8")).toContain("adopted_path");
  });

  it("writes and adopts a skill proposal", () => {
    const repo = createRepo();

    const proposeReport = proposeSkill({
      cwd: repo,
      name: "Accessibility Review",
      description: "Review keyboard and focus behavior.",
      body: "Check navigation states.",
    });
    const proposalPath = proposeReport.writes[0]?.path ?? "";
    const adoptReport = adoptSkillProposal({
      cwd: repo,
      proposalPath,
    });
    const adoptedPath = join(
      repo,
      ".greenhouse",
      "skills",
      "adopted",
      "accessibility-review",
      "SKILL.md",
    );

    expect(proposeReport.ok).toBe(true);
    expect(adoptReport.ok).toBe(true);
    expect(existsSync(adoptedPath)).toBe(true);
    expect(readFileSync(adoptedPath, "utf8")).toContain("status: adopted");
  });

  it("supports dry-run without writing files", () => {
    const repo = createRepo();

    const report = proposeMemory({
      cwd: repo,
      title: "Dry Run Memory",
      memoryType: "lesson",
      body: "No write.",
      dryRun: true,
    });
    const output = formatProposalLaneReport(report);

    expect(report.ok).toBe(true);
    expect(output).toContain("Mode: dry-run");
    expect(existsSync(join(repo, report.writes[0]?.path ?? ""))).toBe(false);
  });

  it("does not overwrite an adopted target", () => {
    const repo = createRepo();
    const proposal = proposeMemory({
      cwd: repo,
      title: "Existing Memory",
      memoryType: "decision",
      body: "First.",
    });
    writeFileSync(
      join(repo, ".greenhouse", "memory", "decisions", "existing-memory.md"),
      "# Existing\n",
      "utf8",
    );

    const report = adoptMemoryProposal({
      cwd: repo,
      proposalPath: proposal.writes[0]?.path ?? "",
    });

    expect(report.ok).toBe(false);
    expect(report.message).toContain("already exists");
  });
});

function createRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "greenhouse-spec-proposal-lanes-"));
  tempRepos.push(repo);
  writeFileSync(join(repo, "README.md"), "# Proposal lane fixture\n", "utf8");
  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify(
      {
        name: "proposal-lane-fixture",
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
