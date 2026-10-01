# Acceptance Criteria

## The false half of this task is removed first

- AC-1: task.md claims `suggestedPathFor` is duplicated in `doctor.ts:394`. **It is not.** The function
  is defined once, at `src/fs-utils.ts:37`, and used from `src/template-apply.ts:4,160` and from
  `fs-utils.ts:60`. There is no copy in `doctor.ts`, and no reference to it there at all.
- AC-2: task.md is corrected before implementation: the `suggestedPathFor` half is deleted from the
  problem statement, or replaced with whatever the audit actually meant if that can be established.
- AC-3: The verification is recorded in `log.md`: `grep -rn "suggestedPathFor" src` with its real output.
  An implementer who takes task.md at face value will look for a duplicate that does not exist.

## The real duplication is removed

- AC-4: `readProjectName` is genuinely duplicated: `src/init.ts:379` and `src/upgrade.ts:370`.
- AC-5: The two bodies are compared before merging and the comparison is recorded. If they have drifted,
  the difference is a finding — one of the two is the wrong behaviour and which one wins is a
  decision, not a merge.
- AC-6: After the change, `grep -rn "function readProjectName" src` returns exactly one line.
- AC-7: The surviving definition lives where both callers can reach it without a cycle. `upgrade.ts`
  importing from `init.ts` couples an upgrade path to an install path; moving it to `fs-utils.ts`
  or a small shared module is the cleaner option, and whichever is chosen is stated in task.md.
- AC-8: `pnpm build` passes and the built CLI runs both `init` and `upgrade` against a scratch
  repository. The output is recorded in `log.md`.

## Project-name behaviour is unchanged

- AC-9: The name resolved for a repository is identical before and after, for every input shape the
  current implementations handle: a `package.json` with a `name`, a `package.json` without one,
  no `package.json`, and invalid JSON.
- AC-10: A test covers each of those four. If the two implementations disagreed on any of them, the test
  encodes the chosen answer and `CHANGELOG.md` records the behaviour change.
- AC-11: `init` and `upgrade` write the same generated content as before. The existing snapshot tests
  under `tests/__snapshots__` pass unmodified.

## Ordering against neighbouring tasks

- AC-12: TASK-026 also restructures imports across these files. The order of the two is recorded in
  task.md before implementation.

## Validation

- AC-13: `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- AC-14: `pnpm lint` reports zero errors and zero warnings.
- AC-15: `CHANGELOG.md` records the deduplication under the unreleased section, additive only,
  continuations indented two spaces.
