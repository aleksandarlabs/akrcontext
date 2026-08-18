# Plan

## Workflow

- TDD

## Why

`workflowRules` maps `bugfix` to TDD. This is a refactor, but the TDD reason holds for the same
mechanism: two implementations of `readProjectName` exist, and merging them means one of the two
behaviours disappears. Which one, and whether anyone notices, is only answerable if the behaviour
is pinned by tests first.

The two bodies may agree on the common case and differ on the edges — a `package.json` without a
`name`, no `package.json`, invalid JSON. Those edges decide what akrctx writes into generated
instruction files during `init` and `upgrade`. Merging first and testing after would encode
whichever behaviour survived, without anyone choosing it.

`fast-patch` was rejected for that reason. Deleting nine lines is small; silently changing what
`upgrade` writes into a user's `CLAUDE.md` is not.

`research-first` was rejected: reading two functions is not research. But this plan starts with a
correction, because task.md contains a claim that is false.

## Steps

### Correct the task first

1. Verify the `suggestedPathFor` claim and record the result in `log.md`. `grep -rn
   "suggestedPathFor" src` shows the function defined once at `src/fs-utils.ts:37` and used from
   `src/template-apply.ts:4,160` and `fs-utils.ts:60`. There is **no** copy in `doctor.ts` and no
   reference to it there.
2. Correct task.md: delete the `suggestedPathFor` half of the problem statement. The audit note it
   came from is no longer kept, so there is nothing to recover the original intent from, and an
   implementer working from the current text will search for a duplicate that does not exist.

### Pin the behaviour

3. Compare the two `readProjectName` bodies — `src/init.ts:379` and `src/upgrade.ts:370` — and
   record the comparison in `log.md`.
4. Write tests for both implementations across four inputs: a `package.json` with a `name`, one
   without, no `package.json` at all, and invalid JSON.
5. If they disagree on any input, stop and decide which behaviour is correct. Record the decision
   and treat it as a behaviour change in `CHANGELOG.md`, not as a silent merge.

### Merge

6. Decide where the survivor lives. `upgrade.ts` importing from `init.ts` couples the upgrade path
   to the install path; moving it to `fs-utils.ts` or a small shared module does not. Record the
   choice in task.md.
7. Delete the duplicate and import. Confirm `grep -rn "function readProjectName" src` returns one
   line.
8. Record this task's order relative to TASK-026 in task.md; both restructure imports here.

### Prove

9. Run the built CLI's `init` and `upgrade` against a scratch repository and record the output in
   `log.md`.
10. Confirm the snapshot tests under `tests/__snapshots__` pass unmodified. Generated content must
    be identical.
11. `CHANGELOG.md`, additive only, continuations indented two spaces.
12. `pnpm lint && pnpm build && npx vitest run`, output recorded verbatim.

## Risks

- **task.md is wrong and will send the implementer looking for nothing.** Step 1 and 2 exist to
  stop that. An unverified audit finding is a hypothesis, not a defect.
- **The edge cases are where the two will differ**, and they are the cases nobody tests by hand.
  A project without a `name` in its `package.json` is common enough to matter.
- **Generated content is user-visible.** `readProjectName` feeds text written into a user's
  instruction files. A changed fallback string changes what `upgrade` writes for everyone.
- **Coupling upgrade to init.** The lazy merge is `upgrade.ts` importing from `init.ts`, which
  works and makes the dependency graph worse. Step 6 is a real choice.
- Re-baselining a snapshot to make the merge pass would hide exactly the behaviour change this
  plan exists to surface.
