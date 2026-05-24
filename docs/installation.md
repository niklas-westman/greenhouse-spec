# Installation Into Another Repo

Use this guide from the target repository where Greenhouse should be installed.
The examples assume the Greenhouse source checkout is a sibling path available
at `../greenhouse/code/greenhouse-spec`. Adjust the path for the target repo.

## Build Greenhouse First

From the Greenhouse package:

```bash
pnpm install
pnpm build
```

The CLI entrypoint after build is:

```text
dist/cli.js
```

## Plant The Contract

From the target repo:

```bash
node ../greenhouse/code/greenhouse-spec/dist/cli.js plant --dry-run
node ../greenhouse/code/greenhouse-spec/dist/cli.js plant
```

`plant` creates `.greenhouse/` with roots, generated indexes, templates,
scripts, evidence, and report folders. It should not overwrite authored files
unless `--force-authored` is explicitly used.

## Inspect And Review Proposals

```bash
node ../greenhouse/code/greenhouse-spec/dist/cli.js inspect
node ../greenhouse/code/greenhouse-spec/dist/cli.js proposals
node ../greenhouse/code/greenhouse-spec/dist/cli.js apply-proposals --safe --dry-run
```

Expected result:

- `.greenhouse/grown/**` is refreshed.
- `.greenhouse/grown/validation-proposals.yaml` lists pending, adoptable,
  conflict, applied, or skipped proposals.
- Dry-run output shows what safe apply would change.

## Apply Safe Wiring

```bash
node ../greenhouse/code/greenhouse-spec/dist/cli.js apply-proposals --safe
```

Safe apply may add missing package scripts and managed validation routes. It
does not overwrite human-owned collisions.

If a route is `adoptable`, adopt it explicitly:

```bash
node ../greenhouse/code/greenhouse-spec/dist/cli.js adopt-proposals --id <proposal-id>
```

or, after reviewing all adoptable entries:

```bash
node ../greenhouse/code/greenhouse-spec/dist/cli.js adopt-proposals --all-adoptable
```

## Package Scripts

Greenhouse should normally propose these scripts for package-based repos:

```json
{
  "greenhouse": "node ../greenhouse/code/greenhouse-spec/dist/cli.js",
  "check:greenhouse": "node ../greenhouse/code/greenhouse-spec/dist/cli.js doctor",
  "check:changed": "node ../greenhouse/code/greenhouse-spec/dist/cli.js verify --changed",
  "check:changed:evidence": "node ../greenhouse/code/greenhouse-spec/dist/cli.js verify --changed --write-evidence",
  "check:tend": "node ../greenhouse/code/greenhouse-spec/dist/cli.js tend --check",
  "prepush": "pnpm check:tend && pnpm check:changed:evidence"
}
```

If the target repo already has a stricter `prepush`, keep it human-owned and
include the Greenhouse gate inside it. Greenhouse reports conflicting prepush
scripts instead of overwriting them.

## Final Install Check

Run:

```bash
node ../greenhouse/code/greenhouse-spec/dist/cli.js tend --check
node ../greenhouse/code/greenhouse-spec/dist/cli.js doctor
node ../greenhouse/code/greenhouse-spec/dist/cli.js verify --changed --dry-run
```

When package scripts are installed, the same checks usually become:

```bash
pnpm check:tend
pnpm check:greenhouse
pnpm check:changed --dry-run
```

The install is healthy when `tend --check` and `doctor` pass, and changed-file
verification selects scoped commands instead of unrelated broad fallback work.
