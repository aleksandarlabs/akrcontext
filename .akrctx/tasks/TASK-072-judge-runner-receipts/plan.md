# Plan

## Workflow
SDD+TDD. This delivery changes the approval contract and the receipt is a new public data shape, so define both first. Write failing tests for binding invalidation and for the rejection of an unbacked passed claim before implementation.

## Steps
1. Define the receipt shape and the four binding fields. Record the contract before code.
2. Red tests: binding invalidation per field, unbacked passed claim rejected, receipt reuse across a catch-up snapshot.
3. Implement `akrctx judge run` over the existing disposable-copy and digest machinery.
4. Rewrite the APPROVED rule and `judge verify` to read the receipt. Keep `--run-tests` as an escape hatch.
5. Update shipped templates and docs so one executor is described. Regenerate installed files; never hand-edit them.
6. Measure the new pipeline with `--timings` and compare against the TASK-071 baseline.
7. Run handoff checks, update the checklist, offer independent judge review under repository approval rules.
