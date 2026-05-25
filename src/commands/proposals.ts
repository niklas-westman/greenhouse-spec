import type { Command } from "commander";

import {
  dismissProposals,
  formatDismissProposalsReport,
} from "../proposals/dismiss-proposals.js";
import { formatProposalsReport, runProposals } from "../proposals/run-proposals.js";

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

export function registerProposalsCommand(program: Command): void {
  const proposals = program
    .command("proposals")
    .description("List structured Greenhouse proposals.")
    .option("--cwd <path>", "Repository root to inspect.", process.cwd())
    .action((options: { cwd: string }) => {
      const report = runProposals({
        cwd: options.cwd,
      });

      console.log(formatProposalsReport(report));

      if (!report.ok) {
        process.exitCode = 1;
      }
    });

  proposals
    .command("dismiss")
    .description("Dismiss proposal noise through an authored decision ledger.")
    .option("--cwd <path>", "Repository root to update.", process.cwd())
    .option("--id <proposal-id>", "Dismiss a specific proposal id.", collect, [])
    .requiredOption("--reason <reason>", "Reason to record in proposal decisions.")
    .option("--dry-run", "Show what would be written without changing files.")
    .action(
      (options: {
        cwd: string;
        id: string[];
        reason: string;
        dryRun?: boolean;
      }) => {
        const report = dismissProposals({
          cwd: options.cwd,
          ids: options.id,
          reason: options.reason,
          dryRun: options.dryRun,
        });

        console.log(formatDismissProposalsReport(report));

        if (!report.ok) {
          process.exitCode = 1;
        }
      },
    );
}
