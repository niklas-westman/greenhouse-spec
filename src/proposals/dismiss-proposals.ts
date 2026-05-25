import {
  readProposalDecisions,
  writeProposalDecisions,
} from "./proposal-decisions.js";
import { readValidationProposals } from "./read-proposals.js";

export type DismissProposalResult = {
  id: string;
  status: "dismissed" | "dry-run" | "skipped";
  message: string;
};

export type DismissProposalsReport = {
  cwd: string;
  ok: boolean;
  dryRun: boolean;
  results: DismissProposalResult[];
};

export function dismissProposals(options: {
  cwd: string;
  ids: string[];
  reason: string;
  dryRun?: boolean;
}): DismissProposalsReport {
  if (options.ids.length === 0 || options.reason.trim().length === 0) {
    return {
      cwd: options.cwd,
      ok: false,
      dryRun: Boolean(options.dryRun),
      results: [
        {
          id: "dismiss-proposals",
          status: "skipped",
          message: "Provide --id <proposal-id> and --reason <reason>.",
        },
      ],
    };
  }

  const proposalIndex = readValidationProposals(options.cwd);
  const decisions = readProposalDecisions(options.cwd);
  const results: DismissProposalResult[] = [];

  for (const id of options.ids) {
    const proposal = proposalIndex.proposals.find((item) => item.id === id);
    if (!proposal) {
      results.push({
        id,
        status: "skipped",
        message: "No proposal found with this id.",
      });
      continue;
    }

    if (
      decisions.dismissed.some(
        (decision) => decision.idempotency_key === proposal.idempotency_key,
      )
    ) {
      results.push({
        id,
        status: "skipped",
        message: "Proposal is already dismissed.",
      });
      continue;
    }

    results.push({
      id,
      status: options.dryRun ? "dry-run" : "dismissed",
      message: options.dryRun
        ? `Would dismiss proposal ${id}.`
        : `Dismissed proposal ${id}.`,
    });

    if (!options.dryRun) {
      decisions.dismissed.push({
        id: proposal.id,
        idempotency_key: proposal.idempotency_key,
        reason: options.reason.trim(),
        decided_at: new Date().toISOString(),
      });
    }
  }

  if (!options.dryRun && results.some((result) => result.status === "dismissed")) {
    writeProposalDecisions(options.cwd, decisions);
  }

  return {
    cwd: options.cwd,
    ok: !results.some((result) => result.status === "skipped"),
    dryRun: Boolean(options.dryRun),
    results,
  };
}

export function formatDismissProposalsReport(report: DismissProposalsReport): string {
  const lines = [
    "# Greenhouse Dismiss Proposals Report",
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
      lines.push(`- ${result.status}: ${result.id} - ${result.message}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}
