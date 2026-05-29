import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { GREENHOUSE_SPEC_VERSION } from "../src/version.js";

describe("package version", () => {
  it("keeps the CLI version in sync with package.json", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { version: string };

    expect(GREENHOUSE_SPEC_VERSION).toBe(packageJson.version);
  });
});
