# Plan

## Workflow

TDD

Exact reproduction, small deterministic fix; `workflowRules.bugfix` is `TDD`.

## Steps

1. Write a failing test: run `runDoctor` twice against the same temp project; assert the
   wiki report files' bytes are identical after the second run when findings are
   unchanged.
2. Write a second test: change the underlying state (e.g. remove a required file),
   rerun, assert the timestamp *does* advance.
3. Implement: when regenerating a report, compare the new body (excluding the
   `timestamp:` line) with the existing file; if equal, skip the write entirely —
   reusing TASK-012's content-comparison path if applicable.
4. Run validation commands.
