# Acceptance Criteria

- Snapshot capture creates only ignored files under `.akrctx/local/judge/snapshots/` and
  leaves HEAD, current branch, refs, index, stash, and live worktree bytes unchanged.
- A captured snapshot includes tracked modifications, deletions, and allowed untracked
  files, while preserving policy-excluded path behavior.
- Blocked tracked paths are absent from the reviewable snapshot worktree, including paths
  deleted from the live workspace but still present in the candidate commit.
- Snapshot Git storage is shallow and does not duplicate unrelated project history.
- Capture rejects or retries a mixed snapshot when source files move during capture.
- `akrctx judge scope ... --candidate SNAPSHOT:<id>` returns a stable scope whose task,
  change, and scope digests do not move when the live worktree changes.
- Snapshot integrity is rechecked; tampering or deletion makes verification invalid.
- Generated judge instructions direct all file reads to the snapshot worktree.
- `judge verify --run-tests` reads validation from the snapshot capsule and runs commands
  in a disposable workspace outside the live repository, using a private dependency copy
  rather than a symlink back to the live project.
- A validation command that changes tracked snapshot content fails boundary verification;
  ignored build output does not alter the reviewed source boundary, and neither case
  mutates the immutable snapshot.
- A valid snapshot approval remains valid after unrelated live edits.
- The current-state command reports `CURRENT` for identical content, `NEWER_CHANGES` when
  the live tree advanced from the captured HEAD, and `DIVERGED` when lineage changed.
- The current-state command rejects non-approved, malformed, stale, or tampered records.
- Catch-up requires a verified approved snapshot record, captures a new snapshot, lists
  only paths changed since the parent snapshot, re-runs declared passing validation,
  binds the parent record digest, and fails when any parent snapshot is missing or tampered.
- Snapshot pruning is explicit, dry-run by default, and never removes more snapshots than
  requested by its retention count.
- Legacy commit and `WORKTREE` candidates keep their existing behavior.
- Human CLI output is concise; JSON output contains snapshot IDs, paths, full scope, and
  parent linkage needed for automation.
- Existing schema-v2 review records remain readable and retain their old semantics.
- Public Judge documentation and the changelog describe snapshot capture, verification,
  current-state checks, catch-up review, storage, trust limits, and cleanup.
- `pnpm build`, `pnpm test`, `pnpm lint`, the Codex init dry-run, and Doctor pass.
