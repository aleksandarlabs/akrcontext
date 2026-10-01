# Acceptance Criteria

## The example record

- AC-1: `judgeInstructions` in `src/templates/judge.ts` ends with a complete, minimal example record
  rather than a prose list of field names.
- AC-2: The example carries every field `review.schema.json` requires: `schemaVersion`, `taskId`,
  `scope`, `verdict`, `tests`, `issues`, `reviewedAt`.
- AC-3: Each `tests` entry in the example shows the exact keys `command`, `status`, and `evidence`.
  The word `notes` appears nowhere in the instructions.
- AC-4: The example's `schemaVersion` is interpolated from `JUDGE_SCHEMA_VERSION`, not written as a
  literal. Changing that constant changes the rendered instructions with no further edit.
- AC-5: The instructions state that no keys beyond the schema's are accepted, matching the schema's
  `additionalProperties: false`.
- AC-6: The instructions state that `independent: false` is added only when the reviewer is
  non-independent, and that its absence means `true`.
- AC-7: The instructions keep saying the `scope` field carries the complete, unchanged output of
  `akrctx judge scope`, so the example's placeholder is not mistaken for the real shape.

## The example cannot drift

- AC-8: A test validates the embedded example against the same validation `akrctx judge verify` runs,
  not a reimplementation of it. If `validateRecord` must be exported from
  `src/judge-enforcement.ts` for this, exporting it is in scope; changing its behaviour is not.
- AC-9: The test fails if `JUDGE_SCHEMA_VERSION` changes without the example following, and fails if a
  required field is dropped from the example.
- AC-10: Placeholder values in the example (task ID, digests, commit refs) satisfy the schema's
  patterns, so the example validates as-is rather than only in spirit.

## Rendering

- AC-11: All three judge renderings (`claudeJudgeFile`, `copilotJudgeFile`, `codexJudgeFile`) carry the
  example.
- AC-12: The codex rendering's `.replace(/`/g, "'")` does not corrupt the example, and the rendered TOML
  `"""` block is not broken by any character the example introduces.
- AC-13: The example survives the codex rendering as valid JSON, or the instructions state plainly that
  quoting differs there. A silently mangled example is worse than none.

## Behaviour preserved

- AC-14: No change to `review.schema.json`, and `JUDGE_SCHEMA_VERSION` stays `2`.
- AC-15: No change to what `validateRecord` accepts or rejects. A record that verified before this task
  verifies after it, and one that failed still fails with the same reasons.
- AC-16: No change to verdict rules, APPROVED requirements, independence rules, snapshot flow, or
  `--run-tests` approval.
- AC-17: `src/templates/comprehension-agent.ts` is untouched.
- AC-18: No change under `src/cli/`.

## Dogfooded install

- AC-19: `.claude/agents/akrctx-judge.md` and `.codex/agents/akrctx-judge.toml` are regenerated from the
  templates and stay tracked; `tests/dogfood.test.ts` passes.
- AC-20: `.akrctx/manifest.json` hashes are updated for exactly those regenerated files and no others.

## Evidence it works

- AC-21: A record built by copying the embedded example and filling in real values passes
  `akrctx judge verify` with no hand-editing of the record.

## Documentation

- AC-22: `CHANGELOG.md` records the fix under the unreleased section, added as a new entry without
  altering any existing one, with continuation lines indented two spaces.

## Validation

- AC-23: `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- AC-24: `pnpm lint` reports zero errors and zero warnings. A warning that does not fail the exit code
  still counts as a failed criterion here: it is noise every future lint run carries.
