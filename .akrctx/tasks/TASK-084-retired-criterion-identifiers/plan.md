# Plan

## Workflow

SDD+TDD

Reason: the reported bug needs regression tests, and the agreed Retired footer adds a small
machine-readable contract shared by the reader and migrator. Record that contract first,
then implement against failing tests, following workflowRules.apiOrContract.

## Steps

1. Use the closed contract and Session 2026-10-02 decisions; do not reopen settled choices.
2. Write failing tests for gaps, explicit retirements, max-based allocation, duplicates,
   malformed IDs, overlap, unchanged bytes/mtime, dry-run and second-pass idempotency.
3. Replace tests that encoded unconditional renumbering, explaining why that behavior was a bug.
4. Share identity/retirement rules between migration and the acceptance-criteria reader.
5. Confirm the retirement footers in TASK-076, TASK-078 and TASK-081, then validate the corpus
   with dry-run. Never run the current unfixed migrator in write mode against these capsules.
