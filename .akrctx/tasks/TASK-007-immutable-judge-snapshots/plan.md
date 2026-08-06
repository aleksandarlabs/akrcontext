# Plan

## Workflow

SDD+TDD

## Steps

1. Define snapshot metadata, identity, integrity, and Git non-mutation contracts.
2. Add failing tests for capture stability, source non-mutation, and tamper detection.
3. Implement local snapshot capture and loading in a dedicated module.
4. Teach judge scope and verification to resolve `SNAPSHOT:<id>` candidates.
5. Add isolated snapshot validation and keep legacy validation unchanged.
6. Add current-state classification without invalidating historical approvals.
7. Add catch-up capture from a verified approved snapshot and delta-path calculation.
8. Update generated judge instructions and enforcement documentation.
9. Add CLI coverage for concise human output and complete JSON output.
10. Regenerate non-protected dogfooded artifacts through the CLI; do not edit installed
    copies by hand and do not edit protected root instructions without approval.
11. Complete the review checklist and run all required validation.
12. Address review findings with negative tests: remove blocked paths, isolate validation,
    validate current-state records, strengthen catch-up ancestry, use shallow Git storage,
    and add explicit snapshot retention.
13. Update the public Judge documentation and `CHANGELOG.md`, then report a direct-history
    commit message without opening a pull request or committing automatically.

## Implementation Notes

- Snapshot mechanics are internal. The primary-agent workflow can capture before handing
  off to a host-specific judge; the cross-host CLI does not pretend it can launch every
  host's subagent itself.
- `WORKTREE` remains the compatibility path. Snapshot mode is additive in this task.
