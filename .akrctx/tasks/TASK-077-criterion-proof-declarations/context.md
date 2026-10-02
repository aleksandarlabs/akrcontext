# Context

Config: task-fit workflow, judge enabled, comprehension gate disabled. This repository lands
work as direct commits on main. Shipped harness content lives in src/templates. Managed files
use CLI regeneration; existing capsule templates currently remain on the preserve path until
TASK-079 is implemented.

## Relevant Files

- `src/judge-enforcement.ts` — `readAcceptanceCriteria` parses the `AC-<n>` bullets and joins
  indented continuation lines. Any proof syntax is parsed here. `verifyJudgeRecord` holds the
  criteria agreement rules and the APPROVED rule; a binding proof check belongs there.
  `readValidationDeclaration` already parses the `## Validation` fence, including the
  `# optional` suffix, and is the precedent for a trailing marker on a line.
- `src/templates/judge.ts` — the shipped judge instructions. They tell the judge to report one
  result per identifier and would have to describe how a declared proof constrains it.
- `src/templates/judge-contract.ts` — the review JSON Schema and the shipped contract README.
- `src/templates/wiki.ts` — `capsuleTemplates["acceptance-criteria.md"]`, the shipped template.
- `src/task.ts` — `acceptanceMarkdown` generates `AC-1` to `AC-4` for a new capsule;
  `migrateAcceptanceCriteriaIdentifiers` and `numberCriteria` hold the TASK-075 migration.
- `src/templates/instructions.ts` — the `akrctx-task` skill body carries the criterion
  identifier rules a proof syntax must join.
- Existing `acceptance-criteria.md` files — backward compatibility fixtures, not migration targets.
- TASK-079 — prerequisite for supported capsule-template upgrades.
- `verifyJudgeRecord` currently records command-level outcomes, not structured per-test results;
  TASK-072's proposed receipt runner remains pending and must not be assumed available.

## Prior deliveries

- TASK-075 introduced `AC-<n>` identifiers, `criteria[]`, `observations[]` and schema 6.
- TASK-067 made every required validation command verifiable, including the `# optional` suffix.

## Blocked Reads

- Secrets and credentials must not be read.
