# TASK-084 — Preserve a retired criterion identifier

## Goal

Stop `akrctx task migrate-criteria` from reassigning an identifier that a capsule retired on
purpose. A criterion identifier must keep pointing at the same criterion for the life of the
capsule, which is the reason identifiers exist.

## Problem evidence

Three capsules retire an identifier deliberately. TASK-076 and TASK-078 retire `AC-5` after a
design review removed the criterion, and TASK-081 retires `AC-2` and `AC-3`. Each records the
retirement in its `## Contract` section and states that the identifier must not be reused.

At discovery, before adding the contract-closure criteria below,
`akrctx task migrate-criteria --dry-run` reported all three as needing migration:

```
  ! .akrctx/tasks/TASK-076-judge-round-accounting/acceptance-criteria.md  11 criteria
  ! .akrctx/tasks/TASK-078-clarification-signal/acceptance-criteria.md  10 criteria
  ! .akrctx/tasks/TASK-081-checklist-claim-classes/acceptance-criteria.md  9 criteria
```

`numberCriteria` in `src/task.ts` rewrites every top-level bullet as `AC-<n>` counting from 1,
then the caller compares the result with the original text and reports a change. For a capsule
with a gap, the command therefore moves every later criterion up by one and reassigns a retired
identifier to a different criterion. A review record written against the old numbering would then
point at the wrong criterion, silently.

The two halves of the harness disagree. `readAcceptanceCriteria` accepts a gap and reports no
problem, because it only requires uniqueness and a valid shape. The migration command treats the
same file as needing repair. TASK-075 introduced both and its AC-3 asked only that the CLI
"migrates existing capsules to identifiers mechanically, without human editing". Nothing said what
a mechanical pass must do to a capsule that is already correct.

TASK-075's own clarification stated the principle this defect breaks: positional indexes were
rejected because "a bullet inserted or reordered between round 1 and round 2 would silently
repoint an existing finding". The migration command reintroduces exactly that failure.

## Contract

Migration preserves every existing valid `AC-<n>` identifier and its association with the
criterion. It adds identifiers only to top-level criterion bullets that have none.

Retirements are declared at the end of acceptance-criteria.md, after all criteria, with one
unindented non-bullet line per identifier: `Retired: AC-5`. Multiple retirements use multiple
lines. These lines are metadata, not criteria, and never require judge results.

Allocation scans the entire file before editing. The next identifier is one greater than the
maximum of active and retired identifiers, or AC-1 when both sets are empty. Assign further
unnumbered bullets successive identifiers in document order. Never fill a gap or reuse a
retirement; a gap without a retirement declaration remains valid but does not prove history.

Duplicate active identifiers, duplicate retirements, active/retired overlap, malformed
retirement lines, or a malformed AC-like identifier are capsule defects. Report file and line
and refuse to write that capsule; never repair these by renumbering. A bulk run may still
process other valid capsules but must report the failed capsules and exit non-zero.

Preserve all existing bytes except the identifier prefixes inserted into unnumbered bullets.
A no-op returns `changed: false`, does not write, and produces no planned write in dry-run.
Dry-run uses the same classification and allocation rules without applying changes.

The reader and migrator share active/retired validity rules. The reader reports unnumbered
bullets as defects; migration can repair only that defect automatically. Retired identifiers
are excluded from the live criterion set, preserving the record schema and APPROVED rule.

Add explicit retirement metadata for the known removals in TASK-076, TASK-078 and TASK-081.
This documents established removals and changes no active identifier or criterion meaning.

## Workflow

SDD+TDD: preserve the closed identity contract and reproduce migration defects in failing tests
before implementation. Independent judge review is authorized by the user on 2026-10-02.

## Validation
```
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope

- Changing the active identifier format, review record schema or APPROVED rule from TASK-075.
- Renumbering existing criteria, guessing undeclared historical retirements or filling gaps.
- Automatically repairing duplicates, malformed identity metadata or active/retired overlap.

## Clarifications

Ambiguity resolved with the human before implementation. One answer per top-level `- ` bullet.

### Session 2026-10-02
- The user proposed preserving valid identifiers, declaring retirements with `Retired: AC-5`,
  allocating above the maximum active/retired number, and reporting no-op as changed: false.
  These decisions are adopted.
- Under the delegated decision authority, duplicate or malformed identity metadata is a
  reported defect and prevents writes to that capsule. It is never silently renumbered.
  Retirement metadata is a footer with one non-bullet line per identifier.
- Confirmed directly with the human: migration only adds an identifier to a bullet that has none,
  and never changes one that is already valid. Renumbering only the defective files was rejected,
  because a file with one unnumbered bullet would still reassign a retired identifier. Keeping
  today's unconditional renumbering was rejected because it turns the identifier back into a
  position, which TASK-075 rejected explicitly.
- The human first chose prose-only retirement with no machine-readable declaration, on the stated
  basis that allocating above the maximum made reuse impossible. That basis was wrong: when the
  retired identifier is the highest in the file, `maximum active + 1` hands it out again. Shown
  that hole, the human reversed to the footer declaration. Recorded so nobody reopens prose-only
  on the original, false reasoning.
- Confirmed directly with the human: one run processes every capsule, applies the safe additions,
  names each capsule that needs manual repair, and exits non-zero. Stopping at the first duplicate
  was rejected because several defective capsules would then need one pass each. Warning and
  exiting zero was rejected because `verify` already rejects a duplicate at review time, so the
  defect would surface later and cost more.
- Recording the footer for TASK-076, TASK-078 and TASK-081 places four capsules in one reviewed
  boundary. The implementer either captures the snapshot with `--include-task` for those three, or
  lands the metadata in a separate commit before capture. Judge scope fails closed otherwise.

## Open Questions

- None.
