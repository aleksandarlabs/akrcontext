# Plan

## Workflow

SDD+TDD

Reason: round identity and historical completion are reporting contracts. Specify them first,
then pin duplicate handling, ambiguous evidence and aggregation with fixture tests. This
matches workflowRules.apiOrContract and keeps storage changes outside the delivery.

## Steps

1. Use the closed accounting contract and Session 2026-10-02 decisions.
2. Write failing fixtures for legacy record locations, duplicate keys, equivalent UTC times,
   conflicting verdicts/independence/statuses, missing fields, tie ordering and catch-up metadata.
3. Implement the read-only reader, diagnostics and closed/open aggregation.
4. Pin identical human/JSON information, task filtering and empty-group behavior.
5. Compare the current cohort to the labelled 2.23 baseline in the implementation log.
