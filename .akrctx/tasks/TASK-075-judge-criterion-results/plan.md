# Plan

## Workflow

SDD+TDD.

Reason: the change alters the judge review contract. `JUDGE_SCHEMA_VERSION` moves from 5,
the APPROVED rule changes shape, and 74 existing capsules plus every stored record must keep
verifying. A contract change needs a written specification before code (SDD), and the
enforcement rules are pure decision logic that must be pinned by tests first (TDD).
`workflowRules.apiOrContract` maps to SDD+TDD, and `defaults.workflow` is task-fit, so this
is the smallest workflow that fits.

## Steps

1. Answer the open contract questions in task.md.
2. Write the contract in task.md under `## Contract`.
3. Derive acceptance-criteria.md from the contract.
4. Write failing tests for record validation and for the APPROVED rule.
5. Implement the schema change and the enforcement change.
6. Regenerate shipped harness files from src/templates.
7. Measure rounds to APPROVED against the historical baseline.
