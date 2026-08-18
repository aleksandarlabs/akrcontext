# Acceptance Criteria

## The traversal is closed

- Every `impl` entry point that accepts a task ID validates it before any path is built from it:
  `runImplStart`, `runImplLog`, and `runImplStatus` in `src/impl.ts`.
- Validation happens before `implLogPath` is called, not after. A rejected ID never reaches
  `path.join`, so no directory is created and no file is read on the rejected path.
- A test proves the property directly for each of the three commands: pass `../../../../tmp/pwn`,
  assert the call throws, and assert nothing was written outside the project root.
- A test covers the traversal shapes that are not a leading `..`: an absolute path, a segment
  containing `..` in the middle, a Windows-style separator, and an empty string.

## Validation is shared, not copied

- `requireTaskId` is not duplicated. It currently lives at `src/judge-enforcement.ts:576` and is
  **not exported**, so this task either exports it or moves it to a module both callers import.
  Whichever is chosen, exactly one definition exists afterwards. `grep -rn "function requireTaskId" src`
  returns one line.
- If `requireTaskId` moves, `judge-enforcement.ts` imports it rather than keeping a copy, and its
  existing caller at `src/judge-enforcement.ts:58` behaves unchanged.
- No import cycle is introduced. `pnpm build` passes and the CLI starts.

## The accepted ID format is decided, not inherited by accident

- The existing regex is `^TASK-[0-9]+$`. Task directories in this repository are named
  `TASK-023-fix-impl-path-traversal`. Whether `impl` accepts the bare ID, the full slug, or both
  is answered in writing under `## Clarifications` in task.md before implementation.
- Whichever answer is chosen, a test pins it: one case that must be accepted and one that must be
  rejected, both named after the decision.
- If the answer is "bare ID only", a test asserts the error message tells the user what form to
  use. A user who types the directory name must not be left guessing.

## Behaviour otherwise unchanged

- Valid IDs still work: `impl start`, `impl log`, and `impl status` succeed on a well-formed ID
  and write to the same paths as before.
- `impl enable` and `impl disable` take no task ID and are untouched.
- `judge` and `compile` validation behaviour is unchanged. Their existing tests pass without
  modification.
- The error message names the offending input and says the ID is invalid. It does not echo an
  attacker-supplied path into a shell-quoted or path-like context.

## Validation

- `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- `pnpm lint` reports zero errors and zero warnings.
- `CHANGELOG.md` records the fix under the unreleased section, additive only, continuations
  indented two spaces.
