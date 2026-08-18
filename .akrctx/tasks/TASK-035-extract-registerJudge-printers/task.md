# Task

## Goal

Extract presentation logic from `registerJudge` in `src/cli/judge.ts` (284 lines) to dedicated printer functions, following the pattern used by other commands.

## Problem

`registerJudge` in `src/cli/judge.ts` is 284 lines and contains inline presentation logic for 6 subcommands:

```typescript
export function registerJudge(program: Command): void {
  // ~50 lines of setup...
  // Then inline presentation for each subcommand mixed with logic:
  judge
    .command("enable")
    .action(async () => {
      // ... logic ...
      console.log(`Judge enabled for ${target}`);  // Presentation inline
    });
  // Repeated for each subcommand
}
```

Compare to `init.ts` or `doctor.ts` which delegate presentation to `cli/shared.ts` printers.

## Root Cause

The judge CLI was implemented without following the established pattern of separating presentation from command registration.

## Solution

1. Create printer functions in `cli/shared.ts` or `cli/judge-printers.ts`:

```typescript
export function printJudgeEnabled(target: string): void {
  console.log(`Judge enabled for ${target}`);
}

export function printJudgeSnapshotCreated(id: string): void {
  console.log(`Snapshot created: ${id}`);
}
// ... etc
```

2. Refactor `registerJudge` to use them:

```typescript
judge
  .command("enable")
  .action(async () => {
    await runJudgeEnable(...);
    printJudgeEnabled(target);
  });
```

## Validation

```bash
# TypeScript compiles
pnpm build

# All tests pass
pnpm test

# CLI output unchanged
pnpm akrctx judge enable --dry-run
```

## Out Of Scope

- Changing any output text (only moving it)
- Restructuring `runJudge*` functions

## Acceptance Criteria

- [ ] `registerJudge` is <100 lines
- [ ] All presentation in dedicated printer functions
- [ ] Follows same pattern as init/doctor
- [ ] No user-visible changes to output

## Clarifications

### Session 2026-08-18

- The printers go in **`src/cli/judge-printers.ts`**, not in `cli/shared.ts`. TASK-034 is splitting
  `shared.ts` precisely because it became a dumping ground; adding eight more printers to it would
  work against that task and put the two capsules in direct conflict. A dedicated module removes
  the collision instead of sequencing around it.
- The **"`registerJudge` is <100 lines" criterion is replaced.** Most of its 284 lines are Commander
  option wiring for eight subcommands, not presentation, so extracting every `console.log` will not
  reach that figure. The criterion becomes: no formatting, no JSON stringification, and no `--json`
  branching inside an action handler.
- The `--json` branching **moves out of the action handlers** along with the formatting. Leaving the
  branch behind splits one decision across two files.
- Output comparison is done on **bytes**, not on parsed objects. The judge's `--json` records are
  consumed by `akrctx judge verify` and by the calling agent, so indentation and key order are part
  of the contract. A parsed comparison would pass while a changed indent breaks a consumer.
- Exit codes count as output. A `console.log` moved relative to a `process.exit` changes the exit
  code with identical stdout.

## Open Questions

- None recorded yet.
