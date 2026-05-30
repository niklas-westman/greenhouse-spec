import type { Command } from "commander";

import {
  adoptSkillProposal,
  formatProposalLaneReport,
  proposeSkill,
} from "../proposal-lanes/memory-skill-proposals.js";

export function registerSkillsCommand(program: Command): void {
  const skills = program
    .command("skills")
    .description("Create and adopt repo-local Greenhouse skill proposals.");

  skills
    .command("propose")
    .description("Write a skill proposal into .greenhouse/skills/proposals/.")
    .option("--cwd <path>", "Repository root to update.", process.cwd())
    .requiredOption("--name <name>", "Skill name.")
    .requiredOption("--description <description>", "Short skill description.")
    .requiredOption("--body <markdown>", "Markdown body for the proposed skill.")
    .option("--dry-run", "Show what would be written without changing files.")
    .action(
      (options: {
        cwd: string;
        name: string;
        description: string;
        body: string;
        dryRun?: boolean;
      }) => {
        const report = proposeSkill({
          cwd: options.cwd,
          name: options.name,
          description: options.description,
          body: options.body,
          dryRun: options.dryRun,
        });
        console.log(formatProposalLaneReport(report));
      },
    );

  skills
    .command("adopt")
    .description("Adopt a skill proposal into .greenhouse/skills/adopted/.")
    .option("--cwd <path>", "Repository root to update.", process.cwd())
    .requiredOption("--proposal <path>", "Proposal markdown path to adopt.")
    .option("--name <name>", "Override adopted skill name.")
    .option("--dry-run", "Show what would be written without changing files.")
    .action(
      (options: {
        cwd: string;
        proposal: string;
        name?: string;
        dryRun?: boolean;
      }) => {
        const report = adoptSkillProposal({
          cwd: options.cwd,
          proposalPath: options.proposal,
          name: options.name,
          dryRun: options.dryRun,
        });
        console.log(formatProposalLaneReport(report));
        if (!report.ok) {
          process.exitCode = 1;
        }
      },
    );
}
