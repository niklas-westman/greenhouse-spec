import type { Command } from "commander";

import { formatInspectReport, runInspect } from "../inspect/run-inspect.js";

export function registerInspectCommand(program: Command): void {
  program
    .command("inspect")
    .description("Refresh generated repo knowledge under .greenhouse/grown/.")
    .option("--cwd <path>", "Repository root to inspect.", process.cwd())
    .option("--dry-run", "Show grown file updates without changing files.")
    .action((options: { cwd: string; dryRun?: boolean }) => {
      const report = runInspect({
        cwd: options.cwd,
        dryRun: options.dryRun,
      });

      console.log(formatInspectReport(report));

      if (!report.ok) {
        process.exitCode = 1;
      }
    });
}
