# Task

## Goal

Split `src/cli/shared.ts` to separate CLI wiring from formatting logic and CI verdict logic.

## Problem

`src/cli/shared.ts` (currently ~200 lines) mixes multiple concerns:

1. **CLI flag wiring** — Commander option definitions
2. **Printers** — 10+ print/format functions
3. **IO** — `readStdin` for reading piped input
4. **CI verdict logic** — `doctorCiFailed`/`doctorCiFailures` determining CI pass/fail

This violates separation of concerns: the file knows about CLI parsing, presentation logic, and CI-specific decision making.

## Root Cause

The file grew organically as a "shared utilities" dumping ground without a clear boundary.

## Solution

Split into focused modules:

```
cli/
├── shared.ts          # Re-exports for backwards compat (or delete)
├── flags.ts           # Common CLI flags (--target, --dry-run, etc.)
├── printers.ts        # All print/format functions
├── io.ts              # readStdin and related
└── ci-verdict.ts      # doctorCiFailed, doctorCiFailures
```

Or alternative split:
- Keep CLI wiring in `shared.ts`
- Move presentation to `presenters.ts`
- Move CI logic to core (it shouldn't be in CLI layer)

## Validation

```bash
# TypeScript compiles
pnpm build

# All tests pass
pnpm test

# CLI still works
pnpm akrctx doctor --help
pnpm akrctx doctor --json
```

## Out Of Scope

- Changing any function signatures
- Moving CI verdict logic to core (can be done separately)

## Acceptance Criteria

- [ ] Each module has a single clear responsibility
- [ ] No file exceeds ~100 lines
- [ ] All exports remain backwards compatible
- [ ] All tests pass

## Clarifications

### Session 2026-08-18

- **`shared.ts` is deleted, not kept as a re-export shim.** Every importer is updated in the same
  change. A shim keeps the diff small and keeps the problem alive: a file that exports everything
  is the natural place to put anything, and in a year it has accumulated again under a new name.
- **`doctorCiFailed` and `doctorCiFailures` stay inside `cli/`**, in their own module. Moving them
  to core is a defensible separate change and is not this one. The Out Of Scope line stands; the
  Solution's `cli/ci-verdict.ts` is what happens.
- The **"no file exceeds ~100 lines" criterion is deleted.** `printInit` alone spans lines 125-220.
  Meeting the number would mean splitting one coherent printer across two files, which is worse
  than the problem being fixed. The replacement criterion is one stated reason to change per module.
- The **size figure in `## Problem` is wrong**: `src/cli/shared.ts` is 429 lines, not "~200". It is
  corrected before the split is designed, because the split a 429-line file needs is not the one
  proposed for a 200-line file.
- Code is **moved, not edited**. No rename, no reflow, no improvement rides along. The only safety
  check for presentation code is an empty output diff, and any edit mixed into the move makes that
  check meaningless.

## Open Questions

- None recorded yet.
