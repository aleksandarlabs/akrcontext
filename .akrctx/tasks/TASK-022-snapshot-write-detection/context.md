# Context

## Relevant Files

- `src/judge-snapshot.ts` — the whole task lives here.
  - `workspaceManifest` (line 536) runs `git ls-files --cached --others --exclude-standard -z`.
    `--exclude-standard` is the flag that puts ignored paths outside the digest.
  - `addManifestPath` (line 546) computes the per-path fingerprint: `hash(["file\0", bytes])` for
    files, `hash(["symlink\0", target])` for symlinks. Content only — this is where modification
    evidence would be added.
  - `manifestDigest` (line 580) folds the manifest into one digest.
  - `loadJudgeSnapshot` / `loadJudgeSnapshotInternal` (lines 133-215) is the only place integrity
    is verified. The workspace check is at line 178; the message is "Snapshot integrity check
    failed: workspace content no longer matches its capture."
  - `createJudgeSnapshotValidationWorkspace` (line 270) does a recursive `cp` of the entire
    snapshot worktree, `node_modules` included.
  - `snapshotId` (line 609) derives the id from `workspaceDigest`, so changing the fingerprint
    changes every id.
- `src/judge-enforcement.ts:254` — the only caller of
  `createJudgeSnapshotValidationWorkspace`, inside the `--run-tests` path.
- `.akrctx/judge/README.md`, `docs/JUDGE.md` — where the current guarantee is stated. Both need
  correcting, not just extending.
- `tests/akrctx.test.ts` — holds the existing judge snapshot tests, including the catch-up chain
  and integrity cases. New tests belong alongside them.

## Prior Findings

- Measured on snapshot `6ba9ea6e46501891a578`:

  ```
  git -C <worktree> check-ignore -v dist node_modules
    .gitignore:5:dist/          dist
    .gitignore:2:node_modules/  node_modules

  git -C <worktree> ls-files --cached --others --exclude-standard | grep -c '^dist/\|^node_modules/'
    0
  ```

  Zero covered files in either directory. `node_modules` there is a real directory, not a
  symlink — `loadJudgeSnapshot` explicitly rejects a symlinked one (line 165), so the private
  copy is by design.

- The integrity check is real and does work for ordinary content. An earlier reading of this code
  concluded there was no digest over the worktree; that was wrong. `workspaceDigest` covers every
  tracked and untracked-but-not-ignored path, and is checked on every load. The gap is the
  ignored paths and the timing, not the absence of a digest.

- The transient case is observed, not theoretical. The judge reviewing TASK-021 reported:

  > while attempting a template-render comparison I briefly copied a scratch test file into the
  > snapshot's `evals/` directory and removed it immediately

  `evals/` is tracked and not ignored, so the file *was* inside the manifest's coverage while it
  existed. The later load passed because the file was gone and the content matched again. The
  breach was disclosed voluntarily; nothing in akrctx reported it.

- `cp` in `createJudgeSnapshotValidationWorkspace` uses `preserveTimestamps: true`, so mtime
  survives the copy into the disposable workspace. ctime does not — it is set when the copy is
  made. Any design using ctime must be clear about which tree it is measuring and when.

- `verify --run-tests` already refuses non-snapshot candidates and requires per-command operator
  approval (TASK-019). Those defences are orthogonal to this task and stay untouched.

## Blocked Reads

- Secrets and credentials must not be read: `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`,
  `*.pfx`, `secrets/`, `credentials/`, `private/`.
- `.akrctx/local/judge/snapshots/` holds full copies of earlier worktrees. Read them as evidence
  about snapshot structure, never as current source — `src/*.ts` under a snapshot path is an old
  revision.
