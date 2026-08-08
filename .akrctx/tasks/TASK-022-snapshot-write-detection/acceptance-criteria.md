# Acceptance Criteria

## Verification stops trusting snapshot dependencies

- `createJudgeSnapshotValidationWorkspace` in `src/judge-snapshot.ts` does not copy the
  snapshot's `node_modules` into the disposable workspace.
- The disposable workspace obtains dependencies from the lockfile instead, and the command used
  is deterministic — a frozen or locked install, never one free to resolve a newer version.
- A test proves the property directly: plant a detectable modification inside the snapshot's
  `node_modules`, run `verify --run-tests`, and assert the modification does not reach the
  validation workspace.
- If dependencies cannot be materialised (no lockfile, no network, install fails), verification
  fails with a message naming the reason. It never falls back to the snapshot's `node_modules`,
  and never reports a validation result obtained without them.
- The snapshot's own `node_modules` is still captured and still used by the judge for its
  in-snapshot review run. This task changes what `verify` trusts, not what the judge can read.

## Transient modification is detectable

- The manifest fingerprint carries modification evidence, not only content, so a file written and
  then restored to its captured bytes is reported at the next `loadJudgeSnapshot`.
- A test proves it: load a snapshot successfully, write to a manifest-covered file, restore its
  exact original bytes, load again, and assert the load fails as an integrity check failure.
- A second test covers the create-then-delete shape observed in the TASK-021 review: add a new
  file under a tracked, non-ignored directory, delete it, load, and assert the failure.
- The failure message says the workspace was modified after capture, and distinguishes that from
  the existing content-mismatch message. A developer must be able to tell "someone changed this
  and put it back" from "this no longer matches".
- No false positive on an honest review: capturing a snapshot, running the capsule's declared
  validation inside it, and loading it again succeeds. This is the criterion most likely to fail
  in practice and it must be exercised by a test, not asserted by hand.

## Nothing else moved

- Verdict rules, APPROVED requirements, independence rules, `judge scope`, `judge current`,
  `judge prune`, and the `--approve-commands` approval flow are unchanged.
- The judge's agent instructions and tool list are unchanged.
- `review.schema.json` and `JUDGE_SCHEMA_VERSION` are unchanged.
- `dist/` and other build output remain outside the digest; an honest validation run that writes
  build output does not fail a later load.
- The catch-up chain still validates: a catch-up snapshot whose parent is intact still loads, and
  one whose parent was tampered with still fails.

## Older snapshots

- A snapshot captured before this change is handled deliberately, not accidentally: it either
  fails to load with a message saying it predates write detection, or loads with an explicit
  warning saying the same. Whichever is chosen, a test pins it.
- No existing snapshot is silently accepted as if it carried the new guarantee.

## Documentation

- `.akrctx/judge/README.md` and `docs/JUDGE.md` state what the snapshot guarantee now covers and
  what it still does not, replacing any claim this task proves too strong.
- The documentation states plainly that `verify --run-tests` no longer uses the snapshot's
  dependencies.
- `CHANGELOG.md` records both changes under the unreleased section, added as new entries without
  altering any existing one, continuations indented two spaces.

## Validation

- `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- `pnpm lint` reports zero errors and zero warnings.
