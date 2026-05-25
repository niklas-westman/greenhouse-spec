import { describe, expect, it } from "vitest";

import { detectChangeImpact } from "../src/impact/detect-change-impact.js";
import type { RepoShape } from "../src/schemas/repo-shape.js";

describe("change-impact detection", () => {
  it("warns when package scripts may stale docs and validation roots", () => {
    const warnings = detectChangeImpact({
      changedFiles: ["package.json"],
    });

    expect(warnings).toContainEqual(
      expect.objectContaining({
        id: "impact.package-scripts-docs",
        severity: "warning",
        kind: "documentation-drift",
        resolution: expect.stringContaining("Review affected setup/validation docs"),
        affected: expect.arrayContaining([
          "README.md",
          "docs/setup.md",
          ".greenhouse/roots/validation.yaml",
        ]),
      }),
    );
  });

  it("uses docs ownership roots for package script drift targets", () => {
    const warnings = detectChangeImpact({
      changedFiles: ["package.json"],
      docsRoot: {
        schema_version: 1,
        tracked_docs: [
          {
            path: "docs/setup.md",
            owns: ["setup", "package-scripts"],
          },
          {
            path: "docs/validation.md",
            owns: ["validation"],
          },
        ],
      },
    });

    expect(warnings).toContainEqual(
      expect.objectContaining({
        id: "impact.package-scripts-docs",
        affected: expect.arrayContaining([
          "docs/setup.md",
          "docs/validation.md",
          ".greenhouse/roots/validation.yaml",
        ]),
      }),
    );
  });

  it("keeps CLI documentation drift advisory", () => {
    const warnings = detectChangeImpact({
      changedFiles: ["src/cli/main.ts"],
    });

    expect(warnings).toContainEqual(
      expect.objectContaining({
        id: "impact.cli-docs",
        severity: "advisory",
        resolution: expect.stringContaining("Review affected CLI docs"),
      }),
    );
  });

  it("treats API specs as guarded generated-output drift", () => {
    const warnings = detectChangeImpact({
      changedFiles: ["backend/src/main/resources/api.yaml"],
    });

    expect(warnings).toContainEqual(
      expect.objectContaining({
        id: "impact.api-spec-generated",
        severity: "guarded",
        kind: "generated-output-drift",
        resolution: expect.stringContaining("Regenerate or review generated API outputs"),
      }),
    );
  });

  it("flags non-Greenhouse generated output edits from repo shape", () => {
    const warnings = detectChangeImpact({
      changedFiles: ["src/generated/client.ts"],
      repoShape: repoShape({
        generated: [
          {
            path: "src/generated/",
            reason: "Generated source output",
            confidence: "medium",
          },
        ],
      }),
    });

    expect(warnings).toContainEqual(
      expect.objectContaining({
        id: "impact.generated-boundary",
        severity: "guarded",
        kind: "generated-boundary",
        resolution: expect.stringContaining("Regenerate from the source generator"),
      }),
    );
  });

  it("does not treat Greenhouse generated artifacts as generated boundary risk", () => {
    const warnings = detectChangeImpact({
      changedFiles: [".greenhouse/evidence/record.md"],
      repoShape: repoShape({
        generated: [
          {
            path: ".greenhouse/evidence/",
            reason: "Greenhouse generated validation evidence",
            confidence: "high",
          },
        ],
      }),
    });

    expect(warnings).toEqual([]);
  });
});

function repoShape(overrides: Partial<RepoShape> = {}): RepoShape {
  return {
    schema_version: 1,
    managed_by: "greenhouse-spec",
    generated_at: "2026-05-25T00:00:00.000Z",
    confidence: "high",
    shape: ["single-package"],
    package_manager: "pnpm",
    packages: [],
    java_modules: [],
    rust_modules: [],
    generated: [],
    gaps: [],
    ...overrides,
  };
}
