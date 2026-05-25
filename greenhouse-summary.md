# Greenhouse Product Summary

Date: 2026-05-25

## What Greenhouse Is

Greenhouse is repo-local tending infrastructure for agentic engineering.

It is not a planning framework like Spec Kit or OpenSpec. Those help define
what should be built. Greenhouse works around the actual repository while work
happens: it maps the repo, routes validation for changed files, detects
structural drift, records evidence, explains repeated failures, and proposes
safe maintenance updates.

The product goal is:

> Make normal repo work safer without turning every agent session into a
> ceremony.

The everyday workflow should stay small:

```bash
greenhouse-spec status
# work normally
greenhouse-spec tend
```

When Greenhouse reports maintenance work:

```bash
greenhouse-spec proposals
greenhouse-spec apply-proposals --safe
greenhouse-spec tend
```

Advanced/debug surfaces still exist, but they should not be the normal loop:

```bash
greenhouse-spec inspect
greenhouse-spec tend --check
greenhouse-spec verify --changed --dry-run
greenhouse-spec verify --changed --write-evidence
greenhouse-spec evidence prune
greenhouse-spec alignment
```

## How It Works In A Repo

Greenhouse installs a `.greenhouse/` folder and optional package scripts into an
existing repository.

The folder is split by ownership:

```text
.greenhouse/
  roots/                  human-authored repo contract
    validation.yaml       validation routing and risk rules
    docs.yaml             documentation ownership and drift hints
    proposal-decisions.yaml
    rules.md
    authority.md
    protected-boundaries.md

  grown/                  generated/disposable repo intelligence
    repo-shape.yaml
    repo-map.yaml
    command-index.yaml
    risk-index.yaml
    validation-proposals.yaml
    failure-signatures.yaml
    evidence-index.yaml

  evidence/               validation and tending records
  reports/                generated reports
  scripts/                installed helper scripts
  templates/              evidence/report templates
  context/manifest.yaml   agent-readable context routing
```

The important rule:

```text
roots are authored and protected.
grown files are generated and disposable.
evidence and reports are local memory.
```

Greenhouse may rewrite `.greenhouse/grown/**`, append evidence and reports, and
apply only explicit safe proposals. It should not silently mutate authored
roots, human decisions, or package scripts.

## The Main Commands

### `greenhouse-spec status`

`status` is the quiet read-only entry point.

It answers:

- Is Greenhouse installed and healthy?
- Is the repo structurally tended?
- Are there changed files?
- Are changed files covered by validation routes?
- Is validation already evidenced for the current change?
- Are there impact warnings or repeated unresolved failures?
- What should run next?

It reports three states:

```text
pass
  Greenhouse is healthy and there is no unresolved tending context.

degraded
  Greenhouse works, but an agent should not ignore something:
  pending changed validation, repeated failures, stale evidence, or warnings.

fail
  Install health, structural drift, or validation failed.
```

`status` does not write evidence, reports, roots, or generated intelligence.

### `greenhouse-spec tend`

`tend` is the everyday pre-finish command.

It composes the repo-tending flow:

1. Check install/root health.
2. Check structural drift.
3. Route current changed files to validation.
4. Run selected validation commands.
5. Write evidence.
6. Refresh repeated failure observations.
7. Report impact warnings.
8. Summarize proposals and final state.

It can write evidence and reports, but it does not silently update authored
roots or package scripts. Structural repairs go through proposals.

The report is state-first and grouped for agent use:

```text
State
Changed
Validation
Impact
Evidence
Proposals
Repeated Failures
Next
```

Passing reports collapse successful internal detail. Failing reports name the
blocking cause and end with the next useful command or action.

### `greenhouse-spec tend --check`

`tend --check` is the structural-only gate for CI, pre-push, or debugging.

It does not run validation and does not write evidence. It fails when structural
drift needs attention, such as pending/adoptable/conflicting proposals or
missing validation ownership.

### `greenhouse-spec verify --changed --dry-run`

This is the validation explanation surface.

It shows:

- Changed files.
- File groups.
- Routed files.
- Selected commands.
- Route sources and reasons.
- Manual checks.
- Generated files excluded from routing.
- Impact warnings.

This is useful when an agent wants to understand why Greenhouse selected a
particular validation plan.

### `greenhouse-spec verify --changed --write-evidence`

This directly runs changed-file validation and writes evidence. `tend` uses the
same validation and evidence layers, so this command is now more advanced/direct
than everyday.

### `greenhouse-spec inspect`

`inspect` refreshes generated repo intelligence:

- Repo shape.
- Command index.
- Risk index.
- Validation proposals.
- Failure signatures.

Generated intelligence lives under `.greenhouse/grown/**`.

### `greenhouse-spec proposals`

Proposals are how the repo evolves intentionally.

Greenhouse creates proposals when it detects missing or stale maintenance
wiring, such as missing package scripts, missing validation routes, or routes
that could be adopted by Greenhouse.

Proposal states:

```text
pending
  Safe missing wiring exists and can usually be applied.

adoptable
  Human-authored wiring already matches; Greenhouse can add ownership metadata.

conflict
  Human-authored wiring differs; review manually.

applied
  Managed wiring is already present.

skipped
  A proposal was dismissed through an authored decision.
```

Safe application is explicit:

```bash
greenhouse-spec apply-proposals --safe
```

Dismissals are recorded in `.greenhouse/roots/proposal-decisions.yaml` so the
same noise does not keep returning without a visible repo-local decision.

## Validation Routing

Greenhouse routes validation from changed files instead of blindly running every
test command.

Examples:

- Docs-only changes can avoid unrelated app tests.
- CLI changes can run CLI build/tests and typecheck.
- React app changes can run app tests/typecheck/lint.
- Java backend changes can route to Maven validation.
- Tauri/Rust changes can route to Cargo checks.
- API spec changes can become guarded and point at generated clients/docs.
- Unknown source changes do not appear clean; they trigger fallback/guarded
  validation and often proposals for better routing.

Generated Greenhouse artifacts are excluded from validation routing:

```text
.greenhouse/grown/**
.greenhouse/evidence/**
.greenhouse/reports/**
```

They can be dirty without causing product source validation to expand.

## Change-Impact Warnings

Greenhouse does not only ask "what tests should run?"

It also asks:

> What repo assumptions may now be stale?

Impact warnings are quiet signals surfaced in `status`, `tend`,
`verify --dry-run`, and evidence.

Current examples:

- `package.json` scripts changed: setup docs or validation roots may be stale.
- CLI source changed: CLI docs/help examples may be stale.
- API specs changed: generated clients or API docs may need review.
- Env/config schema changed: `.env.example` or deployment docs may be stale.
- Workspace/CI config changed: repo map or validation assumptions may be stale.
- Tauri/Rust paths changed: desktop packaging or native validation may be
  affected.
- Generated output changed: source generator or boundary rule may need review.

When `.greenhouse/roots/docs.yaml` exists, Greenhouse uses its doc ownership map
to name repo-specific docs that may be stale.

Impact warnings are severity-based. They do not automatically block every
change, and Greenhouse does not silently rewrite human prose.

## Evidence

Evidence is repo-local memory.

It records:

- Changed files.
- Routed files.
- Selected commands.
- Route reasons.
- Manual checks.
- Impact warnings.
- Pass/fail results.
- Bounded and redacted failure excerpts.
- Tending state when evidence is written by `tend`.

Evidence is not permission to ignore failures. A repeated or known failure still
fails validation when the command fails. Greenhouse may explain that a failure is
repeated, but it does not turn red into green.

Evidence is summarized through generated indexes so agents do not need to read
every old report.

## Repeated Failures

Greenhouse builds generated failure signatures from recent evidence.

If a command fails in the same recognizable way repeatedly, `status` can become
`degraded` and explain that unresolved failure context exists.

This is useful in repos like Declarion, where an app test repeatedly fails with
`localStorage.clear is not a function`. Greenhouse reports the repeated failure
without weakening validation semantics.

## Documentation Ownership

`.greenhouse/roots/docs.yaml` lets a repo say which docs own which assumptions.

Example ownership:

```yaml
schema_version: 1
tracked_docs:
  - path: README.md
    owns:
      - setup
      - package-scripts
      - validation
```

Greenhouse uses this to make impact warnings more repo-specific. Doctor also
warns if a tracked docs path is missing, so documentation ownership cannot drift
silently.

## Alignment Repos

Greenhouse is tested against three local alignment repos:

```text
Declarion
  Single-package React/Vite plus CLI.
  Expected status is degraded because of a repeated known test failure.

Sourcer
  React workspace plus Java/Maven backend, API, and infra shape.
  Expected status is pass.

Ensember
  React/Vite desktop app with Tauri/Rust/Cargo.
  Expected status is pass.
```

The alignment command is:

```bash
pnpm alignment:check
```

It verifies real repo behavior without mutating target repos:

- Status expectations.
- Structural self-tending.
- Proposal counts.
- Repo-shape discovery.
- Generated-output boundary recognition.
- Validation routing for representative paths.
- Impact warnings.

For Greenhouse development, the standard quality gate is:

```bash
pnpm check
pnpm alignment:check
```

## What Has Been Built So Far

Greenhouse now has:

- A repo-local `.greenhouse/` contract with authored and generated boundaries.
- A concise `status` command with `pass`, `degraded`, and `fail` states.
- A composed `tend` finish gate for everyday work.
- A structural-only `tend --check` gate.
- Changed-file validation routing with explainable dry-run output.
- Change-impact warnings for stale docs/config/spec/generated assumptions.
- Documentation ownership through `.greenhouse/roots/docs.yaml`.
- Evidence records with route reasons, impact warnings, manual checks, tending
  state, and bounded/redacted failure excerpts.
- Evidence indexes and repeated failure signatures.
- Structured proposals with stable IDs, idempotency keys, preconditions,
  collision handling, dismissals, safe apply, and adoption.
- Generated Greenhouse artifacts excluded from product validation routing.
- Real repo alignment against Declarion, Sourcer, and Ensember.
- Documentation for installation, command usage, architecture, proposal flow,
  validation routing, and day-to-day operation.

## What Greenhouse Should Become Next

The next improvements should stay inside the lightweight tending model:

1. Improve readability of `tend` and `verify --dry-run` reports for agents.
2. Add better impact rules only where real repo usage proves value.
3. Make proposal dismissals and decisions easier to review.
4. Improve evidence summarization and pruning before evidence grows noisy.
5. Add portable fixture alignment scenarios so CI can test agentic repo
   situations without local paths.

Avoid for now:

- Background daemons.
- Databases or vector stores.
- Broad automatic mutation.
- A mandatory agent "brief" ceremony.
- Treating known failures as passing.

## North Star

Greenhouse should let developers and agents work normally while the repo itself
becomes harder to leave in a stale or unvalidated state.

The strongest loop is:

```text
status
work normally
tend
propose safe repairs when needed
record evidence
keep the repo understandable for the next session
```

That is the current product shape.
