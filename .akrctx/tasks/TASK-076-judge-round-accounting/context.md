# Context

Config: task-fit workflow, judge enabled, comprehension gate disabled. This repository lands
work as direct commits on main. Shipped harness content lives in src/templates. Managed files
use CLI regeneration; existing capsule templates currently remain on the preserve path until
TASK-079 is implemented.

## Relevant Files

- `.akrctx/local/judge/` — the records to read. Untracked except one historical file. Holds
  loose JSON files, two per-task directories, a `records/` subdirectory and a `snapshots/`
  directory. Any reader must tolerate every shape listed in task.md.
- `src/cli/judge.ts` — the `judge` command group. `verify` is registered around line 298 and
  prints the human summary, including the `legacy` mark added by TASK-075.
- `src/judge-enforcement.ts` — `verifyJudgeRecord`, `validateRecord` and the v6/v5 dual read.
  A record carries `taskId`, `verdict`, `reviewedAt`, `independent` and `scope.scopeDigest`,
  which are the fields a round counter needs.
- `src/judge-snapshot.ts` — snapshot capture and catch-up snapshots. Catch-up metadata identifies
  delta-review work where available; lack of metadata must stay unknown.
- `src/judge-timings.ts` — the TASK-071 precedent for a diagnostics-only output channel.
- `.akrctx/local/impl/TASK-075/log.md` — the 2.23 baseline and the dedup rule used to get it.
- `src/templates/instructions.ts` — existing manual-save guidance is background only;
  this read-only delivery does not change record storage or protected instructions.

## Prior deliveries

- TASK-071 added `--timings` phase diagnostics for snapshot and verify.
- TASK-072 proposes a deterministic runner and bound receipt; it remains pending.
- TASK-075 replaced the free-form `issues` list with per-criterion results and schema v6.

## Blocked Reads

- Secrets and credentials must not be read.

## Handoff

Contract closed on 2026-10-02 in task.md. The implementation brief is exports/codex.md.
The current change records decisions only; feature implementation and its tests remain pending.
