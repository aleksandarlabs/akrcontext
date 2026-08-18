# Acceptance Criteria

## The extraction is complete

- `registerJudge` in `src/cli/judge.ts` currently spans lines 13-296. Every inline presentation
  call inside it moves to a named printer.
- The `console.log` calls to move are at lines 45, 73, 85, 130, 156, 176, 207 and 273, covering the
  `enable`, `disable`, `status`, `snapshot`, `prune`, `current`, `scope` and `verify` subcommands.
  After the change, `grep -n "console\.log" src/cli/judge.ts` returns nothing.
- Each printer is named for what it prints, and takes the result object rather than a pre-formatted
  string. A printer that receives an already-built line has not moved the presentation, only the
  call.
- Where the printers live is decided rather than defaulted. `cli/shared.ts` is already the file
  TASK-034 is splitting for being a dumping ground; adding eight more printers to it works against
  that task. A dedicated `cli/judge-printers.ts` is the option that does not. task.md states the
  choice.

## The size criterion is meaningful

- task.md asks for `registerJudge` under 100 lines. Most of its 284 lines are Commander option
  wiring for eight subcommands, not presentation, so extracting every `console.log` will not
  reach 100 on its own.
- The criterion is restated as what the task can actually deliver: `registerJudge` contains
  command registration and option wiring only, with no formatting, no JSON stringification, and no
  branching on `--json` inside an action handler.
- If further reduction is wanted, splitting the eight subcommand registrations into their own
  functions is the mechanism. Whether that is in scope is stated in task.md.

## Output is byte-identical

- Every subcommand produces exactly the same bytes on stdout and stderr as before, in both the
  human and the `--json` form.
- The evidence is a captured comparison, not an assertion: run all eight subcommands against a
  scratch repository before and after, and diff the captures. The diff goes into `log.md` and must
  be empty.
- The `--json` output is compared as parsed objects **and** as raw bytes. Indentation and key order
  are part of what consumers depend on.
- Exit codes are unchanged for every subcommand, including the failure paths of `verify` and
  `current`.

## Nothing behavioural moved

- No change to `src/judge.ts`, `src/judge-enforcement.ts` or `src/judge-snapshot.ts`.
- No change to any `runJudge*` function signature.
- No change to the `--approve-commands` flow, the `--run-tests` flow, or the verdict rules.
- `review.schema.json` and `JUDGE_SCHEMA_VERSION` are unchanged.
- The judge agent instruction files are unchanged.
- Judge tests in `tests/akrctx.test.ts` and `tests/cli.test.ts` pass unmodified.

## Ordering against neighbouring tasks

- TASK-034 restructures `cli/shared.ts`. If these printers land there, the two conflict directly.
  The order is recorded in task.md before implementation, and the simplest resolution — a separate
  `cli/judge-printers.ts` — removes the conflict entirely.

## Validation

- `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- `pnpm lint` reports zero errors and zero warnings.
- `log.md` contains the before/after output capture for all eight subcommands, with an empty diff.
- `CHANGELOG.md` records the refactor under the unreleased section, additive only, continuations
  indented two spaces.
