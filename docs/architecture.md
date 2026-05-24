# Architecture

`greenhouse-spec` is a Node CLI that installs and maintains repo-local agent
maintenance context. The installed state lives in a target repository under
`.greenhouse/`; the implementation lives in this package under `src/`.

## Module Map

```text
src/cli.ts
  Registers commands with commander.

src/commands/*
  Thin CLI adapters. Parse options, call a runner, print a report, set exitCode.

src/plant/*
  Creates the initial .greenhouse tree from templates.

src/inspect/*
  Discovers repo shape and writes generated indexes under .greenhouse/grown/**.

src/proposals/*
  Builds, reads, prints, applies, and adopts structured maintenance proposals.

src/native-scripts/*
  Detects and proposes package.json script wiring.

src/tend/*
  Creates durable tend reports and powers the non-mutating tend --check gate.

src/validation/*
  Classifies changed paths, matches validation routes, and runs commands.

src/verify/*
  Coordinates validation selection, execution, and evidence writing.

src/doctor/*
  Checks that installed Greenhouse files are internally consistent.

src/schemas/*
  Zod schemas for installed YAML and generated proposal data.

src/templates/*
  Declares the installed file tree.
```

## Data Flow

```text
plant
  writes .greenhouse roots, context, templates, scripts, and initial grown files

inspect
  reads target repo files and rewrites .greenhouse/grown/**

build proposals
  compares repo-shape, command-index, package.json, and validation.yaml

proposals
  prints pending/adoptable/conflict/applied/skipped proposal state

apply-proposals --safe
  adds missing package scripts and Greenhouse-managed validation routes

adopt-proposals
  adds ownership metadata to matching human-owned validation routes

tend --check
  runs fresh discovery in memory and fails if structural drift remains

verify
  maps changed files to validation commands and optionally writes evidence
```

## Ownership Zones

Greenhouse has three practical ownership zones:

```text
Generated and disposable:
  .greenhouse/grown/**

Append-only records:
  .greenhouse/evidence/**
  .greenhouse/reports/**

Authored and protected:
  package.json
  .greenhouse/project.yaml
  .greenhouse/roots/**
  .greenhouse/context/manifest.yaml
  .greenhouse/scripts/**
  .greenhouse/templates/**
  AGENTS.md and other agent instruction files
```

Only explicit proposal commands should mutate authored files. `inspect` and
`tend --check` must not silently rewrite authored roots.

## Route Metadata

Validation routes in `.greenhouse/roots/validation.yaml` may include metadata:

```yaml
managed_by: greenhouse-spec
origin: repo-shape
proposal_id: route-frontend
confidence: high
```

This metadata marks a route as Greenhouse-managed. Safe apply may update
Greenhouse-managed entries. Human-owned entries without this metadata are
protected unless they are explicitly adopted and already match the proposal.
