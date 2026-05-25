import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import {
  proposalDecisionsSchema,
  type ProposalDecisions,
} from "../schemas/proposal-decisions.js";
import { parseYamlWithSchema } from "../schemas/common.js";

export const proposalDecisionsRelativePath =
  ".greenhouse/roots/proposal-decisions.yaml";

export function readProposalDecisions(cwd: string): ProposalDecisions {
  const path = decisionsPath(cwd);
  if (!existsSync(path)) {
    return emptyProposalDecisions();
  }

  return parseYamlWithSchema(readFileSync(path, "utf8"), proposalDecisionsSchema);
}

export function writeProposalDecisions(
  cwd: string,
  decisions: ProposalDecisions,
): void {
  const path = decisionsPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    stringifyYaml(
      {
        schema_version: 1,
        dismissed: decisions.dismissed,
      },
      { lineWidth: 0 },
    ),
    "utf8",
  );
}

export function emptyProposalDecisions(): ProposalDecisions {
  return {
    schema_version: 1,
    dismissed: [],
  };
}

export function isDismissed(
  decisions: ProposalDecisions,
  idempotencyKey: string,
): boolean {
  return decisions.dismissed.some(
    (decision) => decision.idempotency_key === idempotencyKey,
  );
}

function decisionsPath(cwd: string): string {
  return join(cwd, proposalDecisionsRelativePath);
}
