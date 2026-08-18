# Review Checklist

## The premise still holds

- [ ] `package.json` still has no `main`, `exports` or `types` entry.
- [ ] `dist/index.d.ts` still contains nothing but the shebang. If it does not, this became a
      breaking change and `CHANGELOG.md` says so.

## The rename is complete

- [ ] The search across `src`, `tests`, `evals` (excluding `.cache/`), `docs`, `README.md` and
      `TUTORIAL.md` returns nothing for all three old names.
- [ ] The three interfaces are declared as `AkrctxConfig`, `AkrctxPolicy`, `AkrctxManifest`.
- [ ] No compatibility alias was left behind.
- [ ] No occurrence inside a string or a comment was missed. The compiler does not catch those.
- [ ] Nothing under `evals/.cache/` was edited. Those are old commits, not call sites.

## The diff is only the substitution

- [ ] The diff was read end to end looking for edits that are not the rename.
- [ ] No interface member added, removed, renamed or retyped.
- [ ] No import reordered, no line reflowed, no comment reworded.
- [ ] No unrelated "while I was in here" fix rode along. This is the failure mode of this task.
- [ ] `git diff --stat` touches only files referencing one of the three types.

## Nothing broke

- [ ] `pnpm build` passes and the built CLI starts.
- [ ] `pnpm test` passes with **no test modified**.
- [ ] `tests/dogfood.test.ts` passes.

## Validation

- [ ] `pnpm lint && pnpm build && npx vitest run` passes, output recorded verbatim in `log.md`.
- [ ] `pnpm lint` reports zero errors and zero warnings.
- [ ] No test skipped to make the suite green.
- [ ] No Biome rule disabled, inline-ignored, or downgraded to reach a clean run.
- [ ] `CHANGELOG.md` purely additive, continuations indented two spaces, and it states that no
      consumer is affected.
