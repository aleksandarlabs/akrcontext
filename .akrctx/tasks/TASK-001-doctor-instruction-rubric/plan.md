# Plan

## Workflow

SDD

## Reason

`defaults.workflow` is `task-fit`, so the smallest fitting workflow applies.
fast-patch is too small: the deliverable *is* prose that ships to four agent
surfaces and directly steers how Doctor judges other people's instruction files.
Wrong wording is not a local bug — it teaches every installed harness a bad rule,
and there is no test that can catch a bad criterion. TDD/EDD do not apply: there is
no behavioral branch to drive from a failing test, and the existing suite already
pins the invariants that must survive.

So the spec is the section text itself, agreed before it lands in the template.

## Steps

1. Draft the rubric section as spec and present it for review. (spec)
2. On approval, insert it into `doctorBody` in `src/templates/instructions.ts`,
   above the existing "Protected instruction merge" section, escaping backticks for
   the surrounding template literal.
3. Run `pnpm test` and `pnpm lint`.
4. Regenerate this repo's own installed copy only if the existing upgrade path does
   it; do not hand-edit `.claude/skills/akrctx-doctor/SKILL.md`.
5. Record the source-of-truth decision in `.akrctx/wiki/decisions.md`.
6. Add a persistent instruction-audit wiki page, register it in policy and the harness
   inventory, and prove the CLI Doctor preserves it.
7. Clarify CLI Doctor versus Doctor skill responsibilities in CLI help and user docs.

## Notes

`.akrctx/config.json` has `judge.enabled: true` with `trigger: post-implementation`, so
this task requires an independent judge pass after implementation. The judge's JSON
record is saved under `.akrctx/local/judge/` and checked with `akrctx judge verify`.
`comprehensionGate.enabled` is false, so no comprehension handoff is required.
