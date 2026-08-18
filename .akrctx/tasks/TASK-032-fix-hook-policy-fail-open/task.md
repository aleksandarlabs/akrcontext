# Task

## Goal

Fix fail-open behavior in hook when `policy.json` is unreadable, which silently disables blocked pattern checking.

## Problem

In `src/hook/index.ts:147`, `commandTouchesBlocked` catches errors from `readBlockedPatterns` and returns `false` (nothing blocked):

```typescript
async function commandTouchesBlocked(cwd: string, command: string): Promise<boolean> {
  let patterns: string[];
  try {
    patterns = await readBlockedPatterns(cwd);
  } catch {
    return false;  // <-- Fail-open: unusable policy = nothing is blocked
  }
  // ...
}
```

This inverts the security contract. If `policy.json` is corrupted or unreadable, commands that touch `.env` or other blocked files are logged as clean, bypassing the protection entirely.

## Root Cause

The hook treats errors reading policy as "no policy exists" rather than "policy is broken, be conservative". The fail-open design prioritizes not breaking the user's session over security.

## Solution

Change to fail-closed when policy should exist but can't be read:

```typescript
async function commandTouchesBlocked(cwd: string, command: string): Promise<boolean> {
  let patterns: string[];
  try {
    patterns = await readBlockedPatterns(cwd);
  } catch {
    // Fail-closed: if we can't verify, assume it's blocked
    return true;
  }
  // ...
}
```

Or more nuanced: only fail-closed if the policy file exists but is unreadable (vs. truly absent).

## Validation

```bash
# Create corrupt policy.json
echo "not json" > .akrctx/policy.json

# Try a command that touches blocked files
# Should be flagged as blocked, not clean

# Restore valid policy.json and verify normal operation
```

## Out Of Scope

- Changes to `judge-enforcement.ts` (already fail-closed per its contract)
- UI for warning users about corrupt policy

## Acceptance Criteria

- [ ] Unreadable policy results in commands being blocked (not silently allowed)
- [ ] Valid policy continues to work correctly
- [ ] Truly absent policy file (not installed) works as expected
- [ ] All existing tests pass

## Clarifications

### Session 2026-08-18

- **Absent and unreadable are separated, and they behave differently.**
  - `.akrctx/policy.json` **absent** — the repository has no akrctx install, or none yet. The hook
    proceeds as it does today. Nothing is flagged and nothing is claimed.
  - `.akrctx/policy.json` **present but unreadable** — the hook stops claiming the session was
    checked. It marks the session as unverified and warns once.
- The blanket fail-closed proposed in the `## Solution` section is **rejected**. Returning `true`
  on any read failure flags every command in every repository without a policy file, which is every
  repository akrctx has not been installed into — including the one a new user is trying it in.
  That is not a stricter product, it is a broken one.
- The real defect is not the boolean, it is the **silence**. A trace that records "clean" from a
  policy it could not read is asserting something it did not verify. Both call sites must be able
  to say "could not check", and that distinction is the deliverable.
- The deliberate fail-open comment at `isBlocked` (`src/hook/index.ts:213`) is **correct on its own
  terms** and its reasoning stands: no path is written to the trace, so an unreadable policy costs a
  flag, not a leak. What changes there is not the return value but whether the outcome is reported
  honestly.
- The warning appears **once per session**, not per event. A warning on every tool call is noise
  people learn to ignore, which removes the value of the warning that matters.

## Open Questions

- None recorded yet.
