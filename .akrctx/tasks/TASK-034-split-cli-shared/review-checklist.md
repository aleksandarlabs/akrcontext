# Review Checklist

## The task was corrected before it was implemented

- [ ] The size figure in task.md says 429 lines, not "~200".
- [ ] The "no file exceeds ~100 lines" criterion was dropped or replaced with a
      responsibility-based one.
- [ ] The Solution / Out Of Scope contradiction about CI verdict logic is resolved in writing.

## The boundaries were designed

- [ ] task.md lists the target modules, each with one sentence stating its single reason to
      change.
- [ ] The shim question is answered: `shared.ts` survives as a re-export or is deleted, and the
      choice is justified.
- [ ] What happens to the `export { bold, cmd, dim, ... }` re-export at line 429 is decided, and
      sequenced against TASK-028's removal of `b`.
- [ ] No module mixes two of the four concerns without a stated reason.

## Output is byte-identical

- [ ] Command outputs were captured **before** the first move. Captures exist.
- [ ] The re-capture diff is empty for `init --dry-run`, `doctor`, `doctor --json`, `doctor --ci`
      and `templates apply --dry-run`. The diff is in `log.md`.
- [ ] Snapshots under `tests/__snapshots__` pass **unmodified**. A regenerated snapshot means the
      refactor was not pure.
- [ ] `tests/cli.test.ts` passes unmodified.

## Code was moved, not edited

- [ ] No rename, reflow or "small improvement" rode along with the move. Verified by reading the
      diff, not by trusting the description — an edit mixed into a move makes the empty-diff check
      meaningless.
- [ ] All importers of `cli/shared.ts` were enumerated in `log.md` before the change, and all were
      updated.

## The published surface is intact

- [ ] `dist/index.d.ts` was captured before and diffed after.
- [ ] Any change to the type surface is intentional and recorded in `CHANGELOG.md`.
- [ ] `pnpm build` passes and the built CLI starts.

## Ordering

- [ ] Order relative to TASK-026, TASK-028 and TASK-035 is recorded in task.md.

## Validation

- [ ] `pnpm lint && pnpm build && npx vitest run` passes, output recorded verbatim in `log.md`.
- [ ] `pnpm lint` reports zero errors and zero warnings.
- [ ] No test skipped to make the suite green.
- [ ] No Biome rule disabled, inline-ignored, or downgraded to reach a clean run.
- [ ] `CHANGELOG.md` purely additive, continuations indented two spaces.
