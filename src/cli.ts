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
import { registerMemoryCommand } from "./commands/memory.js";
import { registerPlantCommand } from "./commands/plant.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerProposalsCommand } from "./commands/proposals.js";
import { registerSkillsCommand } from "./commands/skills.js";
import { registerTendCommand } from "./commands/tend.js";
import { registerUpdateCommand } from "./commands/update.js";
import { registerVerifyCommand } from "./commands/verify.js";
import { GREENHOUSE_SPEC_VERSION } from "./version.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("greenhouse-spec")
    .description("Repo-local guide, checks, and proof for AI-assisted work.")
    .version(GREENHOUSE_SPEC_VERSION);

  registerStatusCommand(program);
  registerContextCommand(program);
  registerTendCommand(program);
  registerInitCommand(program);
  registerUpdateCommand(program);

  registerVerifyCommand(program);
  registerInspectCommand(program);
  registerProposalsCommand(program);
  registerApplyProposalsCommand(program);
  registerAdoptProposalsCommand(program);
  registerDoctorCommand(program);
  registerMemoryCommand(program);
  registerSkillsCommand(program);
  registerEvidenceCommand(program);
  registerPlantCommand(program);
  registerAlignmentCommand(program);

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
