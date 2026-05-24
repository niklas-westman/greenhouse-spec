import type { Command } from "commander";

import { writeEvidenceIndex } from "../evidence/evidence-index.js";
import { writeFailureSignatures } from "../evidence/failure-signatures.js";
import {
  formatPruneGeneratedRecordsReport,
  pruneGeneratedRecords,
} from "../evidence/prune.js";

export function registerEvidenceCommand(program: Command): void {
  const evidence = program
    .command("evidence")
    .description("Manage generated Greenhouse evidence and reports.");

  evidence
    .command("prune")
    .description("Prune old generated evidence/report markdown files.")
    .option("--cwd <path>", "Repository root to prune.", process.cwd())
    .option("--dry-run", "Show files that would be deleted without deleting them.")
    .option("--keep <count>", "Number of latest markdown files to keep per folder.", parseKeep)
    .action((options: { cwd: string; dryRun?: boolean; keep?: number }) => {
      const report = pruneGeneratedRecords({
        cwd: options.cwd,
        dryRun: options.dryRun,
        keep: options.keep,
      });

      if (!options.dryRun) {
        writeEvidenceIndex(options.cwd);
        writeFailureSignatures(options.cwd);
      }

      console.log(formatPruneGeneratedRecordsReport(report));
    });
}

function parseKeep(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error("--keep must be a positive integer");
  }
  return parsed;
}
