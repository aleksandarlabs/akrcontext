# Context

Config: task-fit workflow, judge enabled, comprehension gate disabled. This repository lands
work as direct commits on main. Shipped harness content lives in src/templates. Managed files
use CLI regeneration; existing capsule templates currently remain on the preserve path until
TASK-079 is implemented.

## Relevant Files

- `src/judge-enforcement.ts` — `readClarificationState` reads the bullets under
  `## Clarifications` and `## Open Questions`, with `clarificationsSectionPresent` for capsules
  that predate the step. `sectionBody` tolerates a `### Session` heading inside the section.
  `verifyJudgeRecord` already emits the open-question notice; this one joins it.
- `src/judge-snapshot.ts` — snapshot capture. A base-versus-candidate comparison of capsule files
  needs the base content, which the snapshot and the scope's `baseCommit` both provide.
- `src/cli/judge.ts` — prints `result.notices` in the verify output, one line each.
- `src/templates/instructions.ts` — the clarification rules, in the root instruction text and in
  the `akrctx-task` skill body. Root instructions are protected.
- `.akrctx/tasks/TASK-075-judge-criterion-results/task.md` and commit 93506b5 — an
  inconclusive historical case: Contract and populated Clarifications were introduced together.
- `src/doctor.ts`, `src/cli/doctor.ts` — background only; this boundary-dependent signal stays
  in verify and introduces no repository-wide Doctor heuristic.

## Prior deliveries

- TASK-006 introduced the clarification gate, in four review rounds.
- TASK-075 added per-criterion results and demonstrates the limits of inferring consultation
  from a capsule diff.

## Blocked Reads

- Secrets and credentials must not be read.
