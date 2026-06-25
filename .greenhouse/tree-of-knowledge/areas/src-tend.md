# src/tend/

Generated: 2026-06-25T17:58:26.597Z

## Summary

src/tend/ is application or repository source area. It has 1 documented coverage link and covered validation.

## Purpose

Application or repository source area.

## Agent Actions

- Read this page before editing files in this area.
- Review linked docs when behavior or public contracts change.

## Docs

- docs/validation-routing.md (guarded) - Tend finish-gate behavior is documented here.

## Validation

- status: covered
- routes: src/tend/**
- commands: pnpm test:tend, pnpm typecheck
- manual checks: none

## Risks

- none

## Memory

- none

## Skills

- none

## Recent Evidence

- .greenhouse/evidence/2026-05-29T10-20-56-438Z-verify.md (pass) - Verification: verify-2026-05-29; mode patch; files src/discovery/agent-files.ts, src/filesystem/safe-write.ts, src/lifecycle/run-update.ts, src/plant/run-plant.ts, src/proposals/apply-proposals.ts, src/proposals/read-proposals.ts, src/propo
- .greenhouse/evidence/2026-05-28T15-12-42-981Z-verify.md (pass) - Verification: verify-2026-05-28; mode patch; files src/lifecycle/run-update.ts, src/plant/run-plant.ts, src/proposals/apply-proposals.ts, src/proposals/read-proposals.ts, src/proposals/run-proposals.ts, src/templates/installed-tree.ts, src/
- .greenhouse/evidence/2026-05-24T17-01-28-083Z-verify.md (pass) - Verification: verify-2026-05-24; mode guarded; files README.md, docs/README.md, docs/commands.md, docs/installation.md, docs/operating-playbook.md, src/cli.ts, src/commands/doctor.ts, src/commands/tend.ts, src/commands/verify.ts, src/doctor
- .greenhouse/evidence/2026-05-24T16-32-33-409Z-verify.md (pass) - Verification: verify-2026-05-24; mode guarded; files README.md, docs/README.md, docs/commands.md, docs/installation.md, docs/operating-playbook.md, src/cli.ts, src/commands/doctor.ts, src/commands/tend.ts, src/commands/verify.ts, src/doctor
- .greenhouse/evidence/2026-05-24T15-28-21-384Z-verify.md (pass) - Verification: verify-2026-05-24; mode guarded; files src/doctor/run-doctor.ts, src/native-scripts/package-script-proposals.ts, src/proposals/build-proposals.ts, src/tend/run-tend.ts, tests/doctor.test.ts, tests/native-scripts.test.ts, tests
