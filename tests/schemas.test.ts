import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { commandIndexSchema } from "../src/schemas/command-index.js";
import { contextManifestSchema } from "../src/schemas/context-manifest.js";
import { evidenceSchema } from "../src/schemas/evidence.js";
import { parseYamlWithSchema } from "../src/schemas/common.js";
import { projectSchema } from "../src/schemas/project.js";
import { repoMapSchema } from "../src/schemas/repo-map.js";
import { repoShapeSchema } from "../src/schemas/repo-shape.js";
import { validationSchema } from "../src/schemas/validation.js";
import { validationProposalsSchema } from "../src/schemas/validation-proposals.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = join(testDirectory, "fixtures", "schemas");

function readFixture(name: string): string {
  return readFileSync(join(fixtureDirectory, name), "utf8");
}

describe("greenhouse schemas", () => {
  it("validates project.yaml", () => {
    const project = parseYamlWithSchema(
      readFixture("project.valid.yaml"),
      projectSchema,
    );

    expect(project.repo.name).toBe("declarion");
    expect(project.greenhouse.folder).toBe(".greenhouse");
  });

  it("rejects invalid project.yaml", () => {
    expect(() =>
      parseYamlWithSchema(readFixture("project.invalid.yaml"), projectSchema),
    ).toThrow();
  });

  it("validates roots/validation.yaml with mode, path, risk, and blocked rules", () => {
    const validation = parseYamlWithSchema(
      readFixture("validation.valid.yaml"),
      validationSchema,
    );

    expect(validation.modes?.guarded.required).toHaveLength(3);
    expect(validation.paths?.["src/engine/sru/**"].mode).toBe("guarded");
    expect(validation.risks?.["financial-calculation"].mode).toBe("guarded");
  });

  it("validates grown repo-map.yaml", () => {
    const repoMap = parseYamlWithSchema(
      readFixture("repo-map.valid.yaml"),
      repoMapSchema,
    );

    expect(repoMap.source[0]?.path).toBe("src/");
  });

  it("validates grown command-index.yaml", () => {
    const commandIndex = parseYamlWithSchema(
      readFixture("command-index.valid.yaml"),
      commandIndexSchema,
    );

    expect(commandIndex.commands[0]?.command).toBe("pnpm check");
  });

  it("validates grown repo-shape.yaml", () => {
    const repoShape = parseYamlWithSchema(
      readFixture("repo-shape.valid.yaml"),
      repoShapeSchema,
    );

    expect(repoShape.shape).toContain("workspace");
    expect(repoShape.java_modules[0]?.commands.test).toBe(
      "cd backend-java-serverless && mvn test",
    );
  });

  it("validates grown validation-proposals.yaml", () => {
    const proposals = parseYamlWithSchema(
      readFixture("validation-proposals.valid.yaml"),
      validationProposalsSchema,
    );

    expect(proposals.proposals.map((proposal) => proposal.kind)).toEqual([
      "package-script",
      "validation-route",
    ]);
  });

  it("validates context manifest activation modes", () => {
    const manifest = parseYamlWithSchema(
      readFixture("context-manifest.valid.yaml"),
      contextManifestSchema,
    );

    expect(manifest.context.map((entry) => entry.activation.mode)).toEqual([
      "always",
      "risk",
      "keyword",
      "path",
    ]);
  });

  it("rejects incomplete context activation", () => {
    expect(() =>
      parseYamlWithSchema(
        readFixture("context-manifest.invalid.yaml"),
        contextManifestSchema,
      ),
    ).toThrow();
  });

  it("validates structured evidence data", () => {
    const evidence = parseYamlWithSchema(
      readFixture("evidence.valid.yaml"),
      evidenceSchema,
    );

    expect(evidence.change_mode).toBe("patch");
    expect(evidence.commands[0]?.result).toBe("pass");
  });
});
