# Review Checklist

## The decision was made before code

- [ ] Whether a corrupt snapshot is removed or retained is recorded under `## Clarifications` in
      task.md, with the reasoning about evidence versus tidiness.

## The crash is fixed at the right granularity

- [ ] Prune completes with one corrupt snapshot present. Test present.
- [ ] All three corruption shapes are covered by separate tests: `snapshot.json` absent, invalid
      JSON, valid JSON with an unexpected shape.
- [ ] The `stat` call is protected too, not only `readFile`/`JSON.parse`. A directory removed
      between `readdir` and `stat` does not crash the batch.
- [ ] Failure is contained per snapshot. Two corrupt snapshots do not compound.

## Retention did not quietly change

- [ ] `--keep` still retains the N most recent by mtime, with the existing ID tiebreak. Test
      passes unmodified.
- [ ] The parent-chain walk still retains ancestors of retained snapshots.
- [ ] A retained snapshot whose parent metadata is unreadable behaves as decided, and a test
      asserts that behaviour by name. This is the box most likely to be ticked without checking.
- [ ] A missing snapshots root still yields an empty result rather than an error.
- [ ] The `--keep` non-negative-integer validation is unchanged.

## The corruption is reported

- [ ] Skipped snapshot IDs appear in the returned `JudgeSnapshotPruneResult`, not only on the
      console. Test present.
- [ ] `--json` output carries them.
- [ ] Exit status distinguishes a clean prune from one that skipped corrupt snapshots.
- [ ] A corrupt snapshot is never deleted during a dry run. Test present.

## Validation

- [ ] `pnpm lint && pnpm build && npx vitest run` passes, output recorded verbatim in `log.md`.
- [ ] `pnpm lint` reports zero errors and zero warnings.
- [ ] The reproducer from task.md was run against the built CLI, output in `log.md`.
- [ ] No test skipped to make the suite green.
- [ ] No Biome rule disabled, inline-ignored, or downgraded to reach a clean run.
- [ ] `CHANGELOG.md` purely additive, continuations indented two spaces.
