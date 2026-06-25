# src/

Generated: 2026-06-25T17:58:26.597Z

## Summary

src/ is application or repository source area. It has no documented coverage and covered validation.

## Purpose

Application or repository source area.

## Agent Actions

- Read this page before editing files in this area.

## Docs

- none

## Validation

- status: covered
- routes: src/cli.ts, src/commands/**, src/schemas/**, src/proposals/**, src/validation/**, src/verify/**, src/plant/**, src/templates/**, src/tend/**, src/doctor/**, src/discovery/**, src/inspect/**, src/context/**, src/impact/**, src/tree-of-knowledge/**, src/native-scripts/**, src/lifecycle/**, src/status/**, src/evidence/**
- commands: pnpm test:cli, pnpm test:context, pnpm test:discovery, pnpm test:doctor, pnpm test:evidence, pnpm test:impact, pnpm test:inspect, pnpm test:lifecycle, pnpm test:native-scripts, pnpm test:plant, pnpm test:proposals, pnpm test:schemas, pnpm test:templates, pnpm test:tend, pnpm test:validation, pnpm typecheck
- manual checks: none

## Risks

- none

## Memory

- none

## Skills

- none

## Recent Evidence

- .greenhouse/evidence/2026-05-29T19-23-30-507Z-verify.md (pass) - Verification: verify-2026-05-29; mode patch; files docs/installation.md, src/doctor/run-doctor.ts, src/lifecycle/package-script-onboarding.ts, src/lifecycle/run-update.ts, src/native-scripts/package-script-proposals.ts, src/proposals/build-
- .greenhouse/evidence/2026-05-29T11-04-23-403Z-verify.md (pass) - Verification: verify-2026-05-29; mode patch; files src/lifecycle/run-update.ts, tests/lifecycle.test.ts
- .greenhouse/evidence/2026-05-29T10-20-56-438Z-verify.md (pass) - Verification: verify-2026-05-29; mode patch; files src/discovery/agent-files.ts, src/filesystem/safe-write.ts, src/lifecycle/run-update.ts, src/plant/run-plant.ts, src/proposals/apply-proposals.ts, src/proposals/read-proposals.ts, src/propo
- .greenhouse/evidence/2026-05-28T15-12-42-981Z-verify.md (pass) - Verification: verify-2026-05-28; mode patch; files src/lifecycle/run-update.ts, src/plant/run-plant.ts, src/proposals/apply-proposals.ts, src/proposals/read-proposals.ts, src/proposals/run-proposals.ts, src/templates/installed-tree.ts, src/
- .greenhouse/evidence/2026-05-28T08-01-57-716Z-verify.md (pass) - Verification: verify-2026-05-28; mode patch; files src/lifecycle/run-update.ts, src/plant/run-plant.ts, src/templates/installed-tree.ts, tests/lifecycle.test.ts, tests/templates.test.ts, .greenhouse/why-greenhouse-spec/, templates/installed
