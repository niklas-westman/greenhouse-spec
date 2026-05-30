#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

import { registerAlignmentCommand } from "./commands/alignment.js";
import { registerEvidenceCommand } from "./commands/evidence.js";
import { registerInitCommand } from "./commands/init.js";
import { registerAdoptProposalsCommand } from "./commands/adopt-proposals.js";
import { registerApplyProposalsCommand } from "./commands/apply-proposals.js";
import { registerContextCommand } from "./commands/context.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerInspectCommand } from "./commands/inspect.js";
import { registerPlantCommand } from "./commands/plant.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerProposalsCommand } from "./commands/proposals.js";
import { registerTendCommand } from "./commands/tend.js";
import { registerUpdateCommand } from "./commands/update.js";
import { registerVerifyCommand } from "./commands/verify.js";
import { GREENHOUSE_SPEC_VERSION } from "./version.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("greenhouse-spec")
    .description("Install and maintain repo-local AI agent context.")
    .version(GREENHOUSE_SPEC_VERSION);

  registerInitCommand(program);
  registerAlignmentCommand(program);
  registerPlantCommand(program);
  registerUpdateCommand(program);
  registerStatusCommand(program);
  registerDoctorCommand(program);
  registerInspectCommand(program);
  registerContextCommand(program);
  registerVerifyCommand(program);
  registerProposalsCommand(program);
  registerAdoptProposalsCommand(program);
  registerApplyProposalsCommand(program);
  registerTendCommand(program);
  registerEvidenceCommand(program);

  return program;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}

export function isDirectCliExecution(
  moduleUrl: string = import.meta.url,
  argvPath: string | undefined = process.argv[1],
): boolean {
  if (!argvPath) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argvPath);
  } catch {
    return false;
  }
}

if (isDirectCliExecution()) {
  await main();
}
