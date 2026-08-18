# Review Checklist

## The false claim was corrected

- [ ] `log.md` contains the real `grep -rn "suggestedPathFor" src` output, showing one definition
      at `src/fs-utils.ts:37` and no copy in `doctor.ts`.
- [ ] task.md was corrected: the `suggestedPathFor` half is deleted or replaced with what the
      audit actually meant.
- [ ] No time was spent removing a duplicate that does not exist.

## The behaviour was pinned before merging

- [ ] `log.md` records the comparison of the two `readProjectName` bodies.
- [ ] Tests cover four inputs: `package.json` with a `name`, without one, no `package.json`,
      invalid JSON.
- [ ] If the two implementations disagreed on any input, the chosen behaviour is recorded and
      `CHANGELOG.md` treats it as a behaviour change, not a silent merge.

## The merge is clean

- [ ] `grep -rn "function readProjectName" src` returns exactly one line.
- [ ] Where the survivor lives is recorded, with the reasoning. `upgrade.ts` importing from
      `init.ts` was a deliberate choice if it was made, not the path of least resistance.
- [ ] `pnpm build` passes and the built CLI runs both `init` and `upgrade`. Output in `log.md`.
- [ ] No import cycle was introduced.

## Generated content is identical

- [ ] The snapshot tests under `tests/__snapshots__` pass **unmodified**. A re-baselined snapshot
      here hides the exact change this task must surface.
- [ ] `init` and `upgrade` write the same project name for the same repository as before.
- [ ] `tests/dogfood.test.ts` passes.

## Ordering

- [ ] This task's order relative to TASK-026 is recorded in task.md.

## Validation

- [ ] `pnpm lint && pnpm build && npx vitest run` passes, output recorded verbatim in `log.md`.
- [ ] `pnpm lint` reports zero errors and zero warnings.
- [ ] No test skipped to make the suite green.
- [ ] No Biome rule disabled, inline-ignored, or downgraded to reach a clean run.
- [ ] `CHANGELOG.md` purely additive, continuations indented two spaces.
