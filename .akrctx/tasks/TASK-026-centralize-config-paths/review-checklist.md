# Review Checklist

## Research came first

- [ ] `log.md` contains the table classifying every `.akrctx/` literal in `src/` as path
      construction or message text.
- [ ] The doctor gap messages were captured before the change.
- [ ] Where the constants live is recorded, including whether `manifestPath` joined them and why.
- [ ] The import-cycle check was done before writing imports, and its result is recorded.

## Only paths moved

- [ ] Message strings in `doctor.ts` (lines 259-295, 312, 361-379) keep their literal text.
- [ ] The doctor gap messages are byte-identical to the capture from before the change. Compared,
      not assumed.
- [ ] A test covers the gap text. If the existing snapshots did not cover it, one was added.
- [ ] Every replaced occurrence is a `path.join` argument or equivalent.

## The constants are the single source

- [ ] `grep -rn '"\.akrctx/' src` shows only definitions and message strings. Every remaining hit
      is listed in task.md with its reason.
- [ ] `configPath` is exported from `src/config.ts` and imported by the consumers.
- [ ] `src/manifest.ts:7` was handled deliberately — moved or explicitly excluded with a reason.
      Two conventions for the same thing is the defect this task exists to fix.

## No cycle, no behaviour change

- [ ] `pnpm build` passes **and** the built CLI starts. Compiling is not the check.
- [ ] No dynamic import was added to dodge a cycle.
- [ ] `pnpm test` passes with **no test modified**. A changed test means the refactor was not pure.
- [ ] `tests/dogfood.test.ts` passes.
- [ ] No file is read from a different location. No CLI output changes.

## Ordering

- [ ] This task's position relative to TASK-029, TASK-033, TASK-034 and TASK-035 is recorded in
      task.md.

## Validation

- [ ] `pnpm lint && pnpm build && npx vitest run` passes, output recorded verbatim in `log.md`.
- [ ] `pnpm lint` reports zero errors and zero warnings.
- [ ] No test skipped to make the suite green.
- [ ] No Biome rule disabled, inline-ignored, or downgraded to reach a clean run.
- [ ] `CHANGELOG.md` purely additive, continuations indented two spaces.
