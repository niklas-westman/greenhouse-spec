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
        command: "greenhouse-spec",
        status: "add",
      },
      {
        name: "greenhouse:status",
        command: "greenhouse-spec status",
        status: "add",
      },
      {
        name: "greenhouse:tend",
        command: "greenhouse-spec tend",
        status: "add",
      },
      {
        name: "greenhouse:tend:check",
        command: "greenhouse-spec tend --check",
        status: "add",
      },
      {
        name: "greenhouse:verify:dry",
        command: "greenhouse-spec verify --changed --dry-run",
        status: "add",
      },
      {
        name: "greenhouse:proposals",
        command: "greenhouse-spec proposals",
        status: "add",
      },
      {
        name: "validate:cli",
        command: "pnpm cli:build && pnpm test:cli",
        status: "add",
      },
      {
        name: "prepush",
        command: "pnpm greenhouse:tend",
        status: "add",
      },
    ]);
  });

  it("proposes safe updates for accepted local node CLI aliases", () => {
    const repo = createRepo({
      scripts: {
        greenhouse: "node ../greenhouse/code/greenhouse-spec/dist/cli.js status",
        "greenhouse:tend": "node ../greenhouse/code/greenhouse-spec/dist/cli.js tend",
        "greenhouse:tend:check": "node ../greenhouse/code/greenhouse-spec/dist/cli.js tend --check",
        "greenhouse:verify:dry":
          "node ../greenhouse/code/greenhouse-spec/dist/cli.js verify --changed --dry-run",
        "greenhouse:proposals": "node ../greenhouse/code/greenhouse-spec/dist/cli.js proposals",
        prepush: "pnpm greenhouse:tend",
      },
    });

    expect(proposePackageScripts(repo)).toEqual([
      {
        name: "greenhouse",
        command: "greenhouse-spec",
        status: "update",
        existingCommand: "node ../greenhouse/code/greenhouse-spec/dist/cli.js status",
      },
      {
        name: "greenhouse:tend",
        command: "greenhouse-spec tend",
        status: "update",
        existingCommand: "node ../greenhouse/code/greenhouse-spec/dist/cli.js tend",
      },
      {
        name: "greenhouse:tend:check",
        command: "greenhouse-spec tend --check",
        status: "update",
        existingCommand: "node ../greenhouse/code/greenhouse-spec/dist/cli.js tend --check",
      },
      {
        name: "greenhouse:verify:dry",
        command: "greenhouse-spec verify --changed --dry-run",
        status: "update",
        existingCommand:
          "node ../greenhouse/code/greenhouse-spec/dist/cli.js verify --changed --dry-run",
      },
      {
        name: "greenhouse:proposals",
        command: "greenhouse-spec proposals",
        status: "update",
        existingCommand: "node ../greenhouse/code/greenhouse-spec/dist/cli.js proposals",
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
          name: "greenhouse:tend",
          command: "pnpm greenhouse tend",
          status: "add",
        },
        {
          name: "greenhouse:tend:check",
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
    expect(
      isAcceptedGreenhouseAlias(
        "node ../greenhouse/code/greenhouse-spec/dist/cli.js status",
        "greenhouse-spec",
      ),
    ).toBe(true);
  });

  it("reports collisions instead of overwriting existing scripts", () => {
    const repo = createRepo({
      scripts: {
        "greenhouse:tend": "pnpm custom:tend",
      },
    });

    expect(proposePackageScripts(repo)).toContainEqual({
      name: "greenhouse:tend",
      command: "greenhouse-spec tend",
      status: "collision",
      existingCommand: "pnpm custom:tend",
    });
  });

  it("accepts the previous split prepush gate without rewriting it", () => {
    const repo = createRepo({
      scripts: {
        prepush: "pnpm check:tend && pnpm check:changed:evidence",
      },
    });

    expect(proposePackageScripts(repo)).not.toContainEqual(
      expect.objectContaining({
        name: "prepush",
      }),
    );
  });

  it("does not force new aliases into repos that already have the previous split install", () => {
    const repo = createRepo({
      scripts: {
        "check:greenhouse": "node ../greenhouse/code/greenhouse-spec/dist/cli.js doctor",
        "check:tend": "node ../greenhouse/code/greenhouse-spec/dist/cli.js tend --check",
        "check:changed:evidence":
          "node ../greenhouse/code/greenhouse-spec/dist/cli.js verify --changed --write-evidence",
        prepush: "pnpm check:tend && pnpm check:changed:evidence",
      },
    });

    expect(proposePackageScripts(repo)).toEqual([]);
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
