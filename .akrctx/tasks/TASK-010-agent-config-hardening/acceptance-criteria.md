# Acceptance Criteria

## 1 — The implementation log verifies the ignore it depends on

- `impl enable` refuses, with an error naming `akrctx doctor --fix`, when
  `.akrctx/local/.gitignore` is absent or its content is not the safe form
  (`*` then `!.gitignore`). It writes no agent file and does not flip `enabled`.
- `impl start` refuses to create or open a log when that ignore is not safe, and reports
  the refusal through `refused`/`reason` rather than by throwing.
- `impl log` refuses to append when that ignore is not safe, through `refused`/`reason`.
  The check sits in the store, so a caller that skipped `impl start` cannot escape it.
- `impl status` reports the unsafe ignore instead of a clean attempt count, and does not
  present the task as open.
- A repository initialised by `akrctx init` satisfies the check with no extra step.

## 2 — An unknown agent entry warns and survives

- `readConfig` succeeds on a configuration whose `agents` block holds an entry that is not
  `judge`, `comprehension`, or `implementer`. No command throws because of it.
- The unknown entry is preserved verbatim: reading a config and writing it back leaves the
  entry, and its nested values, byte-identical.
- `agentWarnings` emits one warning naming the unknown entry and the three valid ones.
  It reaches `status`, `doctor`, and `upgrade` through the existing warning channel.
- Doctor reports the unknown entry once, not twice, now that it is no longer both a raw
  config gap and a resolved warning.
- A malformed `agents` block that is not an object, and a `maxAttempts` outside its domain,
  still throw. Those are unchanged.

## 3 — `--record` is validated before it reaches the store

- `impl log --record <file>` rejects, with an error naming the offending field, a record
  whose `criteria` or `files` is not an array of strings, whose `validation` is not an
  array, whose validation entry lacks `command`, has a `status` outside
  `passed|failed|not-run`, or has a non-string `output`.
- A `timestamp` supplied in the record is accepted only as an ISO-8601 instant; anything
  else is rejected rather than persisted.
- `round` supplied in the record is ignored, because the round is derived from the
  persisted log at append time.
- Fields akrctx does not know are rejected by name, so a typo in a record file is reported
  instead of silently dropped.
- A valid record file still round-trips every field, unchanged from today.

## 4 — `judge enable` refuses an empty target set

- `judge enable` throws when no installed target has a judge agent format after
  `agents.judge.targets` narrowing, with the same shape of message
  `comprehension enable` and `impl enable` use. It writes no file and does not flip
  `enabled` to true.
- The existing behaviour for at least one resolvable target is unchanged.

## Cross-cutting

- `npx vitest run` passes in full.
- `npx tsc --noEmit` adds no error beyond the pre-existing ones described in task.md.
- Each of the four points is covered by a test that fails against the current code.
- No comment is added that restates what the code already says.
