# Implementation Guide: Tending Reliability

Created: 2026-05-25
Status: draft
Branch: main

---

## Living Document

This guide MUST be updated during implementation:

- [ ] Check off tasks as they are completed.
- [ ] Add notes when reality diverges from plan.
- [ ] Reorder or split phases when blockers are discovered.
- [ ] Add new tasks discovered during implementation.
- [ ] Mark tasks as skipped with a concrete reason when they become irrelevant.
- [ ] Record timestamps on phase completions for velocity tracking.
- [ ] Update test coverage map as tests are written.

Last updated: 2026-05-25
Current phase: 5

---

## 0. Project Discovery

### Discovery Summary

| Variable | Value |
|---|---|
| Package manager | pnpm (`pnpm-lock.yaml`) |
| Monorepo | No - single TypeScript CLI package |
| Test runner | Vitest |
| Test command | `pnpm test` |
| Typecheck | `pnpm typecheck` |
| Lint | None discovered |
| Build | `pnpm build` |
| Domain checks | `pnpm test:tend`, `pnpm test:validation`, `pnpm test:evidence`, `pnpm test:proposals`, `pnpm test:alignment`, `pnpm alignment:check` |
| CI | None discovered in this repo |
| Feature paths | `src/tend/run-tend.ts`, `src/verify/run-verify.ts`, `src/impact/detect-change-impact.ts`, `src/evidence/**`, `src/proposals/**`, `src/alignment/**`, `src/commands/**` |
| Existing tests | `tests/tend.test.ts`, `tests/validation.test.ts`, `tests/impact.test.ts`, `tests/evidence.test.ts`, `tests/proposals.test.ts`, `tests/alignment.test.ts`, `tests/lifecycle.test.ts`, `tests/cli.test.ts` |

### Validation Stack

| Purpose | Command | Scope |
|---|---|---|
| Full check | `pnpm check` | Typecheck, all Vitest tests, build |
| Type safety | `pnpm typecheck` | TypeScript project |
| Unit/integration tests | `pnpm test` | All Vitest tests |
| Build integrity | `pnpm build` | CLI build |
| Tend behavior | `pnpm test:tend` | Finish-gate behavior and output |
| Validation routing | `pnpm test:validation` | Changed-file route selection and dry-run output |
| Impact warnings | `pnpm test:impact` | Impact detection and severities |
| Evidence memory | `pnpm test:evidence` | Evidence writing, indexes, pruning, repeated failures |
| Proposal lifecycle | `pnpm test:proposals` | Proposals, safe apply, adoption, dismissal |
| CLI surface | `pnpm test:cli` | Command registration and flags |
| Lifecycle/status | `pnpm test:lifecycle` | Status, install/update behavior |
| Portable alignment unit tests | `pnpm test:alignment` | Alignment runner contracts |
| Real repo alignment | `pnpm alignment:check` | Declarion, Sourcer, Ensember local behavior |

### Current Product State

Greenhouse already has these first-pass capabilities:

- `greenhouse-spec status` as a concise read-only health report.
- `greenhouse-spec tend` as the everyday finish gate.
- `greenhouse-spec tend --check` as a structural-only gate.
- `greenhouse-spec verify --changed --dry-run` as a route explanation surface.
- Impact severities: `advisory`, `warning`, `guarded`, `blocking`.
- Evidence writing with route reasons, impact warnings, bounded failure excerpts, tending state, indexes, and pruning.
- Repeated failure signatures that degrade status without turning failures green.
- Proposal IDs, idempotency keys, preconditions, dismissals, safe apply, and adoption.
- Local real-repo alignment against Declarion, Sourcer, and Ensember.

### Current Repo State

At guide creation, the worktree was intentionally dirty:

- `IMPLEMENTATION_GUIDE.md` is being recreated for this next phase.
- `greenhouse-summary.md` has been rewritten as a GPT Pro product summary.
- The previous completed implementation guide was removed.

Phase 0 settled this baseline before changing runtime behavior.

---

## 1. Architecture Contract

### Problem Statement

Greenhouse has reached the right high-level product shape, but its user-visible
finish-line experience is not yet as strong as its internal logic. The next
phase must make `status`, `tend`, and `verify --changed --dry-run` feel
trustworthy and action-oriented inside real repos, so an AI session working in
Declarion, Sourcer, or Ensember can understand what changed, what was validated,
what remains risky, and what to do next without opening generated YAML.

### Chosen Approach

Keep the public workflow small and improve existing surfaces. `status` remains
read-only. `tend` remains the everyday finish gate. `verify --changed --dry-run`
remains the detailed explanation layer. Proposals remain the explicit repair
path. Evidence remains local memory, not permission to ignore failures. The
largest new capability in this phase is portable fixture alignment so core
agentic scenarios can be tested without local repo paths.

### Architecture Boundaries

| Layer | Owns | Does NOT Own |
|---|---|---|
| CLI commands (`src/commands/**`) | Flag parsing, exit code mapping, console output wiring | Core behavior or repo mutation policy |
| Status (`src/status/run-status.ts`) | Read-only repo health and next action | Evidence writing, generated refresh, authored-root mutation |
| Tend (`src/tend/run-tend.ts`) | Finish-gate orchestration and report formatting | Silent repair of roots/package scripts |
| Verify (`src/verify/run-verify.ts`) | Validation routing, command execution, dry-run explanation | Structural proposal application |
| Impact (`src/impact/**`) | Change-impact warning detection and severity metadata | Blocking policy outside its warning model |
| Evidence (`src/evidence/**`) | Evidence records, indexes, pruning, repeated failure signatures | Treating known failures as passing |
| Proposals (`src/proposals/**`) | Explicit repo evolution state and safe/adopt/dismiss actions | Hidden mutation of human-owned decisions |
| Alignment (`src/alignment/**`) | Read-only behavior contracts for fixtures and real repos | Installing or mutating target repos |
| Docs (`README.md`, `docs/**`, `greenhouse-summary.md`) | User-facing product explanation | Runtime behavior |

### Non-Negotiables

- [ ] Do not add mandatory new public workflow commands.
- [ ] Keep normal usage as `greenhouse-spec status` then `greenhouse-spec tend`.
- [ ] Keep `status` read-only.
- [ ] Keep `tend --check` structural-only.
- [ ] Do not silently mutate `.greenhouse/roots/**`, package scripts, or human-owned decisions.
- [ ] Known/repeated failures must be explained, not made green.
- [ ] Generated Greenhouse artifacts must not pollute product validation routing.
- [ ] Source changes must never appear clean solely because no route matched.
- [ ] Evidence must remain bounded and redacted.
- [ ] Real repo alignment must pass before this phase is considered done.

### Out Of Scope

- Mandatory `brief --agent`.
- Background daemon behavior.
- SQLite, FTS, vector storage, or indexing service.
- Broad framework detection without fixture pressure.
- Automatic rewriting of human-authored documentation prose.
- New planning/spec workflow commands.

---

## 2. Implementation Phases

### Phase 0: Baseline And Output Snapshots

Goal: Settle the documentation baseline and capture current command outputs before changing behavior.
Depends on: None
Status: Complete - 2026-05-25

#### Inputs

- Current dirty `greenhouse-summary.md`.
- Recreated `IMPLEMENTATION_GUIDE.md`.
- Existing Greenhouse runtime and alignment tests.

#### Outputs

- Baseline docs state is intentionally committed or explicitly left dirty for the implementation phase.
- Current output snapshots are captured for comparison.
- No runtime behavior changes.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| Product summary | `greenhouse-summary.md` | Review/Edit |
| Implementation guide | `IMPLEMENTATION_GUIDE.md` | Create/Edit |
| Tend output | `src/tend/run-tend.ts` | Read |
| Verify output | `src/verify/run-verify.ts` | Read |
| Proposal output | `src/proposals/run-proposals.ts` | Read |
| Evidence prune output | `src/evidence/prune.ts` | Read |

#### Tasks

- [x] Review `greenhouse-summary.md` for accuracy against current CLI behavior.
  - Tool: read/edit
  - Verify: `pnpm typecheck`

- [x] Capture current outputs for `status`, `tend`, `verify --changed --dry-run`, `proposals`, and `evidence prune --dry-run`.
  - Tool: bash
  - Verify: `docs/tending-reliability-baseline.md`

- [x] Decide whether to commit the docs baseline before runtime edits.
  - Tool: git
  - Verify: `git status --short --branch`

#### Phase Notes

- Completed on 2026-05-25.
- Captured command behavior in `docs/tending-reliability-baseline.md`.
- Baseline decision: commit `IMPLEMENTATION_GUIDE.md`,
  `greenhouse-summary.md`, and `docs/tending-reliability-baseline.md` before
  runtime implementation begins.
- Running `tend` produced generated evidence and generated indexes as expected;
  those generated artifacts are excluded from this docs baseline.
- Product finding: `status` is already concise, while `tend` is functionally
  correct but too implementation-shaped. Phase 1 should focus on the `tend`
  report.

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Full package | Current implementation still passes | Yes | `pnpm check` |
| Real repo alignment | Local behavior still matches expected repos | Yes | `pnpm alignment:check` |
| Type safety | Docs-only change does not affect build | Auto | `pnpm typecheck` |

#### Phase Exit Criteria

- [x] `pnpm check` passes.
- [x] `pnpm alignment:check` passes.
- [x] Current output snapshots exist in phase notes or a docs artifact.
- [x] Guide updated with baseline decision.

#### Failure Protocol

| If | Then |
|---|---|
| Baseline validation fails | Fix or document the existing failure before runtime edits |
| Output cannot be captured cleanly | Use a temporary fixture repo and document why |
| Scope expands beyond docs/output baseline | Stop and move the extra work to a later phase |

---

### Phase 1: Product-Grade `tend` Report

Goal: Make `greenhouse-spec tend` feel like a trustworthy finish-line report.
Depends on: Phase 0
Status: Complete - 2026-05-25

#### Inputs

- Current `TendReport` model.
- Current `formatTendReport` output.
- Phase 0 output snapshots.

#### Outputs

- `tend` report is state-first, concise, grouped by concern, and action-oriented.
- Passing reports collapse successful detail.
- Degraded/warning reports name unresolved concerns.
- Failing reports name the first blocking cause.
- Report ends with one clear next action.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| Tend model/output | `src/tend/run-tend.ts` | Edit |
| Tend CLI | `src/commands/tend.ts` | Read/Edit if wording changes |
| Tend tests | `tests/tend.test.ts` | Edit |
| Lifecycle tests | `tests/lifecycle.test.ts` | Read/Edit if status-next-action coupling changes |
| Docs | `docs/commands.md`, `docs/operating-playbook.md`, `greenhouse-summary.md` | Edit |

#### Tasks

- [x] Add tests for concise passing `tend` output.
  - Tool: edit
  - Verify: `pnpm test:tend`

- [x] Add tests for warning/degraded `tend` output with impact warnings or manual checks.
  - Tool: edit
  - Verify: `pnpm test:tend`

- [x] Add tests for failing `tend` output naming the blocking validation or structural cause.
  - Tool: edit
  - Verify: `pnpm test:tend`

- [x] Refactor `formatTendReport` into state-first sections: State, Changed, Validation, Impact, Evidence, Proposals, Repeated Failures, Next.
  - Tool: edit
  - Verify: `pnpm test:tend`

- [x] Keep detailed routing explanations out of `tend`; point to `verify --changed --dry-run` when needed.
  - Tool: edit
  - Verify: `pnpm test:tend`

#### Phase Notes

- Completed on 2026-05-25.
- Runtime behavior was preserved; this phase changed the rendered report shape.
- `formatTendReport` now starts with `State`, keeps validation compact, hides
  successful install/self-tending internals by default, and ends with `Next`.
- Failing reports name the first blocking cause.
- Before/after comparison is recorded in
  `docs/tending-reliability-baseline.md`.
- Running `tend --no-prune` to capture the after snapshot produced generated
  evidence/report artifacts as expected; those generated artifacts were removed
  before committing the phase.

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Unit | Passing `tend` report is short and state-first | Yes - extend | `pnpm test:tend` |
| Unit | Warning `tend` report names unresolved concerns | Yes - extend | `pnpm test:tend` |
| Unit | Failing `tend` report names first blocking cause | Yes - extend | `pnpm test:tend` |
| CLI | Existing `tend` flags still work | Yes | `pnpm test:cli` |
| Type safety | Tend report contracts compile | Auto | `pnpm typecheck` |

#### Phase Exit Criteria

- [x] `pnpm test:tend` passes.
- [x] `pnpm test:cli` passes.
- [x] `pnpm typecheck` passes.
- [x] Before/after output comparison is recorded.
- [x] Guide updated with completion notes.

---

### Phase 2: Dry-Run Explanation Reliability

Goal: Make `verify --changed --dry-run` the complete explanation layer for routing decisions.
Depends on: Phase 1
Status: Complete - 2026-05-25

#### Inputs

- Current `formatVerifyReport`.
- Existing route command metadata and manual check metadata.
- Current impact warnings.

#### Outputs

- Every selected command has a reason and source.
- Every changed product file is routed, guarded, fallback-routed, or explicitly identified as uncovered.
- Generated Greenhouse artifacts are explained as excluded.
- Guarded/fallback behavior is easy to understand.
- Impact warnings appear before command execution detail.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| Verify output | `src/verify/run-verify.ts` | Edit |
| Route model | `src/validation/route-validation.ts` | Edit if metadata is missing |
| Changed classification | `src/validation/classify-changed-files.ts` | Read/Edit if uncovered reporting needs grouping |
| Validation tests | `tests/validation.test.ts` | Edit |
| CLI tests | `tests/cli.test.ts` | Read/Edit if output flags change |
| Docs | `docs/validation-routing.md`, `docs/commands.md` | Edit |

#### Tasks

- [x] Add/extend tests for command reason, source, and matched route in dry-run output.
  - Tool: edit
  - Verify: `pnpm test:validation`

- [x] Add/extend tests for generated Greenhouse files excluded from routing.
  - Tool: edit
  - Verify: `pnpm test:validation`

- [x] Add tests for fallback or guarded behavior being explicitly explained.
  - Tool: edit
  - Verify: `pnpm test:validation`

- [x] Improve dry-run section order: Changed, Groups, Impact, Routing, Commands, Manual checks, Skipped/excluded, Next.
  - Tool: edit
  - Verify: `pnpm test:validation`

#### Phase Notes

- Completed on 2026-05-25.
- Runtime routing behavior was preserved; this phase changed the rendered
  dry-run explanation.
- `formatVerifyReport` now uses `Changed`, `Groups`, `Impact`, `Routing`,
  `Commands`, `Manual Checks`, `Repeated Failures`, `Skipped / Excluded`, and
  `Next`.
- Impact warnings now appear before command detail, so stale-assumption risks
  are visible before an agent reads validation commands.
- Generated Greenhouse files are shown as excluded in the report and remain out
  of product validation routing.
- Before/after comparison is recorded in
  `docs/tending-reliability-baseline.md`.

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Unit | Command source/reason present | Yes - extend | `pnpm test:validation` |
| Unit | Generated artifacts excluded | Yes - extend | `pnpm test:validation` |
| Unit | Guarded/fallback explanation | Yes - extend | `pnpm test:validation` |
| Type safety | Route metadata contracts compile | Auto | `pnpm typecheck` |

#### Phase Exit Criteria

- [x] `pnpm test:validation` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.
- [x] Guide updated with completion notes.

---

### Phase 3: Impact Severity Discipline

Goal: Normalize impact warning behavior so warnings are useful without becoming ceremony.
Depends on: Phase 2
Status: Complete - 2026-05-25

#### Inputs

- Existing `ImpactWarning` model.
- Existing `detectChangeImpact` rules.
- Existing status/tend/verify/evidence impact displays.

#### Outputs

- Each impact warning has clear severity, reason, affected paths, and resolution hint.
- `blocking` impact warnings fail `status`/`tend` where appropriate.
- `guarded` impact warnings are visible and require review language but do not silently mutate anything.
- `warning` and `advisory` warnings remain non-blocking.
- Tracked docs path warnings are consistently worded with docs ownership drift.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| Impact model | `src/impact/detect-change-impact.ts` | Edit |
| Status health | `src/status/run-status.ts` | Edit |
| Tend output/state | `src/tend/run-tend.ts` | Edit |
| Verify output | `src/verify/run-verify.ts` | Edit |
| Evidence writer | `src/evidence/write-evidence.ts` | Read/Edit |
| Doctor docs root check | `src/doctor/run-doctor.ts` | Read/Edit if wording changes |
| Tests | `tests/impact.test.ts`, `tests/lifecycle.test.ts`, `tests/tend.test.ts`, `tests/evidence.test.ts` | Edit |

#### Tasks

- [x] Add a resolution or next-action field to impact warnings if needed.
  - Tool: edit
  - Verify: `pnpm test:impact`

- [x] Add tests for severity behavior in `status` and `tend`.
  - Tool: edit
  - Verify: `pnpm test:lifecycle && pnpm test:tend`

- [x] Ensure impact warnings in evidence include enough context for future agents.
  - Tool: edit
  - Verify: `pnpm test:evidence`

- [x] Keep docs drift non-blocking unless the rule is explicitly guarded/blocking.
  - Tool: edit
  - Verify: `pnpm test:impact`

#### Phase Notes

- Completed on 2026-05-25.
- `ImpactWarning` now includes a `resolution` string that is shown in verbose
  status, `tend`, `verify --dry-run`, and evidence.
- Advisory/warning documentation drift remains non-blocking.
- Guarded impact warnings remain review-oriented.
- Blocking impact warnings now fail `status` and the default `tend` finish
  gate.
- Added a practical blocking detector for selected simple `pnpm` validation
  commands that reference missing root `package.json` scripts.
- `tend` now stops before validation execution when blocking impact warnings
  prove the validation plan itself is stale.

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Unit | Severity defaults and resolution text | Yes - extend | `pnpm test:impact` |
| Integration | Status/tend state by severity | Yes - extend | `pnpm test:lifecycle`, `pnpm test:tend` |
| Integration | Evidence stores impact context | Yes - extend | `pnpm test:evidence` |
| Type safety | Impact contracts compile | Auto | `pnpm typecheck` |

#### Phase Exit Criteria

- [x] `pnpm test:impact` passes.
- [x] `pnpm test:lifecycle` passes.
- [x] `pnpm test:tend` passes.
- [x] `pnpm test:evidence` passes.
- [x] `pnpm typecheck` passes.

---

### Phase 4: Evidence Summary And Prune Reliability

Goal: Keep evidence useful as local memory without growing into clutter.
Depends on: Phase 3
Status: Complete - 2026-05-25

#### Inputs

- Existing evidence writer, evidence index, failure signatures, and prune command.
- Current `greenhouse-spec evidence prune`.

#### Outputs

- Evidence index can summarize latest tending result and latest failure by command.
- Pruning preserves latest useful evidence and failure context.
- `status` can summarize evidence without scanning every old record beyond generated indexes where possible.
- Prune output clearly states what was kept and why.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| Evidence writer | `src/evidence/write-evidence.ts` | Edit |
| Evidence index | `src/evidence/evidence-index.ts` | Edit |
| Failure signatures | `src/evidence/failure-signatures.ts` | Read/Edit |
| Prune logic | `src/evidence/prune.ts` | Edit |
| Evidence command | `src/commands/evidence.ts` | Read/Edit |
| Evidence tests | `tests/evidence.test.ts` | Edit |
| Status | `src/status/run-status.ts` | Edit if index summary is consumed |

#### Tasks

- [x] Add tests for prune preserving latest evidence and latest failure context.
  - Tool: edit
  - Verify: `pnpm test:evidence`

- [x] Improve prune report to include kept records and preservation reason.
  - Tool: edit
  - Verify: `pnpm test:evidence`

- [x] Extend evidence index only if current index cannot answer latest tending/failure questions.
  - Tool: edit
  - Verify: `pnpm test:evidence`

- [x] Ensure known/repeated failures remain failing when validation fails.
  - Tool: edit
  - Verify: `pnpm test:evidence`

#### Phase Notes

- Completed on 2026-05-25.
- Evidence index now includes a generated `summary` with latest tending state
  and latest failed evidence by command.
- Evidence prune now preserves the newest records per folder plus the latest
  failed evidence per command.
- Prune reports include kept records and preservation reasons.
- Evidence remains explanatory local memory; failed validation still fails.

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Unit | Prune preserves latest useful context | Yes - extend | `pnpm test:evidence` |
| Unit | Evidence index summary stays stable | Yes - extend | `pnpm test:evidence` |
| Type safety | Evidence schemas compile | Auto | `pnpm typecheck` |

#### Phase Exit Criteria

- [x] `pnpm test:evidence` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.

---

### Phase 5: Proposal Review UX Reliability

Goal: Make proposal decisions easy to understand without opening generated YAML.
Depends on: Phase 3
Status: Not started

#### Inputs

- Existing proposal schema and commands.
- Existing dismissal ledger.
- Existing safe apply/adopt behavior.

#### Outputs

- `greenhouse-spec proposals` clearly groups pending, adoptable, conflict, applied, and skipped proposals.
- Safe-apply output says exactly what changed and what was skipped.
- Conflicts explain the human-owned area involved.
- Dismissed proposals point to `.greenhouse/roots/proposal-decisions.yaml`.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| Proposal report | `src/proposals/run-proposals.ts` | Edit |
| Safe apply | `src/proposals/apply-proposals.ts` | Edit if report lacks detail |
| Adoption | `src/proposals/adopt-proposals.ts` | Read/Edit if report lacks detail |
| Dismissal | `src/proposals/dismiss-proposals.ts` | Read/Edit if report lacks detail |
| Commands | `src/commands/proposals.ts`, `src/commands/apply-proposals.ts`, `src/commands/adopt-proposals.ts` | Read/Edit |
| Tests | `tests/proposals.test.ts` | Edit |
| Docs | `docs/proposals.md` | Edit |

#### Tasks

- [ ] Add tests for grouped proposal output.
  - Tool: edit
  - Verify: `pnpm test:proposals`

- [ ] Add tests for safe-apply reporting changed/skipped items.
  - Tool: edit
  - Verify: `pnpm test:proposals`

- [ ] Add tests for dismissal references and conflict explanations.
  - Tool: edit
  - Verify: `pnpm test:proposals`

- [ ] Update proposal docs with the final review flow.
  - Tool: edit
  - Verify: `pnpm typecheck`

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Unit | Grouped proposal report | Yes - extend | `pnpm test:proposals` |
| Unit | Safe apply output detail | Yes - extend | `pnpm test:proposals` |
| Unit | Dismissed/conflict readability | Yes - extend | `pnpm test:proposals` |
| Type safety | Proposal contracts compile | Auto | `pnpm typecheck` |

#### Phase Exit Criteria

- [ ] `pnpm test:proposals` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm build` passes.

---

### Phase 6: Portable Fixture Alignment

Goal: Add CI-safe alignment scenarios that prove the agentic loop without local repo paths.
Depends on: Phases 1-5
Status: Not started

#### Inputs

- Existing alignment runner and tests.
- Existing temporary fixture patterns in Vitest tests.
- Existing real repo alignment contracts.

#### Outputs

- New `pnpm alignment:fixtures` script.
- Fixture alignment runner or test suite that creates temporary repos and verifies behavior.
- Scenarios cover package script drift, new source folders, dead validation commands, generated output edits, API spec changes, repeated failures, docs-only changes, and generated Greenhouse dirt.
- Existing `pnpm alignment:check` remains local real-repo confidence.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| Alignment runner | `src/alignment/run-alignment.ts` | Edit/Create adjacent fixture runner |
| Alignment command | `src/commands/alignment.ts` | Edit if fixture mode is exposed |
| Package scripts | `package.json` | Edit |
| Alignment tests | `tests/alignment.test.ts` | Edit |
| Fixtures | `tests/fixtures/**` or generated temp repos | Create/Edit |
| Docs | `docs/operating-playbook.md`, `greenhouse-summary.md` | Edit |

#### Tasks

- [ ] Decide whether fixture alignment is a CLI mode or test-only script.
  - Tool: read/edit
  - Verify: guide note and package script added.

- [ ] Add fixture scenarios for package script drift and docs-only scoped validation.
  - Tool: edit
  - Verify: `pnpm test:alignment`

- [ ] Add fixture scenarios for missing route/new source folder and dead validation command.
  - Tool: edit
  - Verify: `pnpm test:alignment`

- [ ] Add fixture scenarios for generated output edits and API spec impact.
  - Tool: edit
  - Verify: `pnpm test:alignment`

- [ ] Add fixture scenario for repeated failure degradation without greenwashing.
  - Tool: edit
  - Verify: `pnpm test:alignment`

- [ ] Add `alignment:fixtures` to `package.json`.
  - Tool: edit
  - Verify: `pnpm alignment:fixtures`

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Fixture alignment | Agentic repo scenarios | No - create | `pnpm alignment:fixtures` |
| Unit | Existing alignment runner remains stable | Yes - extend | `pnpm test:alignment` |
| Full package | All behavior still passes | Yes | `pnpm check` |

#### Phase Exit Criteria

- [ ] `pnpm alignment:fixtures` passes.
- [ ] `pnpm test:alignment` passes.
- [ ] `pnpm check` passes.
- [ ] `pnpm alignment:check` passes.
- [ ] Guide updated with fixture scenario list and status.

---

### Phase 7: Real Repo Agent-Readiness Proof

Goal: Prove that Greenhouse visibly helps an AI session work in Declarion, Sourcer, and Ensember.
Depends on: Phase 6
Status: Not started

#### Inputs

- Improved `status`, `tend`, dry-run, evidence, proposal, and fixture alignment behavior.
- Local repos: Declarion, Sourcer, Ensember.

#### Outputs

- A proof document with before/after snippets or summarized outputs from all three repos.
- Clear notes on what an AI agent should see and do in each repo.
- Any remaining repo-specific friction recorded as follow-up.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| Proof docs | `docs/tending-reliability-proof.md` | Create |
| Alignment runner | `src/alignment/run-alignment.ts` | Read/Edit only if real-repo contract needs update |
| Greenhouse summary | `greenhouse-summary.md` | Update if product behavior changed |
| Target repo: Declarion | `/Users/niklaswestman/Documents/extras-projects/declarion` | Read-only validation unless user approves changes |
| Target repo: Sourcer | `/Users/niklaswestman/Documents/extras-projects/sourcer` | Read-only validation unless user approves changes |
| Target repo: Ensember | `/Users/niklaswestman/Documents/extras-projects/ensember/code/ensember` | Read-only validation unless user approves changes |

#### Tasks

- [ ] Run `status`, `tend`, `verify --changed --dry-run`, and `proposals` in a controlled way for each target repo.
  - Tool: bash
  - Verify: outputs recorded in proof document.

- [ ] Confirm Declarion still explains repeated failure context without treating it as green.
  - Tool: bash
  - Verify: `pnpm alignment:check`

- [ ] Confirm Sourcer remains understandable as a polyglot React/Java/API/infra repo.
  - Tool: bash
  - Verify: `pnpm alignment:check`

- [ ] Confirm Ensember remains understandable as React/Tauri/Rust/Cargo.
  - Tool: bash
  - Verify: `pnpm alignment:check`

- [ ] Write final agent-readiness proof.
  - Tool: write/edit
  - Verify: `pnpm typecheck`

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Real repo alignment | Declarion, Sourcer, Ensember contracts | Yes | `pnpm alignment:check` |
| Fixture alignment | Portable behavior scenarios | Yes after Phase 6 | `pnpm alignment:fixtures` |
| Full package | Greenhouse package health | Yes | `pnpm check` |

#### Phase Exit Criteria

- [ ] `pnpm check` passes.
- [ ] `pnpm alignment:fixtures` passes.
- [ ] `pnpm alignment:check` passes.
- [ ] `docs/tending-reliability-proof.md` exists.
- [ ] Proof document shows how AI is helped in Declarion, Sourcer, and Ensember.
- [ ] Remaining follow-ups are documented.

---

## 3. Repeatable Unit Contract

### Unit Template: Agent-Facing Report Improvement

| Step | Description | Path | Action | Verify | Test |
|---|---|---|---|---|---|
| 1 | Capture current output for the command | CLI command | Bash | Save in phase notes/proof | N/A |
| 2 | Add tests for desired output shape | `tests/domain.test.ts` | Edit | Focused test command | Create/extend |
| 3 | Update formatter/model using existing data | `src/domain/**` | Edit | Focused test command | Domain tests |
| 4 | Update docs with final behavior | `docs/**`, `greenhouse-summary.md` | Edit | `pnpm typecheck` | N/A |
| 5 | Compare output in real alignment repo | Declarion/Sourcer/Ensember | Bash | `pnpm alignment:check` | Alignment |

Unit done when:

- [ ] Focused tests pass.
- [ ] `pnpm typecheck` passes.
- [ ] Output is shorter or clearer than baseline.
- [ ] The next action is explicit.
- [ ] Guide updated.

### Units

| Unit | Status | Tests | Validation | Notes |
|---|---|---|---|---|
| `tend` finish report | Complete | pass | pass | State-first finish report |
| `verify --changed --dry-run` explanation | Complete | pass | pass | Detailed diagnostic layer |
| Impact warning wording/severity | Complete | pass | pass | Resolution hints and blocking command drift |
| Evidence prune/index summary | Complete | pass | pass | Preserves latest failure context |
| Proposal review output | Not started | pending | pending | Make decisions readable without YAML |
| Fixture alignment scenarios | Not started | pending | pending | CI-safe confidence |
| Real repo proof | Not started | pending | pending | Shows AI benefit in target repos |

---

## 4. Test Strategy

### Principles

- Test user-visible behavior and command contracts.
- Add/extend tests before changing output.
- Do not accept broad snapshots that make intentional wording changes painful.
- Prefer targeted assertions for section order, next action, command reasons, and safety invariants.
- Real repo alignment remains read-only unless the user explicitly approves repo changes.

### Coverage Map

| Phase | What's Tested | Test Type | Exists? | Path |
|---|---|---|---|---|
| Phase 0 | Baseline health and snapshots | Full/real repo | Yes | `pnpm check`, `pnpm alignment:check` |
| Phase 1 | `tend` report readability | Unit/CLI | Yes - extend | `tests/tend.test.ts`, `tests/cli.test.ts` |
| Phase 2 | Dry-run explanation completeness | Unit | Yes - extend | `tests/validation.test.ts` |
| Phase 3 | Impact severity and resolution discipline | Unit/integration | Yes - extend | `tests/impact.test.ts`, `tests/lifecycle.test.ts`, `tests/tend.test.ts`, `tests/evidence.test.ts` |
| Phase 4 | Evidence index/prune reliability | Unit | Yes - extend | `tests/evidence.test.ts` |
| Phase 5 | Proposal review readability | Unit | Yes - extend | `tests/proposals.test.ts` |
| Phase 6 | Portable agentic scenarios | Fixture/integration | No - create | `tests/alignment.test.ts`, `pnpm alignment:fixtures` |
| Phase 7 | Target repo agent-readiness | Real repo | Yes | `pnpm alignment:check`, `docs/tending-reliability-proof.md` |

### Full Validation Run

Run after each phase:

```bash
pnpm typecheck
pnpm test:tend
pnpm test:validation
pnpm test:impact
pnpm test:evidence
pnpm test:proposals
pnpm test:alignment
pnpm build
```

Run before the full phase is complete:

```bash
pnpm check
pnpm alignment:fixtures
pnpm alignment:check
```

`pnpm alignment:fixtures` is introduced in Phase 6. Until then, the required
gate is:

```bash
pnpm check
pnpm alignment:check
```

---

## 5. Failure And Rollback Protocol

| Failure Type | Detection | Action |
|---|---|---|
| Test failure | Focused Vitest command exits non-zero | Fix in current phase before proceeding |
| Type error | `pnpm typecheck` exits non-zero | Check contracts between formatter/model/schema layers |
| Build failure | `pnpm build` exits non-zero | Check exports and ESM imports |
| Output becomes noisier | Before/after comparison is worse | Rework formatter before proceeding |
| `status` writes files | Git status or lifecycle test detects mutation | Stop and restore read-only boundary |
| `tend --check` writes or runs validation | Tend tests detect mutation/execution | Stop and isolate structural path |
| Known failure becomes green | Evidence/validation tests detect pass override | Stop and restore strict validation semantics |
| Generated files pollute routing | Validation/alignment test fails | Fix classification before proceeding |
| Real repo alignment fails unexpectedly | `pnpm alignment:check` fails | Determine whether implementation or expectation changed; document before updating expectations |
| Ambiguous product decision | Cannot choose blocking vs warning behavior | Stop and ask Niklas |
| Same failure repeats 3 times | Same test/check fails after three attempts | Escalate with concrete alternatives |

---

## 6. Completion Tracker

| Phase | Title | Status | Tests | Validation | Completed |
|---|---|---|---|---|---|
| 0 | Baseline And Output Snapshots | Complete | pass | pass | 2026-05-25 |
| 1 | Product-Grade `tend` Report | Complete | pass | pass | 2026-05-25 |
| 2 | Dry-Run Explanation Reliability | Complete | pass | pass | 2026-05-25 |
| 3 | Impact Severity Discipline | Complete | pass | pass | 2026-05-25 |
| 4 | Evidence Summary And Prune Reliability | Complete | pass | pass | 2026-05-25 |
| 5 | Proposal Review UX Reliability | Not started | pending | pending | - |
| 6 | Portable Fixture Alignment | Not started | pending | pending | - |
| 7 | Real Repo Agent-Readiness Proof | Not started | pending | pending | - |

---

## 7. Post-Completion Checklist

- [ ] All phases marked complete or intentionally skipped with reason.
- [ ] `pnpm check` passes.
- [ ] `pnpm alignment:fixtures` passes.
- [ ] `pnpm alignment:check` passes.
- [ ] `greenhouse-summary.md` reflects final behavior.
- [ ] `docs/tending-reliability-proof.md` exists and shows real repo benefit.
- [ ] No skipped tests without documented reason.
- [ ] No silent authored-root mutation introduced.
- [ ] No known/repeated failure is treated as success.
- [ ] Follow-up work is documented.

---

## 8. Recommended First Phase

Start with Phase 0.

Do not improve runtime output before capturing the current output baseline.
The goal of this next phase is not only to make tests pass; it is to make the
agent-facing experience noticeably clearer in Declarion, Sourcer, and Ensember.
Without before/after output, we cannot prove that the AI is actually helped.
