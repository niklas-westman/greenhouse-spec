import type { Command } from "commander";

import {
  formatAlignmentJsonReport,
  formatAlignmentReport,
  runAlignment,
} from "../alignment/run-alignment.js";

export function registerAlignmentCommand(program: Command): void {
  program
    .command("alignment")
    .description("Run read-only alignment checks against known example repositories.")
    .option("--repo <name...>", "Run only the named repo(s) or explicit repo path(s).")
    .option("--json", "Print a stable machine-readable alignment report.")
    .action((options: { repo?: string[]; json?: boolean }) => {
      const report = runAlignment({
        repos: options.repo,
      });

      console.log(
        options.json
          ? formatAlignmentJsonReport(report)
          : formatAlignmentReport(report),
      );

      if (!report.ok) {
        process.exitCode = 1;
      }
    });
}
