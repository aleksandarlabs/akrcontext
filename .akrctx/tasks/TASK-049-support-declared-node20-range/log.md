# Implementation Log

## 2026-08-26

- Selected workflow: TDD, because this is a small compatibility regression against the
  already-published `node >=20` contract.
- Added the compatibility regression first. Its pre-implementation run failed because the
  required `collectRegularFiles` helper was not yet present.
- Implemented an explicit depth-first directory walk using only `Dirent.name`,
  `isFile()`, `isDirectory()`, and `isSymbolicLink()`. It returns sorted POSIX paths, skips
  symlinks, and is rooted under the current version's upgrade directory.
- Updated `removeResolvedCandidates` to use the helper; no production use of
  `readdir({ recursive: true })` or `Dirent.parentPath` remains in this flow.
- Focused compatibility and candidate-hygiene tests pass.
- Validation passed: `pnpm vitest run tests/akrctx.test.ts` (333/333), `pnpm build`,
  `pnpm test` (812/812), `pnpm lint`, `pnpm akrctx init --target codex --dry-run`, and
  `pnpm akrctx doctor --json` (readiness 100, no conflicts).
- Protected instructions were preserved. No changes were made to TASK-050 or later.
- Judge was not invoked, per user instruction.

## 2026-08-26 — Final boundary hardening

- Added real symlink regressions before the fix: one nested directory symlink and one symlink
  replacing the collection root. The nested case already stayed inside the root; the root case
  initially failed by enumerating `external.txt`.
- Hardened `collectRegularFiles` with an `lstat` root check. A root that is missing, non-directory,
  or symlinked now returns no candidates without calling `readdir`; nested symlinks remain skipped.
- Added the same root boundary guard to `removeResolvedCandidates`, preventing its empty-directory
  cleanup from following a symlink after candidate collection returns empty.
- Final validation passed: `pnpm vitest run tests/akrctx.test.ts` (335/335), `pnpm build`,
  `pnpm test` (814/814), `pnpm lint`, `pnpm akrctx init --target codex --dry-run`, and
  `pnpm akrctx doctor --json` (readiness 100, no conflicts).
- Renamed the final checklist item to `The final boundary is ready for independent review`;
  judge remains uninvoked by explicit instruction.
