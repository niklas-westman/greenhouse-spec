# Implementation Guide: Lightweight Greenhouse Tending

Created: 2026-05-25
Status: in progress
Branch: main

---

## Living Document

This guide MUST be updated during implementation:

- [ ] Check off tasks as they are completed
- [ ] Add notes when reality diverges from plan
- [ ] Reorder or split phases when blockers are discovered
- [ ] Add new tasks discovered during implementation
- [ ] Mark tasks as "skipped - <reason>" when they become irrelevant
- [ ] Record timestamps on phase completions for velocity tracking
- [ ] Update test coverage map as tests are written

Last updated: 2026-05-25
Current phase: Phase 7

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
| Domain checks | `pnpm test:tend`, `pnpm test:lifecycle`, `pnpm test:validation`, `pnpm test:evidence`, `pnpm test:alignment`, `pnpm alignment:check` |
| CI | None discovered in this repo |
| Feature paths | `src/tend/run-tend.ts`, `src/status/run-status.ts`, `src/verify/run-verify.ts`, `src/commands/tend.ts`, `src/commands/status.ts`, `src/commands/verify.ts`, `src/evidence/**`, `src/proposals/**`, `src/validation/**` |
| Existing tests | `tests/tend.test.ts`, `tests/lifecycle.test.ts`, `tests/validation.test.ts`, `tests/evidence.test.ts`, `tests/cli.test.ts`, `tests/alignment.test.ts` |

### Validation Stack

| Purpose | Command | Scope |
|---|---|---|
| Full check | `pnpm check` | Typecheck, full Vitest suite, build |
| Unit/integration tests | `pnpm test` | All Vitest tests |
| Type safety | `pnpm typecheck` | TypeScript project |
| Build integrity | `pnpm build` | CLI build |
| Tend tests | `pnpm test:tend` | Tend command/model |
| Lifecycle/status tests | `pnpm test:lifecycle` | Init/update/status behavior |
| Validation routing tests | `pnpm test:validation` | Changed-file routing |
| Evidence tests | `pnpm test:evidence` | Evidence writing/index/failure signatures |
| CLI tests | `pnpm test:cli` | Commander registration/output compatibility |
| Alignment tests | `pnpm test:alignment` | Alignment runner unit coverage |
| Real repo alignment | `pnpm alignment:check` | Declarion, Sourcer, Ensember local alignment |

### Current Command Model

| Command | Current Role | Target Role |
|---|---|---|
| `greenhouse-spec status` | Read-only health report composed from doctor, tend-check, verify-dry-run, evidence health | Quiet entry point; concise by default, verbose/json for detail |
| `greenhouse-spec tend` | Main composed pre-finish command | Main composed pre-finish command |
| `greenhouse-spec tend --check` | Structural proposal gate | Structural-only CI/debug gate |
| `greenhouse-spec verify --changed --dry-run` | Validation plan without execution | Lower-level routing explanation |
| `greenhouse-spec verify --changed --write-evidence` | Execute selected validation and write evidence | Lower-level validation/evidence engine used by `tend` |
| `greenhouse-spec proposals` | View structured proposals | Explicit repo evolution surface |
| `greenhouse-spec apply-proposals --safe` | Apply safe mechanical proposals | Explicit repo evolution action |
| `greenhouse-spec inspect` | Refresh generated repo intelligence | Advanced/generated intelligence command |
| `greenhouse-spec alignment` | Validate behavior against local alignment repos | Greenhouse development check |

---

## 1. Architecture Contract

### Problem Statement

Greenhouse has strong internal layers, but the everyday workflow is still too exposed: agents may need to understand `inspect`, `proposals`, `tend --check`, and `verify --changed --write-evidence` separately. The product needs a lighter top layer where `status` explains the repo state and `tend` becomes the composed pre-finish command, while lower-level commands remain available for debugging, CI, and explicit repo evolution.

### Chosen Approach

Preserve the existing command modules and build `greenhouse-spec tend` as a composition layer over existing behavior. `tend --check` remains structural-only. `verify --changed --write-evidence` remains the validation/evidence engine. `status` remains read-only. Change-impact warnings are introduced as a shared model that can be surfaced by `status`, `tend`, verify dry-runs, and evidence without silently mutating authored roots.

### Architecture Boundaries

| Layer | Owns | Does NOT Own |
|---|---|---|
| CLI commands (`src/commands/**`) | Flag parsing, exit code mapping, console output | Core repo logic |
| Status (`src/status/run-status.ts`) | Read-only health aggregation and next action | Writing evidence, reports, roots, grown intelligence |
| Tend (`src/tend/run-tend.ts`) | Main finish gate orchestration and structural-only `--check` behavior | Silent authored-root mutation |
| Verify (`src/verify/run-verify.ts`) | Validation routing execution and evidence write request | Structural proposal application |
| Validation (`src/validation/**`) | Changed-file classification, route selection, command execution | Product-level status semantics |
| Evidence (`src/evidence/**`) | Evidence records, evidence index, repeated failure signatures, pruning | Treating known failures as success |
| Proposals (`src/proposals/**`) | Structured repo evolution proposals and safe apply/adopt mechanics | Hidden mutation of human-owned decisions |
| Discovery (`src/discovery/**`) | Repo shape, command index, risk/doc intelligence | Running validation |
| Alignment (`src/alignment/**`) | Read-only local repo behavior checks | Installing or mutating target repos |

### Non-Negotiables

- [ ] `greenhouse-spec status` remains read-only.
- [ ] `greenhouse-spec tend --check` remains structural-only and CI-friendly.
- [ ] `greenhouse-spec tend` must not silently mutate authored roots, package scripts, or human-owned decisions.
- [ ] Failed validation commands remain failed; repeated/known failures are explained, never made green.
- [ ] A changed source file must not appear clean just because no route matched it.
- [x] Change-impact documentation warnings are severity-based, not always blocking.
- [ ] Existing commands remain available for compatibility.
- [ ] Generated `.greenhouse/grown/**` remains disposable.
- [x] Evidence must not capture sensitive full logs by default.

---

## 2. Implementation Phases

### Phase 1: Tend Product Contract And Test Skeleton

Goal: Define the exact default behavior of `greenhouse-spec tend` and lock it with tests before changing runtime behavior.
Depends on: None
Status: Complete - 2026-05-25

#### Inputs

- Existing `src/tend/run-tend.ts`
- Existing `src/commands/tend.ts`
- Existing `tests/tend.test.ts`
- Existing `tests/lifecycle.test.ts`
- Product decision: `tend` is the everyday pre-finish command; `tend --check` remains structural-only.

#### Outputs

- Updated type contract for `TendReport`
- New/updated tests describing the Phase 1 `tend` contract
- CLI help/description updated to match the product role
- No runtime broad orchestration until tests describe expected behavior

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| Tend model | `src/tend/run-tend.ts` | Edit |
| Tend CLI | `src/commands/tend.ts` | Edit |
| CLI registration tests | `tests/cli.test.ts` | Edit |
| Tend behavior tests | `tests/tend.test.ts` | Edit |
| Lifecycle/status tests | `tests/lifecycle.test.ts` | Read/Edit |
| Docs | `README.md`, `docs/commands.md`, `docs/operating-playbook.md` | Edit |

#### Tasks

- [x] Define `TendReport` states: `pass`, `warning`, `fail` or reuse existing health state if suitable.
  - Tool: edit
  - Verify: `pnpm typecheck`

- [x] Add tests for default `tend` as a report-only pre-finish surface with no changed files.
  - Tool: edit
  - Verify: `pnpm test:tend`

- [x] Add tests that `tend --check` does not execute validation and does not write evidence.
  - Tool: edit
  - Verify: `pnpm test:tend`

- [x] Add tests that default `tend` does not execute validation until Phase 2.
  - Tool: edit
  - Verify: `pnpm test:tend`

- [x] Add tests that default `tend` does not mutate authored roots or package scripts.
  - Tool: edit
  - Verify: `pnpm test:tend`

- [x] Update CLI description from proposal-report language to pre-finish tending language.
  - Tool: edit
  - Verify: `pnpm test:cli`

#### Phase Notes

- Added explicit `TendReport` contract fields: `state`, `flow`, `validation`, and `writes`.
- Preserved current runtime boundary: default `tend` is `report-only`; `tend --check` is `structural-check`.
- Deferred composed validation execution to Phase 2 as planned.
- Verified neither path reports authored-root or package-script mutation.

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Unit | `tend` report contract | Yes - extend | `pnpm test:tend` |
| Integration | CLI command description/flags | Yes - extend | `pnpm test:cli` |
| Regression | Status read-only behavior still holds | Yes - extend if needed | `pnpm test:lifecycle` |
| Type safety | New report types compile | Auto | `pnpm typecheck` |

#### Phase Exit Criteria

- [x] `pnpm test:tend` passes.
- [x] `pnpm test:cli` passes.
- [x] `pnpm test:lifecycle` passes if touched.
- [x] `pnpm typecheck` passes.
- [x] Guide updated with completion notes.

#### Failure Protocol

| If | Then |
|---|---|
| Tests require too much mocking | Split orchestration dependency injection into a later phase |
| Existing `tend` report behavior conflicts | Preserve current behavior behind a compatibility path or document intentional replacement |
| `tend --check` becomes coupled to validation execution | Stop and split structural check into a dedicated internal function |

---

### Phase 2: Compose Default `tend`

Goal: Implement `greenhouse-spec tend` as the main pre-finish flow while preserving strict lower-level semantics.
Depends on: Phase 1
Status: Complete - 2026-05-25

#### Inputs

- Phase 1 tests and report contract
- Existing `runDoctor`, `runTend({ check: true })`, `runVerify({ changed: true, writeEvidence: true })`
- Existing proposal summary behavior

#### Outputs

- Default `tend` runs the composed flow:
  1. install/root health
  2. structural check
  3. changed-file route selection
  4. selected validation execution
  5. evidence writing when validation commands run
  6. repeated failure annotations
  7. proposal summary
- Exit code fails for blocking structural drift or failed validation.
- Warnings do not fail unless classified as guarded/blocking.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| Tend orchestration | `src/tend/run-tend.ts` | Edit |
| Doctor | `src/doctor/run-doctor.ts` | Read |
| Verify | `src/verify/run-verify.ts` | Read/Edit only if integration seam is needed |
| Evidence | `src/evidence/write-evidence.ts` | Read |
| Tend tests | `tests/tend.test.ts` | Edit |
| Lifecycle tests | `tests/lifecycle.test.ts` | Edit |

#### Tasks

- [x] Split structural self-tending check into a reusable internal function.
  - Tool: edit
  - Verify: `pnpm test:tend`

- [x] Add default `tend` orchestration path that calls doctor, structural check, and verify changed with evidence.
  - Tool: edit
  - Verify: `pnpm test:tend`

- [x] Preserve `--check` as structural-only and non-writing.
  - Tool: edit
  - Verify: `pnpm test:tend`

- [x] Add output formatting for roots, drift, validation, evidence, proposals, and final state.
  - Tool: edit
  - Verify: `pnpm test:tend`

- [x] Ensure failed validation sets `report.ok = false` and CLI exit code 1.
  - Tool: edit
  - Verify: `pnpm test:tend`

#### Phase Notes

- Default `tend` is now `flow: finish-gate`.
- Default `tend` runs doctor, structural self-tending, validation routing/execution, evidence writing, repeated failure refresh, and proposal report writing.
- `tend --check` remains `flow: structural-check` and does not execute validation or write evidence.
- Validation does not run if install/root health fails or structural drift blocks tending.
- Failed validation keeps `report.ok = false` and `state = fail`; repeated failures remain explanatory only.

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Unit | Default `tend` with no changes | No - create | `pnpm test:tend` |
| Unit | Default `tend` with routed passing validation | No - create | `pnpm test:tend` |
| Unit | Default `tend` with failing validation | No - create | `pnpm test:tend` |
| Unit | `tend --check` remains structural-only | Yes - strengthen | `pnpm test:tend` |
| Integration | CLI exit code mapping | Existing CLI patterns | `pnpm test:cli` |
| Type safety | Orchestration contract | Auto | `pnpm typecheck` |

#### Phase Exit Criteria

- [x] `pnpm test:tend` passes.
- [x] `pnpm test:cli` passes.
- [x] `pnpm test:lifecycle` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.

---

### Phase 3: Status Concision And Verbose/JSON Detail

Goal: Keep `status` as the quiet entry point while preserving detailed diagnostics when requested.
Depends on: Phase 2
Status: Complete - 2026-05-25

#### Inputs

- Existing `runStatus`, `formatStatusReport`, `formatStatusJsonReport`
- Current health categories
- New `tend` next-command semantics

#### Outputs

- Default `status` output is short and readable.
- `status --verbose` prints existing detailed sections.
- `status --json` keeps structured report compatibility.
- Next command prefers `greenhouse-spec tend` when changed validation is pending.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| Status model/output | `src/status/run-status.ts` | Edit |
| Status CLI | `src/commands/status.ts` | Edit |
| Lifecycle tests | `tests/lifecycle.test.ts` | Edit |
| CLI tests | `tests/cli.test.ts` | Edit |
| Docs | `README.md`, `docs/commands.md` | Edit |

#### Tasks

- [x] Add `--verbose` option for current detailed Markdown output.
  - Tool: edit
  - Verify: `pnpm test:cli && pnpm test:lifecycle`

- [x] Make default status concise: state, changed count, validation readiness, drift, generated-only status, evidence, next command.
  - Tool: edit
  - Verify: `pnpm test:lifecycle`

- [x] Keep JSON stable and include any new state fields.
  - Tool: edit
  - Verify: `pnpm test:lifecycle`

- [x] Update next action to recommend `greenhouse-spec tend` for normal finish work.
  - Tool: edit
  - Verify: `pnpm test:lifecycle`

#### Phase Notes

- Default `status` now prints a concise read-only summary instead of the full Markdown diagnostics.
- `status --verbose` preserves the detailed Markdown health report.
- `status --json` remains the stable structured output path.
- Pending changed validation now recommends `greenhouse-spec tend`.

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Unit | Concise default status | Yes - update | `pnpm test:lifecycle` |
| Unit | Verbose status preserves detailed sections | No - create | `pnpm test:lifecycle` |
| Unit | JSON status remains parseable | Yes - update | `pnpm test:lifecycle` |
| CLI | `--verbose` and `--json` flags | Yes - extend | `pnpm test:cli` |
| Type safety | Status report shape | Auto | `pnpm typecheck` |

#### Phase Exit Criteria

- [x] `pnpm test:lifecycle` passes.
- [x] `pnpm test:cli` passes.
- [x] `pnpm typecheck` passes.

---

### Phase 4: Explain Verification Dry-Run

Goal: Make `verify --changed --dry-run` explain validation routing clearly enough for debugging without adding a new top-level command.
Depends on: Phase 2
Status: Complete - 2026-05-25

#### Inputs

- Existing `ValidationRoute` command reasons
- Changed-file classification groups
- Manual checks and risk output

#### Outputs

- Dry-run report shows changed files, groups, routed files, matched commands, reasons, route source when available, fallback/guarded behavior, and manual checks.
- Output remains useful for direct path validation with `--paths`.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| Verify formatting | `src/verify/run-verify.ts` | Edit |
| Route model | `src/validation/route-validation.ts` | Edit if route source is missing |
| Validation tests | `tests/validation.test.ts` | Edit |
| CLI tests | `tests/cli.test.ts` | Edit if output snapshots/assertions exist |

#### Tasks

- [x] Add route source/origin to selected command metadata if not already inferable.
  - Tool: edit
  - Verify: `pnpm test:validation`

- [x] Update dry-run output to explicitly call out selected commands and reasons.
  - Tool: edit
  - Verify: `pnpm test:validation`

- [x] Ensure generated-only Greenhouse artifacts are clearly excluded from routing.
  - Tool: edit
  - Verify: `pnpm test:validation`

#### Phase Notes

- Added route source metadata to commands and manual checks.
- Added route-level explanations for path rules, risk rules, inferred routes, mode requirements, fallback defaults, generated exclusions, and skipped validation.
- Updated verify reports to include `## Route explanation` and source/reason lines per selected command/manual check.
- Generated-only Greenhouse files are explicitly explained as excluded from validation routing.

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Unit | Route reasons and origins | Yes - extend | `pnpm test:validation` |
| Unit | Generated-only paths excluded | Yes - extend | `pnpm test:validation` |
| Integration | CLI dry-run output | Yes - extend if needed | `pnpm test:cli` |
| Type safety | Route metadata | Auto | `pnpm typecheck` |

#### Phase Exit Criteria

- [x] `pnpm test:validation` passes.
- [x] `pnpm test:cli` passes if touched.
- [x] `pnpm typecheck` passes.

---

### Phase 5: Change-Impact Model

Goal: Add quiet impact warnings that surface stale assumptions without adding ceremony or silently editing docs.
Depends on: Phase 3 and Phase 4
Status: Complete - 2026-05-25

#### Inputs

- Changed-file classification
- Repo shape discovery
- Command index
- Validation roots
- Existing proposal generation patterns

#### Outputs

- Shared impact model with severities: `advisory`, `warning`, `guarded`, `blocking`.
- First-pass impact rules:
  - `package.json` scripts -> README/setup docs and validation roots may be stale
  - CLI source -> CLI docs/help examples may be stale
  - OpenAPI/API spec -> generated clients and API docs may be stale
  - env/config schema -> `.env.example` and deployment docs may be stale
  - generated output -> generator/boundary check
  - new source folder -> validation route may be missing
  - `src-tauri/**` -> Rust/Tauri validation and packaging docs may be affected
  - workspace config -> repo map/package scope may be stale
  - CI workflow files -> local validation docs/routes may be stale
- Impact warnings surface in `status`, `tend`, verify dry-run, and evidence.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| Impact model | `src/impact/` | Create |
| Changed files | `src/validation/classify-changed-files.ts` | Read/Edit if categories need extension |
| Status | `src/status/run-status.ts` | Edit |
| Tend | `src/tend/run-tend.ts` | Edit |
| Verify | `src/verify/run-verify.ts` | Edit |
| Evidence writer | `src/evidence/write-evidence.ts` | Edit |
| Tests | `tests/impact.test.ts`, `tests/lifecycle.test.ts`, `tests/tend.test.ts`, `tests/evidence.test.ts` | Create/Edit |

#### Tasks

- [x] Create `ImpactWarning` type and severity model.
  - Tool: edit
  - Verify: `pnpm typecheck`

- [x] Implement pure `detectChangeImpact` from changed files and repo shape.
  - Tool: edit
  - Verify: `pnpm test:impact`

- [x] Add impact warnings to status output and JSON.
  - Tool: edit
  - Verify: `pnpm test:lifecycle`

- [x] Add impact warnings to tend output and final state.
  - Tool: edit
  - Verify: `pnpm test:tend`

- [x] Add impact warnings to verify dry-run output.
  - Tool: edit
  - Verify: `pnpm test:validation`

- [x] Add impact warnings to evidence writer.
  - Tool: edit
  - Verify: `pnpm test:evidence`

#### Phase Notes

- Added `ImpactWarning` with severities `advisory`, `warning`, `guarded`, and `blocking`.
- Added conservative first-pass impact detection for package scripts, CLI source, API specs, env/config schema, generated output, workspace config, CI workflows, Tauri/Rust paths, and fallback source routing.
- Surfaced impact warnings in `status`, `status --json`, `tend`, `verify --dry-run`, and evidence records.
- Kept impact warnings advisory/degraded by default; Greenhouse does not mutate docs or authored roots.

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Unit | Impact warning detection | Yes | `pnpm test:impact` |
| Unit | Severity mapping | Yes | `pnpm test:impact` |
| Integration | Status includes impacts | Yes - extended | `pnpm test:lifecycle` |
| Integration | Tend includes impacts | Yes - extended | `pnpm test:tend` |
| Integration | Evidence stores impacts | Yes - extended | `pnpm test:evidence` |
| Type safety | Impact schema integration | Auto | `pnpm typecheck` |

#### Phase Exit Criteria

- [x] `pnpm test:impact` or equivalent passes.
- [x] `pnpm test:lifecycle` passes.
- [x] `pnpm test:tend` passes.
- [x] `pnpm test:evidence` passes.
- [x] `pnpm test:validation` passes.
- [x] `pnpm typecheck` passes.

---

### Phase 6: Evidence Policy And Impact Context

Goal: Make evidence useful as repo-local memory without turning it into a noisy or sensitive log store.
Depends on: Phase 5
Status: Complete - 2026-05-25

#### Inputs

- Existing Markdown evidence writer
- Existing evidence index and failure signatures
- New impact warnings

#### Outputs

- Evidence records include route reasons, impact warnings, repeated failure matches, manual checks, and final tending state when written by `tend`.
- Failed command excerpts remain clear but bounded.
- Default output redacts or avoids sensitive full logs.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| Evidence writer | `src/evidence/write-evidence.ts` | Edit |
| Evidence index | `src/evidence/evidence-index.ts` | Edit |
| Failure signatures | `src/evidence/failure-signatures.ts` | Read/Edit |
| Evidence schemas | `src/schemas/evidence.ts`, `src/schemas/evidence-index.ts` | Edit |
| Evidence tests | `tests/evidence.test.ts` | Edit |

#### Tasks

- [x] Extend evidence payload with impact warnings and manual checks.
  - Tool: edit
  - Verify: `pnpm test:evidence`

- [x] Add bounded failure excerpt policy if current capture is insufficient.
  - Tool: edit
  - Verify: `pnpm test:evidence`

- [x] Ensure evidence index remains stable after new fields.
  - Tool: edit
  - Verify: `pnpm test:evidence`

- [x] Add docs describing evidence as local memory, not permission.
  - Tool: edit
  - Verify: `pnpm typecheck`

#### Phase Notes

- Evidence records now include route reasons, impact warnings, bounded/redacted command excerpts, and optional tending state.
- `tend` writes evidence with final tending state instead of relying on direct verify evidence.
- Evidence index accepts impact warning summaries and tending state while preserving existing recent evidence metadata.
- Failure excerpts redact home paths, common secret-like environment values, and OpenAI-style secret tokens.

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Unit | Evidence includes impact warnings | Yes - extended | `pnpm test:evidence` |
| Unit | Failure excerpts are bounded | Yes - extended | `pnpm test:evidence` |
| Unit | Repeated failure annotations remain failing | Yes - extended | `pnpm test:evidence` |
| Type safety | Schema changes compile | Auto | `pnpm typecheck` |

#### Phase Exit Criteria

- [x] `pnpm test:evidence` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm build` passes.

---

### Phase 7: Proposal Lifecycle Hardening

Goal: Make proposals durable enough to reduce repeated noise without allowing hidden mutation.
Depends on: Phase 5
Status: Not started

#### Inputs

- Existing validation proposals
- Existing safe apply/adopt commands
- Impact warnings that may produce proposal-worthy findings

#### Outputs

- Stable proposal IDs and idempotency keys where missing.
- Preconditions and collision explanations for proposal application.
- Dismissal ledger design and first implementation if scope remains small.
- Safe proposals remain explicit and non-destructive.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| Proposal schemas | `src/schemas/validation-proposals.ts` | Edit |
| Proposal builder | `src/proposals/build-proposals.ts` | Edit |
| Proposal reader | `src/proposals/read-proposals.ts` | Edit |
| Apply/adopt | `src/proposals/apply-proposals.ts`, `src/proposals/adopt-proposals.ts` | Edit |
| Commands | `src/commands/proposals.ts`, `src/commands/apply-proposals.ts`, `src/commands/adopt-proposals.ts` | Edit |
| Tests | `tests/proposals.test.ts` | Edit |

#### Tasks

- [ ] Audit current proposal schema for ID, status, confidence, target, patch, and managed ownership fields.
  - Tool: read/edit
  - Verify: `pnpm test:proposals`

- [ ] Add idempotency keys and preconditions where V1 proposal kinds need them.
  - Tool: edit
  - Verify: `pnpm test:proposals`

- [ ] Add dismissal design to roots without implementing broad UX if too large.
  - Tool: edit
  - Verify: `pnpm test:proposals`

- [ ] Ensure human-owned collisions remain skipped/conflict.
  - Tool: edit
  - Verify: `pnpm test:proposals`

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Unit | Stable proposal identity | Existing - extend | `pnpm test:proposals` |
| Unit | Safe apply idempotency | Existing - extend | `pnpm test:proposals` |
| Unit | Human-owned collisions protected | Existing - extend | `pnpm test:proposals` |
| Type safety | Proposal schema | Auto | `pnpm typecheck` |

#### Phase Exit Criteria

- [ ] `pnpm test:proposals` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm build` passes.

---

### Phase 8: Documentation And Alignment

Goal: Prove the simplified top-layer workflow across Greenhouse and the three local alignment repos.
Depends on: Phases 1-7 as applicable
Status: Not started

#### Inputs

- Updated behavior for `status`, `tend`, verify dry-run, impact warnings, and evidence
- Local alignment repos: Declarion, Sourcer, Ensember

#### Outputs

- README and docs explain the everyday workflow:
  - `greenhouse-spec status`
  - work normally
  - `greenhouse-spec tend`
  - proposals only when reported
- Alignment checks include expectations for `tend` and impact warnings where stable.
- Real repo alignment passes.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| README | `README.md` | Edit |
| Commands docs | `docs/commands.md` | Edit |
| Operating playbook | `docs/operating-playbook.md` | Edit |
| Validation routing docs | `docs/validation-routing.md` | Edit |
| Alignment runner | `src/alignment/run-alignment.ts` | Edit |
| Alignment tests | `tests/alignment.test.ts` | Edit |

#### Tasks

- [ ] Update README to present `status` and `tend` as the top-layer workflow.
  - Tool: edit
  - Verify: `pnpm typecheck`

- [ ] Update command docs with primary, secondary, and advanced command model.
  - Tool: edit
  - Verify: `pnpm typecheck`

- [ ] Add/adjust alignment expectations for default `tend`.
  - Tool: edit
  - Verify: `pnpm test:alignment`

- [ ] Run real repo alignment.
  - Tool: bash
  - Verify: `pnpm alignment:check`

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Unit | Alignment runner expectations | Yes - extend | `pnpm test:alignment` |
| Real repo | Declarion, Sourcer, Ensember | Yes | `pnpm alignment:check` |
| Full check | Whole package | Yes | `pnpm check` |

#### Phase Exit Criteria

- [ ] `pnpm test:alignment` passes.
- [ ] `pnpm alignment:check` passes.
- [ ] `pnpm check` passes.
- [ ] Docs match implemented behavior.

---

## 3. Repeatable Unit Contract

### Unit Template: Command Surface Change

| Step | Description | Path | Action | Verify | Test |
|---|---|---|---|---|---|
| 1 | Define behavior contract in model/types | `src/<domain>/` | Edit | `pnpm typecheck` | Domain test |
| 2 | Add tests before behavior change | `tests/<domain>.test.ts` | Edit | `pnpm test:<domain>` | Create/extend |
| 3 | Implement behavior using existing modules | `src/<domain>/` | Edit | `pnpm test:<domain>` | Domain test |
| 4 | Update CLI wiring/output | `src/commands/<command>.ts`, `src/cli.ts` | Edit | `pnpm test:cli` | CLI test |
| 5 | Update docs | `README.md`, `docs/**` | Edit | `pnpm typecheck` | N/A |

Unit done when:

- [ ] Focused test passes.
- [ ] `pnpm typecheck` passes.
- [ ] CLI behavior is documented.
- [ ] Guide updated.

### Units

| Unit | Status | Tests | Validation | Notes |
|---|---|---|---|---|
| `tend` default command | Not started | pending | pending | First implementation unit |
| `status` concise/verbose output | Not started | pending | pending | Depends on `tend` semantics |
| `verify --changed --dry-run` explanation | Not started | pending | pending | Lower-level diagnostic surface |
| Impact warnings | Not started | pending | pending | Shared model used by status/tend/verify/evidence |
| Evidence impact context | Not started | pending | pending | Depends on impact warnings |
| Proposal lifecycle hardening | Not started | pending | pending | Keep explicit and non-destructive |

---

## 4. Test Strategy

### Principles

- Tests are phase exit criteria.
- If a needed test does not exist, creating it is the first task in that phase.
- Tests should validate user-visible behavior and command contracts, not only internal implementation.
- `status` must remain read-only.
- `tend --check` must remain non-writing and structural-only.
- Default `tend` may write evidence/reports only as explicitly specified.
- Real repo alignment is required before merging product-surface changes.

### Coverage Map

| Phase | What's Tested | Test Type | Exists? | Path |
|---|---|---|---|---|
| Phase 1 | Tend contract and CLI wording | Unit/CLI | Yes - extend | `tests/tend.test.ts`, `tests/cli.test.ts` |
| Phase 2 | Composed `tend` execution/evidence/exit behavior | Unit/integration | Partial - extend | `tests/tend.test.ts`, `tests/lifecycle.test.ts` |
| Phase 3 | Status concise/verbose/json output | Unit/CLI | Partial - extend | `tests/lifecycle.test.ts`, `tests/cli.test.ts` |
| Phase 4 | Verify dry-run explanation | Unit/CLI | Partial - extend | `tests/validation.test.ts`, `tests/cli.test.ts` |
| Phase 5 | Change-impact detection | Unit/integration | No - create | `tests/impact.test.ts`, existing integration tests |
| Phase 6 | Evidence impact context | Unit | Partial - extend | `tests/evidence.test.ts` |
| Phase 7 | Proposal identity/dismissal/idempotency | Unit | Partial - extend | `tests/proposals.test.ts` |
| Phase 8 | Alignment repos and docs | Unit/real repo | Yes - extend | `tests/alignment.test.ts`, `pnpm alignment:check` |

### Full Validation Run

Run after every phase completion:

```bash
pnpm typecheck
pnpm test:tend
pnpm test:lifecycle
pnpm test:validation
pnpm test:evidence
pnpm test:cli
pnpm build
```

Run before declaring the full plan complete:

```bash
pnpm check
pnpm alignment:check
```

---

## 5. Failure And Rollback Protocol

| Failure Type | Detection | Action |
|---|---|---|
| Test failure | Focused Vitest command exits non-zero | Fix in current phase before proceeding |
| Type error | `pnpm typecheck` exits non-zero | Check contracts between command/model/schema layers |
| Build failure | `pnpm build` exits non-zero | Check exports, ESM imports, and dist assumptions |
| `status` writes files | Lifecycle test or git status detects mutation | Stop and restore read-only boundary |
| `tend --check` writes or runs validation | Tend test detects mutation/execution | Stop and split structural check path |
| Default `tend` mutates authored roots | Tend/proposal tests detect file changes | Stop; convert mutation into proposal |
| Evidence leaks too much output | Evidence tests or review detects full logs/secrets | Add bounded excerpt/redaction before proceeding |
| Alignment repo fails unexpectedly | `pnpm alignment:check` fails | Determine whether Greenhouse behavior or repo expectation changed; document before updating expectations |
| Ambiguous product decision | Cannot decide severity/exit behavior | Stop and ask Niklas |
| Repeated failure 3 times | Same check fails after three fix attempts | Escalate with concrete alternatives |

---

## 6. Completion Tracker

| Phase | Title | Status | Tests | Validation | Completed |
|---|---|---|---|---|---|
| 1 | Tend Product Contract And Test Skeleton | Complete | pass | pass | 2026-05-25 |
| 2 | Compose Default `tend` | Complete | pass | pass | 2026-05-25 |
| 3 | Status Concision And Verbose/JSON Detail | Complete | pass | pass | 2026-05-25 |
| 4 | Explain Verification Dry-Run | Complete | pass | pass | 2026-05-25 |
| 5 | Change-Impact Model | Not started | pending | pending | - |
| 6 | Evidence Policy And Impact Context | Not started | pending | pending | - |
| 7 | Proposal Lifecycle Hardening | Not started | pending | pending | - |
| 8 | Documentation And Alignment | Not started | pending | pending | - |

---

## 7. Post-Completion Checklist

- [ ] All phases marked complete or intentionally skipped with reason.
- [ ] `pnpm check` passes.
- [ ] `pnpm alignment:check` passes.
- [ ] Docs reflect the final command model.
- [ ] No skipped tests without documented reason.
- [ ] No silent authored-root mutation introduced.
- [ ] No known/repeated failure is treated as success.
- [ ] Branch is ready for review/merge.
- [ ] Follow-up work is documented.

---

## 8. Recommended First Phase

Start with Phase 1.

Do not implement composed `tend` behavior first. The exact semantics need to be locked down by tests because this command becomes the main product surface. Phase 1 should answer and codify:

- What does default `greenhouse-spec tend` run?
- What does it write?
- What still belongs only to `tend --check`?
- What exit states are possible?
- How does it avoid silent mutation?
- What output should an agent/developer see?

Once Phase 1 passes, Phase 2 can safely implement the behavior.
