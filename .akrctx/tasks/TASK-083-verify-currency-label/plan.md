# Plan

## Workflow

fast-patch.

Reason: the defect is a few presentation lines in `src/cli/judge.ts`, and the facts they report
are already computed and already in the JSON output. No contract changes, no new data, no
behaviour change to any verdict. `workflowRules.smallSafePatch` maps to fast-patch, and
`defaults.workflow` is task-fit, so this is the smallest workflow that fits. The wording and null
behavior are recorded in task.md; this capsule correction does not implement the CLI change.

## Steps

1. Extend existing CLI coverage for the fixed approval header and all reviewBoundary labels,
   including legacy, unobserved-validation and null cases.
2. Change the human-readable header and add the separate existing-state label.
3. Verify unchanged JSON, verdict and exit behavior without adding boundary computations.
