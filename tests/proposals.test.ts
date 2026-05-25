import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";
import { afterEach, describe, expect, it } from "vitest";

import { adoptProposals } from "../src/proposals/adopt-proposals.js";
import { applyProposals } from "../src/proposals/apply-proposals.js";
import { dismissProposals } from "../src/proposals/dismiss-proposals.js";
import { readValidationProposals } from "../src/proposals/read-proposals.js";
import { formatProposalsReport, runProposals } from "../src/proposals/run-proposals.js";
import { runInspect } from "../src/inspect/run-inspect.js";
import { runPlant } from "../src/plant/run-plant.js";

const tempRepos: string[] = [];

afterEach(() => {
  for (const repo of tempRepos.splice(0)) {
    rmSync(repo, { recursive: true, force: true });
  }
});

describe("structured proposals", () => {
  it("inspect writes validation-proposals.yaml", () => {
    const repo = createTinyRepo();
    runPlant({ cwd: repo });

    const report = runInspect({ cwd: repo });

    expect(report.ok).toBe(true);
    expect(existsSync(join(repo, ".greenhouse", "grown", "validation-proposals.yaml"))).toBe(true);
  });

  it("proposals include idempotency keys and preconditions", () => {
    const repo = createSourcerLikeRepo();
    runPlant({ cwd: repo });
    runInspect({ cwd: repo });

    const proposals = readValidationProposals(repo).proposals;
    const packageScript = proposals.find(
      (proposal) => proposal.id === "package-script:greenhouse:tend",
    );
    const route = proposals.find(
      (proposal) => proposal.id === "validation-route:frontend-react-src",
    );

    expect(packageScript).toMatchObject({
      idempotency_key: "package-script:greenhouse:tend",
      preconditions: expect.arrayContaining([
        expect.stringContaining("package.json"),
      ]),
    });
    expect(route).toMatchObject({
      idempotency_key: "validation-route:frontend-react/src/**",
      preconditions: expect.arrayContaining([
        expect.stringContaining("frontend-react/src/**"),
      ]),
    });
    expect(formatProposalsReport(runProposals({ cwd: repo }))).toContain(
      "idempotency: validation-route:frontend-react/src/**",
    );
  });

  it("does not generate validation route proposals for Declarion-like single-package repos", () => {
    const repo = createDeclarionLikeRepo();
    runPlant({ cwd: repo });
    runInspect({ cwd: repo });

    const proposals = readValidationProposals(repo).proposals;

    expect(proposals.filter((proposal) => proposal.kind === "validation-route")).toEqual([]);
  });

  it("generates route proposals for Sourcer-like polyglot repos", () => {
    const repo = createSourcerLikeRepo();
    runPlant({ cwd: repo });
    runInspect({ cwd: repo });

    const routePatterns = readValidationProposals(repo).proposals
      .filter((proposal) => proposal.kind === "validation-route")
      .map((proposal) => proposal.validation_route.pattern);

    expect(routePatterns).toEqual(
      expect.arrayContaining([
        "frontend-react/src/**",
        "backend-java-serverless/src/main/java/**",
        "backend-java-serverless/src/main/resources/db/migration/**",
        "api-spec/src/main/resources/api.yaml",
        "api-spec/src/generated/**",
        "infra-aws/**",
      ]),
    );
  });

  it("generates validation seed proposals for Milibry-like repos", () => {
    const repo = createMilibryLikeRepo();
    runPlant({ cwd: repo });
    runInspect({ cwd: repo });

    const routePatterns = readValidationProposals(repo).proposals
      .filter((proposal) => proposal.kind === "validation-route")
      .map((proposal) => proposal.validation_route.pattern);

    expect(routePatterns).toEqual(
      expect.arrayContaining([
        "scripts/generate-db.mjs",
        "src/db/**",
        "scripts/query.mjs",
        "scripts/ingest.mjs",
        "scripts/query.test.mjs",
        "scripts/create-hermes-agent-log.test.mjs",
        "screenshot.spec.ts",
      ]),
    );
  });

  it("generates Tauri Rust validation seed proposals for Ensember-like repos", () => {
    const repo = createEnsemberLikeRepo();
    runPlant({ cwd: repo });
    runInspect({ cwd: repo });

    const routeProposals = readValidationProposals(repo).proposals.filter(
      (proposal) => proposal.kind === "validation-route",
    );
    const routePatterns = routeProposals.map(
      (proposal) => proposal.validation_route.pattern,
    );

    expect(routePatterns).toEqual(
      expect.arrayContaining([
        "src-tauri/src/**",
        "src-tauri/Cargo.toml",
        "src-tauri/Cargo.lock",
      ]),
    );
    expect(routeProposals).toContainEqual(
      expect.objectContaining({
        id: "validation-route:src-tauri-src",
        validation_route: expect.objectContaining({
          rule: expect.objectContaining({
            required: [
              {
                id: "test:tauri",
                command: "cd src-tauri && cargo test",
              },
            ],
          }),
        }),
      }),
    );
  });

  it("generates validation seed proposals for greenhouse-spec itself", () => {
    const repo = createGreenhouseSpecLikeRepo();
    runPlant({ cwd: repo });
    runInspect({ cwd: repo });

    const routePatterns = readValidationProposals(repo).proposals
      .filter((proposal) => proposal.kind === "validation-route")
      .map((proposal) => proposal.validation_route.pattern);

    expect(routePatterns).toEqual(
      expect.arrayContaining([
        "src/proposals/**",
        "src/validation/**",
        "src/plant/**",
        "src/schemas/**",
        "templates/**",
        "package.json",
      ]),
    );
  });

  it("safe dry-run reports intended changes without mutating files", () => {
    const repo = createSourcerLikeRepo();
    runPlant({ cwd: repo });
    runInspect({ cwd: repo });
    const packageJsonBefore = readFileSync(join(repo, "package.json"), "utf8");
    const validationBefore = readGreenhouseFile(repo, "roots/validation.yaml");

    const report = applyProposals({ cwd: repo, dryRun: true, safe: true });

    expect(report.ok).toBe(true);
    expect(report.results.some((result) => result.status === "dry-run")).toBe(true);
    expect(readFileSync(join(repo, "package.json"), "utf8")).toBe(packageJsonBefore);
    expect(readGreenhouseFile(repo, "roots/validation.yaml")).toBe(validationBefore);
  });

  it("safe apply adds missing package scripts and managed validation routes", () => {
    const repo = createSourcerLikeRepo();
    runPlant({ cwd: repo });
    runInspect({ cwd: repo });

    const report = applyProposals({ cwd: repo, safe: true });
    const packageJson = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const validation = readGreenhouseYaml(repo, "roots/validation.yaml");

    expect(report.ok).toBe(true);
    expect(packageJson.scripts["greenhouse"]).toContain("greenhouse-spec/dist/cli.js status");
    expect(packageJson.scripts["greenhouse:tend"]).toContain("greenhouse-spec/dist/cli.js tend");
    expect(validation.paths["frontend-react/src/**"].managed_by).toBe("greenhouse-spec");
    expect(validation.paths["api-spec/src/main/resources/api.yaml"].origin).toBe("repo-shape");
  });

  it("safe apply skips human-owned route collisions", () => {
    const repo = createSourcerLikeRepo();
    runPlant({ cwd: repo });
    const validation = readGreenhouseYaml(repo, "roots/validation.yaml");
    validation.paths = {
      "frontend-react/src/**": {
        mode: "patch",
        required: [{ id: "custom", command: "pnpm custom" }],
      },
    };
    writeGreenhouseYaml(repo, "roots/validation.yaml", validation);
    runInspect({ cwd: repo });

    const report = applyProposals({ cwd: repo, safe: true });
    const updatedValidation = readGreenhouseYaml(repo, "roots/validation.yaml");

    expect(report.results).toContainEqual(
      expect.objectContaining({
        id: "validation-route:frontend-react-src",
        status: "conflict",
      }),
    );
    expect(readValidationProposals(repo).proposals).toContainEqual(
      expect.objectContaining({
        id: "validation-route:frontend-react-src",
        collision: expect.objectContaining({
          human_owned: true,
          explanation: expect.stringContaining("differs from this proposal"),
        }),
      }),
    );
    expect(updatedValidation.paths["frontend-react/src/**"].required).toEqual([
      { id: "custom", command: "pnpm custom" },
    ]);
  });

  it("dismisses proposals through an authored decision ledger", () => {
    const repo = createSourcerLikeRepo();
    runPlant({ cwd: repo });
    runInspect({ cwd: repo });

    const report = dismissProposals({
      cwd: repo,
      ids: ["validation-route:infra-aws"],
      reason: "Infra package is reviewed manually in this repo.",
    });
    runInspect({ cwd: repo });
    const decisions = readGreenhouseYaml(repo, "roots/proposal-decisions.yaml");
    const proposals = readValidationProposals(repo).proposals;

    expect(report.ok).toBe(true);
    expect(report.results).toContainEqual(
      expect.objectContaining({
        id: "validation-route:infra-aws",
        status: "dismissed",
      }),
    );
    expect(decisions.dismissed).toContainEqual(
      expect.objectContaining({
        id: "validation-route:infra-aws",
        idempotency_key: "validation-route:infra-aws/**",
        reason: "Infra package is reviewed manually in this repo.",
      }),
    );
    expect(proposals).toContainEqual(
      expect.objectContaining({
        id: "validation-route:infra-aws",
        status: "skipped",
        reason:
          "Proposal was dismissed in .greenhouse/roots/proposal-decisions.yaml.",
      }),
    );
  });

  it("dismiss dry-run reports intended decision without writing roots", () => {
    const repo = createSourcerLikeRepo();
    runPlant({ cwd: repo });
    runInspect({ cwd: repo });

    const report = dismissProposals({
      cwd: repo,
      ids: ["validation-route:infra-aws"],
      reason: "Infra package is reviewed manually in this repo.",
      dryRun: true,
    });

    expect(report.ok).toBe(true);
    expect(report.results).toContainEqual(
      expect.objectContaining({
        id: "validation-route:infra-aws",
        status: "dry-run",
        message: "Would dismiss proposal validation-route:infra-aws.",
      }),
    );
    expect(existsSync(join(repo, ".greenhouse", "roots", "proposal-decisions.yaml"))).toBe(
      false,
    );
  });

  it("marks equivalent human-owned routes as adoptable", () => {
    const repo = createSourcerLikeRepo();
    runPlant({ cwd: repo });
    const validation = readGreenhouseYaml(repo, "roots/validation.yaml");
    validation.paths = {
      "frontend-react/src/**": frontendRouteRule(),
    };
    writeGreenhouseYaml(repo, "roots/validation.yaml", validation);

    runInspect({ cwd: repo });

    expect(readValidationProposals(repo).proposals).toContainEqual(
      expect.objectContaining({
        id: "validation-route:frontend-react-src",
        status: "adoptable",
      }),
    );
  });

  it("safe apply skips adoptable routes until ownership is explicit", () => {
    const repo = createSourcerLikeRepo();
    runPlant({ cwd: repo });
    const validation = readGreenhouseYaml(repo, "roots/validation.yaml");
    validation.paths = {
      "frontend-react/src/**": frontendRouteRule(),
    };
    writeGreenhouseYaml(repo, "roots/validation.yaml", validation);
    runInspect({ cwd: repo });

    const report = applyProposals({ cwd: repo, safe: true });
    const updatedValidation = readGreenhouseYaml(repo, "roots/validation.yaml");

    expect(report.results).toContainEqual(
      expect.objectContaining({
        id: "validation-route:frontend-react-src",
        status: "skipped",
      }),
    );
    expect(updatedValidation.paths["frontend-react/src/**"].managed_by).toBeUndefined();
  });

  it("adopt dry-run reports matching route ownership without mutating files", () => {
    const repo = createSourcerLikeRepo();
    runPlant({ cwd: repo });
    const validation = readGreenhouseYaml(repo, "roots/validation.yaml");
    validation.paths = {
      "frontend-react/src/**": frontendRouteRule(),
    };
    writeGreenhouseYaml(repo, "roots/validation.yaml", validation);
    runInspect({ cwd: repo });
    const validationBefore = readGreenhouseFile(repo, "roots/validation.yaml");

    const report = adoptProposals({
      cwd: repo,
      ids: ["validation-route:frontend-react-src"],
      dryRun: true,
    });

    expect(report.ok).toBe(true);
    expect(report.results).toContainEqual(
      expect.objectContaining({
        id: "validation-route:frontend-react-src",
        status: "dry-run",
      }),
    );
    expect(readGreenhouseFile(repo, "roots/validation.yaml")).toBe(validationBefore);
  });

  it("adopts matching human-owned routes by adding only Greenhouse metadata", () => {
    const repo = createSourcerLikeRepo();
    runPlant({ cwd: repo });
    const validation = readGreenhouseYaml(repo, "roots/validation.yaml");
    validation.paths = {
      "frontend-react/src/**": frontendRouteRule(),
    };
    writeGreenhouseYaml(repo, "roots/validation.yaml", validation);
    runInspect({ cwd: repo });

    const report = adoptProposals({
      cwd: repo,
      ids: ["validation-route:frontend-react-src"],
    });
    const updatedValidation = readGreenhouseYaml(repo, "roots/validation.yaml");

    expect(report.ok).toBe(true);
    expect(updatedValidation.paths["frontend-react/src/**"]).toMatchObject({
      managed_by: "greenhouse-spec",
      origin: "repo-shape",
      proposal_id: "validation-route:frontend-react-src",
      confidence: "high",
      mode: "patch",
      required: [
        { id: "lint:frontend", command: "pnpm --dir frontend-react lint" },
        { id: "test:frontend", command: "pnpm --dir frontend-react test" },
      ],
    });
  });

  it("safe apply updates managed route entries", () => {
    const repo = createSourcerLikeRepo();
    runPlant({ cwd: repo });
    const validation = readGreenhouseYaml(repo, "roots/validation.yaml");
    validation.paths = {
      "frontend-react/src/**": {
        managed_by: "greenhouse-spec",
        origin: "repo-shape",
        proposal_id: "validation-route:frontend-react-src",
        confidence: "low",
        mode: "patch",
        required: [{ id: "old", command: "pnpm old" }],
        recommended: [],
        manual: [],
      },
    };
    writeGreenhouseYaml(repo, "roots/validation.yaml", validation);
    runInspect({ cwd: repo });

    applyProposals({ cwd: repo, safe: true });
    const updatedValidation = readGreenhouseYaml(repo, "roots/validation.yaml");

    expect(updatedValidation.paths["frontend-react/src/**"].required).toEqual([
      { id: "lint:frontend", command: "pnpm --dir frontend-react lint" },
      { id: "test:frontend", command: "pnpm --dir frontend-react test" },
    ]);
    expect(updatedValidation.paths["frontend-react/src/**"].confidence).toBe("high");
  });

  it("does not leave equivalent managed routes pending", () => {
    const repo = createSourcerLikeRepo();
    runPlant({ cwd: repo });
    const validation = readGreenhouseYaml(repo, "roots/validation.yaml");
    validation.paths = {
      "frontend-react/src/**": {
        managed_by: "greenhouse-spec",
        origin: "repo-shape",
        proposal_id: "validation-route:frontend-react-src",
        confidence: "high",
        ...frontendRouteRule(),
      },
    };
    writeGreenhouseYaml(repo, "roots/validation.yaml", validation);

    runInspect({ cwd: repo });

    expect(readValidationProposals(repo).proposals).toContainEqual(
      expect.objectContaining({
        id: "validation-route:frontend-react-src",
        status: "applied",
      }),
    );
  });
});

function createTinyRepo(): string {
  const repo = createTempRepo("tiny");
  writePackageJson(repo, {
    name: "tiny",
    scripts: {
      test: "node --test",
    },
  });
  return repo;
}

function createDeclarionLikeRepo(): string {
  const repo = createTempRepo("declarion");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writePackageJson(repo, {
    name: "declarion",
    bin: {
      declarion: "./dist/cli.js",
    },
    scripts: {
      build: "vite build",
      lint: "eslint .",
      test: "vitest run",
      typecheck: "tsc -b",
    },
    dependencies: {
      react: "18.3.1",
    },
    devDependencies: {
      typescript: "5.6.3",
      vite: "5.4.10",
      vitest: "2.1.4",
    },
  });
  return repo;
}

function createSourcerLikeRepo(): string {
  const repo = createTempRepo("sourcer");
  writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(
    join(repo, "pnpm-workspace.yaml"),
    ["packages:", "  - frontend-react", "  - api-spec", "  - infra-aws", ""].join("\n"),
  );
  writePackageJson(repo, {
    name: "sourcer-workspace",
    scripts: {
      test: "pnpm --filter frontend-react test",
    },
  });
  mkdirSync(join(repo, "frontend-react", "src"), { recursive: true });
  mkdirSync(join(repo, "api-spec", "src", "main", "resources"), { recursive: true });
  mkdirSync(join(repo, "api-spec", "src", "generated"), { recursive: true });
  mkdirSync(join(repo, "infra-aws", "bin"), { recursive: true });
  mkdirSync(join(repo, "backend-java-serverless", "src", "main", "java"), { recursive: true });
  mkdirSync(join(repo, "backend-java-serverless", "src", "main", "resources", "db", "migration"), { recursive: true });
  writeFileSync(join(repo, "api-spec", "src", "main", "resources", "api.yaml"), "openapi: 3.0.0\n");
  writePackageJson(join(repo, "frontend-react"), {
    name: "frontend-react",
    scripts: {
      build: "vite build",
      lint: "eslint .",
      test: "vitest run",
    },
    dependencies: {
      react: "18.3.1",
    },
    devDependencies: {
      typescript: "5.6.3",
      vite: "5.4.10",
      vitest: "2.1.4",
    },
  });
  writePackageJson(join(repo, "api-spec"), {
    name: "hello-api",
    scripts: {
      build: "openapi-typescript src/main/resources/api.yaml",
    },
  });
  writePackageJson(join(repo, "infra-aws"), {
    name: "infra-aws",
    scripts: {
      build: "tsc",
      test: "vitest run",
    },
    dependencies: {
      "aws-cdk-lib": "2.0.0",
    },
  });
  writeFileSync(
    join(repo, "api-spec", "pom.xml"),
    "<project><artifactId>api-spec</artifactId></project>\n",
  );
  writeFileSync(
    join(repo, "backend-java-serverless", "pom.xml"),
    [
      "<project>",
      "  <parent><artifactId>spring-boot-starter-parent</artifactId></parent>",
      "  <artifactId>backend-java</artifactId>",
      "</project>",
      "",
    ].join("\n"),
  );
  return repo;
}

function createMilibryLikeRepo(): string {
  const repo = createTempRepo("milibry");
  mkdirSync(join(repo, "scripts"), { recursive: true });
  mkdirSync(join(repo, "src", "db"), { recursive: true });
  writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(join(repo, "scripts", "generate-db.mjs"), "export {}\n");
  writeFileSync(join(repo, "scripts", "ingest.mjs"), "export {}\n");
  writeFileSync(join(repo, "scripts", "query.mjs"), "export {}\n");
  writeFileSync(join(repo, "scripts", "query.test.mjs"), "export {}\n");
  writeFileSync(join(repo, "scripts", "create-hermes-agent-log.test.mjs"), "export {}\n");
  writeFileSync(join(repo, "src", "db", "database.ts"), "export {}\n");
  writeFileSync(join(repo, "screenshot.spec.ts"), "export {}\n");
  writePackageJson(repo, {
    name: "milibry",
    scripts: {
      build: "pnpm generate && tsc -b && vite build",
      test: "vitest run",
      generate: "node ./scripts/generate-db.mjs",
      "query:test": "node --test ./scripts/query.test.mjs",
      "hermes:log:test": "node --test ./scripts/create-hermes-agent-log.test.mjs",
      screenshot: "playwright test screenshot.spec.ts --reporter=line",
    },
    dependencies: {
      "@tanstack/react-query": "5.0.0",
      "@tanstack/react-router": "1.0.0",
      "better-sqlite3": "11.0.0",
      react: "18.3.1",
      "react-dom": "18.3.1",
      "styled-components": "6.1.0",
    },
    devDependencies: {
      "@playwright/test": "1.50.0",
      typescript: "5.6.3",
      vite: "5.4.10",
      vitest: "2.1.4",
    },
  });
  return repo;
}

function createEnsemberLikeRepo(): string {
  const repo = createTempRepo("ensember");
  mkdirSync(join(repo, "src"), { recursive: true });
  mkdirSync(join(repo, "src-tauri", "src"), { recursive: true });
  writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(
    join(repo, "src-tauri", "Cargo.toml"),
    ["[package]", 'name = "ensember"', 'version = "0.1.0"', ""].join("\n"),
  );
  writeFileSync(join(repo, "src-tauri", "Cargo.lock"), "# lock\n");
  writePackageJson(repo, {
    name: "ensember",
    scripts: {
      build: "tsc -b && vite build",
      lint: "eslint .",
      test: "vitest run",
      typecheck: "tsc -b --pretty false",
      tauri: "tauri",
      "tauri:dev": "tauri dev",
    },
    dependencies: {
      "@tauri-apps/api": "2.11.0",
      react: "19.2.6",
    },
    devDependencies: {
      "@tauri-apps/cli": "2.11.2",
      typescript: "5.9.3",
      vite: "7.2.4",
      vitest: "4.0.14",
    },
  });
  return repo;
}

function createGreenhouseSpecLikeRepo(): string {
  const repo = createTempRepo("greenhouse-spec");
  for (const directory of [
    "docs",
    "src/commands",
    "src/discovery",
    "src/doctor",
    "src/inspect",
    "src/lifecycle",
    "src/status",
    "src/evidence",
    "src/native-scripts",
    "src/plant",
    "src/proposals",
    "src/schemas",
    "src/templates",
    "src/tend",
    "src/validation",
    "src/verify",
    "templates/installed",
  ]) {
    mkdirSync(join(repo, directory), { recursive: true });
  }
  writeFileSync(join(repo, "README.md"), "# greenhouse-spec\n");
  writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(join(repo, "tsconfig.json"), "{}\n");
  writeFileSync(join(repo, "src", "cli.ts"), "export {}\n");
  writeFileSync(join(repo, "src", "proposals", "build-proposals.ts"), "export {}\n");
  writeFileSync(join(repo, "src", "validation", "route-validation.ts"), "export {}\n");
  writeFileSync(join(repo, "src", "plant", "run-plant.ts"), "export {}\n");
  writeFileSync(join(repo, "src", "schemas", "validation.ts"), "export {}\n");
  writePackageJson(repo, {
    name: "greenhouse-spec",
    scripts: {
      build: "tsc -p tsconfig.json",
      check: "pnpm typecheck && pnpm test && pnpm build",
      test: "vitest run",
      "test:cli": "vitest run tests/cli.test.ts",
      "test:discovery": "vitest run tests/discovery.test.ts",
      "test:doctor": "vitest run tests/doctor.test.ts",
      "test:inspect": "vitest run tests/inspect.test.ts",
      "test:lifecycle": "vitest run tests/lifecycle.test.ts",
      "test:evidence": "vitest run tests/evidence.test.ts",
      "test:native-scripts": "vitest run tests/native-scripts.test.ts",
      "test:plant": "vitest run tests/plant.test.ts",
      "test:proposals": "vitest run tests/proposals.test.ts",
      "test:schemas": "vitest run tests/schemas.test.ts",
      "test:templates": "vitest run tests/templates.test.ts",
      "test:tend": "vitest run tests/tend.test.ts",
      "test:validation": "vitest run tests/validation.test.ts",
      typecheck: "tsc -p tsconfig.json --noEmit",
    },
    devDependencies: {
      typescript: "5.6.3",
      vitest: "2.1.4",
    },
  });
  return repo;
}

function createTempRepo(name: string): string {
  const repo = mkdtempSync(join(tmpdir(), `greenhouse-spec-proposals-${name}-`));
  tempRepos.push(repo);
  return repo;
}

function writePackageJson(repo: string, value: Record<string, unknown>): void {
  writeFileSync(join(repo, "package.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readGreenhouseFile(repo: string, relativePath: string): string {
  return readFileSync(join(repo, ".greenhouse", relativePath), "utf8");
}

function readGreenhouseYaml(repo: string, relativePath: string): any {
  return parseYaml(readGreenhouseFile(repo, relativePath));
}

function writeGreenhouseYaml(repo: string, relativePath: string, value: unknown): void {
  writeFileSync(
    join(repo, ".greenhouse", relativePath),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function frontendRouteRule(): Record<string, unknown> {
  return {
    mode: "patch",
    required: [
      { id: "lint:frontend", command: "pnpm --dir frontend-react lint" },
      { id: "test:frontend", command: "pnpm --dir frontend-react test" },
    ],
    recommended: [],
    manual: [],
  };
}
