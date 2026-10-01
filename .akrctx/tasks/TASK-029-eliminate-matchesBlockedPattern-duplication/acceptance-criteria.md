# Acceptance Criteria

## One definition remains

- AC-1: After the change, `grep -rn "function matchesBlockedPattern" src` returns exactly one line.
- AC-2: The surviving definition is the exported one at `src/judge-enforcement.ts:553`.
- AC-3: `src/judge-snapshot.ts` obtains it by import. Its two call sites, lines 558 and 657, behave
  unchanged.
- AC-4: The two bodies are confirmed byte-identical before deletion, and the comparison is recorded in
  `log.md`. If they have drifted, the difference is a finding to report, not something to resolve
  by picking one.

## The import cycle is handled deliberately

- AC-5: task.md claims `judge-snapshot.ts:754` already imports from `judge-enforcement.ts`. It does not,
  in the way that matters: line 754 is a wrapper that reaches `readBlockedPatterns` through a
  **dynamic** `import()`. That shape almost always exists to break a circular dependency.
- AC-6: Before implementing, establish whether a static import creates a cycle, and record the finding
  in `log.md`. If it does, the resolution is chosen and stated: move the function to a leaf module
  that neither file's dependency graph reaches, or keep the dynamic import for this symbol too.
- AC-7: Whichever is chosen, `pnpm build` passes and the built CLI starts. A cycle that TypeScript
  tolerates but that breaks at runtime through an undefined import is the failure this criterion
  exists to catch, so the check is running the CLI, not compiling it.
- AC-8: If the function moves, `src/hook/index.ts:6` is updated and its two call sites at lines 154 and
  215 keep working.

## Blocked-pattern matching is unchanged

- AC-9: The function decides what is excluded from a judge snapshot and what the hook flags. A behaviour
  change here is a security change, not a refactor.
- AC-10: Every branch keeps its behaviour, pinned by a test if not already covered: trailing-slash
  directory patterns, `*.ext` suffix patterns, `name.*` prefix patterns, exact segment matches,
  and full-path equality.
- AC-11: Windows separators still normalize. A test covers a path containing `\` on the matching side.
- AC-12: `tests/hook.test.ts` and the judge snapshot tests in `tests/akrctx.test.ts` pass with no test
  modified.

## Ordering against neighbouring tasks

- AC-13: This task and TASK-026 both restructure imports in `judge-snapshot.ts` and
  `judge-enforcement.ts`. Their order is recorded in task.md before implementation.

## Validation

- AC-14: `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- AC-15: `pnpm lint` reports zero errors and zero warnings.
- AC-16: The built CLI runs at least one command that exercises blocked patterns, and the output is
  recorded in `log.md`.
- AC-17: `CHANGELOG.md` records the deduplication under the unreleased section, additive only,
  continuations indented two spaces.
