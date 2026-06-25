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

src/tree-of-knowledge/*
  Builds generated AI-facing navigation from repo areas to docs, validation,
  risks, evidence, memory, and skills.

src/context/*
  Builds Markdown-first memory/skill indexes and compiles task context briefs.

src/proposal-lanes/*
  Writes memory/skill proposals and adopts reviewed knowledge into trusted lanes.

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

src/evidence/*
  Writes evidence, evidence indexes, generated failure signatures, and pruning.

src/doctor/*
  Checks that installed Greenhouse files are internally consistent, with optional
  memory/skill health checks.

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

tend --context latest
  links a written context report into validation evidence

verify
  maps changed files to validation commands and optionally writes evidence

context
  combines manifest routes, repo shape, memory, skills, evidence, and validation
  hints into a source-backed task brief; uses generated SQLite FTS ranking when
  available and falls back to YAML/Markdown lexical matching. Optional semantic
  candidates are read only when explicitly enabled and must preserve source
  paths and match reasons.

memory/skills proposal lanes
  write proposed knowledge into lower-authority lanes before explicit adoption

failure signatures
  generated from recent evidence to explain repeated failures without changing
  validation pass/fail behavior
```

## Spec / Status / Reconciler Model

Greenhouse intentionally mirrors the useful part of the Kubernetes object model:

```text
spec
  desired repo maintenance state

status
  observed repo maintenance state

reconciler
  commands that compare desired and observed state, then report or apply safe
  changes
```

For Greenhouse, this maps to repo-local files and commands:

```text
Spec / desired state:
  .greenhouse/project.yaml
  .greenhouse/roots/validation.yaml
  .greenhouse/roots/docs.yaml
  .greenhouse/roots/rules.md
  .greenhouse/roots/authority.md
  .greenhouse/roots/protected-boundaries.md
  .greenhouse/context/manifest.yaml

Status / observed state:
  .greenhouse/grown/repo-shape.yaml
  .greenhouse/grown/repo-map.yaml
  .greenhouse/grown/area-index.yaml
  .greenhouse/grown/tree-of-knowledge.yaml
  .greenhouse/grown/command-index.yaml
  .greenhouse/grown/risk-index.yaml
  .greenhouse/grown/evidence-index.yaml
  .greenhouse/grown/failure-signatures.yaml
  greenhouse-spec status

Reconciliation:
  greenhouse-spec inspect
  greenhouse-spec proposals
  greenhouse-spec apply-proposals --safe
  greenhouse-spec adopt-proposals
  greenhouse-spec tend
```

The invariant is important: generated status must never become authority.
`.greenhouse/grown/**` may explain drift and propose changes, but authored roots
remain the source of desired state. Mutation of authored roots must stay behind
explicit proposal/adoption commands.

Future status work should make this model more concrete, for example with a
generated `.greenhouse/grown/status.yaml` containing conditions such as
`Installed`, `StructuralDrift`, `ValidationEvidenceCurrent`,
`ImpactReviewed`, and `RepeatedFailuresObserved`.

`area-index.yaml` is the first explicit "plants in the greenhouse" status map:
it observes repo areas, infers their purpose, records validation coverage, and
lists tending gaps. It must stay generated; if an inferred purpose or gap should
become policy, that change belongs in authored roots, memory, skills, docs, or
validation routes.

`tree-of-knowledge.yaml` and `.greenhouse/tree-of-knowledge/**` are the
AI-facing navigation layer built from the same generated status plus authored
docs coverage. The tree points agents at the area page, docs, validation,
risks, evidence, memory, and skills that matter for a task. It remains generated
status: if a tree page reveals stale docs or missing rules, the durable fix
belongs in `roots`, docs, memory, skills, or validation routes.

## Ownership Zones

Greenhouse has three practical ownership zones:

```text
Generated and disposable:
  .greenhouse/grown/**
  .greenhouse/tree-of-knowledge/**

Agent-readable knowledge:
  .greenhouse/memory/**
  .greenhouse/skills/**

Agent-writable proposal lanes:
  .greenhouse/memory/inbox/**
  .greenhouse/skills/drafts/**
  .greenhouse/skills/proposals/**
  .greenhouse/proposals/**

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

## Documentation Ownership

Documentation drift hints live in `.greenhouse/roots/docs.yaml`. That root is
authored policy, not generated intelligence; it lets Greenhouse route impact
warnings to the docs that own setup, package scripts, validation, CLI, API, env,
desktop, generated-output, workspace, or CI assumptions.

Tracked docs may also declare `covers` path globs with a reason and strictness.
Those coverage rules feed the tree-of-knowledge and can create path-specific
documentation drift warnings when important code areas change.

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
