# Acceptance Criteria

## The dead exports are gone, and were proven dead first

- Removed: `b` (`src/format.ts:20`), `toPosix` (`src/fs-utils.ts:33`), `implementerAgentFiles`
  (`src/impl.ts:412`), `removeJudgeFiles` (`src/judge.ts:136`).
- Each removal is preceded by a recorded search across `src/`, `tests/`, `evals/`, `templates/`
  and `docs/`, with the result pasted into `log.md`. Hits under `evals/.cache/` are build
  artifacts of old commits and do not count as callers; `log.md` says so explicitly.
- `b` is a re-export risk, not only a definition: `src/cli/shared.ts:429` re-exports a list of
  format helpers. Confirm `b` is not in that list before removing it, and confirm nothing imports
  it through a namespace import.
- `removeJudgeFiles` is a removal path for installed agent files. Its absence of callers may be a
  gap rather than dead weight — an `akrctx judge disable` that keeps files behind is documented
  behaviour today. `log.md` records which of the two it is before the function is deleted.
- After the change, `pnpm build` produces no unused-export warning and the CLI starts.

## The rename is separated from the cleanup

- Renaming `akrctxConfig` and `akrctxPolicy` in `src/types.ts` touches 42 and 13 call sites
  respectively. Mixed into the same diff as four one-line deletions, it makes the deletions
  impossible to review.
- The rename is delivered as its own commit at minimum, and preferably as its own capsule. Which
  of the two is chosen is recorded under `## Clarifications` in task.md before implementation.
- If the rename stays in this task, it is mechanical only: no interface member is added, removed,
  renamed or retyped in the same pass.
- Consistency is checked, not assumed. `akrctxManifest` in `src/manifest.ts:17` has the same
  lowercase shape. Either it is renamed too or task.md says why it is excluded. Renaming two of
  three leaves the codebase no more consistent than before.

## Nothing behavioural moved

- No runtime behaviour changes. No CLI output changes. No file is written to a different path.
- `pnpm test` passes with no test modified, except where a test imports a renamed type.
- `tests/dogfood.test.ts` still passes.
- The public surface of the published package is unchanged. `dist/index.d.ts` is compared before
  and after; any removed type export is intentional and named in `CHANGELOG.md`.

## Validation

- `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- `pnpm lint` reports zero errors and zero warnings.
- `log.md` contains the reference searches for all four removals, verbatim.
- `CHANGELOG.md` records the removals under the unreleased section, additive only, continuations
  indented two spaces. Removed type exports are listed by name.
