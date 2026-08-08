# Task

## Goal

Close two holes in the snapshot immutability guarantee, both found while reviewing TASK-021.

akrctx tells developers a judge snapshot is immutable and that `akrctx judge verify --run-tests`
re-executes validation independently. `loadJudgeSnapshot` does check a `workspaceDigest` over the
whole worktree on every load, so the guarantee is real for ordinary content. It is not real for
these two cases.

**1. Ignored paths carry no digest and `verify` trusts them anyway.**

`workspaceManifest` in `src/judge-snapshot.ts` builds the manifest from:

```
git ls-files --cached --others --exclude-standard -z
```

`--exclude-standard` honours `.gitignore`, so every path under `dist/` and `node_modules/` is
absent from the manifest. Measured on the TASK-021 snapshot, that is zero covered files in either
directory, and its `node_modules` is a real private copy, not a symlink. A write there is
permanent and no integrity check ever sees it.

That would be a documented limitation on its own. What makes it exploitable is
`createJudgeSnapshotValidationWorkspace`, which builds the disposable copy with a plain recursive
`cp` of the snapshot worktree — including `node_modules`. So `verify --run-tests`, the mechanism
whose entire purpose is to stop trusting the judge's claim, re-executes against dependency bytes
the judge could have altered, and confirms the claim.

Fix: the disposable validation workspace stops inheriting `node_modules` from the snapshot and
materialises dependencies from the lockfile instead. Re-execution then rests on the lockfile, not
on bytes inside the reviewed artifact.

**2. A write that is reverted before the review ends leaves no trace.**

The digest is checked when a snapshot is loaded, not continuously. A reviewer that writes a file,
uses it, and deletes it restores the manifest to its captured state, and every later check
passes. This is not hypothetical: the judge reviewing TASK-021 copied a scratch test file into
the snapshot's `evals/` directory and removed it. It disclosed this voluntarily. Nothing in
akrctx would have reported it otherwise, because the content matched again by the time anything
looked.

The guarantee akrctx can currently make is "the snapshot content matches its capture whenever we
measure it", not "the snapshot was never modified". Those differ exactly when the reviewer is the
party you needed the boundary against.

Fix: make the manifest fingerprint sensitive to modification and not only to final content, so a
write-then-restore is detectable at the next load.

## Validation

```
pnpm lint && pnpm build && npx vitest run
```

`pnpm lint` leads, per the convention TASK-021 established.

## Out Of Scope

- Making the snapshot worktree read-only through filesystem permissions. Considered and not
  chosen; the judge legitimately writes build output there when running declared validation.
- Changing what the judge is allowed to do, its contract text, or its tool list. This task makes
  a breach detectable; it does not restate the rule.
- Covering `dist/` or other build output under the digest. Declared validation writes it by
  design, so a digest over it would fail on every honest review.
- Changing `SNAPSHOT_VERSION` compatibility handling for snapshots captured before this change
  beyond what the fingerprint change forces. Old snapshots failing to load with a clear message
  is acceptable; silently accepting them is not.
- The catch-up chain, `judge current`, `judge prune`, `judge scope`, verdict rules, and the
  `--approve-commands` flow.
- The `log.md`-inside-the-capsule question raised during TASK-021 integration. Same family of
  problem, different decision; it belongs in its own capsule.

## Clarifications

### Session 2026-08-08

- The dependency hole is closed by **making `verify` stop inheriting `node_modules` from the
  snapshot** and materialising it from the lockfile, not by hashing `node_modules` into the
  digest. Hashing thousands of files on every capture and every load buys detection where the
  chosen fix removes the dependence altogether, and `verify`'s independence is the property that
  actually matters.
- The task covers **both the persistent hole and transient write-then-restore**. Detecting only
  the persistent one would leave the exact behaviour observed during the TASK-021 review
  undetectable, which is the case that prompted the task.
- The snapshot worktree stays **writable**. Read-only permissions were rejected because the judge
  runs the capsule's declared validation inside the snapshot, and that legitimately writes build
  output.

## Open Questions

- Who takes the second measurement for transient detection? The judge is read-only by contract
  and cannot certify its own non-intervention, so the check must run in the trusted caller — but
  the caller's natural moment to look is `verify`, which is already after the review window
  closed. A fingerprint that carries modification evidence (inode and ctime alongside content,
  which cannot be backdated without root) would let a single later measurement detect an earlier
  write. Is that the mechanism, and does it hold across the platforms akrctx supports?
- Does an honest review perturb inode or ctime on manifest-covered paths? Reads should not, and
  build output is excluded, but package managers and test runners write in surprising places. If
  false positives appear, a fingerprint that is strict about modification becomes a check people
  learn to ignore, which is worse than no check.
- Snapshots captured before this change cannot carry the new fingerprint. Should they fail to
  load, or load with an explicit warning that they predate write detection?
- How should the post-rename cleanup branch in `capture` be pinned? Every failure a black-box
  test can force — a blocked-read policy that removes `policy.json` from the worktree, a
  deterministic live-vs-snapshot mismatch — throws while the capture is still in its temporary
  directory, so the `renamed` branch is never entered. The added test proves the observable
  contract (a failed capture leaves no snapshot directory behind) on the reachable path only.
  Pinning the other one needs fault injection into `loadJudgeSnapshot`, which the suite does not
  do anywhere else. Is that worth introducing for one branch, given the branch exists precisely
  because it was hit in production once?
