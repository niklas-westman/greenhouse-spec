import type { Command } from "commander";

import { formatPlantReport, runPlant } from "../plant/run-plant.js";

export function registerPlantCommand(program: Command): void {
  program
    .command("plant")
    .description("Create the initial .greenhouse structure in a repository.")
    .option("--cwd <path>", "Repository root to install into.", process.cwd())
    .option("--dry-run", "Show what would be written without changing files.")
    .option("--force-authored", "Allow overwriting authored root files.")
    .action(
      (options: { cwd: string; dryRun?: boolean; forceAuthored?: boolean }) => {
        const report = runPlant({
          cwd: options.cwd,
          dryRun: options.dryRun,
          forceAuthored: options.forceAuthored,
        });

        console.log(formatPlantReport(report));

        if (!report.ok) {
          process.exitCode = 1;
        }
      },
    );
}
