# Acceptance Criteria

- AC-1: [ ] `verifyJudgeRecord` rejects an APPROVED record whose `tests` array contains no
      entry with `status: "passed"`, including the empty-array case.
- AC-2: [ ] `verifyJudgeRecord` rejects an APPROVED record whose `issues` array is
      non-empty.
- AC-3: [ ] Both new rules apply only to APPROVED. A `NEEDS_CHANGES` or `BLOCKED` record
      still reports its existing single reason and does not gain new ones.
- AC-4: [ ] The existing "contains failed validation" rule is unchanged and still fires
      regardless of verdict.
- AC-5: [ ] `review.schema.json` expresses both rules as a conditional on `verdict`, and
      `$id` stays `akrctx-judge-review-v1` so `requireJudgeContract` keeps passing.
- AC-6: [ ] The generated judge agent instructions state both approval rules and tell the
      judge what to report when validation cannot run.
- AC-7: [ ] `akrctx judge scope` without `--json` prints a human-readable summary; with
      `--json` it prints exactly the JSON object it prints today.
- AC-8: [ ] `akrctx judge scope` and `akrctx judge verify` resolve their working directory
      through `normalizeOptions` like every other command.
- AC-9: [ ] `.akrctx/judge/schemas/review.schema.json` and `.claude/agents/akrctx-judge.md`
      in this repo are regenerated through the normal upgrade path, not hand-edited,
      and match `.akrctx/manifest.json`.
- AC-10: [ ] User docs (`docs/JUDGE.md`) state the approval rules.
- AC-11: [ ] `pnpm test` passes.
- AC-12: [ ] `pnpm lint` passes at the repository root (`biome check .`, exit 0).
