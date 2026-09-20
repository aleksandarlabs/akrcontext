# Plan

## Workflow
SDD+TDD. The accepted task-ID forms are a CLI contract and the log path is
load-bearing for the attempt budget. Define the contract first, then write
failing tests before implementation.

## Steps
1. Resolve the open questions with the human and record them.
2. Red tests for each accepted and rejected input form and for existing logs.
3. Implement the resolution in `implLogPath` and its callers.
4. Update docs and the changelog.
5. Run handoff checks. Complete the checklist before any snapshot, per TASK-051.
6. Offer independent judge review under repository approval rules.
