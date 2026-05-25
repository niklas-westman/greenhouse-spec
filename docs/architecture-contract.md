# Greenhouse Architecture Contract

Greenhouse is a repo maintenance system. It keeps an existing repository's
agent context, validation routing, and structural drift checks aligned with the
actual tree. It is not a feature-spec workflow like Spec Kit or OpenSpec.

## System Shape

```text
Existing repo
  |
  v
greenhouse-spec plant
  |
  +-- .greenhouse/roots/       human-authored contract
  +-- .greenhouse/context/     human-authored context manifest
  +-- .greenhouse/templates/   local report templates
  +-- .greenhouse/scripts/     local helper scripts
  +-- .greenhouse/grown/       generated repo intelligence
  +-- .greenhouse/evidence/    validation evidence
  +-- .greenhouse/reports/     generated reports

greenhouse-spec inspect
  |
  v
.greenhouse/grown/*
  |
  +-- repo-shape.yaml
  +-- command-index.yaml
  +-- validation-proposals.yaml
  +-- risk-index.yaml
  +-- evidence-index.yaml

greenhouse-spec tend
  |
  +-- install/root health
  +-- structural drift
  +-- changed-file validation
  +-- evidence
  +-- impact warnings and proposals
```

## Ownership Boundaries

Greenhouse has three ownership zones.

```text
Generated:
  .greenhouse/grown/**

  Greenhouse may rewrite this freely. These files are disposable indexes and
  proposal snapshots.

Evidence and reports:
  .greenhouse/evidence/**
  .greenhouse/reports/**

  Greenhouse may append new records. Agents should read indexes first and only
  open specific evidence/report files when continuing a change or debugging
  validation.

Authored:
  package.json
  .greenhouse/project.yaml
  .greenhouse/roots/**
  .greenhouse/context/manifest.yaml
  .greenhouse/scripts/**
  .greenhouse/templates/**
  AGENTS.md and other agent instruction files

  Greenhouse must not silently overwrite human-owned content. It may only edit
  authored files through explicit proposal commands.
```

## Proposal States

`validation-proposals.yaml` is the bridge between discovery and mutation.

```text
pending
  Greenhouse found missing safe wiring. `apply-proposals --safe` may add it.

adoptable
  A human-owned rule already matches the generated proposal. `adopt-proposals`
  may add Greenhouse metadata without changing commands.

conflict
  A human-owned value differs from the generated proposal. A human must review
  whether the generator or authored rule should change.

applied
  Greenhouse-managed wiring already matches current discovery.

skipped
  The proposal was intentionally not applied.
```

## Command Responsibilities

```text
plant
  Install the base .greenhouse contract and initial generated indexes.

inspect
  Discover repo shape and rewrite .greenhouse/grown/**.

proposals
  Read .greenhouse/grown/validation-proposals.yaml and explain proposal state.

apply-proposals --safe
  Apply missing package scripts and Greenhouse-managed validation routes.
  Never overwrite human-owned conflicts.

adopt-proposals
  Add Greenhouse ownership metadata to matching human-owned validation routes.
  Do not change route commands.

tend --check
  Run fresh in-memory discovery and fail when pending, adoptable, or conflict
  proposals exist. This is the structural-only CI/debug gate.

verify
  Route changed files through validation.yaml and optionally write evidence.

doctor
  Validate Greenhouse files and installed command wiring.
```

## Comparison

```text
Spec Kit / OpenSpec
  Goal: plan and organize a feature before implementation.
  Primary artifacts: specs, proposals, plans, tasks.
  Main question: "What should we build?"

Greenhouse
  Goal: keep an existing repo aligned as its structure changes.
  Primary artifacts: repo shape, validation proposals, evidence, tended roots.
  Main question: "Does this repo still have the right maintenance wiring?"
```

## Design Rules

- Generated files must never influence validation routing as product changes.
- Authored roots stay protected unless an explicit apply/adopt command is run.
- A stricter human-owned command is acceptable when it includes the Greenhouse
  gate it needs to preserve.
- Drift should be visible before push through `tend --check`.
- Evidence should inform future proposals, but agents should not bulk-read old
  evidence by default.
