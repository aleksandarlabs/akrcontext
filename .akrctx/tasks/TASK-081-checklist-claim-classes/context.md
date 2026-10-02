# Context

Config: task-fit workflow, judge enabled, comprehension gate disabled. This repository lands
work as direct commits on main. Shipped harness content lives in src/templates. Managed files
use CLI regeneration; existing capsule templates currently remain on the preserve path until
TASK-079 is implemented.

## Relevant Files

- `src/templates/wiki.ts` — `capsuleTemplates["review-checklist.md"]`, the shipped checklist.
- `src/task.ts` — `reviewMarkdown` generates the checklist for a new capsule.
- `src/judge-enforcement.ts` — existing validation and AC evidence are reference targets;
  no new checklist parser or verify notice is part of this delivery.
- `src/templates/instructions.ts` — concise task/review guidance for the revised checklist.
- TASK-079 — prerequisite for supported capsule-template regeneration.
- `.akrctx/policy.json` — `enforcement.requireReviewChecklist: true`.
- `src/doctor.ts` — checks that the capsule files exist, not what they say.
- `.akrctx/tasks/TASK-051-*/` — the recorded decision about `review-checklist.md`. Read before
  changing the file's role.
- `.akrctx/tasks/TASK-075-judge-criterion-results/review-checklist.md` — the twelve self-ticked
  boxes that motivate this task.

## Prior deliveries

- TASK-051 decided the role of `review-checklist.md`.
- TASK-075 produced the worked example of a self-graded checklist.

## Blocked Reads

- Secrets and credentials must not be read.
