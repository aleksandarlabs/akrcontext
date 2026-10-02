# Plan

## Workflow

SDD+TDD.

Reason: this adds an execution channel to the judge pipeline, so the contract must be written and
read by a human before any code exists (SDD). The reproduction rule, the path-scope rule and the
interaction with the foreign-capsule rule are pure decision logic that tests must pin first
(TDD). `workflowRules.apiOrContract` maps to SDD+TDD. The security surface is the reason the
specification step is not optional here: a declared generator command writes by design.

## Steps

1. Resolve generator provenance/bootstrapping and provisional foreign-path capture authorization.
2. Specify base workspace preparation, output-path comparison and every approved shell step.
3. Write failing tests for parsing, absent-base generators, unexpected writes, unreproduced
   deltas, non-generated changes and approval refusal.
4. Implement declared scope authorization and reproduction using current workspace guarantees.
5. Replay TASK-075 with explicit provenance, reviewing generator code as well as reproduction.
6. Update shipped contracts and instructions, then regenerate through supported CLI paths.
