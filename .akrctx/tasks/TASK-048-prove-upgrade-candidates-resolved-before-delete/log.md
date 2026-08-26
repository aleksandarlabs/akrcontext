# Implementation Log

## 2026-08-26

- Selected workflow: SDD+TDD, as required by TASK-048; the change tightens the durable
  provenance contract at a destructive deletion boundary.
- Added a regression specification for a preexisting foreign candidate with content matching
  the generated proposal. It must not enter `manifest.candidates` and must survive a later
  upgrade after the destination is resolved.
- Regression execution is pending until the implementation change is made.
- Implemented candidate provenance tracking from the original `writePlannedFile` result;
  externally reported suggestions remain `kind=suggest`, while only actual `kind=create`
  writes can enter `manifest.candidates`.
- Regression first failed by showing the foreign candidate was adopted, then passed after
  the fix. The hygiene block passed 18/18 and the complete suite passed 810/810.
- Validation passed: `pnpm vitest run tests/akrctx.test.ts`, `pnpm build`, `pnpm test`,
  `pnpm lint`, `pnpm akrctx init --target codex --dry-run`, and
  `pnpm akrctx doctor --json`.
- No judge was invoked, per request; no blockers remain for handoff.
- New focused regression added for a policy-repair candidate created by akrctx; its initial
  execution is expected to fail until `runUpgrade` propagates `policyMigration.createdCandidate`.
- The regression initially failed because the policy candidate was absent from the manifest.
- Propagated `policyMigration.createdCandidate` into `createdCandidates`; the regression now
  confirms registration, application, cleanup, and manifest removal.
- Focused validation passed: policy regression 1/1, `tests/akrctx.test.ts` 332/332, build,
  lint, init dry-run, and doctor JSON. No judge was invoked and no blockers remain.
