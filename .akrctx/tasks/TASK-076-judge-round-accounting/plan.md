# Plan

## Workflow

SDD+TDD

Reason: round identity and historical completion are reporting contracts. Specify them first,
then pin duplicate handling, ambiguous evidence and aggregation with fixture tests. This
matches workflowRules.apiOrContract and keeps storage changes outside the delivery.

## Steps

1. Resolve round identity, supported legacy evidence and JSON reporting questions.
2. Complete the counting contract before implementation.
3. Write failing fixture tests for duplicate copies, distinct judgments, catch-up categories,
   incomplete tasks, contradictory latest verdicts and all historical record locations.
4. Implement the read-only reader and `akrctx judge rounds`.
5. Compare the recalculated cohort to the labelled 2.23 baseline and explain differences.
