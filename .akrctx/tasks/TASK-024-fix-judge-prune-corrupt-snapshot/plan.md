# Plan

## Workflow

- TDD

## Why

`workflowRules` maps `bugfix` to TDD. The defect is reproducible by creating a directory, and the
fix is a contained change to one function.

TDD earns its place here for a specific reason: the failure mode is a rejected `Promise.all`, and
the natural fix — wrapping the body in try-catch — silently changes what the retention logic sees.
A snapshot skipped because its metadata is unreadable disappears from `byId`, which is what the
parent-chain walk uses to retain ancestors. Writing the retention tests first makes that visible;
writing the catch first makes it invisible.

`fast-patch` was rejected because a judge snapshot is a review boundary. `prune --force` deletes
review evidence, and a change to what gets deleted is not a small safe patch.

`research-first` is not needed. The function, the failure and the causes are all identified.

## Steps

1. Decide what happens to a corrupt snapshot — removed or retained — and record it under
   `## Clarifications` in task.md with the reasoning. Every test below depends on the answer.
2. Write the failing test for the reported case: three snapshot directories, one without
   `snapshot.json`, prune completes and the healthy ones are evaluated.
3. Add the other corruption shapes as separate tests: invalid JSON, and valid JSON without the
   expected `parent` shape. They fail in different places and one fix may not cover all three.
4. Write the retention test that the naive fix breaks: a retained snapshot whose parent's metadata
   is unreadable. Assert the chosen behaviour explicitly rather than accepting whatever happens.
5. Write the reporting test: the returned `JudgeSnapshotPruneResult` carries the skipped IDs, so
   `--json` consumers see them.
6. Implement. Contain the failure per snapshot, not per batch.
7. Implement the dry-run guarantee: a corrupt snapshot is never deleted during a dry run, whatever
   step 1 decided.
8. Make the exit status distinguish a clean prune from one that skipped corrupt snapshots.
9. Run the reproducer from task.md against the built CLI and paste the output into `log.md`.
10. `CHANGELOG.md`, additive only, continuations indented two spaces.
11. `pnpm lint && pnpm build && npx vitest run`, output recorded verbatim.

## Risks

- **The obvious fix breaks retention quietly.** Skipping a snapshot removes it from `byId`, so the
  parent-chain walk stops finding ancestors through it. Nothing errors; snapshots simply stop being
  retained. Step 4 exists to catch this and it is the reason for TDD here.
- **Deleting corrupt snapshots may delete evidence.** A snapshot directory missing its metadata can
  mean an interrupted `rm`, or it can mean someone removed the metadata. The second case is exactly
  what the boundary exists to detect, and "prune tidied it away" is a bad answer. Step 1 is a real
  decision, not bookkeeping.
- **A warning nobody sees is not a report.** `console.warn` from a library function is invisible to
  `--json` consumers. Step 5 puts the information in the result.
- **`stat` can fail too.** `await stat(root)` is inside the same `Promise.all` and can throw on a
  directory removed between `readdir` and `stat`. The fix should cover the whole per-snapshot body,
  not only the `readFile`/`JSON.parse` pair named in task.md.
