import { describe, expect, it } from "vitest";

import { createProgram } from "../src/cli.js";

describe("greenhouse-spec CLI", () => {
  it("registers the MVP command surface", () => {
    const program = createProgram();

    expect(program.commands.map((command) => command.name()).sort()).toEqual([
      "adopt-proposals",
      "alignment",
      "apply-proposals",
      "doctor",
      "evidence",
      "init",
      "inspect",
      "plant",
      "proposals",
      "status",
      "tend",
      "update",
      "verify",
    ]);
  });

  it("shows MVP commands in help output", () => {
    const help = createProgram().helpInformation();

    expect(help).toContain("init");
    expect(help).toContain("plant");
    expect(help).toContain("update");
    expect(help).toContain("status");
    expect(help).toContain("doctor");
    expect(help).toContain("inspect");
    expect(help).toContain("verify");
    expect(help).toContain("proposals");
    expect(help).toContain("adopt-proposals");
    expect(help).toContain("alignment");
    expect(help).toContain("apply-proposals");
    expect(help).toContain("tend");
    expect(help).toContain("evidence");
  });

  it("describes tend as the pre-finish tending surface", () => {
    const tendCommand = createProgram().commands.find(
      (command) => command.name() === "tend",
    );

    expect(tendCommand?.description()).toBe(
      "Tend the repository before finishing work.",
    );
    expect(tendCommand?.options.map((option) => option.long)).toContain("--check");
    expect(tendCommand?.options.map((option) => option.long)).toContain("--no-prune");
  });

  it("exposes status verbose and json output modes", () => {
    const statusCommand = createProgram().commands.find(
      (command) => command.name() === "status",
    );

    expect(statusCommand?.options.map((option) => option.long)).toContain("--json");
    expect(statusCommand?.options.map((option) => option.long)).toContain("--verbose");
  });
});
