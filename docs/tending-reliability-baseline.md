# Tending Reliability Baseline

Date: 2026-05-25

This file captures the current command behavior before the Tending Reliability
implementation phases change runtime output. It is intentionally concise: the
goal is to preserve the product-level before state, not every line of generated
command output.

## Repo State During Snapshot

The Greenhouse repo was dirty with documentation-only changes:

```text
IMPLEMENTATION_GUIDE.md
greenhouse-summary.md
```

This is useful for the baseline because it shows how Greenhouse currently
handles changed docs files in its own repo.

## `greenhouse-spec status`

Current behavior:

```text
State: degraded
Changed: 2 file(s), 2 routed
Validation: 3 command(s) selected; evidence needed.
Drift: none blocking.
Impact: none.
Repeated failures: none.
Next: greenhouse-spec tend
```

Product observation:

- The concise status output is already useful.
- It correctly directs the agent to `tend`.
- It does not explain why docs files selected broad fallback validation.

## `greenhouse-spec verify --changed --dry-run`

Current behavior:

```text
Mode: patch
Run mode: dry-run
Status: pass

Agent takeaway:
- Coverage: 2/2 file(s) routed for validation.
- Validation: 3 commands selected.
- Manual checks: none.
- Impact warnings: none.
- Next: run greenhouse-spec tend for the normal finish gate, or rerun verify without --dry-run.

Selected commands:
- pnpm typecheck
- pnpm test
- pnpm test:cli

Route explanation:
- mode-rule: Applied patch mode requirements.
- fallback-default: No explicit or inferred route selected commands; using default required validation.
```

Product observation:

- Dry-run already explains fallback routing.
- It is detailed enough for debugging, but the structure can become easier to
  scan.
- The docs files are grouped as `product-source`, which is why broad fallback
  validation is selected.

## `greenhouse-spec tend`

Current behavior:

```text
# Greenhouse Tend Report

Flow: finish-gate
Status: pass

Changed files:
- IMPLEMENTATION_GUIDE.md
- greenhouse-summary.md

Install health:
- pass: doctor found no issues

Validation:
- executed: pnpm typecheck, pnpm test, pnpm test:cli
- evidence written: .greenhouse/evidence/2026-05-25T18-10-20-195Z-verify.md

Impact warnings:
- none

Proposals:
No durable greenhouse updates needed.

Repeated failures:
- none

Self-tending gate:
Total proposals: 22
Pending: 0
Adoptable: 0
Conflicts: 0
No structural drift found.
```

Product observation:

- The command is functionally correct.
- The report is too implementation-shaped for the intended finish-line product
  experience.
- The most important Phase 1 improvement is to make `tend` state-first,
  grouped, shorter on success, and explicit about the next action.

## `greenhouse-spec proposals`

Current behavior:

```text
Status: pass
Total: 22
Pending: 0
Adoptable: 0
Conflicts: 0
Applied: 22
Skipped: 0
```

Product observation:

- The proposal system is healthy.
- The output is still long because it lists every applied route.
- Later proposal UX work should group/collapse applied proposals by default.

## `greenhouse-spec evidence prune --dry-run`

Current behavior:

```text
Mode: dry-run
Retention: latest 20 markdown files per generated record folder

Folders:
- .greenhouse/evidence

Pruned:
- none
```

Product observation:

- Prune exists and is clear.
- It does not yet explain preserved records or why they are kept.

## Baseline Decision

The documentation baseline should be committed before runtime implementation
starts. Generated evidence and generated indexes created while capturing this
baseline are not part of the baseline commit.

The first runtime implementation phase should begin from a clean worktree with:

- `IMPLEMENTATION_GUIDE.md`
- `greenhouse-summary.md`
- `docs/tending-reliability-baseline.md`

committed together.
