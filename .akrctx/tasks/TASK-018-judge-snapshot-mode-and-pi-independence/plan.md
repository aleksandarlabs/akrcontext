# Plan

1. **Layer A1 — mode-insensitive manifest** (`src/judge-snapshot.ts`): change `addManifestPath` to
   hash `file\0<content>` (drop the `file:${mode}\0` prefix). The stability/integrity check is
   content-based. Document that existing snapshot IDs change.

2. **Layer A2 — honest error** (`src/judge-snapshot.ts`): the deterministic `manifestDigest`
   mismatch throw no longer says "retry after file writes settle"; it names the differing paths
   and states the mismatch is not a transient race. The `sameLiveBoundary` two-pass retry is
   unchanged.

3. **Layer A3 — WORKTREE fallback docs** (`src/templates/judge.ts`, `docs/JUDGE.md`): state that
   a missing snapshot falls back to `WORKTREE`, recorded in `scope.candidate`, and is not by
   itself a BLOCKED.

4. **Layer B1 — `independent` field**: add optional `independent?: boolean` to `JudgeReviewRecord`,
   allow it in `validateRecord`, add it to `.akrctx/judge/schemas/review.schema.json`.

5. **Layer B2 — verify notice** (`src/judge-enforcement.ts`): when `record.independent === false`,
   push a notice (never a reason); keep `approved` mechanical.

6. **Layer B3/B5/B6 — templates & docs**: judge agent template (WORKTREE fallback + set
   `independent: false` on self/Pi review + the field in the output JSON), comprehension-agent
   template (require `independent: true`), `docs/JUDGE.md` (fallback + independence section),
   `.akrctx/wiki/decisions.md` (extend 2026-08-06 Pi record + two 2026-08-08 records).

7. **Tests** (`tests/akrctx.test.ts`): mode-insensitive snapshot (umask 022 commit → 0002 capture);
   `independent: false` notice + still approved; non-boolean `independent` rejected.

8. **Changelog**: Added (`independent`), Fixed (snapshot mode + error message), Changed
   (comprehension requires independent; WORKTREE fallback + Pi independence in docs/agents).

9. **Validate:** `pnpm build && npx vitest run`, `npx tsc --noEmit`, `pnpm lint`, `akrctx doctor`.