# Plan

## Workflow

TDD.

Reason: the behaviour is already specified elsewhere. policy.json declares
`mergeStrategy: "preserve-and-suggest"`, and the suggested-file path for root instructions
already implements it. This task routes one more file class through an existing contract rather
than inventing one, so no separate specification step is needed. The risk is a regression that
overwrites project content, which is exactly what a failing test should pin first.
`workflowRules.bugfix` maps to TDD, and the current claim in the repository is false, so this is
a bug.

## Steps

1. Pin the recorded contract with failing tests for verified untouched, personalized, missing,
   already-identical and differing-unprovenanced templates, including invalid manifests.
2. Add only capsuleFiles template paths to the manifest-managed class and upgrade-managed map.
3. Remove those paths from project-knowledge routing while preserving wiki behavior.
4. Verify fresh-install hashes, eligible-upgrade equivalence and repeated candidate handling.
5. Verify upgrade dry-run names drift without writing files or provenance.
