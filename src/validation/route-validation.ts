import type { ValidationConfig } from "../schemas/validation.js";
import type { CommandIndex } from "../schemas/command-index.js";

import { matchesPath } from "./path-match.js";

export type RiskIndex = {
  risks?: Array<{
    id: string;
    paths: string[];
  }>;
};

export type RoutedCommand = {
  id: string;
  command: string;
  reason: string;
  source: RouteSource;
  matched?: string;
};

export type ManualCheck = {
  id: string;
  prompt: string;
  reason: string;
  source: RouteSource;
  matched?: string;
};

export type RouteSource =
  | "path-rule"
  | "risk-rule"
  | "risk-default-guarded"
  | "inferred-route"
  | "mode-rule"
  | "fallback-default"
  | "manual-config";

export type RouteExplanation = {
  kind:
    | "path-rule"
    | "risk-rule"
    | "risk-default-guarded"
    | "inferred-route"
    | "mode-rule"
    | "fallback-default"
    | "manual-check"
    | "generated-excluded"
    | "skipped";
  message: string;
};

export type ValidationRoute = {
  mode: "patch" | "growth" | "guarded";
  changedFiles: string[];
  allChangedFiles?: string[];
  risks: string[];
  commands: RoutedCommand[];
  manualChecks: ManualCheck[];
  skippedValidation: string | null;
  explanations: RouteExplanation[];
};

type Mode = ValidationRoute["mode"];

const modeRank: Record<Mode, number> = {
  patch: 0,
  growth: 1,
  guarded: 2,
};

export function routeValidation(options: {
  changedFiles: string[];
  allChangedFiles?: string[];
  allowDefaultFallback?: boolean;
  forcedMode?: string;
  commandIndex?: CommandIndex;
  riskIndex?: RiskIndex;
  validation: ValidationConfig;
}): ValidationRoute {
  const changedFiles = options.changedFiles;
  const risks = detectRisks(changedFiles, options.riskIndex);
  let mode: Mode = parseMode(options.forcedMode) ?? "patch";
  const commands: RoutedCommand[] = [];
  const manualChecks: ManualCheck[] = [];
  const explanations: RouteExplanation[] = [];
  for (const file of (options.allChangedFiles ?? []).filter(
    (item) => !changedFiles.includes(item),
  )) {
    explanations.push({
      kind: "generated-excluded",
      message: `${file} was excluded from validation routing because it is generated or not routable.`,
    });
  }

  for (const [pattern, rule] of Object.entries(options.validation.paths ?? {})) {
    if (!changedFiles.some((path) => matchesPath(pattern, path))) {
      continue;
    }
    explanations.push({
      kind: "path-rule",
      message: `Matched path rule "${pattern}".`,
    });

    if (rule.mode) {
      mode = maxMode(mode, rule.mode);
    }

    for (const command of rule.required) {
      commands.push({
        ...command,
        reason: `Matched path rule "${pattern}".`,
        source: "path-rule",
        matched: pattern,
      });
    }
    for (const manual of rule.manual) {
      manualChecks.push({
        ...manual,
        reason: `Matched path rule "${pattern}".`,
        source: "path-rule",
        matched: pattern,
      });
    }
  }

  for (const risk of risks) {
    const rule = options.validation.risks?.[risk];
    if (!rule) {
      mode = maxMode(mode, "guarded");
      explanations.push({
        kind: "risk-default-guarded",
        message: `Risk "${risk}" had no authored rule; mode escalated to guarded.`,
      });
      continue;
    }
    explanations.push({
      kind: "risk-rule",
      message: `Matched risk "${risk}".`,
    });

    if (rule.mode) {
      mode = maxMode(mode, rule.mode);
    }

    for (const command of rule.required) {
      commands.push({
        ...command,
        reason: `Matched risk "${risk}".`,
        source: "risk-rule",
        matched: risk,
      });
    }
    for (const manual of rule.manual) {
      manualChecks.push({
        ...manual,
        reason: `Matched risk "${risk}".`,
        source: "risk-rule",
        matched: risk,
      });
    }
  }

  const hasExplicitRoute = commands.length > 0 || manualChecks.length > 0;
  if (!hasExplicitRoute && mode === "patch") {
    const inferredCommands = inferLightweightPatchCommands({
      changedFiles,
      commandIndex: options.commandIndex,
      validation: options.validation,
    });
    if (inferredCommands.length > 0) {
      explanations.push({
        kind: "inferred-route",
        message: inferredCommands[0]?.reason ?? "Inferred lightweight patch route.",
      });
      commands.push(...inferredCommands);
    }
  }

  const configManualChecks = inferConfigManualChecks(changedFiles);
  for (const check of configManualChecks) {
    explanations.push({
      kind: "manual-check",
      message: check.reason,
    });
  }
  manualChecks.push(...configManualChecks);

  const modeRule = options.validation.modes?.[mode];
  if ((modeRule?.required.length ?? 0) > 0 || (modeRule?.manual.length ?? 0) > 0) {
    explanations.push({
      kind: "mode-rule",
      message: `Applied ${mode} mode requirements.`,
    });
  }
  for (const command of modeRule?.required ?? []) {
    if (command.command === "greenhouse-spec verify --changed") {
      continue;
    }
    commands.push({
      ...command,
      reason: `Required for ${mode} mode.`,
      source: "mode-rule",
      matched: mode,
    });
  }
  for (const manual of modeRule?.manual ?? []) {
    manualChecks.push({
      ...manual,
      reason: `Required for ${mode} mode.`,
      source: "mode-rule",
      matched: mode,
    });
  }

  if (commands.length === 0 && options.allowDefaultFallback !== false) {
    if ((options.validation.defaults?.required.length ?? 0) > 0) {
      explanations.push({
        kind: "fallback-default",
        message: "No explicit or inferred route selected commands; using default required validation.",
      });
    }
    for (const command of options.validation.defaults?.required ?? []) {
      commands.push({
        ...command,
        reason: "Fallback default required validation.",
        source: "fallback-default",
      });
    }
  }
  const skippedValidation =
    commands.length === 0
      ? (options.allowDefaultFallback === false
          ? "No validation commands were selected because no non-generated files were routed."
          : "No validation commands were selected from validation.yaml.")
      : null;
  if (skippedValidation) {
    explanations.push({
      kind: "skipped",
      message: skippedValidation,
    });
  }

  return {
    mode,
    changedFiles,
    allChangedFiles: options.allChangedFiles,
    risks,
    commands: uniqueCommands(commands),
    manualChecks: uniqueManualChecks(manualChecks),
    skippedValidation,
    explanations: uniqueExplanations(explanations),
  };
}

function inferLightweightPatchCommands(options: {
  changedFiles: string[];
  commandIndex?: CommandIndex;
  validation: ValidationConfig;
}): RoutedCommand[] {
  if (options.changedFiles.length === 0) {
    return [];
  }

  if (isDocsOnly(options.changedFiles)) {
    const styleCheck = findStyleCommand(options);
    return styleCheck
      ? [
          {
            ...styleCheck,
            reason: "Inferred docs-only patch route.",
            source: "inferred-route",
            matched: "docs-only",
          },
        ]
      : [];
  }

  if (isCliOnly(options.changedFiles)) {
    return inferCliCommands(options, "Inferred CLI-only patch route.");
  }

  if (isAppOnly(options.changedFiles)) {
    return inferAppCommands(options);
  }

  if (isInferredPatch(options.changedFiles)) {
    return [
      ...inferDocsCommands(options),
      ...inferAppCommands(options),
      ...inferCliCommands(options, "Inferred CLI-focused patch route."),
      ...inferConfigCommands(options),
    ];
  }

  return [];
}

function inferDocsCommands(options: {
  changedFiles: string[];
  commandIndex?: CommandIndex;
  validation: ValidationConfig;
}): RoutedCommand[] {
  if (!options.changedFiles.some(isDocsPath)) {
    return [];
  }

  const styleCheck = findStyleCommand(options);
  return styleCheck
    ? [
        {
          ...styleCheck,
          reason: "Inferred docs patch route.",
          source: "inferred-route",
          matched: "docs",
        },
      ]
    : [];
}

function inferCliCommands(
  options: {
    changedFiles?: string[];
    commandIndex?: CommandIndex;
    validation: ValidationConfig;
  },
  reason: string,
): RoutedCommand[] {
  if (options.changedFiles && !options.changedFiles.some(isCliPath)) {
    return [];
  }

  return [
    findCommand(options, "cli:build"),
    findCommand(options, "test:cli"),
    findCommand(options, "typecheck"),
  ]
    .filter((command): command is { id: string; command: string } =>
      Boolean(command),
    )
    .map((command) => ({
      ...command,
      reason,
      source: "inferred-route",
      matched: reason,
    }));
}

function inferAppCommands(options: {
  changedFiles: string[];
  commandIndex?: CommandIndex;
  validation: ValidationConfig;
}): RoutedCommand[] {
  if (!options.changedFiles.some(isAppSourcePath)) {
    return [];
  }

  return [
    findStyleCommand(options),
    findCommand(options, "typecheck"),
    findCommand(options, "test"),
  ]
    .filter((command): command is { id: string; command: string } =>
      Boolean(command),
    )
    .map((command) => ({
      ...command,
      reason: "Inferred app patch route.",
      source: "inferred-route",
      matched: "app-source",
    }));
}

function inferConfigCommands(options: {
  changedFiles: string[];
  commandIndex?: CommandIndex;
  validation: ValidationConfig;
}): RoutedCommand[] {
  if (
    !options.changedFiles.some(
      (file) =>
        isRepoConfigPath(file) ||
        isAgentInstructionPath(file) ||
        isGreenhouseAuthoredPath(file),
    )
  ) {
    return [];
  }

  const doctor = findCommand(options, "check:greenhouse");
  return doctor
    ? [
        {
          ...doctor,
          reason: "Inferred repository configuration route.",
          source: "inferred-route",
          matched: "repo-config",
        },
      ]
    : [];
}

function inferConfigManualChecks(changedFiles: string[]): ManualCheck[] {
  const checks: ManualCheck[] = [];

  if (changedFiles.some(isGreenhouseAuthoredPath)) {
    checks.push({
      id: "greenhouse-authored-review",
      prompt:
        "Review Greenhouse authored config changes before relying on validation routing.",
      reason: "Matched Greenhouse authored config.",
      source: "manual-config",
      matched: "greenhouse-authored",
    });
  }

  if (changedFiles.some(isAgentInstructionPath)) {
    checks.push({
      id: "agent-instructions-review",
      prompt: "Review agent instruction changes before relying on agent behavior.",
      reason: "Matched agent instruction config.",
      source: "manual-config",
      matched: "agent-instructions",
    });
  }

  return checks;
}

function findCommand(
  options: {
    commandIndex?: CommandIndex;
    validation: ValidationConfig;
  },
  id: string,
): { id: string; command: string } | null {
  const validationCommands = [
    ...(options.validation.defaults?.required ?? []),
    ...(options.validation.defaults?.recommended ?? []),
    ...Object.values(options.validation.modes ?? {}).flatMap((rule) => [
      ...rule.required,
      ...rule.recommended,
    ]),
    ...Object.values(options.validation.paths ?? {}).flatMap((rule) => [
      ...rule.required,
      ...rule.recommended,
    ]),
    ...Object.values(options.validation.risks ?? {}).flatMap((rule) => [
      ...rule.required,
      ...rule.recommended,
    ]),
  ];
  const validationCommand = validationCommands.find((command) => command.id === id);
  if (validationCommand) {
    return validationCommand;
  }

  const indexedCommand = options.commandIndex?.commands.find(
    (command) => command.id === id,
  );
  if (indexedCommand) {
    return {
      id: indexedCommand.id,
      command: indexedCommand.command,
    };
  }

  return null;
}

function findStyleCommand(options: {
  commandIndex?: CommandIndex;
  validation: ValidationConfig;
}): { id: string; command: string } | null {
  return findCommand(options, "format:check") ?? findCommand(options, "lint");
}

function isDocsOnly(changedFiles: string[]): boolean {
  return changedFiles.every(isDocsPath);
}

function isCliOnly(changedFiles: string[]): boolean {
  return changedFiles.every(isCliPath);
}

function isAppOnly(changedFiles: string[]): boolean {
  return changedFiles.every(isAppSourcePath);
}

function isInferredPatch(changedFiles: string[]): boolean {
  return changedFiles.every(
    (file) =>
      isDocsPath(file) ||
      isCliPath(file) ||
      isAppSourcePath(file) ||
      isRepoConfigPath(file) ||
      isAgentInstructionPath(file) ||
      isGreenhouseAuthoredPath(file),
  );
}

function isDocsPath(file: string): boolean {
  if (isAgentInstructionPath(file) || isGreenhouseAuthoredPath(file)) {
    return false;
  }

  return (
    file === "README.md" ||
    file.endsWith(".md") ||
    file.startsWith("docs/") ||
    file.startsWith("prep-docs/")
  );
}

function isCliPath(file: string): boolean {
  return (
    file.startsWith("src/cli/") ||
    file.startsWith("src/tools/") ||
    file === "tsconfig.cli.json"
  );
}

function isAppSourcePath(file: string): boolean {
  if (
    isDocsPath(file) ||
    isCliPath(file) ||
    isRepoConfigPath(file) ||
    isAgentInstructionPath(file) ||
    isGreenhouseAuthoredPath(file)
  ) {
    return false;
  }

  const normalizedFile = file.replace(/\\/g, "/");
  const lowerFile = normalizedFile.toLowerCase();

  return (
    lowerFile === "src/app.tsx" ||
    lowerFile === "src/app.ts" ||
    lowerFile === "src/main.tsx" ||
    lowerFile === "src/main.ts" ||
    normalizedFile.startsWith("src/components/") ||
    file.startsWith("src/features/") ||
    file.startsWith("src/hooks/") ||
    file.startsWith("src/layouts/") ||
    file.startsWith("src/pages/") ||
    file.startsWith("src/routes/") ||
    file.startsWith("src/styles/")
  );
}

function isRepoConfigPath(file: string): boolean {
  return (
    file === "package.json" ||
    file === "pnpm-lock.yaml" ||
    file === "package-lock.json" ||
    file === "yarn.lock" ||
    file.startsWith("tsconfig") ||
    file.startsWith("vite.config") ||
    file.startsWith(".github/")
  );
}

function isAgentInstructionPath(file: string): boolean {
  return (
    file === "AGENTS.md" ||
    file === "CLAUDE.md" ||
    file.startsWith(".cursor/rules/")
  );
}

function isGreenhouseAuthoredPath(file: string): boolean {
  return (
    file === ".greenhouse/project.yaml" ||
    file.startsWith(".greenhouse/roots/") ||
    file === ".greenhouse/context/manifest.yaml" ||
    file.startsWith(".greenhouse/scripts/") ||
    file.startsWith(".greenhouse/templates/")
  );
}

function detectRisks(changedFiles: string[], riskIndex?: RiskIndex): string[] {
  const risks = new Set<string>();

  for (const risk of riskIndex?.risks ?? []) {
    if (
      risk.paths.some((pattern) =>
        changedFiles.some((path) => matchesPath(pattern, path)),
      )
    ) {
      risks.add(risk.id);
    }
  }

  return [...risks];
}

function parseMode(mode: string | undefined): Mode | null {
  if (mode === "patch" || mode === "growth" || mode === "guarded") {
    return mode;
  }
  return null;
}

function maxMode(left: Mode, right: Mode): Mode {
  return modeRank[left] >= modeRank[right] ? left : right;
}

function uniqueCommands(commands: RoutedCommand[]): RoutedCommand[] {
  const seen = new Set<string>();
  return commands.filter((command) => {
    const key = `${command.id}\0${command.command}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueManualChecks(checks: ManualCheck[]): ManualCheck[] {
  const seen = new Set<string>();
  return checks.filter((check) => {
    if (seen.has(check.id)) {
      return false;
    }
    seen.add(check.id);
    return true;
  });
}

function uniqueExplanations(explanations: RouteExplanation[]): RouteExplanation[] {
  const seen = new Set<string>();
  return explanations.filter((explanation) => {
    const key = `${explanation.kind}\0${explanation.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
