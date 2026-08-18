# Acceptance Criteria

## The rename is complete

- `grep -rn "\bakrctxConfig\b\|\bakrctxPolicy\b\|\bakrctxManifest\b" src tests evals docs README.md TUTORIAL.md`
  returns nothing. Hits under `evals/.cache/` are build artifacts of old commits and do not count.
- The three interfaces are declared as `AkrctxConfig`, `AkrctxPolicy` and `AkrctxManifest`.
- No compatibility alias remains. `export type akrctxConfig = AkrctxConfig` anywhere fails this
  criterion.
- No other identifier was renamed. The diff contains exactly three declarations and their
  references.

## The diff is a pure substitution

- No interface member was added, removed, renamed or retyped.
- No import was reordered, no line reflowed, no comment reworded. A reviewer must be able to
  confirm this by scanning, which is the only thing that makes a 62-site diff reviewable.
- `git diff --stat` touches only files that reference one of the three types.

## Nothing broke

- `pnpm build` passes and the built CLI starts.
- `pnpm test` passes with **no test modified**. Nothing in `tests/` names these types today, so a
  changed test means something outside the rename moved.
- `tests/dogfood.test.ts` passes.
- `dist/index.d.ts` is unchanged. If it has grown a type surface since task.md was written, the
  rename is a breaking change and `CHANGELOG.md` says so.

## Documentation

- `CHANGELOG.md` records the rename under the unreleased section as an internal change, additive
  only, continuations indented two spaces. It states plainly that no consumer is affected, because
  the types were never exported.

## Validation

- `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- `pnpm lint` reports zero errors and zero warnings.
