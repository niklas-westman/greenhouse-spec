import type { Command } from "commander";

import { formatUpdateReport, runUpdate } from "../lifecycle/run-update.js";

export function registerUpdateCommand(program: Command): void {
  program
    .command("update")
    .description("Refresh generated repo intelligence for guide/check/proof.")
    .option("--cwd <path>", "Repository root to update.", process.cwd())
    .option("--dry-run", "Show what would be updated without changing files.")
    .action((options: { cwd: string; dryRun?: boolean }) => {
      const report = runUpdate({ cwd: options.cwd, dryRun: options.dryRun });

      console.log(formatUpdateReport(report));

      if (!report.ok) {
        process.exitCode = 1;
      }
    });
}
