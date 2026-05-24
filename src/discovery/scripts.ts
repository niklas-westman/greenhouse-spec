import type { CommandIndex } from "../schemas/command-index.js";
import type { Confidence } from "../schemas/common.js";

import { detectPackageManager } from "./package-manager.js";
import { readPackageJson } from "./package-json.js";

const purposeByScriptName: Record<string, string> = {
  build: "production build",
  check: "full local validation",
  "cli:build": "CLI build",
  "format:check": "format validation",
  lint: "lint validation",
  test: "test suite",
  "test:cli": "CLI smoke validation",
  typecheck: "TypeScript validation",
};

export function discoverCommandIndex(cwd: string): CommandIndex {
  const packageJson = readPackageJson(cwd);
  const packageManager = detectPackageManager(cwd);
  const scripts = packageJson?.scripts ?? {};
  const commandPrefix = packageManager ?? "npm";

  return {
    schema_version: 1,
    managed_by: "greenhouse-spec",
    generated_at: new Date().toISOString(),
    package_manager: packageManager,
    commands: Object.entries(scripts).map(([id, script]) => ({
      id,
      command: `${commandPrefix} ${packageManager === "npm" ? "run " : ""}${id}`,
      source: "package.json",
      purpose: purposeByScriptName[id] ?? `package script: ${script}`,
      confidence: confidenceForScript(id),
    })),
  };
}

function confidenceForScript(id: string): Confidence {
  return purposeByScriptName[id] ? "high" : "medium";
}
