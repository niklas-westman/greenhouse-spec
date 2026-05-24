import { readValidationProposals } from "./read-proposals.js";

export type ProposalsReport = {
  cwd: string;
  ok: boolean;
  total: number;
  counts: Record<"adoptable" | "applied" | "conflict" | "pending" | "skipped", number>;
  proposals: Array<{
    id: string;
    kind: string;
    status: string;
    target: string;
    reason: string;
  }>;
};

export function runProposals(options: { cwd: string }): ProposalsReport {
  const index = readValidationProposals(options.cwd);
  const counts = {
    adoptable: 0,
    applied: 0,
    conflict: 0,
    pending: 0,
    skipped: 0,
  };

  for (const proposal of index.proposals) {
    counts[proposal.status] += 1;
  }

  return {
    cwd: options.cwd,
    ok: true,
    total: index.proposals.length,
    counts,
    proposals: index.proposals.map((proposal) => ({
      id: proposal.id,
      kind: proposal.kind,
      status: proposal.status,
      target: proposal.target.path,
      reason: proposal.reason,
    })),
  };
}

export function formatProposalsReport(report: ProposalsReport): string {
  const lines = [
    "# Greenhouse Proposals Report",
    "",
    `Repository: ${report.cwd}`,
    `Status: ${report.ok ? "pass" : "fail"}`,
    `Total: ${report.total}`,
    `Pending: ${report.counts.pending}`,
    `Adoptable: ${report.counts.adoptable}`,
    `Conflicts: ${report.counts.conflict}`,
    `Applied: ${report.counts.applied}`,
    `Skipped: ${report.counts.skipped}`,
    "",
    "## Proposals",
    "",
  ];

  if (report.proposals.length === 0) {
    lines.push("No proposals found.");
  } else {
    for (const proposal of report.proposals) {
      lines.push(
        `- ${proposal.status}: ${proposal.id} (${proposal.kind}, ${proposal.target}) - ${proposal.reason}`,
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}
