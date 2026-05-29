# Why Greenhouse Spec

```text
                 _________
            ____/         \____
         __/                   \__
       _/      GREENHOUSE SPEC    \_
      /                             \
     /        /\                     \
    |        /  \     repo care       |
    |       /____\                    |
    |       |    |      roots         |
    |       | /\ |      grown         |
    |       |/  \|      evidence      |
     \        ||                     /
      \_______||____________________/
              ||
              ||
```

Greenhouse Spec is a repo-local tending layer.

It helps an agent or developer enter this repository, understand the local rules,
validate changes with the right commands, detect drift, and leave evidence for
the next person or agent.

It is not a build system, daemon, or permission layer. It is local repository
infrastructure for safer work.

## The Core Idea

Normal repo work is fluent:

```text
read the repo
make the change
run the finish gate
leave evidence
```

Greenhouse makes the finish gate more repo-aware:

```text
changed files
  -> matched validation routes
  -> selected commands
  -> impact warnings
  -> evidence
  -> proposals when the repo shape drifts
```

## The Three Zones

```text
roots     authored contract and repo rules
grown     generated intelligence, safe to refresh
evidence  records of what was checked
```

The split matters.

`roots/` should be reviewed and changed intentionally. These files say what this
repo expects.

`grown/` is disposable. Greenhouse can regenerate these files from the current
repo shape.

`evidence/` is local memory. It records validation runs so future agents do not
need hidden context.

## The Everyday Commands

Start with:

```bash
greenhouse-spec status
```

Finish work with:

```bash
greenhouse-spec tend
```

Debug validation routing with:

```bash
greenhouse-spec verify --changed --dry-run
```

Review repo evolution proposals with:

```bash
greenhouse-spec proposals
greenhouse-spec apply-proposals --safe --dry-run
```

## What Greenhouse Should Make Visible

- A source change with no validation coverage.
- A missing or stale validation command.
- A generated or protected area being edited.
- A docs or setup assumption that may be stale.
- A repeated failure that should not look like a fresh mystery.
- A repo shape change that needs an explicit route or decision.

Greenhouse should not make known failures green. It should explain them.

## What To Read Next

- `tree-structure.md` explains every major `.greenhouse/` path.
- `agent-workflow.md` explains how an agent should use Greenhouse while working.
