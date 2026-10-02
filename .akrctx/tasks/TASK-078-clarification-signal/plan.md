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

1. Use the closed heuristic contract and the documented normalization limits.
2. Pin examples for reflow/full stops, meaningful punctuation, structured declarations, new
   clarification bullets, placeholders, duplicate bullets and No ambiguity explanations.
3. Cover snapshot/commit-ref comparison and explicit unsupported/unavailable diagnostics.
4. Cover TASK-075 as inconclusive and all listed false-positive/false-negative boundaries.
5. Implement bounded notices and verify unchanged verdicts and absence of live fallback.
