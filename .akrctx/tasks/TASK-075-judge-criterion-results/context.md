# Context

Config: task-fit workflow, judge enabled, comprehension gate disabled. This repository lands
work as direct commits on main. Installed harness files are regenerated from src/templates,
never hand-edited.

## Relevant Files

- `src/templates/judge-contract.ts` — the review JSON Schema and the shipped contract README.
  Holds `issues`, the APPROVED coherence rule, and `JUDGE_SCHEMA_ID`.
- `src/judge-enforcement.ts` — `JUDGE_SCHEMA_VERSION` (currently 5), record validation,
  digest checks, and the verify path.
- `src/judge-snapshot.ts` — snapshot capture, catch-up snapshots, and scope computation.
  Holds the delta mechanism that round 2 should use.
- `src/judge.ts` — enable and status commands, agent file generation.
- `src/agents.ts`, `src/templates/` — the judge agent instructions shipped to each target.
- `.akrctx/local/judge/*.json` — historical records. The baseline for the round-count measure.
- `.akrctx/tasks/*/acceptance-criteria.md` — 74 existing capsules. Any criterion identity
  scheme must account for them.

## Prior deliveries

- TASK-071 added `--timings` diagnostics for the judge pipeline.
- TASK-072 moved validation execution to a deterministic runner with a bound receipt.

## Blocked Reads

- Secrets and credentials must not be read.
