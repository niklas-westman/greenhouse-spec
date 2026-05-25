# Command Reference

Every command accepts `--cwd <path>` so it can operate on a target repository
from another working directory.

## Command Model

Primary everyday commands:

```bash
greenhouse-spec status
greenhouse-spec tend
```

`status` is the quiet read-only entry point. `tend` is the composed pre-finish
gate that checks drift, runs changed-file validation, writes evidence, and
summarizes impact warnings/proposals.

Secondary commands expose the same layers directly:

```bash
greenhouse-spec verify --changed --dry-run
greenhouse-spec verify --changed --write-evidence
greenhouse-spec tend --check
greenhouse-spec inspect
greenhouse-spec proposals
greenhouse-spec apply-proposals --safe
```

Use these when debugging routing, repairing drift, or evolving repo wiring.

## `status`

```bash
greenhouse-spec status
greenhouse-spec status --verbose
greenhouse-spec status --json
```

Prints a short read-only health report by combining doctor, self-tending drift
checks, changed-file validation dry-run, and latest evidence discovery. Use
`--verbose` for the detailed Markdown report with health categories and command
details.

`status` uses three top-level states:

- `pass`: install health, structural drift, routing, evidence, and generated
  failure observations are all clear.
- `degraded`: Greenhouse is operational, but an agent should not ignore pending
  context such as selected validation commands or repeated unresolved failures.
- `fail`: install health or structural self-tending checks require action.

`degraded` is advisory and exits successfully. `fail` exits non-zero.

Use `--json` when another agent or script needs stable fields instead of
Markdown. The JSON report includes `overallStatus`, categorized `health`,
`generatedOnlyDirty`, changed-file groups, evidence coverage, repeated failures,
legacy `nextCommand`, and structured `nextAction`.

When only generated Greenhouse artifacts are dirty, status says
`Generated-only dirty: yes`; those files do not affect validation routing.

When routed files are dirty, status compares the current routed files and
commands with the latest indexed evidence. If the latest matching evidence
passed, changed validation remains `pass`; otherwise it is `degraded` and the
next command is `greenhouse-spec tend`.

Side effects: none.

## `init`

```bash
greenhouse-spec init --dry-run
greenhouse-spec init
```

Creates the initial `.greenhouse/` structure in a repository. This is the normal
user-facing install command for new repos.

Side effects:

- Writes `.greenhouse/roots/**`, `.greenhouse/context/**`, templates, scripts,
  evidence/report directories, initial generated files, and install metadata.
- `--dry-run` prints intended writes without changing files.
- `--force-authored` allows overwriting authored root files and should be used
  only after review.

## `update`

```bash
greenhouse-spec update --dry-run
greenhouse-spec update
```

Refreshes generated intelligence and Greenhouse-managed install files in an
existing repo. Authored roots remain protected.

Side effects:

- Rewrites `.greenhouse/grown/**` unless `--dry-run` is used.
- Refreshes `.greenhouse/scripts/**` and `.greenhouse/templates/**`.
- Updates install metadata in `.greenhouse/project.yaml`.

## `plant`

```bash
greenhouse-spec plant --dry-run
greenhouse-spec plant
```

Lower-level install primitive kept for compatibility. Prefer `init` for normal
repo installation.

## `inspect`

```bash
greenhouse-spec inspect
greenhouse-spec inspect --dry-run
```

Refreshes generated repo intelligence.

Side effects:

- Rewrites `.greenhouse/grown/**` unless `--dry-run` is used.
- Generates `.greenhouse/grown/validation-proposals.yaml`.
- Generates `.greenhouse/grown/failure-signatures.yaml` from recent evidence.
- Does not apply proposals or mutate authored roots.

## `proposals`

```bash
greenhouse-spec proposals
greenhouse-spec proposals dismiss --id <proposal-id> --reason "..."
```

Reads `.greenhouse/grown/validation-proposals.yaml` and prints proposal state.
Run `inspect` first when the repo shape may have changed.

Dismissal writes an authored decision to
`.greenhouse/roots/proposal-decisions.yaml`. On the next `inspect`, proposals
with the same idempotency key are marked skipped so intentional non-actions do
not keep reappearing as drift. Dismissal is for explicit human/agent decisions;
it does not modify validation routes or package scripts.

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

Without `--check`, `tend` is the everyday pre-finish Greenhouse surface. It
checks install/root health, runs the structural drift gate, routes changed-file
validation, executes selected validation commands, writes evidence when
commands run, reports repeated failure context, includes impact warnings, and
summarizes proposals.

The default report is state-first and action-oriented. It starts with `State`,
`Flow`, and the repository path, then groups the result into `Changed`,
`Validation`, `Impact`, `Evidence`, `Proposals`, `Repeated Failures`, and
`Next`. Passing reports collapse successful internal checks; failing reports
name the first blocking cause and end with the next useful action.

With `--check`, runs fresh discovery in memory and fails if any pending,
adoptable, or conflict proposal exists.

`tend --check` is structural-only and does not run validation or write evidence.
Normal evidence/report writes prune old generated records unless `--no-prune`
is used.

## `verify`

```bash
greenhouse-spec verify --changed --dry-run
greenhouse-spec verify --changed --write-evidence
greenhouse-spec verify --paths README.md src/cli.ts --dry-run
greenhouse-spec verify --mode guarded --paths src/engine/tax/example.ts
```

Selects validation commands from `.greenhouse/roots/validation.yaml` and runs
them unless `--dry-run` is used.

Dry-run output is the validation routing explanation surface. It starts with an
agent takeaway and validation plan, then shows changed files, changed-file
groups, routed files, risks, route explanations, selected commands with
source/reason metadata, impact warnings, manual checks, and skipped/generated
validation notes.

Impact warnings are stale-assumption signals, not automatic edits. They call out
cases such as package scripts affecting setup docs, CLI source affecting CLI
docs, API specs affecting generated clients, generated-output edits, workspace
config changes, CI workflow changes, and source changes that fell back to broad
validation instead of a scoped route.

Important options:

- `--changed`: read changed files from git.
- `--paths`: verify explicit paths.
- `--mode`: force a validation mode.
- `--write-evidence`: write a verification record under `.greenhouse/evidence/`.
- `--no-prune`: keep all generated evidence/report files for this run.

Failed commands always fail validation. If a failed command resembles a recent
generated failure signature, the report may annotate it as repeated, but the
command status remains `fail`.

Evidence is repo-local memory, not permission to ignore validation. Evidence
records include selected commands, route reasons, manual checks, impact
warnings, bounded/redacted command excerpts, and, when written by `tend`, the
final tending state. Full command logs are not stored by default.

## `doctor`

```bash
greenhouse-spec doctor
greenhouse-spec doctor --write-report
```

Checks that the installed Greenhouse configuration is internally consistent.
`--write-report` appends a report under `.greenhouse/reports/doctor/`. Old
generated reports are pruned unless `--no-prune` is used.

## `alignment`

```bash
greenhouse-spec alignment
greenhouse-spec alignment --repo declarion
greenhouse-spec alignment --repo declarion sourcer ensember
greenhouse-spec alignment --json
```

Runs read-only contracts against the local alignment repos. It does not refresh
`.greenhouse/grown/**`, apply proposals, or write evidence in target repos.

Default contracts:

- Declarion: single-package React/Vite + CLI, expected degraded status from the
  known repeated app test failure, and scoped app routing.
- Sourcer: React workspace frontend plus Java/Maven backend routing.
- Ensember: React/Vite + Tauri/Rust/Cargo routing, including `src-tauri/**`.

## `evidence prune`

```bash
greenhouse-spec evidence prune --dry-run
greenhouse-spec evidence prune
greenhouse-spec evidence prune --keep 50
```

Prunes old generated evidence/report markdown files. The default retention is
the latest 20 markdown files per generated record folder.
