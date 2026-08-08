# Context

## Workflow selection

Config default is `task-fit`. This task is a set of small surgical bug fixes + template/doc updates,
each with a test where behavioral. Selected **fast-patch**: the changes are isolated, low-risk, and
well-understood; the behavioral ones (mode-insensitive snapshot, error message, `independent` flag
handling) get tests.

## Relevant files

- `src/judge-snapshot.ts` — `addManifestPath` (A1), the capture error throw (A2), `sameLiveBoundary`.
- `src/judge-enforcement.ts` — `validateRecord` allowlist, `JudgeReviewRecord` interface, `verifyJudgeRecord` notices (B1/B2).
- `.akrctx/judge/schemas/review.schema.json` — optional `independent` property (B1).
- `src/templates/judge.ts` — judge agent instructions: WORKTREE fallback (A3), `independent: false` on Pi/self-review (B3/B5).
- `src/templates/comprehension-agent.ts` — require `independent: true` (B6).
- `docs/JUDGE.md` — WORKTREE fallback + Pi limitation (A3/B3).
- `.akrctx/wiki/decisions.md` — extend the 2026-08-06 Pi record (B3).
- `tests/akrctx.test.ts` — mode-insensitive snapshot test, error-message test, `independent` flag verify tests.

## Non-goals (restated)

No Pi subagent surface, no cryptographic reviewer identity, no schema v3 bump, no `judge current`
for WORKTREE, no legacy-key migration.