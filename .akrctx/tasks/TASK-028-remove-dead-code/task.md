# Task

## Goal

Remove unused exports and dead code identified in the quality audit.

## Problem

Multiple exports are defined but never used:

| File | Line | Export | Issue |
|------|------|--------|-------|
| `src/format.ts` | 20 | `b` | Alias for `bold`, no references |
| `src/fs-utils.ts` | 33 | `toPosix` | No callers |
| `src/impl.ts` | 412 | `implementerAgentFiles` | No references in src/, tests/, or evals/ |
| `src/judge.ts` | 136 | `removeJudgeFiles` | No callers |

Additionally, `types.ts` has inconsistent naming:
- Line 104: `akrctxConfig` (should be `AkrctxConfig` per PascalCase convention)
- Line 136: `akrctxPolicy` (should be `AkrctxPolicy`)

## Root Cause

Code evolved organically; exports were added "just in case" or refactors left orphans behind.

## Solution

### 1. Remove dead exports

```bash
# Verify zero references first
grep -r "\btoPosix\b" src/ tests/ evals/
grep -r "\bimplementerAgentFiles\b" src/ tests/ evals/
grep -r "\bremoveJudgeFiles\b" src/ tests/ evals/
grep -r "\bfrom.*format.*\bb\b" src/ tests/ evals/  # import { b } from './format'
```

If truly unused, delete them.

### 2. Rename for consistency

```typescript
// types.ts
// Before
export interface akrctxConfig { ... }
export interface akrctxPolicy { ... }

// After
export interface AkrctxConfig { ... }
export interface AkrctxPolicy { ... }
```

Update all imports accordingly.

## Validation

```bash
# TypeScript compilation should pass
pnpm build

# Lint should be clean
pnpm lint

# All tests should pass
pnpm test

# Verify no references remain
grep -r "\btoPosix\b|\bimplementerAgentFiles\b|\bremoveJudgeFiles\b" src/ tests/ evals/ || echo "Clean"
```

## Out Of Scope

- Removing questionable exports without verification
- Changing any behavior (pure cleanup)

## Acceptance Criteria

- [ ] All identified dead exports are removed
- [ ] Type names follow PascalCase convention
- [ ] TypeScript compiles without errors
- [ ] All tests pass
- [ ] No references to removed code remain

## Clarifications

### Session 2026-08-18

- The **rename moves to its own capsule, TASK-037**. This task ships the four deletions and nothing
  else.
  `akrctxConfig` has 42 call sites and `akrctxPolicy` has 13; mixed with four one-line deletions,
  the reviewer scrolls past 55 mechanical edits looking for the four that matter, which is where a
  bad edit hides. The two changes share nothing but a line in an audit report.
- The `## Problem` table's rename section and the "Type names follow PascalCase" criterion are
  removed from this capsule when the new one is created.
- The new capsule covers **all three** lowercase types, `akrctxManifest` included. Renaming two of
  three leaves the convention ambiguous, which is worse than leaving all three alone.
- `removeJudgeFiles` is not deleted until `log.md` records which it is: dead weight, or an
  unfinished `judge disable` that keeps agent files behind. Deleting a gap is not the same as
  deleting dead code, and the searches alone cannot tell them apart.

## Open Questions

- None recorded yet.
