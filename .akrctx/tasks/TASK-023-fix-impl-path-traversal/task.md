# Task

## Goal

Fix path traversal vulnerability in `akrctx impl` commands where `<task-id>` is not validated before being used in file path construction.

## Problem

In `src/impl.ts:52`, the `implLogPath(taskId)` function interpolates `taskId` directly into the path `.akrctx/local/impl/${taskId}/log.md` without validation. This allows path traversal attacks:

```typescript
// Current vulnerable code
export function implLogPath(taskId: string): string {
  return `.akrctx/local/impl/${taskId}/log.md`;
}
```

An attacker can pass a task ID like `../../../../tmp/pwn` and write outside the project directory.

## Root Cause

The `impl` commands (impl start, impl log, impl status) do NOT validate the task ID format, unlike `judge` and `compile` commands which use `requireTaskId()` in `src/judge-enforcement.ts:530-534`:

```typescript
function requireTaskId(taskId: string): void {
  if (!/^TASK-[0-9]+$/.test(taskId)) throw new Error(`Invalid task ID: ${taskId}`);
}
```

## Solution

Add `requireTaskId()` validation to all `impl` command handlers before calling `implLogPath()` or any file operations:

1. Import and call `requireTaskId(taskId)` at the start of:
   - `runImplStart()`
   - `runImplLog()`
   - `runImplStatus()`
   - Any other impl command that accepts a task ID

2. Ensure consistent validation across all commands that use task IDs

## Validation

```bash
# Should fail with "Invalid task ID" error
pnpm akrctx impl start ../../../../tmp/pwn
pnpm akrctx impl log ../../../../tmp/pwn
pnpm akrctx impl status ../../../../tmp/pwn

# Should work normally
pnpm akrctx impl start TASK-001
pnpm akrctx impl log TASK-001
pnpm akrctx impl status TASK-001
```

## Out Of Scope

- Changes to other commands (judge, compile) — they already validate
- UI/UX improvements to error messages beyond the basic validation

## Acceptance Criteria

- [ ] All impl commands validate task ID format using `requireTaskId()`
- [ ] Path traversal attempts fail with clear error message
- [ ] Valid task IDs (TASK-NNN format) work correctly
- [ ] No regression in existing impl functionality

## Clarifications

### Session 2026-08-18

- `impl` accepts the **bare `TASK-NNN` form only**, matching the existing `^TASK-[0-9]+$` used by
  `judge` and `compile`. One rule across every command that takes a task ID beats a per-command
  rule that nobody can remember. The error message states the expected form, so a user who types
  the directory name (`TASK-023-fix-impl-path-traversal`) is told what to type instead rather than
  being left with a bare rejection.
- `requireTaskId` **moves to a leaf module** that both `impl.ts` and `judge-enforcement.ts` import.
  Exporting it from `judge-enforcement.ts` would make the `impl` commands depend on the judge
  module for a string check, which is a dependency the code does not need and a cycle risk it does
  not have to take.

## Open Questions

- None recorded yet.
