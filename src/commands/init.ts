import type { Command } from "commander";

import { formatInitReport, runInit } from "../lifecycle/run-init.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize Greenhouse in a repository.")
    .option("--cwd <path>", "Repository root to initialize.", process.cwd())
    .option("--dry-run", "Show what would be written without changing files.")
    .option("--force-authored", "Allow overwriting authored root files.")
    .action(
      (options: { cwd: string; dryRun?: boolean; forceAuthored?: boolean }) => {
        const report = runInit({
          cwd: options.cwd,
          dryRun: options.dryRun,
          forceAuthored: options.forceAuthored,
        });

        console.log(formatInitReport(report));

        if (!report.ok) {
          process.exitCode = 1;
        }
      },
    );
}
