# Review Checklist

> An independent judge round BLOCKED the first delivery (a false "modified after capture" on
> honest snapshots, because the fingerprint included the inode number, which drifts on FUSE
> mounts). The boxes below reflect the corrected delivery: `statOf` hashes `ctimeMs` only,
> `SNAPSHOT_VERSION` is 3, and capture is atomic on the failure path. See `log.md`
> "BLOCKED by an independent judge round".

## Research came first

- [x] `log.md` records the measured answer to whether an honest review perturbs the modification
      evidence on manifest-covered paths, with the numbers.
- [x] The research is recorded with its **limit**: it compared two reads seconds apart and so
      missed inode drift, which on this FUSE mount manifests over minutes-to-hours. The
      independent round closed that gap; the fix (drop the inode number) rests on ctime, which
      the same measurement showed stable for hours.

## Dependencies

- [x] `createJudgeSnapshotValidationWorkspace` no longer copies the snapshot's `node_modules`.
- [x] Dependencies are materialised from the lockfile with a frozen or locked install.
- [x] A test plants a modification in the snapshot's `node_modules` and proves it does not reach
      the validation workspace.
- [x] Failure to materialise dependencies fails verification with a named reason.
- [x] There is no fallback to the snapshot's `node_modules` on any path — grep for it rather than
      trusting the diff summary.
- [x] The judge's own in-snapshot review run still has dependencies available.

## Transient detection

- [x] Write-then-restore-exact-bytes is reported at the next load. Test present.
- [x] Create-then-delete is reported. Test present, matching the shape observed in TASK-021.
- [x] Delete-then-recreate with identical bytes is reported. Test added after the third
      independent round, which found this shape detected by construction but pinned by nothing.
- [x] A failed capture leaves no snapshot directory behind. Test added in the same pass. It
      exercises a pre-rename failure; the post-rename `renamed` branch stays unpinned because no
      black-box failure path reaches it — see Open Questions in task.md.
- [x] The honest-review negative case passes: capture, run declared validation inside, load again,
      succeeds — now verified on the real repository (a v3 snapshot stays APPROVED after the judge
      runs `pnpm lint && pnpm build && npx vitest run` inside it), not only in the small fixture.
- [x] The fingerprint is deterministic across repeated loads (test present) — no per-call or
      time-drifting field. The inode number is excluded precisely because it is not.
- [x] The new failure message is distinct from the content-mismatch message and says the workspace
      was modified after capture.
- [x] Content is still part of the fingerprint — modification evidence (ctime) was added, not
      substituted.

## Older snapshots

- [x] Pre-existing snapshots are handled deliberately, with a message naming the reason.
- [x] Tests pin both a version-1 and a version-2 snapshot being refused ("predates write
      detection").
- [x] No snapshot is silently accepted as if it carried the new guarantee. `SNAPSHOT_VERSION` is 3.

## Capture atomicity (from the BLOCKED round)

- [x] A capture whose self-verifying load fails after the rename removes the renamed snapshot
      directory, not only the pre-rename temp. (No permanently unloadable snapshot left on disk.)

## Nothing else moved

- [x] Verdict rules, APPROVED requirements, independence rules unchanged.
- [x] `judge scope`, `judge current`, `judge prune`, `--approve-commands` unchanged.
- [x] Judge agent instructions and tool list unchanged.
- [x] `review.schema.json` and `JUDGE_SCHEMA_VERSION` unchanged.
- [x] Build output stays outside the digest; an honest run that writes `dist/` does not fail.
- [x] Catch-up chain still validates, both the intact and the tampered parent cases.

## Documentation is not overclaiming

- [x] `.akrctx/judge/README.md` and `docs/JUDGE.md` were **corrected**, not merely appended to.
      Any prior wording this task proves too strong is gone.
- [x] The docs say plainly that `verify --run-tests` no longer uses the snapshot's dependencies.
- [x] The docs state the fingerprint uses ctime (not the inode number) and why; and that the
      snapshot is not a sandbox.
- [x] `CHANGELOG.md` purely additive, continuations indented two spaces.

## Validation

- [x] `pnpm lint && pnpm build && npx vitest run` passes, output recorded verbatim in `log.md`.
- [x] `pnpm lint` reports zero errors and zero warnings.
- [x] No test skipped to make the suite green.
- [x] No Biome rule disabled, inlined-ignored, or downgraded to reach a clean run.