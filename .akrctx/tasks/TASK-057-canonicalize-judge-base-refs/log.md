# Implementation Log

- 2026-08-28: Confirmed clean `main` worktree and `main` aligned with `origin/main`; no fetch was run.
- 2026-08-28: Branch creation was attempted but blocked because `.git` is read-only in this environment.
- 2026-08-28: Implemented canonical SHA base identity with diagnostic-only `baseRef`; added alias, missing-ref, absent-remote, and legacy-format regressions.
- 2026-08-28: Independent judge returned NEEDS_CHANGES for optional-schema handling, catch-up base identity, and stale installed Codex artifacts.
- 2026-08-28: Made `baseRef` optional, kept catch-up `scope.base` canonical, regenerated installed judge artifacts through `akrctx upgrade`, and repeated all gates successfully.
- 2026-08-28: Added the canonical SHA pattern to the generated review schema, regenerated installed schemas/agents, and repeated all gates successfully (861 tests).
- 2026-08-28: Closed the final exact-length hash regression; final gates pass with 862 tests.
- 2026-08-31: Corrected deduplicated snapshot metadata so equivalent aliases never persist a misleading `baseRef`; added the exact origin/tag reuse regression and fixed the documentation typo.
- 2026-08-31: Verified the checklist evidence, reran all validation gates successfully (862 tests), and confirmed no ref mutation/copying.
