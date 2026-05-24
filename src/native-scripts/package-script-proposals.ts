import { relative } from "node:path";

import { findPackageRoot } from "../filesystem/package-root.js";
import { readPackageJson } from "../discovery/package-json.js";

export type PackageScriptProposal = {
  name: string;
  command: string;
  status: "add" | "collision" | "update";
  existingCommand?: string;
};

const baseAliases: Array<{ name: string; args: string }> = [
  {
    name: "greenhouse",
    args: "",
  },
  {
    name: "check:greenhouse",
    args: "doctor",
  },
  {
    name: "check:changed",
    args: "verify --changed",
  },
  {
    name: "check:changed:evidence",
    args: "verify --changed --write-evidence",
  },
  {
    name: "validate:scope",
    args: "verify --paths",
  },
  {
    name: "tend",
    args: "tend",
  },
  {
    name: "check:tend",
    args: "tend --check",
  },
];

export function proposePackageScripts(cwd: string): PackageScriptProposal[] {
  const packageJson = readPackageJson(cwd);
  const scripts = packageJson?.scripts ?? {};
  const selfHosted = packageJson?.name === "greenhouse-spec";
  const aliases = baseAliases.map((alias) => ({
    name: alias.name,
    command: selfHosted
      ? selfHostedGreenhouseCommand(alias.args)
      : localGreenhouseCommand(cwd, alias.args),
    bareCommand: alias.args ? `greenhouse-spec ${alias.args}` : "greenhouse-spec",
  }));
  const proposals: PackageScriptProposal[] = [];

  if (scripts["cli:build"] && scripts["test:cli"]) {
    aliases.push({
      name: "validate:cli",
      command: "pnpm cli:build && pnpm test:cli",
      bareCommand: "pnpm cli:build && pnpm test:cli",
    });
  }

  aliases.push({
    name: "prepush",
    command: "pnpm check:tend && pnpm check:changed:evidence",
    bareCommand: "pnpm check:tend && pnpm check:changed:evidence",
  });

  for (const alias of aliases) {
    const existingCommand = scripts[alias.name];

    if (!existingCommand) {
      proposals.push({
        name: alias.name,
        command: alias.command,
        status: "add",
      });
      continue;
    }

    if (existingCommand === alias.command) {
      continue;
    }

    if (alias.name === "prepush" && isAcceptedPrepushAlias(existingCommand)) {
      continue;
    }

    if (isAcceptedGreenhouseAlias(existingCommand, alias.bareCommand)) {
      proposals.push({
        name: alias.name,
        command: alias.command,
        status: "update",
        existingCommand,
      });
      continue;
    }

    if (!isAcceptedGreenhouseAlias(existingCommand, alias.bareCommand)) {
      proposals.push({
        name: alias.name,
        command: alias.command,
        status: "collision",
        existingCommand,
      });
    }
  }

  return proposals;
}

export function greenhouseCommandForRepo(cwd: string, args = ""): string {
  const packageJson = readPackageJson(cwd);
  return packageJson?.name === "greenhouse-spec"
    ? selfHostedGreenhouseCommand(args)
    : localGreenhouseCommand(cwd, args);
}

function localGreenhouseCommand(cwd: string, args: string): string {
  const packageRoot = findPackageRoot(import.meta.url);
  const cliPath = relative(cwd, `${packageRoot}/dist/cli.js`).replace(/\\/g, "/");
  const command = `node ${shellQuotePath(cliPath)}`;
  return args ? `${command} ${args}` : command;
}

function selfHostedGreenhouseCommand(args: string): string {
  return args ? `pnpm greenhouse ${args}` : "pnpm build && node dist/cli.js";
}

export function isAcceptedGreenhouseAlias(
  actualCommand: string,
  expectedCommand: string,
): boolean {
  if (actualCommand === expectedCommand) {
    return true;
  }

  const expectedArgs = expectedCommand.replace(/^greenhouse-spec\s*/, "").trim();

  if (expectedArgs === "" && actualCommand === "pnpm build && node dist/cli.js") {
    return true;
  }

  const selfHostedMatch = actualCommand.match(/^pnpm greenhouse(?:\s+(.*))?$/);
  if (selfHostedMatch) {
    return (selfHostedMatch[1]?.trim() ?? "") === expectedArgs;
  }

  const localCliMatch = actualCommand.match(
    /^node\s+(?:"([^"]*greenhouse-spec\/dist\/cli\.js)"|'([^']*greenhouse-spec\/dist\/cli\.js)'|([^\s]*greenhouse-spec\/dist\/cli\.js))(?:\s+(.*))?$/,
  );

  if (!localCliMatch) {
    return false;
  }

  const actualArgs = localCliMatch[4]?.trim() ?? "";
  return actualArgs === expectedArgs;
}

function shellQuotePath(path: string): string {
  if (!/[\s"'`$\\]/.test(path)) {
    return path;
  }

  return JSON.stringify(path);
}

function isAcceptedPrepushAlias(actualCommand: string): boolean {
  const parts = actualCommand.split("&&").map((part) => part.trim());
  return parts.includes("pnpm check:tend") && parts.includes("pnpm check:changed:evidence");
}
