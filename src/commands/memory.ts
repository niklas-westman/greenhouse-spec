import type { Command } from "commander";

import {
  adoptMemoryProposal,
  formatProposalLaneReport,
  proposeMemory,
} from "../proposal-lanes/memory-skill-proposals.js";
import type { MemoryType } from "../schemas/context-manifest.js";

export function registerMemoryCommand(program: Command): void {
  const memory = program
    .command("memory")
    .description("Create and adopt repo-local Greenhouse memory proposals.");

  memory
    .command("propose")
    .description("Write a memory proposal into .greenhouse/proposals/.")
    .option("--cwd <path>", "Repository root to update.", process.cwd())
    .requiredOption("--title <title>", "Memory proposal title.")
    .requiredOption("--type <type>", "Memory type: decision, lesson, playbook, reference, project, inbox, or other.")
    .requiredOption("--body <markdown>", "Markdown body for the proposal.")
    .option("--dry-run", "Show what would be written without changing files.")
    .action(
      (options: {
        cwd: string;
        title: string;
        type: string;
        body: string;
        dryRun?: boolean;
      }) => {
        const report = proposeMemory({
          cwd: options.cwd,
          title: options.title,
          memoryType: parseMemoryType(options.type),
          body: options.body,
          dryRun: options.dryRun,
        });
        console.log(formatProposalLaneReport(report));
      },
    );

  memory
    .command("adopt")
    .description("Adopt a memory proposal into .greenhouse/memory/.")
    .option("--cwd <path>", "Repository root to update.", process.cwd())
    .requiredOption("--proposal <path>", "Proposal markdown path to adopt.")
    .option("--type <type>", "Override memory type for the adopted memory.")
    .option("--dry-run", "Show what would be written without changing files.")
    .action(
      (options: {
        cwd: string;
        proposal: string;
        type?: string;
        dryRun?: boolean;
      }) => {
        const report = adoptMemoryProposal({
          cwd: options.cwd,
          proposalPath: options.proposal,
          memoryType: options.type ? parseMemoryType(options.type) : undefined,
          dryRun: options.dryRun,
        });
        console.log(formatProposalLaneReport(report));
        if (!report.ok) {
          process.exitCode = 1;
        }
      },
    );
}

function parseMemoryType(value: string): MemoryType {
  if (
    ["decision", "lesson", "playbook", "reference", "project", "inbox", "other"].includes(
      value,
    )
  ) {
    return value as MemoryType;
  }
  throw new Error(`Unsupported memory type: ${value}`);
}
