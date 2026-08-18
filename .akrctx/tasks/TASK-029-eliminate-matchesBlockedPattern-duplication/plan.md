# Plan

## Workflow

- research-first, then fast-patch

## Why

`workflowRules` maps `unknownArea` to research-first and `smallSafePatch` to fast-patch.

Research comes first because of one specific thing. task.md asserts that `judge-snapshot.ts`
already imports from `judge-enforcement.ts`, and it does — but through a **dynamic** `import()`
inside a wrapper at line 754. That shape is what people write to break a circular dependency. An
implementer who reads task.md and adds a static import may hit a cycle, and the failure may not
appear until the built CLI runs, because TypeScript tolerates cycles that ESM initialisation does
not. Establishing whether the cycle is real takes fifteen minutes and decides where the function
ends up.

fast-patch then applies to the deletion, which is nine lines and covered by existing tests.

`TDD` was rejected as the lead workflow: the function's behaviour is unchanged, so there is no new
test to fail first. Missing branch coverage is still added, but as protection, not as a driver.

`SDD` was rejected: no contract changes.

## Steps

### Research

1. Compare the two bodies byte for byte and record the result in `log.md`. If they have drifted,
   stop and report it: one of the two is wrong, and deciding which is a different task from
   deduplicating them.
2. Determine whether a static import from `judge-snapshot.ts` to `judge-enforcement.ts` creates a
   cycle. Record the finding and the dependency direction in `log.md`.
3. If a cycle exists, choose the resolution and record it: move `matchesBlockedPattern` to a leaf
   module both files can import, or keep the dynamic-import shape for this symbol too. Do not add a
   second dynamic import as a reflex; one in the codebase is already one too many.

### Protect

4. Confirm coverage for every branch before deleting anything: trailing-slash directory patterns,
   `*.ext` suffix, `name.*` prefix, exact segment match, full-path equality, and a path containing
   a backslash separator. Add tests for whatever is uncovered.

### Remove

5. Delete the copy at `src/judge-snapshot.ts:759` and import instead, applying the step 3 decision.
6. If the function moves, update `src/hook/index.ts:6` and confirm its call sites at lines 154 and
   215 still work.
7. Confirm `grep -rn "function matchesBlockedPattern" src` returns one line.
8. Build, then **run** the CLI on a command that exercises blocked patterns. Record the output in
   `log.md`. Compiling is not the check for a cycle.
9. Record this task's order relative to TASK-026 in task.md. Both restructure imports in these
   files.
10. `CHANGELOG.md`, additive only, continuations indented two spaces.
11. `pnpm lint && pnpm build && npx vitest run`, output recorded verbatim.

## Risks

- **A cycle that compiles and breaks at runtime.** ESM circular initialisation yields an undefined
  binding, which surfaces as "matchesBlockedPattern is not a function" the first time a snapshot is
  captured. `pnpm build` passing proves nothing here. Step 8 is the actual check.
- **This function is a security boundary.** It decides what is excluded from a judge snapshot and
  what the hook flags. A behavioural change disguised as a refactor weakens the blocked-read
  protection without any test failing, if the branch is uncovered. Step 4 exists for this.
- **The two bodies may have drifted.** They look identical, but "looks identical" is how drift
  survives. Step 1 makes it a check rather than an impression.
- **Deleting the wrong copy.** The exported one at `judge-enforcement.ts:553` is the survivor,
  because `hook/index.ts` already imports it. Deleting that one instead compiles fine and breaks
  the hook.
- TASK-026 touches the same import blocks. Sequenced badly, the two conflict on every line.
