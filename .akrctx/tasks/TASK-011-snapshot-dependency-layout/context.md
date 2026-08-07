# Context

## Relevant Files

- `src/judge-snapshot.ts` — `copyLocalDependencies` (the defect), `overlayChangedFiles`
  (the missing `symlink` import), and `loadJudgeSnapshot`, which rejects a snapshot whose
  `node_modules` is itself a symlink and must keep doing so.
- `tests/akrctx.test.ts` — the two tests that pin the isolation guarantee, at
  `rejects a snapshot whose ignored dependency directory links to the live project` and
  `copies local dependencies into validation without linking back to the live project`.

## Prior Findings

- The failure was found by the independent review of TASK-010, which reported `BLOCKED`
  having found no defect in the code under review. Reproduced directly: `npx vitest run`
  inside `.akrctx/local/judge/snapshots/<id>/worktree` aborts with
  `ERR_MODULE_NOT_FOUND: Cannot find package 'std-env'` before loading any test file.
- pnpm links are relative — `node_modules/vitest` targets
  `.pnpm/vitest@3.2.4_@types+node@22.19.17/node_modules/vitest` — so classifying by resolved
  path is enough; no absolute-path rewriting is needed for the common case.
- Directory recursion cannot loop: `readdir` with `withFileTypes` reports a symlinked
  directory as a symlink, so the walk never descends through one.
- `.pnpm` also holds `node_modules` directories of its own, which is why the walk has to be
  general rather than special-casing the top level.

## Blocked Reads

- Secrets and credentials must not be read.
