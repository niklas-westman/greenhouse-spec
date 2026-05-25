# Installation Into Another Repo

Use this guide from the target repository where Greenhouse should be installed.
The current V1 distribution model is a local checkout of this package. It is not
yet an npm-published package.

The examples assume the Greenhouse source checkout is available at
`../greenhouse/code/greenhouse-spec`. Adjust the path for the target repo.

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

## Initialize The Target Repo

From the target repo:

```bash
node ../greenhouse/code/greenhouse-spec/dist/cli.js init --dry-run
node ../greenhouse/code/greenhouse-spec/dist/cli.js init
node ../greenhouse/code/greenhouse-spec/dist/cli.js status
```

`init` creates `.greenhouse/` with roots, generated indexes, templates, scripts,
evidence, report folders, and install metadata. It should not overwrite
authored files unless `--force-authored` is explicitly used.

`plant` remains available as the lower-level install primitive, but normal
installation should use `init`.

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

## Update An Existing Install

When Greenhouse itself changes, run this from the target repo:

```bash
node ../greenhouse/code/greenhouse-spec/dist/cli.js update --dry-run
node ../greenhouse/code/greenhouse-spec/dist/cli.js update
node ../greenhouse/code/greenhouse-spec/dist/cli.js status
```

`update` refreshes generated indexes, helper scripts, templates, and install
metadata. It preserves authored roots such as `.greenhouse/roots/**`.

## Package Scripts

Greenhouse should normally propose these scripts for package-based repos:

```json
{
  "greenhouse": "node ../greenhouse/code/greenhouse-spec/dist/cli.js",
  "greenhouse:status": "pnpm greenhouse status",
  "check:greenhouse": "pnpm greenhouse doctor",
  "greenhouse:tend": "node ../greenhouse/code/greenhouse-spec/dist/cli.js tend",
  "greenhouse:tend:check": "node ../greenhouse/code/greenhouse-spec/dist/cli.js tend --check",
  "greenhouse:verify:dry": "node ../greenhouse/code/greenhouse-spec/dist/cli.js verify --changed --dry-run",
  "greenhouse:proposals": "node ../greenhouse/code/greenhouse-spec/dist/cli.js proposals",
  "prepush": "pnpm greenhouse:tend"
}
```

If the target repo already has a stricter `prepush`, keep it human-owned and
include the Greenhouse gate inside it. Greenhouse reports conflicting prepush
scripts instead of overwriting them. Existing split aliases such as
`check:tend` and `check:changed:evidence` remain compatible, but new installs
should prefer the `greenhouse:*` scripts.

## Final Install Check

Run:

```bash
node ../greenhouse/code/greenhouse-spec/dist/cli.js status
node ../greenhouse/code/greenhouse-spec/dist/cli.js doctor
node ../greenhouse/code/greenhouse-spec/dist/cli.js verify --changed --dry-run
```

When package scripts are installed, the same checks usually become:

```bash
pnpm greenhouse
pnpm greenhouse:tend:check
pnpm greenhouse:verify:dry
```

The install is healthy when `status` passes, `doctor` has no errors, and
changed-file verification selects scoped commands instead of unrelated broad
fallback work.
