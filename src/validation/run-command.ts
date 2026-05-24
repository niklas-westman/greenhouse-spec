import { spawnSync } from "node:child_process";

export type CommandExecutionResult = {
  command: string;
  result: "pass" | "fail" | "not_run";
  exitCode: number | null;
  output: string;
};

export function runValidationCommand(
  cwd: string,
  command: string,
): CommandExecutionResult {
  const result = spawnSync(command, {
    cwd,
    encoding: "utf8",
    shell: true,
  });
  const exitCode = result.status ?? 1;
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

  return {
    command,
    result: exitCode === 0 ? "pass" : "fail",
    exitCode,
    output,
  };
}
