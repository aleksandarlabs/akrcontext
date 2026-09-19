# Context

Relevant source: src/cli/judge.ts, src/judge-enforcement.ts (verify flow, runTests at line 386), src/judge-snapshot.ts (createJudgeSnapshotValidationWorkspace at line 429, review digests at lines 53-55), src/templates/judge.ts (execution contract at line 77), src/templates/instructions.ts, src/judge-timings.ts.

The binding infrastructure already exists: a snapshot carries reviewContentDigest, reviewWorkspaceDigest and artifactContentDigest. `verify --run-tests` already runs commands in its own isolated disposable copy bound to the snapshot. The defect is ordering, not capability: that runner executes last and duplicates the judge instead of executing first and replacing it.

TASK-071 baseline, measured by the shipped --timings instrumentation: one review round ran the five declared commands three times — implementation ~102000ms, judge disposable copy ~105500ms, verify re-execution ~107000ms. `pnpm test` is 93% of each run. Workspace copy is 192ms, dependency preparation 3007ms, approval wait 0.1ms.

Config: task-fit workflow, judge enabled, comprehension gate disabled. This repository lands work as direct commits on main. Installed harness files are regenerated from src/templates, never hand-edited.
