export const mvpInstalledTreePaths = [
  "project.yaml",
  "roots/rules.md",
  "roots/protected-boundaries.md",
  "roots/validation.yaml",
  "roots/authority.md",
  "roots/docs.yaml",
  "grown/repo-map.yaml",
  "grown/command-index.yaml",
  "grown/docs-index.yaml",
  "grown/risk-index.yaml",
  "grown/agent-index.yaml",
  "grown/evidence-index.yaml",
  "grown/failure-signatures.yaml",
  "grown/last-inspection.md",
  "context/manifest.yaml",
  "scripts/check-changed.mjs",
  "scripts/check-greenhouse.mjs",
  "scripts/validate-scope.mjs",
  "templates/evidence.md",
  "templates/verification.md",
] as const;

export type MvpInstalledTreePath = (typeof mvpInstalledTreePaths)[number];

export const mvpInstalledDirectories = [
  "roots",
  "grown",
  "context",
  "scripts",
  "evidence",
  "templates",
  "reports",
  "reports/doctor",
] as const;

export type MvpInstalledDirectory = (typeof mvpInstalledDirectories)[number];
