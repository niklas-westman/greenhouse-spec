import { describe, expect, it } from "vitest";

import { createProgram } from "../src/cli.js";

describe("greenhouse-spec CLI", () => {
  it("registers the MVP command surface", () => {
    const program = createProgram();

    expect(program.commands.map((command) => command.name()).sort()).toEqual([
      "adopt-proposals",
      "apply-proposals",
      "doctor",
      "inspect",
      "plant",
      "proposals",
      "tend",
      "verify",
    ]);
  });

  it("shows MVP commands in help output", () => {
    const help = createProgram().helpInformation();

    expect(help).toContain("plant");
    expect(help).toContain("doctor");
    expect(help).toContain("inspect");
    expect(help).toContain("verify");
    expect(help).toContain("proposals");
    expect(help).toContain("adopt-proposals");
    expect(help).toContain("apply-proposals");
    expect(help).toContain("tend");
  });
});
