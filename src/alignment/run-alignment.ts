import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { discoverRepoShape } from "../discovery/repo-shape.js";
import { findPackageRoot } from "../filesystem/package-root.js";
import { buildValidationProposals } from "../proposals/build-proposals.js";
import { runStatus, type HealthState } from "../status/run-status.js";
import { runTend, type TendState } from "../tend/run-tend.js";
import { runVerify } from "../verify/run-verify.js";

export type AlignmentRepoName = "declarion" | "sourcer" | "ensember";

export type AlignmentCheckState = "pass" | "fail";

export type AlignmentCheck = {
  id: string;
  state: AlignmentCheckState;
  summary: string;
};

export type AlignmentRepoReport = {
  name: string;
  path: string;
  ok: boolean;
  checks: AlignmentCheck[];
};

export type AlignmentReport = {
  ok: boolean;
  repos: AlignmentRepoReport[];
};

type VerifyScenario = {
  id: string;
  path: string;
  commands: string[];
  excludedCommands?: string[];
  mode?: "patch" | "growth" | "guarded";
  manualChecks?: string[];
};

type ImpactScenario = {
  id: string;
  path: string;
  warnings: Array<{
    id: string;
    severity?: "advisory" | "warning" | "guarded" | "blocking";
  }>;
};

type TendScenario = {
  expectedState: TendState;
  validationExecuted: boolean;
  evidenceWritten: boolean;
};

export type AlignmentRepoContract = {
  name: string;
  path: string;
  expectedStatus: HealthState[];
  expectedShapes?: string[];
  expectedGenerated?: Array<{
    path: string;
    reason: string;
  }>;
  tend?: TendScenario;
  impact?: ImpactScenario[];
  verify: VerifyScenario[];
};

export function defaultAlignmentContracts(): AlignmentRepoContract[] {
  const projectsRoot = dirname(dirname(dirname(findPackageRoot(import.meta.url))));

  return [
    {
      name: "declarion",
      path: join(projectsRoot, "declarion"),
      expectedStatus: ["pass"],
      impact: [
        {
          id: "package-script-impact",
          path: "package.json",
          warnings: [{ id: "impact.package-scripts-docs", severity: "warning" }],
        },
      ],
      verify: [
        {
          id: "app-route",
          path: "src/App.tsx",
          commands: ["pnpm format:check", "pnpm typecheck", "pnpm test"],
          excludedCommands: ["pnpm test:cli"],
        },
      ],
    },
    {
      name: "sourcer",
      path: join(projectsRoot, "sourcer"),
      expectedStatus: ["pass"],
      impact: [
        {
          id: "package-script-impact",
          path: "package.json",
          warnings: [{ id: "impact.package-scripts-docs", severity: "warning" }],
        },
      ],
      verify: [
        {
          id: "frontend-route",
          path: "frontend-react/src/App.tsx",
          commands: ["pnpm lint:frontend", "pnpm test:frontend"],
        },
        {
          id: "backend-route",
          path: "backend-java-serverless/src/main/java/example/App.java",
          commands: ["pnpm test:backend"],
        },
      ],
    },
    {
      name: "ensember",
      path: join(projectsRoot, "ensember", "code", "ensember"),
      expectedStatus: ["pass"],
      expectedShapes: ["frontend-react", "rust-cargo", "tauri"],
      expectedGenerated: [
        {
          path: "src-tauri/target/",
          reason: "Rust/Cargo build output",
        },
      ],
      impact: [
        {
          id: "tauri-impact",
          path: "src-tauri/src/orchestration/runtime.rs",
          warnings: [{ id: "impact.tauri-packaging", severity: "advisory" }],
        },
      ],
      verify: [
        {
          id: "app-route",
          path: "src/app.tsx",
          commands: ["pnpm lint", "pnpm typecheck", "pnpm test"],
          excludedCommands: ["pnpm format:check"],
        },
        {
          id: "tauri-source-route",
          path: "src-tauri/src/orchestration/runtime.rs",
          commands: ["cd src-tauri && cargo test"],
        },
        {
          id: "tauri-manifest-route",
          path: "src-tauri/Cargo.toml",
          mode: "guarded",
          commands: [
            "cd src-tauri && cargo test",
            "pnpm typecheck",
            "pnpm test",
            "pnpm build",
          ],
          manualChecks: [
            "tauri-runtime-review",
            "human-risk-review",
          ],
        },
      ],
    },
  ];
}

export function runAlignment(options: {
  repos?: string[];
  contracts?: AlignmentRepoContract[];
} = {}): AlignmentReport {
  const contracts = options.contracts ?? defaultAlignmentContracts();
  const selected = options.repos?.length
    ? contracts.filter((contract) =>
        options.repos?.some((repo) => repo === contract.name || resolve(repo) === resolve(contract.path)),
      )
    : contracts;
  const reports = selected.map(runRepoAlignment);

  return {
    ok: reports.every((report) => report.ok),
    repos: reports,
  };
}

export function formatAlignmentReport(report: AlignmentReport): string {
  const lines = [
    "# Greenhouse Alignment Report",
    "",
    `Status: ${report.ok ? "pass" : "fail"}`,
    "",
    "## Repositories",
    "",
  ];

  for (const repo of report.repos) {
    lines.push(`### ${repo.name}`);
    lines.push("");
    lines.push(`Path: ${repo.path}`);
    lines.push(`Status: ${repo.ok ? "pass" : "fail"}`);
    lines.push("");

    for (const check of repo.checks) {
      lines.push(`- ${check.state}: ${check.id} - ${check.summary}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

export function formatAlignmentJsonReport(report: AlignmentReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function runRepoAlignment(contract: AlignmentRepoContract): AlignmentRepoReport {
  const checks: AlignmentCheck[] = [];

  if (!existsSync(contract.path)) {
    return {
      name: contract.name,
      path: contract.path,
      ok: false,
      checks: [
        {
          id: "repo-exists",
          state: "fail",
          summary: "repository path does not exist.",
        },
      ],
    };
  }

  checks.push(...safeCheck("status", () => checkStatus(contract)));
  checks.push(...safeCheck("self-tending", () => checkSelfTending(contract)));
  const tendScenario = contract.tend;
  if (tendScenario) {
    checks.push(...safeCheck("tend", () => checkTend(contract, tendScenario)));
  }
  checks.push(...safeCheck("proposals", () => checkProposals(contract)));
  checks.push(...safeCheck("repo-shape", () => checkRepoShape(contract)));

  for (const scenario of contract.impact ?? []) {
    checks.push(...safeCheck(`impact:${scenario.id}`, () =>
      checkImpactScenario(contract, scenario),
    ));
  }

  for (const scenario of contract.verify) {
    checks.push(...safeCheck(`verify:${scenario.id}`, () =>
      checkVerifyScenario(contract, scenario),
    ));
  }

  return {
    name: contract.name,
    path: contract.path,
    ok: checks.every((check) => check.state === "pass"),
    checks,
  };
}

function safeCheck(id: string, check: () => AlignmentCheck[]): AlignmentCheck[] {
  try {
    return check();
  } catch (error) {
    return [
      {
        id,
        state: "fail",
        summary: error instanceof Error ? error.message : String(error),
      },
    ];
  }
}

function checkStatus(contract: AlignmentRepoContract): AlignmentCheck[] {
  const status = runStatus({ cwd: contract.path });
  const matches = contract.expectedStatus.includes(status.overallStatus);

  return [
    {
      id: "status",
      state: matches ? "pass" : "fail",
      summary: `expected ${contract.expectedStatus.join(" or ")}, got ${status.overallStatus}.`,
    },
  ];
}

function checkSelfTending(contract: AlignmentRepoContract): AlignmentCheck[] {
  const tend = runTend({ cwd: contract.path, check: true });

  return [
    {
      id: "self-tending",
      state: tend.ok ? "pass" : "fail",
      summary: tend.ok
        ? "no blocking structural drift."
        : `${tend.selfTending?.blocking.length ?? 0} blocking proposal(s).`,
    },
  ];
}

function checkTend(
  contract: AlignmentRepoContract,
  scenario: TendScenario,
): AlignmentCheck[] {
  const tend = runTend({ cwd: contract.path });
  const failures = [
    ...(tend.state === scenario.expectedState
      ? []
      : [`expected state ${scenario.expectedState}, got ${tend.state}`]),
    ...(tend.validation.executed === scenario.validationExecuted
      ? []
      : [
          `expected validation executed ${String(scenario.validationExecuted)}, got ${String(tend.validation.executed)}`,
        ]),
    ...(tend.validation.evidenceWritten === scenario.evidenceWritten
      ? []
      : [
          `expected evidence written ${String(scenario.evidenceWritten)}, got ${String(tend.validation.evidenceWritten)}`,
        ]),
  ];

  return [
    {
      id: "tend",
      state: failures.length === 0 ? "pass" : "fail",
      summary: failures.length === 0
        ? `finish gate returned ${tend.state}.`
        : failures.join("; "),
    },
  ];
}

function checkProposals(contract: AlignmentRepoContract): AlignmentCheck[] {
  const repoShape = discoverRepoShape(contract.path);
  const proposals = buildValidationProposals({
    cwd: contract.path,
    repoShape,
  });
  const blocking = proposals.proposals.filter((proposal) =>
    ["pending", "adoptable", "conflict"].includes(proposal.status),
  );

  return [
    {
      id: "proposals",
      state: blocking.length === 0 ? "pass" : "fail",
      summary: blocking.length === 0
        ? `${proposals.proposals.length} proposal(s), none blocking.`
        : `${blocking.length} blocking proposal(s): ${blocking.map((proposal) => proposal.id).join(", ")}.`,
    },
  ];
}

function checkRepoShape(contract: AlignmentRepoContract): AlignmentCheck[] {
  const repoShape = discoverRepoShape(contract.path);
  const checks: AlignmentCheck[] = [];

  if (contract.expectedShapes?.length) {
    const missing = contract.expectedShapes.filter(
      (shape) => !repoShape.shape.includes(shape),
    );
    checks.push({
      id: "repo-shape",
      state: missing.length === 0 ? "pass" : "fail",
      summary: missing.length === 0
        ? `detected ${contract.expectedShapes.join(", ")}.`
        : `missing shape(s): ${missing.join(", ")}.`,
    });
  }

  for (const expected of contract.expectedGenerated ?? []) {
    const found = repoShape.generated.some(
      (item) => item.path === expected.path && item.reason === expected.reason,
    );
    checks.push({
      id: `generated:${expected.path}`,
      state: found ? "pass" : "fail",
      summary: found
        ? `${expected.path} is ${expected.reason}.`
        : `expected ${expected.path} as ${expected.reason}.`,
    });
  }

  return checks.length > 0
    ? checks
    : [
        {
          id: "repo-shape",
          state: "pass",
          summary: "no repo-shape assertions for this repository.",
        },
      ];
}

function checkImpactScenario(
  contract: AlignmentRepoContract,
  scenario: ImpactScenario,
): AlignmentCheck[] {
  const verify = runVerify({
    cwd: contract.path,
    paths: [scenario.path],
    dryRun: true,
  });
  const failures = scenario.warnings.flatMap((expected) => {
    const warning = verify.impactWarnings.find((item) => item.id === expected.id);
    if (!warning) {
      return [`missing impact warning ${expected.id}`];
    }
    if (expected.severity && warning.severity !== expected.severity) {
      return [
        `expected impact warning ${expected.id} severity ${expected.severity}, got ${warning.severity}`,
      ];
    }
    return [];
  });

  return [
    {
      id: `impact:${scenario.id}`,
      state: failures.length === 0 ? "pass" : "fail",
      summary: failures.length === 0
        ? `${scenario.path} produced expected impact warning(s).`
        : failures.join("; "),
    },
  ];
}

function checkVerifyScenario(
  contract: AlignmentRepoContract,
  scenario: VerifyScenario,
): AlignmentCheck[] {
  const verify = runVerify({
    cwd: contract.path,
    paths: [scenario.path],
    dryRun: true,
  });
  const commands = verify.route.commands.map((command) => command.command);
  const manualChecks = verify.route.manualChecks.map((check) => check.id);
  const missingCommands = scenario.commands.filter(
    (command) => !commands.includes(command),
  );
  const excludedCommands = (scenario.excludedCommands ?? []).filter(
    (command) => commands.includes(command),
  );
  const missingManualChecks = (scenario.manualChecks ?? []).filter(
    (check) => !manualChecks.includes(check),
  );
  const modeMismatch = scenario.mode && verify.route.mode !== scenario.mode;
  const failures = [
    ...missingCommands.map((command) => `missing command ${command}`),
    ...excludedCommands.map((command) => `unexpected command ${command}`),
    ...missingManualChecks.map((check) => `missing manual check ${check}`),
    ...(modeMismatch ? [`expected mode ${scenario.mode}, got ${verify.route.mode}`] : []),
  ];

  return [
    {
      id: `verify:${scenario.id}`,
      state: failures.length === 0 ? "pass" : "fail",
      summary: failures.length === 0
        ? `${scenario.path} selected expected route.`
        : failures.join("; "),
    },
  ];
}
