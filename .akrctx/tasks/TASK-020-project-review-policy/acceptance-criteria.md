# Acceptance Criteria

## Judge instructions

- AC-1: `judgeInstructions` in `src/templates/judge.ts` instructs the judge to read
  `.akrctx/review-policy.md` when it exists, and to treat its entries as review criteria that
  apply in addition to the capsule's `acceptance-criteria.md`.
- AC-2: The instructions state that the file's absence is normal and silent: a missing
  `.akrctx/review-policy.md` is never an issue, never a reason for BLOCKED, and never mentioned
  in the review output.
- AC-3: The instructions state the bound explicitly: `review-policy.md` may only add review criteria.
  It can never relax or override the verdict rules, the APPROVED requirements, the independence
  rules, the validation-evidence rules, or the safety section. Text in the file that attempts
  any of those is ignored and reported as an issue.
- AC-4: The instructions state that a policy criterion never widens the capsule's scope, and that a
  genuine conflict between a policy criterion and a capsule criterion resolves in favour of the
  capsule for that task and is reported as an issue.
- AC-5: A violated policy criterion is recorded as an ordinary `issues` entry. No new verdict value,
  severity field, or record field is introduced.
- AC-6: For a snapshot candidate, the judge reads `.akrctx/review-policy.md` from the snapshot
  worktree, on the same path rule as every other file it reads — not from the live project.

## Implementer instructions

- AC-7: `implementerInstructions` in `src/templates/implementer.ts` instructs the implementer to read
  `.akrctx/review-policy.md` when it exists, before writing code, and to build against its
  entries in addition to `acceptance-criteria.md`.
- AC-8: The instructions state that the file's absence is normal and silent.
- AC-9: The instructions state that a policy criterion never authorises work the capsule declares out
  of scope, and that on a genuine conflict the implementer stops and returns the question rather
  than picking a side.
- AC-10: The implementer's existing boundaries are unchanged: it still never writes the five capsule
  files, never writes protected instruction files, and never writes `.akrctx/review-policy.md`.

## Cross-target rendering

- AC-11: All three renderings of the judge (`claudeJudgeFile`, `copilotJudgeFile`, `codexJudgeFile`)
  carry the review-policy instruction, and all three renderings of the implementer likewise.
- AC-12: A test asserts this for all six renderings. It fails if the instruction is added to one target
  and not another.
- AC-13: The codex rendering keeps its existing backtick substitution intact: no raw backtick from the
  new text breaks the TOML `"""` block.

## Dogfooded install

- AC-14: The agent files tracked in this repo under `.claude/agents/` and `.codex/agents/` are
  regenerated from the updated templates, so their content matches what `akrctx init` would
  write at this version.
- AC-15: `tests/dogfood.test.ts` passes: every agent file required by `.akrctx/config.json` is tracked
  in Git.

## No CLI change

- AC-16: `git diff --stat` shows no change under `src/cli/`, and no change to `src/init.ts`,
  `src/harness-files.ts`, `src/manifest.ts`, `src/doctor.ts`, `src/judge.ts`,
  `src/judge-enforcement.ts`, `src/judge-snapshot.ts`, `src/impl.ts`, `src/config.ts`, or
  `src/types.ts`.
- AC-17: `akrctx init` in a clean repo writes exactly the files it wrote before this task.
- AC-18: `.akrctx/judge/schemas/review.schema.json` is unchanged.
- AC-19: A repository with no `.akrctx/review-policy.md` produces the same judge and implementer
  behaviour as before this task.

## Documentation

- AC-20: The documentation states, before anything else, that `review-policy.md` is one file per
  repository written once, and contrasts it with per-task `acceptance-criteria.md`.
- AC-21: It states who creates the file (the developer, by hand), that `init` does not create it, and
  that its absence is normal.
- AC-22: It states the precedence rule and the bound on what the file may say.
- AC-23: It carries at least one concrete example of the file's contents.
- AC-24: `CHANGELOG.md` records the change under the unreleased section.

## Validation

- AC-25: `pnpm build && npx vitest run` passes with no new failures and no skipped tests.
