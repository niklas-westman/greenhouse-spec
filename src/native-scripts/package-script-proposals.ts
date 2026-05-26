import { readPackageJson } from "../discovery/package-json.js";

export type PackageScriptProposal = {
  name: string;
  command: string;
  status: "add" | "collision" | "update";
  existingCommand?: string;
};

const installedAliases: Array<{ name: string; args: string }> = [
  {
    name: "greenhouse",
    args: "",
  },
  {
    name: "greenhouse:status",
    args: "status",
  },
  {
    name: "greenhouse:tend",
    args: "tend",
  },
  {
    name: "greenhouse:tend:check",
    args: "tend --check",
  },
  {
    name: "greenhouse:verify:dry",
    args: "verify --changed --dry-run",
  },
  {
    name: "greenhouse:proposals",
    args: "proposals",
  },
];

const selfHostedAliases: Array<{ name: string; args: string }> = [
  {
    name: "greenhouse",
    args: "",
  },
  {
    name: "greenhouse:tend",
    args: "tend",
  },
  {
    name: "greenhouse:tend:check",
    args: "tend --check",
  },
  {
    name: "greenhouse:verify:dry",
    args: "verify --changed --dry-run",
  },
  {
    name: "greenhouse:proposals",
    args: "proposals",
  },
];

export function proposePackageScripts(cwd: string): PackageScriptProposal[] {
  const packageJson = readPackageJson(cwd);
  const scripts = packageJson?.scripts ?? {};
  const selfHosted = packageJson?.name === "greenhouse-spec";
  const legacyInstalled = !selfHosted && hasLegacyGreenhouseScripts(scripts);
  const sourceAliases = selfHosted
    ? selfHostedAliases
    : legacyInstalled
      ? []
      : installedAliases;
  const aliases = sourceAliases.map((alias) => ({
    name: alias.name,
    command: selfHosted
      ? selfHostedGreenhouseCommand(alias.args)
      : publishedGreenhouseCommand(alias.args),
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

  if (!legacyInstalled) {
    aliases.push({
      name: "prepush",
      command: "pnpm greenhouse:tend",
      bareCommand: "pnpm greenhouse:tend",
    });
  }

  for (const alias of aliases) {
    const existingCommand = scripts[alias.name];

    if (!existingCommand) {
      if (
        alias.name === "greenhouse:status" &&
        scripts.greenhouse &&
        isAcceptedGreenhouseAlias(scripts.greenhouse, "greenhouse-spec status")
      ) {
        continue;
      }
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

    if (
      alias.name === "greenhouse" &&
      isAcceptedGreenhouseAlias(existingCommand, "greenhouse-spec status")
    ) {
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

function hasLegacyGreenhouseScripts(scripts: Record<string, string>): boolean {
  return (
    Boolean(scripts["check:greenhouse"]) ||
    Boolean(scripts["check:tend"]) ||
    Boolean(scripts["check:changed:evidence"])
  );
}

export function greenhouseCommandForRepo(cwd: string, args = ""): string {
  const packageJson = readPackageJson(cwd);
  return packageJson?.name === "greenhouse-spec"
    ? selfHostedGreenhouseCommand(args)
    : publishedGreenhouseCommand(args);
}

function publishedGreenhouseCommand(args: string): string {
  const command = "greenhouse-spec";
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

  const publishedMatch = actualCommand.match(/^greenhouse-spec(?:\s+(.*))?$/);
  if (publishedMatch) {
    return isCompatibleGreenhouseArgs(publishedMatch[1]?.trim() ?? "", expectedArgs);
  }

  if (expectedArgs === "" && actualCommand === "pnpm build && node dist/cli.js") {
    return true;
  }

  const selfHostedMatch = actualCommand.match(/^pnpm greenhouse(?:\s+(.*))?$/);
  if (selfHostedMatch) {
    return isCompatibleGreenhouseArgs(selfHostedMatch[1]?.trim() ?? "", expectedArgs);
  }

  const localCliMatch = actualCommand.match(
    /^node\s+(?:"([^"]*greenhouse-spec\/dist\/cli\.js)"|'([^']*greenhouse-spec\/dist\/cli\.js)'|([^\s]*greenhouse-spec\/dist\/cli\.js))(?:\s+(.*))?$/,
  );

  if (!localCliMatch) {
    return false;
  }

  const actualArgs = localCliMatch[4]?.trim() ?? "";
  return isCompatibleGreenhouseArgs(actualArgs, expectedArgs);
}

function isCompatibleGreenhouseArgs(actualArgs: string, expectedArgs: string): boolean {
  return actualArgs === expectedArgs || (expectedArgs === "" && actualArgs === "status");
}

function isAcceptedPrepushAlias(actualCommand: string): boolean {
  const parts = actualCommand.split("&&").map((part) => part.trim());
  return (
    parts.includes("pnpm greenhouse:tend") ||
    (parts.includes("pnpm check:tend") && parts.includes("pnpm check:changed:evidence"))
  );
}
