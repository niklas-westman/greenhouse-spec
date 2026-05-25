# Operating Playbook

This is the practical loop for using Greenhouse in a repo after installation.

## Start Of Work

Run:

```bash
greenhouse-spec status
greenhouse-spec verify --changed --dry-run
```

If `status` passes, the install is healthy, there is no known structural
Greenhouse drift, and changed-file routing can be explained without running
commands. If it is `degraded`, Greenhouse is still operational, but there is
context an agent should not ignore, such as pending changed-file validation or
repeated unresolved failures. If it fails, repair the install or structural drift
before trusting validation routing.

If the latest passing evidence exactly matches the current routed files and
commands, `status` keeps changed validation passing. If the route changed after
that evidence was written, it degrades and points back to
`verify --changed --write-evidence`.

## Before Push

Run:

```bash
greenhouse-spec tend --check
greenhouse-spec verify --changed --write-evidence
```

`status` is advisory and read-only. The conservative prepush gate remains
`tend --check` plus `verify --changed --write-evidence`.

Package-based repos should usually expose this as:

```bash
pnpm check:tend
pnpm check:changed:evidence
```

or as a combined prepush script:

```bash
pnpm check:tend && pnpm check:changed:evidence
```

## When `tend --check` Fails

Use the explicit repair loop:

```bash
greenhouse-spec inspect
greenhouse-spec proposals
greenhouse-spec apply-proposals --safe --dry-run
```

Then choose the correct action:

```text
pending safe proposal
  Run apply-proposals --safe.

adoptable proposal
  Run adopt-proposals --id <proposal-id> after confirming the route matches.

conflict proposal
  Review manually. Do not force apply. Decide whether the authored rule or the
  proposal generator needs to change.
```

After resolving drift:

```bash
greenhouse-spec status
greenhouse-spec doctor
greenhouse-spec verify --changed --dry-run
```

## When The Repo Structure Changes

Examples of structural drift:

- A new frontend app folder appears.
- A backend service or Maven module appears.
- API specs, generated API output, DB scripts, migrations, or screenshot tests
  are added.
- Package scripts are renamed or removed.
- Validation files change but no route owns the new area.

Run:

```bash
greenhouse-spec inspect
greenhouse-spec proposals
```

The desired result is a concrete proposal rather than hidden agent memory. If
Greenhouse misses the new area, improve discovery/proposal generation in this
package instead of adding one-off target repo instructions.

## When Installing Into A New Alignment Repo

Use this sequence:

```bash
greenhouse-spec init --dry-run
greenhouse-spec init
greenhouse-spec status
greenhouse-spec inspect
greenhouse-spec proposals
greenhouse-spec apply-proposals --safe --dry-run
greenhouse-spec apply-proposals --safe
greenhouse-spec status
greenhouse-spec doctor
greenhouse-spec verify --changed --dry-run
```

Evaluate whether the generated routes are both scoped and sufficient. A new repo
shape should improve Greenhouse's general detection only when the behavior is
useful beyond that one repo. For existing installs, use `greenhouse-spec update
--dry-run` before `greenhouse-spec update` to refresh helpers and metadata.

## When Changing Greenhouse Itself

Run the repo's normal checks first:

```bash
pnpm check
```

Then run the local alignment suite before trusting the change across repo
styles:

```bash
pnpm alignment:check
```

The alignment suite is read-only. It verifies Declarion, Sourcer, and Ensember
contracts without writing generated files, proposals, reports, or evidence in
those target repos.

## Agent Rules Of Thumb

- Read generated indexes before opening many evidence files.
- Treat `.greenhouse/grown/**` as disposable.
- Do not edit `.greenhouse/roots/**` manually when a safe proposal can express
  the same change.
- Do not overwrite human-owned conflicts automatically.
- Convert repeated manual fixes into proposal generation logic.
- Keep the prepush gate conservative: drift should fail early and explain the
  next command.
