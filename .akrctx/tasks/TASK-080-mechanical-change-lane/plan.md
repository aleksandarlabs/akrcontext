# Plan

## Workflow

SDD+TDD.

Reason: this adds an execution channel to the judge pipeline, so the contract must be written and
read by a human before any code exists (SDD). The reproduction rule, the path-scope rule and the
interaction with the foreign-capsule rule are pure decision logic that tests must pin first
(TDD). `workflowRules.apiOrContract` maps to SDD+TDD. The security surface is the reason the
specification step is not optional here: a declared generator command writes by design.

## Steps

1. Use the closed two-step contract; keep the generator's prior review distinct from this lane.
2. Write failing declaration/provenance tests, including absent-base and modified generators.
3. Cover exact foreign-task capture authorization and ordered approval of all preparation and
   generation commands before execution; do not introduce automatic scope exemptions.
4. Implement isolated tool preparation and reproduction from base with the full path manifest.
5. Test mode/symlink/add/delete drift and detected out-of-path writes, including ignored output.
6. Reproduce TASK-075 in a labelled two-step fixture, then update shipped contract/instructions.
