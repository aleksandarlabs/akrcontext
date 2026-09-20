# Context

Verified by reading the source on 2026-09-19.

- `src/impl.ts:94` `implLogPath(taskId)` interpolates the raw argument into
  `.akrctx/local/impl/${taskId}/log.md`. Callers: `readRecords` (:240),
  `runImplStatus` (:317, :350), `runImplStart` (:372), `runImplLog` (:426).
  `implLogHeader` (:384) writes the raw ID into the log header.
- `src/impl.ts:251` `taskRequiresTdd` already resolves the capsule through
  `findTaskDirectory`, which accepts `TASK-NNN` or `TASK-NNN-<slug>` by prefix.
- `src/task.ts:321` `findTaskDirectory`; `src/task.ts:330` private
  `parseTaskId` maps a directory name to `TASK-NNN`.
- `src/judge-enforcement.ts:817` `requireTaskId` accepts only `^TASK-[0-9]+$`.
- `src/cli/impl.ts` documents `<task-id>` as "task capsule ID, for example TASK-001".
- `.akrctx/local/impl/` holds `TASK-041`, `TASK-045`, `TASK-047`, `TASK-048`,
  `TASK-064`, `TASK-067`, `TASK-072`, `TASK-073` (short form) and
  `TASK-020-project-review-policy` (slug form).
- TASK-023 (`.akrctx/tasks/TASK-023-fix-impl-path-traversal/`) is open: the
  `impl` commands still accept `../../../../tmp/pwn`.
- `parseLog` refuses an untrustworthy log rather than granting a fresh budget.
  A log that becomes invisible after a path change has the same effect.
- Tests: `tests/agents.test.ts` covers `runImplStart`, `runImplLog`, `implLogPath`.

Config: task-fit workflow, judge enabled, comprehension gate disabled. Work
lands as direct commits on main.
