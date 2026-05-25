# Greenhouse Summary

## What Greenhouse Is Now

Greenhouse is a repo-local maintenance and validation layer for AI-assisted software work.

Its purpose is to help an agent understand a repository, route validation to the right commands, notice structural drift, preserve evidence of checks, and keep repo-specific AI context organized without relying on hidden memory.

Greenhouse installs into a repo as a `.greenhouse/` folder plus a small set of package scripts. The installed repo gets authored roots, generated intelligence, validation helpers, evidence records, and proposal tooling.

The current product loop is:

```bash
greenhouse-spec status
greenhouse-spec inspect
greenhouse-spec proposals
greenhouse-spec apply-proposals --safe
greenhouse-spec tend --check
greenhouse-spec verify --changed --write-evidence
```

## What It Does For Repos

### 1. Installs A Repo-Local AI Operating Layer

Greenhouse creates:

- `.greenhouse/roots/**` for authored rules, validation config, authority, and protected boundaries.
- `.greenhouse/grown/**` for generated repo intelligence.
- `.greenhouse/evidence/**` for validation evidence.
- `.greenhouse/reports/**` for maintenance reports.
- `.greenhouse/scripts/**` and `.greenhouse/templates/**` for installed helper files.

Authored roots are protected. Generated files are disposable and refreshable.

### 2. Discovers Repo Shape

Greenhouse inspects package scripts, frameworks, source folders, generated folders, backend modules, and validation commands.

It currently recognizes patterns such as:

- Single-package React/Vite apps.
- CLI-enabled TypeScript repos.
- Polyglot workspace repos.
- Java/Maven backend modules.
- API specs and generated API output.
- Infra packages.
- Tauri/Rust/Cargo desktop apps.
- DB/script/screenshot validation shapes.

This produces generated files such as:

- `repo-shape.yaml`
- `repo-map.yaml`
- `command-index.yaml`
- `risk-index.yaml`
- `validation-proposals.yaml`

### 3. Routes Validation Based On Changed Files

Instead of always running everything, Greenhouse selects validation commands based on the touched paths.

Examples:

- Docs changes can avoid unrelated app tests.
- CLI changes can run CLI build/tests without pulling in app tests.
- React app changes route to style check, typecheck, and tests.
- Tauri/Rust source changes route to Cargo tests.
- Cargo manifest changes become guarded and request manual review.
- Maven/backend/API/infra changes can route to backend or guarded validation.

Greenhouse now avoids inventing missing commands. If a repo has `lint` but not `format:check`, app routing uses `lint`.

### 4. Generates Proposals Instead Of Guessing

When Greenhouse notices missing wiring, it creates structured proposals instead of silently editing authored roots.

Proposal examples:

- Add missing package scripts.
- Add validation routes for a newly detected repo area.
- Add Cargo/Tauri routes for `src-tauri/**`.
- Report human-owned conflicts.

Safe mechanical proposals can be applied with:

```bash
greenhouse-spec apply-proposals --safe
```

Human-owned collisions are not overwritten.

### 5. Provides A Self-Tending Gate

`greenhouse-spec tend --check` is the structural drift gate.

It fails when Greenhouse detects pending, adoptable, or conflicting proposals. This makes structural changes visible before push.

The intended prepush pattern is:

```bash
greenhouse-spec tend --check
greenhouse-spec verify --changed --write-evidence
```

### 6. Tracks Evidence And Validation Health

Greenhouse can write evidence for validation runs. Evidence records which files were routed, which commands were selected, and which commands passed or failed.

`greenhouse-spec status` now reports categorized health:

- Install health.
- Self-tending drift.
- Changed-file validation readiness.
- Repeated unresolved failures.
- Evidence freshness.

Repeated failures make status `degraded`, not silently clean. They still fail validation when the command is run.

### 7. Has A Three-Repo Alignment Suite

Greenhouse now has a read-only alignment command:

```bash
pnpm alignment:check
```

It validates behavior against three local example repos:

- Declarion: single-package React/Vite plus CLI, with known repeated test failure context.
- Sourcer: React workspace plus Java/Maven backend/API/infra shape.
- Ensember: React/Vite desktop app with Tauri/Rust/Cargo.

The alignment suite checks expected status, self-tending, proposal state, repo-shape discovery, and validation routing. It does not write generated files, evidence, reports, or proposals into target repos.

## Current Strengths

- Greenhouse is no longer just docs or conventions. It actively routes validation and executes checks.
- Generated `.greenhouse` artifacts no longer pollute changed-file routing.
- It can distinguish install health, drift, validation readiness, and repeated failures.
- It has structured proposals and safe apply behavior.
- It can now handle three meaningfully different repo shapes.
- It has a reusable alignment suite to prevent regressions across those shapes.

## Current Weak Spots

- The product is still young and mostly proven through local alignment repos, not broad real-world usage.
- Repo-shape detection is useful but still heuristic.
- Generated evidence/report folders need disciplined pruning and indexing.
- Some target repos still need their Greenhouse install baselines committed cleanly.
- Greenhouse has not yet fully closed the loop from repeated evidence learnings into safe structured proposals.
- The alignment suite is local-path based, so it is strong for this development environment but not portable CI yet.

## Recommended Way Forward

### 1. Commit The Current Greenhouse Foundation

The current branch now contains several important pieces:

- Evidence coverage status.
- Health categories.
- Repo-aware app routing.
- Tauri/Rust/Cargo discovery and routing.
- Alignment suite.

This should be committed as a coherent milestone after a final review.

### 2. Commit Ensember As The Third Alignment Baseline

Ensember should become the official third real-world alignment repo.

Before committing:

- Review the `.greenhouse/roots/validation.yaml` routes added by proposals.
- Confirm `package.json` Greenhouse scripts are acceptable.
- Decide whether generated `.greenhouse/grown/**` and evidence files should be committed or ignored for that repo’s workflow.

### 3. Clean Up Target Repo Dirt

Declarion and Sourcer currently have generated Greenhouse changes from test runs. Decide per repo:

- Commit only authored install/config baselines.
- Ignore or prune generated evidence/report files.
- Keep generated indexes only if they are intentionally part of the repo baseline.

The rule should become clear and repeatable.

### 4. Make Alignment A Normal Gate

For Greenhouse changes, the expected local validation should become:

```bash
pnpm check
pnpm alignment:check
```

Every new Greenhouse feature should answer:

- Declarion still behaves as expected.
- Sourcer still behaves as expected.
- Ensember still behaves as expected.

### 5. Improve Proposal Intelligence Carefully

The next product improvement should be making Greenhouse better at turning discoveries into useful proposals, not adding broad optional systems.

Good candidates:

- Proposal for evidence cleanup policy.
- Proposal when repeated failures suggest missing test setup guidance.
- Proposal when package scripts change and validation roots drift.
- Proposal when new source folders appear without route coverage.

Keep authored roots protected. Prefer explicit proposals over automatic mutation.

### 6. Avoid Overcomplication

SQLite/FTS/vector storage may become useful later, but the current priority should be consistency and operational clarity:

- Clear generated indexes.
- Clear proposals.
- Clear status.
- Clear validation routes.
- Clear evidence.
- Clear alignment contracts.

Do not introduce a database service until Markdown/YAML/index files are clearly limiting the product.

## Practical North Star

Greenhouse should make an installed repo feel tended.

When a developer or AI changes the repo, Greenhouse should be able to answer:

- What changed?
- What validation matters?
- Is the repo structure drifting?
- Is there evidence that the right checks passed?
- Are repeated failures known but unresolved?
- Does this repo still match the expected Greenhouse contract?

That is the foundation for autonomous repo maintenance without hiding decisions from the developer.
