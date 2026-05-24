import type { Command } from "commander";

import { formatProposalsReport, runProposals } from "../proposals/run-proposals.js";

export function registerProposalsCommand(program: Command): void {
  program
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
}
