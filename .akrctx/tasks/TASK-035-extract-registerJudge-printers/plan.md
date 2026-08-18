# Plan

## Workflow

- TDD

## Why

TDD in its characterization form, for the same reason as TASK-034: this is presentation code, and
the only property that matters is that the bytes on stdout do not change. No type checker sees a
changed space, a reordered JSON key or a dropped newline. The safety mechanism is a captured
output comparison built before anything moves, and the eight subcommands make that comparison
cheap to build.

`fast-patch` was rejected. The moved output includes the judge's `--json` records, which are read
by `akrctx judge verify` and by the calling agent. A reordered key or a changed indent breaks a
consumer that no test in this repository exercises.

`SDD` was rejected: no contract is being designed. The printers' shapes follow the existing
`runJudge*` return types, which are unchanged.

`research-first` was rejected: the file is 348 lines and the eight `console.log` sites are listed
in the acceptance criteria.

## Steps

### Correct the target

1. Restate the size criterion in task.md. Most of `registerJudge`'s 284 lines are Commander option
   wiring for eight subcommands, not presentation, so extracting every `console.log` will not reach
   the "<100 lines" figure. The honest criterion is: no formatting, no JSON stringification, and
   no `--json` branching inside an action handler.
2. Decide where the printers live. `cli/shared.ts` is the file TASK-034 is splitting for being a
   dumping ground, so adding eight printers to it works against that task. A dedicated
   `cli/judge-printers.ts` removes the conflict. Record the choice and the ordering against
   TASK-034 in task.md.

### Build the safety net

3. Capture stdout, stderr and exit code for all eight subcommands against a scratch repository,
   in both the human and `--json` form, **before** any change. Include the failure paths of
   `verify` and `current`, not only the success paths.
4. Store the captures as bytes, not as parsed objects. Indentation and key order are part of what
   consumers depend on.

### Move

5. Extract one printer per output site: lines 45, 73, 85, 130, 156, 176, 207, 273.
6. Each printer takes the result object, not a pre-formatted string. A printer receiving a built
   line has moved the call, not the presentation.
7. Name each printer for what it prints.
8. Move the `--json` branching out of the action handlers along with the formatting. Leaving the
   branch behind splits one decision across two files.

### Verify

9. Re-capture all eight subcommands and diff against step 3. The diff must be empty, bytes
   included.
10. Confirm `grep -n "console\.log" src/cli/judge.ts` returns nothing.
11. Confirm judge tests in `tests/akrctx.test.ts` and `tests/cli.test.ts` pass unmodified.
12. `CHANGELOG.md`, additive only, continuations indented two spaces.
13. `pnpm lint && pnpm build && npx vitest run`, output recorded verbatim.

## Risks

- **The `--json` records are consumed by other software.** `akrctx judge verify` reads them and the
  calling agent parses them. Comparing parsed objects would pass while a changed indent breaks a
  consumer, which is why step 4 stores bytes.
- **Failure paths are the ones that get skipped.** `verify` and `current` have the most interesting
  output and the least convenient setup. A capture covering only success paths gives false
  confidence over exactly the code most likely to be wrong.
- **Improving the message while moving it.** task.md forbids changing output text. The temptation
  arrives when a message is obviously improvable, and taking it makes the empty-diff check
  meaningless.
- **Collision with TASK-034.** If these printers land in `cli/shared.ts` while that task is
  splitting it, both are rewritten. Step 2 removes the collision rather than sequencing around it.
- **Exit codes are output too.** A refactor that moves a `console.log` past a `process.exit` or
  changes when a handler returns can alter the exit code with identical stdout.
- The line-count target may still not be met after a correct extraction. That is a bad criterion,
  not a failed task. Step 1 fixes the criterion rather than padding the work.
