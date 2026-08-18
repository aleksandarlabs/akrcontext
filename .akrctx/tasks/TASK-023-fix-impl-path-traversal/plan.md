# Plan

## Workflow

- TDD

## Why

`workflowRules` maps `bugfix` to TDD, and this is the shape TDD was made for: the defect is
expressible as a failing test in one line, and the fix is unambiguous once the test exists.

The reason to write the test first here is not ceremony. Path traversal fixes are easy to write
in a way that looks right and is not — validating after the path is built, validating one entry
point and missing two, or rejecting `../` while accepting an absolute path. A test that writes to
a marker location outside the project root and asserts it stays empty catches all three; reading
the diff does not.

`fast-patch` was rejected despite the fix being four lines. The traversal reaches the filesystem,
and `impl` writes under `.akrctx/local/`, which is deliberately outside Git's view. A bad fix
here fails silently.

`research-first` is not needed: the vulnerable code, the existing validator and the callers are
all identified. One question is open (which ID format `impl` accepts), and it is answered by
reading two files, not by research.

## Steps

1. Settle the ID format question before writing anything. Read `src/cli/impl.ts:88,135,161` and
   the `akrctx-task` skill to establish what a user actually types. Record the answer under
   `## Clarifications` in task.md. This decides what the test asserts, so it cannot come later.
2. Decide where the shared validator lives. `requireTaskId` at `src/judge-enforcement.ts:576` is
   module-private today. Exporting it makes `impl.ts` depend on the judge module for a string
   check; moving it to a leaf module does not. Pick one and record it.
3. Write the failing tests first, one per entry point — `runImplStart`, `runImplLog`,
   `runImplStatus` — each asserting the call throws and that a marker path outside the project
   root was not created.
4. Add the traversal shapes as separate cases: absolute path, `..` in a middle segment, backslash
   separator, empty string.
5. Add the accept case matching the decision from step 1, and the reject case that decision
   implies.
6. Implement: validate at the top of each handler, before `implLogPath` is reached.
7. Apply the decision from step 2. Confirm exactly one definition of `requireTaskId` remains.
8. Run the built CLI against the traversal inputs by hand and paste the output into `log.md`. The
   unit test proves the throw; this proves the user sees a usable message.
9. `CHANGELOG.md`, additive only, continuations indented two spaces.
10. `pnpm lint && pnpm build && npx vitest run`, output recorded verbatim.

## Risks

- **Validating in the wrong place looks identical in review.** A check placed after
  `implLogPath(taskId)` still throws and still passes a naive test, while the path has already
  been built. The test asserts on the filesystem for this reason, not on the exception alone.
- **Missing an entry point.** Three handlers take a task ID today. If a fourth is added later
  without validation, nothing catches it. Consider whether validation belongs inside
  `implLogPath` itself, where every caller gets it — and if it does not, record why.
- **The regex may be wrong for `impl`.** `^TASK-[0-9]+$` rejects `TASK-023-fix-impl-path-traversal`,
  which is what the task directories are actually called. Applying it blindly could turn a security
  fix into a broken command. Step 1 exists to stop that.
- **Error messages that echo attacker input.** The message names the offending ID, which is correct
  for usability. It must not be interpolated anywhere that treats it as a path or a shell fragment.
- Moving `requireTaskId` risks an import cycle. `pnpm build` compiling is not proof; run the CLI.
