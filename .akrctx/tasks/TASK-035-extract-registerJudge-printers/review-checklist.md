# Review Checklist

## The criterion was corrected

- [ ] task.md restates the size target as "no formatting, no JSON stringification, no `--json`
      branching inside an action handler", instead of the unreachable "<100 lines".
- [ ] Where the printers live is decided and recorded, with the ordering against TASK-034. A
      dedicated `cli/judge-printers.ts` avoids the collision with that task's split.

## The safety net came first

- [ ] Captures for all eight subcommands were taken **before** any change.
- [ ] Both forms captured: human output and `--json`.
- [ ] Failure paths of `verify` and `current` captured, not only success paths.
- [ ] Captures stored as bytes. Comparing parsed objects would miss an indent or key-order change
      that breaks a consumer.

## The extraction is complete

- [ ] `grep -n "console\.log" src/cli/judge.ts` returns nothing.
- [ ] All eight output sites moved: lines 45, 73, 85, 130, 156, 176, 207, 273.
- [ ] Each printer takes the result object, not a pre-formatted string.
- [ ] Each printer is named for what it prints.
- [ ] `--json` branching moved out of the action handlers alongside the formatting.

## Output is byte-identical

- [ ] The re-capture diff is empty for all eight subcommands, in both forms. Diff in `log.md`.
- [ ] Exit codes unchanged for every subcommand, including failure paths. A moved `console.log`
      relative to a `process.exit` changes the exit code with identical stdout.
- [ ] No output text was improved while being moved.
- [ ] Judge tests in `tests/akrctx.test.ts` and `tests/cli.test.ts` pass unmodified.

## Nothing behavioural moved

- [ ] No change to `src/judge.ts`, `src/judge-enforcement.ts` or `src/judge-snapshot.ts`.
- [ ] No `runJudge*` signature changed.
- [ ] `--approve-commands` and `--run-tests` flows unchanged.
- [ ] `review.schema.json` and `JUDGE_SCHEMA_VERSION` unchanged.
- [ ] Judge agent instruction files unchanged.

## Validation

- [ ] `pnpm lint && pnpm build && npx vitest run` passes, output recorded verbatim in `log.md`.
- [ ] `pnpm lint` reports zero errors and zero warnings.
- [ ] No test skipped to make the suite green.
- [ ] No Biome rule disabled, inline-ignored, or downgraded to reach a clean run.
- [ ] `CHANGELOG.md` purely additive, continuations indented two spaces.
