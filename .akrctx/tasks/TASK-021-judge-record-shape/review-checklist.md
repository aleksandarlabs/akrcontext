# Review Checklist

## The bug is actually fixed

- [x] A record built by copying the embedded example and filling in real values passes
      `akrctx judge verify` with no hand-editing.
- [x] The word `notes` appears nowhere in `judgeInstructions`.
- [x] The example shows `tests` entries with exactly `command`, `status`, `evidence`.

## The example cannot drift

- [x] `schemaVersion` is interpolated from `JUDGE_SCHEMA_VERSION`, not a literal `2`.
- [x] Both occurrences are covered: top-level and inside `scope`.
- [x] A test validates the example against the same validation `judge verify` runs, not a
      reimplementation.
- [x] The test fails if `JUDGE_SCHEMA_VERSION` changes without the example following.
- [x] Placeholder values satisfy the schema's patterns, so the example validates as-is.

## Completeness

- [x] Every required field is present: `schemaVersion`, `taskId`, `scope`, `verdict`, `tests`,
      `issues`, `reviewedAt`.
- [x] The instructions state no extra keys are accepted.
- [x] `independent: false` is explained as conditional, absence meaning `true`.
- [x] The instruction to copy `akrctx judge scope` output verbatim into `scope` survived, and the
      example's placeholder cannot be mistaken for the literal value to emit.

## Rendering

- [x] All three judge renderings carry the example.
- [x] The codex backtick substitution does not corrupt it and the TOML `"""` block is intact.
- [x] The example is still valid JSON after the codex rendering, or the divergence is stated.

## Nothing else moved

- [x] `review.schema.json` unchanged; `JUDGE_SCHEMA_VERSION` still `2`.
- [x] `validateRecord` behaviour unchanged — exported at most, never altered.
- [x] A previously valid record still verifies; a previously invalid one fails with the same
      reasons.
- [x] `comprehension-agent.ts` untouched.
- [x] No change under `src/cli/`.

## Dogfood

- [x] Agent files regenerated, not hand-edited; `tests/dogfood.test.ts` passes.
- [x] Manifest moved for exactly those two files.

## Documentation

- [x] `CHANGELOG.md` gains a new entry with no existing entry altered, continuations indented
      two spaces. This is the mistake TASK-020 made; verify the diff is purely additive.

## Validation

- [x] `pnpm lint && pnpm build && npx vitest run` passes, output recorded verbatim.
- [x] `pnpm lint` reports zero errors **and** zero warnings.
- [x] No test skipped to make the suite green.
- [x] No Biome rule disabled, inlined-ignored, or downgraded in `biome.json` to reach a clean
      run.