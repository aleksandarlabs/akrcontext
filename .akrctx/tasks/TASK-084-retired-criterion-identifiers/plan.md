# Plan

## Workflow

TDD.

Reason: this is a defect with live evidence and no new contract to design. Three real capsules
reproduce it today, so each becomes a test case before the code changes.
`workflowRules.bugfix` maps to TDD. One existing test pins the current renumbering behaviour, so
the first step is to decide, with the human, which part of that test described a requirement and
which part described an accident.

## Steps

1. Answer the open questions, starting with whether migration ever renumbers a valid identifier.
2. Write failing tests: a gapped file is left alone, a retired identifier survives, an unnumbered
   bullet still gets an identifier, and a duplicate is handled as the contract decides.
3. Revisit the existing `migrate-criteria` tests and correct the ones that pinned the accident.
4. Implement the change in `src/task.ts`.
5. Confirm `migrate-criteria --dry-run` reports no change across all 84 capsules.
