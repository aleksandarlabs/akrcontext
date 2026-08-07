# Review Checklist

- [x] Goal is clear.
- [x] Scope is controlled.
- [x] Tests or validation commands are defined.
- [x] Existing instructions were not overwritten.

## Layout

- [x] An internal symlink is recreated, relative, inside the snapshot copy.
- [x] A pnpm-shaped fixture resolves transitive dependencies in the snapshot.
- [x] Files and directories are copied as before.

## Isolation

- [x] An escaping absolute link is dereferenced.
- [x] An escaping relative link is dereferenced.
- [x] No symlink under the snapshot's node_modules resolves outside it.
- [x] A broken link is dropped.
- [x] Both pre-existing isolation tests still pass.

## The missing import

- [x] `symlink` is imported and the tsc error is gone.
- [x] The `overlayChangedFiles` symlink branch is covered by a test.

## Cross-cutting

- [x] `npx vitest run` passes in full.
- [x] `npx tsc --noEmit` reports one error fewer and no new one.
