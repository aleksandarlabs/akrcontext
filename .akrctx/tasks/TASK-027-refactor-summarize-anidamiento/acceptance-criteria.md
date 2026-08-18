# Acceptance Criteria

## Behaviour is provably unchanged

- This is the only criterion that matters. `summarize` in `src/hook/report.ts` decides whether a
  session is reported as having mutated the project and whether that report is marked uncertain.
  A refactor that shifts one branch changes what akrctx tells the user about their own session.
- `tests/hook.test.ts` passes with **no test modified**. A changed test in this task means the
  behaviour moved.
- Before restructuring, the current behaviour is pinned by tests for each path that is currently
  only reachable through the deep nesting:
  - an anonymous overlap where `outcomesSeen === candidates.length`, `sawSuccess` is true, and the
    candidates disagree on `wasBound`;
  - the same, where they disagree on `area`;
  - the same, where they agree on both, and so must **not** mark uncertain;
  - a reported failure short-circuiting before the area logic;
  - a pending attempt never reported, reaching the trailing `pendingAttempts` loop;
  - a governed-area mutation setting `firstMutationWasBound` on first sight only.
- Any of those already covered is identified by name in `log.md` rather than duplicated.

## The nesting is actually reduced

- The measurement is stated before the work: record the current maximum nesting depth inside
  `summarize` in `log.md`, with the line it occurs on.
- The target is a reduction against that recorded number, not the abstract "≤3" in task.md.
  Biome does not measure nesting, so no tool will check it; the number is recorded by hand, before
  and after, in `log.md`.
- Extracted helpers are named for the decision they make, not for the mechanics. A helper called
  `shouldMarkUncertain` is useful; one called `handleBlock2` is the same nesting with a new name.
- No helper takes a parameter object assembled purely to satisfy the extraction. If the argument
  list is unwieldy, the split is in the wrong place.

## The comments survive the move

- `src/hook/report.ts` carries comments explaining **why** the logic is shaped as it is: that a
  reported failure changed nothing wherever it was aimed, and that uncertainty is derived only
  after correlation. Those explanations are the reason this code is hard to read safely.
- Every such comment is still attached to the logic it explains after the refactor. A refactor that
  drops them makes the next reader's job worse while making the indentation better.

## Nothing else moved

- No change to the report shape, the fields it sets, or the hook's exit behaviour.
- No change to `src/hook/index.ts`. TASK-032 owns that file; the two must not collide.
- No performance claim is made. This task is about readability.

## Validation

- `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- `pnpm lint` reports zero errors and zero warnings.
- `log.md` records the before and after nesting depth, and names the tests added to pin behaviour
  before the restructure.
- `CHANGELOG.md` records the refactor under the unreleased section, additive only, continuations
  indented two spaces.
