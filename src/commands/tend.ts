import type { Command } from "commander";

import { formatTendReport, runTend } from "../tend/run-tend.js";

export function registerTendCommand(program: Command): void {
  program
    .command("tend")
    .description("Propose durable greenhouse updates after completed work.")
    .option("--cwd <path>", "Repository root to inspect.", process.cwd())
    .option("--check", "Fail when structural Greenhouse tending is required.")
    .action((options: { cwd: string; check?: boolean }) => {
      const report = runTend({
        cwd: options.cwd,
        check: options.check,
      });

      console.log(formatTendReport(report));

      if (!report.ok) {
        process.exitCode = 1;
      }
    });
}
