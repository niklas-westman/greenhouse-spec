import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { runInspect, type InspectReport } from "../inspect/run-inspect.js";
import { greenhouseCommandForRepo } from "../native-scripts/package-script-proposals.js";
import { buildPackageScriptOnboardingWrites } from "./package-script-onboarding.js";
import {
  applySafeWrites,
  type PlannedWrite,
  type SafeWriteResult,
} from "../filesystem/safe-write.js";
import { findPackageRoot } from "../filesystem/package-root.js";
import { mvpInstalledTreePaths } from "../templates/installed-tree.js";
import {
  GREENHOUSE_INSTALL_MODE,
  GREENHOUSE_SPEC_VERSION,
  GREENHOUSE_TEMPLATE_VERSION,
} from "../version.js";

export type UpdateOptions = {
  cwd: string;
  dryRun?: boolean;
};

export type UpdateReport = {
  cwd: string;
  ok: boolean;
  dryRun: boolean;
  inspect: InspectReport;
  writes: SafeWriteResult[];
};

const packageRoot = findPackageRoot(import.meta.url);
const templateRoot = join(packageRoot, "templates", "installed");

export function runUpdate(options: UpdateOptions): UpdateReport {
  const inspect = runInspect({ cwd: options.cwd, dryRun: options.dryRun });
  const writes = applySafeWrites({
    cwd: options.cwd,
    dryRun: options.dryRun,
    writes: buildUpdateWrites(options.cwd),
  });

  return {
    cwd: options.cwd,
    ok: inspect.ok && writes.every((write) => write.status !== "blocked"),
    dryRun: Boolean(options.dryRun),
    inspect,
    writes,
  };
}

export function formatUpdateReport(report: UpdateReport): string {
  const lines = [
    "# Greenhouse Update Report",
    "",
    `Repository: ${report.cwd}`,
    `Mode: ${report.dryRun ? "dry-run" : "write"}`,
    `Status: ${report.ok ? "pass" : "blocked"}`,
    "",
    "## Generated Intelligence",
    "",
  ];

  for (const write of report.inspect.writes) {
    const reason = write.reason ? ` - ${write.reason}` : "";
    lines.push(`- ${write.status}: ${write.relativePath}${reason}`);
  }

  lines.push("", "## Managed Install Files", "");
  if (report.writes.length === 0) {
    lines.push("- none");
  } else {
    for (const write of report.writes) {
      const reason = write.reason ? ` - ${write.reason}` : "";
      lines.push(`- ${write.status}: ${write.relativePath}${reason}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function buildUpdateWrites(cwd: string): PlannedWrite[] {
  const writes: PlannedWrite[] = [];
  const projectWrite = projectMetadataWrite(cwd);

  if (projectWrite) {
    writes.push(projectWrite);
  }

  writes.push(...buildPackageScriptOnboardingWrites(cwd));

  for (const path of mvpInstalledTreePaths) {
    if (path.startsWith("why-greenhouse-spec/")) {
      const installedPath = join(cwd, ".greenhouse", path);
      if (!existsSync(installedPath)) {
        writes.push({
          relativePath: `.greenhouse/${path}`,
          content: readFileSync(join(templateRoot, path), "utf8"),
          kind: "authored",
        });
      }
      continue;
    }

    if (!path.startsWith("scripts/") && !path.startsWith("templates/")) {
      continue;
    }

    writes.push({
      relativePath: `.greenhouse/${path}`,
      content: readFileSync(join(templateRoot, path), "utf8"),
      kind: "generated",
      executable: path.startsWith("scripts/"),
    });
  }

  return writes;
}

function projectMetadataWrite(cwd: string): PlannedWrite | null {
  const path = join(cwd, ".greenhouse", "project.yaml");
  if (!existsSync(path)) {
    return null;
  }

  const project = parseYaml(readFileSync(path, "utf8")) as Record<string, any>;
  project.greenhouse = {
    ...(project.greenhouse ?? {}),
    installed_version: GREENHOUSE_SPEC_VERSION,
    template_version: GREENHOUSE_TEMPLATE_VERSION,
    install_mode: GREENHOUSE_INSTALL_MODE,
    cli_command: greenhouseCommandForRepo(cwd),
    last_updated_at: new Date().toISOString(),
  };

  return {
    relativePath: ".greenhouse/project.yaml",
    content: stringifyYaml(project, { lineWidth: 0 }),
    kind: "generated",
  };
}
