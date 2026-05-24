import type { Command } from "commander";

import { formatDoctorReport, runDoctor } from "../doctor/run-doctor.js";

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check that a .greenhouse configuration is internally consistent.")
    .option("--cwd <path>", "Repository root to inspect.", process.cwd())
    .option("--write-report", "Write a doctor report under .greenhouse/reports/doctor/.")
    .option("--no-prune", "Do not prune old generated evidence/report files after writing a doctor report.")
    .action((options: { cwd: string; writeReport?: boolean; prune?: boolean }) => {
      const report = runDoctor({
        cwd: options.cwd,
        writeReport: options.writeReport,
        noPrune: options.prune === false,
      });

      console.log(formatDoctorReport(report));

      if (!report.ok) {
        process.exitCode = 1;
      }
    });
}
