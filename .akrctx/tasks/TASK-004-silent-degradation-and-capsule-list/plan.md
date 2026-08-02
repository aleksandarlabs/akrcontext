# Plan

## Workflow

TDD

## Steps

1. Write failing tests for each acceptance criterion group, and confirm each fails for
   the intended reason rather than by accident:
   - (a) corrupt config → `readConfig` throws; `runTask` rejects; `doctor` still runs.
   - (b) non-object and target-less configs → `normalizeConfig` throws; `doctor` reports.
   - (d) `judge scope` against a capsule copied from `_template`.
2. (d) first, because it is the smallest and unblocks nothing else: add `capsuleFiles`
   to `src/harness-files.ts`, derive `neutralRequired` from it, import it in
   `judge-enforcement.ts` and `task.ts`, and add the fifth `_template` file to
   `templates/wiki.ts`. Check no import cycle: `harness-files.ts` imports only
   `types.js`, so `judge-enforcement.ts` importing it stays acyclic.
3. (a): give `readConfig` the strict semantics and delete `readConfigStrict`, updating
   its call sites. Add one explicitly named tolerant reader for `doctor`'s `readProfile`
   with a comment stating why exactly one caller may swallow the error.
4. (b): make `normalizeConfig` throw for non-objects and for a config with no
   recognizable target. Add the missing targets gap to `doctor`'s `getConfigGaps`.
5. Run `pnpm test` and `pnpm lint`.
6. Repair this repository's own `_template` capsule with `akrctx doctor --fix` so the
   installed harness matches the new required list.
7. Complete the review checklist, then offer the judge.

## Risks

- Making `readConfig` throw changes the behavior of six call sites at once. `doctor` is
  the one that must not throw; if any other command turns out to need tolerance, that is
  a finding to record rather than a reason to restore the silent default.
- Growing `neutralRequired` makes existing installations report one missing file until
  `doctor --fix` or `upgrade` runs. That is the intended signal, and `upgrade` already
  creates missing task-template files without overwriting project content.
