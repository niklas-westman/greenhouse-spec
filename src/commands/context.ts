import type { Command } from "commander";

import {
  formatContextJson,
  formatContextReport,
  runContext,
} from "../context/run-context.js";

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

export function registerContextCommand(program: Command): void {
  program
    .command("context")
    .description("Compile a Greenhouse context brief for an agent task.")
    .argument("<task>", "Task description to compile context for.")
    .option("--cwd <path>", "Repository root to inspect.", process.cwd())
    .option("--json", "Print the context brief as JSON.")
    .option("--semantic", "Include optional source-backed semantic index candidates when enabled.")
    .option("--write-report", "Write a Markdown context report under .greenhouse/reports/context/.")
    .option("--path <path>", "Changed or relevant path to route manifest entries.", collect, [])
    .option("--risk <risk>", "Known risk label to route manifest entries.", collect, [])
    .action(
      (
        task: string,
        options: {
          cwd: string;
          json?: boolean;
          semantic?: boolean;
          writeReport?: boolean;
          path: string[];
          risk: string[];
        },
      ) => {
        const report = runContext({
          cwd: options.cwd,
          task,
          json: options.json,
          semantic: options.semantic,
          writeReport: options.writeReport,
          paths: options.path,
          risks: options.risk,
        });

        console.log(options.json ? formatContextJson(report) : formatContextReport(report));
      },
    );
}
