# Workflows

akrctx supports explicit workflows without forcing every task into the same process.

## Supported Workflows

- `fast-patch`
- `research-first`
- `SDD`
- `TDD`
- `EDD`
- `SDD+TDD`
- `SDD+EDD`
- `TDD+EDD`

## Recommended Use

Use `fast-patch` for small, low-risk changes with obvious behavior.

Use `research-first` when the code area is unknown or the architecture is unclear.

Use `SDD` for APIs, contracts, schemas, permissions, and externally visible behavior.

Use `TDD` for bugs, regressions, and logic changes with clear expected outcomes.

Use `EDD` when examples and edge cases are the main source of clarity.

Use `SDD+TDD` for new or changed contracts that need executable tests.

Use `SDD+EDD` for rule-heavy domains where examples and boundaries matter.

Use `TDD+EDD` for bug fixes where examples clarify edge cases.

## Agent-First Flow

After `akrctx init`, the selected coding agent should own task preparation:

```txt
Run akrctx task workflow for invoice API examples. Use SDD+EDD.
```

The CLI task command is a deterministic fallback:

```bash
akrctx task "Define invoice API examples" --workflow SDD+EDD
```

Every task capsule should record:

```md
## Recommended Workflow

SDD+EDD

## Workflow Notes

- Workflow source: explicit user request.
- Why this workflow: invoice behavior needs a contract plus edge-case examples.
```
