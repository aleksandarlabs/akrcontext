# Acceptance Criteria

## One definition remains

- After the change, `grep -rn "function matchesBlockedPattern" src` returns exactly one line.
- The surviving definition is the exported one at `src/judge-enforcement.ts:553`.
- `src/judge-snapshot.ts` obtains it by import. Its two call sites, lines 558 and 657, behave
  unchanged.
- The two bodies are confirmed byte-identical before deletion, and the comparison is recorded in
  `log.md`. If they have drifted, the difference is a finding to report, not something to resolve
  by picking one.

## The import cycle is handled deliberately

- task.md claims `judge-snapshot.ts:754` already imports from `judge-enforcement.ts`. It does not,
  in the way that matters: line 754 is a wrapper that reaches `readBlockedPatterns` through a
  **dynamic** `import()`. That shape almost always exists to break a circular dependency.
- Before implementing, establish whether a static import creates a cycle, and record the finding
  in `log.md`. If it does, the resolution is chosen and stated: move the function to a leaf module
  that neither file's dependency graph reaches, or keep the dynamic import for this symbol too.
- Whichever is chosen, `pnpm build` passes and the built CLI starts. A cycle that TypeScript
  tolerates but that breaks at runtime through an undefined import is the failure this criterion
  exists to catch, so the check is running the CLI, not compiling it.
- If the function moves, `src/hook/index.ts:6` is updated and its two call sites at lines 154 and
  215 keep working.

## Blocked-pattern matching is unchanged

- The function decides what is excluded from a judge snapshot and what the hook flags. A behaviour
  change here is a security change, not a refactor.
- Every branch keeps its behaviour, pinned by a test if not already covered: trailing-slash
  directory patterns, `*.ext` suffix patterns, `name.*` prefix patterns, exact segment matches,
  and full-path equality.
- Windows separators still normalize. A test covers a path containing `\` on the matching side.
- `tests/hook.test.ts` and the judge snapshot tests in `tests/akrctx.test.ts` pass with no test
  modified.

## Ordering against neighbouring tasks

- This task and TASK-026 both restructure imports in `judge-snapshot.ts` and
  `judge-enforcement.ts`. Their order is recorded in task.md before implementation.

## Validation

- `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- `pnpm lint` reports zero errors and zero warnings.
- The built CLI runs at least one command that exercises blocked patterns, and the output is
  recorded in `log.md`.
- `CHANGELOG.md` records the deduplication under the unreleased section, additive only,
  continuations indented two spaces.
