# Implementation log

## 2026-09-19 — delivery 1

- SDD contract recorded before code. One programming subagent implemented runtime timing and integration tests; primary agent handled shipped instructions, docs and final validation.
- TDD red: timing test initially failed because the collector module did not exist; four template contract tests failed on the contradictory execution/dependency guidance. Green: collector/CLI tests and all 39 agent template tests passed after implementation.
- Added opt-in stderr diagnostics through an async-local collector, with monotonic inclusive phases, numeric command indices and fail-open diagnostic emission. Snapshot capture and verification keep their existing authority and execution behavior.
- Real isolated verification test covers approved execution and denied approval, asserting actual phases and no execution after denial.
- Corrected source templates and docs: judge runs validation in a disposable copy; trusted caller independently re-executes it; verifier dependencies come from the lockfile. Installed protected instructions were not overwritten. CLI init dry-run was re-run.
- Build, lint, init dry-run and Doctor passed; Doctor reports readiness 100, no missing files or conflicts.
- First full suite: 929 tests passed, one newly edited mock suite failed during concurrent implementation. Fixed mock passed focused validation; final stable-tree suite passed (see totals below).
- Additional standalone `tsc --noEmit` reported errors in unchanged tests/akrctx.test.ts (CompileResult narrowing, CandidateDirectoryReader) and tests/evals.test.ts (module declarations/implicit types/fixture fields). These are outside this delivery; the required build succeeds.
- External reviewer/model latency and pre-command human wait are explicitly unmeasured. No performance improvement or end-to-end baseline is claimed yet.
- Independent judge invocation awaits the separately required user confirmation.

## Final validation

- `pnpm test`: Test Files  12 passed (12); Tests  935 passed (935); Duration  92.70s (transform 994ms, setup 0ms, collect 3.70s, tests 106.44s, environment 2ms, prepare 783ms).
- `pnpm build`, `pnpm lint`, `pnpm akrctx init --target codex --dry-run`, `pnpm akrctx doctor --json`, and `git diff --check` passed.

## 2026-09-19 — delivery 1, round 2 (judge feedback)

- Independent judge reviewed SNAPSHOT:76b384caab5aea147326 and returned NEEDS_CHANGES with one issue. Record saved at `.akrctx/local/judge/TASK-071-review.json`. `akrctx judge verify --run-tests` reported INVALID, as a non-approved verdict requires.
- Issue confirmed by reading the source: `docs/JUDGE.md` line 37 documented a `snapshot-build` phase that no call site emitted. `buildSnapshotArtifacts` was measured as `dependency-preparation`, the same label the verify-side lockfile install uses.
- User chose to emit the phase rather than to weaken the documentation. `src/judge-snapshot.ts:589` now measures `buildSnapshotArtifacts` as `snapshot-build`. Snapshot capture and verify-side dependency preparation no longer share one label.
- `tests/judge-timings-integration.test.ts` now wraps the real snapshot capture in `withJudgeTimings` and asserts that the emitted phases contain both `dependency-copy` and `snapshot-build`. The documented claim is now pinned by a test.
- `docs/JUDGE.md` needed no change: its line 37 describes the emitted phases correctly after this fix.
- Validation re-run on the stable tree: `pnpm build`, `pnpm test` (12 files, 935 tests passed, 102.23s), `pnpm lint` (103 files, no findings), `pnpm akrctx init --target codex --dry-run` (exit 0), `pnpm akrctx doctor --json` (exit 0, 0 missing, 0 conflicts), `git diff --check` clean.
- A new full snapshot is required. The rejected record cannot parent a catch-up snapshot.

## 2026-09-19 — delivery 1, round 3 (approval)

- Fresh full snapshot `SNAPSHOT:017ee67cdab234ad844d` captured. The rejected round-2 record could not parent a catch-up snapshot.
- Independent judge re-reviewed the new boundary and returned APPROVED with an empty `issues` array. All seven acceptance criteria pass. Record saved at `.akrctx/local/judge/TASK-071-approved.json`.
- `akrctx judge verify .akrctx/local/judge/TASK-071-approved.json --run-tests` reported APPROVED and current, scope digest `sha256:a6e9dede…`. The trusted caller independently re-executed all five declared commands in its own disposable copy. `akrctx judge current` reports CURRENT.
- The fix is visible in real captured output. Snapshot phases now read `workspace-copy`, `dependency-copy`, `snapshot-build`, `cleanup`, `dependency-copy`. The verify-side `dependency-preparation` label is no longer shared with the snapshot build.

## First measured baseline

Captured by the instrumentation itself, not estimated. Durations are inclusive; do not sum them.

- Snapshot capture: 2355ms total — workspace-copy 389ms, dependency-copy 760ms + 475ms, snapshot-build 35ms, cleanup 108ms.
- Verification with re-execution: 106956ms total — approval-wait 0.1ms, workspace-copy 192ms, dependency-preparation 3007ms, validation commands 1560/99485/1317/264/260ms (indices 1-5), cleanup 140ms.
- Command index 2 (`pnpm test`) is 93% of verification wall time. Dependency preparation is the second cost at 3007ms. This is the measurement the runner redesign must start from.
- External reviewer model time and pre-invocation human wait stay unmeasured. Do not read them from these numbers.

## 2026-09-19 — delivery 1, round 4 (changelog catch-up)

- `CHANGELOG.md` gained the `--timings` entry under Added and an instruction-coherence entry under Fixed. That edit moved the workspace to NEWER_CHANGES against the approved snapshot, so the approval no longer covered it.
- Catch-up snapshot `SNAPSHOT:ec67078d29123053a08f` captured from the verified parent `017ee67cdab234ad844d`. Delta is 3 files: `CHANGELOG.md`, this log, and the review checklist. No source file is in the delta.
- The first catch-up attempt failed by design: the newly created TASK-072 capsule was a foreign task capsule in the TASK-071 boundary. `--include-task TASK-072` was refused, because it would pull an unrelated capsule into this review. The TASK-072 capsule was moved aside for the capture and restored immediately after.
- Independent judge reviewed the delta and returned APPROVED with an empty `issues` array. The judge re-checked each CHANGELOG claim against the candidate source instead of accepting it. Record at `.akrctx/local/judge/TASK-071-catchup-approved.json`.
- `akrctx judge verify --run-tests` reports APPROVED and current, scope digest `sha256:49cf315f…`. `akrctx judge current` reports CURRENT.
- Known cosmetic defect, left unfixed on purpose: `CHANGELOG.md` has a double blank line before `## [0.6.0]`. Biome does not lint Markdown and the file renders correctly. Fixing it would invalidate this approval and cost another full catch-up cycle.

## Duplicate-execution cost, measured across this delivery

- Five full runs of the same declared commands closed one delivery: implementation ~102000ms, judge round 2 ~105500ms, verify ~107000ms, catch-up parent verification ~113800ms, catch-up verify ~110000ms. Each judge review round added its own run on top.
- `pnpm test` is 93% of every run. This is the evidence base for TASK-072.
