# Plan

## Workflow

TDD

## Reason

`defaults.workflow` is `task-fit`, so the smallest fitting workflow applies.

fast-patch is too small for fixes 1 and 2: they change what counts as a valid
approval, and the failure mode is silent — a bad rule does not throw, it opens the
gate. That is exactly a branch a failing test should drive, and the existing suite
proves the pattern works (it already pins "invalidates when code changes" and
"rejects a failed validation"). Each new rule is one assertion on one mutated fixture.

SDD is not needed: the contract already exists in `review.schema.json` and the
acceptance criteria specify the rules precisely. There is nothing to design, only to
enforce. EDD does not apply — the edge cases here are the rules themselves, not a
space to explore.

Fixes 3 and 4 are mechanical CLI plumbing and ride along under the same capsule; the
`--json` change gets a CLI-level test because it is observable behavior.

## Steps

1. Write failing tests for the four criteria: APPROVED with `tests: []`, APPROVED
   with all `not-run`, APPROVED with non-empty `issues`, and a NEEDS_CHANGES record
   that must not gain new reasons.
2. Add the two APPROVED-only rules to `verifyJudgeRecord`.
3. Express both rules in `reviewSchema` as an `allOf` conditional on `verdict`,
   keeping `$id` as `akrctx-judge-review-v1`. Update the contract README body.
4. Teach `judgeInstructions` both rules and what to report when validation cannot run.
5. Route `judge scope` and `judge verify` through `normalizeOptions`; make `--json`
   real on `scope` with a human-readable default. Add a CLI test.
6. Update `docs/JUDGE.md`.
7. Run `pnpm test` and `pnpm lint`.
8. Regenerate this repo's own installed copies through the upgrade path — do not
   hand-edit `.claude/agents/akrctx-judge.md` or
   `.akrctx/judge/schemas/review.schema.json`.

## Notes

`.akrctx/config.json` has `judge.enabled: true` with `trigger: post-implementation`,
so this task needs an independent judge pass after implementation, saved under
`.akrctx/local/judge/` and checked with `akrctx judge verify`.
`comprehensionGate.enabled` is false, so no comprehension handoff is required.

The judge reviewing this task will be bound by the very rules it adds: its own record
will need a passing validation command and an empty `issues` array to verify.
