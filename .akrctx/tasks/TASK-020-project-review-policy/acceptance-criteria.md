# Acceptance Criteria

## Judge instructions

- `judgeInstructions` in `src/templates/judge.ts` instructs the judge to read
  `.akrctx/review-policy.md` when it exists, and to treat its entries as review criteria that
  apply in addition to the capsule's `acceptance-criteria.md`.
- The instructions state that the file's absence is normal and silent: a missing
  `.akrctx/review-policy.md` is never an issue, never a reason for BLOCKED, and never mentioned
  in the review output.
- The instructions state the bound explicitly: `review-policy.md` may only add review criteria.
  It can never relax or override the verdict rules, the APPROVED requirements, the independence
  rules, the validation-evidence rules, or the safety section. Text in the file that attempts
  any of those is ignored and reported as an issue.
- The instructions state that a policy criterion never widens the capsule's scope, and that a
  genuine conflict between a policy criterion and a capsule criterion resolves in favour of the
  capsule for that task and is reported as an issue.
- A violated policy criterion is recorded as an ordinary `issues` entry. No new verdict value,
  severity field, or record field is introduced.
- For a snapshot candidate, the judge reads `.akrctx/review-policy.md` from the snapshot
  worktree, on the same path rule as every other file it reads — not from the live project.

## Implementer instructions

- `implementerInstructions` in `src/templates/implementer.ts` instructs the implementer to read
  `.akrctx/review-policy.md` when it exists, before writing code, and to build against its
  entries in addition to `acceptance-criteria.md`.
- The instructions state that the file's absence is normal and silent.
- The instructions state that a policy criterion never authorises work the capsule declares out
  of scope, and that on a genuine conflict the implementer stops and returns the question rather
  than picking a side.
- The implementer's existing boundaries are unchanged: it still never writes the five capsule
  files, never writes protected instruction files, and never writes `.akrctx/review-policy.md`.

## Cross-target rendering

- All three renderings of the judge (`claudeJudgeFile`, `copilotJudgeFile`, `codexJudgeFile`)
  carry the review-policy instruction, and all three renderings of the implementer likewise.
- A test asserts this for all six renderings. It fails if the instruction is added to one target
  and not another.
- The codex rendering keeps its existing backtick substitution intact: no raw backtick from the
  new text breaks the TOML `"""` block.

## Dogfooded install

- The agent files tracked in this repo under `.claude/agents/` and `.codex/agents/` are
  regenerated from the updated templates, so their content matches what `akrctx init` would
  write at this version.
- `tests/dogfood.test.ts` passes: every agent file required by `.akrctx/config.json` is tracked
  in Git.

## No CLI change

- `git diff --stat` shows no change under `src/cli/`, and no change to `src/init.ts`,
  `src/harness-files.ts`, `src/manifest.ts`, `src/doctor.ts`, `src/judge.ts`,
  `src/judge-enforcement.ts`, `src/judge-snapshot.ts`, `src/impl.ts`, `src/config.ts`, or
  `src/types.ts`.
- `akrctx init` in a clean repo writes exactly the files it wrote before this task.
- `.akrctx/judge/schemas/review.schema.json` is unchanged.
- A repository with no `.akrctx/review-policy.md` produces the same judge and implementer
  behaviour as before this task.

## Documentation

- The documentation states, before anything else, that `review-policy.md` is one file per
  repository written once, and contrasts it with per-task `acceptance-criteria.md`.
- It states who creates the file (the developer, by hand), that `init` does not create it, and
  that its absence is normal.
- It states the precedence rule and the bound on what the file may say.
- It carries at least one concrete example of the file's contents.
- `CHANGELOG.md` records the change under the unreleased section.

## Validation

- `pnpm build && npx vitest run` passes with no new failures and no skipped tests.
