# Plan

## Workflow

TDD.

`defaults.workflow` is `task-fit`, and `workflowRules.bugfix` is `TDD`. All four points are
defects in existing behaviour rather than new surface, and each one is a guard whose whole
value is that it fires. A guard shipped without a test that saw it fail is a guard nobody
knows is wired. No contract changes shape, so SDD adds nothing here.

## Steps

1. Write the failing tests for all four points in `tests/agents.test.ts`, next to the
   suites that already cover the surrounding behaviour.
2. Point 1 — add the ignore check to the implementation store. `impl enable` throws (it is
   an install command, like `comprehension enable`); `start`, `log`, and `status` refuse
   through the existing `refused`/`reason` and `readable` fields, because they are the
   agent-facing commands and already report that way.
3. Point 2 — move the unknown-entry rejection in `normalizeAgents` to a preserved passthrough
   plus a warning in `agentWarnings`, and drop the now-duplicated raw gap in `doctor`.
4. Point 3 — add a record validator in `src/impl.ts` and call it from the `--record` branch
   in `src/cli.ts`.
5. Point 4 — add the empty-target guard to `runJudgeEnable`.
6. Run `npx vitest run` and `npx tsc --noEmit`, then fill the review checklist.
