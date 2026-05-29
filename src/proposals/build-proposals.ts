import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

import { proposePackageScripts } from "../native-scripts/package-script-proposals.js";
import { readPackageJson } from "../discovery/package-json.js";
import type { CommandCheck, ManualCheck } from "../schemas/common.js";
import type { ValidationConfig } from "../schemas/validation.js";
import type {
  ValidationProposal,
  ValidationProposals,
} from "../schemas/validation-proposals.js";
import type { RepoShape } from "../schemas/repo-shape.js";

import {
  isDismissed,
  readProposalDecisions,
} from "./proposal-decisions.js";

type RouteRule = Extract<ValidationProposal, { kind: "validation-route" }>;
type ValidationRule = NonNullable<ValidationConfig["paths"]>[string];

export function buildValidationProposals(options: {
  cwd: string;
  repoShape: RepoShape;
}): ValidationProposals {
  const validation = readValidation(options.cwd);
  const decisions = readProposalDecisions(options.cwd);
  const proposals: ValidationProposal[] = [
    ...buildPackageScriptProposals(options.cwd),
    ...buildRouteProposals(options.cwd, options.repoShape, validation),
  ].map((proposal) =>
    isDismissed(decisions, proposal.idempotency_key)
      ? {
          ...proposal,
          status: "skipped" as const,
          reason:
            "Proposal was dismissed in .greenhouse/roots/proposal-decisions.yaml.",
        }
      : proposal,
  );

  return {
    schema_version: 1,
    managed_by: "greenhouse-spec",
    generated_at: new Date().toISOString(),
    proposals: uniqueProposals(proposals),
  };
}

function buildPackageScriptProposals(cwd: string): ValidationProposal[] {
  return proposePackageScripts(cwd).map((proposal) => ({
    id: `package-script:${proposal.name}`,
    idempotency_key: `package-script:${proposal.name}`,
    kind: "package-script",
    status: proposal.status === "collision" ? "conflict" : "pending",
    confidence: "high",
    reason:
      proposal.status === "collision"
        ? `Existing package script "${proposal.name}" conflicts with the Greenhouse alias.`
        : proposal.status === "update"
          ? `Package script "${proposal.name}" uses an accepted Greenhouse alias and can be normalized to the package CLI.`
          : `Package script "${proposal.name}" is missing.`,
    safe: proposal.status !== "collision",
    preconditions: [
      "package.json exists or can be created",
      `script ${proposal.name} is missing or still matches the generated proposal`,
    ],
    collision:
      proposal.status === "collision"
        ? {
            human_owned: true,
            explanation: `Existing package script "${proposal.name}" is not a Greenhouse-managed alias.`,
          }
        : undefined,
    target: {
      path: "package.json",
    },
    package_script: {
      name: proposal.name,
      command: proposal.command,
      existing_command: proposal.existingCommand,
    },
  }));
}

function buildRouteProposals(
  cwd: string,
  repoShape: RepoShape,
  validation: ValidationConfig | null,
): ValidationProposal[] {
  const proposals: ValidationProposal[] = [];
  const frontendPackages = repoShape.packages.filter(
    (item) => item.path !== "." && item.kind.includes("frontend"),
  );
  const infraPackages = repoShape.packages.filter(
    (item) => item.path !== "." && item.kind.includes("infra"),
  );
  const apiPackages = repoShape.packages.filter(
    (item) => item.kind.includes("api-spec"),
  );
  const rootScripts = readPackageJson(cwd)?.scripts ?? {};

  for (const item of frontendPackages) {
    proposals.push(
      routeProposal(validation, {
        pattern: `${item.path}src/**`,
        mode: "patch",
        required: compactCommands([
          command("lint:frontend", preferredScript(rootScripts, "lint:frontend", item.commands.lint)),
          command("test:frontend", preferredScript(rootScripts, "test:frontend", item.commands.test)),
        ]),
        reason: `Frontend package detected at ${item.path}.`,
        confidence: item.commands.test ? "high" : "medium",
      }),
    );
  }

  for (const item of repoShape.java_modules) {
    if (apiPackages.some((apiPackage) => apiPackage.path === item.path)) {
      proposals.push(
        routeProposal(validation, {
        pattern: `${item.path}pom.xml`,
        mode: "guarded",
        required: compactCommands([
            command("build:api", preferredScript(rootScripts, "build:api", item.commands.build)),
            command(
              "test:backend",
              preferredScript(rootScripts, "test:backend", item.commands.test),
            ),
        ]),
          manual: [
            {
              id: "api-build-review",
              prompt: "Review API generator or Maven dependency changes.",
            },
          ],
          reason: `API Maven module detected at ${item.path}.`,
          confidence: "medium",
        }),
      );
      continue;
    }

    proposals.push(
      routeProposal(validation, {
        pattern: `${item.path}src/main/java/**`,
        mode: "patch",
        required: compactCommands([
          command("test:backend", preferredScript(rootScripts, "test:backend", item.commands.test)),
        ]),
        reason: `Maven Java source detected at ${item.path}.`,
        confidence: "medium",
      }),
      routeProposal(validation, {
        pattern: `${item.path}src/test/**`,
        mode: "patch",
        required: compactCommands([
          command("test:backend", preferredScript(rootScripts, "test:backend", item.commands.test)),
        ]),
        reason: `Maven Java tests detected at ${item.path}.`,
        confidence: "medium",
      }),
      routeProposal(validation, {
        pattern: `${item.path}pom.xml`,
        mode: "guarded",
        required: compactCommands([
          command("test:backend", preferredScript(rootScripts, "test:backend", item.commands.test)),
          command("build:backend", preferredScript(rootScripts, "build:backend", item.commands.build)),
        ]),
        manual: [
          {
            id: "backend-dependency-review",
            prompt: "Review backend dependency and build changes.",
          },
        ],
        reason: `Maven build file detected at ${item.path}.`,
        confidence: "medium",
      }),
    );

    if (existsSync(join(cwd, item.path, "src/main/resources/db/migration"))) {
      proposals.push(
        routeProposal(validation, {
          pattern: `${item.path}src/main/resources/db/migration/**`,
          mode: "guarded",
          required: compactCommands([
            command("test:backend", preferredScript(rootScripts, "test:backend", item.commands.test)),
          ]),
          manual: [
            {
              id: "migration-review",
              prompt:
                "Review database migration ordering, reversibility, and production data impact.",
            },
          ],
          reason: `Database migrations detected at ${item.path}.`,
          confidence: "medium",
        }),
      );
    }

    if (existsSync(join(cwd, item.path, "src/main/resources/application.yaml"))) {
      proposals.push(
        routeProposal(validation, {
          pattern: `${item.path}src/main/resources/application.yaml`,
          mode: "guarded",
          required: compactCommands([
            command("test:backend", preferredScript(rootScripts, "test:backend", item.commands.test)),
          ]),
          manual: [
            {
              id: "backend-config-review",
              prompt: "Review backend runtime configuration and deployment impact.",
            },
          ],
          reason: `Backend runtime config detected at ${item.path}.`,
          confidence: "medium",
        }),
      );
    }
  }

  for (const item of apiPackages) {
    const frontendTests = repoShape.packages
      .filter((candidate) => candidate.kind.includes("frontend"))
      .flatMap((candidate) =>
        compactCommands([
          command("test:frontend", preferredScript(rootScripts, "test:frontend", candidate.commands.test)),
        ]),
      );
    const backendTests = repoShape.java_modules
      .filter((candidate) => candidate.path !== item.path)
      .flatMap((candidate) =>
        compactCommands([
          command("test:backend", preferredScript(rootScripts, "test:backend", candidate.commands.test)),
        ]),
      );

    proposals.push(
      routeProposal(validation, {
        pattern: `${item.path}src/main/resources/api.yaml`,
        mode: "guarded",
        required: compactCommands([
          command("build:api", preferredScript(rootScripts, "build:api", item.commands.build)),
          ...backendTests,
          ...frontendTests,
        ]),
        manual: [
          {
            id: "api-contract-review",
            prompt: "Review API contract compatibility and generated client/server impact.",
          },
        ],
        reason: `API contract detected at ${item.path}.`,
        confidence: "medium",
      }),
      routeProposal(validation, {
        pattern: `${item.path}src/generated/**`,
        mode: "patch",
        required: compactCommands([
          command("build:api", preferredScript(rootScripts, "build:api", item.commands.build)),
        ]),
        manual: [
          {
            id: "generated-api-review",
            prompt: `Confirm generated API files match ${item.path}src/main/resources/api.yaml.`,
          },
        ],
        reason: `Generated API output detected at ${item.path}.`,
        confidence: "medium",
      }),
    );
  }

  for (const item of infraPackages) {
    proposals.push(
      routeProposal(validation, {
        pattern: `${item.path}**`,
        mode: "guarded",
        required: compactCommands([
          command("build:infra", preferredScript(rootScripts, "build:infra", item.commands.build)),
          command("test:infra", preferredScript(rootScripts, "test:infra", item.commands.test)),
        ]),
        manual: [
          {
            id: "infra-impact-review",
            prompt: "Review AWS infrastructure and deployment impact.",
          },
        ],
        reason: `Infrastructure package detected at ${item.path}.`,
        confidence: "medium",
      }),
    );
  }

  proposals.push(...buildGreenhouseSpecSeedProposals(cwd, validation, rootScripts));
  proposals.push(...buildSinglePackageSeedProposals(cwd, validation, rootScripts));
  proposals.push(...buildFallbackEvidenceSeedProposals(cwd, validation, rootScripts));
  proposals.push(...buildDomainSeedProposals(cwd, validation, rootScripts));
  proposals.push(...buildRustSeedProposals(validation, repoShape));

  return proposals.filter(
    (proposal): proposal is RouteRule =>
      proposal.kind === "validation-route" &&
      proposal.validation_route.rule.required.length > 0,
  );
}

function buildDomainSeedProposals(
  cwd: string,
  validation: ValidationConfig | null,
  scripts: Record<string, string>,
): ValidationProposal[] {
  const proposals: ValidationProposal[] = [];
  const style = styleCommand(scripts);
  const typecheck = scriptCommand(scripts, "typecheck");
  const test = scriptCommand(scripts, "test");
  const hasDeclarationDomain =
    existsSync(join(cwd, "src", "engine", "annual-report")) ||
    existsSync(join(cwd, "src", "engine", "closeout")) ||
    existsSync(join(cwd, "src", "engine", "validation")) ||
    existsSync(join(cwd, "src", "shared", "schemas"));

  if (existsSync(join(cwd, "src", "engine", "annual-report")) && test) {
    proposals.push(
      routeProposal(validation, {
        pattern: "src/engine/annual-report/**",
        mode: "guarded",
        required: compactCommands([
          style,
          command("typecheck", typecheck),
          command("test", test),
        ]),
        manual: [
          {
            id: "financial-reporting-review",
            prompt: "Review annual report output correctness and reporting compatibility.",
          },
        ],
        reason: "Annual report output code detected at src/engine/annual-report/.",
        confidence: "medium",
      }),
    );
  }

  if (existsSync(join(cwd, "src", "engine", "closeout")) && test) {
    proposals.push(
      routeProposal(validation, {
        pattern: "src/engine/closeout/**",
        mode: "guarded",
        required: compactCommands([
          style,
          command("typecheck", typecheck),
          command("test", test),
        ]),
        manual: [
          {
            id: "closeout-output-review",
            prompt: "Review closeout output contracts and generated review bundle compatibility.",
          },
        ],
        reason: "Closeout output code detected at src/engine/closeout/.",
        confidence: "medium",
      }),
    );
  }

  if (existsSync(join(cwd, "tests", "fixtures", "closeout")) && test) {
    proposals.push(
      routeProposal(validation, {
        pattern: "tests/fixtures/closeout/**",
        mode: "patch",
        required: compactCommands([command("test", test)]),
        manual: [
          {
            id: "closeout-fixture-review",
            prompt: "Confirm closeout fixtures still represent the intended output cases.",
          },
        ],
        reason: "Closeout fixtures detected at tests/fixtures/closeout/.",
        confidence: "medium",
      }),
    );
  }

  if (existsSync(join(cwd, "src", "engine", "validation")) && test) {
    proposals.push(
      routeProposal(validation, {
        pattern: "src/engine/validation/**",
        mode: "guarded",
        required: compactCommands([
          style,
          command("typecheck", typecheck),
          command("test", test),
        ]),
        manual: [
          {
            id: "readiness-gate-review",
            prompt: "Review readiness gate behavior and declaration safety impact.",
          },
        ],
        reason: "Readiness or validation gate code detected at src/engine/validation/.",
        confidence: "medium",
      }),
    );
  }

  if (existsSync(join(cwd, "src", "shared", "schemas")) && test) {
    proposals.push(
      routeProposal(validation, {
        pattern: "src/shared/schemas/**",
        mode: "guarded",
        required: compactCommands([
          style,
          command("typecheck", typecheck),
          command("test", test),
        ]),
        manual: [
          {
            id: "shared-schema-review",
            prompt: "Review schema compatibility across validation, reporting, and UI consumers.",
          },
        ],
        reason: "Shared schema contracts detected at src/shared/schemas/.",
        confidence: "medium",
      }),
    );
  }

  if (hasDeclarationDomain && existsSync(join(cwd, "src", "data")) && test) {
    proposals.push(
      routeProposal(validation, {
        pattern: "src/data/**",
        mode: "patch",
        required: compactCommands([
          style,
          command("typecheck", typecheck),
          command("test", test),
        ]),
        manual: [
          {
            id: "declaration-review-surface",
            prompt: "Review declaration or dashboard data changes for user-facing review behavior.",
          },
        ],
        reason: "Declaration or dashboard data surface detected at src/data/.",
        confidence: "low",
      }),
    );
  }

  return proposals;
}

function buildFallbackEvidenceSeedProposals(
  cwd: string,
  validation: ValidationConfig | null,
  scripts: Record<string, string>,
): ValidationProposal[] {
  const files = fallbackEvidenceChangedFiles(cwd);
  if (files.length === 0) {
    return [];
  }

  const domainProposals = buildDomainSeedProposals(cwd, validation, scripts);
  return domainProposals
    .filter(
      (proposal) =>
        proposal.kind === "validation-route" &&
        files.some((file) => matchesProposalPattern(proposal.validation_route.pattern, file)),
    )
    .map((proposal) => ({
      ...proposal,
      reason:
        proposal.status === "conflict" || proposal.status === "adoptable"
          ? proposal.reason
          : `${proposal.reason} Recent evidence showed matching source files using fallback validation.`,
    }));
}

function fallbackEvidenceChangedFiles(cwd: string): string[] {
  const evidencePath = join(cwd, ".greenhouse", "evidence");
  if (!existsSync(evidencePath)) {
    return [];
  }

  return readdirSync(evidencePath)
    .filter((file) => file.endsWith(".md"))
    .map((file) => join(evidencePath, file))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)
    .slice(0, 10)
    .flatMap((file) => {
      const content = readFileSync(file, "utf8");
      if (!content.includes("source files used fallback validation")) {
        return [];
      }
      return parseChangedFiles(content);
    });
}

function parseChangedFiles(content: string): string[] {
  const changedFiles = content.match(/Changed files:\s*([^\n]+)/i)?.[1]?.trim();
  if (!changedFiles || changedFiles === "none") {
    return [];
  }
  return changedFiles
    .split(",")
    .map((file) => file.trim())
    .filter(Boolean);
}

function matchesProposalPattern(pattern: string, file: string): boolean {
  const prefix = pattern.endsWith("/**") ? pattern.slice(0, -3) : pattern;
  return file === prefix || file.startsWith(`${prefix}/`);
}

function buildRustSeedProposals(
  validation: ValidationConfig | null,
  repoShape: RepoShape,
): ValidationProposal[] {
  const proposals: ValidationProposal[] = [];

  for (const item of repoShape.rust_modules ?? []) {
    const isTauriModule = item.path === "src-tauri/";
    const testCommand = item.commands.test;

    if (!testCommand) {
      continue;
    }

    proposals.push(
      routeProposal(validation, {
        pattern: `${item.path}src/**`,
        mode: "patch",
        required: compactCommands([
          command(isTauriModule ? "test:tauri" : "test:rust", testCommand),
        ]),
        reason: `${isTauriModule ? "Tauri" : "Rust"} source detected at ${item.path}src/.`,
        confidence: item.confidence,
      }),
    );

    for (const manifest of ["Cargo.toml", "Cargo.lock"]) {
      proposals.push(
        routeProposal(validation, {
          pattern: `${item.path}${manifest}`,
          mode: "guarded",
          required: compactCommands([
            command(isTauriModule ? "test:tauri" : "test:rust", testCommand),
          ]),
          manual: [
            {
              id: isTauriModule ? "tauri-runtime-review" : "rust-dependency-review",
              prompt: isTauriModule
                ? "Review Tauri runtime, permissions, and Rust dependency impact."
                : "Review Rust dependency and runtime impact.",
            },
          ],
          reason: `${isTauriModule ? "Tauri" : "Rust"} manifest detected at ${item.path}${manifest}.`,
          confidence: item.confidence,
        }),
      );
    }
  }

  return proposals;
}

function buildGreenhouseSpecSeedProposals(
  cwd: string,
  validation: ValidationConfig | null,
  scripts: Record<string, string>,
): ValidationProposal[] {
  const packageJson = readPackageJson(cwd);
  if (packageJson?.name !== "greenhouse-spec") {
    return [];
  }

  const proposals: ValidationProposal[] = [];
  const typecheck = scriptCommand(scripts, "typecheck");
  const check = scriptCommand(scripts, "check");

  const route = (
    pattern: string,
    testScript: string,
    reason: string,
    mode: "patch" | "growth" | "guarded" = "patch",
  ) => {
    proposals.push(
      routeProposal(validation, {
        pattern,
        mode,
        required: compactCommands([
          command(testScript, scriptCommand(scripts, testScript)),
          command("typecheck", typecheck),
        ]),
        reason,
        confidence: "high",
      }),
    );
  };

  route("README.md", "test:templates", "Greenhouse docs entrypoint detected.");
  route("docs/**", "test:templates", "Greenhouse docs folder detected.");
  route("src/cli.ts", "test:cli", "Greenhouse CLI entrypoint detected.");
  route("src/commands/**", "test:cli", "Greenhouse command adapters detected.");
  route("src/schemas/**", "test:schemas", "Greenhouse schemas detected.");
  route("src/proposals/**", "test:proposals", "Greenhouse proposal engine detected.");
  route("src/validation/**", "test:validation", "Greenhouse validation router detected.");
  route("src/verify/**", "test:validation", "Greenhouse verify runner detected.");
  route("src/plant/**", "test:plant", "Greenhouse plant runner detected.");
  route("templates/**", "test:templates", "Greenhouse installed templates detected.");
  route("src/templates/**", "test:templates", "Greenhouse template registry detected.");
  route("src/tend/**", "test:tend", "Greenhouse tend gate detected.");
  route("src/doctor/**", "test:doctor", "Greenhouse doctor detected.");
  route("src/discovery/**", "test:discovery", "Greenhouse discovery layer detected.");
  route("src/inspect/**", "test:inspect", "Greenhouse inspect runner detected.");
  route("src/lifecycle/**", "test:lifecycle", "Greenhouse lifecycle commands detected.");
  route("src/status/**", "test:lifecycle", "Greenhouse status runner detected.");
  route("src/evidence/**", "test:evidence", "Greenhouse evidence maintenance detected.");
  route("src/native-scripts/**", "test:native-scripts", "Greenhouse package script proposals detected.");

  for (const pattern of ["package.json", "pnpm-lock.yaml", "tsconfig.json"]) {
    proposals.push(
      routeProposal(validation, {
        pattern,
        mode: "guarded",
        required: compactCommands([command("check", check)]),
        manual: [
          {
            id: "greenhouse-self-config-review",
            prompt: "Review Greenhouse self-bootstrap and package validation changes.",
          },
        ],
        reason: `Greenhouse package config detected at ${pattern}.`,
        confidence: "high",
      }),
    );
  }

  return proposals;
}

function buildSinglePackageSeedProposals(
  cwd: string,
  validation: ValidationConfig | null,
  scripts: Record<string, string>,
): ValidationProposal[] {
  const proposals: ValidationProposal[] = [];
  const generate = scriptCommand(scripts, "generate");
  const test = scriptCommand(scripts, "test");
  const screenshot = scriptCommand(scripts, "screenshot");
  const queryTest = scriptCommand(scripts, "query:test");
  const hermesLogTest = scriptCommand(scripts, "hermes:log:test");

  if (existsSync(join(cwd, "scripts", "generate-db.mjs")) && generate && test) {
    proposals.push(
      routeProposal(validation, {
        pattern: "scripts/generate-db.mjs",
        mode: "guarded",
        required: compactCommands([
          command("generate", generate),
          command("test", test),
        ]),
        reason: "Generated database script detected at scripts/generate-db.mjs.",
        confidence: "medium",
      }),
    );
  }

  if (existsSync(join(cwd, "src", "db")) && generate && test) {
    proposals.push(
      routeProposal(validation, {
        pattern: "src/db/**",
        mode: "guarded",
        required: compactCommands([
          command("generate", generate),
          command("test", test),
        ]),
        reason: "Database source detected at src/db/.",
        confidence: "medium",
      }),
    );
  }

  if (existsSync(join(cwd, "scripts", "query.mjs")) && queryTest && test) {
    proposals.push(
      routeProposal(validation, {
        pattern: "scripts/query.mjs",
        mode: "patch",
        required: compactCommands([
          command("query:test", queryTest),
          command("test", test),
        ]),
        reason: "Query script detected at scripts/query.mjs.",
        confidence: "medium",
      }),
    );
  }

  if (existsSync(join(cwd, "scripts", "ingest.mjs")) && queryTest && test) {
    proposals.push(
      routeProposal(validation, {
        pattern: "scripts/ingest.mjs",
        mode: "patch",
        required: compactCommands([
          command("query:test", queryTest),
          command("test", test),
        ]),
        reason: "Ingest script detected at scripts/ingest.mjs.",
        confidence: "medium",
      }),
    );
  }

  if (queryTest && existsSync(join(cwd, "scripts", "query.test.mjs"))) {
    proposals.push(
      routeProposal(validation, {
        pattern: "scripts/query.test.mjs",
        mode: "patch",
        required: compactCommands([command("query:test", queryTest)]),
        reason: "Query script test detected at scripts/query.test.mjs.",
        confidence: "high",
      }),
    );
  }

  if (hermesLogTest && existsSync(join(cwd, "scripts", "create-hermes-agent-log.test.mjs"))) {
    proposals.push(
      routeProposal(validation, {
        pattern: "scripts/create-hermes-agent-log.test.mjs",
        mode: "patch",
        required: compactCommands([command("hermes:log:test", hermesLogTest)]),
        reason: "Hermes log script test detected at scripts/create-hermes-agent-log.test.mjs.",
        confidence: "high",
      }),
    );
  }

  if (screenshot && existsSync(join(cwd, "screenshot.spec.ts"))) {
    proposals.push(
      routeProposal(validation, {
        pattern: "screenshot.spec.ts",
        mode: "guarded",
        required: compactCommands([command("screenshot", screenshot)]),
        reason: "Playwright screenshot validation detected at screenshot.spec.ts.",
        confidence: "medium",
      }),
    );
  }

  return proposals;
}

function routeProposal(
  validation: ValidationConfig | null,
  options: {
    pattern: string;
    mode: "patch" | "growth" | "guarded";
    required: CommandCheck[];
    manual?: ManualCheck[];
    reason: string;
    confidence: "low" | "medium" | "high";
  },
): RouteRule {
  const id = `validation-route:${slug(options.pattern)}`;
  const idempotencyKey = `validation-route:${options.pattern}`;
  const existingRule = validation?.paths?.[options.pattern];
  const proposedRule = {
    managed_by: "greenhouse-spec" as const,
    origin: "repo-shape" as const,
    proposal_id: id,
    confidence: options.confidence,
    mode: options.mode,
    required: options.required,
    recommended: [],
    manual: options.manual ?? [],
  };
  const status = routeProposalStatus(existingRule, proposedRule);

  return {
    id,
    idempotency_key: idempotencyKey,
    kind: "validation-route",
    status,
    confidence: options.confidence,
    reason:
      status === "conflict"
        ? `Path rule "${options.pattern}" already exists and is human-owned.`
        : status === "adoptable"
          ? `Path rule "${options.pattern}" already exists and matches this proposal; it can be adopted by Greenhouse.`
        : options.reason,
    safe: status !== "conflict",
    preconditions: [
      `${options.pattern} is still part of the discovered repo shape`,
      `path rule ${options.pattern} is missing or managed by greenhouse-spec`,
    ],
    collision:
      status === "conflict"
        ? {
            human_owned: true,
            explanation: `Path rule "${options.pattern}" exists without Greenhouse ownership and differs from this proposal.`,
          }
        : undefined,
    target: {
      path: ".greenhouse/roots/validation.yaml",
    },
    validation_route: {
      pattern: options.pattern,
      rule: proposedRule,
    },
  };
}

function routeProposalStatus(
  existingRule: ValidationRule | undefined,
  proposedRule: RouteRule["validation_route"]["rule"],
): RouteRule["status"] {
  if (!existingRule) {
    return "pending";
  }

  if (existingRule.managed_by === "greenhouse-spec") {
    return equivalentValidationRule(existingRule, proposedRule) ? "applied" : "pending";
  }

  return equivalentValidationRule(existingRule, proposedRule) ? "adoptable" : "conflict";
}

export function equivalentValidationRule(
  existingRule: ValidationRule,
  proposedRule: RouteRule["validation_route"]["rule"],
): boolean {
  return (
    existingRule.mode === proposedRule.mode &&
    equivalentCommands(existingRule.required, proposedRule.required) &&
    equivalentCommands(existingRule.recommended, proposedRule.recommended) &&
    equivalentManualChecks(existingRule.manual, proposedRule.manual)
  );
}

function equivalentCommands(
  left: CommandCheck[] | undefined,
  right: CommandCheck[] | undefined,
): boolean {
  return stableJson(normalizeCommands(left)) === stableJson(normalizeCommands(right));
}

function equivalentManualChecks(
  left: ManualCheck[] | undefined,
  right: ManualCheck[] | undefined,
): boolean {
  return stableJson(normalizeManualChecks(left)) === stableJson(normalizeManualChecks(right));
}

function normalizeCommands(commands: CommandCheck[] | undefined): CommandCheck[] {
  return [...(commands ?? [])].sort((left, right) =>
    `${left.id}\0${left.command}`.localeCompare(`${right.id}\0${right.command}`),
  );
}

function normalizeManualChecks(checks: ManualCheck[] | undefined): ManualCheck[] {
  return [...(checks ?? [])].sort((left, right) =>
    `${left.id}\0${left.prompt}`.localeCompare(`${right.id}\0${right.prompt}`),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function readValidation(cwd: string): ValidationConfig | null {
  const validationPath = join(cwd, ".greenhouse", "roots", "validation.yaml");
  if (!existsSync(validationPath)) {
    return null;
  }

  return parseYaml(readFileSync(validationPath, "utf8")) as ValidationConfig;
}

function command(id: string, commandValue: string | null | undefined): CommandCheck | null {
  return commandValue ? { id, command: commandValue } : null;
}

function scriptCommand(scripts: Record<string, string>, name: string): string | null {
  return scripts[name] ? `pnpm ${name}` : null;
}

function styleCommand(scripts: Record<string, string>): CommandCheck | null {
  const formatCheck = scriptCommand(scripts, "format:check");
  if (formatCheck) {
    return { id: "format:check", command: formatCheck };
  }
  const lint = scriptCommand(scripts, "lint");
  return lint ? { id: "lint", command: lint } : null;
}

function preferredScript(
  scripts: Record<string, string>,
  name: string,
  fallback: string | null | undefined,
): string | null | undefined {
  return scripts[name] ? `pnpm ${name}` : fallback;
}

function compactCommands(commands: Array<CommandCheck | null>): CommandCheck[] {
  const seen = new Set<string>();
  return commands.filter((item): item is CommandCheck => {
    if (!item) {
      return false;
    }
    const key = `${item.id}\0${item.command}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueProposals(proposals: ValidationProposal[]): ValidationProposal[] {
  const seen = new Set<string>();
  return proposals.filter((proposal) => {
    if (seen.has(proposal.id)) {
      return false;
    }
    seen.add(proposal.id);
    return true;
  });
}

function slug(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}
