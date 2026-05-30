# Greenhouse Docs

This folder is the operational map for `greenhouse-spec`. It is written for AI
agents and developers who need to understand the system quickly, install it into
another repository, and work safely with the files it creates.

## Read Order For AI Agents

1. [Root README](../README.md) for the product shape and normal loop.
2. [Architecture Contract](architecture-contract.md) for ownership boundaries.
3. [Architecture](architecture.md) for how the CLI, discovery, proposals, and
   validation modules fit together.
4. [Installation](installation.md) for planting Greenhouse into a target repo.
5. [Commands](commands.md) for command side effects and expected use.
6. [Proposals](proposals.md) for safe apply, adoption, and conflicts.
7. [Validation Routing](validation-routing.md) for changed-file routing and
   evidence behavior.
8. [Operating Playbook](operating-playbook.md) for day-to-day use and drift
   resolution.

## Mental Model

```text
target repo
  |
  +-- .greenhouse/roots/**       human-authored contract
  +-- .greenhouse/memory/**      repo-local Markdown memory
  +-- .greenhouse/skills/**      repo-local Markdown skills
  +-- .greenhouse/grown/**       generated repo intelligence
  +-- .greenhouse/evidence/**    validation proof records
  +-- .greenhouse/reports/**     generated health/tend reports
  |
  v
greenhouse-spec
  discovers repo shape
  proposes missing validation wiring
  applies only safe or managed changes
  verifies changed files with scoped commands
  blocks prepush when structure has drifted
```

Greenhouse should make repository maintenance more autonomous without silently
taking ownership of human-authored rules. Generated files are disposable.
Authored roots are protected. Mutation happens through explicit commands.

## Current Scope

Greenhouse V1 focuses on:

- Installing and updating a small `.greenhouse/` contract.
- Discovering repo shape, scripts, docs, risks, and generated outputs.
- Proposing missing package scripts and validation routes.
- Applying safe additive changes and managed route updates.
- Adopting matching human-owned routes into Greenhouse ownership.
- Running one read-only `status` command for repo health.
- Running a conservative `tend --check` gate before push.
- Routing changed files to validation commands and writing bounded evidence.
- Compiling task-specific context briefs from manifest routes, memory, skills,
  evidence, and validation hints.

Greenhouse does not yet convert every tend/evidence learning into structured
proposals. That is a future evolution of the same proposal system.
