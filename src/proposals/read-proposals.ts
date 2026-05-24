import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseYamlWithSchema } from "../schemas/common.js";
import {
  validationProposalsSchema,
  type ValidationProposals,
} from "../schemas/validation-proposals.js";

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
