# Plan

## Workflow

- fast-patch for the removals, then a separate decision for the rename

## Why

`workflowRules` maps `smallSafePatch` to fast-patch. Deleting four unreferenced exports is exactly
that: the compiler proves the claim, and a wrong deletion fails `pnpm build` immediately rather
than silently.

The rename is not a small safe patch and does not belong in the same workflow. `akrctxConfig` has
42 call sites and `akrctxPolicy` has 13. Mixed into the same diff as four one-line deletions, the
deletions become unreviewable — the reviewer scrolls past 55 mechanical edits looking for the four
that matter. That is a real cost paid for no benefit, since the two changes share nothing but a
line in an audit report.

`TDD` was rejected: there is no behaviour to drive out. The test for "this export is gone" is the
build.

`research-first` was rejected: the searches are the work, and they take minutes.

## Steps

### Prove the claim

1. Search for each symbol across `src/`, `tests/`, `evals/`, `templates/` and `docs/`. Paste the
   real output into `log.md`. Hits under `evals/.cache/` are build artifacts of old commits; state
   that explicitly rather than leaving a reader to wonder.
2. Check `b` separately as a re-export risk. `src/cli/shared.ts:429` re-exports a list of format
   helpers; confirm `b` is not in it, and confirm nothing imports the module as a namespace.
3. Decide what `removeJudgeFiles` is. A function that removes installed judge agent files, with no
   callers, may be a missing feature rather than dead weight — `judge disable` currently keeps the
   files and tells the user to remove them by hand. Record which of the two it is in `log.md`
   before deleting it. Deleting a gap is not the same as deleting dead code.

### Remove

4. Delete the four exports. Confirm `pnpm build` passes and the CLI starts.
5. Compare `dist/index.d.ts` before and after. Any removed type export is intentional and named.

### Rename, or defer it

6. Decide whether the rename ships in this task, in its own commit, or in its own capsule. Record
   the answer under `## Clarifications` in task.md.
7. If it ships here: check `akrctxManifest` (`src/manifest.ts:17`) too. Renaming two of three
   leaves the codebase no more consistent than it started, which wastes the churn.
8. Rename mechanically. No interface member is added, removed, renamed or retyped in the same
   pass.

### Close out

9. `CHANGELOG.md`, additive only, continuations indented two spaces. Removed type exports are
   listed by name — a consumer importing one will break.
10. `pnpm lint && pnpm build && npx vitest run`, output recorded verbatim.

## Risks

- **A published type export is a public API.** `types.ts` symbols reach consumers through
  `dist/index.d.ts`. Removing or renaming one is a breaking change for anyone importing it, even
  if nothing inside this repository uses it. Step 5 exists to see that before it ships.
- **`removeJudgeFiles` may be a gap, not dead code.** Deleting it closes the door on a feature
  someone started, and the next person will re-implement it. Step 3 is a judgement call, not a
  search.
- **The rename swamps the review.** This is the most likely way for this task to go wrong: not a
  bad edit, but a diff nobody can read, in which a bad edit hides.
- **A partial rename is worse than none.** Three types share the lowercase convention. Fixing two
  leaves a reader unsure which convention is current.
- Grep hits inside `evals/.cache/` will look like real callers to anyone reading the search output
  quickly. Label them in `log.md`.
