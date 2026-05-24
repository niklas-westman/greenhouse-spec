import { existsSync, readFileSync } from "node:fs";
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

type RouteRule = Extract<ValidationProposal, { kind: "validation-route" }>;
type ValidationRule = NonNullable<ValidationConfig["paths"]>[string];

export function buildValidationProposals(options: {
  cwd: string;
  repoShape: RepoShape;
}): ValidationProposals {
  const validation = readValidation(options.cwd);
  const proposals: ValidationProposal[] = [
    ...buildPackageScriptProposals(options.cwd),
    ...buildRouteProposals(options.cwd, options.repoShape, validation),
  ];

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
    kind: "package-script",
    status: proposal.status === "collision" ? "conflict" : "pending",
    confidence: "high",
    reason:
      proposal.status === "collision"
        ? `Existing package script "${proposal.name}" conflicts with the Greenhouse alias.`
        : proposal.status === "update"
          ? `Package script "${proposal.name}" uses an accepted Greenhouse alias and can be normalized to the local CLI path.`
          : `Package script "${proposal.name}" is missing.`,
    safe: proposal.status !== "collision",
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

  return proposals.filter(
    (proposal): proposal is RouteRule =>
      proposal.kind === "validation-route" &&
      proposal.validation_route.rule.required.length > 0,
  );
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
