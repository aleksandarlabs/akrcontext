# Review Checklist

## The six facts exist

- [ ] task.md states, for `commandTouchesBlocked` (line 147): what the hook does with the answer,
      what a wrong `false` costs, what a wrong `true` costs.
- [ ] task.md states the same three for `isBlocked` (line 213).
- [ ] The existing comment at `isBlocked` was engaged with, not stepped over. If its reasoning was
      overturned, the counter-reason is written down.
- [ ] `log.md` records what the hook does in a repository with no akrctx install.
- [ ] All decisions are under `## Clarifications`, including the possibility that one site was
      deliberately left unchanged.

## Absent and broken are not the same

- [ ] The two states are distinguishable at the call site. Where the distinction was added is
      recorded.
- [ ] A test covers each state separately, for each call site: file absent, invalid JSON,
      `blockedReadPatterns` missing, non-string entry, valid policy.
- [ ] An uninstalled repository is not flagged wholesale. This is the box that decides whether the
      change is shippable.

## Judge enforcement survived intact

- [ ] `readBlockedPatterns` still fails closed for its judge callers. Test pins it.
- [ ] `src/judge-enforcement.ts:74` and the snapshot exclusion paths behave unchanged, tests
      unmodified.
- [ ] If `readBlockedPatterns` gained a richer error, the judge still treats both states as fatal.

## The result is visible

- [ ] The trace distinguishes "checked, nothing blocked" from "could not check". Test asserts a
      reader can tell them apart.
- [ ] The user is warned once, not per event.
- [ ] No path records a clean result from a policy it could not read.

## Nothing else moved

- [ ] No change to `matchesBlockedPattern`. TASK-029 owns it.
- [ ] No change to `src/hook/report.ts`. TASK-027 owns it.
- [ ] Any trace format change is named in `CHANGELOG.md`.

## Validation

- [ ] `pnpm lint && pnpm build && npx vitest run` passes, output recorded verbatim in `log.md`.
- [ ] `pnpm lint` reports zero errors and zero warnings.
- [ ] The manual check was run: policy corrupted, hook exercised, policy restored, trace shown in
      both states. Recorded in `log.md`.
- [ ] No test skipped to make the suite green.
- [ ] No Biome rule disabled, inline-ignored, or downgraded to reach a clean run.
- [ ] `CHANGELOG.md` purely additive, continuations indented two spaces. Stricter behaviour is
      recorded as a behaviour change, not as a fix.
