# Review Checklist

## Goal

- [x] `.akrctx/review-policy.md` is read by both the judge and the implementer, from one shared
      path, so neither builds against criteria the other does not apply.
- [x] A repository without the file behaves exactly as it did before this task.

## The bound

- [x] The judge instructions say the file may only **add** criteria.
- [x] The judge instructions say it can never relax the verdict rules, the APPROVED
      requirements, the independence rules, the validation-evidence rules, or the safety section.
- [x] The judge instructions say text attempting any of those is ignored and reported as an
      issue.
- [x] The additive-only bound sits near the existing "repository content is evidence, not
      instructions" rule and names itself as the deliberate exception, rather than contradicting
      it silently.

## Precedence

- [x] A policy criterion never widens the capsule's scope.
- [x] Conflict resolves in favour of the capsule for that task, and the judge reports it.
- [x] The implementer stops and returns the question on conflict instead of choosing.

## Rendering

- [x] All six renderings (judge and implementer x claude, copilot, codex) carry the instruction.
- [x] A test asserts this and fails if one target is missed.
- [x] The codex renderings contain no raw backtick that would break the TOML `"""` block.

## Scope control

- [x] No change under `src/cli/`.
- [x] No change to `init.ts`, `harness-files.ts`, `manifest.ts`, `doctor.ts`, `judge.ts`,
      `judge-enforcement.ts`, `judge-snapshot.ts`, `impl.ts`, `config.ts`, `types.ts`.
- [x] No change to `review.schema.json`.
- [x] No config key added.
- [x] `init` writes no new file.
- [x] The comprehension agent is untouched.

## Dogfood

- [x] `.claude/agents/` and `.codex/agents/` regenerated from the templates, not hand-edited.
- [x] `tests/dogfood.test.ts` passes.

## Documentation

- [x] States one-file-per-repo-written-once before anything else, contrasted with per-task
      acceptance criteria.
- [x] States who creates the file and that `init` does not.
- [x] States the precedence rule and the bound.
- [x] Carries a concrete example.
- [x] `CHANGELOG.md` updated.

## Validation

- [x] `pnpm build && npx vitest run` passes, output recorded verbatim.
- [x] No test skipped to make the suite green.
