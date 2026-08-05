# Plan

## Workflow

SDD+TDD

## Steps

1. Write the section contract in `task.md` before touching code (done: `## Contract`).
2. Encode the contract as failing tests in `tests/akrctx.test.ts`:
   - `akrctx task` emits both sections with the placeholder bullet and no date.
   - the shipped `_template` carries the same two sections.
   - `readClarificationState` parses bullets, joins wrapped continuation lines, and
     treats `None recorded yet.` as empty.
   - a capsule with no `## Clarifications` reports `clarificationsSectionPresent: false`
     and does not error.
   - `verifyJudgeRecord` emits a notice for open questions and still returns
     `approved: true`.
3. Implement `taskMarkdown()` and `capsuleTemplates["task.md"]`.
4. Implement `readClarificationState()` next to `readValidationDeclaration()`.
5. Add `notices` to `JudgeVerifyResult`, populate it, print it in `src/cli.ts`.
6. Rewrite `taskBody` with the relevance test, the portable question format, the write
   destination, propagation into `acceptance-criteria.md`, and the headless rule.
7. Add the native-UI adapter line to the claude target reference only.
8. Propose the root instruction diff (`CLAUDE.md` is protected) and wait for approval.
9. Add an eval scenario. Step 9 as originally written — "an ambiguous request must
   produce a question, not a guess" — is not reachable in this harness: `evals/lib/`
   runs CLI processes, not a model, and `scenario.mjs:143` rejects an `improved` verdict
   for a `feature` because no independent outcome grader exists. The scenario therefore
   covers the artifact half only (both sections present, no stamped date) and declares
   `inconclusive`, which is what `classifyComparison` reports for a mechanism addition.
   The behavioural half is untested; `acceptance-criteria.md` says so rather than
   claiming coverage that does not exist.
10. Run `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm eval`.
