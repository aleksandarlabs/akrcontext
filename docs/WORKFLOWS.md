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
- `UI review` (auto-assigned via `workflowRules.ui`, not user-selectable as a default)

## Recommended Use

Use `fast-patch` for small, low-risk changes with obvious behavior.

Use `research-first` when the code area is unknown or the architecture is unclear.

Use `SDD` for APIs, contracts, schemas, permissions, and externally visible behavior.

Use `TDD` for bugs, regressions, and logic changes with clear expected outcomes.

Use `EDD` when examples and edge cases are the main source of clarity.

Use `SDD+TDD` for new or changed contracts that need executable tests.

Use `SDD+EDD` for rule-heavy domains where examples and boundaries matter.

Use `TDD+EDD` for bug fixes where examples clarify edge cases.

For TDD workflows, the implementation log must preserve one ordered red→green pair in the
same round. The red validation records `phase: "red"`, `status: "failed"`, and an
`expectedFailure` whose text appears in its verbatim output; the green validation records
`phase: "green"`, `status: "passed"`, and follows with the same command after whitespace
normalization. A
missing or mismatched pair blocks the implementer handoff. Older logs remain readable but do
not receive invented evidence.

Use `UI review` for tasks that require reviewing or validating UI quality. The agent discovers available tools (stylelint, eslint, storybook, playwright, chromatic, etc.) and runs them without modifying code. If the project defines its own UI review conventions, those take precedence.

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
