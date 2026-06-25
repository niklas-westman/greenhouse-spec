# Release Notes

## 0.3.0 - 2026-06-25

This release adds a generated-hybrid tree of knowledge for agent autonomy.
Authored truth stays in `.greenhouse/roots/**`, while `inspect` generates a
browseable knowledge layer that links repo areas to docs, validation, risks,
memory, skills, and recent evidence.

### Added

- Added `.greenhouse/grown/tree-of-knowledge.yaml` as the machine-readable
  knowledge index.
- Added generated `.greenhouse/tree-of-knowledge/index.md` and area pages for
  meaningful repo subsystem roots.
- Added optional `tracked_docs[].covers[]` rules in `.greenhouse/roots/docs.yaml`
  so docs can declare covered paths, ownership reasons, and strictness.
- Added context surfacing for relevant knowledge areas when task terms or paths
  match generated tree areas.
- Added tree-aware impact warnings when changed files touch documented coverage.

### Changed

- `inspect` and `plant` now generate the tree-of-knowledge outputs.
- `status`, `verify`, and `tend` consume tree-aware docs coverage and distinguish
  repair-required blockers from acknowledgeable review gates.
- Generated knowledge outputs are classified as Greenhouse-generated files so
  they do not trigger product validation.
- Template version is now 2.

### Validation

- Full release validation passed with `pnpm check`.
- Package dry-run passed with `pnpm pack:dry`.

## 0.2.0-alpha.0 - 2026-06-06

This alpha release makes Greenhouse more explicit as a repo-local reconciler:
authored roots describe desired maintenance state, generated files describe
observed state, and `tend`/`inspect` reconcile the two.

### Added

- Added validation command environments with `--env local`, `--env ci`, and
  `--env all` for `verify` and `tend`.
- Added command capability metadata for validation routes, including local
  server, network, home-write, CI-only, and bound-port hints.
- Added review acknowledgements with `--ack`, recorded in evidence and used to
  clear reviewed manual checks or non-blocking impact warnings.
- Added environment-aware failure hints for local server bind failures such as
  `listen EPERM`.
- Added nested Greenhouse command suppression during `tend` validation so
  structural Greenhouse checks stay in the structural phase.
- Added generated `.greenhouse/grown/area-index.yaml`, the first explicit
  "plants in the greenhouse" map of repo areas, inferred purpose, validation
  coverage, risks, and tending gaps.

### Changed

- `inspect` and `plant` now generate `area-index.yaml`.
- `doctor` validates the generated area index.
- Evidence indexes include acknowledgement IDs from recent evidence.
- Status treats acknowledged current-route impact warnings as reviewed while
  preserving blocking-warning behavior.
- Architecture docs now describe Greenhouse through a Kubernetes-inspired
  spec/status/reconciler model.

### Validation

- Full release validation passed with `pnpm check`.
- Package dry-run passed with `pnpm pack:dry`.

### Known Follow-Up

- Tracked-generated file policy, such as guidance for files like
  `infra-aws/cdk.context.json`, is still a separate next release candidate.
