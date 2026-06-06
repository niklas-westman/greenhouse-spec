import { spawnSync } from "node:child_process";

import type { CommandCapabilities } from "../schemas/common.js";

export type CommandExecutionResult = {
  command: string;
  result: "pass" | "fail" | "not_run";
  exitCode: number | null;
  output: string;
  failureKind?: "environment-permission" | "environment-port" | "command-failure";
  failureHint?: string;
};

export function runValidationCommand(
  cwd: string,
  command: string,
  options: { capabilities?: CommandCapabilities } = {},
): CommandExecutionResult {
  const result = spawnSync(command, {
    cwd,
    encoding: "utf8",
    shell: true,
  });
  const exitCode = result.status ?? 1;
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  const failure = exitCode === 0
    ? {}
    : classifyFailure(output, options.capabilities);

  return {
    command,
    result: exitCode === 0 ? "pass" : "fail",
    exitCode,
    output,
    ...failure,
  };
}

function classifyFailure(
  output: string,
  capabilities: CommandCapabilities | undefined,
): Pick<CommandExecutionResult, "failureKind" | "failureHint"> {
  const normalized = output.toLowerCase();

  if (
    capabilities?.requires_local_server &&
    normalized.includes("listen eperm")
  ) {
    return {
      failureKind: "environment-permission",
      failureHint:
        "Local server command failed while binding a port; this is likely an environment permission boundary.",
    };
  }

  if (
    capabilities?.requires_local_server &&
    (normalized.includes("eaddrinuse") || normalized.includes("address already in use"))
  ) {
    return {
      failureKind: "environment-port",
      failureHint:
        "Local server command failed because the requested port was already in use.",
    };
  }

  return {
    failureKind: "command-failure",
  };
}
