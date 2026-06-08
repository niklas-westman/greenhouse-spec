import type { Command } from "commander";

import { formatVerifyReport, runVerify } from "../verify/run-verify.js";

export function registerVerifyCommand(program: Command): void {
  program
    .command("verify")
    .description("Debug check selection or run validation directly.")
    .option("--cwd <path>", "Repository root to verify.", process.cwd())
    .option("--changed", "Verify currently changed files.")
    .option("--mode <mode>", "Force validation mode.")
    .option("--env <environment>", "Select validation environment: local, ci, or all.", "local")
    .option("--paths <paths...>", "Verify specific paths.")
    .option("--dry-run", "Explain selected validation without running commands.")
    .option("--write-evidence", "Write verification evidence.")
    .option("--ack <ids...>", "Record manual review acknowledgement IDs in written evidence.")
    .option("--no-prune", "Do not prune old generated evidence/report files after writing evidence.")
    .action(
      (options: {
        cwd: string;
        changed?: boolean;
        dryRun?: boolean;
        mode?: string;
        env?: "local" | "ci" | "all";
        paths?: string[];
        writeEvidence?: boolean;
        ack?: string[];
        prune?: boolean;
      }) => {
        const report = runVerify({
          cwd: options.cwd,
          changed: options.changed,
          dryRun: options.dryRun,
          mode: options.mode,
          environment: options.env,
          paths: options.paths,
          writeEvidence: options.writeEvidence,
          acknowledgements: options.ack,
          noPrune: options.prune === false,
        });

        console.log(formatVerifyReport(report));

        if (!report.ok) {
          process.exitCode = 1;
        }
      },
    );
}
