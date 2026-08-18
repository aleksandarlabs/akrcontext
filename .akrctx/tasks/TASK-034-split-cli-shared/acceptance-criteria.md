# Acceptance Criteria

## The task's own numbers are corrected first

- task.md says `src/cli/shared.ts` is "~200 lines". It is **429**. The estimate is corrected before
  implementation, because the split proposed for a 200-line file is not the split a 429-line file
  needs.
- The "no file exceeds ~100 lines" criterion is dropped or replaced. Five of the printers exceed
  that on their own (`printInit` spans lines 125-220, `printDoctor` 243-287,
  `printDoctorCi` 288-336, `printTemplateApply` 74-124). Meeting an arbitrary line count would mean
  splitting one printer across two files, which is worse than the problem.
- The replacement criterion is stated in terms of responsibility: each new module has a single
  reason to change, and that reason is written at the top of the file in one sentence.

## The contradiction in task.md is resolved

- task.md's Solution proposes moving CI verdict logic to `cli/ci-verdict.ts`. Its Out Of Scope
  forbids "moving CI verdict logic to core". Those are compatible only if "core" means `src/` and
  not `src/cli/`, and that is not obvious to a reader.
- Before implementation, task.md states plainly whether `doctorCiFailed` and `doctorCiFailures`
  (lines 337-353) move within `cli/` or stay put. Both are defensible; ambiguity is not.

## The split follows the seams that exist

- The current file holds four distinct things, and the boundaries are already visible:
  - CLI wiring: `addCommon` (5), `normalizeOptions` (17)
  - parsing helpers: `splitList` (48), `parseValidation` (56)
  - printers: `printAgentModels`, `printAgentWarnings`, `printTemplateApply`, `printInit`,
    `printGroupedWrites`, `printDoctor`, `printDoctorCi`, `printWriteGroup`, `buildReadinessBar`,
    `targetLabel`, `doctorPromptFor`, plus `ln`/`log`
  - IO and verdicts: `readStdin` (398), `doctorCiFailed`/`doctorCiFailures`
- The split respects those groupings. A module mixing two of them needs a stated reason.
- The `export { bold, cmd, dim, ... }` re-export at line 429 is preserved or deliberately removed.
  If removed, every consumer is updated in the same change, and TASK-028's removal of `b` is
  sequenced against this task so the two do not conflict.

## Every consumer still compiles and behaves

- All importers of `cli/shared.ts` are enumerated in `log.md` before the split.
- Whether `shared.ts` survives as a re-export shim is decided, not left to fall out. A shim keeps
  the diff small and keeps the dumping ground alive under a new name; deleting it forces every
  import to be updated and is the honest end state. task.md states which.
- `pnpm build` passes and `dist/index.d.ts` is compared before and after. Any change to the
  published type surface is intentional and recorded.

## No output changes

- This is presentation code. A single changed space or colour is a user-visible regression.
- The snapshot tests under `tests/__snapshots__` pass **unmodified**. A regenerated snapshot in
  this task means the refactor was not pure.
- `tests/cli.test.ts` passes unmodified.
- The built CLI is run for the commands whose printers moved — at minimum `init --dry-run`,
  `doctor`, `doctor --json`, `doctor --ci`, `templates apply --dry-run` — and the output is compared
  against a capture taken before the change. The comparison goes in `log.md`.

## Ordering against neighbouring tasks

- TASK-035 moves judge printers, TASK-026 changes imports, TASK-028 removes `b`. All three touch
  this file or its consumers. The order is recorded in task.md before implementation.

## Validation

- `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- `pnpm lint` reports zero errors and zero warnings.
- `CHANGELOG.md` records the refactor under the unreleased section, additive only, continuations
  indented two spaces.
