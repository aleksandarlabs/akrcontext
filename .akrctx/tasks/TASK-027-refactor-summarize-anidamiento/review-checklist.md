# Review Checklist

## The safety net was built first

- [ ] `log.md` records the maximum nesting depth before the change, with its line.
- [ ] `log.md` names, for each deep branch, the existing test that covers it or the new test added.
- [ ] All six branches listed in plan.md step 3 are covered.
- [ ] Every new characterization test was confirmed passing against the **unchanged** function
      before the restructure. A test written after the fact describes the new code, not the old.

## Behaviour did not move

- [ ] `tests/hook.test.ts` passes with **no pre-existing test modified**. This is the box that
      matters most; a changed test here means the behaviour moved.
- [ ] The negative case still holds: an anonymous overlap whose candidates agree on both `wasBound`
      and `area` does **not** mark uncertain.
- [ ] A reported failure still short-circuits before the area logic.
- [ ] `firstMutationWasBound` is still set on first sight only.
- [ ] The trailing loops over `pendingAttempts`, `anonymousAttempts` and `anonymousOverlaps` behave
      as before.

## The refactor is real

- [ ] `log.md` records the nesting depth after the change, beside the before number.
- [ ] Extracted helpers are named for the decision they make, not for their old block position.
- [ ] No helper takes a parameter object assembled purely to enable the extraction.
- [ ] No helper has an argument list long enough to suggest the split is in the wrong place.

## The reasoning survived

- [ ] The comment explaining that a reported failure changed nothing wherever it was aimed is
      still attached to that logic.
- [ ] The comment explaining that uncertainty is derived only after correlation is still attached
      to that logic.
- [ ] No explanatory comment was dropped in the move. Compare the comment set before and after.

## Nothing else moved

- [ ] No change to the report shape or the fields it sets.
- [ ] No change to the hook's exit behaviour.
- [ ] No change to `src/hook/index.ts`. TASK-032 owns that file.
- [ ] No performance claim was made.

## Validation

- [ ] `pnpm lint && pnpm build && npx vitest run` passes, output recorded verbatim in `log.md`.
- [ ] `pnpm lint` reports zero errors and zero warnings.
- [ ] No test skipped to make the suite green.
- [ ] No Biome rule disabled, inline-ignored, or downgraded to reach a clean run.
- [ ] `CHANGELOG.md` purely additive, continuations indented two spaces.
