# Plan

## Workflow

- research-first, then TDD

## Why

`workflowRules` maps `unknownArea` to research-first and `bugfix` to TDD.

Research is not optional here, and it is not about the code. The fix task.md proposes — return
`true` when the policy cannot be read — marks every command as blocked in any repository without
`.akrctx/policy.json`, which is every repository akrctx has not been installed into. That is not a
stricter product; it is a broken one. And the second call site carries a comment saying its
fail-open is deliberate, with a stated reason: no path is ever written to the trace, so an
unreadable policy costs a flag, not a leak. Overturning a reasoned decision needs a reason of the
same kind, and producing that reason is the research.

TDD then applies to the implementation, because the states are enumerable and each one is a
boolean that is easy to get backwards.

`fast-patch` was rejected outright. task.md frames a two-line change; the two lines are a security
posture.

`SDD` was rejected: the trace format may gain a field, and that is recorded in `CHANGELOG.md`
rather than requiring a contract design pass.

## Steps

### Research — before any code

1. For each of the two call sites — `commandTouchesBlocked` (`src/hook/index.ts:147`) and
   `isBlocked` (`src/hook/index.ts:213`) — write down three facts in task.md: what the hook does
   with the answer, what a wrong `false` costs, and what a wrong `true` costs. Six facts. Without
   them nothing below can be judged.
2. Establish what the hook does in a repository with no akrctx install at all. If the hook can run
   there, fail-closed on a missing policy makes akrctx unusable on first contact.
3. Decide the posture for each of the two sites separately. They may differ, and if the answer for
   `isBlocked` is "the existing comment is right, leave it", that is a valid outcome of this task —
   record it and narrow the scope rather than changing code to look productive.
4. Record all decisions under `## Clarifications` in task.md.

### Distinguish the states

5. `readBlockedPatterns` (`src/judge-enforcement.ts:536`) throws for both "file absent" and "file
   unreadable", so the distinction does not exist at the call site. Decide where to add it: a
   richer error from `readBlockedPatterns`, or a `stat` in the hook. The first is cleaner and
   touches a function the judge depends on; the second is contained.
6. Whichever is chosen, judge callers keep treating both as fatal. Write that test first.

### Test, then implement

7. Write the failing tests for each state, per call site: file absent, invalid JSON,
   `blockedReadPatterns` missing, a non-string entry, and a valid policy.
8. Implement the chosen posture.
9. Implement the visibility requirement: the trace distinguishes "checked, nothing blocked" from
   "could not check". A trace that silently records clean from an unreadable policy is the real
   defect, and flipping a boolean in silence does not fix it.
10. Make the user-facing warning appear once, not per event. A warning on every tool call is noise
    people learn to ignore.

### Close out

11. Run the manual check from task.md: corrupt the policy, exercise the hook, restore it, and show
    the trace in both states. Record it in `log.md`.
12. `CHANGELOG.md`, additive only, continuations indented two spaces. If behaviour becomes
    stricter, record it as a behaviour change, not as a fix.
13. `pnpm lint && pnpm build && npx vitest run`, output recorded verbatim.

## Risks

- **The proposed fix breaks uninstalled repositories.** This is the single most likely way for the
  task to ship damage. Step 2 exists to catch it before any code is written.
- **Overturning a deliberate decision by accident.** The comment at `isBlocked` is an argument. If
  the implementer does not engage with it, the change is not a fix — it is a disagreement nobody
  had.
- **Weakening the judge to simplify the hook.** `readBlockedPatterns` fails closed on purpose, and
  its doc comment explains why. If step 5 changes that function, the judge's contract must survive
  intact, pinned by a test.
- **A stricter hook that people disable.** A hook that blocks constantly gets turned off, and then
  it protects nothing. Strictness that is not usable is not protection.
- **Silence is the real bug.** If the outcome of this task is only a flipped boolean with no change
  to what the trace reports, the user still cannot tell a checked session from an unchecked one.
- TASK-027 owns `src/hook/report.ts` and TASK-029 owns `matchesBlockedPattern`. Stay inside
  `index.ts`.
