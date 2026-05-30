import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseYamlWithSchema } from "../src/schemas/common.js";
import { contextManifestSchema } from "../src/schemas/context-manifest.js";
import { evidenceIndexSchema } from "../src/schemas/evidence-index.js";
import { memoryIndexSchema, skillIndexSchema } from "../src/schemas/knowledge-index.js";
import { projectSchema } from "../src/schemas/project.js";
import { commandIndexSchema } from "../src/schemas/command-index.js";
import { repoMapSchema } from "../src/schemas/repo-map.js";
import { validationSchema } from "../src/schemas/validation.js";
import {
  mvpInstalledDirectories,
  mvpInstalledTreePaths,
} from "../src/templates/installed-tree.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDirectory, "..");
const templateRoot = join(repoRoot, "templates", "installed");

function readTemplate(path: string): string {
  return readFileSync(join(templateRoot, path), "utf8");
}

describe("installed templates", () => {
  it("documents the architecture ownership contract", () => {
    const contract = readFileSync(
      join(repoRoot, "docs", "architecture-contract.md"),
      "utf8",
    );

    expect(contract).toContain(".greenhouse/grown/**");
    expect(contract).toContain("pending");
    expect(contract).toContain("adoptable");
    expect(contract).toContain("conflict");
    expect(contract).toContain("tend --check");
  });

  it("ships the AI-facing docs map", () => {
    const expectedDocs = [
      "README.md",
      "architecture.md",
      "architecture-contract.md",
      "installation.md",
      "commands.md",
      "proposals.md",
      "validation-routing.md",
      "operating-playbook.md",
    ];

    for (const path of expectedDocs) {
      expect(existsSync(join(repoRoot, "docs", path)), path).toBe(true);
    }

    const docsIndex = readFileSync(join(repoRoot, "docs", "README.md"), "utf8");

    expect(docsIndex).toContain("Read Order For AI Agents");
    expect(docsIndex).toContain("Installation");
    expect(docsIndex).toContain("Validation Routing");
  });

  it("declares the MVP directories plant must create", () => {
    expect(mvpInstalledDirectories).toEqual([
      "roots",
      "why-greenhouse-spec",
      "grown",
      "context",
      "memory",
      "memory/decisions",
      "memory/lessons",
      "memory/playbooks",
      "memory/references",
      "memory/projects",
      "memory/inbox",
      "skills",
      "skills/adopted",
      "skills/drafts",
      "skills/proposals",
      "proposals",
      "scripts",
      "evidence",
      "templates",
      "reports",
      "reports/context",
      "reports/doctor",
    ]);
  });

  it("ships every MVP template file", () => {
    for (const path of mvpInstalledTreePaths) {
      expect(existsSync(join(templateRoot, path)), path).toBe(true);
    }
  });

  it("ships schema-valid YAML templates", () => {
    expect(() =>
      parseYamlWithSchema(readTemplate("project.yaml"), projectSchema),
    ).not.toThrow();
    expect(() =>
      parseYamlWithSchema(readTemplate("roots/validation.yaml"), validationSchema),
    ).not.toThrow();
    expect(() =>
      parseYamlWithSchema(readTemplate("grown/repo-map.yaml"), repoMapSchema),
    ).not.toThrow();
    expect(() =>
      parseYamlWithSchema(
        readTemplate("grown/command-index.yaml"),
        commandIndexSchema,
      ),
    ).not.toThrow();
    expect(() =>
      parseYamlWithSchema(
        readTemplate("grown/evidence-index.yaml"),
        evidenceIndexSchema,
      ),
    ).not.toThrow();
    expect(() =>
      parseYamlWithSchema(
        readTemplate("grown/memory-index.yaml"),
        memoryIndexSchema,
      ),
    ).not.toThrow();
    expect(() =>
      parseYamlWithSchema(
        readTemplate("grown/skill-index.yaml"),
        skillIndexSchema,
      ),
    ).not.toThrow();
    expect(() =>
      parseYamlWithSchema(
        readTemplate("context/manifest.yaml"),
        contextManifestSchema,
      ),
    ).not.toThrow();
  });

  it("ships evidence and verification markdown templates", () => {
    expect(readTemplate("templates/evidence.md")).toContain("# Verification:");
    expect(readTemplate("templates/verification.md")).toContain(
      "## Commands selected",
    );
  });

  it("ships installed purpose and tree documentation", () => {
    expect(readTemplate("why-greenhouse-spec/README.md")).toContain(
      "Greenhouse Spec is a repo-local tending layer",
    );
    expect(readTemplate("why-greenhouse-spec/tree-structure.md")).toContain(
      ".greenhouse/",
    );
    expect(readTemplate("memory/README.md")).toContain("Repo-local memory");
    expect(readTemplate("skills/README.md")).toContain("Repo-local skills");
    expect(readTemplate("why-greenhouse-spec/agent-workflow.md")).toContain(
      "greenhouse-spec tend",
    );
  });
});
