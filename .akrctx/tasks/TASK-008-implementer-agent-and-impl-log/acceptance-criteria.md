# Acceptance Criteria

- AC-1: `akrctx impl start <taskId>` creates `.akrctx/local/impl/<TASK-ID>/log.md` when absent,
  reports round 1, and on a task with two recorded rounds reports round 3.
- AC-2: `akrctx impl start` refuses and reports the task as stopped once three rounds are
  recorded, rather than issuing a fourth round number.
- AC-3: `akrctx impl log` appends a round record and leaves every earlier record byte-identical.
- AC-4: `akrctx impl log` refuses to append a fourth record on a task with three recorded rounds,
  whether or not `akrctx impl start` was called first.
- AC-5: The round number written by `akrctx impl log` is derived from the persisted records at
  append time. Two consecutive `akrctx impl start` calls with no `log` between them report
  the same round, and the record that follows carries that round exactly once.
- AC-6: A round record round-trips: written fields (round, timestamp, criteria, files, each
  validation command with its verbatim result, blocker, decision needed) parse back to the
  same values.
- AC-7: The attempt count returned by `akrctx impl status` is derived from persisted records. A
  caller claiming a lower round than the log proves does not lower the count.
- AC-8: `akrctx impl status --json` exposes attempts used, attempts remaining, stopped state,
  and the last blocker; the human form is concise and states the same facts.
- AC-9: A malformed or truncated log is reported as unreadable and does not present as zero
  attempts used.
- AC-10: Writing an implementation log does not change `taskDigest`: `akrctx judge scope` for a
  task returns identical `taskDigest`, `changeDigest`, and `scopeDigest` before and after
  a round is recorded.
- AC-11: The implementation log never appears in `scope.changedFiles` for a `WORKTREE` candidate,
  and never appears in a snapshot's reviewable worktree.
- AC-12: `capsuleFiles` remains exactly five entries.
- AC-13: `akrctx impl enable` writes an implementer agent for the three host formats the judge
  uses: `.claude/agents/akrctx-implementer.md`,
  `.github/agents/akrctx-implementer.agent.md`, and
  `.codex/agents/akrctx-implementer.toml`, and persists `agents.implementer.enabled` as
  true. (Rewritten against TASK-009: the flag was originally `impl.enabled`, which is now
  the legacy form and stays readable.)
- AC-14: `akrctx init` alone writes no implementer agent file, and a config with no implementer
  entry behaves as if the feature were off.
- AC-15: `akrctx upgrade` regenerates the implementer agent files when the implementer resolves to
  enabled and leaves them absent when it is false or missing.
- AC-16: The generated implementer instructions are identical in substance across the three
  targets; only host-specific invocation rendering differs. A test asserts this rather
  than leaving it to construction.
- AC-17: The generated instructions direct the agent to read all five capsule files and the full
  existing log before writing code, and name `acceptance-criteria.md` as the spec.
- AC-18: The generated instructions state that only the commands in the fenced `## Validation`
  block of task.md count as validation evidence.
- AC-19: The generated instructions forbid writing any of the five capsule files, forbid writing
  protected instruction files, and route ambiguity back to the caller instead of into
  `task.md`.
- AC-20: The generated instructions state that the declared workflow in `plan.md` governs
  ordering, including test-first under a TDD or SDD+TDD capsule.
- AC-21: The generated instructions state that akrctx cannot enforce these boundaries through
  host permission rules, and do not imply mechanical protection.
- AC-22: Doctor reports a gap when the implementer is enabled and its agent files are absent,
  naming `akrctx impl enable`, and reports nothing about the implementer when the feature
  is off. The files are absent from `targetRequired` and `neutralRequired`, so a
  fresh install without the feature reports no drift.
- AC-23: Existing `.akrctx/config.json` files continue to load and behave unchanged. This task
  moves no schema at all: it consumes `agents.implementer`, defined by TASK-009, and a
  config without an implementer entry is not rewritten by loading it.
- AC-24: Existing agent instruction files are preserved: protected files are edited only after
  the exact diff is shown and approved in conversation.
- AC-25: Public documentation and the changelog describe the implementation log location, the
  `akrctx impl` commands, the attempt budget, and the stated enforcement limit.
- AC-26: `pnpm build`, `pnpm test`, and `pnpm lint` pass.
