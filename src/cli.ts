#!/usr/bin/env node
import { Command } from "commander";

import { registerAdoptProposalsCommand } from "./commands/adopt-proposals.js";
import { registerApplyProposalsCommand } from "./commands/apply-proposals.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerInspectCommand } from "./commands/inspect.js";
import { registerPlantCommand } from "./commands/plant.js";
import { registerProposalsCommand } from "./commands/proposals.js";
import { registerTendCommand } from "./commands/tend.js";
import { registerVerifyCommand } from "./commands/verify.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("greenhouse-spec")
    .description("Install and maintain repo-local AI agent context.")
    .version("0.1.0");

  registerPlantCommand(program);
  registerDoctorCommand(program);
  registerInspectCommand(program);
  registerVerifyCommand(program);
  registerProposalsCommand(program);
  registerAdoptProposalsCommand(program);
  registerApplyProposalsCommand(program);
  registerTendCommand(program);

  return program;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
