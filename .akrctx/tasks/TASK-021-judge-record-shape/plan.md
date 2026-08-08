# Plan

## Workflow

- TDD

## Why

`workflowRules.bugfix` is `TDD`, and this is a bugfix with a reproducible failure: the TASK-020
review record was rejected with `schemaVersion must be 2.` and `tests contains an invalid
entry.`. The test to write first is the one that would have caught it — validate the instruction
text's own example against the real validator — and it fails today because no example exists.

`fast-patch` was rejected despite the small diff: a patch that fixes the wording without a test
leaves the same failure free to return at the next `JUDGE_SCHEMA_VERSION` bump, which is the
specific way this bug is designed to recur. `research-first` was rejected because the defect,
its location, and its fix are all identified. `SDD` was rejected because the contract already
exists in `review.schema.json` and is not being changed.

The honest limit: the test proves the example matches the contract. It cannot prove a judge
copies the example rather than improvising. That gap closes only through use, or through the
evals suite if it ever needs mechanical evidence.

## Steps

1. Read `src/templates/judge.ts` (the closing paragraph at line 69),
   `src/templates/judge-contract.ts` (the schema source and `JUDGE_SCHEMA_ID`), and
   `validateRecord` / `isTestRecord` / `isScope` in `src/judge-enforcement.ts` (around lines
   440-470).
2. Write the failing test first: build the example record the instructions will embed and assert
   it validates. Export `validateRecord` if needed — export only, no behaviour change. Run it
   and watch it fail for the right reason.
3. Construct the example with placeholder values that satisfy the schema's patterns: `taskId`
   matching `^TASK-[0-9]+$`, commits matching `^[0-9a-f]{40,64}$`, digests matching
   `^sha256:[0-9a-f]{64}$`. A placeholder like `<digest>` fails validation and defeats the test.
4. Replace the closing paragraph of `judgeInstructions` with the example, interpolating
   `JUDGE_SCHEMA_VERSION`. Keep the surrounding sentences that still hold: the read-only caller
   flow, `verify --run-tests`, and the ban on the implementing agent's narrative.
5. Check the codex rendering by eye — render it and confirm the example survives the backtick
   substitution and the TOML `"""` block.
6. Add a rendering assertion for the example to the existing agent-template test.
7. Regenerate the dogfooded agent files; confirm `tests/dogfood.test.ts` passes and the manifest
   moved only for those two files.
8. End-to-end check: build a record by copying the example, fill in real values from a scope run,
   and confirm `akrctx judge verify` accepts it with no hand-editing.
9. `CHANGELOG.md` entry — new bullet, existing entries untouched, continuations indented two
   spaces. The TASK-020 review found exactly this mistake; do not repeat it.
10. Run `pnpm build && npx vitest run` and record the output verbatim.

## Risks

- The example lengthens a prompt that is already long, and the `scope` object has twelve required
  fields. Showing `scope` in full may crowd out the instructions around it; a placeholder keeps
  it short but must not read as the literal value to emit. Step 4 has to get that balance right,
  and the acceptance criterion about the `scope` sentence exists for this reason.
- Placeholder values that do not satisfy the schema's patterns make the test pass vacuously or
  fail confusingly. Step 3 is where that is decided.
- Exporting `validateRecord` widens the module's public surface. Export it unchanged; the moment
  its behaviour shifts, this task has left its scope.
- This capsule is written by the same primary agent that will later call the judge on it. The
  example is the very thing the judge is told to copy, so an error here propagates to every
  future record rather than to one.
