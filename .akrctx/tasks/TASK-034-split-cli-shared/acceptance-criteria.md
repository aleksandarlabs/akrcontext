# Acceptance Criteria

## The task's own numbers are corrected first

- AC-1: task.md says `src/cli/shared.ts` is "~200 lines". It is **429**. The estimate is corrected before
  implementation, because the split proposed for a 200-line file is not the split a 429-line file
  needs.
- AC-2: The "no file exceeds ~100 lines" criterion is dropped or replaced. Five of the printers exceed
  that on their own (`printInit` spans lines 125-220, `printDoctor` 243-287,
  `printDoctorCi` 288-336, `printTemplateApply` 74-124). Meeting an arbitrary line count would mean
  splitting one printer across two files, which is worse than the problem.
- AC-3: The replacement criterion is stated in terms of responsibility: each new module has a single
  reason to change, and that reason is written at the top of the file in one sentence.

## The contradiction in task.md is resolved

- AC-4: task.md's Solution proposes moving CI verdict logic to `cli/ci-verdict.ts`. Its Out Of Scope
  forbids "moving CI verdict logic to core". Those are compatible only if "core" means `src/` and
  not `src/cli/`, and that is not obvious to a reader.
- AC-5: Before implementation, task.md states plainly whether `doctorCiFailed` and `doctorCiFailures`
  (lines 337-353) move within `cli/` or stay put. Both are defensible; ambiguity is not.

## The split follows the seams that exist

- AC-6: The current file holds four distinct things, and the boundaries are already visible:
  - CLI wiring: `addCommon` (5), `normalizeOptions` (17)
  - parsing helpers: `splitList` (48), `parseValidation` (56)
  - printers: `printAgentModels`, `printAgentWarnings`, `printTemplateApply`, `printInit`,
    `printGroupedWrites`, `printDoctor`, `printDoctorCi`, `printWriteGroup`, `buildReadinessBar`,
    `targetLabel`, `doctorPromptFor`, plus `ln`/`log`
  - IO and verdicts: `readStdin` (398), `doctorCiFailed`/`doctorCiFailures`
- AC-7: The split respects those groupings. A module mixing two of them needs a stated reason.
- AC-8: The `export { bold, cmd, dim, ... }` re-export at line 429 is preserved or deliberately removed.
  If removed, every consumer is updated in the same change, and TASK-028's removal of `b` is
  sequenced against this task so the two do not conflict.

## Every consumer still compiles and behaves

- AC-9: All importers of `cli/shared.ts` are enumerated in `log.md` before the split.
- AC-10: Whether `shared.ts` survives as a re-export shim is decided, not left to fall out. A shim keeps
  the diff small and keeps the dumping ground alive under a new name; deleting it forces every
  import to be updated and is the honest end state. task.md states which.
- AC-11: `pnpm build` passes and `dist/index.d.ts` is compared before and after. Any change to the
  published type surface is intentional and recorded.

## No output changes

- AC-12: This is presentation code. A single changed space or colour is a user-visible regression.
- AC-13: The snapshot tests under `tests/__snapshots__` pass **unmodified**. A regenerated snapshot in
  this task means the refactor was not pure.
- AC-14: `tests/cli.test.ts` passes unmodified.
- AC-15: The built CLI is run for the commands whose printers moved — at minimum `init --dry-run`,
  `doctor`, `doctor --json`, `doctor --ci`, `templates apply --dry-run` — and the output is compared
  against a capture taken before the change. The comparison goes in `log.md`.

## Ordering against neighbouring tasks

- AC-16: TASK-035 moves judge printers, TASK-026 changes imports, TASK-028 removes `b`. All three touch
  this file or its consumers. The order is recorded in task.md before implementation.

## Validation

- AC-17: `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- AC-18: `pnpm lint` reports zero errors and zero warnings.
- AC-19: `CHANGELOG.md` records the refactor under the unreleased section, additive only, continuations
  indented two spaces.
