# TASK-080 — A review lane for mechanical changes

## Goal

Add reproducibility evidence for explicitly declared mechanical changes. Run a reviewed,
approved generator against a disposable copy of the base, then compare generated paths to
the candidate. The judge still reviews generator correctness and all non-generated changes;
reproduction alone does not establish semantic correctness.

## Problem evidence
TASK-075 migrated the acceptance criteria of 73 capsules with one CLI command. Two consequences
followed, both avoidable.

`akrctx judge scope` fails closed when the boundary contains a foreign task capsule. With 73
migrated capsules in the boundary, a single snapshot would need `--include-task` repeated 73
times. The implementing agent instead invented an unspecified two-commit split and explained it
in prose: one commit for the migration, one for the contract change. The harness gave no guidance
for a change class it had just made easy to produce.

A reviewer reading that boundary gets 73 near-identical diffs. The useful question is not "is
each diff correct" but "does the declared command produce exactly this". Nothing lets the judge
ask that. The precedent already exists for validation: `akrctx judge verify --run-tests` re-runs
declared commands in a disposable copy rather than trusting a claim.

## Contract

Scope constraints from the design review:

- Reproduction starts from base content. Candidate idempotency is insufficient evidence.
- The declaration must identify generator provenance and permitted output paths, separately
  from ordinary code changes. Both the generator and any candidate-derived bootstrap inputs
  require review and exact operator approval.
- Foreign-capsule exemptions cover only declared paths whose delta is reproduced exactly.
  Other foreign capsule paths stay fail-closed; a generator's self-reported writes are not
  sufficient authorization. Unexpected writes in the reproduction workspace are errors.
- Dependency and tool materialization must be specified for the chosen base and generator;
  do not silently inherit arbitrary tools or dependencies from the live project.
- Run outside the live project, without mutating the canonical snapshot. This is process
  isolation for normal relative writes, not an OS sandbox against malicious absolute writes.
- TASK-072's proposed receipt runner is pending. This feature must reuse the currently
  implemented disposable workspace and command-approval guarantees, or declare a dependency
  on a separately completed runner delivery.

Generator bootstrapping and pre-scope authorization remain unresolved; this capsule is not
implementation-ready until the questions below are answered.

## Validation
```
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope
- Relaxing the foreign-capsule rule for ordinary work. It stays fail-closed. A mechanical lane
  is an explicit, declared exception, never an inference.
- Running anything without operator approval. The existing approval flow for declared commands
  applies unchanged, including `--approve-commands` when headless.
- Treating a mechanical change as unreviewable. Reproduction is evidence about the result, not a
  reason to skip reading the command that produced it.
- Automatic classification of a change as mechanical.

## Clarifications

Ambiguity resolved with the human before implementation. One answer per top-level `- ` bullet.

### Session 2026-10-01
- The user requested corrections to these capsules after the design review. This revision
  applies the scope and consistency corrections from that review; it does not implement the
  proposed CLI features. Unresolved contract choices remain under Open Questions.

## Open Questions

- What generator source is allowed when the command is introduced in the candidate itself?
  TASK-075's migration command did not exist in its base. Choose a separately reviewed tool
  boundary, explicit candidate-derived bootstrap inputs, or a two-step delivery; specify what
  is trusted, built and reviewed before execution.
- How are generator provenance and permitted output paths declared, and how does capture
  admit those foreign capsule paths before reproduction can run? Specify a provisional
  capture authorization distinct from verified reproduction, without weakening ordinary scope.
- Which manifest properties are compared: additions, deletions, bytes, executable modes and
  symlink targets? Define generated-path comparison, unexpected-write detection and handling
  of non-generated candidate code changes.
- What dependency/tool preparation and ordered approval list applies to bootstrap steps and
  generation? The operator must see every shell command that can execute, not only the final
  generator invocation.
