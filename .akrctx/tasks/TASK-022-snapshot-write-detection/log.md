# Implementation log — TASK-022

## Research (came first, per plan)

The plan gates the transient-detection half on a measured answer: does an honest review
perturb the modification evidence (inode/ctime/mtime) on manifest-covered paths? If it does,
a fingerprint strict about modification cries wolf on every review and is worse than the gap.

### Method

Captured a real snapshot (`SNAPSHOT:b465b922333cf4b6d3da`) of TASK-022 at the current HEAD on
**Linux arm64** (`Linux mypihome 7.0.14-orbstack ... aarch64`). In its worktree, recorded
`lstat` (ino, ctimeMs, mtimeMs, size, nlink) for every manifest-covered path
(`git ls-files --cached --others --exclude-standard`) and for every ancestor directory of
those paths (excluding the worktree root). Then ran the capsule's declared validation inside
the worktree — `pnpm lint && pnpm build && npx vitest run` — and re-recorded the same fields.

### Result — honest review does not perturb manifest-covered paths

```
manifest-covered files: 301
tracked ancestor dirs:   92
validation:              8 test files, 735 tests passed
FILE drift after honest validation: 0   (ino/ctime/mtime/size/nlink all stable)
DIR drift after honest validation: 0
added manifest files: 0
removed manifest files: 0
```

`dist/` and `node_modules` are gitignored, so build output and dependency churn never enter the
manifest; they also never touched a tracked ancestor directory's ctime. The worktree root is
**not** tracked (creating `dist/` updates the root's ctime, so the root must stay out of the
fingerprint — confirmed by the 0-dir-drift result with root excluded).

### Result — the attack signals do move

```
write-then-restore-bytes : file ctime changed (content same, ino same)
create-then-delete       : dir   ctime changed (dir empty again, dir ino same)
rm-then-recreate         : file ino changed AND ctime changed (content same)
```

So a fingerprint that adds `lstat` ctime (and ino) to each covered file, and a `lstat` ctime/ino
entry for each covered ancestor directory, distinguishes every observed attack from an honest
review on this platform.

### Limit (recorded honestly)

The measurement is on one platform. `ctime` is not user-backdatable on Linux without root, and
the result should hold on macOS/BSD where ctime has the same kernel-set semantics, but the plan
asked for a second platform and only one was available. The honest-review negative test
(capture → run declared validation → load again) stays in the suite to keep catching the case if
a future tool writes to a tracked path. Snapshots captured before this change cannot carry the
new fingerprint and are refused at load with a message naming write detection, not accepted
silently.
## Implementation

### Half 1 — `verify` stops trusting the snapshot's `node_modules`

`createJudgeSnapshotValidationWorkspace` (`src/judge-snapshot.ts`) now copies the snapshot
worktree with a `filter` that excludes every `node_modules` directory (top-level or nested),
then calls `materialiseDependencies`, which:

- returns early when there is no `package.json` (not a Node project) or the `package.json`
  declares no dependency fields (nothing to materialise — a lockfile is not required);
- otherwise selects a frozen install from the lockfile — `pnpm install --frozen-lockfile`,
  `npm ci`, or `yarn install --frozen-lockfile` — and runs it in the disposable workspace;
- throws a named reason if there is no lockfile or the install fails. There is no fallback to
  the snapshot's `node_modules` on any path (the `cp` excludes it; `materialiseDependencies`
  throws rather than falls back).

The snapshot's own `node_modules` is still captured by `copyLocalDependencies` for the judge's
in-snapshot review run; only what `verify` trusts changed.

Tests: `verify --run-tests does not trust the snapshot's node_modules` (a marker planted in the
snapshot's `node_modules` does not reach the disposable workspace, so the declared command
fails there); `verify --run-tests fails when the boundary declares dependencies but has no
lockfile`; `materialises dependencies from the lockfile so validation resolves transitive
packages` (local `file:` deps, a generated `pnpm-lock.yaml`, and a frozen offline install
resolve `dep -> leaf`). The pre-existing `pnpm-layout` and `copies-local-dependencies` tests
were rewritten because their premise (trusting the copied `node_modules`) is the behaviour this
task removes.

### Half 2 — transient modification is detectable

The manifest fingerprint is split into `content` and `stat` (`src/judge-snapshot.ts`):
`PathFingerprint = { content, stat }`. Files and symlinks carry `hash(content)` plus
`statOf(info) = hash(ino, ctimeMs)`; each covered path's ancestor directories (excluding the
worktree root) get a `{ content: "dir", stat }` entry. `contentDigest` (content only) is the
content-addressed snapshot id; `workspaceDigest` (content + stat) is the integrity digest.

`loadJudgeSnapshot` now checks content first, then stat:

- `contentDigest` mismatch → "workspace content no longer matches its capture" (unchanged
  meaning: the snapshot drifted).
- content match but `workspaceDigest` mismatch → "workspace was modified after capture (a file
  was changed and restored, or a file was created and deleted)" — the new, distinct message.

`changedManifestPaths` and `deltaDigest` (catch-up) compare content only, so a write-then-
restore that restored content is not a "changed file" in the scope sense. The capture's
live-vs-snapshot consistency check is content-only (stats differ between the live and snapshot
trees by design). `SNAPSHOT_VERSION` is now `2`; a version-1 snapshot fails to load with "this
snapshot was captured by an older akrctx that predates write detection".

The worktree root is deliberately excluded from the ancestor-dir set: declared validation
legitimately creates ignored build output (`dist/`, `node_modules`) at the root, which moves
the root's ctime without being a breach. The research measurement (0 dir drift after an honest
`pnpm lint && pnpm build && npx vitest run`) is the evidence this does not false-positive.

Tests: write-then-restore-exact-bytes; create-then-delete in a tracked directory (the
TASK-021 shape); honest-review negative (run a command writing ignored `dist/` inside the
snapshot, then load succeeds); older-snapshot refusal.

### Documentation

`.akrctx/judge/README.md` (regenerated from `src/templates/judge-contract.ts`) and `docs/JUDGE.md`
were corrected, not merely appended: the "Independent re-execution" wording no longer claims
`--run-tests` uses the snapshot's private Node dependencies — it materialises them from the
lockfile, and fails with a named reason if it cannot. "What this does and does not prove" now
states the integrity check covers write-then-restore / create-then-delete via inode/ctime, does
not cover ignored paths, and is tamper-evident bookkeeping, not a sandbox. `review.schema.json`
is unchanged (the template-source `reviewSchema` predates this task without an `independent`
property; that drift is pre-existing and out of scope).

### Validation (verbatim)

```
$ pnpm lint
Checked 96 files in 146ms. No fixes applied.
$ pnpm build
ESM ⚡️ Build success / DTS ⚡️ Build success
$ npx vitest run
 Test Files 8 passed (8)
      Tests 740 passed (740)
$ akrctx doctor --json
readiness 100, conflicts 0, wikiLint clean
```

(The first lint pass left a blank line with trailing whitespace in `src/judge-snapshot.ts`
introduced by the fingerprint edit; `pnpm lint:fix` removed it, after which the run above is
clean. The earlier draft of this log recorded a clean lint before that fix had been applied,
which was not true.)

End-to-end on the dogfood repo: a snapshot of TASK-022, `verify --run-tests --approve-commands
"pnpm lint && pnpm build && npx vitest run"` materialised the real akrctx dependencies from
`pnpm-lock.yaml` (offline, from the store), re-ran the validation in the disposable workspace,
and reported `APPROVED and current`.

`pnpm lint` reports zero errors and zero warnings after the `lint:fix`. No Biome rule was
disabled, ignored, or downgraded. No test was skipped.

## BLOCKED by an independent judge round — and the correction

An independent review round (`.akrctx/local/judge/TASK-022-review-03-independent.json`)
returned **BLOCKED**, and a claim in the first round was false.

### The false claim

The first (non-independent) round reported `akrctx judge verify --run-tests` → "APPROVED and
current" on `SNAPSHOT:813709fae6c7d985fdf6`. That approval did not stand. The trusted caller
reproduced, from a clean shell:

```
$ node dist/index.js judge verify .akrctx/local/judge/TASK-022-review-02.json
Judge verification: INVALID
  - Cannot recompute review scope: Snapshot integrity check failed:
    workspace was modified after capture
```

`verify --run-tests` did return APPROVED at the moment it was run (the inode numbers had not yet
drifted), but the snapshot became unverifiable minutes-to-hours later with no modification. An
ephemeral approval that turns invalid on its own is not an approval, and reporting it as one was
wrong. The non-independent round-02 verdict is void; the independent round-03 BLOCKED stands.

### Root cause: the inode number is unstable on FUSE mounts

The fingerprint as first shipped was `statOf(info) = hash(ino, ctimeMs)`. On this host the
worktree lives on a FUSE mount (`fuseblk`); the FUSE daemon synthesizes inode numbers and they
drift over time even when nothing changes. `ctime` is stable (a file's ctime still reads its
pre-capture value hours later), but `ino` is not, so the captured `workspaceDigest` did not
reproduce at load → "workspace was modified after capture" on snapshots that had never been
written to after capture (`5d9d50767378f5b77d02` proved this: its worktree root ctime predates its
own snapshot.json, so nothing was ever written into it, yet its recorded workspaceDigest did not
reproduce). The load result flipped between runs (an honest snapshot was randomly loadable or
not), which is the signature of a nondeterministic fingerprint field.

The earlier research measurement missed this because it compared two reads taken seconds apart;
inode drift on this mount manifests over minutes-to-hours, not seconds. That is the gap the
independent review closed.

### Fix

- `statOf` now hashes `ctimeMs` only — the inode number is dropped. `ctime` is kernel-set,
  stable, and changes only on a content/metadata modification, so it still detects
  write-then-restore, create-then-delete (the parent directory's ctime moves), and
  rm-then-recreate, without false-positiving on an honest load. A comment in `statOf` records
  why the inode number stays out.
- `SNAPSHOT_VERSION` is now 3. Version-1 and version-2 snapshots fail to load with "predates
  write detection"; none is silently accepted.
- Capture is atomic on the failure path: a self-verifying `loadJudgeSnapshot` that fails after
  the rename now removes the renamed snapshot directory (`finalRoot`) instead of leaving a
  permanently unloadable one (the old catch removed only the pre-rename `temporaryRoot`).
- Tests added: a version-2 snapshot is refused; a snapshot loads deterministically across
  repeated loads (guards any per-call nondeterministic field); the honest-review negative test
  also writes ignored output into `node_modules` inside the snapshot, not only `dist/`.

### Verification of the fix (real repository)

```
$ akrctx judge snapshot TASK-022 --base <HEAD>   # v3 snapshot 0146c2299e8aa54efebe
$ # load 5x: OK OK OK OK OK
$ (cd <worktree> && pnpm lint && pnpm build && npx vitest run)   # honest in-snapshot review
$ akrctx judge verify <record>.json             # no --run-tests
Judge verification: APPROVED and current
$ akrctx judge verify <record>.json --run-tests --approve-commands "pnpm lint && pnpm build && npx vitest run"
Judge verification: APPROVED and current
  + re-ran pnpm lint && pnpm build && npx vitest run
```

A v3 snapshot stays APPROVED after the judge runs the real validation inside it — the false
positive is gone.

### Validation (verbatim, after the fix)

```
$ pnpm lint
Checked 96 files in 143ms. No fixes applied.
$ pnpm build
ESM ⚡️ Build success / DTS ⚡️ Build success
$ npx vitest run
 Test Files 8 passed (8)
      Tests 742 passed (742)
```

`pnpm lint` reports zero errors and zero warnings. No Biome rule was disabled, ignored, or
downgraded. No test was skipped.
