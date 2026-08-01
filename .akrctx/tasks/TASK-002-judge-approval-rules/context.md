# Context

## Relevant Files

- `src/judge-enforcement.ts:139-158` — the reason-collection block in
  `verifyJudgeRecord`. The two new approval rules go here, after the digest
  comparisons. `validateRecord` has already returned by this point, so `record.tests`
  and `record.issues` are guaranteed arrays of the right shape.
- `src/judge-enforcement.ts:147-150` — the existing verdict and failed-validation
  rules the new ones must not disturb.
- `src/templates/judge-contract.ts:3-57` — `reviewSchema`, the single source for
  `.akrctx/judge/schemas/review.schema.json`. `$id` is checked by
  `requireJudgeContract` in `src/judge.ts:70-84`, so it must not change.
- `src/templates/judge-contract.ts:60-65` — `.akrctx/judge/README.md` body, the
  contract summary shipped into installed repos.
- `src/templates/judge.ts:1-43` — `judgeInstructions`, one source rendered into the
  Claude, Copilot, and Codex agent files. Backticks need escaping; the Codex branch
  replaces them with single quotes at line 89.
- `src/cli.ts:585-614` — the `judge scope` and `judge verify` actions. Both call
  `process.cwd()` directly instead of going through `normalizeOptions`
  (`src/cli.ts:756`), which every other action uses.
- `src/cli.ts:73-83` — `addCommon`. Not usable for `scope`/`verify`: it would add
  `--dry-run` and `--force`, which are meaningless for read-only commands.
- `tests/akrctx.test.ts:2074-2180` — the `judge` describe block. `createReviewFixture`
  builds an APPROVED record with `tests: [{ command: "pnpm test", status: "passed" }]`
  and `issues: []`, so it already satisfies both new rules and existing tests keep
  passing. New tests mutate that fixture.
- `docs/JUDGE.md:15-31` — the "Deterministic enforcement" section users read.

## Callers Not To Break

Every documented invocation of `akrctx judge scope` already passes `--json`:
`README.md:55`, `docs/JUDGE.md:20`, `docs/COMMANDS_AND_UX.md:262`,
`docs/CONFIGURATION.md:201`, `.akrctx/judge/README.md:3`, and the generated agent
instructions. Making the flag real therefore breaks no documented caller. Tests call
`createJudgeScope` directly and never parse CLI stdout.

## Blocked Reads

- Secrets and credentials must not be read.
