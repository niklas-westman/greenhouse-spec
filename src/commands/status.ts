import type { Command } from "commander";

import { formatStatusReport, runStatus } from "../status/run-status.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show one read-only Greenhouse health report.")
    .option("--cwd <path>", "Repository root to inspect.", process.cwd())
    .action((options: { cwd: string }) => {
      const report = runStatus({ cwd: options.cwd });

      console.log(formatStatusReport(report));

      if (!report.ok) {
        process.exitCode = 1;
      }
    });
}
