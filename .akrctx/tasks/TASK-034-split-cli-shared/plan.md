# Plan

## Workflow

- SDD+TDD

## Why

`workflowRules` maps `apiOrContract` to SDD+TDD.

SDD applies because the deliverable is a set of module boundaries, and boundaries are a design
artifact. Deciding them while editing produces the same dumping ground under four names. Two
questions in particular must be settled on paper: where each of the four concerns lives, and
whether `shared.ts` survives as a re-export shim. A shim keeps the diff small and keeps the
problem alive; deleting it forces every import to be updated and is the honest end state. That is
a design decision, not a refactoring detail.

TDD applies in its characterization form. This is presentation code, and a single changed space or
colour is a user-visible regression that no type checker sees. The safety mechanism is a captured
output comparison built **before** anything moves.

`fast-patch` was rejected: 429 lines across four concerns with a published type surface attached
is not a small safe patch.

`research-first` was rejected: the file is readable and the seams are visible. Nothing needs
discovering, only deciding.

## Steps

### Correct the task

1. Fix the size figure in task.md: `src/cli/shared.ts` is 429 lines, not "~200".
2. Drop or replace the "no file exceeds ~100 lines" criterion. `printInit` alone spans lines
   125-220. Meeting the number would mean splitting one printer across two files.
3. Resolve the contradiction: the Solution proposes `cli/ci-verdict.ts` while Out Of Scope forbids
   moving CI verdict logic to core. State plainly whether `doctorCiFailed` and `doctorCiFailures`
   (lines 337-353) move within `cli/` or stay put.

### Design

4. Write the target module list in task.md, with one sentence per module saying its single reason
   to change. The four concerns already visible in the file are:
   - wiring: `addCommon` (5), `normalizeOptions` (17)
   - parsing: `splitList` (48), `parseValidation` (56)
   - printers: the eleven `print*`/`build*`/`targetLabel`/`doctorPromptFor` functions, plus
     `ln`/`log`
   - IO and verdicts: `readStdin` (398), `doctorCiFailed`, `doctorCiFailures`
5. Decide the shim question and record it.
6. Decide what happens to the `export { bold, cmd, dim, ... }` re-export at line 429. Sequence
   against TASK-028, which removes `b`.

### Build the safety net

7. Enumerate every importer of `cli/shared.ts` in `log.md`.
8. Capture the output of the affected commands against a scratch repository **before** any change:
   at minimum `init --dry-run`, `doctor`, `doctor --json`, `doctor --ci`,
   `templates apply --dry-run`. Store the captures.
9. Capture `dist/index.d.ts` before the change.

### Move

10. Move code without editing it. A rename, a reflow or a "small improvement" during the move is
    what makes the diff unreviewable and the output comparison ambiguous.
11. Update importers according to the shim decision.

### Verify

12. Re-capture the command outputs and diff against step 8. The diff must be empty.
13. Diff `dist/index.d.ts` against step 9. Any change is intentional and recorded.
14. Confirm the snapshots under `tests/__snapshots__` and `tests/cli.test.ts` pass **unmodified**.
15. Record ordering against TASK-026, TASK-028 and TASK-035 in task.md.
16. `CHANGELOG.md`, additive only, continuations indented two spaces.
17. `pnpm lint && pnpm build && npx vitest run`, output recorded verbatim.

## Risks

- **Improving code during the move.** The strongest temptation in this task and the one that
  breaks it. Any edit mixed into a move makes the empty-diff check meaningless, and there is no
  other check.
- **A chased line count producing worse modules.** Splitting `printInit` to satisfy an arbitrary
  threshold makes one coherent function into two halves of nothing. Step 2 removes the pressure.
- **The shim that never dies.** Keeping `shared.ts` as a re-export is the low-friction choice, and
  in a year it will have accumulated new functions again, because a file that exports everything
  is the natural place to put anything.
- **Silent presentation regressions.** Types do not check spacing, colour or ordering. Only the
  captured comparison does, and it must be taken before the first move.
- **Three neighbouring capsules touch these files.** TASK-035 may add judge printers here,
  TASK-026 changes imports, TASK-028 removes `b`. Unsequenced, they conflict continuously.
- The published type surface travels through `dist/index.d.ts`. A moved export that stops being
  exported is a breaking change for consumers, invisible inside this repository.
