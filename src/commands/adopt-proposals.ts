import type { Command } from "commander";

import {
  adoptProposals,
  formatAdoptProposalsReport,
} from "../proposals/adopt-proposals.js";

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

export function registerAdoptProposalsCommand(program: Command): void {
  program
    .command("adopt-proposals")
    .description("Adopt matching human-owned validation routes into Greenhouse ownership.")
    .option("--cwd <path>", "Repository root to update.", process.cwd())
    .option("--id <proposal-id>", "Adopt a specific proposal id.", collect, [])
    .option("--all-adoptable", "Adopt every currently adoptable proposal.")
    .option("--dry-run", "Show what would be changed without writing files.")
    .action(
      (options: {
        cwd: string;
        id: string[];
        allAdoptable?: boolean;
        dryRun?: boolean;
      }) => {
        const report = adoptProposals({
          cwd: options.cwd,
          ids: options.id,
          allAdoptable: options.allAdoptable,
          dryRun: options.dryRun,
        });

        console.log(formatAdoptProposalsReport(report));

        if (!report.ok) {
          process.exitCode = 1;
        }
      },
    );
}
