# TASK-084 — Preserve a retired criterion identifier

## Goal

Stop `akrctx task migrate-criteria` from reassigning an identifier that a capsule retired on
purpose. A criterion identifier must keep pointing at the same criterion for the life of the
capsule, which is the reason identifiers exist.

## Problem evidence

Three capsules retire an identifier deliberately. TASK-076 and TASK-078 retire `AC-5` after a
design review removed the criterion, and TASK-081 retires `AC-2` and `AC-3`. Each records the
retirement in its `## Contract` section and states that the identifier must not be reused.

`akrctx task migrate-criteria --dry-run` reports all three as needing migration:

```
  ! .akrctx/tasks/TASK-076-judge-round-accounting/acceptance-criteria.md  11 criteria
  ! .akrctx/tasks/TASK-078-clarification-signal/acceptance-criteria.md  10 criteria
  ! .akrctx/tasks/TASK-081-checklist-claim-classes/acceptance-criteria.md  9 criteria
```

`numberCriteria` in `src/task.ts` rewrites every top-level bullet as `AC-<n>` counting from 1,
then the caller compares the result with the original text and reports a change. For a capsule
with a gap, the command therefore moves every later criterion up by one and reassigns a retired
identifier to a different criterion. A review record written against the old numbering would then
point at the wrong criterion, silently.

The two halves of the harness disagree. `readAcceptanceCriteria` accepts a gap and reports no
problem, because it only requires uniqueness and a valid shape. The migration command treats the
same file as needing repair. TASK-075 introduced both and its AC-3 asked only that the CLI
"migrates existing capsules to identifiers mechanically, without human editing". Nothing said what
a mechanical pass must do to a capsule that is already correct.

TASK-075's own clarification stated the principle this defect breaks: positional indexes were
rejected because "a bullet inserted or reordered between round 1 and round 2 would silently
repoint an existing finding". The migration command reintroduces exactly that failure.

## Contract
To be written after the open questions below are answered.

## Validation
```
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope

- Changing the identifier format, the record shape, or the APPROVED rule from TASK-075.
- Renumbering any existing capsule. This delivery makes a command stop editing files it should
  leave alone.
- Enforcing that identifiers are contiguous. A gap is the expected result of a retirement.

## Clarifications

Ambiguity resolved with the human before implementation. One answer per top-level `- ` bullet.

- None recorded yet.

## Open Questions

Ambiguity still unresolved. One question per top-level `- ` bullet.

- Does migration ever renumber a bullet that already carries a valid identifier? The narrow rule
  is that it only adds an identifier to a bullet that has none, and never touches an existing one.
  That makes a retirement safe by construction. It also leaves a capsule with duplicate
  identifiers unrepaired, because repairing a duplicate means changing one of them.

- How does a capsule declare a retirement, so a reader can tell a retirement from a lost
  criterion? TASK-076, TASK-078 and TASK-081 state it in prose inside `## Contract`, which no tool
  reads. Candidates: a retired-identifier line in `acceptance-criteria.md`, a tombstone bullet
  carrying the identifier and a retired marker, or leaving it to prose and accepting that the gap
  is unexplained to any tool.

- What does the command do with a capsule that has both a defect and a gap, such as one unnumbered
  bullet and a retired identifier? Numbering the new bullet needs a number that was never used,
  which requires the retirement to be machine-readable, or the command must refuse and say why.

- Is the `changed` result of a no-op pass a defect in itself? The command currently reports a
  change for a file it should not touch, and `--dry-run` prints it as a planned write. A caller in
  CI reading that output learns the wrong thing even when nobody applies the migration.
