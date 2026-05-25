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

## Phase 1 After Snapshot: `greenhouse-spec tend`

After Phase 1, `tend` keeps the same behavior but renders as a finish-line
report:

```text
# Greenhouse Tend

State: warning
Flow: finish-gate

Changed:
  5 files

Validation:
  pass: pnpm test:templates
  pass: pnpm typecheck
  pass: pnpm test:tend

Impact:
  none

Evidence:
  written: .greenhouse/evidence/2026-05-25T18-15-18-148Z-verify.md

Proposals:
  context: Documentation changed; consider whether context manifest entries should be proposed.
  structural drift: none

Repeated Failures:
  none

Next:
  review durable proposals before finishing
```

Product improvement:

- State is the first thing an agent sees.
- Validation results are compact and command-oriented.
- Successful install/self-tending internals are collapsed.
- The report ends with the next useful action.
- Detailed route reasoning remains in `verify --changed --dry-run`.

## Phase 2 After Snapshot: `greenhouse-spec verify --changed --dry-run`

After Phase 2, dry-run verification keeps the same routing behavior but renders
as a clearer explanation report:

```text
# Greenhouse Verify

Mode: patch
Run mode: dry-run
Status: pass

Changed:
  2 files considered
  2 routed for validation

Groups:
  product-source: src/verify/run-verify.ts, tests/validation.test.ts

Impact:
  none

Routing:
  coverage: 2/2 file(s) routed
  validation: 2 commands selected
  path-rule: Matched path rule "src/verify/**".

Commands:
  not_run: pnpm test:validation
    source: path-rule (src/verify/**)
    reason: Matched path rule "src/verify/**".

Skipped / Excluded:
  none

Next:
  run greenhouse-spec tend for the normal finish gate, or rerun verify without --dry-run.
```

Product improvement:

- Impact warnings appear before command execution detail.
- Route coverage and fallback/guarded explanations live in one `Routing`
  section.
- Every selected command remains tied to source and reason metadata.
- Generated Greenhouse artifacts are listed as excluded instead of polluting
  product validation routing.
- The report is now a more reliable diagnostic companion to the shorter
  `tend` finish gate.

## Phase 3 After Snapshot: Impact Severity Discipline

After Phase 3, impact warnings carry explicit resolution hints and blocking
warnings affect repo health:

```text
Impact:
  blocking: selected validation command "pnpm test" references missing package script "test".
    resolution: Add package script "test" to package.json or update .greenhouse/roots/validation.yaml.

Status:
  State: fail
  Next: review blocking impact warnings before finishing work

Tend:
  State: fail
  Blocking: blocking impact warnings must be resolved.
  Validation: not run
```

Product improvement:

- Advisory and warning documentation drift remains visible but non-blocking.
- Guarded findings remain review-oriented and do not silently mutate docs.
- Blocking findings now stop `tend` before executing validation when the
  validation plan itself is known stale.
- Evidence records include impact warning resolutions, giving future agents a
  repair path without opening generated YAML.

## Phase 4 After Snapshot: Evidence Summary And Prune Reliability

After Phase 4, generated evidence memory has a compact summary and safer prune
behavior:

```yaml
summary:
  latest_tending_state: warning
  latest_tending_evidence: evidence/2026-05-25T...
  latest_failures_by_command:
    - command: pnpm test
      evidence: evidence/failed-test.md
      notes: TypeError: localStorage.clear is not a function
```

Prune reports now explain retained records:

```text
Kept:
  kept: .greenhouse/evidence/latest-pass.md
    reason: within latest 20 record(s)
  kept: .greenhouse/evidence/failed-test.md
    reason: latest failure evidence for pnpm test
```

Product improvement:

- Agents can inspect `.greenhouse/grown/evidence-index.yaml` before opening old
  evidence records.
- Pruning still removes old generated records, but keeps latest failure context
  per command.
- Known/repeated failures remain failing when validation fails; pruning only
  preserves explanation context.

## Phase 5 After Snapshot: Proposal Review UX Reliability

After Phase 5, proposal output is grouped by review state:

```text
Pending
Adoptable
Conflicts
Applied
Skipped
```

Safe apply reports now include a summary:

```text
Summary:
  changed: 4
  skipped: 18
  conflicts: 0
```

Product improvement:

- Agents can see the exact proposal bucket that needs action without opening
  `.greenhouse/grown/validation-proposals.yaml`.
- Conflict output includes the human-owned collision explanation.
- Dismissed/skipped proposals point to
  `.greenhouse/roots/proposal-decisions.yaml`.

## Phase 6 After Snapshot: Portable Fixture Alignment

After Phase 6, Greenhouse has a CI-safe alignment suite:

```bash
pnpm alignment:fixtures
```

The suite creates temporary repos and proves the agentic behavior that used to
require local target repos:

- Package script changes surface documentation and validation-root impact.
- Docs-only changes stay scoped to docs validation.
- New source areas surface guarded fallback-route impact.
- Dead validation commands make status fail instead of appearing clean.
- Generated output edits and API spec changes produce guarded impact warnings.
- Repeated failures degrade status while `verify` still fails the command.
- Generated `.greenhouse/**` evidence dirt is excluded from product routing.

Product improvement:

- Greenhouse can now test the repo-tending loop in CI without Declarion,
  Sourcer, or Ensember being available.
- Real repo alignment remains valuable, but portable fixture alignment catches
  regressions before local path-specific validation runs.
