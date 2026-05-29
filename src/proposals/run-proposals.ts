import { refreshValidationProposals } from "./read-proposals.js";

export type ProposalsReport = {
  cwd: string;
  ok: boolean;
  total: number;
  counts: Record<"adoptable" | "applied" | "conflict" | "pending" | "skipped", number>;
  proposals: Array<{
    id: string;
    idempotencyKey: string;
    kind: string;
    status: string;
    target: string;
    reason: string;
    preconditions: string[];
    collision?: string;
  }>;
};

export function runProposals(options: { cwd: string }): ProposalsReport {
  const index = refreshValidationProposals(options.cwd, { write: true });
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
      idempotencyKey: proposal.idempotency_key,
      kind: proposal.kind,
      status: proposal.status,
      target: proposal.target.path,
      reason: proposal.reason,
      preconditions: proposal.preconditions,
      collision: proposal.collision?.explanation,
    })),
  };
}

export function formatProposalsReport(report: ProposalsReport): string {
  const groups = [
    ["pending", "Pending"],
    ["adoptable", "Adoptable"],
    ["conflict", "Conflicts"],
    ["applied", "Applied"],
    ["skipped", "Skipped"],
  ] as const;
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
  ];

  if (report.proposals.length === 0) {
    lines.push("## Proposals", "", "No proposals found.");
  } else {
    for (const [status, heading] of groups) {
      const proposals = report.proposals.filter(
        (proposal) => proposal.status === status,
      );
      lines.push(`## ${heading}`, "");
      if (proposals.length === 0) {
        lines.push("- none");
      } else {
        for (const proposal of proposals) {
          lines.push(
            `- ${proposal.id} (${proposal.kind}, ${proposal.target}) - ${proposal.reason}`,
          );
          lines.push(`  - idempotency: ${proposal.idempotencyKey}`);
          if (proposal.preconditions.length > 0) {
            lines.push(`  - preconditions: ${proposal.preconditions.join("; ")}`);
          }
          if (proposal.collision) {
            lines.push(`  - collision: ${proposal.collision}`);
          }
          if (proposal.status === "skipped") {
            lines.push(
              "  - decision ledger: .greenhouse/roots/proposal-decisions.yaml",
            );
          }
        }
      }
      lines.push("");
    }
  }

  lines.push("");
  return lines.join("\n");
}
