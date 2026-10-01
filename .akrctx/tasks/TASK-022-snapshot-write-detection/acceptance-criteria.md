# Acceptance Criteria

## Verification stops trusting snapshot dependencies

- AC-1: `createJudgeSnapshotValidationWorkspace` in `src/judge-snapshot.ts` does not copy the
  snapshot's `node_modules` into the disposable workspace.
- AC-2: The disposable workspace obtains dependencies from the lockfile instead, and the command used
  is deterministic — a frozen or locked install, never one free to resolve a newer version.
- AC-3: A test proves the property directly: plant a detectable modification inside the snapshot's
  `node_modules`, run `verify --run-tests`, and assert the modification does not reach the
  validation workspace.
- AC-4: If dependencies cannot be materialised (no lockfile, no network, install fails), verification
  fails with a message naming the reason. It never falls back to the snapshot's `node_modules`,
  and never reports a validation result obtained without them.
- AC-5: The snapshot's own `node_modules` is still captured and still used by the judge for its
  in-snapshot review run. This task changes what `verify` trusts, not what the judge can read.

## Transient modification is detectable

- AC-6: The manifest fingerprint carries modification evidence, not only content, so a file written and
  then restored to its captured bytes is reported at the next `loadJudgeSnapshot`.
- AC-7: A test proves it: load a snapshot successfully, write to a manifest-covered file, restore its
  exact original bytes, load again, and assert the load fails as an integrity check failure.
- AC-8: A second test covers the create-then-delete shape observed in the TASK-021 review: add a new
  file under a tracked, non-ignored directory, delete it, load, and assert the failure.
- AC-9: The failure message says the workspace was modified after capture, and distinguishes that from
  the existing content-mismatch message. A developer must be able to tell "someone changed this
  and put it back" from "this no longer matches".
- AC-10: No false positive on an honest review: capturing a snapshot, running the capsule's declared
  validation inside it, and loading it again succeeds. This is the criterion most likely to fail
  in practice and it must be exercised by a test, not asserted by hand.

## Nothing else moved

- AC-11: Verdict rules, APPROVED requirements, independence rules, `judge scope`, `judge current`,
  `judge prune`, and the `--approve-commands` approval flow are unchanged.
- AC-12: The judge's agent instructions and tool list are unchanged.
- AC-13: `review.schema.json` and `JUDGE_SCHEMA_VERSION` are unchanged.
- AC-14: `dist/` and other build output remain outside the digest; an honest validation run that writes
  build output does not fail a later load.
- AC-15: The catch-up chain still validates: a catch-up snapshot whose parent is intact still loads, and
  one whose parent was tampered with still fails.

## Older snapshots

- AC-16: A snapshot captured before this change is handled deliberately, not accidentally: it either
  fails to load with a message saying it predates write detection, or loads with an explicit
  warning saying the same. Whichever is chosen, a test pins it.
- AC-17: No existing snapshot is silently accepted as if it carried the new guarantee.

## Documentation

- AC-18: `.akrctx/judge/README.md` and `docs/JUDGE.md` state what the snapshot guarantee now covers and
  what it still does not, replacing any claim this task proves too strong.
- AC-19: The documentation states plainly that `verify --run-tests` no longer uses the snapshot's
  dependencies.
- AC-20: `CHANGELOG.md` records both changes under the unreleased section, added as new entries without
  altering any existing one, continuations indented two spaces.

## Validation

- AC-21: `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- AC-22: `pnpm lint` reports zero errors and zero warnings.
