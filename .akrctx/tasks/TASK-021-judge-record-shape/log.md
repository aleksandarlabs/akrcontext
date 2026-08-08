# Implementation log — TASK-021

## What changed

- `src/templates/judge.ts`: replaced the closing prose paragraph of `judgeInstructions`
  (which named top-level keys only) with a complete, minimal example record embedded in a
  ```json fenced block. Added an `import { JUDGE_SCHEMA_VERSION }` and a new exported
  `judgeExampleRecord` const built via `JSON.stringify`, so `schemaVersion` (top-level and
  inside `scope`) is interpolated from the same constant the schema is generated from — not
  a literal `2`. Surrounding sentences kept: the read-only caller flow, `verify --run-tests`,
  the ban on the implementing agent's narrative, the instruction to copy `akrctx judge scope`
  output verbatim into `scope`, and the `independent: false` conditional (absence means `true`).
  Added: "no other keys are accepted", and "each `tests` entry has exactly `command`,
  `status`, and `evidence`; no other key is accepted there either". The word `notes` appears
  nowhere in the instructions — the example showing `evidence` is what teaches the right key,
  without priming the agent with the wrong one.

- `src/judge-enforcement.ts`: exported `validateRecord` (keyword change only; behaviour
  unchanged). This is the same validator `akrctx judge verify` runs, so the test exercises the
  real contract, not a reimplementation.

- `tests/agent-templates.test.ts`: added a test that parses `judgeExampleRecord` and asserts
  `validateRecord(...)` returns `[]`, both `schemaVersion` values equal `JUDGE_SCHEMA_VERSION`,
  and each `tests` entry has exactly `command`, `evidence`, `status`. Added a rendering
  assertion across all three renderers that the example is embedded verbatim, that `"notes"`
  never appears, and that `"evidence"` and the `"independent": false` conditional do.

- Dogfooded install: regenerated `.claude/agents/akrctx-judge.md` and
  `.codex/agents/akrctx-judge.toml` from the templates, and updated `.akrctx/manifest.json`
  hashes for exactly those two files. No other manifest entry moved. Pre-existing drift in
  `.akrctx/judge/README.md` and the `akrctx-workflow` skill copies was left untouched (it
  predates this task and is out of scope; `akrctx upgrade` would fix it separately).

- `CHANGELOG.md`: new `### Fixed` section under `[Unreleased]`, purely additive, continuation
  lines indented two spaces.

## Behaviour preserved

- `review.schema.json` unchanged; `JUDGE_SCHEMA_VERSION` stays `2`.
- `validateRecord` accepts/rejects the same shapes as before (exported, not altered).
- `comprehension-agent.ts` untouched; no change under `src/cli/`.
- Verdict rules, APPROVED requirements, independence rules, snapshot flow, `--run-tests`
  approval all unchanged.

## End-to-end check

Built a record by copying the embedded example and filling the `scope` field with the real
output of `akrctx judge scope TASK-021 --base <HEAD> --candidate WORKTREE --json`:

- A `NEEDS_CHANGES` record (the example's verdict) validates shape — the TASK-020 errors
  (`schemaVersion must be 2.`, `tests contains an invalid entry.`) are absent; the only
  reported reason is `Judge verdict is NEEDS_CHANGES, not APPROVED.` (expected for a
  non-APPROVED verdict).
- An `APPROVED` record built from the same example (empty `issues`, the declared validation
  command as a passing test) reports `Judge verification: APPROVED and current` with no
  hand-editing of the record.

The codex rendering's backtick substitution turns the ```json fence into `'''json` but leaves
the JSON content byte-identical; extracting and `JSON.parse`-ing the block from
`.codex/agents/akrctx-judge.toml` succeeds with `schemaVersion=2`, `verdict=NEEDS_CHANGES`,
test keys `command,evidence,status`.

## Validation (verbatim)

```
$ pnpm lint
Checked 96 files in 146ms. No fixes applied.

$ pnpm build
ESM ⚡️ Build success in 108ms
DTS ⚡️ Build success in 1989ms

$ npx vitest run
 Test Files  8 passed (8)
      Tests  735 passed (735)
```

`pnpm lint` reports zero errors and zero warnings. No Biome rule was disabled, ignored, or
downgraded. No test was skipped.