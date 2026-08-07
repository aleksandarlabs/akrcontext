# Review Checklist

- [x] Goal and contract match the approved design.
- [x] The implementation log lives outside the capsule and outside git.
- [x] Recording a round does not move `taskDigest`, `changeDigest`, or `scopeDigest`.
- [x] The log never appears in `scope.changedFiles` or in a snapshot worktree.
- [x] `capsuleFiles` is still exactly five entries.
- [x] The attempt count is derived from persisted records, not from the caller.
- [x] A malformed log is reported, never treated as zero attempts.
- [x] Round history is append-only.
- [x] `impl log` refuses past the budget on its own, without relying on `impl start`.
- [x] The implementer agent is emitted for all three host formats with substantively
      identical instructions, asserted by a test.
- [x] Generated instructions forbid capsule and protected-file writes, route ambiguity to
      the caller, and state the enforcement limit honestly.
- [x] The implementer is opt-in via `akrctx impl enable`; `init` alone emits nothing.
- [x] No schema movement at all: the opt-in flag, model, targets, and attempt budget come
      from `agents.implementer` as defined by TASK-009, and configs without an implementer
      entry load and behave as before. (Amended from "the only schema movement is the
      optional `impl` key" — see task.md.)
- [x] Doctor gaps the implementer only when enabled, alongside the judge and comprehension
      checks, and reports no drift after a fresh install without the feature.
- [x] Protected instruction files were not modified without exact-diff approval.
- [x] Documentation and changelog updated.
- [x] `pnpm build`, `pnpm test`, `pnpm lint` pass.

## Validation Evidence

- `pnpm build` — tsup ESM + DTS build succeeded.
- `pnpm test` — 648 passed (5 files). `tests/agents.test.ts` covers round numbering across
  invocations, refusal at the budget from both `start` and `log`, append-only history, full
  record round-trip, the derived count against a caller claiming a lower round, the
  unreadable-log case, a configured budget of 1, digest invariance around a recorded round,
  the three host formats, and the Doctor gap.
- `pnpm lint` — biome check, 80 files, no findings.

### Notes

- The attempt budget is read from `agents.implementer.maxAttempts` (default 3), so the
  constant this capsule originally described no longer exists.
- A round record is a fenced JSON block under a `## Round N` heading. That form round-trips
  exactly and makes truncation detectable: a heading without a parseable block, a record
  disagreeing with its heading, or a non-consecutive round is reported as unreadable rather
  than silently skipped, which is what keeps a damaged log from granting a fresh budget.

### Self-review pass, 2026-08-07

Run by the implementing agent, so not independent evidence. One defect in this task's own
contract was found and fixed: `akrctx impl status --json` reported `attemptsUsed: 0` for an
unreadable log, which is precisely the "does not present as zero attempts used" criterion
above. The behavioural guard was already right — the task reported as stopped with no
attempts remaining — but a machine consumer reading the count would have concluded that no
attempt was ever made. It now reports `null`, and a test asserts it.

Boundary reviewed: SNAPSHOT:f1b825684f4eed4ce15c (base HEAD).
