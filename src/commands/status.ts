import type { Command } from "commander";

import {
  formatStatusJsonReport,
  formatStatusReport,
  runStatus,
} from "../status/run-status.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show one read-only Greenhouse health report.")
    .option("--cwd <path>", "Repository root to inspect.", process.cwd())
    .option("--json", "Print a stable machine-readable status report.")
    .action((options: { cwd: string; json?: boolean }) => {
      const report = runStatus({ cwd: options.cwd });

      console.log(
        options.json ? formatStatusJsonReport(report) : formatStatusReport(report),
      );

      if (!report.ok) {
        process.exitCode = 1;
      }
    });
}
