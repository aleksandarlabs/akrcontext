# Task

## Goal

Refactor `summarize` function in `src/hook/report.ts` to reduce nesting from 6-7 levels to ≤3 levels.

## Problem

In `src/hook/report.ts:255`, the `summarize` function has extreme nesting:

```typescript
for (...) {
  // ...
  } else {
    if (queue.length) {
      if (overlap) {
        if (outcomesSeen === len) {
          if (sawSuccess && ...) {
            markUncertain(...);  // 6+ levels deep
          }
        }
      }
    }
  }
}
```

This makes the code difficult to follow, review, and modify safely.

## Root Cause

Multiple conditional branches accumulated organically without refactoring into early returns or extracted functions.

## Solution

Apply one or more of these techniques:

### Early returns
```typescript
// Instead of
if (a) { if (b) { if (c) { doThing(); } } }

// Use
if (!a) continue;
if (!b) continue;
if (!c) continue;
doThing();
```

### Extract helper functions
```typescript
function shouldMarkUncertain(context: Context): boolean {
  return context.queue.length > 0 
    && context.overlap 
    && context.outcomesSeen === context.len
    && context.sawSuccess;
}

// Then in main loop:
if (shouldMarkUncertain(context)) {
  markUncertain(...);
}
```

### State machine / lookup table
For complex conditional logic, consider a state machine pattern or lookup table.

## Validation

```bash
# Verify tests still pass
pnpm test tests/hook.test.ts

# Visual inspection: max nesting ≤3 levels
```

## Out Of Scope

- Changing the behavior/logic of the function (pure refactoring)
- Performance optimizations beyond readability

## Acceptance Criteria

- [ ] Maximum nesting depth ≤3 levels
- [ ] All existing tests pass
- [ ] No behavioral changes
- [ ] Code is more readable (self-documenting or well-commented)

## Clarifications

- None recorded yet.

## Open Questions

- None recorded yet.
