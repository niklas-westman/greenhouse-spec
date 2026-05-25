# greenhouse-spec

```text
                 greenhouse-spec
              _____________________
             /                     \
            /   repo-aware agent    \
           /     maintenance         \
          /___________________________\
                 ||   ||   ||
                 ||   ||   ||
              ___||___||___||___
             |  roots  grown   |
             | evidence  tend  |
             |_________________|
```

`greenhouse-spec` installs and maintains repo-local AI agent context in
`.greenhouse/`. It is a proof-of-concept for keeping an existing repository's
validation, evidence, and agent-maintenance wiring aligned as the code tree
changes.

Greenhouse is not a feature-planning workflow like Spec Kit or OpenSpec. Those
systems help define what to build. Greenhouse watches the repo around the work:
what changed, what validation should run, which repo areas need new validation
seeds, and whether generated maintenance intelligence has drifted from authored
rules.

For the deeper ownership model, see
[Greenhouse Architecture Contract](docs/architecture-contract.md).

## Documentation

Start with [docs/README.md](docs/README.md) when an AI session needs to learn
the repo. The docs folder separates the product overview from operational detail:

```text
docs/README.md                 start-here index for agents and developers
docs/architecture.md           implementation module map and data flow
docs/architecture-contract.md  ownership boundaries and mutation rules
docs/installation.md           installing Greenhouse into another repo
docs/commands.md               CLI command reference and side effects
docs/proposals.md              proposal states, safe apply, adoption, conflicts
docs/validation-routing.md     changed-file routing and evidence behavior
docs/operating-playbook.md     day-to-day usage and drift repair loop
```

## What It Does

- Plants a small `.greenhouse/` contract into a repository.
- Inspects repo scripts, docs, source paths, generated outputs, and risks.
- Generates structured proposals when maintenance wiring is missing or stale.
- Applies only safe additive changes or explicitly managed route updates.
- Lets human-owned rules be adopted only when they already match Greenhouse.
- Routes changed files to scoped validation commands.
- Writes validation evidence without forcing agents to read every old report.
- Keeps evidence bounded and redacted; evidence is local memory, not permission
  to ignore failing validation.
- Prunes old generated evidence/report files so the folder stays bounded.
- Blocks before push with `tend --check` when structural drift needs attention.

## Core Loop

```bash
greenhouse-spec status
greenhouse-spec init --dry-run
greenhouse-spec init
greenhouse-spec update --dry-run
greenhouse-spec update
greenhouse-spec inspect
greenhouse-spec proposals
greenhouse-spec apply-proposals --safe --dry-run
greenhouse-spec apply-proposals --safe
greenhouse-spec adopt-proposals --id <proposal-id>
greenhouse-spec tend
```

The normal intent is:

```text
status
  One read-only health report for install state, drift, changed-file routing,
  repeated failures, and latest evidence. It reports pass, degraded, or fail.
  Use `status --verbose` for detailed Markdown and `status --json` for stable
  machine-readable output.

init
  Install the base Greenhouse contract in a new target repo.

update
  Refresh generated intelligence, helper scripts, templates, and install metadata.

tend --check
  Is the repo structurally aligned?

inspect
  Refresh generated repo intelligence under .greenhouse/grown/**.

proposals
  Show pending/adoptable/conflict/applied maintenance work.

apply-proposals --safe
  Apply safe missing package scripts and Greenhouse-managed validation routes.

adopt-proposals
  Add Greenhouse ownership metadata to matching human-authored routes.

verify --changed --write-evidence
  Run scoped validation and record proof.

failure signatures
  Explain repeated validation failures from generated evidence without changing
  pass/fail behavior.
```

`status: degraded` means Greenhouse is installed and operational, but there is
unresolved context an agent should not ignore. Examples include changed-file
validation selected but not executed by `status`, or repeated unresolved
failures from generated evidence. Degraded status is advisory and exits
successfully; install or structural failures still return `fail`.

When latest passing evidence exactly covers the current routed files and
commands, `status` treats changed validation as covered. This lets a dirty repo
stay understandable after `verify --changed --write-evidence` has already proven
the current route.

When only generated `.greenhouse/grown/**`, `.greenhouse/evidence/**`, or
`.greenhouse/reports/**` files are dirty, `status` reports that as
`generated-only dirty`; those files do not affect validation routing.

Greenhouse also reports change-impact warnings. These are quiet signals that a
change may stale a repo assumption beyond tests: package scripts may stale setup
docs or validation roots, CLI source may stale CLI docs, API specs may require
generated client review, workspace/CI changes may stale route expectations, and
source changes that fall back to broad validation may need a scoped route. These
warnings are visible in `status`, `tend`, `verify --dry-run`, and evidence.

## The `.greenhouse` Folder

```text
.greenhouse/
  roots/                  human-authored contract
    validation.yaml       validation modes, path routes, risk routes
    rules.md              agent behavior rules
    authority.md          source authority rules
    protected-boundaries.md

  grown/                  generated/disposable repo intelligence
    repo-map.yaml
    repo-shape.yaml
    command-index.yaml
    validation-proposals.yaml
    failure-signatures.yaml
    risk-index.yaml
    evidence-index.yaml

  context/
    manifest.yaml         agent-readable context routing

  evidence/               verification records
  reports/                doctor/tend reports
  scripts/                installed helper scripts
  templates/              local evidence/report templates
```

The most important boundary:

```text
Greenhouse may freely rewrite:
  .greenhouse/grown/**

Greenhouse may append:
  .greenhouse/evidence/**
  .greenhouse/reports/**

Greenhouse may edit authored files only through explicit commands:
  package.json
  .greenhouse/roots/validation.yaml
```

## Proposal States

`inspect` writes `.greenhouse/grown/validation-proposals.yaml`. `proposals`,
`apply-proposals`, `adopt-proposals`, and `tend --check` use that structured
state.

```text
pending
  Missing safe wiring. `apply-proposals --safe` may add it.

adoptable
  A human-owned route already matches the proposal. `adopt-proposals` may add
  Greenhouse metadata without changing commands.

conflict
  Human-owned content differs from the generated proposal. Review manually.

applied
  Greenhouse-managed wiring already matches current discovery.

skipped
  A proposal was intentionally not applied.
```

## Commands

```text
status
  Show one read-only repo health report.

init
  Install the base .greenhouse contract and initial generated indexes.

update
  Refresh generated indexes, helper scripts, templates, and install metadata.

plant
  Lower-level install primitive kept for compatibility.

inspect
  Discover repo shape and rewrite .greenhouse/grown/**.

proposals
  List structured maintenance proposals.

apply-proposals --safe
  Apply missing package scripts and Greenhouse-managed validation routes.
  Human-owned conflicts are never overwritten.

adopt-proposals
  Add Greenhouse ownership metadata to matching human-owned validation routes.
  Route commands are not changed.

tend
  Tend the repository before finishing work. Runs install health, structural
  drift, changed-file validation, evidence writing, and proposal summary.

tend --check
  Run fresh in-memory discovery and fail on pending, adoptable, or conflict
  proposals. Intended as the prepush gate.

verify
  Route changed files through validation.yaml and run selected commands.

doctor
  Validate installed Greenhouse files and command wiring.
```

## Package Scripts

Greenhouse proposes package scripts so repos can run the same maintenance loop
locally:

```json
{
  "greenhouse": "node ../greenhouse/code/greenhouse-spec/dist/cli.js",
  "check:greenhouse": "node ../greenhouse/code/greenhouse-spec/dist/cli.js doctor",
  "check:changed": "node ../greenhouse/code/greenhouse-spec/dist/cli.js verify --changed",
  "check:changed:evidence": "node ../greenhouse/code/greenhouse-spec/dist/cli.js verify --changed --write-evidence",
  "check:tend": "node ../greenhouse/code/greenhouse-spec/dist/cli.js tend --check",
  "prepush": "pnpm check:tend && pnpm check:changed:evidence"
}
```

Repos may keep stricter `prepush` scripts as long as they include the Greenhouse
gate and evidence command.

## Alignment Repos

Greenhouse is currently being shaped against three repo styles:

```text
Declarion
  Single-package React/Vite app with a CLI and domain-specific validation.

Sourcer
  Polyglot workspace with React frontend, Java/Maven backend, API spec, and infra.

Ensember
  React/Vite desktop app with Tauri, Rust/Cargo backend, and local runtime state.
```

This gives Greenhouse a practical spread of repo shapes without trying to solve
every ecosystem at once.

Run the read-only local alignment suite with:

```bash
pnpm alignment:check
```

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm check
node dist/cli.js --help
```

`pnpm check` runs typecheck, tests, and build.

## Design Rules

- Prefer generated indexes over hidden agent memory.
- Keep human-authored roots protected by default.
- Treat generated `.greenhouse/grown/**` files as disposable.
- Keep validation scoped to changed files whenever possible.
- Surface repo drift before push instead of letting broad fallback validation hide it.
- Convert repeated evidence learnings into structured proposals over time.
