# Review Checklist

## Decisions were made before code

- [ ] The accepted ID format is recorded under `## Clarifications` in task.md, with the reasoning.
- [ ] Where `requireTaskId` lives is recorded, with the reason for choosing export over move or
      the reverse.

## The traversal is actually closed

- [ ] `runImplStart`, `runImplLog` and `runImplStatus` all validate. Verified by reading each
      handler, not by trusting the diff summary.
- [ ] Validation happens **before** `implLogPath` is called in every handler. Check the line
      order; a check placed after still throws and still fools a naive test.
- [ ] A test per handler asserts the throw **and** asserts a marker path outside the project root
      was not created.
- [ ] Tests cover: leading `..`, absolute path, `..` in a middle segment, backslash separator,
      empty string.
- [ ] The accept case and the reject case implied by the format decision are both pinned.
- [ ] Whether `implLogPath` itself should validate was considered, and the answer recorded. A
      fourth handler added later must not silently reopen this.

## One validator

- [ ] `grep -rn "function requireTaskId" src` returns exactly one line.
- [ ] `src/judge-enforcement.ts:58` still validates as before, and its tests pass unmodified.
- [ ] `pnpm build` passes **and** the built CLI starts. A cycle that compiles but breaks at
      runtime is the failure this box exists for.

## Nothing else moved

- [ ] Valid IDs still work for all three commands, verified against a scratch repository.
- [ ] `impl enable` and `impl disable` untouched.
- [ ] `judge` and `compile` validation behaviour unchanged; their tests pass unmodified.
- [ ] The error message names the input and states the expected form. It is not interpolated into
      a path-like or shell-quoted context.

## Validation

- [ ] `pnpm lint && pnpm build && npx vitest run` passes, output recorded verbatim in `log.md`.
- [ ] `pnpm lint` reports zero errors and zero warnings.
- [ ] `log.md` contains the real CLI output for the traversal inputs, not only the test result.
- [ ] No test skipped to make the suite green.
- [ ] No Biome rule disabled, inline-ignored, or downgraded to reach a clean run.
- [ ] `CHANGELOG.md` purely additive, continuations indented two spaces.
