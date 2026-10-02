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

**Draft, not confirmed.** The decisions below come from the assistant's recommendations and a
reviewing agent's refinements. No human confirmed them. Each one is listed under
`## Open Questions` for confirmation. Implementation must not start until they move to
`## Clarifications` with the human's answer.

### Two-step delivery and generator provenance

First land and independently review the generator as ordinary code. Only a later commit
may declare its use for a mechanical change. The generator and its required build inputs
must already be present in the mechanical review's base; no candidate-derived bootstrap,
tool source, dependency change or self-declared generator is accepted.

Name a stored, verified APPROVED review record for the generator's ordinary-code boundary.
Name the landed generator commit and require it to be an ancestor of the mechanical base.
Generator source/build inputs must match both the verified reviewed content and that commit;
a snapshot's private synthetic commit need not be an ancestor of the live branch. Ancestry
alone does not approve subsequent tool modifications. Missing provenance refuses the lane.
Capture and re-verify that provenance locally; it creates no transferable trusted receipt.

### Declaration and capture

Use one fenced JSON object under `## Migration`, with generator and paths keys. Example:

```json
{
  "generator": {
    "command": "node \"$AKRCTX_GENERATOR_ROOT/tools/migrate.mjs\"",
    "commit": "<full-landed-generator-commit-sha>",
    "review": ".akrctx/local/judge/generator-approved.json",
    "inputs": ["tools/migrate.mjs", "package.json", "pnpm-lock.yaml"],
    "prepare": []
  },
  "paths": [".akrctx/tasks/TASK-001-example/acceptance-criteria.md"]
}
```

generator.command is the shell invocation; commit is the full landed Git SHA; review locates
local prior approval; inputs lists exact repository-relative source/build files whose provenance
is checked; prepare is an
ordered list of shell commands for environment/dependency preparation using only base inputs.
The runner sets AKRCTX_GENERATOR_ROOT to its external disposable tool workspace and displays
that binding with the exact shell command before approval; base-relative input paths are
preserved under that root. Reject unknown keys, missing/empty required strings, empty inputs
or paths, malformed prepare lists, duplicate inputs/paths and unsafe paths. Empty prepare is
valid for a generator needing no preparation. paths contains exact normalized
repository-relative output paths, not globs or directory-wide implicit authorization. Reject
absolute paths, traversal, blocked paths, .git paths and escaping symlink ancestors.

Capture still needs --include-task for every foreign capsule. That authorizes review scope,
never generator execution or successful reproduction. A declaration cannot bypass it. No
automatic foreign-task exemption is added; verified reproduction is separate evidence.

### Preparation, approval and comparison

Prepare the tool and dependencies in an external disposable tool workspace from the reviewed
base inputs and committed lockfile. No inherited live node_modules or candidate tool inputs.
Build the complete ordered list of shell commands scheduled by the runner before executing any:
preparation, dependency materialization/build commands and generation. Require the existing operator
approval flow; headless --approve-commands must match every exact command in order.
Here preparation is environment setup, never bootstrap of a candidate-created generator.

Run generation against a separate disposable reproduction worktree initialized from the
base. Compare permitted output paths to the candidate by bytes, existence (additions/deletions),
executable bit, file type and symlink target without following the target. Any detected write
inside that reproduction worktree outside paths is an error, including ignored outputs and
write-then-restore changes detectable by the existing integrity machinery. Preparation outputs
belong in the external tool workspace, not in the reproduction worktree.

Match every declared generated delta exactly. A no-op run on the candidate proves only
idempotency and is insufficient. Non-generated candidate changes require ordinary review;
generator modifications require a new first-step review rather than approval by reproduction.
Leave the live project and canonical snapshot unchanged. This is process isolation, not an
OS sandbox or a guarantee of observing malicious writes outside the disposable workspaces.

Replay TASK-075 as an adapted two-step fixture: first place/review its generator in the base,
then reproduce the criterion migration. Do not claim to run a nonexistent generator in the
original historical base. TASK-072 remains pending and is not an implicit dependency.

## Validation
```
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope
- Relaxing or bypassing the foreign-capsule rule. Explicit --include-task remains required
  for mechanical work as well as ordinary work.
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

### Session 2026-10-02
- The human reviewed the provenance of this capsule's contract and returned its decisions to
  `## Open Questions`. The contract had recorded them as the human's own, which was false: they
  came from the assistant's recommendations and a reviewing agent's refinements. One of three
  comparable recommendations was already reversed by the human in TASK-084 once its consequence
  was shown, so an unconfirmed recommendation is not treated as an answer.

## Open Questions

- Confirm the two-step delivery. Draft: the generator lands and is reviewed as ordinary code
  first, and only a later mechanical change may declare it, using the unchanged generator from its
  base. Bootstrapping a generator from the candidate is disallowed.
- Confirm the declaration and the capture authorization. Draft: `generator` and `paths` keys in a
  fenced JSON Migration declaration, with provenance referencing a verified ordinary-code review
  and exact base inputs. Explicit `--include-task` stays required, separately from reproduction.
- Confirm what the comparison covers. Draft: byte content, additions and deletions, executable
  mode and symlink target. A write outside the declared paths is an error, not a warning.
- Confirm the preparation and the approval list. Draft: every environment-preparation and
  generation command appears in the ordered approval list, and preparation runs in an external
  tool workspace so reproduction cannot write without authorization. Bootstrap here means
  environment preparation only, never candidate-derived tool code.
