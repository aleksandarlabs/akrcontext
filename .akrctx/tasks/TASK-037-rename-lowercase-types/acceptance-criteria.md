# Acceptance Criteria

## The rename is complete

- AC-1: `grep -rn "\bakrctxConfig\b\|\bakrctxPolicy\b\|\bakrctxManifest\b" src tests evals docs README.md TUTORIAL.md`
  returns nothing. Hits under `evals/.cache/` are build artifacts of old commits and do not count.
- AC-2: The three interfaces are declared as `AkrctxConfig`, `AkrctxPolicy` and `AkrctxManifest`.
- AC-3: No compatibility alias remains. `export type akrctxConfig = AkrctxConfig` anywhere fails this
  criterion.
- AC-4: No other identifier was renamed. The diff contains exactly three declarations and their
  references.

## The diff is a pure substitution

- AC-5: No interface member was added, removed, renamed or retyped.
- AC-6: No import was reordered, no line reflowed, no comment reworded. A reviewer must be able to
  confirm this by scanning, which is the only thing that makes a 62-site diff reviewable.
- AC-7: `git diff --stat` touches only files that reference one of the three types.

## Nothing broke

- AC-8: `pnpm build` passes and the built CLI starts.
- AC-9: `pnpm test` passes with **no test modified**. Nothing in `tests/` names these types today, so a
  changed test means something outside the rename moved.
- AC-10: `tests/dogfood.test.ts` passes.
- AC-11: `dist/index.d.ts` is unchanged. If it has grown a type surface since task.md was written, the
  rename is a breaking change and `CHANGELOG.md` says so.

## Documentation

- AC-12: `CHANGELOG.md` records the rename under the unreleased section as an internal change, additive
  only, continuations indented two spaces. It states plainly that no consumer is affected, because
  the types were never exported.

## Validation

- AC-13: `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- AC-14: `pnpm lint` reports zero errors and zero warnings.
