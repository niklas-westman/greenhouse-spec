import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { proposePackageScripts } from "../native-scripts/package-script-proposals.js";
import type { PlannedWrite } from "../filesystem/safe-write.js";

export function buildPackageScriptOnboardingWrites(cwd: string): PlannedWrite[] {
  const packageJsonPath = join(cwd, "package.json");

  if (!existsSync(packageJsonPath)) {
    return [];
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const proposals = proposePackageScripts(cwd).filter((proposal) =>
    ["add", "update"].includes(proposal.status),
  );

  if (proposals.length === 0) {
    return [];
  }

  packageJson.scripts = {
    ...(packageJson.scripts ?? {}),
  };

  for (const proposal of proposals) {
    packageJson.scripts[proposal.name] = proposal.command;
  }

  return [
    {
      relativePath: "package.json",
      content: `${JSON.stringify(packageJson, null, 2)}\n`,
      kind: "managed",
    },
  ];
}
