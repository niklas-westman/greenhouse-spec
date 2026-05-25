# Tending Reliability Proof

Date: 2026-05-25

This document records the Phase 7 proof that Greenhouse helps an AI session
understand and finish work in the three local alignment repos. The target repos
were treated as read-only: this pass used `status`, `verify --changed --dry-run`,
`verify --paths ... --dry-run`, `proposals`, and `tend --check`. Default `tend`
was not run in target repos because it can write evidence and reports.

## Greenhouse Commands Used

From the Greenhouse build:

```bash
node /Users/niklaswestman/Documents/extras-projects/greenhouse/code/greenhouse-spec/dist/cli.js status
node /Users/niklaswestman/Documents/extras-projects/greenhouse/code/greenhouse-spec/dist/cli.js verify --changed --dry-run
node /Users/niklaswestman/Documents/extras-projects/greenhouse/code/greenhouse-spec/dist/cli.js proposals
node /Users/niklaswestman/Documents/extras-projects/greenhouse/code/greenhouse-spec/dist/cli.js tend --check
```

Representative path dry-runs were also used so the proof shows what an AI would
see while working, not only clean-tree status.

## Declarion

Path:

```text
/Users/niklaswestman/Documents/extras-projects/declarion
```

Clean-tree state:

- `status`: degraded.
- Changed files: none.
- Drift: none blocking.
- Proposals: none.
- Repeated failures: one repeated `pnpm test` signature.
- Latest evidence: `.greenhouse/evidence/2026-05-25T05-01-00-078Z-verify.md`.
- `tend --check`: pass, structural-only.

Agent-facing value:

- The repo does not look falsely clean. `status` says `degraded` because
  `pnpm test` has repeated `localStorage.clear is not a function` failures.
- The next action is explicit: review repeated failures before assuming the
  validation baseline is healthy.
- No structural drift or proposal work is suggested, so an agent can focus on
  the actual validation failure rather than Greenhouse maintenance.

Representative file dry-run:

```bash
greenhouse-spec verify --paths src/App.tsx --dry-run
```

Result summary:

- Mode: patch.
- Routed files: `src/App.tsx`.
- Impact: none.
- Commands selected:
  - `pnpm format:check`
  - `pnpm typecheck`
  - `pnpm test`
- `pnpm test:cli` was not selected for a normal app patch.

Why this helps an AI:

- The app patch route is readable and scoped.
- The known test failure is visible in status, but the selected validation still
  includes the failing command. Repeated failures are explained, not greenwashed.

## Sourcer

Path:

```text
/Users/niklaswestman/Documents/extras-projects/sourcer
```

Clean-tree state:

- `status`: pass.
- Changed files: none.
- Drift: none blocking.
- Repeated failures: none.
- Proposals: 10 applied, 0 pending/adoptable/conflict/skipped.
- `tend --check`: pass, structural-only.

Agent-facing value:

- The proposal report explains that the polyglot routes are already applied.
- The status report stays short even though the repo has frontend, Java backend,
  API, database migration, runtime config, generated API, and infra areas.
- An agent does not have to infer from repo layout alone which validation areas
  matter.

Representative file dry-run:

```bash
greenhouse-spec verify \
  --paths frontend-react/src/App.tsx \
          backend-java-serverless/src/main/java/example/App.java \
          api-spec/src/main/resources/api.yaml \
  --dry-run
```

Result summary:

- Mode: guarded.
- Routed files: all 3.
- Impact: guarded API contract warning.
- Commands selected:
  - `pnpm lint:frontend`
  - `pnpm test:frontend`
  - `pnpm build:api`
  - `pnpm test:backend`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
- Manual checks:
  - Review API contract compatibility and generated client/server impact.
  - Human guarded-risk review.

Why this helps an AI:

- Sourcer's polyglot shape becomes explicit from one dry-run.
- API spec edits surface generated-client/API-doc drift instead of being treated
  as ordinary source edits.
- Guarded mode explains both the broad validation and the manual review reason.

## Ensember

Path:

```text
/Users/niklaswestman/Documents/extras-projects/ensember/code/ensember
```

Clean-tree state:

- `status`: pass.
- Changed files: none.
- Drift: none blocking.
- Repeated failures: none.
- Proposals: 3 applied, 0 pending/adoptable/conflict/skipped.
- `tend --check`: pass, structural-only.

Agent-facing value:

- The proposal report shows Tauri/Cargo routes are installed and owned.
- `status` remains quiet when the repo is healthy.
- Greenhouse can distinguish app source from native desktop/Rust runtime areas.

Representative file dry-run:

```bash
greenhouse-spec verify \
  --paths src/app.tsx \
          src-tauri/src/orchestration/runtime.rs \
          src-tauri/Cargo.toml \
  --dry-run
```

Result summary:

- Mode: guarded.
- Routed files: all 3.
- Impact: advisory Tauri/Rust desktop docs warning.
- Commands selected:
  - `cd src-tauri && cargo test`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Manual checks:
  - Review Tauri runtime, permissions, and Rust dependency impact.
  - Human guarded-risk review.

Why this helps an AI:

- Native desktop work no longer looks like a generic frontend patch.
- Cargo validation is surfaced directly from the changed Rust/Tauri paths.
- Documentation impact is advisory, so it is visible without blocking every
  native change by default.

## Alignment Gate

The real repo alignment command passed:

```bash
pnpm alignment:check
```

Summary:

- Declarion: expected degraded, got degraded.
- Sourcer: expected pass, got pass.
- Ensember: expected pass, got pass.
- Representative path routing passed for app, frontend, backend, API, Tauri
  source, and Tauri manifest paths.

The portable fixture alignment command also passed:

```bash
pnpm alignment:fixtures
```

It covers the CI-safe scenarios that do not depend on local repo paths:
package-script drift, docs-only validation, missing source route fallback, dead
commands, generated output edits, API spec impact, repeated failure degradation,
and generated Greenhouse dirt exclusion.

## Remaining Follow-Ups

- The real repo proof is read-only. To prove default `greenhouse-spec tend` in
  target repos, run it intentionally when evidence/report writes are acceptable.
- Sourcer and Ensember show applied legacy proposal IDs. This is acceptable
  today, but future proposal lifecycle hardening could make applied route output
  more concise.
- Declarion remains degraded until the underlying app test environment issue is
  fixed or explicitly documented as a known unresolved failure. Greenhouse should
  continue to report it as degraded/failing validation context, not success.
