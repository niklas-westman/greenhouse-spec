import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { proposePackageScripts } from "../native-scripts/package-script-proposals.js";
import type { PlannedWrite } from "../filesystem/safe-write.js";
import { GREENHOUSE_SPEC_VERSION } from "../version.js";

export function buildPackageScriptOnboardingWrites(cwd: string): PlannedWrite[] {
  const packageJsonPath = join(cwd, "package.json");

  if (!existsSync(packageJsonPath)) {
    return [];
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    name?: string;
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const selfHosted = packageJson.name === "greenhouse-spec";
  const proposals = proposePackageScripts(cwd).filter((proposal) =>
    ["add", "update"].includes(proposal.status),
  );
  const shouldAddDependency =
    !selfHosted && !hasGreenhouseDependency(packageJson);

  if (proposals.length === 0 && !shouldAddDependency) {
    return [];
  }

  packageJson.scripts = {
    ...(packageJson.scripts ?? {}),
  };
  packageJson.devDependencies = {
    ...(packageJson.devDependencies ?? {}),
  };

  for (const proposal of proposals) {
    packageJson.scripts[proposal.name] = proposal.command;
  }

  if (shouldAddDependency) {
    packageJson.devDependencies["greenhouse-spec"] = `^${GREENHOUSE_SPEC_VERSION}`;
  }

  return [
    {
      relativePath: "package.json",
      content: `${JSON.stringify(packageJson, null, 2)}\n`,
      kind: "managed",
    },
  ];
}

function hasGreenhouseDependency(packageJson: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}): boolean {
  return Boolean(
    packageJson.dependencies?.["greenhouse-spec"] ??
      packageJson.devDependencies?.["greenhouse-spec"],
  );
}
