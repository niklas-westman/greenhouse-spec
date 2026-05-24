import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { discoverCommandIndex } from "../src/discovery/scripts.js";
import {
  isAcceptedGreenhouseAlias,
  proposePackageScripts,
} from "../src/native-scripts/package-script-proposals.js";

const tempRepos: string[] = [];
const testDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDirectory, "..");

afterEach(() => {
  for (const repo of tempRepos.splice(0)) {
    rmSync(repo, { recursive: true, force: true });
  }
});

describe("native scripts", () => {
  it("proposes missing greenhouse aliases", () => {
    const repo = createRepo({
      scripts: {
        "cli:build": "tsc -p tsconfig.cli.json",
        "test:cli": "node dist-cli/main.js --help",
      },
    });

    const proposals = proposePackageScripts(repo);

    expect(proposals).toEqual([
      {
        name: "greenhouse",
        command: expect.stringContaining("greenhouse-spec/dist/cli.js"),
        status: "add",
      },
      {
        name: "check:greenhouse",
        command: expect.stringContaining("greenhouse-spec/dist/cli.js doctor"),
        status: "add",
      },
      {
        name: "check:changed",
        command: expect.stringContaining("greenhouse-spec/dist/cli.js verify --changed"),
        status: "add",
      },
      {
        name: "check:changed:evidence",
        command: expect.stringContaining("greenhouse-spec/dist/cli.js verify --changed --write-evidence"),
        status: "add",
      },
      {
        name: "validate:scope",
        command: expect.stringContaining("greenhouse-spec/dist/cli.js verify --paths"),
        status: "add",
      },
      {
        name: "tend",
        command: expect.stringContaining("greenhouse-spec/dist/cli.js tend"),
        status: "add",
      },
      {
        name: "check:tend",
        command: expect.stringContaining("greenhouse-spec/dist/cli.js tend --check"),
        status: "add",
      },
      {
        name: "validate:cli",
        command: "pnpm cli:build && pnpm test:cli",
        status: "add",
      },
      {
        name: "prepush",
        command: "pnpm check:tend && pnpm check:changed:evidence",
        status: "add",
      },
    ]);
  });

  it("proposes safe updates for accepted local node CLI aliases", () => {
    const repo = createRepo({
      scripts: {
        greenhouse: "node ../greenhouse/code/greenhouse-spec/dist/cli.js",
        "check:greenhouse": "node ../greenhouse/code/greenhouse-spec/dist/cli.js doctor",
        "check:changed": "node ../greenhouse/code/greenhouse-spec/dist/cli.js verify --changed",
        "check:changed:evidence":
          "node ../greenhouse/code/greenhouse-spec/dist/cli.js verify --changed --write-evidence",
        "validate:scope": "node ../greenhouse/code/greenhouse-spec/dist/cli.js verify --paths",
        tend: "node ../greenhouse/code/greenhouse-spec/dist/cli.js tend",
        "check:tend": "node ../greenhouse/code/greenhouse-spec/dist/cli.js tend --check",
        prepush: "pnpm check:tend && pnpm check:changed:evidence",
      },
    });

    expect(proposePackageScripts(repo)).toEqual([
      {
        name: "greenhouse",
        command: expect.stringContaining("greenhouse-spec/dist/cli.js"),
        status: "update",
        existingCommand: "node ../greenhouse/code/greenhouse-spec/dist/cli.js",
      },
      {
        name: "check:greenhouse",
        command: expect.stringContaining("greenhouse-spec/dist/cli.js doctor"),
        status: "update",
        existingCommand: "node ../greenhouse/code/greenhouse-spec/dist/cli.js doctor",
      },
      {
        name: "check:changed",
        command: expect.stringContaining("greenhouse-spec/dist/cli.js verify --changed"),
        status: "update",
        existingCommand: "node ../greenhouse/code/greenhouse-spec/dist/cli.js verify --changed",
      },
      {
        name: "check:changed:evidence",
        command: expect.stringContaining(
          "greenhouse-spec/dist/cli.js verify --changed --write-evidence",
        ),
        status: "update",
        existingCommand:
          "node ../greenhouse/code/greenhouse-spec/dist/cli.js verify --changed --write-evidence",
      },
      {
        name: "validate:scope",
        command: expect.stringContaining("greenhouse-spec/dist/cli.js verify --paths"),
        status: "update",
        existingCommand: "node ../greenhouse/code/greenhouse-spec/dist/cli.js verify --paths",
      },
      {
        name: "tend",
        command: expect.stringContaining("greenhouse-spec/dist/cli.js tend"),
        status: "update",
        existingCommand: "node ../greenhouse/code/greenhouse-spec/dist/cli.js tend",
      },
      {
        name: "check:tend",
        command: expect.stringContaining("greenhouse-spec/dist/cli.js tend --check"),
        status: "update",
        existingCommand: "node ../greenhouse/code/greenhouse-spec/dist/cli.js tend --check",
      },
    ]);
  });

  it("accepts quoted local node CLI aliases", () => {
    expect(
      isAcceptedGreenhouseAlias(
        'node "../greenhouse/code/greenhouse-spec/dist/cli.js" tend --check',
        "greenhouse-spec tend --check",
      ),
    ).toBe(true);
  });

  it("proposes self-hosted greenhouse aliases for greenhouse-spec", () => {
    const repo = createRepo({
      name: "greenhouse-spec",
      scripts: {
        build: "tsc -p tsconfig.json",
      },
    });

    expect(proposePackageScripts(repo)).toEqual(
      expect.arrayContaining([
        {
          name: "greenhouse",
          command: "pnpm build && node dist/cli.js",
          status: "add",
        },
        {
          name: "check:greenhouse",
          command: "pnpm greenhouse doctor",
          status: "add",
        },
        {
          name: "check:tend",
          command: "pnpm greenhouse tend --check",
          status: "add",
        },
      ]),
    );
  });

  it("accepts self-hosted greenhouse aliases", () => {
    expect(
      isAcceptedGreenhouseAlias(
        "pnpm build && node dist/cli.js",
        "greenhouse-spec",
      ),
    ).toBe(true);
    expect(
      isAcceptedGreenhouseAlias(
        "pnpm greenhouse verify --changed --write-evidence",
        "greenhouse-spec verify --changed --write-evidence",
      ),
    ).toBe(true);
  });

  it("reports collisions instead of overwriting existing scripts", () => {
    const repo = createRepo({
      scripts: {
        "check:changed": "pnpm custom:changed",
      },
    });

    expect(proposePackageScripts(repo)).toContainEqual({
      name: "check:changed",
      command: expect.stringContaining("greenhouse-spec/dist/cli.js verify --changed"),
      status: "collision",
      existingCommand: "pnpm custom:changed",
    });
  });

  it("indexes repo-native gates without replacing them", () => {
    const repo = createRepo({
      scripts: {
        "check:repo-map": "node scripts/check-repo-map.mjs",
        "test:cli": "node dist-cli/main.js --help",
        "validate:family": "node scripts/validate-family.mjs",
      },
    });

    const commandIds = discoverCommandIndex(repo).commands.map(
      (command) => command.id,
    );

    expect(commandIds).toContain("validate:family");
    expect(commandIds).toContain("test:cli");
    expect(commandIds).toContain("check:repo-map");
  });

  it("ships helper scripts as small greenhouse-spec wrappers", () => {
    const root = join(repoRoot, "templates", "installed", "scripts");

    expect(readFileSync(join(root, "check-changed.mjs"), "utf8")).toContain(
      '"verify", "--changed"',
    );
    expect(readFileSync(join(root, "check-greenhouse.mjs"), "utf8")).toContain(
      '"doctor"',
    );
    expect(readFileSync(join(root, "validate-scope.mjs"), "utf8")).toContain(
      '"verify", "--paths"',
    );
  });
});

function createRepo(packageJson: Record<string, unknown>): string {
  const repo = mkdtempSync(join(tmpdir(), "greenhouse-spec-native-scripts-"));
  tempRepos.push(repo);
  writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify({ name: "fixture", ...packageJson }, null, 2),
    "utf8",
  );
  return repo;
}
