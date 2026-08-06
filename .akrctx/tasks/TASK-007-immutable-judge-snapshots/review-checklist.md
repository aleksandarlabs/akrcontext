# Review Checklist

- [x] Goal and snapshot boundary match the approved design.
- [x] No automatic live Git commit, branch, ref, stage, checkout, rebase, merge, push, or stash.
- [x] Live worktree and index remain byte-for-byte unchanged by capture and verification.
- [x] Snapshot tampering and deletion are detected.
- [x] Validation runs in a disposable workspace and cannot mutate the immutable snapshot.
- [x] Legacy review records and candidate modes remain compatible.
- [x] Catch-up cannot extend an unverified, non-approved, missing, or tampered parent verdict.
- [x] Blocked paths are absent from the reviewable snapshot worktree.
- [x] Snapshot storage is shallow and has an explicit retention command.
- [x] Generated instructions and public documentation match implementation behavior.
- [x] Tests, lint, build, init dry-run, and Doctor pass.
- [x] Protected instruction files were not modified by this implementation without exact-diff approval.

## Validation Evidence

- `pnpm build` — passed on 2026-08-06.
- `pnpm test` — 602 tests passed across 4 files on 2026-08-06.
- `pnpm lint` — passed; 75 files checked with no fixes required.
- `pnpm akrctx init --target codex --dry-run` — passed; existing protected instructions preserved.
- `pnpm akrctx doctor --json` — passed with readiness 100, no missing files,
  conflicts, broken links, or wiki orphans.
- `git diff --check` — passed.
- The exact final `CLAUDE.md` diff was shown and approved by the user in the
  current conversation before synchronization.
- Independent `akrctx-judge` was not invoked because it requires a separate explicit
  authorization when `judge.enabled` is true.
