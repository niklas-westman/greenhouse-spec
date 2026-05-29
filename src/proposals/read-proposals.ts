import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { stringify as stringifyYaml } from "yaml";

import { discoverRepoShape } from "../discovery/repo-shape.js";
import { parseYamlWithSchema } from "../schemas/common.js";
import {
  validationProposalsSchema,
  type ValidationProposals,
} from "../schemas/validation-proposals.js";
import { buildValidationProposals } from "./build-proposals.js";

export function readValidationProposals(cwd: string): ValidationProposals {
  const proposalsPath = join(cwd, ".greenhouse", "grown", "validation-proposals.yaml");

  if (!existsSync(proposalsPath)) {
    return {
      schema_version: 1,
      managed_by: "greenhouse-spec",
      generated_at: new Date().toISOString(),
      proposals: [],
    };
  }

  return parseYamlWithSchema(
    readFileSync(proposalsPath, "utf8"),
    validationProposalsSchema,
  );
}

export function refreshValidationProposals(
  cwd: string,
  options: { write?: boolean } = {},
): ValidationProposals {
  const proposals = buildValidationProposals({
    cwd,
    repoShape: discoverRepoShape(cwd),
  });

  if (options.write) {
    const proposalsPath = join(cwd, ".greenhouse", "grown", "validation-proposals.yaml");
    mkdirSync(join(cwd, ".greenhouse", "grown"), { recursive: true });
    writeFileSync(
      proposalsPath,
      stringifyYaml(
        {
          ...proposals,
          generated_at: new Date().toISOString(),
        },
        { lineWidth: 0 },
      ),
      "utf8",
    );
  }

  return proposals;
}
