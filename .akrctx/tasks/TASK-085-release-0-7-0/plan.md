# Plan

## Workflow

research-first.

Reason: the work is documentation and a version bump, with no feature code. The risk is
describing behavior wrongly, so the content must come from reading the merged code and the
capsules' confirmed contracts first. `workflowRules.unknownArea` maps to research-first; no
behavior change exists to drive with tests.

## Steps

1. List the commits from `v0.6.0` to HEAD and map each to its capsule.
2. Read each capsule's Contract and Clarifications, and check the merged behavior in code or tests.
3. Write the CHANGELOG entries and doc updates.
4. Apply release steps 1 to 5 of `docs/RELEASE_CHECKLIST.md`.
5. Regenerate version-dependent files through the CLI if the bump changes them.
6. Run every Validation command, then propose the commit and the tag command.
