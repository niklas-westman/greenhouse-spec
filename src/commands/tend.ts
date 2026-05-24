import type { Command } from "commander";

import { formatTendReport, runTend } from "../tend/run-tend.js";

export function registerTendCommand(program: Command): void {
  program
    .command("tend")
    .description("Propose durable greenhouse updates after completed work.")
    .option("--cwd <path>", "Repository root to inspect.", process.cwd())
    .option("--check", "Fail when structural Greenhouse tending is required.")
    .option("--no-prune", "Do not prune old generated evidence/report files after writing a tend report.")
    .action((options: { cwd: string; check?: boolean; prune?: boolean }) => {
      const report = runTend({
        cwd: options.cwd,
        check: options.check,
        noPrune: options.prune === false,
      });

      console.log(formatTendReport(report));

      if (!report.ok) {
        process.exitCode = 1;
      }
    });
}
