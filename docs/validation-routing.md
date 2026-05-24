# Validation Routing

Validation routing decides which commands should run for a set of changed files.
The source of truth is:

```text
.greenhouse/roots/validation.yaml
```

Generated discovery and proposals can suggest updates, but validation execution
must always flow through the authored root.

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
  format check only, when the repo has an appropriate docs route.

CLI-only patch
  CLI build, CLI tests, and typecheck.

generic app patch
  app tests and typecheck, without unrelated CLI smoke checks.

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

Agents should not bulk-read old evidence files on every turn. Use generated
indexes and current verification output first. Open specific evidence files only
when continuing a related change, debugging validation, or investigating tend
recommendations.

## Good Routing Outcome

A healthy route is scoped but not weak:

- Docs changes should not run unrelated app tests.
- CLI changes should not run app tests unless shared contracts are touched.
- High-risk source, tax, API, generated output, migration, and official source
  changes should run broad validation and request manual review.
- Generated Greenhouse evidence and reports should not pollute changed-file
  routing.
