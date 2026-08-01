# Acceptance Criteria

- [ ] `verifyJudgeRecord` rejects an APPROVED record whose `tests` array contains no
      entry with `status: "passed"`, including the empty-array case.
- [ ] `verifyJudgeRecord` rejects an APPROVED record whose `issues` array is
      non-empty.
- [ ] Both new rules apply only to APPROVED. A `NEEDS_CHANGES` or `BLOCKED` record
      still reports its existing single reason and does not gain new ones.
- [ ] The existing "contains failed validation" rule is unchanged and still fires
      regardless of verdict.
- [ ] `review.schema.json` expresses both rules as a conditional on `verdict`, and
      `$id` stays `akrctx-judge-review-v1` so `requireJudgeContract` keeps passing.
- [ ] The generated judge agent instructions state both approval rules and tell the
      judge what to report when validation cannot run.
- [ ] `akrctx judge scope` without `--json` prints a human-readable summary; with
      `--json` it prints exactly the JSON object it prints today.
- [ ] `akrctx judge scope` and `akrctx judge verify` resolve their working directory
      through `normalizeOptions` like every other command.
- [ ] `.akrctx/judge/schemas/review.schema.json` and `.claude/agents/akrctx-judge.md`
      in this repo are regenerated through the normal upgrade path, not hand-edited,
      and match `.akrctx/manifest.json`.
- [ ] User docs (`docs/JUDGE.md`) state the approval rules.
- [ ] `pnpm test` passes.
- [ ] `pnpm lint` passes at the repository root (`biome check .`, exit 0).
