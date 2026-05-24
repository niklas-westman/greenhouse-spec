# Proposal Lifecycle

Greenhouse proposals are the safe bridge between repo discovery and mutation.
`inspect` builds them and writes:

```text
.greenhouse/grown/validation-proposals.yaml
```

This file is generated. It is safe to rewrite and should be treated as a
snapshot of current repo drift, not as a human-authored root.

## Proposal Kinds

```text
package-script
  A package.json script is missing, adoptable, conflicting, or already managed.

validation-route
  A repo area exists but lacks a matching validation route or managed route
  ownership.
```

## States

```text
pending
  Missing safe wiring. Safe apply may add it.

adoptable
  A human-owned route already matches the generated proposal. Adoption can add
  metadata without changing commands.

conflict
  Human-owned content differs from the generated proposal. Review manually.

applied
  Greenhouse-managed wiring already matches discovery.

skipped
  The proposal was intentionally not applied.
```

## Safe Apply

Run dry-run first:

```bash
greenhouse-spec apply-proposals --safe --dry-run
```

Then apply:

```bash
greenhouse-spec apply-proposals --safe
```

Safe apply can:

- Add missing Greenhouse package scripts.
- Add missing validation routes with `managed_by: greenhouse-spec`.
- Update routes already managed by Greenhouse.

Safe apply cannot:

- Overwrite human-owned scripts with different values.
- Replace human-owned validation routes that differ from a proposal.
- Mutate authored roots as a side effect of `inspect` or `tend --check`.

## Adoption

Adoption is for human-owned validation routes that already match Greenhouse's
generated route. It adds metadata such as:

```yaml
managed_by: greenhouse-spec
origin: repo-shape
proposal_id: route-frontend
confidence: high
```

Adoption command:

```bash
greenhouse-spec adopt-proposals --id <proposal-id>
```

Adopt all only after reviewing the proposal list:

```bash
greenhouse-spec adopt-proposals --all-adoptable
```

## Conflicts

A conflict means Greenhouse found existing human-owned wiring that does not
match the generated proposal. Resolve conflicts by choosing one of these paths:

- Keep the human-owned rule and improve Greenhouse detection if the proposal is
  wrong.
- Edit the human-owned rule to match the desired Greenhouse route, then adopt.
- Add a different manual route and accept that the proposal remains a blocker
  until detection learns that pattern.

`tend --check` fails while conflicts remain because the repo has unresolved
maintenance ownership drift.
