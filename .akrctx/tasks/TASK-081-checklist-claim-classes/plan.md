# Plan

## Workflow

TDD

Reason: the scoped change aligns two generated checklist producers with the existing
TASK-051 rule. Template regression tests pin the distinction and the absence of a
post-approval checkbox. No runtime parser or verification contract is being introduced.

## Steps

1. Read TASK-051 and inventory duplicated mechanical claims in both checklist producers.
2. Write failing template tests for evidence references, actor-labelled self-attestations,
   backward compatibility and the absence of post-approval writes.
3. Simplify the shipped checklist and task generator using the recorded plain-section contract.
4. Update only relevant guidance, without a verify parser or new gate.
5. Regenerate installed templates through the CLI after TASK-079 provides the upgrade path.
