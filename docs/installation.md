# Installation Into Another Repo

Use this guide from the repository where Greenhouse should be installed.

## Public Install

For pnpm-based repos:

```bash
pnpm add -D greenhouse-spec
pnpm exec greenhouse-spec init
pnpm exec greenhouse-spec apply-proposals --safe
pnpm greenhouse status
pnpm greenhouse tend
```

For npm-based repos:

```bash
npm install -D greenhouse-spec
npx greenhouse-spec init
npx greenhouse-spec apply-proposals --safe
npm run greenhouse -- status
npm run greenhouse:tend
```

For a zero-install preview:

```bash
pnpm dlx greenhouse-spec init --dry-run
```

In the commands below, `greenhouse-spec` means the package binary. Use
`pnpm exec greenhouse-spec ...` or `npx greenhouse-spec ...` from the shell if
your terminal does not resolve local package binaries directly.

`init` creates `.greenhouse/` with authored roots, generated indexes,
templates, helper scripts, evidence folders, report folders, and install
metadata. It should not overwrite authored files unless `--force-authored` is
explicitly used.

`plant` remains available as the lower-level install primitive, but normal
installation should use `init`.

## Review And Apply Safe Wiring

After initialization:

```bash
greenhouse-spec inspect
greenhouse-spec proposals
greenhouse-spec apply-proposals --safe --dry-run
greenhouse-spec apply-proposals --safe
```

Expected result:

- `.greenhouse/grown/**` is refreshed.
- `.greenhouse/grown/validation-proposals.yaml` lists pending, adoptable,
  conflict, applied, or skipped proposals.
- Safe apply may add missing package scripts and managed validation routes.
- Human-owned collisions are reported, not overwritten.

If a route is `adoptable`, adopt it explicitly:

```bash
greenhouse-spec adopt-proposals --id <proposal-id>
```

or, after reviewing all adoptable entries:

```bash
greenhouse-spec adopt-proposals --all-adoptable
```

## Package Scripts

Greenhouse should normally propose these scripts for package-based repos:

```json
{
  "greenhouse": "greenhouse-spec",
  "greenhouse:status": "greenhouse-spec status",
  "greenhouse:tend": "greenhouse-spec tend",
  "greenhouse:tend:check": "greenhouse-spec tend --check",
  "greenhouse:verify:dry": "greenhouse-spec verify --changed --dry-run",
  "greenhouse:proposals": "greenhouse-spec proposals",
  "prepush": "pnpm greenhouse:tend"
}
```

If the target repo already has a stricter `prepush`, keep it human-owned and
include the Greenhouse gate inside it. Greenhouse reports conflicting `prepush`
scripts instead of overwriting them.

Existing local-checkout aliases such as
`node ../greenhouse/code/greenhouse-spec/dist/cli.js tend` are not portable and
should not be committed in shared repos. `greenhouse-spec update` migrates
accepted local-checkout aliases to the public `greenhouse-spec` command.

Older split aliases such as `check:tend` plus `check:changed:evidence` remain
compatible, but new installs should prefer the public `greenhouse-spec` command.

The public `greenhouse-spec` command is resolved from `node_modules/.bin` when
these scripts run, so target repos should keep `greenhouse-spec` as a dev
dependency.

## Update An Existing Install

When Greenhouse itself changes, run this from the target repo:

```bash
greenhouse-spec update --dry-run
greenhouse-spec update
greenhouse-spec status
```

`update` refreshes generated indexes, helper scripts, templates, and install
metadata. It preserves authored roots such as `.greenhouse/roots/**`.

## Final Install Check

Run:

```bash
greenhouse-spec status
greenhouse-spec doctor
greenhouse-spec verify --changed --dry-run
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

## Local Checkout Development

Before publishing, or when testing a branch locally:

```bash
cd /path/to/greenhouse-spec
pnpm install
pnpm build

cd /path/to/target-repo
node /path/to/greenhouse-spec/dist/cli.js init
node /path/to/greenhouse-spec/dist/cli.js status
```

This path is for Greenhouse development. It is not the recommended end-user
installation flow.
