# Task

## Goal

Snapshot validation cannot run the test suite of any project that uses pnpm, which makes
`akrctx judge verify --run-tests` — the one check that re-executes validation instead of
trusting the judge's claim — unusable exactly where it matters most.

`copyLocalDependencies` in `src/judge-snapshot.ts` copies `node_modules` with
`dereference: true`. pnpm does not install a tree; it installs a content-addressed store
under `node_modules/.pnpm` plus a farm of symlinks that give each package its own resolution
root. Dereferencing turns every link into a real directory, so a package is copied without
the layout that lets Node resolve its transitive dependencies. Observed in this repository:

```
node_modules/vitest (live)     → symlink to .pnpm/vitest@3.2.4_@types+node@22.19.17/node_modules/vitest
node_modules/vitest (snapshot) → real directory
npx vitest run (in snapshot)   → ERR_MODULE_NOT_FOUND: Cannot find package 'std-env'
```

Vitest aborts at config load, before any test file is read. The independent review of
TASK-010 reported `BLOCKED` for this reason, having found no defect in the code it reviewed.

`dereference: true` is not arbitrary: it is what keeps the snapshot from holding a symlink
that points back into the live project, which
`tests/akrctx.test.ts:2970` asserts and which the whole isolation guarantee rests on. The
fix must keep that property while preserving the layout, so it has to distinguish a link
that stays inside the dependency tree from one that leaves it.

While editing this function, also fix the missing `symlink` import that
`npx tsc --noEmit` reports at `src/judge-snapshot.ts:438`. `overlayChangedFiles` calls it on
the symlink branch, so that path throws `ReferenceError` at runtime today. It is the same
symbol this task needs and the same concern; leaving it would mean knowingly shipping a
broken branch in the function next door.

## Validation

```
pnpm build && npx vitest run
```

The build is part of the command, not an assumption. Four tests drive the real CLI through
`dist/index.js`, and `dist/` is Git-ignored, so it is absent from a review snapshot. Running
the suite there without building first fails those four for a reason that has nothing to do
with the code under review.

`npx tsc --noEmit` is deliberately not declared. It exits non-zero on errors this task does
not own (`tests/evals.test.ts`, `tests/akrctx.test.ts`), so a judge would have to record it
as `failed`, and a failed entry invalidates a review record under any verdict. It is still
run by hand, and this task must remove one of its errors — the `symlink` one — and add none.

## Out Of Scope

- The remaining `npx tsc --noEmit` errors in `tests/evals.test.ts`, `tests/hook.test.ts`,
  and `tests/akrctx.test.ts`. They are untyped-import and inference issues in test files
  this task does not touch.
- npm, yarn, and bun layouts beyond what preserving relative internal symlinks already
  gives them. A flat `node_modules` has no internal links, so it is unaffected either way.
- Making the snapshot install dependencies it did not find. If the live project has no
  `node_modules`, the snapshot still has none.

## Clarifications

### Session 2026-08-07

- A symlink that resolves outside the dependency tree is dereferenced into a copy rather
  than recreated or skipped. Recreating it would point the snapshot at the live project,
  which is the property this function exists to guarantee; skipping it would silently
  remove a workspace dependency and fail validation for a reason unrelated to the code
  under review. Copying the content keeps both the isolation and the ability to run.

## Open Questions

- None recorded yet.
