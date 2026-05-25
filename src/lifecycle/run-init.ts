import { discoverRepoShape } from "../discovery/repo-shape.js";
import { buildValidationProposals } from "../proposals/build-proposals.js";
import { formatPlantReport, runPlant, type PlantReport } from "../plant/run-plant.js";

export type InitOptions = {
  cwd: string;
  dryRun?: boolean;
  forceAuthored?: boolean;
};

export type InitReport = {
  cwd: string;
  ok: boolean;
  dryRun: boolean;
  plant: PlantReport;
  proposalCount: number;
  blockingProposalCount: number;
};

export function runInit(options: InitOptions): InitReport {
  const plant = runPlant(options);
  const proposals = buildValidationProposals({
    cwd: options.cwd,
    repoShape: discoverRepoShape(options.cwd),
  }).proposals;

  return {
    cwd: options.cwd,
    ok: plant.ok,
    dryRun: Boolean(options.dryRun),
    plant,
    proposalCount: proposals.length,
    blockingProposalCount: proposals.filter((proposal) =>
      ["pending", "adoptable", "conflict"].includes(proposal.status),
    ).length,
  };
}

export function formatInitReport(report: InitReport): string {
  const lines = [
    "# Greenhouse Init Report",
    "",
    `Repository: ${report.cwd}`,
    `Mode: ${report.dryRun ? "dry-run" : "write"}`,
    `Status: ${report.ok ? "pass" : "blocked"}`,
    `Structured proposals: ${report.proposalCount} total, ${report.blockingProposalCount} needing review`,
    "",
    "## Install Plan",
    "",
    formatPlantReport(report.plant).trim(),
    "",
    "## Next Commands",
    "",
    "- greenhouse-spec status",
    "- greenhouse-spec inspect",
    "- greenhouse-spec proposals",
    "- greenhouse-spec apply-proposals --safe --dry-run",
    "- greenhouse-spec apply-proposals --safe",
    "- greenhouse-spec tend",
    "",
  ];

  return lines.join("\n");
}
