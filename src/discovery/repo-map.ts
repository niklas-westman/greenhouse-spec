import { existsSync } from "node:fs";
import { join } from "node:path";

import fg from "fast-glob";

import type { RepoMap } from "../schemas/repo-map.js";

import { discoverAgentFiles } from "./agent-files.js";
import { discoverDocs } from "./docs.js";

const generatedPathReasons: Record<string, string> = {
  "data/": "local/generated data; confirm before editing",
  "dist/": "build output",
  "dist-cli/": "CLI build output",
  "outputs/": "local generated exports",
};

export function discoverRepoMap(cwd: string): RepoMap {
  return {
    schema_version: 1,
    managed_by: "greenhouse-spec",
    generated_at: new Date().toISOString(),
    confidence: "medium",
    source: discoverSourcePaths(cwd),
    tests: discoverTestPaths(cwd),
    docs: discoverDocs(cwd),
    generated: discoverGeneratedPaths(cwd),
    agent_files: discoverAgentFiles(cwd),
  };
}

function discoverSourcePaths(cwd: string): RepoMap["source"] {
  const source: RepoMap["source"] = [];

  if (existsSync(join(cwd, "src"))) {
    source.push({
      path: "src/",
      kind: "application-source",
      confidence: "high",
    });
  }

  return source;
}

function discoverTestPaths(cwd: string): RepoMap["tests"] {
  const testFiles = fg.sync(
    ["src/**/*.test.{ts,tsx,js,jsx}", "tests/**/*.{test,spec}.{ts,tsx,js,jsx}"],
    { cwd, onlyFiles: true },
  );

  if (testFiles.length === 0) {
    return [];
  }

  const tests: RepoMap["tests"] = [];

  if (testFiles.some((file) => file.startsWith("src/"))) {
    tests.push({
      path: "src/**/*.test.ts",
      runner: "vitest",
      confidence: "medium",
    });
  }

  if (testFiles.some((file) => file.startsWith("tests/"))) {
    tests.push({
      path: "tests/**/*.{test,spec}.ts",
      runner: "vitest",
      confidence: "medium",
    });
  }

  return tests;
}

function discoverGeneratedPaths(cwd: string): RepoMap["generated"] {
  return Object.entries(generatedPathReasons)
    .filter(([path]) => existsSync(join(cwd, path)))
    .map(([path, reason]) => ({ path, reason }));
}
