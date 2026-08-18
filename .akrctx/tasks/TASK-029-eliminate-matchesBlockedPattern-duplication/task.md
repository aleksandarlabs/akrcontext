# Task

## Goal

Eliminate duplication between `matchesBlockedPattern` in `judge-enforcement.ts` and `judge-snapshot.ts`.

## Problem

The function `matchesBlockedPattern` is duplicated identically in two files:

- `src/judge-enforcement.ts:553-563` (11 lines)
- `src/judge-snapshot.ts:759-769` (identical copy)

Both are imported by `src/hook/index.ts:6`, but `judge-snapshot.ts:754` imports from `judge-enforcement.ts` — creating a redundant local copy anyway.

## Root Cause

Likely a copy-paste during development; the author of `judge-snapshot.ts` didn't realize the function was available for import.

## Solution

1. Delete the duplicate `matchesBlockedPattern` from `judge-snapshot.ts`
2. Import from `judge-enforcement.ts` (already partially done):

```typescript
// judge-snapshot.ts
import { matchesBlockedPattern } from "./judge-enforcement.js";
```

3. Remove the local definition

## Validation

```bash
# Verify no duplicate definitions
grep -r "function matchesBlockedPattern" src/
# Should return only one result

# All tests should pass
pnpm test
```

## Out Of Scope

- Changing the function signature or behavior (pure deduplication)

## Acceptance Criteria

- [ ] Only one `matchesBlockedPattern` definition exists
- [ ] `judge-snapshot.ts` imports from `judge-enforcement.ts`
- [ ] All tests pass
- [ ] No behavioral changes

## Clarifications

- None recorded yet.

## Open Questions

- None recorded yet.
