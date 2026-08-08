# Review Checklist

- [x] Goal is clear.
- [x] Scope is controlled.
- [x] Validation commands defined.
- [x] Existing instructions not overwritten.

## Layer A
- [x] Snapshot succeeds in a mixed-mode/umask-0002 working tree (new test).
- [x] `addManifestPath` content+type, not mode bits.
- [x] Capture tests still pass (no literal ID/digest assertions break — 708 tests).
- [x] Deterministic mismatch error no longer claims a transient race; names paths.
- [x] Two-pass `sameLiveBoundary` retry unchanged.
- [x] Judge template + JUDGE.md document the WORKTREE fallback.

## Layer B
- [x] `independent` optional boolean in record + schema + `JudgeReviewRecord` + `validateRecord`.
- [x] `verify` notices `independent === false`; never changes valid/approved/exit (new tests).
- [x] Non-independent APPROVED still verifies `approved: true` (new test).
- [x] Non-boolean `independent` rejected (new test).
- [x] Comprehension-agent template requires `independent: true`.
- [x] Pi decision record + judge template + JUDGE.md + comprehension template state the Pi limitation.

## Cross-cutting
- [x] `pnpm build && npx vitest run` passes (708 tests).
- [x] `npx tsc --noEmit` no new error (4 pre-existing akrctx.test.ts errors unchanged).
- [x] `pnpm lint` clean.
- [x] doctor 100/100; `judge verify --run-tests` still re-executes (boundary correctly drifts after tree changes).