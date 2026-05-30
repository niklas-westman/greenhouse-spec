# Greenhouse Tree Structure

This file explains the purpose of each installed `.greenhouse/` area.

```text
.greenhouse/
  project.yaml
  roots/
    rules.md
    protected-boundaries.md
    validation.yaml
    authority.md
    docs.yaml
  why-greenhouse-spec/
    README.md
    tree-structure.md
    agent-workflow.md
  grown/
    repo-map.yaml
    repo-shape.yaml
    command-index.yaml
    validation-proposals.yaml
    docs-index.yaml
    risk-index.yaml
    agent-index.yaml
    evidence-index.yaml
    failure-signatures.yaml
    memory-index.yaml
    skill-index.yaml
    last-inspection.md
  context/
    manifest.yaml
  memory/
    README.md
    decisions/
    lessons/
    playbooks/
    references/
    projects/
    inbox/
  skills/
    README.md
    adopted/
    drafts/
    proposals/
  proposals/
  scripts/
    check-changed.mjs
    check-greenhouse.mjs
    validate-scope.mjs
  evidence/
    *.md
  reports/
    context/
    doctor/
    tend/
  templates/
    evidence.md
    verification.md
```

## Root Files

### `project.yaml`

The local Greenhouse install record.

It describes the repo name, stack hints, install version, template version, and
CLI command Greenhouse expects to use in this repo.

### `roots/rules.md`

Human-authored operating rules for working in this repo.

Use this for stable expectations that an agent should respect before editing or
validating work.

### `roots/protected-boundaries.md`

Human-authored boundaries for files or areas that should not be edited casually.

Use this for generated outputs, migration-sensitive folders, public contracts,
deployment-sensitive files, or anything that needs extra care.

### `roots/validation.yaml`

The validation routing contract.

It maps changed paths and risk types to commands and manual checks. This is how
Greenhouse decides what to run for `verify --changed` and `tend`.

Good route examples:

```yaml
paths:
  src/api/**:
    mode: guarded
    required:
      - id: test:api
        command: pnpm test:api
    manual:
      - id: api-contract-review
        prompt: Review API contract compatibility.
```

### `roots/authority.md`

Human-authored notes about ownership and authority.

Use this to explain what is human-owned, generated, external, or delegated to
Greenhouse.

### `roots/docs.yaml`

Documentation ownership hints.

This tells Greenhouse which docs describe setup, package scripts, validation,
API behavior, deployment, workspace structure, generated files, and similar repo
facts. It powers docs drift warnings.

## Installed Explanation Docs

### `why-greenhouse-spec/README.md`

The purpose of Greenhouse in this repo.

Read this first when the `.greenhouse/` folder is unfamiliar.

### `why-greenhouse-spec/tree-structure.md`

This file.

It explains the tree shape and the role of each installed area.

### `why-greenhouse-spec/agent-workflow.md`

A practical workflow for agents using Greenhouse as a finish gate.

## Generated Intelligence

### `grown/repo-map.yaml`

A generated map of discovered source, tests, docs, generated areas, and package
roots.

### `grown/repo-shape.yaml`

A generated classification of the repo shape: package manager, package kinds,
framework hints, backend/frontend/infra areas, and discovered gaps.

### `grown/command-index.yaml`

A generated index of available commands, usually from package scripts.

Validation routes should point at real commands from this index.

### `grown/validation-proposals.yaml`

Generated proposals for safe repo evolution.

These can include missing package scripts, validation routes, adoptable routes,
or conflicts. Applying proposals is explicit through `apply-proposals --safe`.

### `grown/docs-index.yaml`

A generated docs map from discovery.

This supports docs drift visibility and future documentation intelligence.

### `grown/risk-index.yaml`

Generated risk hints for sensitive or high-impact areas.

Examples: financial logic, generated output contracts, official source handling,
infrastructure, API specs, and protected/generated boundaries.

### `grown/agent-index.yaml`

Generated index of agent-facing files, such as `AGENTS.md` or similar local
instruction files.

### `grown/evidence-index.yaml`

Generated summary of recent evidence.

This lets `status` and future agents find the latest validation context without
reading every evidence file.

### `grown/failure-signatures.yaml`

Generated repeated-failure observations.

These explain recurring failures, but never turn failed validation green.

### `grown/memory-index.yaml`

Generated source-backed index of repo-local memory Markdown.

### `grown/skill-index.yaml`

Generated source-backed index of repo-local skill Markdown.

### `grown/last-inspection.md`

Human-readable summary from the latest inspection.

## Context And Helper Scripts

### `context/manifest.yaml`

Routes rules, docs, memory, skills, evidence, and reports into task-specific
context briefs.

### `memory/`

Canonical repo-local Markdown memory. Adopted files can be indexed into
`.greenhouse/grown/memory-index.yaml`; `inbox/` is a draft lane and
`.greenhouse/proposals/` is the reviewable proposal lane.

### `skills/`

Repo-local skill Markdown. Adopted skills can be surfaced by
`greenhouse-spec context`; draft and proposed skills remain lower authority
until reviewed.

### `proposals/`

Reviewable memory proposals written by agents or developers before adoption.

### `scripts/check-changed.mjs`

Compatibility helper for changed-file validation.

### `scripts/check-greenhouse.mjs`

Compatibility helper for Greenhouse doctor checks.

### `scripts/validate-scope.mjs`

Compatibility helper for scope validation.

## Evidence And Reports

### `evidence/*.md`

Validation evidence written by `verify --write-evidence` or `tend`.

Evidence should say what changed, what commands were selected, what passed or
failed, what manual checks remained, and what repeated failures were observed.

### `reports/doctor/`

Generated doctor reports when requested.

### `reports/tend/`

Generated tending reports when Greenhouse has warnings, proposals, or useful
maintenance context.

## Templates

### `templates/evidence.md`

Installed template for validation evidence format.

### `templates/verification.md`

Installed template for human-readable verification notes.
