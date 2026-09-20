# Task

## Goal
Make every form of a task ID resolve to one implementation log. Today
`implLogPath` keys the log by the raw `<task-id>` argument, so
`akrctx impl start TASK-072` and `akrctx impl start TASK-072-judge-runner-receipts`
read and write two different logs, each with its own attempt budget.

## Contract
`implLogPath` resolves its argument to the short task ID (`TASK-NNN`, no slug)
before it builds `.akrctx/local/impl/TASK-NNN/log.md`. The write policy
already names that form (TASK-073). `impl` accepts `TASK-NNN` and the full
capsule directory name, resolves both against the capsule, and rejects
anything else with a named error. This closes the path traversal recorded in
TASK-023. The Clarifications below carry the full rules.

`impl` refuses rather than repairing. It moves, copies and deletes nothing
under `.akrctx/local/impl/`.

## Validation
```
pnpm exec vitest run tests/agents.test.ts
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope
- The write-policy wording and the Doctor capsule-log finding. TASK-073 delivered them.
- Moving implementation logs out of task capsules.
- The judge runner-receipt redesign (TASK-072).
- Changing the round-record format or `parseLog`.

## Clarifications
### Session 2026-09-19
- Opened at the human's request as the follow-up recorded under Open Questions
  in TASK-073.

### Session 2026-09-20
- TASK-074 absorbs TASK-023. One function resolves the argument to `TASK-NNN`
  or rejects it, which closes the path-traversal hole in the same change.
  TASK-023 is closed as absorbed, with a note in its capsule. Reason: both
  tasks change `implLogPath`, and TASK-023's `requireTaskId` would reject
  `TASK-NNN-<slug>`, so a separate delivery would set the rule twice.
- `impl` accepts the short ID `TASK-NNN` and the full capsule directory name
  `TASK-NNN-<slug>`, and resolves both against the capsule through
  `findTaskDirectory`. Both forms resolve to `TASK-NNN`. An argument that
  matches no capsule is an error, including a wrong slug, an unpadded
  `TASK-72` and an ID with no capsule. Reason: only a resolution against the
  capsule makes an orphan or duplicate log impossible, which is the defect
  that opened this task.
- A slug-named log under `.akrctx/local/impl/` is read where it is the only
  log for its capsule. Where both a short-ID log and a slug-named log exist
  for the same capsule, `impl` refuses and names the surplus file. `impl`
  never moves, copies or deletes a log. Reason: this is the only handling that
  never grants a fresh attempt budget in silence and never writes outside the
  path the caller named.
- The human declined independent judge review for this delivery. No snapshot
  was captured and no judge record exists for TASK-074.

## Open Questions
- None.
