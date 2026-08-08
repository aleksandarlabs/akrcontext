# Acceptance Criteria

## Layer A — snapshot mode-sensitivity

- `akrctx judge snapshot TASK-XXX` succeeds in a repository where the working tree has mixed file
  modes (e.g. tracked files at 644 and freshly-written untracked files at 664 under umask 0002),
  where it previously failed its stability check.
- `addManifestPath` hashes file content (and distinguishes file/symlink/dir type) but not the unix
  permission bits.
- Existing snapshot capture/integrity/load tests still pass (no test hardcodes a literal
  snapshot ID or workspaceDigest).

## Layer A — error message honesty

- The deterministic snapshot-vs-live mismatch error no longer says "retry after file writes
  settle"; it names the differing paths and states the mismatch is not a transient race.
- The two-pass `sameLiveBoundary` transient retry path is unchanged (it still retries).

## Layer A — WORKTREE fallback documented

- The judge agent template and `docs/JUDGE.md` state that if a `SNAPSHOT:<id>` cannot be captured
  the reviewer falls back to the `WORKTREE` candidate, records which boundary was used, and does
  not report BLOCKED solely because the snapshot is unavailable.

## Layer B — `independent` flag

- The review record accepts an optional `independent` boolean. Absent means `true`. `validateRecord`
  allows the field; `JudgeReviewRecord` carries it.
- `.akrctx/judge/schemas/review.schema.json` lists `independent` as an optional boolean property;
  v2 records without it still validate.
- `akrctx judge verify` reports a notice when `independent === false`, naming the limitation. The
  notice never changes `valid`, `approved`, or the exit code.
- An `independent: false` record that is otherwise a valid APPROVED still verifies `approved: true`.

## Layer B — comprehension gate refuses non-independent approvals

- The comprehension-agent template requires `independent: true` (in addition to `approved: true`
  and `judge current` CURRENT). A non-independent approval does not satisfy the comprehension gate.

## Layer B — Pi honesty in docs

- The Pi decision record (2026-08-06), judge agent template, `docs/JUDGE.md`, and comprehension-agent
  template state that Pi has no agent format; a same-session judge is verification-only and must set
  `independent: false`; for independent judgment use another host or a separate session.

## Cross-cutting

- `pnpm build && npx vitest run` passes in full.
- `npx tsc --noEmit` adds no new error.
- `pnpm lint` clean.
- No installed harness copy hand-edited; generated files regenerate from `src/templates/*`.
- `akrctx doctor` still 100/100 and `akrctx judge verify --run-tests` still APPROVES a valid record.