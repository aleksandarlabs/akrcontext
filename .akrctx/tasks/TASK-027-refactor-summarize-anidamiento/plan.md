# Plan

## Workflow

- TDD

## Why

Not because there is a bug — there is not. TDD applies here in its characterization form: write
tests that pin the current behaviour, then restructure until they still pass.

`summarize` in `src/hook/report.ts` decides whether akrctx tells the user their session mutated the
project, and whether that answer is marked uncertain. The deep nesting is exactly where the
behaviour is hardest to read, which means it is exactly where a restructure can drop a branch
without anyone noticing. Existing tests cover some of it; nobody knows which parts. Establishing
that coverage first is the whole safety mechanism for this task.

`fast-patch` was rejected: a refactor with no behavioural safety net over logic that reports on the
user's own session is not a small safe patch.

`research-first` was rejected: the code is present and readable, just badly shaped. There is
nothing to find out that reading it does not answer.

`SDD` was rejected: nothing external changes.

## Steps

1. Record the current maximum nesting depth inside `summarize`, with the line where it occurs, in
   `log.md`. Biome does not measure this, so no tool will check the result later. The number is
   recorded by hand or it does not exist.
2. Map the existing coverage. For each deep branch, find whether `tests/hook.test.ts` already
   exercises it and name the test in `log.md`. Do not duplicate a test that exists.
3. Write characterization tests for every uncovered branch, before touching the function:
   - anonymous overlap, all outcomes seen, `sawSuccess`, candidates disagree on `wasBound`;
   - same, disagreeing on `area`;
   - same, agreeing on both, which must **not** mark uncertain;
   - a reported failure short-circuiting before the area logic;
   - a pending attempt reaching the trailing `pendingAttempts` loop;
   - a governed-area mutation setting `firstMutationWasBound` on first sight only.
4. Confirm the new tests pass against the **unchanged** function. A characterization test that
   fails before the refactor is describing something other than the current behaviour.
5. Restructure. Prefer early `continue` over nesting, and extract helpers named for the decision
   they make, not for their position in the old block structure.
6. Move every explanatory comment with the logic it explains. The comments about a reported
   failure changing nothing, and about uncertainty being derived only after correlation, are the
   reason this code is safe to read at all.
7. Re-record the nesting depth in `log.md`, before and after side by side.
8. Confirm `tests/hook.test.ts` passes with no pre-existing test modified.
9. `CHANGELOG.md`, additive only, continuations indented two spaces.
10. `pnpm lint && pnpm build && npx vitest run`, output recorded verbatim.

## Risks

- **A dropped branch is invisible.** The failure mode of this task is a session incorrectly
  reported as clean, or an uncertainty flag that stops appearing. Neither throws. Steps 2-4 are
  the only defence and they cannot be skipped for time.
- **Modifying a test to make the refactor pass.** That converts a safety net into a rubber stamp.
  If an existing test fails, the behaviour moved and the refactor is wrong — not the test.
- **Extraction can hide the logic instead of clarifying it.** A helper taking eight parameters, or
  a parameter object assembled only to enable the extraction, is the same complexity relocated.
  If the argument list is unwieldy, the split is in the wrong place.
- **Comments get lost in the move.** They explain reasoning that the code cannot express. A
  refactor that improves indentation and drops them leaves the next reader worse off.
- **The "≤3 levels" target in task.md is arbitrary and unenforced.** Chasing it can produce more
  helpers than the logic justifies. The recorded before/after number is the honest measure.
- TASK-032 owns `src/hook/index.ts`. Keep this task inside `report.ts`.
