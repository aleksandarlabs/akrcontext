# Review Checklist

## Each removal was proven, not assumed

- [ ] `log.md` contains the verbatim search output for `b`, `toPosix`, `implementerAgentFiles` and
      `removeJudgeFiles`, across `src/`, `tests/`, `evals/`, `templates/` and `docs/`.
- [ ] Hits under `evals/.cache/` are labelled as build artifacts of old commits, not as callers.
- [ ] `b` was checked against the re-export list at `src/cli/shared.ts:429` and against namespace
      imports, not only against direct named imports.
- [ ] `log.md` records whether `removeJudgeFiles` is dead code or an unfinished feature, with the
      reasoning. Deleting a gap is not the same as deleting dead weight.

## The removals are clean

- [ ] All four exports are gone.
- [ ] `pnpm build` passes and the built CLI starts.
- [ ] `dist/index.d.ts` was compared before and after. Every removed type export is intentional.
- [ ] `CHANGELOG.md` lists removed type exports by name — a consumer importing one will break.

## The rename did not swamp the review

- [ ] Where the rename ships — this task, its own commit, or its own capsule — is recorded under
      `## Clarifications`.
- [ ] If it shipped here, it is in a separate commit from the four deletions.
- [ ] `akrctxManifest` (`src/manifest.ts:17`) was handled or explicitly excluded with a reason.
      Renaming two of three types leaves the convention ambiguous.
- [ ] The rename is mechanical only: no interface member added, removed, renamed or retyped in the
      same pass.

## Nothing behavioural moved

- [ ] No runtime behaviour changed. No CLI output changed. No file written to a different path.
- [ ] `pnpm test` passes with no test modified, except where a test imports a renamed type.
- [ ] `tests/dogfood.test.ts` passes.

## Validation

- [ ] `pnpm lint && pnpm build && npx vitest run` passes, output recorded verbatim in `log.md`.
- [ ] `pnpm lint` reports zero errors and zero warnings.
- [ ] No test skipped to make the suite green.
- [ ] No Biome rule disabled, inline-ignored, or downgraded to reach a clean run.
- [ ] `CHANGELOG.md` purely additive, continuations indented two spaces.
