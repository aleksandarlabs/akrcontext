# Task

## Goal
Remove duplicated validation runs from the judge pipeline. A deterministic runner executes the capsule's declared commands once against a snapshot and writes a receipt bound to that snapshot. The judge reads the receipt as evidence instead of executing. `akrctx judge verify` checks the binding instead of re-executing. Second delivery of the judge-latency plan; the first delivery measured the pipeline (TASK-071).

## Contract
`akrctx judge run <task-id>` executes every command in the capsule's `## Validation` fence once, in an isolated disposable copy of the snapshot, and writes a receipt. The receipt records the snapshot id, the snapshot review digests, the normalized command list, the lockfile digest, and per-command status, exit code and bounded redacted failure evidence. A receipt is valid only while all four bindings match; any mismatch invalidates it and the runner must run again.

The judge no longer executes validation commands. It reads the receipt for validation evidence and keeps reviewing code, capsule criteria, scope and `.akrctx/review-policy.md` by reading files. APPROVED now requires a valid receipt in which every required command passed, plus an empty `issues` array. A judge record that claims a command passed without a matching receipt entry is rejected.

`akrctx judge verify` validates the receipt binding rather than re-running commands. `--run-tests` stays available as an explicit escape hatch for a caller who wants a fresh run. The existing flow stays usable during the transition.

Runner and judge run in sequence: the runner first, the judge second. Approval guarantees, snapshot immutability, disposable-copy isolation and exact-command approval are unchanged.

## Validation
```
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope
- Parallel execution of runner and judge; CLI orchestration of the external review agent.
- Commands declared in `.akrctx/review-policy.md`; the file keeps its read-only "add criteria" bound.
- Node version, architecture or operating system in the receipt binding.
- Jev or any external provider integration; proportional review depth; caching or skipping individual tests.
- Changing which commands a capsule declares, or the `## Validation` fence format.

## Clarifications
### Session 2026-09-19
- The judge stops executing the `## Validation` commands entirely. The runner is the only executor. This removes about 105s per review round and resolves the contradictory execution instructions at their root. The cost is accepted: the APPROVED rule must be rewritten, because today it requires the judge to have executed.
- A receipt is invalidated by a change to the snapshot digests, the normalized command list, or the lockfile digest. Node version and operating system are deliberately excluded, so that a `nvm use` does not force a full re-run. This keeps receipts reusable across review rounds and catch-up snapshots.
- Runner and judge run in sequence, not in parallel. Sequential already removes about 200s per round and needs no concurrent coordination in the CLI. The CLI does not launch the external judge agent today, so parallel execution would require building that coordination first. Parallelism can be reconsidered later using the timing data TASK-071 now produces.
- `.akrctx/review-policy.md` keeps its current bound and cannot declare commands. Its criteria are checked by reading files, so removing execution from the judge does not affect it.

## Open Questions
- A `review-policy.md` criterion that needs execution, such as a coverage threshold, cannot be measured by any component after this delivery. The gap already exists today: such a command is not in the `## Validation` fence, so it never counted as approval evidence. Document it as a known limitation and decide in a later delivery whether the policy file may declare optional commands.
- The receipt's storage location and retention are not yet decided. `.akrctx/local/judge/` is untracked and matches where judge records already live, but the pruning interaction with `akrctx judge prune` needs a decision during design.
