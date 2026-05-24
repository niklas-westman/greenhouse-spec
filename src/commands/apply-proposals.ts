import type { Command } from "commander";

import {
  applyProposals,
  formatApplyProposalsReport,
} from "../proposals/apply-proposals.js";

export function registerApplyProposalsCommand(program: Command): void {
  program
    .command("apply-proposals")
    .description("Apply safe structured Greenhouse proposals.")
    .option("--cwd <path>", "Repository root to update.", process.cwd())
    .option("--safe", "Apply only safe additive or managed proposal changes.")
    .option("--dry-run", "Show what would be changed without writing files.")
    .action((options: { cwd: string; safe?: boolean; dryRun?: boolean }) => {
      const report = applyProposals({
        cwd: options.cwd,
        dryRun: options.dryRun,
        safe: options.safe,
      });

      console.log(formatApplyProposalsReport(report));

      if (!report.ok) {
        process.exitCode = 1;
      }
    });
}
