# TASK-007

## Goal

Make judge reviews safe in a fast, concurrent working tree: capture an immutable local
snapshot for review, let developers and agents keep editing, and bind approval to that
snapshot instead of invalidating a correct verdict merely because newer work exists.

The normal flow must stay developer-friendly. A user-authorized review captures the
snapshot internally; snapshot mechanics and digests stay quiet unless JSON or verbose
output is requested.

## Recommended Workflow

SDD+TDD

## Workflow Notes

- Workflow source: `.akrctx/config.json` `workflowRules.apiOrContract` is `SDD+TDD`.
- Why this workflow: snapshot identity, approval applicability, catch-up chaining, and
  Git non-mutation are contracts consumed by the CLI, generated judge instructions, and
  persisted review records. Fix the contract first, then encode it as failing tests.
- Research-first discovery was completed before implementation: current `WORKTREE`
  scopes recompute against the live repository; the judge reads live paths; verification
  re-runs tests in the live tree; and `verify` currently conflates record integrity with
  applicability to the newest workspace state.

## Contract

### Snapshot capture

- A snapshot is stored below `.akrctx/local/judge/snapshots/`, which is already ignored.
- Capture never creates a commit, branch, ref, stash, checkout, or index entry and never
  changes the user's current branch or staged state.
- The snapshot contains a private worktree copy and a content-addressed metadata record.
- The private Git repository is shallow and contains only the candidate and, when
  different, base commits needed to inspect the review boundary; it does not duplicate
  the complete project history.
- Paths matching `blockedReadPatterns` are removed from the reviewable worktree after
  checkout. Git object storage is not an encryption boundary, so a tracked secret must
  still be removed from Git history by the project owner when necessary.
- The task capsule is read from the snapshot during review and verification.
- Capture detects a workspace that changed mid-copy and retries or fails clearly rather
  than publishing a mixed snapshot.

### Review and validation

- A snapshot candidate is named `SNAPSHOT:<id>` and can be passed anywhere a judge
  candidate is accepted.
- The generated judge instructions read changed files from the snapshot worktree, never
  from live project paths.
- `judge verify --run-tests` executes declared commands inside the snapshot worktree.
  It uses a disposable copy outside the live project. The snapshot carries a private,
  copy-on-write-when-supported copy of local Node dependencies when present, never a
  symlink to the live project. Tracked writes by validation invalidate verification
  without mutating the immutable snapshot or ordinary live project paths.
- Validation isolation protects the normal relative-write workflow; it is not an OS
  sandbox and does not make an intentionally malicious command with absolute paths safe.
- Editing the live worktree after capture does not invalidate a record for the snapshot.
- Editing or deleting the snapshot itself does invalidate the record.

### Applicability and catch-up

- A verified approval remains valid for its immutable snapshot.
- A separate current-state check reports `CURRENT`, `NEWER_CHANGES`, or `DIVERGED`; newer
  work is not mislabeled as an invalid historical approval.
- Current-state checks reject malformed, non-approved, or boundary-invalid records before
  describing their applicability.
- Catch-up captures a new snapshot relative to a verified approved snapshot and exposes
  only the delta paths to the next judge. It never extends the old approval silently.
- Catch-up re-runs the parent's declared passing validation, records the parent review
  digest, and recursively requires every parent snapshot in the chain to remain intact.

### Developer experience

- Human output uses task-oriented language and short snapshot IDs. Full hashes and local
  paths remain available in `--json` output.
- `akrctx judge prune` provides an explicit dry-run-first retention path for obsolete
  local snapshots.
- The established live `WORKTREE` mode remains available for compatibility and keeps its
  strict invalidation semantics.

## Validation

Commands that prove this task works. The judge must run at least one of these to
approve, and `akrctx judge verify --run-tests` re-runs the ones the review claims
passed. Nothing outside this list is ever executed.

```
pnpm build
pnpm test
pnpm lint
```

## Out Of Scope

- Automatically invoking a host-specific subagent from the cross-host CLI.
- Creating or changing Git history on the user's behalf.
- Solving Doctor/Upgrade desired-state drift; that is a separate task.
- Remote snapshot storage, CI artifact services, or cryptographic model identity.
- Automatically merging, rebasing, committing, or pushing approved work.

## Clarifications

### Session 2026-08-05

- Q: May akrctx create a commit automatically to make a review immutable? / A: No.
  Snapshot capture may write ignored local artifacts only; Git history, branches, index,
  checkout, and stash remain entirely user-controlled.
- Q: Should developer-friendliness weaken exact approval boundaries? / A: No. Preserve
  exact snapshot approval, but separate it from whether newer workspace changes exist and
  support an incremental catch-up review.

### Session 2026-08-06

- Q: Should the review findings be fixed in this branch, documented in the changelog, and
  prepared for direct-history integration without a pull request? / A: Yes. Fix the
  implementation and tests, update the changelog in its existing format, do not open a
  pull request, and provide the final commit message instead of committing automatically.

## Open Questions

- None recorded yet.
