# Agent Workflow With Greenhouse

Greenhouse should make work safer without making normal work ceremonial.

You do not need to ask Greenhouse for permission before every edit. Use it as
repo-local infrastructure that helps you understand and finish work responsibly.

## Start

Run:

```bash
greenhouse-spec status
```

Use the result to answer:

- Is Greenhouse installed and healthy?
- Are there existing changed files?
- Are proposals or drift already present?
- Is there recent evidence?
- Are repeated failures already known?

If `status` is `degraded`, read the summary. Degraded does not always mean the
repo is broken. It usually means there is context an agent should not ignore.

When working with repo-local memory or skills, run:

```bash
greenhouse-spec doctor --memory
```

Use the warnings to refresh stale adopted knowledge, repair broken links, or
triage old drafts before relying on them.

## Work Normally

Read the code, make the smallest useful change, and follow the repo's existing
patterns.

Use `.greenhouse/roots/**` for stable repo-local rules:

- `validation.yaml` tells you how changes are validated.
- `docs.yaml` tells you which docs may go stale.
- `protected-boundaries.md` tells you where extra care is required.
- `rules.md` and `authority.md` explain local expectations.

Use `.greenhouse/grown/**` as generated context. Do not manually polish it.

## Before Finishing

Run:

```bash
greenhouse-spec tend
```

This is the normal finish gate. It checks install health, structural drift,
changed-file validation, impact warnings, proposals, repeated failures, and
evidence.

Possible outcomes:

```text
pass     work is tended; no action needed
warning  validation may pass, but manual review or impact context remains
fail     validation, install health, or structural drift blocks finishing
```

## Debug Validation Selection

If the selected commands look surprising, run:

```bash
greenhouse-spec verify --changed --dry-run
```

Read:

- changed files considered
- groups
- matched path rules
- selected commands
- manual checks
- impact warnings
- fallback routing

If a source file falls back to broad validation repeatedly, improve
`.greenhouse/roots/validation.yaml` or review generated proposals.

## Handle Proposals

Run:

```bash
greenhouse-spec proposals
```

If safe proposals exist, preview them:

```bash
greenhouse-spec apply-proposals --safe --dry-run
```

Apply only when the dry-run matches the repo's intent:

```bash
greenhouse-spec apply-proposals --safe
```

Greenhouse should prefer visible proposals over hidden mutation. Authored roots
remain protected.

## Evidence

When `tend` or `verify --changed --write-evidence` runs validation, Greenhouse
writes evidence under:

```text
.greenhouse/evidence/
```

Evidence is local memory. It helps the next agent understand what changed, what
was checked, and what still needs attention.

## What Good Agent Behavior Looks Like

```text
1. Run greenhouse-spec status.
2. Read relevant code and roots.
3. Make the change.
4. Run focused tests when useful during development.
5. Run greenhouse-spec tend before finishing.
6. Fix validation failures or explain remaining external failures.
7. Leave evidence.
```

## What Greenhouse Should Not Be Used For

- Do not use Greenhouse to make a failed command look green.
- Do not edit generated `grown/**` files as authored documentation.
- Do not weaken validation routes to avoid failures.
- Do not silently overwrite human-authored roots.
- Do not treat warnings as meaningless; read them and decide.

The goal is not ceremony. The goal is that the repo does not silently drift.
