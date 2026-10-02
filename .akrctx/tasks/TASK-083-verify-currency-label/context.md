# Context

Config: task-fit workflow, judge enabled, comprehension gate disabled. This repository lands
work as direct commits on main. Shipped harness content lives in src/templates. Managed files
use CLI regeneration; existing capsule templates currently remain on the preserve path until
TASK-079 is implemented.

## Relevant Files

- `src/cli/judge.ts` — the `verify` action. The header line prints a fixed
  `APPROVED and current` when `result.approved` is true, then prints `historicalVerdict`,
  the legacy mark, `verifiedNow` and the notices.
- `src/judge-enforcement.ts` — `JudgeVerifyResult.verifiedNow` carries `value`, `reason`,
  `reviewBoundary` and `executionMetadata`. `reviewBoundary` is only populated for a snapshot
  candidate, through `checkJudgeSnapshotCurrentState`, and stays null otherwise.
- `src/judge-snapshot.ts` — `checkJudgeReviewCurrentState` backs `akrctx judge current` and
  produces the `CURRENT`, `NEWER_CHANGES` and `DIVERGED` values.
- `.akrctx/judge/README.md` — states that a snapshot approval remains valid when the live
  workspace moves. The behaviour is correct; the wording in the CLI is not.
- `tests/cli.test.ts` and `tests/__snapshots__/cli.test.ts.snap` — CLI help snapshots. Header
  text changes may touch assertions in `tests/akrctx.test.ts`.

## Prior deliveries

- TASK-007 introduced immutable judge snapshots.
- TASK-075 added the legacy schema mark that appears in the same output block.

## Blocked Reads

- Secrets and credentials must not be read.
