# Validation Routing

Validation routing decides which commands should run for a set of changed files.
The source of truth is:

```text
.greenhouse/roots/validation.yaml
```

Generated discovery and proposals can suggest updates, but validation execution
must always flow through the authored root.

Documentation drift hints come from a separate authored root:

```text
.greenhouse/roots/docs.yaml
```

That file maps docs to repo facts they own, such as setup commands, package
scripts, validation, CLI behavior, API contracts, environment config, desktop
packaging, generated output, workspace shape, and CI behavior. Impact warnings
use this map when it exists, and fall back to common docs like `README.md` when
it does not.

## Changed File Groups

Greenhouse classifies changed files before routing them.

```text
product-source
  Application, library, backend, CLI, DB, test, docs, and infra files.

repo-config
  package.json and similar repo-level configuration.

agent-instructions
  AGENTS.md and other agent instruction files.

greenhouse-authored
  .greenhouse/project.yaml, roots, context manifest, scripts, and templates.

greenhouse-generated
  .greenhouse/grown/**, evidence, and reports.
```

Generated Greenhouse artifacts should not cause broad validation. They may be
listed in reports for visibility, but they should not affect route selection.

## Modes And Risks

Routes can select normal patch validation or guarded validation. Guarded routes
are for areas where a local change can affect contracts, money, official source
handling, generated output, migrations, or other high-risk behavior.

Examples:

```text
docs-only patch
  format check when available, otherwise lint when that is the repo's style check.

CLI-only patch
  CLI build, CLI tests, and typecheck.

generic app patch
  style check, app tests, and typecheck, without unrelated CLI smoke checks.

Tauri/Rust patch
  Cargo tests for src-tauri changes, proposed through repo-shape routing.

guarded tax/source/generated-output patch
  full validation plus a manual guarded-risk review.
```

## Route Metadata

Managed routes include metadata so Greenhouse can safely update them later:

```yaml
managed_by: greenhouse-spec
origin: repo-shape
proposal_id: route-api-spec
confidence: high
```

Human-owned routes without this metadata are protected. If they already match a
proposal, `adopt-proposals` can add metadata without changing commands.

## Evidence

`verify --changed --write-evidence` writes proof of selected commands and their
results under `.greenhouse/evidence/`.

`tend` uses the same routing and evidence machinery, but wraps it in the normal
finish gate with install health, structural drift, impact warnings, repeated
failure context, and proposal summaries.

Agents should not bulk-read old evidence files on every turn. Use generated
indexes and current verification output first. Open specific evidence files only
when continuing a related change, debugging validation, or investigating tend
recommendations.

## Dry-Run Reports

`verify --changed --dry-run` is the detailed routing explanation surface. It
does not run commands, but it should make the validation plan auditable without
opening generated YAML.

The report is ordered as:

```text
Changed -> Groups -> Impact -> Routing -> Commands -> Manual Checks
-> Repeated Failures -> Skipped / Excluded -> Next
```

This order intentionally puts stale-assumption risks and route coverage before
command detail. Generated Greenhouse files appear under `Skipped / Excluded`
instead of expanding product validation.

## Impact Warnings

Impact warnings call out stale assumptions that validation alone may not prove.
They appear in `status`, `tend`, `verify --changed --dry-run`, and written
evidence.

Examples:

```text
package.json scripts
  README/setup docs and validation roots may describe stale commands.

CLI source
  CLI docs, examples, or help text may be stale.

OpenAPI/API specs
  Generated clients/server stubs and API docs may need regeneration or review.

generated output
  Verify the source generator or boundary rule instead of treating generated
  output as authored source.
```

Warnings are severity-based. Advisory and warning findings keep the finish gate
visible without mutating docs. Guarded and blocking findings require review or
repair before the repo should be treated as fully tended.

`docs.yaml` does not authorize silent prose edits. It only improves impact
targeting so an agent can see which docs deserve review.

## Repeated Failures

Greenhouse generates `.greenhouse/grown/failure-signatures.yaml` from recent
evidence. It records failed command signatures that appear in evidence so future
reports can say when a current failure resembles a previous one.

This is explanatory only:

- Matching failures still fail validation.
- Greenhouse does not skip commands because a failure is known.
- The generated index is disposable and does not represent human acceptance.

## Good Routing Outcome

A healthy route is scoped but not weak:

- Docs changes should not run unrelated app tests.
- CLI changes should not run app tests unless shared contracts are touched.
- Inferred routes should use existing repo commands and avoid inventing missing
  scripts such as `pnpm format:check`.
- Tauri/Rust changes should route through Cargo validation instead of generic
  TypeScript-only checks.
- High-risk source, tax, API, generated output, migration, and official source
  changes should run broad validation and request manual review.
- Generated Greenhouse evidence and reports should not pollute changed-file
  routing.
