import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import type { ValidationConfig } from "../schemas/validation.js";
import type {
  ValidationProposal,
  ValidationProposals,
} from "../schemas/validation-proposals.js";

import { readValidationProposals } from "./read-proposals.js";

export type ApplyProposalResult = {
  id: string;
  kind: string;
  status: "applied" | "conflict" | "dry-run" | "skipped";
  message: string;
};

export type ApplyProposalsReport = {
  cwd: string;
  ok: boolean;
  dryRun: boolean;
  results: ApplyProposalResult[];
};

export function applyProposals(options: {
  cwd: string;
  dryRun?: boolean;
  safe?: boolean;
}): ApplyProposalsReport {
  if (!options.safe) {
    return {
      cwd: options.cwd,
      ok: false,
      dryRun: Boolean(options.dryRun),
      results: [
        {
          id: "apply-proposals",
          kind: "guard",
          status: "skipped",
          message: "Refusing to apply proposals without --safe.",
        },
      ],
    };
  }

  const proposalIndex = readValidationProposals(options.cwd);
  const packageJson = readPackageJson(options.cwd);
  const validation = readValidation(options.cwd);
  const results: ApplyProposalResult[] = [];
  let packageJsonChanged = false;
  let validationChanged = false;

  for (const proposal of proposalIndex.proposals) {
    if (proposal.status !== "pending") {
      results.push({
        id: proposal.id,
        kind: proposal.kind,
        status: proposal.status === "conflict" ? "conflict" : "skipped",
        message: `Proposal is ${proposal.status}; no action taken.`,
      });
      continue;
    }

    if (proposal.kind === "package-script") {
      const result = applyPackageScriptProposal(packageJson, proposal, Boolean(options.dryRun));
      results.push(result);
      packageJsonChanged ||= result.status === "applied";
      proposal.status = result.status === "applied" ? "applied" : proposal.status;
      if (result.status === "conflict") {
        proposal.status = "conflict";
        proposal.reason = result.message;
      }
      continue;
    }

    const result = applyValidationRouteProposal(validation, proposal, Boolean(options.dryRun));
    results.push(result);
    validationChanged ||= result.status === "applied";
    proposal.status = result.status === "applied" ? "applied" : proposal.status;
    if (result.status === "conflict") {
      proposal.status = "conflict";
      proposal.reason = result.message;
    }
  }

  if (!options.dryRun) {
    if (packageJsonChanged) {
      writePackageJson(options.cwd, packageJson);
    }
    if (validationChanged) {
      writeValidation(options.cwd, validation);
    }
    if (packageJsonChanged || validationChanged || results.some((item) => item.status === "conflict")) {
      writeProposalIndex(options.cwd, proposalIndex);
    }
  }

  return {
    cwd: options.cwd,
    ok: true,
    dryRun: Boolean(options.dryRun),
    results,
  };
}

export function formatApplyProposalsReport(report: ApplyProposalsReport): string {
  const lines = [
    "# Greenhouse Apply Proposals Report",
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

function applyPackageScriptProposal(
  packageJson: { scripts?: Record<string, string>; [key: string]: unknown },
  proposal: Extract<ValidationProposal, { kind: "package-script" }>,
  dryRun: boolean,
): ApplyProposalResult {
  const scripts = packageJson.scripts ?? {};
  const existing = scripts[proposal.package_script.name];

  if (existing && existing !== proposal.package_script.existing_command) {
    return {
      id: proposal.id,
      kind: proposal.kind,
      status: "conflict",
      message: `Package script "${proposal.package_script.name}" changed since proposals were generated.`,
    };
  }

  if (existing && proposal.package_script.existing_command && existing !== proposal.package_script.existing_command) {
    return {
      id: proposal.id,
      kind: proposal.kind,
      status: "conflict",
      message: `Package script "${proposal.package_script.name}" has a conflicting command.`,
    };
  }

  if (dryRun) {
    return {
      id: proposal.id,
      kind: proposal.kind,
      status: "dry-run",
      message: `Would set package script "${proposal.package_script.name}".`,
    };
  }

  packageJson.scripts = {
    ...scripts,
    [proposal.package_script.name]: proposal.package_script.command,
  };

  return {
    id: proposal.id,
    kind: proposal.kind,
    status: "applied",
    message: `Set package script "${proposal.package_script.name}".`,
  };
}

function applyValidationRouteProposal(
  validation: ValidationConfig,
  proposal: Extract<ValidationProposal, { kind: "validation-route" }>,
  dryRun: boolean,
): ApplyProposalResult {
  const pattern = proposal.validation_route.pattern;
  const existing = validation.paths?.[pattern];

  if (existing && existing.managed_by !== "greenhouse-spec") {
    return {
      id: proposal.id,
      kind: proposal.kind,
      status: "conflict",
      message: `Path rule "${pattern}" exists and is human-owned.`,
    };
  }

  if (dryRun) {
    return {
      id: proposal.id,
      kind: proposal.kind,
      status: "dry-run",
      message: `Would ${existing ? "update" : "add"} managed path rule "${pattern}".`,
    };
  }

  validation.paths = {
    ...(validation.paths ?? {}),
    [pattern]: proposal.validation_route.rule,
  };

  return {
    id: proposal.id,
    kind: proposal.kind,
    status: "applied",
    message: `${existing ? "Updated" : "Added"} managed path rule "${pattern}".`,
  };
}

function readPackageJson(cwd: string): { scripts?: Record<string, string>; [key: string]: unknown } {
  const packageJsonPath = join(cwd, "package.json");
  if (!existsSync(packageJsonPath)) {
    return {};
  }
  return JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
    [key: string]: unknown;
  };
}

function writePackageJson(cwd: string, packageJson: unknown): void {
  writeFileSync(join(cwd, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
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
