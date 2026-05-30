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

import { buildMemoryIndex, buildSkillIndex } from "../src/context/knowledge-index.js";
import {
  formatContextJson,
  formatContextReport,
  runContext,
} from "../src/context/run-context.js";
import { runInspect } from "../src/inspect/run-inspect.js";
import { runPlant } from "../src/plant/run-plant.js";

const tempRepos: string[] = [];

afterEach(() => {
  for (const repo of tempRepos.splice(0)) {
    rmSync(repo, { recursive: true, force: true });
  }
});

describe("context", () => {
  it("indexes repo-local memory and skills from Markdown", () => {
    const repo = createContextRepo();

    const memoryIndex = buildMemoryIndex(repo);
    const skillIndex = buildSkillIndex(repo);

    expect(memoryIndex.memories).toContainEqual(
      expect.objectContaining({
        id: "memory.navigation.accessibility",
        memory_type: "decision",
        status: "adopted",
      }),
    );
    expect(skillIndex.skills).toContainEqual(
      expect.objectContaining({
        id: "skill.adopted.accessibility.review",
        status: "adopted",
      }),
    );
  });

  it("writes generated memory and skill indexes during inspect", () => {
    const repo = createContextRepo();

    const report = runInspect({ cwd: repo });

    expect(report.ok).toBe(true);
    expect(readGreenhouseYaml(repo, "grown/memory-index.yaml").memories).toHaveLength(1);
    expect(readGreenhouseYaml(repo, "grown/skill-index.yaml").skills).toHaveLength(1);
  });

  it("compiles Markdown, JSON, and report output for a task", () => {
    const repo = createContextRepo();
    runInspect({ cwd: repo });

    const report = runContext({
      cwd: repo,
      task: "Improve navigation keyboard focus",
      paths: ["src/navigation/menu.tsx"],
      writeReport: true,
    });
    const markdown = formatContextReport(report);
    const json = JSON.parse(formatContextJson(report)) as { sources: Array<{ id: string }> };

    expect(report.sources.map((source) => source.id)).toEqual(
      expect.arrayContaining([
        "navigation-rule",
        "memory.navigation.accessibility",
        "skill.adopted.accessibility.review",
      ]),
    );
    expect(markdown).toContain("# Greenhouse Context Brief");
    expect(markdown).toContain("## Relevant Memory");
    expect(json.sources.map((source) => source.id)).toContain(
      "memory.navigation.accessibility",
    );
    expect(report.writtenReportPath).toMatch(/\.greenhouse\/reports\/context\/.+-context\.md$/);
    expect(existsSync(report.writtenReportPath ?? "")).toBe(true);
  });
});

function createContextRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "greenhouse-spec-context-"));
  tempRepos.push(repo);
  writeFileSync(join(repo, "README.md"), "# Context fixture\n", "utf8");
  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify(
      {
        name: "context-fixture",
        type: "module",
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
  mkdirSync(join(repo, ".greenhouse", "memory", "decisions"), { recursive: true });
  mkdirSync(join(repo, ".greenhouse", "skills", "adopted", "accessibility-review"), {
    recursive: true,
  });
  writeFileSync(
    join(repo, ".greenhouse", "memory", "decisions", "navigation-accessibility.md"),
    [
      "---",
      "id: memory.navigation.accessibility",
      "status: adopted",
      "memory_type: decision",
      "keywords:",
      "  - navigation",
      "  - keyboard",
      "---",
      "# Navigation Accessibility",
      "",
      "Navigation changes must preserve keyboard focus order.",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(repo, ".greenhouse", "skills", "adopted", "accessibility-review", "SKILL.md"),
    [
      "---",
      "id: skill.adopted.accessibility.review",
      "name: Accessibility Review",
      "description: Review navigation, keyboard, and focus behavior.",
      "status: adopted",
      "keywords:",
      "  - keyboard",
      "  - focus",
      "---",
      "# Accessibility Review",
      "",
      "Check keyboard navigation and focus states.",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(repo, ".greenhouse", "context", "manifest.yaml"),
    [
      "schema_version: 1",
      "context:",
      "  - id: navigation-rule",
      "    kind: memory",
      "    memory_type: decision",
      "    path: .greenhouse/memory/decisions/navigation-accessibility.md",
      "    activation:",
      "      mode: path",
      "      paths:",
      "        - src/navigation/**",
      "    budget:",
      "      max_tokens: 600",
      "",
    ].join("\n"),
    "utf8",
  );
  return repo;
}

function readGreenhouseYaml(repo: string, relativePath: string): any {
  return parseYaml(readFileSync(join(repo, ".greenhouse", relativePath), "utf8"));
}
