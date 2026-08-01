# Plan

## Workflow

SDD+TDD

## Reason

`defaults.workflow` is `task-fit`. This task needed both halves, so the combined
workflow is the smallest honest fit.

The SDD half: the deliverable changes a contract. `review.schema.json` is consumed by
installed harnesses, and the fix required deciding what a verified approval *claims*
before writing any check. That decision — bind the evidence, not the authorship — is
the design, and it is what ruled out the nonce handshake recorded in `context.md`.
Writing tests first would have pinned the wrong contract.

The TDD half: every rule that followed from that contract is a silent-failure branch,
exactly like TASK-002. A wrong rule does not throw; it opens the gate. Each rule got a
failing test before its implementation.

`requireWorkflowReason` is true in config, so this section is required rather than
optional.

## Steps

1. Bound the boundary: exclude policy-blocked paths from the diff via Git pathspecs,
   record them by path in `excludedPaths`, and digest the path list. (blocked paths)
2. Unify tracked and untracked handling on exclude-and-report; drop the abort.
3. Add `cliVersion` to the scope, bump the contract to v2, and reject version drift.
4. Parse `## Validation` from the capsule and require an APPROVED record to be backed
   by a declared command. (evidence binding)
5. Add `--run-tests` to re-execute those commands, restricted to the declared set.
6. Emit `## Validation` from `taskMarkdown` and the shipped `_template`.
7. Rewrite the judge instructions and both contract documents to state the rules and
   the residual trust gap.
8. Run `pnpm test` and `pnpm lint`; regenerate installed files via `akrctx upgrade`.

## Notes

`judge.enabled` is true with `trigger: post-implementation`, but the developer
explicitly declined a judge pass for this change. `comprehensionGate.enabled` is false.

This capsule was written after implementation, not before. That is a process failure
against the mandatory behavior in CLAUDE.md — the capsule is supposed to precede the
work. It is recorded here rather than backdated, and the content describes what was
actually built and why, including the design that was rejected mid-task.
