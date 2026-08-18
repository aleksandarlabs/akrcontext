# Acceptance Criteria

## Absent and unreadable are separated

- The two states behave differently and neither shares an outcome with the other:
  - policy **absent** — the hook proceeds exactly as it does today. Nothing is flagged and nothing
    is claimed. akrctx is installed into repositories that did not have it, and a hook that flags
    everything on first contact is broken, not strict.
  - policy **present but unreadable** — the session is marked unverified and the user is warned.
- `readBlockedPatterns` (`src/judge-enforcement.ts:536`) throws for both, so the distinction does
  not exist at the call site yet. Where it is added is recorded: a richer error from
  `readBlockedPatterns`, or a `stat` in the hook.
- A test covers each state separately, for **both** call sites — `commandTouchesBlocked` (line 147)
  and `isBlocked` (line 213): file absent, invalid JSON, `blockedReadPatterns` missing, a
  non-string entry, and a valid policy.
- The blanket fail-closed from task.md's `## Solution` is not implemented, and that section is
  corrected so a later reader does not implement it by mistake.

## The silence is the fix

- No path records a clean result from a policy it could not read. This is the actual defect, and it
  is not addressed by flipping a boolean.
- The trace distinguishes "checked, nothing blocked" from "could not check". A test asserts a reader
  can tell them apart.
- The warning appears once per session, not per event. A test pins that it is not emitted per tool
  call.
- The `isBlocked` return value may stay `false` for the unreadable case. Its existing comment holds:
  no path is written to the trace, so the cost is a missing flag, not a leak. What changes is that
  the outcome is now reported honestly. A capsule that ends with only this change is a complete
  capsule, not a shortened one.

## Judge enforcement is untouched

- `readBlockedPatterns` keeps failing closed for its judge callers. Its doc comment explains why: a
  policy that cannot be read is a reason to refuse to compute a boundary. That contract is not
  weakened to make the hook simpler.
- `src/judge-enforcement.ts:74` and the snapshot exclusion paths behave unchanged. Their tests pass
  unmodified.
- If a distinction between absent and broken is added to `readBlockedPatterns`, the judge callers
  still treat both as fatal. A test pins that.

## Nothing else moved

- No change to pattern matching. TASK-029 owns `matchesBlockedPattern`; the two must not collide.
- No change to `src/hook/report.ts`. TASK-027 owns it.
- No change to the trace format beyond whatever the visibility criterion above requires, and any
  such change is named in `CHANGELOG.md`.

## Validation

- `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- `pnpm lint` reports zero errors and zero warnings.
- The manual check from task.md is run and recorded in `log.md`: corrupt the policy, exercise the
  hook, restore it, and show the trace in both states.
- `CHANGELOG.md` records the change under the unreleased section, additive only, continuations
  indented two spaces. If the behaviour becomes stricter, it is recorded as a behaviour change,
  not as a fix.
