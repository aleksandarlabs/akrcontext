# Acceptance Criteria

## Layout preservation

- A symlink inside `node_modules` whose target resolves to a path inside `node_modules` is
  recreated in the snapshot as a symlink pointing at the corresponding path inside the
  snapshot's own copy. It is relative, so the copy stays relocatable.
- The pnpm shape survives: given `node_modules/pkg` linked to
  `node_modules/.pnpm/pkg@1.0.0/node_modules/pkg`, the snapshot has the same link, the same
  `.pnpm` directory, and a package resolves its transitive dependencies through it.
- A regular file and a regular directory are copied as before.

## Isolation

- A symlink whose target resolves outside `node_modules` is dereferenced: its content is
  copied and no link remains. This covers an absolute link into the live project and a
  relative link that climbs out of the tree.
- After capture, no path under the snapshot's `node_modules` is a symlink that resolves
  outside that snapshot's `node_modules`.
- `node_modules` itself is never a symlink in the snapshot, and the existing rejection of a
  snapshot whose dependency directory is a symlink still fires.
- A broken symlink is dropped rather than copied or recreated as a dangling link.

## The reported failure

- In a fixture using the pnpm layout, a validation command that imports a package through
  its transitive dependency succeeds inside the snapshot workspace. This test fails against
  the current `dereference: true` implementation.

## The missing import

- `symlink` is imported in `src/judge-snapshot.ts`, and `npx tsc --noEmit` no longer reports
  `Cannot find name 'symlink'`.
- `overlayChangedFiles` recreates a symlink among the changed files instead of throwing
  `ReferenceError`.

## Cross-cutting

- `npx vitest run` passes in full.
- `npx tsc --noEmit` reports one error fewer than before and no new one.
- Every existing snapshot test still passes, in particular the two that pin the isolation
  guarantee: `rejects a snapshot whose ignored dependency directory links to the live
  project` and `copies local dependencies into validation without linking back to the live
  project`.
