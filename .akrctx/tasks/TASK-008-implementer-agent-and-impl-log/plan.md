# Plan

## Workflow

SDD+TDD

## Steps

1. Specify the round record format and the `akrctx impl` command surface, including the
   derived attempt count and the unreadable-log case. Settle the contract before code.
2. Write failing tests for the contract: round numbering across invocations, refusal at
   the budget, append-only history, record round-trip, derived count, malformed log,
   and `--json` shape.
3. Write the failing digest-invariance test first, because it is the one that binds this
   task to the judge: `judge scope` must return identical digests before and after a
   round is recorded, and the log must be absent from `scope.changedFiles`.
4. Implement the log store and the three commands until those tests pass.
5. Write the implementer instructions once, then the three host renderings, with a test
   asserting substantive identity across targets.
6. Add `akrctx impl enable`, mirroring `runJudgeEnable`, writing `agents.implementer` and
   wiring the files into `upgrade` behind the resolved flag. This step depends on TASK-009,
   which lands first on the same branch. Test that a config without an implementer entry
   loads unchanged and emits nothing.
7. Add the Doctor gap check as a sibling of `getJudgeGap`. Do not touch `targetRequired`.
8. Run `pnpm build`, `pnpm test`, `pnpm lint`. Record the results in the review checklist.
9. Update public documentation and the changelog.

## Notes

TASK-009 lands first on this branch. This task therefore adds no configuration key: the
opt-in flag, the per-target model, the emission targets, and the attempt budget all come
from `agents.implementer`.

Step 3 is the ordering constraint. If implementation logging can move `taskDigest` or
enter `scope.changedFiles`, the whole design is unsound and the rest of the work is
wasted, so that test comes before the feature it guards.
