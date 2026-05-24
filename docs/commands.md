# Command Reference

Every command accepts `--cwd <path>` so it can operate on a target repository
from another working directory.

## `plant`

```bash
greenhouse-spec plant --dry-run
greenhouse-spec plant
```

Creates the initial `.greenhouse/` structure in a repository.

Side effects:

- Writes `.greenhouse/roots/**`, `.greenhouse/context/**`, templates, scripts,
  evidence/report directories, and initial generated files.
- `--dry-run` prints intended writes without changing files.
- `--force-authored` allows overwriting authored root files and should be used
  only after review.

## `inspect`

```bash
greenhouse-spec inspect
greenhouse-spec inspect --dry-run
```

Refreshes generated repo intelligence.

Side effects:

- Rewrites `.greenhouse/grown/**` unless `--dry-run` is used.
- Generates `.greenhouse/grown/validation-proposals.yaml`.
- Does not apply proposals or mutate authored roots.

## `proposals`

```bash
greenhouse-spec proposals
```

Reads `.greenhouse/grown/validation-proposals.yaml` and prints proposal state.
Run `inspect` first when the repo shape may have changed.

## `apply-proposals`

```bash
greenhouse-spec apply-proposals --safe --dry-run
greenhouse-spec apply-proposals --safe
```

Applies safe proposal changes.

Side effects:

- Adds missing Greenhouse package scripts.
- Adds missing managed validation routes.
- Updates validation routes already marked `managed_by: greenhouse-spec`.
- Skips human-owned conflicts.

Use `--dry-run` before real apply in a target repo.

## `adopt-proposals`

```bash
greenhouse-spec adopt-proposals --id <proposal-id> --dry-run
greenhouse-spec adopt-proposals --id <proposal-id>
greenhouse-spec adopt-proposals --all-adoptable
```

Adds Greenhouse ownership metadata to matching human-owned validation routes.
Adoption does not change route commands; it only marks matching routes as
managed so future safe apply can maintain them.

## `tend`

```bash
greenhouse-spec tend
greenhouse-spec tend --check
```

Without `--check`, writes a tend report from the current repo state. With
`--check`, runs fresh discovery in memory and fails if any pending, adoptable,
or conflict proposal exists.

`tend --check` is the intended prepush drift gate.

## `verify`

```bash
greenhouse-spec verify --changed --dry-run
greenhouse-spec verify --changed --write-evidence
greenhouse-spec verify --paths README.md src/cli.ts --dry-run
greenhouse-spec verify --mode guarded --paths src/engine/tax/example.ts
```

Selects validation commands from `.greenhouse/roots/validation.yaml` and runs
them unless `--dry-run` is used.

Important options:

- `--changed`: read changed files from git.
- `--paths`: verify explicit paths.
- `--mode`: force a validation mode.
- `--write-evidence`: write a verification record under `.greenhouse/evidence/`.

## `doctor`

```bash
greenhouse-spec doctor
greenhouse-spec doctor --write-report
```

Checks that the installed Greenhouse configuration is internally consistent.
`--write-report` appends a report under `.greenhouse/reports/doctor/`.
