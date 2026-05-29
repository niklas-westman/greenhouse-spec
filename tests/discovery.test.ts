import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverAgentFiles } from "../src/discovery/agent-files.js";
import { detectPackageManager } from "../src/discovery/package-manager.js";
import { discoverRepoMap } from "../src/discovery/repo-map.js";
import { discoverRepoShape } from "../src/discovery/repo-shape.js";
import { discoverRiskIndex } from "../src/discovery/risks.js";
import { discoverCommandIndex } from "../src/discovery/scripts.js";

const tempRepos: string[] = [];

afterEach(() => {
  for (const repo of tempRepos.splice(0)) {
    rmSync(repo, { recursive: true, force: true });
  }
});

describe("discovery", () => {
  it("detects package managers from lockfiles and package metadata", () => {
    const pnpmRepo = createTempRepo();
    writeFileSync(join(pnpmRepo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    expect(detectPackageManager(pnpmRepo)).toBe("pnpm");

    const npmRepo = createTempRepo();
    writeFileSync(join(npmRepo, "package-lock.json"), "{}\n");
    expect(detectPackageManager(npmRepo)).toBe("npm");

    const metadataRepo = createTempRepo();
    writePackageJson(metadataRepo, { packageManager: "pnpm@10.12.1" });
    expect(detectPackageManager(metadataRepo)).toBe("pnpm");

    const noLockRepo = createTempRepo();
    expect(detectPackageManager(noLockRepo)).toBeNull();
  });

  it("indexes package scripts as command entries", () => {
    const repo = createTempRepo();
    writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    writePackageJson(repo, {
      scripts: {
        build: "vite build",
        check: "pnpm typecheck && pnpm test",
        test: "vitest run",
        typecheck: "tsc -b",
      },
    });

    const commandIndex = discoverCommandIndex(repo);

    expect(commandIndex.package_manager).toBe("pnpm");
    expect(commandIndex.commands.map((command) => command.id)).toEqual([
      "build",
      "check",
      "test",
      "typecheck",
    ]);
    expect(commandIndex.commands.map((command) => command.command)).toContain(
      "pnpm check",
    );
  });

  it("detects source, test, docs, generated paths, and agent files", () => {
    const repo = createTempRepo();
    mkdirSync(join(repo, "src"), { recursive: true });
    mkdirSync(join(repo, "docs"), { recursive: true });
    mkdirSync(join(repo, "prep-docs"), { recursive: true });
    mkdirSync(join(repo, "data"), { recursive: true });
    mkdirSync(join(repo, "outputs"), { recursive: true });
    mkdirSync(join(repo, "dist"), { recursive: true });
    mkdirSync(join(repo, "dist-cli"), { recursive: true });
    mkdirSync(join(repo, ".github"), { recursive: true });
    writeFileSync(join(repo, "README.md"), "# Fixture\n");
    writeFileSync(join(repo, "AGENTS.md"), "# Instructions\n");
    writeFileSync(
      join(repo, ".github", "copilot-instructions.md"),
      "# Copilot\n",
    );
    writeFileSync(join(repo, "src", "app.test.ts"), "test('ok', () => {})\n");

    const repoMap = discoverRepoMap(repo);

    expect(repoMap.source.map((entry) => entry.path)).toContain("src/");
    expect(repoMap.tests.map((entry) => entry.path)).toContain("src/**/*.test.ts");
    expect(repoMap.docs.map((entry) => entry.path)).toEqual([
      "README.md",
      "docs/",
      "prep-docs/",
    ]);
    expect(repoMap.generated.map((entry) => entry.path)).toEqual([
      "data/",
      "dist/",
      "dist-cli/",
      "outputs/",
    ]);
    expect(discoverAgentFiles(repo)).toContainEqual({
      path: "AGENTS.md",
      present: true,
    });
    expect(discoverAgentFiles(repo)).toContainEqual({
      path: ".github/copilot-instructions.md",
      present: true,
    });
  });

  it("detects guarded domain risk paths", () => {
    const repo = createTempRepo();
    mkdirSync(join(repo, "src", "engine", "sources"), { recursive: true });
    mkdirSync(join(repo, "src", "engine", "sru"), { recursive: true });
    mkdirSync(join(repo, "src", "engine", "tax"), { recursive: true });
    mkdirSync(join(repo, "src", "engine", "annual-report"), { recursive: true });
    mkdirSync(join(repo, "src", "engine", "closeout"), { recursive: true });
    mkdirSync(join(repo, "src", "engine", "validation"), { recursive: true });
    mkdirSync(join(repo, "src", "shared", "schemas"), { recursive: true });

    expect(discoverRiskIndex(repo).risks).toEqual([
      expect.objectContaining({
        id: "generated-output-contract",
        paths: ["src/engine/sru/**"],
      }),
      expect.objectContaining({
        id: "official-source-change",
        paths: ["src/engine/sources/**"],
      }),
      expect.objectContaining({
        id: "financial-calculation",
        paths: ["src/engine/tax/**"],
      }),
      expect.objectContaining({
        id: "financial-reporting-output",
        paths: ["src/engine/annual-report/**"],
      }),
      expect.objectContaining({
        id: "closeout-output-contract",
        paths: ["src/engine/closeout/**"],
      }),
      expect.objectContaining({
        id: "readiness-gate-contract",
        paths: ["src/engine/validation/**"],
      }),
      expect.objectContaining({
        id: "shared-schema-contract",
        paths: ["src/shared/schemas/**"],
      }),
    ]);
  });

  it("detects workspace, Maven, frontend, API spec, infra, generated paths, and gaps", () => {
    const repo = createTempRepo();
    writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    writeFileSync(
      join(repo, "pnpm-workspace.yaml"),
      ["packages:", "  - frontend-react", "  - api-spec", "  - infra-aws", ""].join("\n"),
    );
    writePackageJson(repo, {
      name: "sourcer-workspace",
      packageManager: "pnpm@10.12.1",
      scripts: {
        test: "pnpm --filter frontend-react test",
      },
    });
    mkdirSync(join(repo, "frontend-react", "src"), { recursive: true });
    mkdirSync(join(repo, "api-spec", "src", "main", "resources"), { recursive: true });
    mkdirSync(join(repo, "api-spec", "src", "generated"), { recursive: true });
    mkdirSync(join(repo, "infra-aws", "bin"), { recursive: true });
    mkdirSync(join(repo, "backend-java-serverless"), { recursive: true });
    mkdirSync(join(repo, "backend-java-serverless", "target"), { recursive: true });
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
      join(repo, "backend-java-serverless", "pom.xml"),
      [
        "<project>",
        "  <parent>",
        "    <artifactId>spring-boot-starter-parent</artifactId>",
        "  </parent>",
        "  <artifactId>backend-java</artifactId>",
        "</project>",
        "",
      ].join("\n"),
    );

    const repoShape = discoverRepoShape(repo);

    expect(repoShape.shape).toEqual([
      "workspace",
      "frontend-react",
      "java-maven",
      "api-spec",
      "infra",
      "polyglot",
    ]);
    expect(repoShape.packages).toContainEqual(
      expect.objectContaining({
        path: "frontend-react/",
        kind: expect.arrayContaining(["workspace-package", "frontend"]),
        commands: expect.objectContaining({
          test: "pnpm --dir frontend-react test",
        }),
      }),
    );
    expect(repoShape.java_modules).toContainEqual(
      expect.objectContaining({
        path: "backend-java-serverless/",
        artifact_id: "backend-java",
        commands: expect.objectContaining({
          test: "cd backend-java-serverless && mvn test",
        }),
      }),
    );
    expect(repoShape.generated.map((entry) => entry.path)).toEqual([
      "backend-java-serverless/target/",
      "api-spec/src/generated/",
    ]);
    expect(repoShape.gaps.map((gap) => gap.id)).toContain("polyglot-routing-review");
  });

  it("detects Tauri Rust modules and Cargo build output", () => {
    const repo = createTempRepo();
    writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    mkdirSync(join(repo, "src-tauri", "src"), { recursive: true });
    mkdirSync(join(repo, "src-tauri", "target"), { recursive: true });
    writeFileSync(
      join(repo, "src-tauri", "Cargo.toml"),
      ["[package]", 'name = "ensember"', 'version = "0.1.0"', ""].join("\n"),
    );
    writePackageJson(repo, {
      name: "ensember",
      scripts: {
        tauri: "tauri",
        "tauri:dev": "tauri dev",
        lint: "eslint .",
        test: "vitest run",
        typecheck: "tsc -b",
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

    const repoShape = discoverRepoShape(repo);

    expect(repoShape.shape).toEqual([
      "single-package",
      "frontend-react",
      "rust-cargo",
      "tauri",
      "polyglot",
    ]);
    expect(repoShape.packages[0]).toMatchObject({
      path: ".",
      kind: expect.arrayContaining(["frontend", "desktop"]),
      languages: expect.arrayContaining(["typescript", "rust"]),
      frameworks: expect.arrayContaining(["react", "vite", "vitest", "tauri"]),
    });
    expect(repoShape.rust_modules).toContainEqual(
      expect.objectContaining({
        path: "src-tauri/",
        package_name: "ensember",
        commands: expect.objectContaining({
          test: "cd src-tauri && cargo test",
        }),
      }),
    );
    expect(repoShape.generated).toContainEqual({
      path: "src-tauri/target/",
      reason: "Rust/Cargo build output",
      confidence: "high",
    });
  });
});

function createTempRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "greenhouse-spec-discovery-"));
  tempRepos.push(repo);
  return repo;
}

function writePackageJson(repo: string, value: Record<string, unknown>): void {
  writeFileSync(join(repo, "package.json"), JSON.stringify(value, null, 2), "utf8");
}
