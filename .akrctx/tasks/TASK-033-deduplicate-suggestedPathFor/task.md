# Task

## Goal

Deduplicate `suggestedPathFor` logic between `doctor.ts` and `fs-utils.ts`, and between `init.ts` and `upgrade.ts` for `readProjectName`.

## Problem

Multiple functions are reimplemented instead of imported:

| Function | Defined In | Duplicated In | Lines |
|----------|-----------|---------------|-------|
| `suggestedPathFor` | `fs-utils.ts:37` | `doctor.ts:394` | ~5 lines duplicated |
| `readProjectName` | `init.ts:379` | `upgrade.ts:370` | ~8 lines duplicated |

## Root Cause

Duplication likely occurred because:
- The functions were added at different times
- Authors didn't check if a shared version existed
- No linting rule prevents reimplementation of existing helpers

## Solution

### 1. `suggestedPathFor`

```typescript
// doctor.ts - remove local implementation
import { suggestedPathFor } from "./fs-utils.js";
```

### 2. `readProjectName`

Check if the implementations are identical. If yes, export from one location and import in the other:

```typescript
// Either export from fs-utils.ts or create a shared helper
// upgrade.ts
import { readProjectName } from "./init.js"; // or move to shared location
```

## Validation

```bash
# Verify no duplicate implementations
grep -r "function suggestedFor\|function readProjectName" src/
# Should return single source of truth for each

# All tests pass
pnpm test
```

## Out Of Scope

- Refactoring other potential duplications (focus on these two known cases)

## Acceptance Criteria

- [ ] `suggestedPathFor` exists only in `fs-utils.ts`
- [ ] `doctor.ts` imports instead of reimplementing
- [ ] `readProjectName` has single source of truth
- [ ] All tests pass

## Clarifications

### Session 2026-08-18

- The `suggestedPathFor` half of this capsule is **false and is removed**. The function is defined
  once, at `src/fs-utils.ts:37`, and used from `src/template-apply.ts:4,160` and `fs-utils.ts:60`.
  There is no copy in `doctor.ts` and no reference to it there. The criterion "`doctor.ts` imports
  instead of reimplementing" is deleted along with it.
- `readProjectName` **moves to `src/fs-utils.ts`**. Having `upgrade.ts` import from `init.ts`
  would couple the upgrade path to the install path for a helper that belongs to neither, and it
  is the kind of dependency that is easy to add and awkward to remove later.
- If the two implementations disagree on any of the four inputs (a `package.json` with a `name`,
  one without, no `package.json`, invalid JSON), the disagreement is a **behaviour change** and
  goes in `CHANGELOG.md`. It is not resolved by keeping whichever body was moved.

## Open Questions

- None recorded yet.
