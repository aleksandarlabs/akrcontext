# Task

## Goal
Resolve the contradiction over where a task implementation log lives. The write policy tells agents to write it inside the capsule; the implementer contract and the design rationale place it outside, in Git-ignored local storage. Make one placement true everywhere.

## Contract
`.akrctx/local/impl/TASK-XXX/log.md`, with the short task ID and no slug, is the only implementation-log location. The write policy in every source template names that path. No template, instruction, or generated policy names a log inside `.akrctx/tasks/TASK-XXX/`.

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
- Moving or deleting existing capsule logs, automatically or by hand, in this delivery. Doctor reports; the human moves later.
- Cleaning TASK-071. Moving the TASK-072 log is a human step outside this diff.
- Changing `capsuleFiles`, the five canonical capsule files, or the digest algorithm.
- The runner-receipt redesign (TASK-072) and any latency work.
- Rewriting the historical content of logs already committed.

## Clarifications
### Session 2026-09-19
- The bug was found while closing TASK-071. The capsule log placement, not the review checklist, is the real defect. The checklist loop observed that day came from post-approval writes that TASK-051 already forbids, so it needs no code change.
- Doctor reports offending capsules rather than fixing them, because moving a tracked file out of a capsule changes a review boundary and can invalidate a standing approval.
- Existing capsule logs stay where they are. This delivery migrates none of the
  22 capsules that hold a `log.md`; the rule applies to new capsules only. Doctor
  reports every offending capsule and the human decides case by case. Reason:
  migration removes the file from Git, keeps its content only on one machine,
  and moves approved boundaries.
- The implementation log directory is created on first write. `akrctx task`
  gains no local-storage side effect; the existing `mkdir` in the `akrctx impl`
  store stays the only creator. `src/impl.ts` already does this at lines 374
  and 428.
- TASK-071 stays untouched, including its `log.md` and its post-approval
  checklist ticks. It is closed and approved, and its log holds the timing
  baseline TASK-072 uses. Doctor reports it like any other capsule.
- TASK-072 is open with no approval. Its `log.md` moves to
  `.akrctx/local/impl/TASK-072/log.md` before TASK-072
  starts. The human runs that move; it is outside this delivery's diff.
- The log path uses the short task ID with no slug:
  `.akrctx/local/impl/TASK-XXX/log.md`. Templates and generated policy
  name that form. This delivery changes wording only; `implLogPath` still keys
  the log by its raw argument. Normalizing it is a separate task.
- Existing installs are corrected by `akrctx upgrade`, not by hand. Upgrade
  removes the exact old default path from `writePolicy.implementationNotes` in
  `.akrctx/policy.json` (see the next entry), and replaces the exact old line in
  `.akrctx/wiki/write-policy.md` only when present. Customized values stay.
  This repository's two files are then regenerated with `akrctx upgrade`.
  Reason: upgrade keeps existing policy values and never overwrites an existing
  wiki page, so template changes alone never reach an existing install.
- Upgrade removes only the exact old entry from `implementationNotes`, then the
  ordinary string-array union adds the new default. `[old]` becomes `[new]`,
  `[X]` becomes `[new, X]`, `[old, X]` becomes `[new, X]`. The merge semantics
  do not change. Reason: the union predates this task and covers every policy
  list; a special case for one key is out of scope.
- This delivery runs `akrctx upgrade` once and keeps every file it regenerates.
  That includes three files with drift from TASK-071 (commit 510f0eb changed the
  templates but did not regenerate them): `.akrctx/judge/README.md`,
  `.claude/skills/akrctx-workflow/SKILL.md` and
  `.agents/skills/akrctx-workflow/SKILL.md`, plus `.akrctx/manifest.json`.
  They are declared here as out-of-goal regeneration, not new behavior.
- The human approved, in this conversation, the exact one-line diff to
  `CLAUDE.md` line 47. The new line matches `src/templates/instructions.ts`
  word for word. `AGENTS.md` carries no implementation-notes line and is not
  changed.

## Open Questions
- Should `implLogPath` normalize its argument to the short task ID? Today
  `akrctx impl start TASK-072` and `akrctx impl start TASK-072-judge-runner-receipts`
  write two different logs, and `.akrctx/local/impl/` already holds both forms.
  Normalizing orphans existing slug-named logs such as
  `TASK-020-project-review-policy`. Deferred to a follow-up task by decision on
  2026-09-19.
