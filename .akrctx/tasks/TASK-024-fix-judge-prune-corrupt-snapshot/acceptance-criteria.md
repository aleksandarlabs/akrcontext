# Acceptance Criteria

## One bad snapshot no longer stops the prune

- AC-1: `pruneJudgeSnapshots` in `src/judge-snapshot.ts` completes when a directory matching
  `^[0-9a-f]{20}$` exists without a readable `snapshot.json`.
- AC-2: The failure is contained per snapshot, not per batch. The current `Promise.all` rejects on the
  first bad entry; after this change one bad entry does not affect the others.
- AC-3: A test proves it: create three snapshot directories, break one, run prune, and assert the
  healthy ones were evaluated and the expected ones removed.
- AC-4: Every failure shape is covered by a test, not just the missing file: `snapshot.json` absent,
  `snapshot.json` containing invalid JSON, and `snapshot.json` valid JSON but not an object with
  the expected `parent` shape.

## What happens to a corrupt snapshot is decided, not defaulted

- AC-5: Whether a corrupt snapshot is removed or retained is answered in writing under
  `## Clarifications` in task.md before implementation. Both are defensible: removing reclaims
  space from something unusable, retaining preserves evidence of tampering.
- AC-6: A judge snapshot is a review boundary. If the answer is "remove", the criteria state that
  removal happens only under `--force` and never during a dry run, so an unreadable boundary is
  never destroyed by an informational command.
- AC-7: A test pins the chosen answer for both the dry-run and the non-dry-run path.

## The corruption is reported, not swallowed

- AC-8: Each skipped snapshot produces a warning naming its ID and the reason.
- AC-9: The warning reaches the caller through the result, not only through `console`. A test asserts
  the returned `JudgeSnapshotPruneResult` carries the skipped IDs, so `--json` consumers see them
  too.
- AC-10: Prune's exit status distinguishes "pruned cleanly" from "pruned with corrupt snapshots
  skipped". A silent success on a corrupt store is not acceptable.

## Retention semantics are unchanged

- AC-11: `--keep` still retains the N most recent snapshots by mtime, with the existing ID tiebreak.
- AC-12: The parent-chain walk still retains ancestors of retained snapshots. A corrupt snapshot in the
  middle of a chain does not silently orphan its ancestors: a test covers a retained child whose
  parent metadata is unreadable, and asserts the behaviour is deliberate and named.
- AC-13: The `--keep` validation for a non-negative integer is unchanged.
- AC-14: A missing snapshots root still yields an empty result rather than an error, as it does today.

## Validation

- AC-15: `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- AC-16: `pnpm lint` reports zero errors and zero warnings.
- AC-17: `CHANGELOG.md` records the fix under the unreleased section, additive only, continuations
  indented two spaces.
