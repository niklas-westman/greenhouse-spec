export type ChangedFileCategory =
  | "agent-instructions"
  | "greenhouse-authored"
  | "greenhouse-generated"
  | "product-source"
  | "repo-config";

export type ChangedFileClassification = {
  all: string[];
  routeFiles: string[];
  groups: Record<ChangedFileCategory, string[]>;
};

const emptyGroups = (): Record<ChangedFileCategory, string[]> => ({
  "agent-instructions": [],
  "greenhouse-authored": [],
  "greenhouse-generated": [],
  "product-source": [],
  "repo-config": [],
});

export function classifyChangedFiles(files: string[]): ChangedFileClassification {
  const groups = emptyGroups();

  for (const file of files) {
    groups[classifyChangedFile(file)].push(file);
  }

  return {
    all: files,
    routeFiles: [
      ...groups["product-source"],
      ...groups["repo-config"],
      ...groups["agent-instructions"],
      ...groups["greenhouse-authored"],
    ],
    groups,
  };
}

export function classifyChangedFile(file: string): ChangedFileCategory {
  if (
    file === "AGENTS.md" ||
    file === "CLAUDE.md" ||
    file.startsWith(".cursor/rules/")
  ) {
    return "agent-instructions";
  }

  if (
    file.startsWith(".greenhouse/grown/") ||
    file.startsWith(".greenhouse/evidence/") ||
    file.startsWith(".greenhouse/reports/") ||
    file === ".greenhouse/grown" ||
    file === ".greenhouse/evidence" ||
    file === ".greenhouse/reports" ||
    file === ".greenhouse/"
  ) {
    return "greenhouse-generated";
  }

  if (
    file === ".greenhouse/project.yaml" ||
    file.startsWith(".greenhouse/roots/") ||
    file === ".greenhouse/context/manifest.yaml" ||
    file.startsWith(".greenhouse/scripts/") ||
    file.startsWith(".greenhouse/templates/")
  ) {
    return "greenhouse-authored";
  }

  if (
    file === "package.json" ||
    file === "pnpm-lock.yaml" ||
    file === "package-lock.json" ||
    file === "yarn.lock" ||
    file.startsWith("tsconfig") ||
    file.startsWith("vite.config") ||
    file.startsWith(".github/")
  ) {
    return "repo-config";
  }

  return "product-source";
}
