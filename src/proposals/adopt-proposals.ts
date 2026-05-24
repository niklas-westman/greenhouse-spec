import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import type { ValidationConfig } from "../schemas/validation.js";
import type {
  ValidationProposal,
  ValidationProposals,
} from "../schemas/validation-proposals.js";

import { equivalentValidationRule } from "./build-proposals.js";
import { readValidationProposals } from "./read-proposals.js";

type AdoptableRouteProposal = Extract<ValidationProposal, { kind: "validation-route" }> & {
  status: "adoptable";
};

export type AdoptProposalResult = {
  id: string;
  kind: string;
  status: "adopted" | "conflict" | "dry-run" | "skipped";
  message: string;
};

export type AdoptProposalsReport = {
  cwd: string;
  ok: boolean;
  dryRun: boolean;
  results: AdoptProposalResult[];
};

export function adoptProposals(options: {
  cwd: string;
  ids?: string[];
  allAdoptable?: boolean;
  dryRun?: boolean;
}): AdoptProposalsReport {
  const selectedIds = new Set(options.ids ?? []);

  if (!options.allAdoptable && selectedIds.size === 0) {
    return {
      cwd: options.cwd,
      ok: false,
      dryRun: Boolean(options.dryRun),
      results: [
        {
          id: "adopt-proposals",
          kind: "guard",
          status: "skipped",
          message: "Provide --id <proposal-id> or --all-adoptable.",
        },
      ],
    };
  }

  const proposalIndex = readValidationProposals(options.cwd);
  const validation = readValidation(options.cwd);
  const results: AdoptProposalResult[] = [];
  let validationChanged = false;
  let proposalIndexChanged = false;

  for (const proposal of proposalIndex.proposals) {
    if (!isSelected(proposal, selectedIds, Boolean(options.allAdoptable))) {
      continue;
    }

    if (proposal.kind !== "validation-route") {
      results.push({
        id: proposal.id,
        kind: proposal.kind,
        status: "skipped",
        message: "Only validation-route proposals can be adopted.",
      });
      continue;
    }

    if (!isAdoptableRouteProposal(proposal)) {
      results.push({
        id: proposal.id,
        kind: proposal.kind,
        status: proposal.status === "conflict" ? "conflict" : "skipped",
        message: `Proposal is ${proposal.status}; only adoptable proposals can be adopted.`,
      });
      continue;
    }

    const result = adoptValidationRoute(validation, proposal, Boolean(options.dryRun));
    results.push(result);

    if (result.status === "adopted") {
      validationChanged = true;
      proposalIndexChanged = true;
      (proposal as ValidationProposal).status = "applied";
      proposal.reason = `Adopted existing path rule "${proposal.validation_route.pattern}".`;
    } else if (result.status === "conflict") {
      proposalIndexChanged = true;
      (proposal as ValidationProposal).status = "conflict";
      proposal.reason = result.message;
    }
  }

  for (const requestedId of selectedIds) {
    if (!proposalIndex.proposals.some((proposal) => proposal.id === requestedId)) {
      results.push({
        id: requestedId,
        kind: "unknown",
        status: "skipped",
        message: "No proposal found with this id.",
      });
    }
  }

  if (!options.dryRun) {
    if (validationChanged) {
      writeValidation(options.cwd, validation);
    }
    if (proposalIndexChanged) {
      writeProposalIndex(options.cwd, proposalIndex);
    }
  }

  return {
    cwd: options.cwd,
    ok: !results.some((result) => result.status === "conflict"),
    dryRun: Boolean(options.dryRun),
    results,
  };
}

export function formatAdoptProposalsReport(report: AdoptProposalsReport): string {
  const lines = [
    "# Greenhouse Adopt Proposals Report",
    "",
    `Repository: ${report.cwd}`,
    `Mode: ${report.dryRun ? "dry-run" : "write"}`,
    `Status: ${report.ok ? "pass" : "fail"}`,
    "",
    "## Results",
    "",
  ];

  if (report.results.length === 0) {
    lines.push("- none");
  } else {
    for (const result of report.results) {
      lines.push(`- ${result.status}: ${result.id} (${result.kind}) - ${result.message}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function isSelected(
  proposal: ValidationProposal,
  selectedIds: Set<string>,
  allAdoptable: boolean,
): boolean {
  return selectedIds.has(proposal.id) || (allAdoptable && proposal.status === "adoptable");
}

function isAdoptableRouteProposal(
  proposal: ValidationProposal,
): proposal is AdoptableRouteProposal {
  return proposal.kind === "validation-route" && proposal.status === "adoptable";
}

function adoptValidationRoute(
  validation: ValidationConfig,
  proposal: AdoptableRouteProposal,
  dryRun: boolean,
): AdoptProposalResult {
  const pattern = proposal.validation_route.pattern;
  const existingRule = validation.paths?.[pattern];

  if (!existingRule) {
    return {
      id: proposal.id,
      kind: proposal.kind,
      status: "conflict",
      message: `Path rule "${pattern}" no longer exists.`,
    };
  }

  if (existingRule.managed_by === "greenhouse-spec") {
    return {
      id: proposal.id,
      kind: proposal.kind,
      status: "skipped",
      message: `Path rule "${pattern}" is already managed by Greenhouse.`,
    };
  }

  if (!equivalentValidationRule(existingRule, proposal.validation_route.rule)) {
    return {
      id: proposal.id,
      kind: proposal.kind,
      status: "conflict",
      message: `Path rule "${pattern}" changed since proposals were generated.`,
    };
  }

  if (dryRun) {
    return {
      id: proposal.id,
      kind: proposal.kind,
      status: "dry-run",
      message: `Would adopt existing path rule "${pattern}".`,
    };
  }

  validation.paths = {
    ...(validation.paths ?? {}),
    [pattern]: {
      ...existingRule,
      managed_by: "greenhouse-spec",
      origin: "repo-shape",
      proposal_id: proposal.id,
      confidence: proposal.confidence,
    },
  };

  return {
    id: proposal.id,
    kind: proposal.kind,
    status: "adopted",
    message: `Adopted existing path rule "${pattern}".`,
  };
}

function readValidation(cwd: string): ValidationConfig {
  const validationPath = join(cwd, ".greenhouse", "roots", "validation.yaml");
  if (!existsSync(validationPath)) {
    return {
      schema_version: 1,
      paths: {},
    };
  }
  return parseYaml(readFileSync(validationPath, "utf8")) as ValidationConfig;
}

function writeValidation(cwd: string, validation: ValidationConfig): void {
  writeFileSync(
    join(cwd, ".greenhouse", "roots", "validation.yaml"),
    stringifyYaml(validation, { lineWidth: 0 }),
    "utf8",
  );
}

function writeProposalIndex(cwd: string, proposalIndex: ValidationProposals): void {
  writeFileSync(
    join(cwd, ".greenhouse", "grown", "validation-proposals.yaml"),
    stringifyYaml(
      {
        ...proposalIndex,
        generated_at: new Date().toISOString(),
      },
      { lineWidth: 0 },
    ),
    "utf8",
  );
}
