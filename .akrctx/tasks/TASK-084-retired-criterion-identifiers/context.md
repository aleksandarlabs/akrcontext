# Context

Config: task-fit workflow, judge enabled, comprehension gate disabled. This repository lands work
as direct commits on main. Shipped harness content lives in src/templates; TASK-079 supplies
the supported upgrade path for existing capsule templates.

## Relevant Files

- `src/task.ts` — `migrateAcceptanceCriteriaIdentifiers` walks the capsules and compares the
  regenerated text with the original to decide `changed`. `numberCriteria` holds
  `CRITERION_PREFIX_RE` and the unconditional renumbering from 1. Both arrived with TASK-075.
- `src/judge-enforcement.ts` — `readAcceptanceCriteria` reports `ids` and `problems`. It requires
  unique identifiers matching `AC-[1-9][0-9]*` and accepts a gap without comment. It is the other
  half of the disagreement.
- `src/cli/task.ts` — the `migrate-criteria` subcommand, with `--dry-run` and `--json`.
- `.akrctx/tasks/TASK-076-judge-round-accounting/acceptance-criteria.md`,
  `.akrctx/tasks/TASK-078-clarification-signal/acceptance-criteria.md`,
  `.akrctx/tasks/TASK-081-checklist-claim-classes/acceptance-criteria.md` — the three capsules with
  a retired identifier. They are the fixtures this task must protect.
- `.akrctx/tasks/TASK-075-judge-criterion-results/task.md` — the clarification that rejected
  positional references, and AC-3, which specified the migration without specifying this case.
- `tests/akrctx.test.ts` — the `task migrate-criteria` describe block holds the idempotency and
  renumbering tests that currently pin the wrong behaviour for a gapped file.

## Prior deliveries

- TASK-075 introduced `AC-<n>` identifiers and the migration command.

## Blocked Reads

- Secrets and credentials must not be read.

## Handoff

Contract closed on 2026-10-02 in task.md. The implementation brief is exports/codex.md.
Implementation is complete: reader and migration share identity validation, and migration only
adds missing prefixes above the active/retired maximum. Defective capsules are left untouched
and reported while bulk processing continues.
The Retired footer is declared in TASK-076, TASK-078 and TASK-081; parser enforcement
is implemented. The corpus dry-run checks 83 capsules with zero changes and zero defects.
