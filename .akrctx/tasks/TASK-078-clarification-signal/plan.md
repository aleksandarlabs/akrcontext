# Plan

## Workflow

SDD+EDD.

Reason: the whole risk of this task is at the edges. A heuristic that fires on honest work
teaches the reader to ignore notices, which is worse than no notice. The trigger rule must be
written before code (SDD), and the work must then be driven by the cases that break it (EDD):
a capsule that needed no question, a second session on the same day, a specified formatting-only edit, a renamed section, a newly introduced capsule, a capsule
that predates the step and a contract written before the boundary opened. Semantic prose-only
classification is not a mechanical guarantee. `workflowRules.edgeCases` maps to SDD+EDD.

## Steps

1. Resolve the experimental trigger, ignored transformations and unsupported-boundary reporting.
2. Write the bounded, non-accusatory notice contract before implementation.
3. Enumerate observable cases and known false positives/negatives; do not claim universal
   separation of prose-only edits from changed requirements.
4. Write edge-case tests, including TASK-075 as an inconclusive first-added capsule.
5. Implement only the limited comparison and verify that verdicts remain unchanged.
