# Plan

## Workflow

- TDD

## Why

`defaults.workflow` is `task-fit`, so the smallest workflow that fits wins. The change itself is
prose inside two template string literals, which argues for `fast-patch`. What rules that out is
the cross-target failure mode: this repo renders every agent for claude, copilot, and codex from
one shared instruction string, and the recurring defect is text that lands in one rendering and
not another — or text whose backticks break the codex TOML `"""` block. That is exactly a test
worth writing first, and it is cheap.

`SDD` was rejected because there is no contract to settle: no schema, no CLI surface, no JSON
field. `research-first` was rejected because the two touched files were read during
clarification and the change is fully specified. `SDD+TDD` (the `apiOrContract` rule) does not
apply — nothing here is an API or a contract between programs.

The honest limit of TDD here: a test can assert the instruction text is present in all six
renderings. It cannot assert an agent obeys the bound on `review-policy.md`. That property rests
on the prose and on the judge's own reading, and the eval suite is where it would be probed if it
ever needs mechanical evidence.

## Steps

1. Read `src/templates/judge.ts` and `src/templates/implementer.ts` in full, plus
   `src/templates/agent-model.ts` for how the three renderings share a body.
2. Read `.akrctx/review-policy.md` conventions in `docs/JUDGE.md` and `docs/CONFIGURATION.md` to
   choose which document owns the new section.
3. Write the failing test first: for each of the six renderings, assert the review-policy
   instruction is present, and assert the codex renderings contain no raw backtick. Run it and
   watch it fail.
4. Draft the judge instruction text. It must carry the read step, the silent-absence rule, the
   additive-only bound, the no-scope-widening rule, the capsule-wins-on-conflict rule, and the
   snapshot-worktree path rule.
5. Draft the implementer instruction text, mirroring the read step, the silent-absence rule, and
   the stop-and-ask-on-conflict rule.
6. Run the test suite. Fix until green.
7. Regenerate the dogfooded agent files under `.claude/agents/` and `.codex/agents/` and confirm
   `tests/dogfood.test.ts` passes.
8. Write the documentation section and the `CHANGELOG.md` entry.
9. Run `pnpm build && npx vitest run` and record the verbatim output.
10. Verify the no-CLI-change criterion by inspecting the diff before handing back.

## Risks

- The bound on `review-policy.md` is the one property with real consequences and the one nothing
  enforces. If the instruction text is vague, a repository can smuggle instructions into a review
  through a file the judge is now told to read. The text has to be unambiguous that the file adds
  criteria and can never subtract a rule.
- The codex rendering runs `.replace(/`/g, "'")` over the whole body. New text with backticked
  paths renders as `'.akrctx/review-policy.md'` there, which is correct but worth confirming
  rather than assuming.
- Editing a shared instruction string touches all three targets at once. The diff must be read
  per rendering, not only at the source string.
