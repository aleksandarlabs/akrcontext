# Task

## Goal

Close four gaps found in the review of TASK-008 (implementer agent and implementation
log) and TASK-009 (agents configuration block). None of them breaks current behaviour;
each one is a place where the code does less than the design it is documented against.

1. **The implementation log's privacy is asserted, never verified.** `src/impl.ts` states
   that the log at `.akrctx/local/impl/<TASK-ID>/log.md` is outside every review boundary
   "by construction", because `.akrctx/local/.gitignore` excludes it. Neither `impl enable`
   nor `impl start` nor `impl log` checks that this file exists and is correct.
   `comprehension enable` does check it and refuses when it is not. In a repository where
   that ignore file is missing or has been altered, the log becomes a tracked file and
   enters the diff the judge reads — the one thing the judge contract forbids.

2. **An unknown `agents` entry disables the whole CLI.** `normalizeAgents` throws, and
   `normalizeConfig` runs inside every `readConfig`, so a configuration written by a newer
   akrctx that knows a fourth agent makes every command of an older CLI fail, not only the
   command that would have used it. Resolved in clarifications: warn and preserve.

3. **`impl log --record <file>` bypasses the typed contract.** The parsed JSON is passed
   to `runImplLog` as a `RoundRecord` with no validation. It is the only input path into
   the attempt store that is not checked, and a malformed `validation` array is persisted
   verbatim and read back without error, so the log's own type guarantees stop holding.

4. **`judge enable` reports success having written nothing.** `comprehension enable` and
   `impl enable` throw when no installed target has an agent format. `judge enable` does
   not: with `agents.judge.targets` narrowed to a target with no format, it writes zero
   files, flips `enabled` to true, and prints "enabled". Doctor then reports the gap the
   command should have refused to create.

## Validation

```
pnpm build && npx vitest run
```

The build is part of the command because four tests drive the real CLI through
`dist/index.js`, which is Git-ignored and therefore absent from a review snapshot.

`npx tsc --noEmit` is deliberately not declared. It exits non-zero on pre-existing errors in
`tests/evals.test.ts` and `tests/akrctx.test.ts` that this task does not own, so a judge
would have to record it as `failed`, and a failed entry invalidates a review record under
any verdict — an approval would have been unreachable no matter what the code did. It is
still run by hand, and this task must add no error to it.

(The `Cannot find name 'symlink'` error this section first cited was fixed by TASK-011,
which owns that file.)

## Out Of Scope

- The pre-existing `symlink` error in `src/judge-snapshot.ts` and the untyped
  `tests/evals.test.ts` imports. Both predate this branch and fixing them here would mix
  an unrelated repair into a hardening pass.
- Any change to the judge snapshot, catch-up, or verification machinery.
- Adding a fourth agent, or making the `agents` entry list extensible. The three entries
  stay fixed because each one's trustworthiness comes from a CLI contract; point 2 changes
  only what happens when an unknown entry is encountered, not what akrctx generates.
- Repeated config reads inside `doctor`'s `diagnose`. Noise, not a defect.

## Clarifications

### Session 2026-08-07

- An unknown agent entry stops being fatal, but must be preserved rather than dropped.
  `normalizeConfig` ignores it for resolution and emits a warning through the existing
  agent-warning channel, and `writeConfig` must round-trip it untouched. Dropping it would
  mean the first `akrctx config set` run by an older CLI silently deletes the configuration
  of a newer one, which trades a loud failure for a silent data loss.

## Open Questions

- None recorded yet.
