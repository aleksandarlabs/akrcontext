# Plan

## Workflow

- SDD+TDD — per `config.json` `workflowRules.apiOrContract`. This task adds a CLI flag, changes
  `--run-tests` headless behavior, and alters exit codes: that is contract surface, so
  SDD+TDD applies, not fast-patch.

## Steps

1. **SDD — contract.** Freeze the behavior contract in `acceptance-criteria.md` (done). The
   options shape is `approve?: (commands: string[]) => Promise<boolean>`; TTY detection and flag
   parsing stay in the CLI.
2. **TDD — failing tests first.** In `tests/akrctx.test.ts`, add the cases listed in
   acceptance-criteria.md §Tests. Unit cases drive `verifyJudgeRecord` with a fake `approve`
   callback; CLI cases exercise the flag. Confirm they fail for the right reason (current code
   runs without approval; current code accepts non-snapshot candidates).
3. **Implement the snapshot requirement.** In `judge-enforcement.ts`, inside the `runTests`
   branch, refuse before anything else when `isSnapshotCandidate(record.scope.candidate)` is
   false: push a reason telling the operator to snapshot first and skip. Delete the
   `validationCwd = reviewCwd` fallback; the branch is now snapshot-only.
4. **Implement the gate.** After resolving `declaredAndPassing` and before the execution loop,
   call `options.approve?.(declaredAndPassing)`. Absent or false → push a reason naming the
   withheld commands and skip the loop. No printing, no `process.stdin` access in this module.
5. **CLI wiring.** In `cli/judge.ts`, add the repeatable `--approve-commands <cmd>` (commander
   collector into `string[]`), build the `approve` callback — TTY: numbered list + y/N via
   readline; headless: element-for-element comparison, and on refusal print the expected commands
   plus the copy-pasteable invocation — pass it to `verifyJudgeRecord`, and update the
   `--run-tests` help text.
6. **Green.** `pnpm test` until every new case passes and the existing run-tests suite stays green
   with an approving callback supplied.
7. **Cross-cutting.** `pnpm build`, `npx tsc --noEmit`, `pnpm lint`, `akrctx doctor`, and the
   `CHANGELOG.md` breaking entry.
8. **Judge gate.** Capture `akrctx judge snapshot TASK-019` and offer the independent judge for
   review (judge is enabled; wait for human confirmation before invoking).