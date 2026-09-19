# Task

## Goal
Resolve the contradiction over where a task implementation log lives. The write policy tells agents to write it inside the capsule; the implementer contract and the design rationale place it outside, in Git-ignored local storage. Make one placement true everywhere.

## Contract
`.akrctx/local/impl/<TASK-ID>/log.md` is the only implementation-log location. The write policy in every source template names that path. No template, instruction, or generated policy names a log inside `.akrctx/tasks/TASK-XXX/`.

`src/impl.ts` states why the placement is load-bearing: a log inside the capsule is a tracked file in the review diff, which lets the judge read the implementing agent's own account as evidence. The judge contract forbids exactly that. The placement also keeps `taskDigest` stable across implementation rounds, because `capsuleFiles` stays at five entries.

`akrctx doctor` reports a capsule that holds a `log.md` as a finding, names the task, and states that the file is inside the reviewed boundary. Doctor reports it; the human decides whether to move it. Doctor never moves or deletes a log by itself.

Protected root instruction files are corrected through the Doctor path only: an exact minimal diff shown first, approved explicitly by the human in the same conversation.

## Validation
```
pnpm exec vitest run tests/agent-templates.test.ts
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope
- Excluding `review-checklist.md` from `taskDigest`. TASK-051 decided this: the checklist is completed before the snapshot, and the verified judge record is the evidence that review finished. Do not reopen it.
- Moving or deleting existing capsule logs automatically. Doctor reports; the human moves.
- Changing `capsuleFiles`, the five canonical capsule files, or the digest algorithm.
- The runner-receipt redesign (TASK-072) and any latency work.
- Rewriting the historical content of logs already committed.

## Clarifications
### Session 2026-09-19
- The bug was found while closing TASK-071. The capsule log placement, not the review checklist, is the real defect. The checklist loop observed that day came from post-approval writes that TASK-051 already forbids, so it needs no code change.
- Doctor reports offending capsules rather than fixing them, because moving a tracked file out of a capsule changes a review boundary and can invalidate a standing approval.

## Open Questions
- Should the 22 existing capsules that already hold a `log.md` be migrated, and in which delivery? Migration removes a tracked file from each capsule and moves the boundary for any task with a standing approval. A decision is needed on whether to migrate all of them at once, migrate only capsules with no standing approval, or leave history untouched and apply the rule to new capsules only.
- Should `akrctx task` create `.akrctx/local/impl/<TASK-ID>/` when it creates a capsule, or should the implementer create it on first write? Creating it early makes the location discoverable; creating it late keeps `akrctx task` free of local-storage side effects.
- TASK-071 and TASK-072 currently hold a `log.md` inside the capsule, written under the old policy. TASK-071's checklist also carries post-approval ticks that TASK-051 forbids. Both need a cleanup decision alongside the migration question above.
